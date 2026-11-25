"""Repair diagnosed WordprocessingML properties while preserving document content."""

import os
import re
from pathlib import Path
from tempfile import NamedTemporaryFile

from docx import Document
from docx.document import Document as WordDocument
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.text.paragraph import Paragraph
from lxml.etree import _Element

from .renderer import add_page_number, add_red_line, format_paragraph, header_style
from .schemas import FormatProfile, Violation

SECTION = re.compile(r"section\[(\d+)\]")
LOCATION = re.compile(r"paragraph\[(\d+)\](?:\.run\[(\d+)\])?")
PAGE_FIELD = re.compile(r"^\s*PAGE(?:\s|$)", re.IGNORECASE)

PARAGRAPH_FIELDS = {
    "alignment": ("jc", "val"),
    "line_spacing_rule": ("spacing", "lineRule"),
    "line_spacing_value": ("spacing", "line"),
    "first_line_indent_chars": ("ind", "firstLineChars"),
    "first_line_indent_twips": ("ind", "firstLine"),
    "space_before_pt": ("spacing", "before"),
    "space_after_pt": ("spacing", "after"),
}
RUN_FIELDS = {
    **{
        f"font_{attribute}": ("rFonts", attribute)
        for attribute in ("ascii", "hAnsi", "eastAsia", "cs")
    },
    "font_size_pt": ("sz", "val"),
    "font_size_cs_pt": ("szCs", "val"),
    "bold": ("b", "val"),
    "italic": ("i", "val"),
    "color_hex": ("color", "val"),
}


def set_property(parent: _Element, tag: str, attribute: str, value: object) -> None:
    """Update one property, inserting missing nodes in Word's schema order."""
    qualified_tag = qn(f"w:{tag}")
    node = parent.find(qualified_tag)
    if node is None:
        accessor = getattr(parent, f"get_or_add_{tag}", None)
        if accessor is None:
            # python-docx exposes no accessor for the complex-script size.
            node = OxmlElement(f"w:{tag}")
            parent.insert_element_before(node, "w:highlight", "w:u", "w:vertAlign", "w:lang")
        else:
            node = accessor()
    node.set(qn(f"w:{attribute}"), str(value))


def remove_page_fields(footer: _Element) -> None:
    """Remove simple and complex PAGE fields, preserving unrelated footer runs."""
    for field in list(footer.iter(qn("w:fldSimple"))):
        if PAGE_FIELD.search(field.get(qn("w:instr"), "")):
            field.getparent().remove(field)
    for paragraph in footer.iter(qn("w:p")):
        fields = []
        active = []
        for run in paragraph.findall(qn("w:r")):
            marks = [node.get(qn("w:fldCharType")) for node in run.iter(qn("w:fldChar"))]
            if "begin" in marks:
                active.append([])
            for field_runs in active:
                field_runs.append(run)
            if "end" in marks and active:
                fields.append(active.pop())
        for field_runs in fields:
            instruction = "".join(
                node.text or "" for run in field_runs for node in run.iter(qn("w:instrText"))
            )
            if PAGE_FIELD.search(instruction):
                for run in field_runs:
                    if run.getparent() is not None:
                        run.getparent().remove(run)
        if not list(paragraph.iter(qn("w:instrText"))):
            style = paragraph.find(f"./{qn('w:pPr')}/{qn('w:pStyle')}")
            if style is not None and style.get(qn("w:val")) == "gw_page_number":
                paragraph.getparent().remove(paragraph)


def repair_page_numbers(document: WordDocument, enabled: bool) -> None:
    if enabled:
        if "gw_page_number" not in document.styles:
            document.styles.add_style("gw_page_number", 1)
        for section in document.sections:
            add_page_number(section.footer)
            if section.different_first_page_header_footer:
                add_page_number(section.first_page_footer)
            if document.settings.odd_and_even_pages_header_footer:
                add_page_number(section.even_page_footer)
    else:
        for part in document.part.related_parts.values():
            if part.partname.startswith("/word/footer"):
                remove_page_fields(part.element)


def repair_letterhead(document: WordDocument, profile: FormatProfile, violation: Violation) -> bool:
    body = document._element.body
    title = next(
        (paragraph for paragraph in document.paragraphs if paragraph.style.style_id == "gw_title"),
        None,
    )
    if title is None:
        return False
    if violation.field == "red_header.enabled":
        if not profile.red_header.enabled:
            for paragraph in document.paragraphs:
                if paragraph.style.style_id == "gw_red_header":
                    body.remove(paragraph._p)
            return True
        organization = profile.red_header.org_name
        if not organization:
            organization = next(
                (
                    paragraph.text
                    for paragraph in document.paragraphs
                    if paragraph.style.style_id == "gw_signature"
                ),
                None,
            )
        if not organization or not organization.strip():
            return False
        if "gw_red_header" not in document.styles:
            document.styles.add_style("gw_red_header", 1)
        first = document.paragraphs[0]
        paragraph = first.insert_paragraph_before(organization)
        format_paragraph(paragraph, header_style(profile), "red_header")
    elif violation.field == "red_header.has_red_line":
        if profile.red_header.enabled and profile.red_header.has_red_line:
            add_red_line(title.insert_paragraph_before(), profile.red_header.color_hex)
        else:
            for border in body.xpath(".//w:pBdr/w:bottom"):
                if border.get(qn("w:color")) == profile.red_header.color_hex:
                    border.getparent().remove(border)
    else:
        return False
    return True


def repair_docx(
    docx_path: Path | str,
    profile: FormatProfile,
    violations: list[Violation],
    output_path: Path | str | None = None,
) -> Path:
    """Apply the audit's field changes to the source package and publish atomically."""
    document = Document(docx_path)
    body = document._element.body
    paragraphs = list(body.iter(qn("w:p")))
    sections = list(body.iter(qn("w:sectPr")))
    changed = False

    # Keep initial indices stable until all edits to existing paragraphs are finished.
    for violation in violations:
        section = SECTION.fullmatch(violation.location)
        position = LOCATION.fullmatch(violation.location)
        if section:
            section_properties = sections[int(section[1])]
            field = violation.field.removeprefix("page.")
            if field in ("width", "height"):
                set_property(section_properties, "pgSz", field[0], violation.expected)
                section_properties.find(qn("w:pgSz")).attrib.pop(qn("w:orient"), None)
            elif field in {
                "margin_top_mm",
                "margin_bottom_mm",
                "margin_left_mm",
                "margin_right_mm",
            }:
                side = field.removeprefix("margin_").removesuffix("_mm")
                set_property(section_properties, "pgMar", side, violation.expected)
            else:
                continue
        elif position and position[2] is None and violation.field in PARAGRAPH_FIELDS:
            paragraph = paragraphs[int(position[1])]
            tag, attribute = PARAGRAPH_FIELDS[violation.field]
            set_property(paragraph.get_or_add_pPr(), tag, attribute, violation.expected)
        elif position and position[2] is not None and violation.field in RUN_FIELDS:
            paragraph = paragraphs[int(position[1])]
            run = paragraph.findall(qn("w:r"))[int(position[2])]
            tag, attribute = RUN_FIELDS[violation.field]
            set_property(run.get_or_add_rPr(), tag, attribute, violation.expected)
        elif violation.location == "footer" and violation.field == "page.show_page_number":
            repair_page_numbers(document, profile.page.show_page_number)
        else:
            continue
        changed = True

    for violation in violations:
        if violation.location == "document":
            changed = repair_letterhead(document, profile, violation) or changed

    source = Path(docx_path)
    destination = Path(output_path) if output_path else source
    if not changed and destination == source:
        return source
    destination.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(dir=destination.parent, suffix=".docx", delete=False) as temporary:
        temporary_path = Path(temporary.name)
    try:
        document.save(temporary_path)
        os.replace(temporary_path, destination)
    finally:
        temporary_path.unlink(missing_ok=True)
    return destination

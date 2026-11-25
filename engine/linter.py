"""Independent disk audit. Does not import renderer or extractor."""

import posixpath
import re
from copy import deepcopy
from pathlib import Path
from zipfile import ZipFile

from lxml import etree
from .schemas import FormatProfile, LintReport, StyleSpec, Violation

NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
WORD = "{" + NS["w"] + "}"


RELATIONSHIP = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PAGE_FIELD = re.compile(r"^\s*PAGE(?:\s|$)", re.IGNORECASE)


def referenced_footers(archive: ZipFile, document: etree._Element) -> list[etree._Element]:
    """Read footer parts actually referenced by sections of this document."""
    references = set(
        document.xpath(".//w:footerReference/@r:id", namespaces={**NS, "r": RELATIONSHIP})
    )
    relationships_path = "word/_rels/document.xml.rels"
    if not references or relationships_path not in archive.namelist():
        return []
    relationships = etree.fromstring(archive.read(relationships_path))
    footers = []
    for relationship in relationships:
        if relationship.get("Id") not in references or relationship.get("TargetMode") == "External":
            continue
        target = relationship.get("Target", "")
        filename = posixpath.normpath(posixpath.join("word", target)).lstrip("/")
        if filename in archive.namelist():
            footers.append(etree.fromstring(archive.read(filename)))
    return footers


def contains_page_field(footer: etree._Element) -> bool:
    """Recognize PAGE instructions and reject related instructions such as NUMPAGES."""
    if any(
        PAGE_FIELD.match(value) for value in footer.xpath(".//w:fldSimple/@w:instr", namespaces=NS)
    ):
        return True
    instructions: list[list[str]] = []
    for node in footer.iter(WORD + "fldChar", WORD + "instrText"):
        if node.tag == WORD + "instrText" and instructions:
            instructions[-1].append(node.text or "")
        elif node.get(WORD + "fldCharType") == "begin":
            instructions.append([])
        elif node.get(WORD + "fldCharType") == "end" and instructions:
            if PAGE_FIELD.match("".join(instructions.pop())):
                return True
    return False


def lint(path: Path | str, profile: FormatProfile) -> LintReport:
    """Read formatting from the DOCX on disk and return field-level differences."""
    with ZipFile(path) as archive:
        root = etree.fromstring(archive.read("word/document.xml"))
        styles = etree.fromstring(archive.read("word/styles.xml"))
        footers = referenced_footers(archive, root)
    violations = []
    checked = 0

    def check(
        location: str, field: str, expected: object, actual: object, tolerance: int = 0
    ) -> None:
        nonlocal checked
        checked += 1
        equal = (
            abs(expected - actual) <= tolerance
            if isinstance(expected, (int, float))
            and not isinstance(expected, bool)
            and isinstance(actual, (int, float))
            else expected == actual
        )
        if not equal:
            violations.append(
                Violation(location=location, field=field, expected=expected, actual=actual)
            )

    def val(node: etree._Element | None, path: str, key: str = "val") -> str | None:
        element = node.find(path, NS) if node is not None else None
        if path in ("w:b", "w:i"):
            return (
                "1"
                if element is not None
                and element.get(WORD + "val", "1") not in ("0", "false", "off")
                else "0"
            )
        return element.get(WORD + key) if element is not None else None

    def number(value: str | None, divisor: int = 1) -> float | str | None:
        try:
            return float(value) / divisor if value is not None else None
        except ValueError:
            return value

    for index, section in enumerate(root.findall(".//w:sectPr", NS)):
        for side in ("top", "bottom", "left", "right"):
            # Compare exact serialized integer twips, never relax document requirements.
            check(
                f"section[{index}]",
                "page.margin_" + side + "_mm",
                round(getattr(profile.page, "margin_" + side + "_mm") * 1440 / 25.4),
                number(val(section, "w:pgMar", side)),
            )
        check(f"section[{index}]", "page.width", 11906, number(val(section, "w:pgSz", "w")))
        check(f"section[{index}]", "page.height", 16838, number(val(section, "w:pgSz", "h")))
    has_page = any(contains_page_field(footer) for footer in footers)
    check("footer", "page.show_page_number", profile.page.show_page_number, has_page)
    style_definitions = {
        style.get(WORD + "styleId"): style for style in styles.findall("w:style", NS)
    }
    style_ids = set(style_definitions)
    default_style_id = next(
        (
            style_id
            for style_id, style in style_definitions.items()
            if style.get(WORD + "type") == "paragraph" and style.get(WORD + "default") == "1"
        ),
        None,
    )

    def overlay(*nodes: etree._Element | None) -> etree._Element:
        out = etree.Element(WORD + "properties")
        for node in nodes:
            if node is None:
                continue
            for child in node:
                old = out.find(child.tag)
                if old is None:
                    out.append(deepcopy(child))
                else:
                    old.attrib.update(child.attrib)
                    if len(child):
                        for element in list(old):
                            old.remove(element)
                        for element in child:
                            old.append(deepcopy(element))
        return out

    def style_props(style_id, kind, seen=None):
        seen = set() if seen is None else set(seen)
        if style_id not in style_definitions or style_id in seen:
            return None
        seen.add(style_id)
        node = style_definitions[style_id]
        return overlay(style_props(val(node, "w:basedOn"), kind, seen), node.find("w:" + kind, NS))

    def effective(paragraph: etree._Element, run: etree._Element | None = None) -> etree._Element:
        paragraph_properties = paragraph.find("w:pPr", NS)
        style_id = val(paragraph_properties, "w:pStyle") or default_style_id
        kind = "rPr" if run is not None else "pPr"
        default = styles.find("w:docDefaults/w:" + kind + "Default/w:" + kind, NS)
        if run is None:
            return overlay(default, style_props(style_id, kind), paragraph_properties)
        run_properties = run.find("w:rPr", NS)
        return overlay(
            default,
            style_props(style_id, kind),
            style_props(val(run_properties, "w:rStyle"), kind),
            run_properties,
        )

    paragraphs = [
        paragraph
        for paragraph in root.findall(".//w:body//w:p", NS)
        if paragraph.xpath(".//w:t[text()]", namespaces=NS)
    ]

    def size(paragraph: etree._Element) -> float:
        runs = paragraph.findall("w:r", NS)
        sizes = [number(val(effective(paragraph, run), "w:sz")) for run in runs]
        return max((value for value in sizes if isinstance(value, float)), default=0.0)

    eligible = [
        paragraph
        for paragraph in paragraphs
        if not any(
            (val(effective(paragraph, run), "w:color") or "").upper() == "FF0000"
            for run in paragraph.findall("w:r", NS)
        )
    ]
    title_paragraph = max(eligible, key=size) if eligible else None
    title_count = 0
    for index, paragraph in enumerate(root.findall(".//w:body//w:p", NS)):
        if not paragraph.xpath(".//w:t[text()]", namespaces=NS):
            continue
        direct_properties = paragraph.find("w:pPr", NS)
        style_id = val(direct_properties, "w:pStyle")
        role = (style_id or "").removeprefix("gw_")
        location = f"paragraph[{index}]"
        paragraph_properties = effective(paragraph)
        check(
            location,
            "style.exists",
            True,
            style_id is None or style_id in style_ids or role in ("red_header", "doc_number"),
        )
        if role not in profile.styles and role not in ("red_header", "doc_number"):
            text = "".join(paragraph.xpath(".//w:t/text()", namespaces=NS))
            red = any(
                (val(effective(paragraph, run), "w:color") or "").upper() == "FF0000"
                for run in paragraph.findall("w:r", NS)
            )
            if red and size(paragraph) >= 44:
                role = "red_header"
            elif paragraph is title_paragraph:
                role = "title"
            elif re.match(r"^[一二三四五六七八九十]+、", text):
                role = "heading_1"
            elif re.match(r"^[（(][一二三四五六七八九十]+[）)]", text):
                role = "heading_2"
            elif re.match(r"^\d+[.．、]", text):
                role = "heading_3"
            elif re.match(r"^\d{4}年\d+月\d+日", text):
                role = "date"
            elif text.endswith(("：", ":")):
                role = "recipient"
            elif val(paragraph_properties, "w:jc") == "right":
                role = "signature"
            else:
                role = "body"
        if role in profile.styles:
            style = profile.styles[role]
        elif role == "red_header":
            header = profile.red_header
            style = StyleSpec(
                font_cn=header.font_cn,
                font_size_pt=header.font_size_pt,
                color_hex=header.color_hex,
                alignment="center",
                first_line_indent_chars=0,
            )
        elif role == "doc_number":
            header = profile.red_header
            style = StyleSpec(
                font_cn=header.doc_number_font_cn,
                font_size_pt=header.doc_number_size_pt,
                alignment="center",
                first_line_indent_chars=0,
            )
        else:
            check(location, "style.role", "recognized", role)
            continue
        title_count += role == "title"
        check(
            location,
            "alignment",
            "both" if style.alignment == "justify" else style.alignment,
            val(paragraph_properties, "w:jc"),
        )
        check(
            location,
            "line_spacing_rule",
            "exact" if style.line_spacing_rule == "exact" else "auto",
            val(paragraph_properties, "w:spacing", "lineRule"),
        )
        check(
            location,
            "line_spacing_value",
            round(style.line_spacing_value * (20 if style.line_spacing_rule == "exact" else 240)),
            number(val(paragraph_properties, "w:spacing", "line")),
        )
        check(
            location,
            "first_line_indent_chars",
            round(style.first_line_indent_chars * 100),
            number(val(paragraph_properties, "w:ind", "firstLineChars")),
        )
        check(
            location,
            "first_line_indent_twips",
            round(style.first_line_indent_chars * style.font_size_pt * 20),
            number(val(paragraph_properties, "w:ind", "firstLine")),
            tolerance=1,
        )
        for field, attribute in [("space_before_pt", "before"), ("space_after_pt", "after")]:
            check(
                location,
                field,
                round(getattr(style, field) * 20),
                number(val(paragraph_properties, "w:spacing", attribute)),
            )
        for run_index, run in enumerate(paragraph.findall("w:r", NS)):
            if not run.xpath(".//w:t[text()]", namespaces=NS):
                continue
            run_properties = effective(paragraph, run)
            run_location = location + f".run[{run_index}]"
            for attribute, expected in [
                ("eastAsia", style.font_cn),
                ("ascii", style.font_en),
                ("hAnsi", style.font_en),
                ("cs", style.font_en),
            ]:
                check(
                    run_location,
                    "font_" + attribute,
                    expected,
                    val(run_properties, "w:rFonts", attribute),
                )
            check(
                run_location,
                "font_size_pt",
                round(style.font_size_pt * 2),
                number(val(run_properties, "w:sz")),
            )
            check(
                run_location,
                "font_size_cs_pt",
                round(style.font_size_pt * 2),
                number(val(run_properties, "w:szCs")),
            )
            for field, tag in [("bold", "b"), ("italic", "i")]:
                check(
                    run_location,
                    field,
                    "1" if getattr(style, field) else "0",
                    val(run_properties, "w:" + tag),
                )
            check(
                run_location,
                "color_hex",
                style.color_hex.upper(),
                (val(run_properties, "w:color") or "").upper(),
            )
    check("document", "title.count", 1, title_count)
    has_red = bool(root.xpath('.//w:pStyle[@w:val="gw_red_header"]', namespaces=NS)) or any(
        any(
            (val(effective(paragraph, run), "w:color") or "").upper()
            == profile.red_header.color_hex.upper()
            for run in paragraph.findall("w:r", NS)
        )
        and size(paragraph) >= 44
        for paragraph in paragraphs
    )
    check("document", "red_header.enabled", profile.red_header.enabled, has_red)
    line = bool(
        root.xpath(
            './/w:pBdr/w:bottom[@w:color=$color and not(@w:val="nil" or @w:val="none")]',
            namespaces=NS,
            color=profile.red_header.color_hex,
        )
    )
    check(
        "document",
        "red_header.has_red_line",
        profile.red_header.enabled and profile.red_header.has_red_line,
        line,
    )
    return LintReport(
        passed=not violations,
        score=round(100 * (checked - len(violations)) / checked, 2),
        checked=checked,
        violations=violations,
    )

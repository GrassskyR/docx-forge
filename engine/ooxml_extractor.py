"""Read effective formatting from the main OOXML text flow."""

import re
import tempfile
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

from lxml import etree

from .defaults import national_profile
from .doc_converter import to_docx
from .schemas import FormatProfile

NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "v": "urn:schemas-microsoft-com:vml",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "mc": "http://schemas.openxmlformats.org/markup-compatibility/2006",
}
WORD = "{" + NS["w"] + "}"
FLOATING = (
    "ancestor::w:drawing or ancestor::w:pict or ancestor::w:txbxContent "
    "or ancestor::mc:AlternateContent"
)
RUNS = "./w:r | ./w:hyperlink/w:r | ./w:smartTag/w:r | ./w:sdt/w:sdtContent/w:r"
NUMBER = re.compile(
    r"^\s*(?:[^。！？：:]{0,30}[〔\[［](?:\d|[×Xx〇○０-９]){4}[〕\]］]"
    r"\s*[\d×Xx〇○零一二三四五六七八九十]+\s*号"
    r"|[（(]?(?:(?:\d|[×Xx〇○]){2,4}年)?\s*第\s*[\d×Xx〇○零一二三四五六七八九十]+\s*期[）)]?)\s*$"
)
PAGE_FIELD = re.compile(r"^\s*PAGE(?:\s|$)", re.IGNORECASE)
TEXT_PART = re.compile(r"word/(?:(?:header|footer)\d+|comments|footnotes|endnotes)\.xml")

Scalar = str | float | bool
Formatting = dict[str, Scalar]


@dataclass
class ParagraphFormat:
    text: str
    style_id: str
    values: Formatting
    in_table: bool


def attributes(node: etree._Element | None, tag: str) -> dict[str, str]:
    element = node.find(f"w:{tag}", NS) if node is not None else None
    if element is None:
        return {}
    return {etree.QName(key).localname: value for key, value in element.attrib.items()}


def properties(node: etree._Element | None) -> Formatting:
    if node is None:
        return {}
    result: Formatting = {}
    fonts = attributes(node, "rFonts")
    for attribute, field in (("eastAsia", "font_cn"), ("ascii", "font_en")):
        font = fonts.get(attribute, "").split(";", 1)[0].strip()
        if font:
            result[field] = font
    for tag, field in (("sz", "font_size_pt"), ("color", "color_hex"), ("jc", "alignment")):
        value = attributes(node, tag).get("val")
        if value is None or value == "auto":
            continue
        if tag == "sz":
            result[field] = float(value) / 2
        elif tag == "jc" and value in {"both", "left", "right", "center", "justify"}:
            result[field] = "justify" if value == "both" else value
        elif tag == "color" and re.fullmatch(r"[0-9A-Fa-f]{6}", value):
            result[field] = value.upper()
    for tag, field in (("b", "bold"), ("i", "italic")):
        toggle = node.find(f"w:{tag}", NS)
        if toggle is not None:
            result[field] = toggle.get(WORD + "val", "1") not in ("0", "false", "off")

    spacing = attributes(node, "spacing")
    if "line" in spacing:
        # The contract represents both minimum and fixed physical heights in points.
        physical = spacing.get("lineRule") in ("exact", "atLeast")
        result["line_spacing_rule"] = "exact" if physical else "multiple"
        result["line_spacing_value"] = float(spacing["line"]) / (20 if physical else 240)
    for attribute, field in (("before", "space_before_pt"), ("after", "space_after_pt")):
        if attribute in spacing:
            result[field] = float(spacing[attribute]) / 20

    indent = attributes(node, "ind")
    for attribute, divisor, sign, field in (
        ("firstLineChars", 100, 1, "first_line_indent_chars"),
        ("hangingChars", 100, -1, "first_line_indent_chars"),
        ("firstLine", 20, 1, "_first_line_pt"),
        ("hanging", 20, -1, "_first_line_pt"),
    ):
        if attribute in indent:
            result[field] = sign * float(indent[attribute]) / divisor
            break
    return result


def overlay(*layers: Formatting) -> Formatting:
    result: Formatting = {}
    for layer in layers:
        if "first_line_indent_chars" in layer:
            result.pop("_first_line_pt", None)
        if "_first_line_pt" in layer:
            result.pop("first_line_indent_chars", None)
        result.update(layer)
    return result


def paragraph_formats(document: etree._Element, styles: etree._Element) -> list[ParagraphFormat]:
    """Apply defaults, basedOn chains, paragraph properties and weighted text runs."""
    defaults: Formatting = {"first_line_indent_chars": 0.0}
    for path in ("w:docDefaults/w:pPrDefault/w:pPr", "w:docDefaults/w:rPrDefault/w:rPr"):
        defaults = overlay(defaults, properties(styles.find(path, NS)))

    definitions = {node.get(WORD + "styleId"): node for node in styles.findall("w:style", NS)}
    default_styles = {
        node.get(WORD + "type"): style_id
        for style_id, node in definitions.items()
        if node.get(WORD + "default") in ("1", "true", "on")
    }

    def cascade(style_id: str | None, seen: frozenset[str] = frozenset()) -> Formatting:
        if style_id not in definitions or style_id in seen:
            return {}
        definition = definitions[style_id]
        return overlay(
            cascade(attributes(definition, "basedOn").get("val"), seen | {style_id}),
            properties(definition.find("w:pPr", NS)),
            properties(definition.find("w:rPr", NS)),
        )

    records = []
    for paragraph in document.xpath(f"./w:body//w:p[not({FLOATING})]", namespaces=NS):
        runs = [
            (run, "".join(run.xpath("./w:t/text()", namespaces=NS)))
            for run in paragraph.xpath(RUNS, namespaces=NS)
        ]
        text = "".join(run_text for _, run_text in runs).strip()
        if not text:
            continue
        paragraph_props = paragraph.find("w:pPr", NS)
        style_id = attributes(paragraph_props, "pStyle").get("val", default_styles.get("paragraph"))
        paragraph_values = overlay(defaults, cascade(style_id), properties(paragraph_props))
        distribution: dict[str, Counter] = {}
        for run, run_text in runs:
            if not run_text.strip():
                continue
            run_props = run.find("w:rPr", NS)
            run_style = attributes(run_props, "rStyle").get("val", default_styles.get("character"))
            values = overlay(paragraph_values, cascade(run_style), properties(run_props))
            if "_first_line_pt" in values:
                physical_indent = float(values.pop("_first_line_pt"))
                values["first_line_indent_chars"] = round(
                    physical_indent / float(values.get("font_size_pt", 16)), 4
                )
            for field, value in values.items():
                distribution.setdefault(field, Counter())[value] += len(run_text)
        record = ParagraphFormat(
            text,
            style_id or "",
            {field: counts.most_common(1)[0][0] for field, counts in distribution.items()},
            bool(paragraph.xpath("ancestor::w:tbl", namespaces=NS)),
        )
        records.append(record)
    return records


def is_red(color: str | None) -> bool:
    value = (color or "").strip().lower().removeprefix("#")
    if value == "red":
        return True
    if not re.fullmatch(r"[a-f0-9]{6}", value):
        return False
    red, green, blue = (int(value[index : index + 2], 16) for index in (0, 2, 4))
    return red >= 128 and green <= red / 3 and blue <= red / 3


def has_red_line(parts: list[etree._Element]) -> bool:
    for part in parts:
        # Some letterheads use an underlined red run of preserved spaces as the rule.
        underlined = part.xpath(".//w:r[w:rPr/w:u[not(@w:val='none')]]", namespaces=NS)
        if any(
            is_red(attributes(run.find("w:rPr", NS), "color").get("val"))
            and re.fullmatch(r"\s{8,}", "".join(run.xpath("./w:t/text()", namespaces=NS)))
            for run in underlined
        ):
            return True
        borders = part.xpath(".//w:pBdr/w:bottom | .//w:tblBorders/*", namespaces=NS)
        if any(
            is_red(border.get(WORD + "color")) and border.get(WORD + "val") not in ("none", "nil")
            for border in borders
        ):
            return True
        shapes = part.xpath(".//v:line | .//v:shape", namespaces=NS)
        if any(
            shape.get("stroked") not in ("f", "false", "0") and is_red(shape.get("strokecolor"))
            for shape in shapes
        ):
            return True
        if any(is_red(color) for color in part.xpath(".//a:ln//a:srgbClr/@val", namespaces=NS)):
            return True
    return False


def has_page_field(part: etree._Element) -> bool:
    simple = part.xpath(".//w:fldSimple/@w:instr", namespaces=NS)
    complex_instructions = []
    for paragraph in part.iter(WORD + "p"):
        complex_instructions.extend(paragraph.xpath("./w:r/w:instrText/text()", namespaces=NS))
    return any(PAGE_FIELD.match(instruction) for instruction in (*simple, *complex_instructions))


def role_for(record: ParagraphFormat, title: ParagraphFormat | None, roles: dict) -> str:
    explicit = record.style_id.removeprefix("gw_")
    if explicit in roles:
        return explicit
    if record is title:
        return "title"
    for pattern, role in (
        (r"^[一二三四五六七八九十]+、", "heading_1"),
        (r"^[（(][一二三四五六七八九十]+[）)]", "heading_2"),
        (r"^\d+[.．、]", "heading_3"),
        (r"^\d{4}年\d+月\d+日", "date"),
        (r"^[^。！？]{1,60}[：:]", "recipient"),
    ):
        if re.match(pattern, record.text):
            return role
    return "signature" if record.values.get("alignment") == "right" else "body"


def infer_styles(profile: dict, records: list[ParagraphFormat]) -> None:
    header_lines = []
    number_lines = []
    other = []
    passed_letterhead = False
    for record in records:
        if record.style_id == "gw_doc_number" or NUMBER.fullmatch(record.text):
            number_lines.append(record)
            passed_letterhead = True
            continue
        if record.style_id == "gw_red_header" or (
            not passed_letterhead
            and is_red(str(record.values.get("color_hex", "")))
            and float(record.values.get("font_size_pt", 0)) >= 22
        ):
            header_lines.append(record)
        else:
            other.append(record)
            passed_letterhead = True

    header = profile["red_header"]
    if header_lines:
        primary = max(header_lines, key=lambda record: len(record.text)).values
        header.update(
            enabled=True,
            org_name="\n".join(record.text for record in header_lines),
            font_cn=primary.get("font_cn", header["font_cn"]),
            font_size_pt=primary.get("font_size_pt", header["font_size_pt"]),
            color_hex=primary.get("color_hex", header["color_hex"]),
        )
    if number_lines:
        values = number_lines[0].values
        header["doc_number_font_cn"] = values.get("font_cn", header["doc_number_font_cn"])
        header["doc_number_size_pt"] = values.get("font_size_pt", header["doc_number_size_pt"])

    styles = profile["styles"]
    eligible = [record for record in other if not record.in_table] or other
    title = max(
        eligible, key=lambda record: float(record.values.get("font_size_pt", 0)), default=None
    )
    candidates: dict[str, list[ParagraphFormat]] = {}
    for record in other:
        role = role_for(record, title, styles)
        candidates.setdefault(role, []).append(record)
    for role, items in candidates.items():
        for field in styles[role]:
            distribution = Counter()
            for record in items:
                if field in record.values:
                    distribution[record.values[field]] += len(record.text)
            if distribution:
                styles[role][field] = distribution.most_common(1)[0][0]


def strip_template(entries: dict[str, bytes], document: etree._Element) -> None:
    """Remove text-bearing stories while preserving styles and stationery geometry."""
    body = document.find("w:body", NS)
    for child in list(body):
        if child.tag != WORD + "sectPr":
            body.remove(child)
    entries["word/document.xml"] = etree.tostring(
        document, xml_declaration=True, encoding="UTF-8", standalone=True
    )
    for name, data in list(entries.items()):
        if not TEXT_PART.fullmatch(name):
            continue
        story = etree.fromstring(data)
        for child in list(story):
            story.remove(child)
        entries[name] = etree.tostring(story)


def extract(
    source: Path | str, name: str, template_dir: Path | str = "data/templates"
) -> FormatProfile:
    """Infer a format profile and save a content-free copy of its stationery."""
    with tempfile.TemporaryDirectory() as temporary:
        converted = to_docx(source, temporary)
        with ZipFile(converted) as package:
            entries = {name: package.read(name) for name in package.namelist()}

    document = etree.fromstring(entries["word/document.xml"])
    styles = (
        etree.fromstring(entries["word/styles.xml"])
        if "word/styles.xml" in entries
        else etree.Element(WORD + "styles")
    )
    profile = national_profile().model_dump(exclude={"id"})
    profile.update(name=name, source_type="extracted_doc")
    margins = document.find(".//w:sectPr/w:pgMar", NS)
    if margins is not None:
        for side in ("top", "bottom", "left", "right"):
            value = margins.get(WORD + side)
            if value is not None:
                profile["page"][f"margin_{side}_mm"] = round(float(value) * 25.4 / 1440, 4)

    parts = [document]
    page_number = False
    for filename, xml in entries.items():
        if re.fullmatch(r"word/(header|footer)\d+\.xml", filename):
            story = etree.fromstring(xml)
            parts.append(story)
            if filename.startswith("word/footer") and has_page_field(story):
                page_number = True
    profile["page"]["show_page_number"] = page_number
    profile["red_header"]["has_red_line"] = has_red_line(parts)
    infer_styles(profile, paragraph_formats(document, styles))

    result = FormatProfile.model_validate(profile)
    strip_template(entries, document)
    folder = Path(template_dir)
    folder.mkdir(parents=True, exist_ok=True)
    destination = folder / f"{result.id}.docx"
    with ZipFile(destination, "w", ZIP_DEFLATED) as package:
        for filename, payload in entries.items():
            package.writestr(filename, payload)
    result.base_template_path = str(destination.resolve())
    return result

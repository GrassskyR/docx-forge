"""Compile a content AST and format profile into a Word document."""

from pathlib import Path

from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.text.paragraph import Paragraph
from lxml.etree import _Element

from .schemas import DocContentAST, FormatProfile, StyleSpec


class ContentError(ValueError):
    """Describe a structural issue that requires an AST edit."""

    def __init__(self, field: str, guidance: str):
        super().__init__(guidance)
        self.field = field


def append_element(parent: _Element, tag: str, **attributes: str | int) -> _Element:
    node = OxmlElement(f"w:{tag}")
    for name, value in attributes.items():
        node.set(qn(f"w:{name}"), str(value))
    parent.append(node)
    return node


def header_style(profile: FormatProfile) -> StyleSpec:
    header = profile.red_header
    return StyleSpec(
        font_cn=header.font_cn,
        font_size_pt=header.font_size_pt,
        color_hex=header.color_hex,
        alignment="center",
        first_line_indent_chars=0,
    )


def number_style(profile: FormatProfile) -> StyleSpec:
    header = profile.red_header
    return StyleSpec(
        font_cn=header.doc_number_font_cn,
        font_size_pt=header.doc_number_size_pt,
        alignment="center",
        first_line_indent_chars=0,
    )


def format_paragraph(paragraph: Paragraph, style: StyleSpec, role: str) -> None:
    properties = paragraph._p.get_or_add_pPr()
    append_element(properties, "pStyle", val=f"gw_{role}")
    fixed_spacing = style.line_spacing_rule == "exact"
    append_element(
        properties,
        "spacing",
        line=round(style.line_spacing_value * (20 if fixed_spacing else 240)),
        lineRule="exact" if fixed_spacing else "auto",
        before=round(style.space_before_pt * 20),
        after=round(style.space_after_pt * 20),
    )
    # LibreOffice uses the physical value when character units are also present.
    append_element(
        properties,
        "ind",
        firstLineChars=round(style.first_line_indent_chars * 100),
        firstLine=round(style.first_line_indent_chars * style.font_size_pt * 20),
    )
    append_element(
        properties, "jc", val="both" if style.alignment == "justify" else style.alignment
    )

    for run in paragraph._p.iter(qn("w:r")):
        run_properties = run.get_or_add_rPr()
        append_element(
            run_properties,
            "rFonts",
            ascii=style.font_en,
            hAnsi=style.font_en,
            eastAsia=style.font_cn,
            cs=style.font_en,
        )
        append_element(run_properties, "b", val=int(style.bold))
        append_element(run_properties, "i", val=int(style.italic))
        append_element(run_properties, "color", val=style.color_hex)
        append_element(run_properties, "sz", val=round(style.font_size_pt * 2))
        append_element(run_properties, "szCs", val=round(style.font_size_pt * 2))


def add_page_number(footer) -> None:
    paragraph = footer.add_paragraph()
    paragraph.add_run("— ")
    field = append_element(paragraph._p, "fldSimple", instr="PAGE")
    append_element(append_element(field, "r"), "t").text = "1"
    paragraph.add_run(" —")
    format_paragraph(
        paragraph,
        StyleSpec(font_cn="宋体", font_size_pt=14, alignment="center", first_line_indent_chars=0),
        "page_number",
    )


def add_red_line(paragraph: Paragraph, color: str) -> None:
    border = append_element(paragraph._p.get_or_add_pPr(), "pBdr")
    append_element(border, "bottom", val="single", sz=12, color=color)


def render(content: DocContentAST, profile: FormatProfile, path: Path | str) -> Path:
    """Rebuild the document body and set all used formats explicitly."""
    if not content.title.strip():
        raise ContentError("title.count", "请在 title 中提供一个非空的公文标题，再调用渲染工具。")

    header = profile.red_header
    organization = next(
        (
            name.strip()
            for name in (content.red_header_org, header.org_name, content.signature)
            if name and name.strip()
        ),
        None,
    )
    if header.enabled and not organization:
        raise ContentError(
            "red_header_org",
            "红头已启用，请在 DocContentAST.red_header_org 中填写发文机关名称后重编。",
        )

    document = Document(profile.base_template_path) if profile.base_template_path else Document()
    body = document._element.body
    for child in list(body):
        if child.tag != qn("w:sectPr"):
            body.remove(child)

    for role in (*profile.styles, "red_header", "doc_number", "page_number"):
        style_id = f"gw_{role}"
        if style_id not in document.styles:
            document.styles.add_style(style_id, 1)

    for section in document.sections:
        properties = section._sectPr
        page_size = properties.get_or_add_pgSz()
        page_size.attrib.clear()
        page_size.set(qn("w:w"), "11906")
        page_size.set(qn("w:h"), "16838")
        margins = properties.get_or_add_pgMar()
        margins.attrib.clear()
        for side in ("top", "bottom", "left", "right"):
            millimeters = getattr(profile.page, f"margin_{side}_mm")
            margins.set(qn(f"w:{side}"), str(round(millimeters * 1440 / 25.4)))
        for attribute, twips in (("header", 851), ("footer", 992), ("gutter", 0)):
            margins.set(qn(f"w:{attribute}"), str(twips))

        # Page numbering is rebuilt from the profile on imported stationery.
        section.different_first_page_header_footer = False
        footer = section.footer
        for child in list(footer._element):
            footer._element.remove(child)
        if profile.page.show_page_number:
            add_page_number(footer)
        else:
            footer.add_paragraph()

    def add(text: str, role: str, style: StyleSpec | None = None) -> Paragraph:
        paragraph = document.add_paragraph(text)
        format_paragraph(paragraph, style or profile.styles[role], role)
        return paragraph

    if header.enabled:
        add(organization, "red_header", header_style(profile))
    if content.doc_number:
        add(content.doc_number, "doc_number", number_style(profile))
    if header.enabled and header.has_red_line:
        add_red_line(document.add_paragraph(), header.color_hex)

    add(content.title, "title")
    if content.recipient:
        add(content.recipient, "recipient")
    for block in content.blocks:
        if block.type == "table":
            table = document.add_table(rows=len(block.rows), cols=len(block.rows[0]))
            table.style = "Table Grid"
            for row, values in zip(table.rows, block.rows):
                for cell, text in zip(row.cells, values):
                    cell.text = text
                    format_paragraph(cell.paragraphs[0], profile.styles["body"], "body")
        else:
            add(block.text, block.type)
    for attachment in content.attachments:
        add(f"附件：{attachment}", "body")
    if content.signature:
        add(content.signature, "signature")
    if content.date:
        add(content.date, "date")

    output = Path(path)
    output.parent.mkdir(parents=True, exist_ok=True)
    document.save(output)
    return output

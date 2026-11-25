# -*- coding: utf-8 -*-
from docx import Document
from docx.shared import Mm, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

OUTPUT = "output.docx"

ALIGN = {
    "center": WD_ALIGN_PARAGRAPH.CENTER,
    "justify": WD_ALIGN_PARAGRAPH.JUSTIFY,
    "left": WD_ALIGN_PARAGRAPH.LEFT,
    "right": WD_ALIGN_PARAGRAPH.RIGHT,
}

STYLES = {
    "title": {
        "font_cn": "黑体",
        "font_en": "Times New Roman",
        "font_size_pt": 22.0,
        "bold": False,
        "italic": False,
        "color_hex": "000000",
        "alignment": "center",
        "line_spacing_rule": "exact",
        "line_spacing_value": 30.0,
        "first_line_indent_chars": 0.0,
        "space_before_pt": 0.0,
        "space_after_pt": 0.0,
    },
    "heading_1": {
        "font_cn": "黑体",
        "font_en": "Times New Roman",
        "font_size_pt": 16.0,
        "bold": False,
        "italic": False,
        "color_hex": "000000",
        "alignment": "justify",
        "line_spacing_rule": "exact",
        "line_spacing_value": 28.0,
        "first_line_indent_chars": 2.0,
        "space_before_pt": 0.0,
        "space_after_pt": 0.0,
    },
    "body": {
        "font_cn": "黑体",
        "font_en": "Times New Roman",
        "font_size_pt": 12.0,
        "bold": False,
        "italic": False,
        "color_hex": "000000",
        "alignment": "justify",
        "line_spacing_rule": "exact",
        "line_spacing_value": 31.0,
        "first_line_indent_chars": 2.0,
        "space_before_pt": 0.0,
        "space_after_pt": 0.0,
    },
    "recipient": {
        "font_cn": "仿宋_GB2312",
        "font_en": "Times New Roman",
        "font_size_pt": 16.0,
        "bold": False,
        "italic": False,
        "color_hex": "000000",
        "alignment": "left",
        "line_spacing_rule": "exact",
        "line_spacing_value": 28.0,
        "first_line_indent_chars": 0.0,
        "space_before_pt": 0.0,
        "space_after_pt": 0.0,
    },
    "signature": {
        "font_cn": "仿宋_GB2312",
        "font_en": "Times New Roman",
        "font_size_pt": 16.0,
        "bold": False,
        "italic": False,
        "color_hex": "000000",
        "alignment": "right",
        "line_spacing_rule": "exact",
        "line_spacing_value": 28.0,
        "first_line_indent_chars": 0.0,
        "space_before_pt": 0.0,
        "space_after_pt": 0.0,
    },
    "date": {
        "font_cn": "仿宋_GB2312",
        "font_en": "Times New Roman",
        "font_size_pt": 16.0,
        "bold": False,
        "italic": False,
        "color_hex": "000000",
        "alignment": "right",
        "line_spacing_rule": "exact",
        "line_spacing_value": 28.0,
        "first_line_indent_chars": 0.0,
        "space_before_pt": 0.0,
        "space_after_pt": 0.0,
    },
}


def set_run_font(run, cn_font, en_font, size_pt, bold=False, italic=False, color_hex="000000"):
    run.font.name = en_font
    run.font.size = Pt(size_pt)
    run.font.bold = bold
    run.font.italic = italic
    run.font.color.rgb = RGBColor.from_string(color_hex)

    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.get_or_add_rFonts()
    rFonts.set(qn("w:ascii"), en_font)
    rFonts.set(qn("w:hAnsi"), en_font)
    rFonts.set(qn("w:cs"), en_font)
    rFonts.set(qn("w:eastAsia"), cn_font)

    for attr in ("w:asciiTheme", "w:hAnsiTheme", "w:eastAsiaTheme", "w:cstheme"):
        if rFonts.get(qn(attr)) is not None:
            del rFonts.attrib[qn(attr)]


def set_first_line_indent_chars(paragraph, chars):
    pPr = paragraph._p.get_or_add_pPr()
    ind = pPr.get_or_add_ind()
    ind.set(qn("w:firstLineChars"), str(int(round(chars * 100))))

    for attr in ("w:firstLine", "w:hanging"):
        if ind.get(qn(attr)) is not None:
            del ind.attrib[qn(attr)]

    if chars == 0:
        ind.set(qn("w:firstLine"), "0")


def apply_paragraph_style(paragraph, style):
    pf = paragraph.paragraph_format
    pf.space_before = Pt(style["space_before_pt"])
    pf.space_after = Pt(style["space_after_pt"])
    pf.line_spacing_rule = WD_LINE_SPACING.EXACTLY
    pf.line_spacing = Pt(style["line_spacing_value"])
    paragraph.alignment = ALIGN[style["alignment"]]
    set_first_line_indent_chars(paragraph, style["first_line_indent_chars"])


def add_text_paragraph(doc, text, style_name):
    style = STYLES[style_name]
    paragraph = doc.add_paragraph()
    apply_paragraph_style(paragraph, style)
    run = paragraph.add_run(text)
    set_run_font(
        run,
        style["font_cn"],
        style["font_en"],
        style["font_size_pt"],
        style["bold"],
        style["italic"],
        style["color_hex"],
    )
    return paragraph


def clear_paragraph_content(paragraph):
    for child in list(paragraph._p):
        if child.tag != qn("w:pPr"):
            paragraph._p.remove(child)


def add_page_number_field(paragraph, cn_font="宋体", en_font="Times New Roman", size_pt=14.0):
    clear_paragraph_content(paragraph)

    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    pf = paragraph.paragraph_format
    pf.space_before = Pt(0)
    pf.space_after = Pt(0)
    pf.line_spacing_rule = WD_LINE_SPACING.SINGLE
    set_first_line_indent_chars(paragraph, 0)

    run_begin = paragraph.add_run()
    fld_begin = OxmlElement("w:fldChar")
    fld_begin.set(qn("w:fldCharType"), "begin")
    run_begin._r.append(fld_begin)

    run_instr = paragraph.add_run()
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = " PAGE "
    run_instr._r.append(instr)

    run_separate = paragraph.add_run()
    fld_separate = OxmlElement("w:fldChar")
    fld_separate.set(qn("w:fldCharType"), "separate")
    run_separate._r.append(fld_separate)

    paragraph.add_run("1")

    run_end = paragraph.add_run()
    fld_end = OxmlElement("w:fldChar")
    fld_end.set(qn("w:fldCharType"), "end")
    run_end._r.append(fld_end)

    for run in paragraph.runs:
        set_run_font(run, cn_font, en_font, size_pt, False, False, "000000")


def main():
    doc = Document()

    section = doc.sections[0]
    section.page_width = Mm(210.0)
    section.page_height = Mm(297.0)
    section.top_margin = Mm(37.0)
    section.bottom_margin = Mm(35.0)
    section.left_margin = Mm(28.0)
    section.right_margin = Mm(26.0)
    section.header_distance = Mm(15.0)
    section.footer_distance = Mm(17.5)

    footer = section.footer
    footer.is_linked_to_previous = False
    footer_paragraph = footer.paragraphs[0] if footer.paragraphs else footer.add_paragraph()
    add_page_number_field(footer_paragraph)

    settings = doc.settings.element
    update_fields = OxmlElement("w:updateFields")
    update_fields.set(qn("w:val"), "true")
    settings.append(update_fields)

    add_text_paragraph(doc, "关于开展业务培训的通知", "title")
    add_text_paragraph(doc, "各部门：", "recipient")
    add_text_paragraph(doc, "一、培训安排", "heading_1")
    add_text_paragraph(doc, "请各部门做好组织协调，按时参加业务培训。", "body")
    add_text_paragraph(doc, "综合办公室", "signature")
    add_text_paragraph(doc, "2026年11月24日", "date")

    doc.save(OUTPUT)


if __name__ == "__main__":
    main()
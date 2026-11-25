# -*- coding: utf-8 -*-
from docx import Document
from docx.shared import Mm, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

ALIGN = {
    "left": WD_ALIGN_PARAGRAPH.LEFT,
    "center": WD_ALIGN_PARAGRAPH.CENTER,
    "right": WD_ALIGN_PARAGRAPH.RIGHT,
    "justify": WD_ALIGN_PARAGRAPH.JUSTIFY,
}

STYLES = {
    "title": {
        "font_cn": "方正小标宋简体",
        "font_en": "Times New Roman",
        "font_size_pt": 22.0,
        "bold": False,
        "italic": False,
        "color_hex": "000000",
        "alignment": "center",
        "line_spacing_value": 28.0,
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
        "line_spacing_value": 28.0,
        "first_line_indent_chars": 2.0,
        "space_before_pt": 0.0,
        "space_after_pt": 0.0,
    },
    "body": {
        "font_cn": "仿宋_GB2312",
        "font_en": "Times New Roman",
        "font_size_pt": 14.0,
        "bold": False,
        "italic": False,
        "color_hex": "000000",
        "alignment": "justify",
        "line_spacing_value": 28.0,
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
        "line_spacing_value": 28.0,
        "first_line_indent_chars": 0.0,
        "space_before_pt": 0.0,
        "space_after_pt": 0.0,
    },
    "page_number": {
        "font_cn": "宋体",
        "font_en": "Times New Roman",
        "font_size_pt": 14.0,
        "bold": False,
        "italic": False,
        "color_hex": "000000",
        "alignment": "center",
        "line_spacing_value": 28.0,
        "first_line_indent_chars": 0.0,
        "space_before_pt": 0.0,
        "space_after_pt": 0.0,
    },
}


def set_run_font(run, style):
    font_cn = style["font_cn"]
    font_en = style["font_en"]
    size_pt = style["font_size_pt"]

    run.font.name = font_en
    run.font.size = Pt(size_pt)
    run.font.bold = style.get("bold", False)
    run.font.italic = style.get("italic", False)
    run.font.color.rgb = RGBColor.from_string(style.get("color_hex", "000000"))

    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.find(qn("w:rFonts"))
    if rFonts is None:
        rFonts = OxmlElement("w:rFonts")
        rPr.insert(0, rFonts)

    rFonts.set(qn("w:ascii"), font_en)
    rFonts.set(qn("w:hAnsi"), font_en)
    rFonts.set(qn("w:eastAsia"), font_cn)
    rFonts.set(qn("w:cs"), font_en)
    rFonts.set(qn("w:hint"), "eastAsia")

    szCs = rPr.find(qn("w:szCs"))
    if szCs is None:
        szCs = OxmlElement("w:szCs")
        rPr.append(szCs)
    szCs.set(qn("w:val"), str(int(round(size_pt * 2))))


def set_paragraph_format(paragraph, style):
    pf = paragraph.paragraph_format
    pf.alignment = ALIGN[style["alignment"]]
    pf.space_before = Pt(style["space_before_pt"])
    pf.space_after = Pt(style["space_after_pt"])
    pf.line_spacing = Pt(style["line_spacing_value"])

    pPr = paragraph._p.get_or_add_pPr()

    spacing = pPr.find(qn("w:spacing"))
    if spacing is None:
        spacing = OxmlElement("w:spacing")
        pPr.append(spacing)

    line_twips = int(round(style["line_spacing_value"] * 20))
    before_twips = int(round(style["space_before_pt"] * 20))
    after_twips = int(round(style["space_after_pt"] * 20))

    spacing.set(qn("w:line"), str(line_twips))
    spacing.set(qn("w:lineRule"), "exact")
    spacing.set(qn("w:before"), str(before_twips))
    spacing.set(qn("w:after"), str(after_twips))

    ind = pPr.find(qn("w:ind"))
    if ind is None:
        ind = OxmlElement("w:ind")
        jc = pPr.find(qn("w:jc"))
        if jc is not None:
            jc.addprevious(ind)
        else:
            pPr.append(ind)

    indent_chars = style.get("first_line_indent_chars", 0.0)
    ind.set(qn("w:firstLineChars"), str(int(round(indent_chars * 100))))
    ind.set(qn("w:firstLine"), str(int(round(indent_chars * style["font_size_pt"] * 20))))
    ind.set(qn("w:left"), "0")
    ind.set(qn("w:right"), "0")


def add_paragraph(doc, text, style_key):
    paragraph = doc.add_paragraph()
    style = STYLES[style_key]
    set_paragraph_format(paragraph, style)

    run = paragraph.add_run(text)
    set_run_font(run, style)
    return paragraph


def add_page_number_field(paragraph, style):
    run_begin = paragraph.add_run()
    set_run_font(run_begin, style)
    fld_begin = OxmlElement("w:fldChar")
    fld_begin.set(qn("w:fldCharType"), "begin")
    fld_begin.set(qn("w:dirty"), "true")
    run_begin._r.append(fld_begin)

    run_instr = paragraph.add_run()
    set_run_font(run_instr, style)
    instr_text = OxmlElement("w:instrText")
    instr_text.set(qn("xml:space"), "preserve")
    instr_text.text = " PAGE "
    run_instr._r.append(instr_text)

    run_sep = paragraph.add_run()
    set_run_font(run_sep, style)
    fld_sep = OxmlElement("w:fldChar")
    fld_sep.set(qn("w:fldCharType"), "separate")
    run_sep._r.append(fld_sep)

    run_value = paragraph.add_run("1")
    set_run_font(run_value, style)

    run_end = paragraph.add_run()
    set_run_font(run_end, style)
    fld_end = OxmlElement("w:fldChar")
    fld_end.set(qn("w:fldCharType"), "end")
    run_end._r.append(fld_end)


def add_page_number_footer(section):
    footer = section.footer
    footer.is_linked_to_previous = False
    paragraph = footer.paragraphs[0]

    for run in list(paragraph.runs):
        run._element.getparent().remove(run._element)

    style = STYLES["page_number"]
    set_paragraph_format(paragraph, style)

    left_run = paragraph.add_run("— ")
    set_run_font(left_run, style)

    add_page_number_field(paragraph, style)

    right_run = paragraph.add_run(" —")
    set_run_font(right_run, style)


def enable_update_fields(doc):
    try:
        settings_el = doc.settings.element
    except Exception:
        try:
            settings_el = doc.settings._element
        except Exception:
            return

    update_fields = settings_el.find(qn("w:updateFields"))
    if update_fields is None:
        update_fields = OxmlElement("w:updateFields")
        settings_el.append(update_fields)
    update_fields.set(qn("w:val"), "true")


def main():
    doc = Document()

    for paragraph in list(doc.paragraphs):
        paragraph._element.getparent().remove(paragraph._element)

    section = doc.sections[0]
    section.page_width = Mm(210)
    section.page_height = Mm(297)
    section.top_margin = Mm(37)
    section.bottom_margin = Mm(35)
    section.left_margin = Mm(28)
    section.right_margin = Mm(26)

    add_paragraph(doc, "关于开展业务培训的通知", "title")
    add_paragraph(doc, "各部门：", "recipient")
    add_paragraph(doc, "一、培训安排", "heading_1")
    add_paragraph(doc, "请各部门做好组织协调，按时参加业务培训。", "body")
    add_paragraph(doc, "综合办公室", "signature")
    add_paragraph(doc, "2026年11月24日", "date")

    add_page_number_footer(section)
    enable_update_fields(doc)

    doc.save("output.docx")


if __name__ == "__main__":
    main()
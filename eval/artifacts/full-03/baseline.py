# -*- coding: utf-8 -*-
"""Generate output.docx following GB/T 9704-2012 (builtin profile 'gbt-9704-2012')."""

from docx import Document
from docx.shared import Pt, Mm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml.ns import qn
from docx.oxml import OxmlElement


ALIGN_MAP = {
    "left": WD_ALIGN_PARAGRAPH.LEFT,
    "center": WD_ALIGN_PARAGRAPH.CENTER,
    "right": WD_ALIGN_PARAGRAPH.RIGHT,
    "justify": WD_ALIGN_PARAGRAPH.JUSTIFY,
}

STYLES = {
    "title": {
        "font_cn": "黑体", "font_en": "Times New Roman", "size": 22.0,
        "bold": False, "italic": False, "color": "000000",
        "align": "center", "line": 30.0, "indent": 0.0,
        "space_before": 0.0, "space_after": 0.0,
    },
    "heading_1": {
        "font_cn": "黑体", "font_en": "Times New Roman", "size": 16.0,
        "bold": False, "italic": False, "color": "000000",
        "align": "justify", "line": 28.0, "indent": 2.0,
        "space_before": 0.0, "space_after": 0.0,
    },
    "heading_2": {
        "font_cn": "楷体_GB2312", "font_en": "Times New Roman", "size": 16.0,
        "bold": False, "italic": False, "color": "000000",
        "align": "justify", "line": 28.0, "indent": 2.0,
        "space_before": 0.0, "space_after": 0.0,
    },
    "heading_3": {
        "font_cn": "仿宋_GB2312", "font_en": "Times New Roman", "size": 16.0,
        "bold": False, "italic": False, "color": "000000",
        "align": "justify", "line": 28.0, "indent": 2.0,
        "space_before": 0.0, "space_after": 0.0,
    },
    "body": {
        "font_cn": "黑体", "font_en": "Times New Roman", "size": 12.0,
        "bold": False, "italic": False, "color": "000000",
        "align": "justify", "line": 26.0, "indent": 2.0,
        "space_before": 0.0, "space_after": 0.0,
    },
    "recipient": {
        "font_cn": "仿宋_GB2312", "font_en": "Times New Roman", "size": 16.0,
        "bold": False, "italic": False, "color": "000000",
        "align": "left", "line": 28.0, "indent": 0.0,
        "space_before": 0.0, "space_after": 0.0,
    },
    "signature": {
        "font_cn": "仿宋_GB2312", "font_en": "Times New Roman", "size": 16.0,
        "bold": False, "italic": False, "color": "000000",
        "align": "right", "line": 28.0, "indent": 0.0,
        "space_before": 0.0, "space_after": 0.0,
    },
    "date": {
        "font_cn": "仿宋_GB2312", "font_en": "Times New Roman", "size": 16.0,
        "bold": False, "italic": False, "color": "000000",
        "align": "right", "line": 28.0, "indent": 0.0,
        "space_before": 0.0, "space_after": 0.0,
    },
    "page_number": {
        "font_cn": "宋体", "font_en": "Times New Roman", "size": 14.0,
        "bold": False, "italic": False, "color": "000000",
    },
}


def _set_sz_cs(rPr, size_pt):
    szCs = rPr.find(qn("w:szCs"))
    if szCs is None:
        szCs = OxmlElement("w:szCs")
        sz = rPr.find(qn("w:sz"))
        if sz is not None:
            sz.addnext(szCs)
        else:
            rPr.append(szCs)
    szCs.set(qn("w:val"), str(int(round(size_pt * 2))))


def style_run(run, st):
    """Apply explicit eastAsia + ascii/hAnsi/cs fonts, size, bold, colour."""
    cn = st.get("font_cn", "仿宋_GB2312")
    en = st.get("font_en", "Times New Roman")
    size = float(st.get("size", 16.0))
    bold = bool(st.get("bold", False))
    italic = bool(st.get("italic", False))
    color = st.get("color", "000000")

    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.get_or_add_rFonts()
    rFonts.set(qn("w:ascii"), en)
    rFonts.set(qn("w:hAnsi"), en)
    rFonts.set(qn("w:eastAsia"), cn)
    rFonts.set(qn("w:cs"), en)

    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.italic = italic
    run.font.color.rgb = RGBColor.from_string(color)

    rPr = run._element.get_or_add_rPr()
    _set_sz_cs(rPr, size)


def fmt_paragraph(p, st):
    """Explicit alignment, exact line spacing (pt) and first-line indent (chars)."""
    pf = p.paragraph_format
    pf.alignment = ALIGN_MAP.get(st.get("align", "justify"), WD_ALIGN_PARAGRAPH.JUSTIFY)
    pf.space_before = Pt(float(st.get("space_before", 0.0)))
    pf.space_after = Pt(float(st.get("space_after", 0.0)))
    pf.line_spacing = Pt(float(st.get("line", 28.0)))
    pf.line_spacing_rule = WD_LINE_SPACING.EXACTLY

    pPr = p._p.get_or_add_pPr()
    ind = pPr.get_or_add_ind()
    chars = float(st.get("indent", 0.0))
    size = float(st.get("size", 16.0))
    if chars > 0:
        ind.set(qn("w:firstLineChars"), str(int(round(chars * 100))))
        ind.set(qn("w:firstLine"), str(int(round(chars * size * 20))))
    else:
        ind.set(qn("w:firstLineChars"), "0")
        ind.set(qn("w:firstLine"), "0")
    ind.set(qn("w:left"), "0")
    ind.set(qn("w:right"), "0")


def add_text_paragraph(container, text, st):
    p = container.add_paragraph()
    fmt_paragraph(p, st)
    if text:
        run = p.add_run(text)
        style_run(run, st)
    return p


def add_field_run(paragraph, instr, placeholder="1"):
    """Insert a Word field (begin / instrText / separate / result / end)."""
    runs = []

    r = paragraph.add_run()
    fc = OxmlElement("w:fldChar")
    fc.set(qn("w:fldCharType"), "begin")
    r._r.append(fc)
    runs.append(r)

    r = paragraph.add_run()
    it = OxmlElement("w:instrText")
    it.set(qn("xml:space"), "preserve")
    it.text = instr
    r._r.append(it)
    runs.append(r)

    r = paragraph.add_run()
    fc = OxmlElement("w:fldChar")
    fc.set(qn("w:fldCharType"), "separate")
    r._r.append(fc)
    runs.append(r)

    r = paragraph.add_run()
    t = OxmlElement("w:t")
    t.set(qn("xml:space"), "preserve")
    t.text = placeholder
    r._r.append(t)
    runs.append(r)

    r = paragraph.add_run()
    fc = OxmlElement("w:fldChar")
    fc.set(qn("w:fldCharType"), "end")
    r._r.append(fc)
    runs.append(r)

    return runs


def build_footer_page_number(section):
    footer = section.footer
    footer.is_linked_to_previous = False
    paragraphs = footer.paragraphs
    p = paragraphs[0] if paragraphs else footer.add_paragraph()
    for r in list(p.runs):
        r._element.getparent().remove(r._element)

    pf = p.paragraph_format
    pf.alignment = WD_ALIGN_PARAGRAPH.CENTER
    pf.space_before = Pt(0.0)
    pf.space_after = Pt(0.0)
    pf.line_spacing = Pt(18.0)
    pf.line_spacing_rule = WD_LINE_SPACING.EXACTLY
    pPr = p._p.get_or_add_pPr()
    ind = pPr.get_or_add_ind()
    ind.set(qn("w:firstLineChars"), "0")
    ind.set(qn("w:firstLine"), "0")
    ind.set(qn("w:left"), "0")
    ind.set(qn("w:right"), "0")

    page_st = STYLES["page_number"]

    r = p.add_run("— ")
    style_run(r, page_st)

    for run in add_field_run(p, " PAGE   \\* MERGEFORMAT ", "1"):
        style_run(run, page_st)

    r = p.add_run(" —")
    style_run(r, page_st)


def build_document():
    doc = Document()

    # ------- page setup: A4, margins per profile -------
    section = doc.sections[0]
    section.page_width = Mm(210.0)
    section.page_height = Mm(297.0)
    section.top_margin = Mm(32.0)
    section.bottom_margin = Mm(35.0)
    section.left_margin = Mm(28.0)
    section.right_margin = Mm(26.0)
    section.header_distance = Mm(15.0)
    section.footer_distance = Mm(28.0)
    section.gutter = Mm(0.0)

    # ------- default (Normal) style: explicit CJK + latin fonts -------
    normal = doc.styles["Normal"]
    normal.font.size = Pt(16.0)
    normal.font.bold = False
    normal.font.italic = False
    normal.font.color.rgb = RGBColor.from_string("000000")
    n_rPr = normal.element.get_or_add_rPr()
    n_rFonts = n_rPr.get_or_add_rFonts()
    n_rFonts.set(qn("w:ascii"), "Times New Roman")
    n_rFonts.set(qn("w:hAnsi"), "Times New Roman")
    n_rFonts.set(qn("w:eastAsia"), "仿宋_GB2312")
    n_rFonts.set(qn("w:cs"), "Times New Roman")
    _set_sz_cs(n_rPr, 16.0)
    n_pPr = normal.element.get_or_add_pPr()
    n_ind = n_pPr.get_or_add_ind()
    n_ind.set(qn("w:firstLineChars"), "200")
    n_ind.set(qn("w:firstLine"), "640")

    # ------- red header (profile: disabled -> nothing emitted) -------
    # red_header.enabled == False, so no 红头 and no 红色分隔线.

    # ------- title -------
    add_text_paragraph(doc, "关于开展业务培训的通知", STYLES["title"])

    # ------- recipient (主送机关) -------
    add_text_paragraph(doc, "各部门：", STYLES["recipient"])

    # ------- body blocks -------
    add_text_paragraph(doc, "一、培训安排", STYLES["heading_1"])
    add_text_paragraph(doc, "请各部门做好组织协调，按时参加业务培训。", STYLES["body"])

    # ------- attachments: none -------

    # ------- signature / date -------
    add_text_paragraph(doc, "综合办公室", STYLES["signature"])
    add_text_paragraph(doc, "2026年11月24日", STYLES["date"])

    # ------- footer page number (PAGE field) -------
    build_footer_page_number(section)

    doc.save("output.docx")


if __name__ == "__main__":
    build_document()

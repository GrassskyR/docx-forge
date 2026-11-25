# -*- coding: utf-8 -*-
"""生成 GB/T 9704-2012 版式公文 output.docx"""

from docx import Document
from docx.shared import Pt, Mm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.enum.style import WD_STYLE_TYPE
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

OUTPUT = "output.docx"

TITLE = "关于开展业务培训的通知"
RECIPIENT = "各部门："
BLOCKS = [
    ("heading_1", "一、培训安排"),
    ("body", "请各部门做好组织协调，按时参加业务培训。"),
]
SIGNATURE = "综合办公室"
DATE_TEXT = "2026年11月24日"

CENTER = WD_ALIGN_PARAGRAPH.CENTER
JUSTIFY = WD_ALIGN_PARAGRAPH.JUSTIFY
LEFT = WD_ALIGN_PARAGRAPH.LEFT
RIGHT = WD_ALIGN_PARAGRAPH.RIGHT

STYLE_SPECS = {
    "gw_title": {
        "cn": "黑体", "en": "Times New Roman", "size": 24.0,
        "bold": False, "italic": False, "color": "000000",
        "align": CENTER, "line": 28.0, "indent": 0.0,
    },
    "gw_heading_1": {
        "cn": "黑体", "en": "Times New Roman", "size": 16.0,
        "bold": False, "italic": False, "color": "000000",
        "align": JUSTIFY, "line": 28.0, "indent": 2.0,
    },
    "gw_body": {
        "cn": "宋体", "en": "Times New Roman", "size": 14.0,
        "bold": False, "italic": False, "color": "000000",
        "align": JUSTIFY, "line": 28.0, "indent": 2.0,
    },
    "gw_recipient": {
        "cn": "仿宋_GB2312", "en": "Times New Roman", "size": 16.0,
        "bold": False, "italic": False, "color": "000000",
        "align": LEFT, "line": 28.0, "indent": 0.0,
    },
    "gw_signature": {
        "cn": "仿宋_GB2312", "en": "Times New Roman", "size": 16.0,
        "bold": False, "italic": False, "color": "000000",
        "align": RIGHT, "line": 28.0, "indent": 0.0,
    },
    "gw_date": {
        "cn": "仿宋_GB2312", "en": "Times New Roman", "size": 16.0,
        "bold": False, "italic": False, "color": "000000",
        "align": RIGHT, "line": 28.0, "indent": 0.0,
    },
}

ROLE_STYLE = {
    "title": "gw_title",
    "heading_1": "gw_heading_1",
    "heading_2": "gw_body",
    "heading_3": "gw_body",
    "body": "gw_body",
    "recipient": "gw_recipient",
    "signature": "gw_signature",
    "date": "gw_date",
}


# ---------------------------------------------------------------- 低层工具
def set_rfonts(rPr, font_cn, font_en):
    """显式写入 ascii / hAnsi / cs / eastAsia 四个字体槽。"""
    rFonts = rPr.find(qn("w:rFonts"))
    if rFonts is None:
        rFonts = OxmlElement("w:rFonts")
        rPr.insert(0, rFonts)
    rFonts.set(qn("w:ascii"), font_en)
    rFonts.set(qn("w:hAnsi"), font_en)
    rFonts.set(qn("w:cs"), font_en)
    rFonts.set(qn("w:eastAsia"), font_cn)
    rFonts.set(qn("w:hint"), "eastAsia")


def fmt_run(run, font_cn, font_en, size_pt,
            bold=False, italic=False, color="000000"):
    run.font.size = Pt(size_pt)
    run.font.bold = bold
    run.font.italic = italic
    run.font.color.rgb = RGBColor.from_string(color)
    rPr = run._element.get_or_add_rPr()
    set_rfonts(rPr, font_cn, font_en)


def fmt_para(p, align, line_pt, indent_chars=0.0,
             space_before=0.0, space_after=0.0, size_pt=16.0):
    pf = p.paragraph_format
    pf.alignment = align
    pf.space_before = Pt(space_before)
    pf.space_after = Pt(space_after)
    pf.line_spacing_rule = WD_LINE_SPACING.EXACTLY
    pf.line_spacing = Pt(line_pt)
    pf.left_indent = Pt(0)
    pf.right_indent = Pt(0)
    if indent_chars and indent_chars > 0:
        pf.first_line_indent = Pt(size_pt * indent_chars)
    else:
        pf.first_line_indent = Pt(0)
    ind = p._p.pPr.find(qn("w:ind")) if p._p.pPr is not None else None
    if ind is not None:
        ind.set(qn("w:firstLineChars"), str(int(round(indent_chars * 100))))


# ---------------------------------------------------------------- 文档骨架
def setup_section(doc):
    sec = doc.sections[0]
    sec.page_width = Mm(210.0)
    sec.page_height = Mm(297.0)
    sec.top_margin = Mm(30.0)
    sec.bottom_margin = Mm(35.0)
    sec.left_margin = Mm(28.0)
    sec.right_margin = Mm(26.0)
    sec.header_distance = Mm(15.0)
    sec.footer_distance = Mm(20.0)
    return sec


def setup_normal(doc):
    normal = doc.styles["Normal"]
    normal.font.size = Pt(16.0)
    normal.font.bold = False
    normal.font.italic = False
    normal.font.color.rgb = RGBColor.from_string("000000")
    rPr = normal.element.get_or_add_rPr()
    set_rfonts(rPr, "仿宋_GB2312", "Times New Roman")
    pf = normal.paragraph_format
    pf.space_before = Pt(0)
    pf.space_after = Pt(0)


def create_styles(doc):
    for name, spec in STYLE_SPECS.items():
        st = doc.styles.add_style(name, WD_STYLE_TYPE.PARAGRAPH)
        st.base_style = doc.styles["Normal"]
        st.quick_style = True
        st.font.size = Pt(spec["size"])
        st.font.bold = spec["bold"]
        st.font.italic = spec["italic"]
        st.font.color.rgb = RGBColor.from_string(spec["color"])
        rPr = st.element.get_or_add_rPr()
        set_rfonts(rPr, spec["cn"], spec["en"])
        pf = st.paragraph_format
        pf.alignment = spec["align"]
        pf.space_before = Pt(0)
        pf.space_after = Pt(0)
        pf.line_spacing_rule = WD_LINE_SPACING.EXACTLY
        pf.line_spacing = Pt(spec["line"])
        pf.left_indent = Pt(0)
        pf.right_indent = Pt(0)
        if spec["indent"]:
            pf.first_line_indent = Pt(spec["size"] * spec["indent"])
        else:
            pf.first_line_indent = Pt(0)
        pPr = st.element.get_or_add_pPr()
        ind = pPr.find(qn("w:ind"))
        if ind is not None:
            ind.set(qn("w:firstLineChars"),
                    str(int(round(spec["indent"] * 100))))


def add_role_paragraph(doc, role, text):
    style_name = ROLE_STYLE[role]
    spec = STYLE_SPECS[style_name]
    p = doc.add_paragraph(style=doc.styles[style_name])
    fmt_para(p, spec["align"], spec["line"], spec["indent"], 0.0, 0.0,
             spec["size"])
    run = p.add_run(text)
    fmt_run(run, spec["cn"], spec["en"], spec["size"],
            spec["bold"], spec["italic"], spec["color"])
    return p


# ---------------------------------------------------------------- 页码
def add_page_field(paragraph, font_cn, font_en, size_pt):
    run = paragraph.add_run()
    fmt_run(run, font_cn, font_en, size_pt)
    el = run._element

    fld_begin = OxmlElement("w:fldChar")
    fld_begin.set(qn("w:fldCharType"), "begin")

    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = " PAGE  \\* MERGEFORMAT "

    fld_sep = OxmlElement("w:fldChar")
    fld_sep.set(qn("w:fldCharType"), "separate")

    t = OxmlElement("w:t")
    t.text = "1"

    fld_end = OxmlElement("w:fldChar")
    fld_end.set(qn("w:fldCharType"), "end")

    el.append(fld_begin)
    el.append(instr)
    el.append(fld_sep)
    el.append(t)
    el.append(fld_end)


def setup_footer(doc, section):
    footer = section.footer
    footer.is_linked_to_previous = False
    p = footer.paragraphs[0]
    p.style = doc.styles["Normal"]
    pf = p.paragraph_format
    pf.alignment = CENTER
    pf.space_before = Pt(0)
    pf.space_after = Pt(0)
    pf.first_line_indent = Pt(0)
    pf.left_indent = Pt(0)
    pf.right_indent = Pt(0)
    pf.line_spacing_rule = WD_LINE_SPACING.SINGLE

    page_cn, page_en, page_size = "宋体", "Times New Roman", 14.0

    r1 = p.add_run("— ")
    fmt_run(r1, page_cn, page_en, page_size)

    add_page_field(p, page_cn, page_en, page_size)

    r2 = p.add_run(" —")
    fmt_run(r2, page_cn, page_en, page_size)


# ---------------------------------------------------------------- 主流程
def build():
    doc = Document()
    setup_normal(doc)
    section = setup_section(doc)
    create_styles(doc)

    # 标题
    add_role_paragraph(doc, "title", TITLE)

    # 主送机关（抬头）
    if RECIPIENT:
        add_role_paragraph(doc, "recipient", RECIPIENT)

    # 正文块
    for block_type, text in BLOCKS:
        if not text:
            continue
        add_role_paragraph(doc, block_type, text)

    # 落款与日期
    if SIGNATURE:
        add_role_paragraph(doc, "signature", SIGNATURE)
    if DATE_TEXT:
        add_role_paragraph(doc, "date", DATE_TEXT)

    # 页码
    setup_footer(doc, section)

    doc.save(OUTPUT)


if __name__ == "__main__":
    build()

# -*- coding: utf-8 -*-
"""按 GB/T 9704-2012 格式生成 output.docx"""

from docx import Document
from docx.shared import Mm, Pt, RGBColor
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
        "font_cn": "方正小标宋简体", "font_en": "Times New Roman",
        "font_size_pt": 22.0, "bold": False, "italic": False, "color_hex": "000000",
        "alignment": "center", "line_spacing_rule": "exact", "line_spacing_value": 28.0,
        "first_line_indent_chars": 0.0, "space_before_pt": 0.0, "space_after_pt": 0.0,
    },
    "heading_1": {
        "font_cn": "黑体", "font_en": "Times New Roman",
        "font_size_pt": 16.0, "bold": False, "italic": False, "color_hex": "000000",
        "alignment": "justify", "line_spacing_rule": "exact", "line_spacing_value": 28.0,
        "first_line_indent_chars": 2.0, "space_before_pt": 0.0, "space_after_pt": 0.0,
    },
    "body": {
        "font_cn": "仿宋_GB2312", "font_en": "Times New Roman",
        "font_size_pt": 16.0, "bold": False, "italic": False, "color_hex": "000000",
        "alignment": "justify", "line_spacing_rule": "multiple", "line_spacing_value": 1.5,
        "first_line_indent_chars": 2.0, "space_before_pt": 0.0, "space_after_pt": 0.0,
    },
    "recipient": {
        "font_cn": "仿宋_GB2312", "font_en": "Times New Roman",
        "font_size_pt": 16.0, "bold": False, "italic": False, "color_hex": "000000",
        "alignment": "left", "line_spacing_rule": "exact", "line_spacing_value": 28.0,
        "first_line_indent_chars": 0.0, "space_before_pt": 0.0, "space_after_pt": 0.0,
    },
    "signature": {
        "font_cn": "仿宋_GB2312", "font_en": "Times New Roman",
        "font_size_pt": 16.0, "bold": False, "italic": False, "color_hex": "000000",
        "alignment": "right", "line_spacing_rule": "exact", "line_spacing_value": 28.0,
        "first_line_indent_chars": 0.0, "space_before_pt": 0.0, "space_after_pt": 0.0,
    },
    "date": {
        "font_cn": "仿宋_GB2312", "font_en": "Times New Roman",
        "font_size_pt": 16.0, "bold": False, "italic": False, "color_hex": "000000",
        "alignment": "right", "line_spacing_rule": "exact", "line_spacing_value": 28.0,
        "first_line_indent_chars": 0.0, "space_before_pt": 0.0, "space_after_pt": 0.0,
    },
}


def set_rfonts(rPr, font_cn, font_en):
    rFonts = rPr.find(qn("w:rFonts"))
    if rFonts is None:
        rFonts = OxmlElement("w:rFonts")
        rPr.insert(0, rFonts)
    rFonts.set(qn("w:ascii"), font_en)
    rFonts.set(qn("w:hAnsi"), font_en)
    rFonts.set(qn("w:eastAsia"), font_cn)
    rFonts.set(qn("w:cs"), font_en)


def setup_page(doc):
    sec = doc.sections[0]
    sec.page_width = Mm(210.0)
    sec.page_height = Mm(297.0)
    sec.top_margin = Mm(37.0)
    sec.bottom_margin = Mm(35.0)
    sec.left_margin = Mm(28.0)
    sec.right_margin = Mm(26.0)
    sec.header_distance = Mm(15.0)
    sec.footer_distance = Mm(17.5)
    return sec


def setup_default_style(doc):
    normal = doc.styles["Normal"]
    normal.font.name = "Times New Roman"
    normal.font.size = Pt(16.0)
    rPr = normal.element.get_or_add_rPr()
    set_rfonts(rPr, "仿宋_GB2312", "Times New Roman")


def write_paragraph(doc, text, cfg):
    p = doc.add_paragraph()
    pPr = p._p.get_or_add_pPr()

    # 关闭网格对齐，确保固定行距/多倍行距精确生效
    pPr.get_or_add_snapToGrid().set(qn("w:val"), "0")

    pf = p.paragraph_format
    pf.alignment = ALIGN_MAP[cfg["alignment"]]
    pf.space_before = Pt(float(cfg["space_before_pt"]))
    pf.space_after = Pt(float(cfg["space_after_pt"]))

    rule = cfg["line_spacing_rule"]
    value = float(cfg["line_spacing_value"])
    if rule == "exact":
        pf.line_spacing_rule = WD_LINE_SPACING.EXACTLY
        pf.line_spacing = Pt(value)
    elif rule == "multiple":
        pf.line_spacing_rule = WD_LINE_SPACING.MULTIPLE
        pf.line_spacing = value
    elif rule == "at_least":
        pf.line_spacing_rule = WD_LINE_SPACING.AT_LEAST
        pf.line_spacing = Pt(value)
    else:
        pf.line_spacing_rule = WD_LINE_SPACING.SINGLE
        pf.line_spacing = 1.0

    # 首行缩进（按字符）
    chars = float(cfg["first_line_indent_chars"])
    ind = pPr.get_or_add_ind()
    ind.set(qn("w:firstLineChars"), str(int(round(chars * 100))))
    ind.set(qn("w:firstLine"), str(int(round(chars * float(cfg["font_size_pt"]) * 20))))

    run = p.add_run(text if text is not None else "")
    run.font.name = cfg["font_en"]
    run.font.size = Pt(float(cfg["font_size_pt"]))
    run.bold = bool(cfg["bold"])
    run.italic = bool(cfg["italic"])
    run.font.color.rgb = RGBColor.from_string(cfg["color_hex"])
    rPr = run._element.get_or_add_rPr()
    set_rfonts(rPr, cfg["font_cn"], cfg["font_en"])
    return p


def build_document():
    doc = Document()
    setup_page(doc)
    setup_default_style(doc)

    # 标题
    write_paragraph(doc, "关于开展业务培训的通知", STYLES["title"])

    # 主送机关
    write_paragraph(doc, "各部门：", STYLES["recipient"])

    # 正文内容块
    write_paragraph(doc, "一、培训安排", STYLES["heading_1"])
    write_paragraph(doc, "请各部门做好组织协调，按时参加业务培训。", STYLES["body"])

    # 落款
    write_paragraph(doc, "综合办公室", STYLES["signature"])
    write_paragraph(doc, "2026年11月24日", STYLES["date"])

    return doc


if __name__ == "__main__":
    document = build_document()
    document.save("output.docx")

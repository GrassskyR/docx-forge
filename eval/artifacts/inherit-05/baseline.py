# -*- coding: utf-8 -*-
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


def _ensure_rfonts(rPr, cn, en, hint="eastAsia"):
    rFonts = rPr.find(qn("w:rFonts"))
    if rFonts is None:
        rFonts = OxmlElement("w:rFonts")
        rPr.insert(0, rFonts)
    rFonts.set(qn("w:ascii"), en)
    rFonts.set(qn("w:hAnsi"), en)
    rFonts.set(qn("w:eastAsia"), cn)
    rFonts.set(qn("w:cs"), en)
    rFonts.set(qn("w:hint"), hint)


def style_run(run, cn, en, size_pt, bold=False, italic=False, color="000000"):
    run.font.name = en
    run.font.size = Pt(size_pt)
    run.font.bold = bold
    run.font.italic = italic
    run.font.color.rgb = RGBColor.from_string(color)
    rPr = run._element.get_or_add_rPr()
    _ensure_rfonts(rPr, cn, en)


def style_style(style, cn, en, size_pt, bold=False, color="000000"):
    style.font.name = en
    style.font.size = Pt(size_pt)
    style.font.bold = bold
    style.font.color.rgb = RGBColor.from_string(color)
    rPr = style.element.get_or_add_rPr()
    _ensure_rfonts(rPr, cn, en)


def fmt_para(p, align, line_pt, indent_chars=0.0, indent_base_pt=16.0,
             space_before=0.0, space_after=0.0):
    p.alignment = ALIGN_MAP[align]
    pf = p.paragraph_format
    pf.line_spacing_rule = WD_LINE_SPACING.EXACTLY
    pf.line_spacing = Pt(line_pt)
    pf.space_before = Pt(space_before)
    pf.space_after = Pt(space_after)
    pf.first_line_indent = Pt(indent_chars * indent_base_pt)

    pPr = p._element.get_or_add_pPr()
    ind = pPr.find(qn("w:ind"))
    if ind is None:
        ind = OxmlElement("w:ind")
        pPr.append(ind)
    for attr in ("w:left", "w:leftChars", "w:right", "w:rightChars"):
        if ind.get(qn(attr)) is not None:
            del ind.attrib[qn(attr)]
    ind.set(qn("w:firstLineChars"), str(int(round(indent_chars * 100))))


def add_field(paragraph, instr, cn, en, size_pt):
    r1 = paragraph.add_run()
    fc1 = OxmlElement("w:fldChar")
    fc1.set(qn("w:fldCharType"), "begin")
    r1._r.append(fc1)
    style_run(r1, cn, en, size_pt)

    r2 = paragraph.add_run()
    it = OxmlElement("w:instrText")
    it.set(qn("xml:space"), "preserve")
    it.text = " %s " % instr
    r2._r.append(it)
    style_run(r2, cn, en, size_pt)

    r3 = paragraph.add_run()
    fc2 = OxmlElement("w:fldChar")
    fc2.set(qn("w:fldCharType"), "separate")
    r3._r.append(fc2)
    style_run(r3, cn, en, size_pt)

    r4 = paragraph.add_run("1")
    style_run(r4, cn, en, size_pt)

    r5 = paragraph.add_run()
    fc3 = OxmlElement("w:fldChar")
    fc3.set(qn("w:fldCharType"), "end")
    r5._r.append(fc3)
    style_run(r5, cn, en, size_pt)


def build():
    doc = Document()

    normal = doc.styles["Normal"]
    style_style(normal, "宋体", "Times New Roman", 14.0)
    normal.paragraph_format.space_before = Pt(0)
    normal.paragraph_format.space_after = Pt(0)

    sec = doc.sections[0]
    sec.page_width = Mm(210.0)
    sec.page_height = Mm(297.0)
    sec.top_margin = Mm(35.0)
    sec.bottom_margin = Mm(35.0)
    sec.left_margin = Mm(28.0)
    sec.right_margin = Mm(26.0)
    sec.header_distance = Mm(15.0)
    sec.footer_distance = Mm(28.0)
    sec.gutter = Mm(0.0)

    # 标题
    p = doc.add_paragraph()
    fmt_para(p, "center", 28.0, 0.0, 24.0)
    r = p.add_run("关于开展业务培训的通知")
    style_run(r, "黑体", "Times New Roman", 24.0, bold=False)

    # 标题下空一行
    p = doc.add_paragraph()
    fmt_para(p, "left", 28.0, 0.0, 16.0)

    # 主送机关
    p = doc.add_paragraph()
    fmt_para(p, "left", 28.0, 0.0, 16.0)
    r = p.add_run("各部门：")
    style_run(r, "仿宋_GB2312", "Times New Roman", 16.0)

    # 一级标题
    p = doc.add_paragraph()
    fmt_para(p, "justify", 28.0, 2.0, 16.0)
    r = p.add_run("一、培训安排")
    style_run(r, "黑体", "Times New Roman", 16.0, bold=False)

    # 正文
    p = doc.add_paragraph()
    fmt_para(p, "justify", 24.0, 2.0, 14.0)
    r = p.add_run("请各部门做好组织协调，按时参加业务培训。")
    style_run(r, "宋体", "Times New Roman", 14.0)

    # 发文机关署名
    p = doc.add_paragraph()
    fmt_para(p, "right", 28.0, 0.0, 16.0)
    r = p.add_run("综合办公室")
    style_run(r, "仿宋_GB2312", "Times New Roman", 16.0)

    # 成文日期
    p = doc.add_paragraph()
    fmt_para(p, "right", 28.0, 0.0, 16.0)
    r = p.add_run("2026年11月24日")
    style_run(r, "仿宋_GB2312", "Times New Roman", 16.0)

    # 页码：— 1 —
    footer = sec.footer
    footer.is_linked_to_previous = False
    fp = footer.paragraphs[0]
    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    fpf = fp.paragraph_format
    fpf.line_spacing_rule = WD_LINE_SPACING.EXACTLY
    fpf.line_spacing = Pt(14.0)
    fpf.space_before = Pt(0)
    fpf.space_after = Pt(0)
    fpf.first_line_indent = Pt(0)

    r = fp.add_run("— ")
    style_run(r, "宋体", "Times New Roman", 14.0)
    add_field(fp, "PAGE", "宋体", "Times New Roman", 14.0)
    r = fp.add_run(" —")
    style_run(r, "宋体", "Times New Roman", 14.0)

    doc.save("output.docx")


if __name__ == "__main__":
    build()

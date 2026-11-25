# -*- coding: utf-8 -*-
"""从零生成 GB/T 9704-2012 国标公文 output.docx"""

from docx import Document
from docx.shared import Pt, Mm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

# ------------------------- 字体常量 -------------------------
FONT_TITLE_CN = "方正小标宋简体"
FONT_HEI_CN = "黑体"
FONT_KAI_CN = "楷体_GB2312"
FONT_FS_CN = "仿宋_GB2312"
FONT_SONG_CN = "宋体"
FONT_EN = "Times New Roman"

# ------------------------- 基础工具 -------------------------


def set_run_font(run, cn_font, en_font, size_pt, bold=False, italic=False, color_hex="000000"):
    """显式设置中文 eastAsia 与西文 ascii / hAnsi / cs。"""
    run.font.size = Pt(size_pt)
    run.font.bold = bold
    run.font.italic = italic
    run.font.color.rgb = RGBColor.from_string(color_hex)
    run.font.name = en_font

    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.find(qn("w:rFonts"))
    if rFonts is None:
        rFonts = OxmlElement("w:rFonts")
        rPr.insert(0, rFonts)
    rFonts.set(qn("w:ascii"), en_font)
    rFonts.set(qn("w:hAnsi"), en_font)
    rFonts.set(qn("w:eastAsia"), cn_font)
    rFonts.set(qn("w:cs"), en_font)


def add_run_text(paragraph, text, cn_font, en_font, size_pt, bold=False, color_hex="000000"):
    run = paragraph.add_run(text)
    set_run_font(run, cn_font, en_font, size_pt, bold=bold, color_hex=color_hex)
    return run


def add_page_field(paragraph, cn_font, en_font, size_pt, color_hex="000000"):
    """插入 PAGE 域（页码）。"""
    run = paragraph.add_run()
    set_run_font(run, cn_font, en_font, size_pt, color_hex=color_hex)

    fld_begin = OxmlElement("w:fldChar")
    fld_begin.set(qn("w:fldCharType"), "begin")

    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = " PAGE "

    fld_sep = OxmlElement("w:fldChar")
    fld_sep.set(qn("w:fldCharType"), "separate")

    txt = OxmlElement("w:t")
    txt.text = "1"

    fld_end = OxmlElement("w:fldChar")
    fld_end.set(qn("w:fldCharType"), "end")

    for el in (fld_begin, instr, fld_sep, txt, fld_end):
        run._r.append(el)
    return run


def format_paragraph(paragraph,
                     alignment,
                     line_spacing_pt=28.0,
                     first_line_indent_chars=0.0,
                     font_size_pt=16.0,
                     space_before_pt=0.0,
                     space_after_pt=0.0):
    """设置段落格式：固定行距（磅）、首行缩进（字符）、对齐、段前段后。"""
    pf = paragraph.paragraph_format
    pf.alignment = alignment
    pf.line_spacing_rule = WD_LINE_SPACING.EXACTLY
    pf.line_spacing = Pt(line_spacing_pt)
    pf.space_before = Pt(space_before_pt)
    pf.space_after = Pt(space_after_pt)
    pf.left_indent = Pt(0)
    pf.right_indent = Pt(0)
    pf.first_line_indent = Pt(first_line_indent_chars * font_size_pt)

    pPr = paragraph._p.get_or_add_pPr()
    ind = pPr.find(qn("w:ind"))
    if ind is None:
        ind = OxmlElement("w:ind")
        pPr.append(ind)
    ind.set(qn("w:firstLine"), str(int(round(first_line_indent_chars * font_size_pt * 20))))
    ind.set(qn("w:firstLineChars"), str(int(round(first_line_indent_chars * 100))))


def add_paragraph(doc, text, cn_font, en_font, size_pt, alignment,
                  line_spacing_pt=28.0, first_line_indent_chars=0.0,
                  space_before_pt=0.0, space_after_pt=0.0, bold=False):
    p = doc.add_paragraph()
    format_paragraph(
        p,
        alignment=alignment,
        line_spacing_pt=line_spacing_pt,
        first_line_indent_chars=first_line_indent_chars,
        font_size_pt=size_pt,
        space_before_pt=space_before_pt,
        space_after_pt=space_after_pt,
    )
    add_run_text(p, text, cn_font, en_font, size_pt, bold=bold)
    return p


# ------------------------- 文档构建 -------------------------


def build_document():
    doc = Document()

    # Normal 默认样式
    normal = doc.styles["Normal"]
    normal.font.name = FONT_EN
    normal.font.size = Pt(16)
    normal.font.bold = False
    normal.font.italic = False
    rpr = normal.element.get_or_add_rPr()
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = OxmlElement("w:rFonts")
        rpr.insert(0, rfonts)
    rfonts.set(qn("w:ascii"), FONT_EN)
    rfonts.set(qn("w:hAnsi"), FONT_EN)
    rfonts.set(qn("w:eastAsia"), FONT_FS_CN)
    rfonts.set(qn("w:cs"), FONT_EN)

    # 页面设置 A4 + 国标页边距
    sec = doc.sections[0]
    sec.page_width = Mm(210)
    sec.page_height = Mm(297)
    sec.top_margin = Mm(37)
    sec.bottom_margin = Mm(35)
    sec.left_margin = Mm(28)
    sec.right_margin = Mm(26)
    sec.header_distance = Mm(15)
    sec.footer_distance = Mm(28)   # 页码位于版心下边缘之下约 7mm

    # 页脚页码：— 1 —
    footer = sec.footer
    footer.is_linked_to_previous = False
    fp = footer.paragraphs[0]
    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    fp.paragraph_format.left_indent = Pt(0)
    fp.paragraph_format.right_indent = Pt(0)
    fp.paragraph_format.first_line_indent = Pt(0)
    fp.paragraph_format.line_spacing_rule = WD_LINE_SPACING.SINGLE
    for r in list(fp.runs):
        r._r.getparent().remove(r._r)

    add_run_text(fp, "\u2014 ", FONT_SONG_CN, FONT_EN, 14)
    add_page_field(fp, FONT_SONG_CN, FONT_EN, 14)
    add_run_text(fp, " \u2014", FONT_SONG_CN, FONT_EN, 14)

    # 1. 标题
    add_paragraph(
        doc,
        "关于开展业务培训的通知",
        cn_font=FONT_TITLE_CN,
        en_font=FONT_EN,
        size_pt=22.0,
        alignment=WD_ALIGN_PARAGRAPH.CENTER,
        line_spacing_pt=28.0,
        first_line_indent_chars=0.0,
        space_before_pt=0.0,
        space_after_pt=0.0,
    )

    # 2. 主送机关
    add_paragraph(
        doc,
        "各部门：",
        cn_font=FONT_FS_CN,
        en_font=FONT_EN,
        size_pt=16.0,
        alignment=WD_ALIGN_PARAGRAPH.LEFT,
        line_spacing_pt=28.0,
        first_line_indent_chars=0.0,
        space_before_pt=0.0,
        space_after_pt=0.0,
    )

    # 3. 一级标题
    add_paragraph(
        doc,
        "一、培训安排",
        cn_font=FONT_HEI_CN,
        en_font=FONT_EN,
        size_pt=16.0,
        alignment=WD_ALIGN_PARAGRAPH.JUSTIFY,
        line_spacing_pt=28.0,
        first_line_indent_chars=2.0,
        space_before_pt=0.0,
        space_after_pt=0.0,
    )

    # 4. 正文
    add_paragraph(
        doc,
        "请各部门做好组织协调，按时参加业务培训。",
        cn_font=FONT_FS_CN,
        en_font=FONT_EN,
        size_pt=12.0,
        alignment=WD_ALIGN_PARAGRAPH.JUSTIFY,
        line_spacing_pt=28.0,
        first_line_indent_chars=2.0,
        space_before_pt=0.0,
        space_after_pt=0.0,
    )

    # 5. 发文机关署名
    add_paragraph(
        doc,
        "综合办公室",
        cn_font=FONT_FS_CN,
        en_font=FONT_EN,
        size_pt=16.0,
        alignment=WD_ALIGN_PARAGRAPH.RIGHT,
        line_spacing_pt=28.0,
        first_line_indent_chars=0.0,
        space_before_pt=0.0,
        space_after_pt=0.0,
    )

    # 6. 成文日期
    add_paragraph(
        doc,
        "2026年11月24日",
        cn_font=FONT_FS_CN,
        en_font=FONT_EN,
        size_pt=16.0,
        alignment=WD_ALIGN_PARAGRAPH.RIGHT,
        line_spacing_pt=28.0,
        first_line_indent_chars=0.0,
        space_before_pt=0.0,
        space_after_pt=0.0,
    )

    doc.save("output.docx")
    print("output.docx generated.")


if __name__ == "__main__":
    build_document()

# -*- coding: utf-8 -*-
"""生成 GB/T 9704-2012 格式公文 output.docx"""

from docx import Document
from docx.shared import Pt, Mm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

OUTPUT_PATH = "output.docx"

# ---------------------------------------------------------------- schema 顺序
PPR_IND_SUCCESSORS = (
    "w:contextualSpacing", "w:mirrorIndents", "w:suppressOverlap", "w:jc",
    "w:textDirection", "w:textAlignment", "w:textboxTightWrap", "w:outlineLvl",
    "w:divId", "w:cnfStyle", "w:rPr", "w:sectPr", "w:pPrChange",
)

RPR_SZCS_SUCCESSORS = (
    "w:highlight", "w:u", "w:effect", "w:bdr", "w:shd", "w:fitText",
    "w:vertAlign", "w:rtl", "w:cs", "w:em", "w:lang", "w:eastAsianLayout",
    "w:specVanish", "w:oMath",
)


# ---------------------------------------------------------------- 基础工具
def style_run(run, font_cn, font_en, size_pt, bold=False, italic=False,
              color_hex="000000"):
    """显式设置中文 eastAsia 与西文 ascii/hAnsi/cs 字体、字号、颜色。"""
    run.font.name = font_en
    run.font.size = Pt(size_pt)
    run.font.bold = bold
    run.font.italic = italic
    run.font.color.rgb = RGBColor.from_string(color_hex)

    rPr = run._element.get_or_add_rPr()

    rFonts = rPr.find(qn("w:rFonts"))
    if rFonts is None:
        rFonts = OxmlElement("w:rFonts")
        rPr.insert(0, rFonts)
    rFonts.set(qn("w:ascii"), font_en)
    rFonts.set(qn("w:hAnsi"), font_en)
    rFonts.set(qn("w:eastAsia"), font_cn)
    rFonts.set(qn("w:cs"), font_en)

    sz_cs = rPr.find(qn("w:szCs"))
    if sz_cs is None:
        sz_cs = OxmlElement("w:szCs")
        rPr.insert_element_before(sz_cs, *RPR_SZCS_SUCCESSORS)
    sz_cs.set(qn("w:val"), str(int(round(size_pt * 2))))


def set_first_line_chars(paragraph, chars, font_size_pt):
    """以“字符”为单位设置首行缩进（同时写入 firstLine 兜底值，单位 twips）。"""
    pPr = paragraph._p.get_or_add_pPr()
    ind = pPr.find(qn("w:ind"))
    if ind is None:
        ind = OxmlElement("w:ind")
        pPr.insert_element_before(ind, *PPR_IND_SUCCESSORS)
    ind.set(qn("w:firstLineChars"), str(int(round(chars * 100))))
    ind.set(qn("w:firstLine"), str(int(round(chars * font_size_pt * 20))))


def add_paragraph(doc, text, font_cn, font_en, size_pt, alignment,
                  line_pt, first_line_chars, bold=False,
                  space_before_pt=0.0, space_after_pt=0.0):
    p = doc.add_paragraph()
    pf = p.paragraph_format
    pf.alignment = alignment
    pf.space_before = Pt(space_before_pt)
    pf.space_after = Pt(space_after_pt)
    pf.left_indent = Pt(0)
    pf.right_indent = Pt(0)
    # 固定行距，单位磅
    pf.line_spacing = Pt(line_pt)
    set_first_line_chars(p, first_line_chars, size_pt)

    run = p.add_run(text)
    style_run(run, font_cn, font_en, size_pt, bold=bold, italic=False,
              color_hex="000000")
    return p


def add_page_number_footer(section):
    """页脚居中插入 PAGE 域。"""
    footer = section.footer
    footer.is_linked_to_previous = False

    if footer.paragraphs:
        fp = footer.paragraphs[0]
        for child in list(fp._p):
            if child.tag != qn("w:pPr"):
                fp._p.remove(child)
    else:
        fp = footer.add_paragraph()

    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    fp.paragraph_format.space_before = Pt(0)
    fp.paragraph_format.space_after = Pt(0)
    fp.paragraph_format.line_spacing = Pt(14)

    run = fp.add_run()

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

    run._r.append(fld_begin)
    run._r.append(instr)
    run._r.append(fld_sep)
    run._r.append(txt)
    run._r.append(fld_end)

    style_run(run, "宋体", "Times New Roman", 14.0)


# ---------------------------------------------------------------- 主流程
def build():
    doc = Document()

    # ---------- 页面设置：A4，上 35 / 下 35 / 左 28 / 右 26 (mm) ----------
    section = doc.sections[0]
    section.page_width = Mm(210)
    section.page_height = Mm(297)
    section.top_margin = Mm(35)
    section.bottom_margin = Mm(35)
    section.left_margin = Mm(28)
    section.right_margin = Mm(26)
    section.header_distance = Mm(15)
    section.footer_distance = Mm(20)

    # 清空默认空段
    for p in list(doc.paragraphs):
        if not p.text.strip():
            p._p.getparent().remove(p._p)

    # ---------- 标题（黑体 22pt，居中，固定行距 30pt） ----------
    add_paragraph(
        doc,
        text="关于开展业务培训的通知",
        font_cn="黑体",
        font_en="Times New Roman",
        size_pt=22.0,
        alignment=WD_ALIGN_PARAGRAPH.CENTER,
        line_pt=30.0,
        first_line_chars=0.0,
        bold=False,
        space_before_pt=0.0,
        space_after_pt=0.0,
    )

    # ---------- 主送机关（仿宋_GB2312 16pt，左对齐，固定行距 28pt） ----------
    add_paragraph(
        doc,
        text="各部门：",
        font_cn="仿宋_GB2312",
        font_en="Times New Roman",
        size_pt=16.0,
        alignment=WD_ALIGN_PARAGRAPH.LEFT,
        line_pt=28.0,
        first_line_chars=0.0,
        bold=False,
        space_before_pt=0.0,
        space_after_pt=0.0,
    )

    # ---------- 正文块 ----------
    for block in [
        {"type": "heading_1",
         "text": "一、培训安排"},
        {"type": "body",
         "text": "请各部门做好组织协调，按时参加业务培训。"},
    ]:
        if block["type"] == "heading_1":
            add_paragraph(
                doc,
                text=block["text"],
                font_cn="黑体",
                font_en="Times New Roman",
                size_pt=16.0,
                alignment=WD_ALIGN_PARAGRAPH.JUSTIFY,
                line_pt=28.0,
                first_line_chars=2.0,
                bold=False,
            )
        else:
            add_paragraph(
                doc,
                text=block["text"],
                font_cn="仿宋_GB2312",
                font_en="Times New Roman",
                size_pt=16.0,
                alignment=WD_ALIGN_PARAGRAPH.JUSTIFY,
                line_pt=29.0,
                first_line_chars=2.0,
                bold=False,
            )

    # ---------- 落款：署名 / 日期（仿宋_GB2312 16pt，右对齐，固定行距 28pt） ----------
    add_paragraph(
        doc,
        text="综合办公室",
        font_cn="仿宋_GB2312",
        font_en="Times New Roman",
        size_pt=16.0,
        alignment=WD_ALIGN_PARAGRAPH.RIGHT,
        line_pt=28.0,
        first_line_chars=0.0,
        bold=False,
    )

    add_paragraph(
        doc,
        text="2026年11月24日",
        font_cn="仿宋_GB2312",
        font_en="Times New Roman",
        size_pt=16.0,
        alignment=WD_ALIGN_PARAGRAPH.RIGHT,
        line_pt=28.0,
        first_line_chars=0.0,
        bold=False,
    )

    # ---------- 页脚 PAGE 页码 ----------
    add_page_number_footer(section)

    doc.save(OUTPUT_PATH)


if __name__ == "__main__":
    build()

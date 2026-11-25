# -*- coding: utf-8 -*-
"""生成 GB/T 9704-2012 风格公文 output.docx"""

from docx import Document
from docx.shared import Pt, Mm, RGBColor, Twips
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml.ns import qn
from docx.oxml import OxmlElement


# ----------------------------------------------------------------------------
# 基础工具
# ----------------------------------------------------------------------------
ALIGN = {
    "left": WD_ALIGN_PARAGRAPH.LEFT,
    "center": WD_ALIGN_PARAGRAPH.CENTER,
    "right": WD_ALIGN_PARAGRAPH.RIGHT,
    "justify": WD_ALIGN_PARAGRAPH.JUSTIFY,
    "both": WD_ALIGN_PARAGRAPH.JUSTIFY,
}


def set_run_font(run, cn, en, size, bold=False, italic=False, color="000000"):
    """显式设置 eastAsia / ascii / hAnsi / cs 与 sz / szCs"""
    run.font.name = en
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.italic = italic
    run.font.color.rgb = RGBColor.from_string(color)

    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.find(qn("w:rFonts"))
    if rFonts is None:
        rFonts = OxmlElement("w:rFonts")
        rPr.insert(0, rFonts)
    rFonts.set(qn("w:ascii"), en)
    rFonts.set(qn("w:hAnsi"), en)
    rFonts.set(qn("w:eastAsia"), cn)
    rFonts.set(qn("w:cs"), en)

    szCs = OxmlElement("w:szCs")
    szCs.set(qn("w:val"), str(int(round(float(size) * 2))))
    rPr.append(szCs)


def apply_spec(p, spec):
    """按角色设置对齐、段前段后、行距、首行缩进与字形"""
    pf = p.paragraph_format
    pf.alignment = ALIGN.get(spec["align"], WD_ALIGN_PARAGRAPH.JUSTIFY)
    pf.space_before = Pt(spec["before"])
    pf.space_after = Pt(spec["after"])

    if spec["rule"] == "exact":
        pf.line_spacing_rule = WD_LINE_SPACING.EXACTLY
        pf.line_spacing = Pt(spec["line"])
    elif spec["rule"] == "at_least":
        pf.line_spacing_rule = WD_LINE_SPACING.AT_LEAST
        pf.line_spacing = Pt(spec["line"])
    else:
        pf.line_spacing_rule = WD_LINE_SPACING.SINGLE

    chars = float(spec["indent"])
    twips = int(round(chars * float(spec["size"]) * 20))
    pf.first_line_indent = Twips(twips)

    pPr = p._p.get_or_add_pPr()
    ind = pPr.find(qn("w:ind"))
    if ind is None:
        ind = OxmlElement("w:ind")
        pPr.append(ind)
    ind.set(qn("w:firstLineChars"), str(int(round(chars * 100))))
    ind.set(qn("w:firstLine"), str(twips))


def add_para(doc, text, spec, runs=None):
    """新增段落。runs 为 [(text, cn, en, size, bold, italic, color), ...]"""
    p = doc.add_paragraph()
    apply_spec(p, spec)
    if runs is None:
        runs = [(text, spec["font_cn"], spec["font_en"], spec["size"],
                 spec["bold"], spec["italic"], spec["color"])]
    for item in runs:
        t, cn, en, size, bold, italic, color = item
        r = p.add_run(t)
        set_run_font(r, cn, en, size, bold, italic, color)
    return p


def add_bottom_border(p, color="FF0000", sz=12, space=4):
    """为段落添加下边框（红线）"""
    pPr = p._p.get_or_add_pPr()
    pBdr = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), str(sz))
    bottom.set(qn("w:space"), str(space))
    bottom.set(qn("w:color"), color)
    pBdr.append(bottom)

    successors = [
        qn("w:shd"), qn("w:tabs"), qn("w:suppressAutoHyphens"), qn("w:kinsoku"),
        qn("w:wordWrap"), qn("w:overflowPunct"), qn("w:topLinePunct"),
        qn("w:autoSpaceDE"), qn("w:autoSpaceDN"), qn("w:bidi"),
        qn("w:adjustRightInd"), qn("w:snapToGrid"), qn("w:spacing"),
        qn("w:ind"), qn("w:contextualSpacing"), qn("w:mirrorIndents"),
        qn("w:suppressOverlap"), qn("w:jc"), qn("w:textDirection"),
        qn("w:textAlignment"), qn("w:textboxTightWrap"), qn("w:outlineLvl"),
        qn("w:divId"), qn("w:cnfStyle"), qn("w:rPr"), qn("w:sectPr"),
        qn("w:pPrChange"),
    ]
    anchor = None
    for child in pPr:
        if child.tag in successors:
            anchor = child
            break
    if anchor is not None:
        anchor.addprevious(pBdr)
    else:
        pPr.append(pBdr)


def add_page_number_field(paragraph, cn="宋体", en="Times New Roman", size=14.0):
    """插入 PAGE 域"""
    pieces = [
        ("begin", None, None),
        ("instr", " PAGE ", None),
        ("separate", None, "1"),
        ("end", None, None),
    ]
    for kind, instr, cached in pieces:
        r = paragraph.add_run()
        set_run_font(r, cn, en, size)
        el = r._element
        if kind == "instr":
            node = OxmlElement("w:instrText")
            node.set(qn("xml:space"), "preserve")
            node.text = instr
            el.append(node)
        elif kind == "separate" or kind == "begin" or kind == "end":
            node = OxmlElement("w:fldChar")
            node.set(qn("w:fldCharType"), kind)
            el.append(node)
            if cached is not None:
                t = OxmlElement("w:t")
                t.text = cached
                el.append(t)


# ----------------------------------------------------------------------------
# 角色规格（来自目标格式）
# ----------------------------------------------------------------------------
def spec(font_cn, size, align, line, indent, before=0.0, after=0.0,
         bold=False, italic=False, color="000000", font_en="Times New Roman",
         rule="exact"):
    return {
        "font_cn": font_cn, "font_en": font_en, "size": size, "bold": bold,
        "italic": italic, "color": color, "align": align, "rule": rule,
        "line": line, "indent": indent, "before": before, "after": after,
    }


STYLES = {
    "title": spec("黑体", 22.0, "center", 30.0, 0.0),
    "heading_1": spec("黑体", 16.0, "justify", 28.0, 2.0),
    "heading_2": spec("楷体_GB2312", 16.0, "justify", 28.0, 2.0),
    "heading_3": spec("仿宋_GB2312", 16.0, "justify", 28.0, 2.0),
    "body": spec("仿宋_GB2312", 16.0, "justify", 24.0, 2.0),
    "recipient": spec("仿宋_GB2312", 16.0, "left", 28.0, 0.0),
    "signature": spec("仿宋_GB2312", 16.0, "right", 28.0, 0.0),
    "date": spec("仿宋_GB2312", 16.0, "right", 28.0, 0.0),
}

RED_ORG_SPEC = spec("方正小标宋简体", 36.0, "center", 46.0, 0.0,
                    color="FF0000")
DOC_NO_SPEC = spec("仿宋_GB2312", 16.0, "center", 28.0, 0.0, after=10.0)


# ----------------------------------------------------------------------------
# 正文数据
# ----------------------------------------------------------------------------
RED_ORG = "综合办公室"
DOC_NUMBER = "综办〔2026〕12号"
TITLE = "关于开展档案归档检查的通知"
RECIPIENT = "各部门："
BLOCKS = [
    {"type": "heading_1", "text": "一、检查安排"},
    {"type": "body", "text": "请各部门核对纸质与电子档案目录，整理归档清单并反馈检查结果。"},
]
ATTACHMENTS = []
SIGNATURE = "综合办公室"
DATE = "2026年11月24日"


# ----------------------------------------------------------------------------
# 构建文档
# ----------------------------------------------------------------------------
doc = Document()

section = doc.sections[0]
section.page_width = Mm(210)
section.page_height = Mm(297)
section.margin_top = Mm(30)
section.margin_bottom = Mm(35)
section.margin_left = Mm(28)
section.margin_right = Mm(26)

# ---- 红头 ----
if RED_ORG:
    p = doc.add_paragraph()
    apply_spec(p, RED_ORG_SPEC)
    r = p.add_run(RED_ORG)
    set_run_font(r, "方正小标宋简体", "Times New Roman", 36.0, color="FF0000")

# ---- 发文字号 + 红线 ----
if DOC_NUMBER:
    p = doc.add_paragraph()
    add_bottom_border(p, color="FF0000", sz=12, space=6)
    apply_spec(p, DOC_NO_SPEC)
    r = p.add_run(DOC_NUMBER)
    set_run_font(r, "仿宋_GB2312", "Times New Roman", 16.0)

# ---- 标题 ----
add_para(doc, TITLE, STYLES["title"])

# ---- 主送机关 ----
add_para(doc, RECIPIENT, STYLES["recipient"])

# ---- 正文 ----
for block in BLOCKS:
    btype = block.get("type", "body")
    text = block.get("text", "") or ""
    st = STYLES.get(btype, STYLES["body"])
    if not text:
        continue
    add_para(doc, text, st)

# ---- 附件说明 ----
for att in ATTACHMENTS:
    add_para(doc, att, STYLES["body"])

# ---- 落款与日期 ----
if SIGNATURE:
    add_para(doc, SIGNATURE, STYLES["signature"])
if DATE:
    add_para(doc, DATE, STYLES["date"])

# ---- 页码 ----
footer = section.footer
fp = footer.paragraphs[0]
fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
fp.paragraph_format.space_before = Pt(0)
fp.paragraph_format.space_after = Pt(0)
fp.paragraph_format.line_spacing_rule = WD_LINE_SPACING.SINGLE
add_page_number_field(fp)

doc.save("output.docx")

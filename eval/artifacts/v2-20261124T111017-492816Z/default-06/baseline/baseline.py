# -*- coding: utf-8 -*-
"""生成 GB/T 9704-2012 国标公文 Word 文档（output.docx）。"""

from docx import Document
from docx.shared import Pt, Mm, RGBColor, Twips
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

# ----------------------------------------------------------------------------
# 配置
# ----------------------------------------------------------------------------
CFG = {
    "page": {
        "size": "A4",
        "margin_top_mm": 37.0,
        "margin_bottom_mm": 35.0,
        "margin_left_mm": 28.0,
        "margin_right_mm": 26.0,
        "show_page_number": True,
    },
    "red_header": {
        "enabled": False,
        "org_name": None,
        "font_cn": "方正小标宋简体",
        "font_size_pt": 36.0,
        "color_hex": "FF0000",
        "has_red_line": True,
        "doc_number_font_cn": "仿宋_GB2312",
        "doc_number_size_pt": 16.0,
    },
    "styles": {
        "title": {
            "font_cn": "方正小标宋简体", "font_en": "Times New Roman",
            "font_size_pt": 22.0, "bold": False, "italic": False,
            "color_hex": "000000", "alignment": "center",
            "line_spacing_rule": "exact", "line_spacing_value": 28.0,
            "first_line_indent_chars": 0.0, "space_before_pt": 0.0,
            "space_after_pt": 0.0,
        },
        "heading_1": {
            "font_cn": "黑体", "font_en": "Times New Roman",
            "font_size_pt": 16.0, "bold": False, "italic": False,
            "color_hex": "000000", "alignment": "justify",
            "line_spacing_rule": "exact", "line_spacing_value": 28.0,
            "first_line_indent_chars": 2.0, "space_before_pt": 0.0,
            "space_after_pt": 0.0,
        },
        "heading_2": {
            "font_cn": "楷体_GB2312", "font_en": "Times New Roman",
            "font_size_pt": 16.0, "bold": False, "italic": False,
            "color_hex": "000000", "alignment": "justify",
            "line_spacing_rule": "exact", "line_spacing_value": 28.0,
            "first_line_indent_chars": 2.0, "space_before_pt": 0.0,
            "space_after_pt": 0.0,
        },
        "heading_3": {
            "font_cn": "仿宋_GB2312", "font_en": "Times New Roman",
            "font_size_pt": 16.0, "bold": False, "italic": False,
            "color_hex": "000000", "alignment": "justify",
            "line_spacing_rule": "exact", "line_spacing_value": 28.0,
            "first_line_indent_chars": 2.0, "space_before_pt": 0.0,
            "space_after_pt": 0.0,
        },
        "body": {
            "font_cn": "楷体_GB2312", "font_en": "Times New Roman",
            "font_size_pt": 16.0, "bold": False, "italic": False,
            "color_hex": "000000", "alignment": "justify",
            "line_spacing_rule": "exact", "line_spacing_value": 28.0,
            "first_line_indent_chars": 2.0, "space_before_pt": 0.0,
            "space_after_pt": 0.0,
        },
        "recipient": {
            "font_cn": "仿宋_GB2312", "font_en": "Times New Roman",
            "font_size_pt": 16.0, "bold": False, "italic": False,
            "color_hex": "000000", "alignment": "left",
            "line_spacing_rule": "exact", "line_spacing_value": 28.0,
            "first_line_indent_chars": 0.0, "space_before_pt": 0.0,
            "space_after_pt": 0.0,
        },
        "signature": {
            "font_cn": "仿宋_GB2312", "font_en": "Times New Roman",
            "font_size_pt": 16.0, "bold": False, "italic": False,
            "color_hex": "000000", "alignment": "right",
            "line_spacing_rule": "exact", "line_spacing_value": 28.0,
            "first_line_indent_chars": 0.0, "space_before_pt": 0.0,
            "space_after_pt": 0.0,
        },
        "date": {
            "font_cn": "仿宋_GB2312", "font_en": "Times New Roman",
            "font_size_pt": 16.0, "bold": False, "italic": False,
            "color_hex": "000000", "alignment": "right",
            "line_spacing_rule": "exact", "line_spacing_value": 28.0,
            "first_line_indent_chars": 0.0, "space_before_pt": 0.0,
            "space_after_pt": 0.0,
        },
    },
}

AST = {
    "doc_type": "notice",
    "red_header_org": "综合办公室",
    "doc_number": "综办〔2026〕12号",
    "title": "关于开展档案归档检查的通知",
    "recipient": "各部门：",
    "blocks": [
        {"type": "heading_1", "text": "一、检查安排", "rows": None},
        {"type": "body",
         "text": "请各部门核对纸质与电子档案目录，整理归档清单并反馈检查结果。",
         "rows": None},
    ],
    "attachments": [],
    "signature": "综合办公室",
    "date": "2026年11月24日",
}

ALIGN_MAP = {
    "left": WD_ALIGN_PARAGRAPH.LEFT,
    "center": WD_ALIGN_PARAGRAPH.CENTER,
    "right": WD_ALIGN_PARAGRAPH.RIGHT,
    "justify": WD_ALIGN_PARAGRAPH.JUSTIFY,
}

BLOCK_STYLE_MAP = {
    "title": "title",
    "heading_1": "heading_1",
    "heading_2": "heading_2",
    "heading_3": "heading_3",
    "body": "body",
    "recipient": "recipient",
    "signature": "signature",
    "date": "date",
}


# ----------------------------------------------------------------------------
# 底层工具
# ----------------------------------------------------------------------------
def _set_szCs(rPr, half_points):
    """写入 w:szCs（按半磅计算），保证中文字号一致。"""
    el = rPr.find(qn("w:szCs"))
    if el is None:
        el = OxmlElement("w:szCs")
        sz = rPr.find(qn("w:sz"))
        if sz is not None:
            sz.addnext(el)
        else:
            rPr.append(el)
    el.set(qn("w:val"), str(half_points))


def set_run_font(run, cn, en, size_pt, bold=False, italic=False, color=None):
    """设置 run 的 eastAsia / ascii / hAnsi / cs 字体与字号（sz、szCs）。"""
    run.font.name = en
    run.font.size = Pt(size_pt)
    run.font.bold = bold
    run.font.italic = italic
    if color:
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

    _set_szCs(rPr, int(round(size_pt * 2)))


def apply_para_format(p, st):
    """对齐、段前段后、行距、首行缩进（firstLineChars + firstLine）。"""
    pf = p.paragraph_format
    pf.alignment = ALIGN_MAP.get(st["alignment"], WD_ALIGN_PARAGRAPH.JUSTIFY)
    pf.space_before = Pt(st["space_before_pt"])
    pf.space_after = Pt(st["space_after_pt"])
    pf.line_spacing_rule = WD_LINE_SPACING.EXACTLY
    pf.line_spacing = Pt(st["line_spacing_value"])

    chars = float(st["first_line_indent_chars"])
    size_pt = float(st["font_size_pt"])
    # 1 磅 = 20 twips
    pf.first_line_indent = Twips(int(round(chars * size_pt * 20)))

    pPr = p._p.get_or_add_pPr()
    ind = pPr.find(qn("w:ind"))
    if ind is None:
        ind = OxmlElement("w:ind")
        pPr.append(ind)
    ind.set(qn("w:firstLineChars"), str(int(round(chars * 100))))


def add_bottom_border(p, color_hex="FF0000", sz=12, space=1):
    """段落底部单线下边框（用于红色分隔线）。"""
    pPr = p._p.get_or_add_pPr()
    pBdr = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), str(sz))
    bottom.set(qn("w:space"), str(space))
    bottom.set(qn("w:color"), color_hex)
    pBdr.append(bottom)

    successors = (
        "w:shd", "w:tabs", "w:suppressAutoHyphens", "w:kinsoku", "w:wordWrap",
        "w:overflowPunct", "w:topLinePunct", "w:autoSpaceDE", "w:autoSpaceDN",
        "w:bidi", "w:adjustRightInd", "w:snapToGrid", "w:spacing", "w:ind",
        "w:contextualSpacing", "w:mirrorIndents", "w:suppressOverlap", "w:jc",
        "w:textDirection", "w:textAlignment", "w:textboxTightWrap",
        "w:outlineLvl", "w:divId", "w:cnfStyle", "w:rPr", "w:sectPr",
        "w:pPrChange",
    )
    pPr.insert_element_before(pBdr, *successors)


def add_text_paragraph(doc, text, style_key, cn=None, en=None, size=None,
                       color=None, bold=None, italic=None):
    st = CFG["styles"][BLOCK_STYLE_MAP[style_key]]
    p = doc.add_paragraph()
    apply_para_format(p, st)
    if text:
        run = p.add_run(text)
        set_run_font(
            run,
            cn if cn else st["font_cn"],
            en if en else st["font_en"],
            size if size else st["font_size_pt"],
            st["bold"] if bold is None else bold,
            st["italic"] if italic is None else italic,
            color if color else st["color_hex"],
        )
    return p


# ----------------------------------------------------------------------------
# 页面 / 页码
# ----------------------------------------------------------------------------
def setup_page(doc):
    sec = doc.sections[0]
    sec.page_width = Mm(210.0)
    sec.page_height = Mm(297.0)
    sec.top_margin = Mm(CFG["page"]["margin_top_mm"])
    sec.bottom_margin = Mm(CFG["page"]["margin_bottom_mm"])
    sec.left_margin = Mm(CFG["page"]["margin_left_mm"])
    sec.right_margin = Mm(CFG["page"]["margin_right_mm"])
    sec.header_distance = Mm(15.0)
    sec.footer_distance = Mm(28.0)
    return sec


def set_default_fonts(doc):
    normal = doc.styles["Normal"]
    normal.font.name = "Times New Roman"
    normal.font.size = Pt(16)
    rPr = normal.element.get_or_add_rPr()
    rFonts = rPr.find(qn("w:rFonts"))
    if rFonts is None:
        rFonts = OxmlElement("w:rFonts")
        rPr.insert(0, rFonts)
    rFonts.set(qn("w:ascii"), "Times New Roman")
    rFonts.set(qn("w:hAnsi"), "Times New Roman")
    rFonts.set(qn("w:eastAsia"), "仿宋_GB2312")
    rFonts.set(qn("w:cs"), "Times New Roman")
    _set_szCs(rPr, 32)


def build_page_number(sec):
    if not CFG["page"]["show_page_number"]:
        return
    footer = sec.footer
    footer.is_linked_to_previous = False
    p = footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    pf = p.paragraph_format
    pf.space_before = Pt(0)
    pf.space_after = Pt(0)
    pf.line_spacing_rule = WD_LINE_SPACING.SINGLE

    run = p.add_run()
    set_run_font(run, "宋体", "Times New Roman", 14.0, color="000000")

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

    r = run._r
    r.append(fld_begin)
    r.append(instr)
    r.append(fld_sep)
    r.append(txt)
    r.append(fld_end)


# ----------------------------------------------------------------------------
# 红头 / 发文字号 / 红线
# ----------------------------------------------------------------------------
def build_red_header(doc):
    red = CFG["red_header"]
    org = AST.get("red_header_org") or red.get("org_name")
    doc_number = AST.get("doc_number") or ""

    if not org and not doc_number:
        return

    enabled = bool(red.get("enabled")) or bool(AST.get("red_header_org"))
    if not enabled:
        return

    if org:
        p = doc.add_paragraph()
        pf = p.paragraph_format
        pf.alignment = WD_ALIGN_PARAGRAPH.CENTER
        pf.space_before = Pt(0)
        pf.space_after = Pt(0)
        pf.line_spacing_rule = WD_LINE_SPACING.SINGLE
        pf.first_line_indent = Twips(0)
        run = p.add_run(org)
        set_run_font(
            run,
            red["font_cn"],
            "Times New Roman",
            float(red["font_size_pt"]),
            color=red["color_hex"],
        )

    if doc_number:
        p = doc.add_paragraph()
        pf = p.paragraph_format
        pf.alignment = WD_ALIGN_PARAGRAPH.CENTER
        pf.space_before = Pt(18)
        pf.space_after = Pt(6)
        pf.line_spacing_rule = WD_LINE_SPACING.EXACTLY
        pf.line_spacing = Pt(28)
        pf.first_line_indent = Twips(0)
        pPr = p._p.get_or_add_pPr()
        ind = pPr.find(qn("w:ind"))
        if ind is not None:
            ind.set(qn("w:firstLineChars"), "0")
        run = p.add_run(doc_number)
        set_run_font(
            run,
            red["doc_number_font_cn"],
            "Times New Roman",
            float(red["doc_number_size_pt"]),
            color=red["color_hex"],
        )
        if red.get("has_red_line"):
            add_bottom_border(p, color_hex=red["color_hex"], sz=12, space=1)


# ----------------------------------------------------------------------------
# 正文
# ----------------------------------------------------------------------------
def build_body(doc):
    # 标题
    if AST.get("title"):
        add_text_paragraph(doc, AST["title"], "title")

    # 主送机关
    if AST.get("recipient"):
        add_text_paragraph(doc, AST["recipient"], "recipient")

    # 正文块
    for block in AST.get("blocks", []):
        btype = block.get("type", "body")
        if btype not in BLOCK_STYLE_MAP:
            btype = "body"
        text = block.get("text") or ""
        rows = block.get("rows")
        if rows:
            for row in rows:
                if isinstance(row, (list, tuple)):
                    line = "".join([str(c) for c in row])
                else:
                    line = str(row)
                add_text_paragraph(doc, line, btype)
        else:
            add_text_paragraph(doc, text, btype)

    # 附件说明
    attachments = AST.get("attachments") or []
    if attachments:
        for idx, item in enumerate(attachments):
            prefix = "附件：" if idx == 0 else "　　　"
            add_text_paragraph(doc, prefix + str(item), "body")

    # 发文机关署名 / 成文日期
    if AST.get("signature"):
        add_text_paragraph(doc, AST["signature"], "signature")
    if AST.get("date"):
        add_text_paragraph(doc, AST["date"], "date")


# ----------------------------------------------------------------------------
# 主流程
# ----------------------------------------------------------------------------
def main():
    doc = Document()
    set_default_fonts(doc)
    sec = setup_page(doc)
    build_page_number(sec)

    build_red_header(doc)

    if AST.get("red_header_org") or CFG["red_header"].get("enabled"):
        # 红线与标题之间留一空行
        st = CFG["styles"]["body"]
        p = doc.add_paragraph()
        apply_para_format(p, st)

    build_body(doc)

    doc.save("output.docx")


if __name__ == "__main__":
    main()

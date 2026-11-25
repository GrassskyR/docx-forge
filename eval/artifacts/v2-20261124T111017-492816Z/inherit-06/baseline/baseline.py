# -*- coding: utf-8 -*-
"""按目标格式 GB/T 9704-2012 与正文 AST 生成 output.docx（python-docx / lxml）。"""

from docx import Document
from docx.shared import Pt, Mm, RGBColor, Twips
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

OUTPUT_PATH = "output.docx"

# ---------------------------------------------------------------- 目标格式配置
PAGE_CFG = {
    "width_mm": 210.0,
    "height_mm": 297.0,
    "margin_top_mm": 30.0,
    "margin_bottom_mm": 35.0,
    "margin_left_mm": 28.0,
    "margin_right_mm": 26.0,
    "show_page_number": True,
}

RED_HEADER_CFG = {
    "enabled": False,
    "font_cn": "方正小标宋简体",
    "font_en": "Times New Roman",
    "font_size_pt": 36.0,
    "color_hex": "FF0000",
    "has_red_line": True,
    "doc_number_font_cn": "仿宋_GB2312",
    "doc_number_font_en": "Times New Roman",
    "doc_number_size_pt": 16.0,
    "line_pt": 52.0,
}

STYLES = {
    "title": {
        "font_cn": "黑体", "font_en": "Times New Roman", "font_size_pt": 24.0,
        "bold": False, "italic": False, "color_hex": "000000",
        "alignment": "right", "line_spacing_rule": "exact",
        "line_spacing_value": 28.0, "first_line_indent_chars": 0.0,
        "space_before_pt": 0.0, "space_after_pt": 0.0,
    },
    "heading_1": {
        "font_cn": "黑体", "font_en": "Times New Roman", "font_size_pt": 16.0,
        "bold": False, "italic": False, "color_hex": "000000",
        "alignment": "justify", "line_spacing_rule": "exact",
        "line_spacing_value": 28.0, "first_line_indent_chars": 2.0,
        "space_before_pt": 0.0, "space_after_pt": 0.0,
    },
    "heading_2": {
        "font_cn": "楷体_GB2312", "font_en": "Times New Roman", "font_size_pt": 16.0,
        "bold": False, "italic": False, "color_hex": "000000",
        "alignment": "justify", "line_spacing_rule": "exact",
        "line_spacing_value": 28.0, "first_line_indent_chars": 2.0,
        "space_before_pt": 0.0, "space_after_pt": 0.0,
    },
    "heading_3": {
        "font_cn": "仿宋_GB2312", "font_en": "Times New Roman", "font_size_pt": 16.0,
        "bold": False, "italic": False, "color_hex": "000000",
        "alignment": "justify", "line_spacing_rule": "exact",
        "line_spacing_value": 28.0, "first_line_indent_chars": 2.0,
        "space_before_pt": 0.0, "space_after_pt": 0.0,
    },
    "body": {
        "font_cn": "宋体", "font_en": "Times New Roman", "font_size_pt": 14.0,
        "bold": False, "italic": False, "color_hex": "000000",
        "alignment": "justify", "line_spacing_rule": "exact",
        "line_spacing_value": 24.0, "first_line_indent_chars": 3.0,
        "space_before_pt": 0.0, "space_after_pt": 0.0,
    },
    "recipient": {
        "font_cn": "仿宋_GB2312", "font_en": "Times New Roman", "font_size_pt": 16.0,
        "bold": False, "italic": False, "color_hex": "000000",
        "alignment": "left", "line_spacing_rule": "exact",
        "line_spacing_value": 28.0, "first_line_indent_chars": 0.0,
        "space_before_pt": 0.0, "space_after_pt": 0.0,
    },
    "signature": {
        "font_cn": "仿宋_GB2312", "font_en": "Times New Roman", "font_size_pt": 16.0,
        "bold": False, "italic": False, "color_hex": "000000",
        "alignment": "right", "line_spacing_rule": "exact",
        "line_spacing_value": 28.0, "first_line_indent_chars": 0.0,
        "space_before_pt": 0.0, "space_after_pt": 0.0,
    },
    "date": {
        "font_cn": "仿宋_GB2312", "font_en": "Times New Roman", "font_size_pt": 16.0,
        "bold": False, "italic": False, "color_hex": "000000",
        "alignment": "right", "line_spacing_rule": "exact",
        "line_spacing_value": 28.0, "first_line_indent_chars": 0.0,
        "space_before_pt": 0.0, "space_after_pt": 0.0,
    },
}

# ---------------------------------------------------------------- 正文 AST
AST = {
    "doc_type": "notice",
    "red_header_org": "综合办公室",
    "doc_number": "综办〔2026〕12号",
    "title": "关于开展档案归档检查的通知",
    "recipient": "各部门：",
    "blocks": [
        {"type": "heading_1", "text": "一、检查安排", "rows": None},
        {"type": "body", "text": "请各部门核对纸质与电子档案目录，整理归档清单并反馈检查结果。", "rows": None},
    ],
    "attachments": [],
    "signature": "综合办公室",
    "date": "2026年11月24日",
}

ALIGN_MAP = {
    "left": WD_ALIGN_PARAGRAPH.LEFT,
    "right": WD_ALIGN_PARAGRAPH.RIGHT,
    "center": WD_ALIGN_PARAGRAPH.CENTER,
    "justify": WD_ALIGN_PARAGRAPH.JUSTIFY,
    "both": WD_ALIGN_PARAGRAPH.JUSTIFY,
}


# ---------------------------------------------------------------- 工具函数
def set_run_font(run, font_cn, font_en, size_pt, bold=False, italic=False,
                 color_hex="000000"):
    """显式写入 eastAsia / ascii / hAnsi / cs 以及 sz / szCs。"""
    run.font.size = Pt(float(size_pt))
    run.font.bold = bool(bold)
    run.font.italic = bool(italic)
    run.font.name = font_en                     # 写 ascii + hAnsi
    run.font.color.rgb = RGBColor.from_string(color_hex)

    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.rFonts
    if rFonts is None:
        rFonts = OxmlElement("w:rFonts")
        rPr.insert(0, rFonts)
    rFonts.set(qn("w:eastAsia"), font_cn)
    rFonts.set(qn("w:ascii"), font_en)
    rFonts.set(qn("w:hAnsi"), font_en)
    rFonts.set(qn("w:cs"), font_en)

    sz_val = str(int(round(float(size_pt) * 2)))
    szCs = rPr.find(qn("w:szCs"))
    if szCs is None:
        szCs = OxmlElement("w:szCs")
        sz = rPr.find(qn("w:sz"))
        if sz is not None:
            sz.addnext(szCs)
        else:
            rPr.append(szCs)
    szCs.set(qn("w:val"), sz_val)


def set_para_format(paragraph, cfg):
    """对齐、段前段后、行距、首行缩进（firstLineChars + firstLine）。"""
    pf = paragraph.paragraph_format

    align = (cfg.get("alignment") or "justify").lower()
    pf.alignment = ALIGN_MAP.get(align, WD_ALIGN_PARAGRAPH.JUSTIFY)

    sb = cfg.get("space_before_pt")
    sa = cfg.get("space_after_pt")
    pf.space_before = Pt(float(sb) if sb is not None else 0.0)
    pf.space_after = Pt(float(sa) if sa is not None else 0.0)

    ls_value = cfg.get("line_spacing_value")
    ls_rule = (cfg.get("line_spacing_rule") or "exact").lower()
    if ls_value is not None:
        if ls_rule in ("exact", "atleast"):
            pf.line_spacing = Pt(float(ls_value))
            if ls_rule == "atleast":
                pPr = paragraph._p.get_or_add_pPr()
                spacing = pPr.find(qn("w:spacing"))
                if spacing is not None:
                    spacing.set(qn("w:lineRule"), "atLeast")
        else:
            pf.line_spacing = float(ls_value)

    chars = cfg.get("first_line_indent_chars") or 0.0
    size_pt = float(cfg.get("font_size_pt") or 16.0)

    pf.left_indent = Pt(0)
    pf.right_indent = Pt(0)
    # firstLine = 字符数 × 字号(磅) × 20 (twips)
    pf.first_line_indent = Twips(int(round(float(chars) * size_pt * 20)))

    pPr = paragraph._p.get_or_add_pPr()
    ind = pPr.find(qn("w:ind"))
    if ind is not None:
        # firstLineChars = 字符数 × 100
        ind.set(qn("w:firstLineChars"), str(int(round(float(chars) * 100))))


def set_bottom_border(paragraph, color_hex="FF0000", size_eighth_pt=12, space=1):
    """红色段落下边框（红头红线）。"""
    pPr = paragraph._p.get_or_add_pPr()
    pBdr = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), str(int(size_eighth_pt)))
    bottom.set(qn("w:space"), str(int(space)))
    bottom.set(qn("w:color"), color_hex)
    pBdr.append(bottom)
    pPr.insert_element_before(
        pBdr,
        "w:shd", "w:tabs", "w:suppressAutoHyphens", "w:kinsoku", "w:wordWrap",
        "w:overflowPunct", "w:topLinePunct", "w:autoSpaceDE", "w:autoSpaceDN",
        "w:bidi", "w:adjustRightInd", "w:snapToGrid", "w:spacing", "w:ind",
        "w:contextualSpacing", "w:mirrorIndents", "w:suppressOverlap", "w:jc",
        "w:textDirection", "w:textAlignment", "w:textboxTightWrap",
        "w:outlineLvl", "w:divId", "w:cnfStyle", "w:rPr", "w:sectPr",
        "w:pPrChange",
    )


def add_text_paragraph(doc, text, style_key, style_override=None):
    cfg = dict(STYLES[style_key])
    if style_override:
        cfg.update(style_override)
    p = doc.add_paragraph()
    set_para_format(p, cfg)
    run = p.add_run(text)
    set_run_font(
        run,
        cfg.get("font_cn", "宋体"),
        cfg.get("font_en", "Times New Roman"),
        cfg.get("font_size_pt", 16.0),
        cfg.get("bold", False),
        cfg.get("italic", False),
        cfg.get("color_hex", "000000"),
    )
    return p


def add_blank_line(doc, line_pt=28.0, size_pt=16.0):
    cfg = {
        "alignment": "left",
        "space_before_pt": 0.0,
        "space_after_pt": 0.0,
        "line_spacing_rule": "exact",
        "line_spacing_value": float(line_pt),
        "first_line_indent_chars": 0.0,
        "font_cn": "仿宋_GB2312",
        "font_en": "Times New Roman",
        "font_size_pt": float(size_pt),
    }
    p = doc.add_paragraph()
    set_para_format(p, cfg)
    run = p.add_run("")
    set_run_font(run, cfg["font_cn"], cfg["font_en"], cfg["font_size_pt"])
    return p


def add_page_number_field(footer, font_cn="宋体", font_en="Times New Roman",
                          size_pt=14.0):
    p = footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    pf = p.paragraph_format
    pf.space_before = Pt(0)
    pf.space_after = Pt(0)
    pf.line_spacing = Pt(float(size_pt))
    pf.first_line_indent = Twips(0)

    r1 = p.add_run("— ")
    set_run_font(r1, font_cn, font_en, size_pt)

    run = p.add_run()
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
    set_run_font(run, font_cn, font_en, size_pt)

    r2 = p.add_run(" —")
    set_run_font(r2, font_cn, font_en, size_pt)


# ---------------------------------------------------------------- 构建文档
def build_document():
    doc = Document()

    # ---- 页面设置
    section = doc.sections[0]
    section.page_width = Mm(PAGE_CFG["width_mm"])
    section.page_height = Mm(PAGE_CFG["height_mm"])
    section.top_margin = Mm(PAGE_CFG["margin_top_mm"])
    section.bottom_margin = Mm(PAGE_CFG["margin_bottom_mm"])
    section.left_margin = Mm(PAGE_CFG["margin_left_mm"])
    section.right_margin = Mm(PAGE_CFG["margin_right_mm"])
    section.header_distance = Mm(15.0)
    section.footer_distance = Mm(20.0)

    # ---- 默认（Normal）样式
    normal = doc.styles["Normal"]
    normal.font.name = "Times New Roman"
    normal.font.size = Pt(16)
    n_rPr = normal.element.get_or_add_rPr()
    n_rFonts = n_rPr.rFonts
    if n_rFonts is None:
        n_rFonts = OxmlElement("w:rFonts")
        n_rPr.insert(0, n_rFonts)
    n_rFonts.set(qn("w:eastAsia"), "仿宋_GB2312")
    n_rFonts.set(qn("w:ascii"), "Times New Roman")
    n_rFonts.set(qn("w:hAnsi"), "Times New Roman")
    n_rFonts.set(qn("w:cs"), "Times New Roman")
    normal.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    normal.paragraph_format.space_before = Pt(0)
    normal.paragraph_format.space_after = Pt(0)
    normal.paragraph_format.line_spacing = Pt(28)

    # ---- 页码（PAGE 域）
    if PAGE_CFG["show_page_number"]:
        add_page_number_field(section.footer)

    red_org = AST.get("red_header_org")           # 红头机关优先取 AST
    doc_number = AST.get("doc_number")
    title = AST.get("title")
    recipient = AST.get("recipient")

    # ---- 红头（机关名称）
    if red_org:
        p = doc.add_paragraph()
        cfg = {
            "alignment": "center",
            "space_before_pt": 0.0,
            "space_after_pt": 0.0,
            "line_spacing_rule": "exact",
            "line_spacing_value": RED_HEADER_CFG["line_pt"],
            "first_line_indent_chars": 0.0,
            "font_size_pt": RED_HEADER_CFG["font_size_pt"],
        }
        set_para_format(p, cfg)
        run = p.add_run(red_org)
        set_run_font(
            run,
            RED_HEADER_CFG["font_cn"],
            RED_HEADER_CFG["font_en"],
            RED_HEADER_CFG["font_size_pt"],
            bold=False,
            italic=False,
            color_hex=RED_HEADER_CFG["color_hex"],
        )

    # ---- 发文字号 + 红色分隔线（段落下边框）
    if doc_number:
        p = doc.add_paragraph()
        cfg = {
            "alignment": "center",
            "space_before_pt": 0.0,
            "space_after_pt": 0.0,
            "line_spacing_rule": "exact",
            "line_spacing_value": 28.0,
            "first_line_indent_chars": 0.0,
            "font_size_pt": RED_HEADER_CFG["doc_number_size_pt"],
        }
        set_para_format(p, cfg)
        run = p.add_run(doc_number)
        set_run_font(
            run,
            RED_HEADER_CFG["doc_number_font_cn"],
            RED_HEADER_CFG["doc_number_font_en"],
            RED_HEADER_CFG["doc_number_size_pt"],
            color_hex="000000",
        )
        if RED_HEADER_CFG["has_red_line"]:
            set_bottom_border(
                p,
                color_hex=RED_HEADER_CFG["color_hex"],
                size_eighth_pt=12,
                space=1,
            )
        add_blank_line(doc, line_pt=28.0, size_pt=16.0)

    # ---- 标题
    if title:
        add_text_paragraph(doc, title, "title")

    # ---- 主送机关
    if recipient:
        add_text_paragraph(doc, recipient, "recipient")

    # ---- 正文块
    for block in AST.get("blocks") or []:
        btype = block.get("type")
        text = block.get("text") or ""
        if btype == "heading_1":
            add_text_paragraph(doc, text, "heading_1")
        elif btype == "heading_2":
            add_text_paragraph(doc, text, "heading_2")
        elif btype == "heading_3":
            add_text_paragraph(doc, text, "heading_3")
        elif btype == "body":
            add_text_paragraph(doc, text, "body")
        elif btype == "recipient":
            add_text_paragraph(doc, text, "recipient")
        else:
            add_text_paragraph(doc, text, "body")

    # ---- 附件说明
    attachments = AST.get("attachments") or []
    if attachments:
        for i, item in enumerate(attachments):
            cfg = dict(STYLES["body"])
            cfg["first_line_indent_chars"] = 0.0
            prefix = "附件：" if i == 0 else "　　　"
            p = doc.add_paragraph()
            set_para_format(p, cfg)
            run = p.add_run(prefix + str(item))
            set_run_font(run, cfg["font_cn"], cfg["font_en"], cfg["font_size_pt"])

    # ---- 落款与成文日期
    add_blank_line(doc, line_pt=28.0, size_pt=16.0)
    signature = AST.get("signature")
    date_text = AST.get("date")
    if signature:
        add_text_paragraph(doc, signature, "signature")
    if date_text:
        add_text_paragraph(doc, date_text, "date")

    doc.save(OUTPUT_PATH)
    return OUTPUT_PATH


if __name__ == "__main__":
    build_document()

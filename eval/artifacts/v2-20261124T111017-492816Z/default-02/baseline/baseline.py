# -*- coding: utf-8 -*-
"""
生成 GB/T 9704-2012 国标公文 Word 文档 (output.docx)
依赖：python-docx (lxml)
"""

from docx import Document
from docx.shared import Mm, Pt
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

# ---------------------------------------------------------------------------
# 配置
# ---------------------------------------------------------------------------
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
            "first_line_indent_chars": 0.0,
            "space_before_pt": 0.0, "space_after_pt": 0.0,
        },
        "heading_1": {
            "font_cn": "黑体", "font_en": "Times New Roman",
            "font_size_pt": 16.0, "bold": False, "italic": False,
            "color_hex": "000000", "alignment": "justify",
            "line_spacing_rule": "exact", "line_spacing_value": 28.0,
            "first_line_indent_chars": 2.0,
            "space_before_pt": 0.0, "space_after_pt": 0.0,
        },
        "heading_2": {
            "font_cn": "楷体_GB2312", "font_en": "Times New Roman",
            "font_size_pt": 16.0, "bold": False, "italic": False,
            "color_hex": "000000", "alignment": "justify",
            "line_spacing_rule": "exact", "line_spacing_value": 28.0,
            "first_line_indent_chars": 2.0,
            "space_before_pt": 0.0, "space_after_pt": 0.0,
        },
        "heading_3": {
            "font_cn": "仿宋_GB2312", "font_en": "Times New Roman",
            "font_size_pt": 16.0, "bold": False, "italic": False,
            "color_hex": "000000", "alignment": "justify",
            "line_spacing_rule": "exact", "line_spacing_value": 28.0,
            "first_line_indent_chars": 2.0,
            "space_before_pt": 0.0, "space_after_pt": 0.0,
        },
        "body": {
            "font_cn": "仿宋_GB2312", "font_en": "Times New Roman",
            "font_size_pt": 12.0, "bold": False, "italic": False,
            "color_hex": "000000", "alignment": "justify",
            "line_spacing_rule": "exact", "line_spacing_value": 28.0,
            "first_line_indent_chars": 2.0,
            "space_before_pt": 0.0, "space_after_pt": 0.0,
        },
        "recipient": {
            "font_cn": "仿宋_GB2312", "font_en": "Times New Roman",
            "font_size_pt": 16.0, "bold": False, "italic": False,
            "color_hex": "000000", "alignment": "left",
            "line_spacing_rule": "exact", "line_spacing_value": 28.0,
            "first_line_indent_chars": 0.0,
            "space_before_pt": 0.0, "space_after_pt": 0.0,
        },
        "signature": {
            "font_cn": "仿宋_GB2312", "font_en": "Times New Roman",
            "font_size_pt": 16.0, "bold": False, "italic": False,
            "color_hex": "000000", "alignment": "right",
            "line_spacing_rule": "exact", "line_spacing_value": 28.0,
            "first_line_indent_chars": 0.0,
            "space_before_pt": 0.0, "space_after_pt": 0.0,
        },
        "date": {
            "font_cn": "仿宋_GB2312", "font_en": "Times New Roman",
            "font_size_pt": 16.0, "bold": False, "italic": False,
            "color_hex": "000000", "alignment": "right",
            "line_spacing_rule": "exact", "line_spacing_value": 28.0,
            "first_line_indent_chars": 0.0,
            "space_before_pt": 0.0, "space_after_pt": 0.0,
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
    "justify": "both", "both": "both",
    "left": "left", "start": "left",
    "right": "right", "end": "right",
    "center": "center",
}


# ---------------------------------------------------------------------------
# 底层 XML 构造
# ---------------------------------------------------------------------------
def _make_ppr_xml(alignment, before_pt, after_pt, line_rule, line_val_pt,
                  indent_chars, font_size_pt, border=None):
    """构造 w:pPr 子元素序列（顺序符合 OOXML schema）"""
    pPr = OxmlElement("w:pPr")
    if border:
        pBdr = OxmlElement("w:pBdr")
        bottom = OxmlElement("w:bottom")
        bottom.set(qn("w:val"), "single")
        bottom.set(qn("w:sz"), str(int(border.get("sz", 12))))
        bottom.set(qn("w:space"), str(int(border.get("space", 1))))
        bottom.set(qn("w:color"), border.get("color", "FF0000"))
        pBdr.append(bottom)
        pPr.append(pBdr)

    spacing = OxmlElement("w:spacing")
    spacing.set(qn("w:before"), str(int(round(before_pt * 20))))
    spacing.set(qn("w:after"), str(int(round(after_pt * 20))))
    spacing.set(qn("w:beforeAutospacing"), "0")
    spacing.set(qn("w:afterAutospacing"), "0")
    spacing.set(qn("w:line"), str(int(round(line_val_pt * 20))))
    spacing.set(qn("w:lineRule"), "exact" if line_rule == "exact" else "auto")
    pPr.append(spacing)

    ind = OxmlElement("w:ind")
    ind.set(qn("w:firstLineChars"), str(int(round(indent_chars * 100))))
    ind.set(qn("w:firstLine"),
            str(int(round(indent_chars * font_size_pt * 20))))
    pPr.append(ind)

    jc = OxmlElement("w:jc")
    jc.set(qn("w:val"), ALIGN_MAP.get(alignment, "both"))
    pPr.append(jc)

    return pPr


def _make_rpr_xml(font_cn, font_en, size_pt, bold, italic, color_hex):
    """构造 w:rPr（显式 eastAsia/ascii/hAnsi/cs + sz/szCs）"""
    rPr = OxmlElement("w:rPr")

    rFonts = OxmlElement("w:rFonts")
    rFonts.set(qn("w:ascii"), font_en)
    rFonts.set(qn("w:hAnsi"), font_en)
    rFonts.set(qn("w:eastAsia"), font_cn)
    rFonts.set(qn("w:cs"), font_en)
    rPr.append(rFonts)

    for tag in ("w:b", "w:bCs", "w:i", "w:iCs"):
        el = OxmlElement(tag)
        el.set(qn("w:val"), "1" if (bold if "b" in tag else italic) else "0")
        rPr.append(el)

    color = OxmlElement("w:color")
    color.set(qn("w:val"), color_hex)
    rPr.append(color)

    half = str(int(round(size_pt * 2)))
    sz = OxmlElement("w:sz")
    sz.set(qn("w:val"), half)
    rPr.append(sz)
    szCs = OxmlElement("w:szCs")
    szCs.set(qn("w:val"), half)
    rPr.append(szCs)

    return rPr


# ---------------------------------------------------------------------------
# 文档级操作
# ---------------------------------------------------------------------------
doc = Document()

# ---------- 页面设置 ----------
section = doc.sections[0]
section.page_width = Mm(210)
section.page_height = Mm(297)
section.top_margin = Mm(CFG["page"]["margin_top_mm"])
section.bottom_margin = Mm(CFG["page"]["margin_bottom_mm"])
section.left_margin = Mm(CFG["page"]["margin_left_mm"])
section.right_margin = Mm(CFG["page"]["margin_right_mm"])
section.header_distance = Mm(15)
section.footer_distance = Mm(20)


def add_paragraph_style(style_id, cfg, border=None,
                        line_val_pt=None, align=None, space_before=None,
                        space_after=None):
    """向 styles.xml 注入段落样式"""
    line_val = cfg["line_spacing_value"] if line_val_pt is None else line_val_pt
    pPr = _make_ppr_xml(
        align or cfg["alignment"],
        cfg["space_before_pt"] if space_before is None else space_before,
        cfg["space_after_pt"] if space_after is None else space_after,
        cfg["line_spacing_rule"], line_val,
        cfg["first_line_indent_chars"], cfg["font_size_pt"], border,
    )
    rPr = _make_rpr_xml(
        cfg["font_cn"], cfg["font_en"], cfg["font_size_pt"],
        cfg["bold"], cfg["italic"], cfg["color_hex"],
    )

    style = OxmlElement("w:style")
    style.set(qn("w:type"), "paragraph")
    style.set(qn("w:styleId"), style_id)

    name = OxmlElement("w:name")
    name.set(qn("w:val"), style_id)
    style.append(name)

    based = OxmlElement("w:basedOn")
    based.set(qn("w:val"), "Normal")
    style.append(based)

    style.append(OxmlElement("w:qFormat"))
    style.append(pPr)
    style.append(rPr)

    doc.styles.element.append(style)


# 注册所有使用的角色样式
for _sid in ("title", "heading_1", "heading_2", "heading_3",
             "body", "recipient", "signature", "date"):
    add_paragraph_style("gw_" + _sid, CFG["styles"][_sid])

RED = CFG["red_header"]

_red_header_cfg = {
    "font_cn": RED["font_cn"], "font_en": "Times New Roman",
    "font_size_pt": RED["font_size_pt"], "bold": False, "italic": False,
    "color_hex": RED["color_hex"], "alignment": "center",
    "line_spacing_rule": "exact", "line_spacing_value": 48.0,
    "first_line_indent_chars": 0.0,
    "space_before_pt": 0.0, "space_after_pt": 0.0,
}
add_paragraph_style("gw_red_header", _red_header_cfg)

_doc_number_cfg = {
    "font_cn": RED["doc_number_font_cn"], "font_en": "Times New Roman",
    "font_size_pt": RED["doc_number_size_pt"], "bold": False, "italic": False,
    "color_hex": "000000", "alignment": "center",
    "line_spacing_rule": "exact", "line_spacing_value": 28.0,
    "first_line_indent_chars": 0.0,
    "space_before_pt": 0.0, "space_after_pt": 0.0,
}
add_paragraph_style("gw_doc_number", _doc_number_cfg)

_red_line_cfg = {
    "font_cn": "仿宋_GB2312", "font_en": "Times New Roman",
    "font_size_pt": 10.0, "bold": False, "italic": False,
    "color_hex": RED["color_hex"], "alignment": "center",
    "line_spacing_rule": "exact", "line_spacing_value": 10.0,
    "first_line_indent_chars": 0.0,
    "space_before_pt": 0.0, "space_after_pt": 0.0,
}
add_paragraph_style("gw_red_line", _red_line_cfg,
                    border={"color": RED["color_hex"], "sz": 12, "space": 1})


# ---------------------------------------------------------------------------
# 段落 / 运行格式化
# ---------------------------------------------------------------------------
def set_pstyle(paragraph, style_id):
    pPr = paragraph._p.get_or_add_pPr()
    for el in pPr.findall(qn("w:pStyle")):
        pPr.remove(el)
    pStyle = OxmlElement("w:pStyle")
    pStyle.set(qn("w:val"), style_id)
    pPr.insert(0, pStyle)


def fmt_paragraph(paragraph, alignment, before_pt, after_pt,
                  line_rule, line_val_pt, indent_chars, font_size_pt,
                  border=None):
    pPr = paragraph._p.get_or_add_pPr()
    for tag in ("w:pBdr", "w:spacing", "w:ind", "w:jc"):
        for el in pPr.findall(qn(tag)):
            pPr.remove(el)
    new_ppr = _make_ppr_xml(alignment, before_pt, after_pt, line_rule,
                            line_val_pt, indent_chars, font_size_pt, border)
    for child in list(new_ppr):
        pPr.append(child)


def fmt_run(run, font_cn, font_en, size_pt, bold, italic, color_hex):
    rPr = run._r.get_or_add_rPr()
    for tag in ("w:rFonts", "w:b", "w:bCs", "w:i", "w:iCs",
                "w:color", "w:sz", "w:szCs"):
        for el in rPr.findall(qn(tag)):
            rPr.remove(el)
    new_rpr = _make_rpr_xml(font_cn, font_en, size_pt, bold, italic, color_hex)
    for child in list(new_rpr):
        rPr.append(child)


def render(text, cfg, style_id, border=None):
    p = doc.add_paragraph()
    set_pstyle(p, style_id)

    run = p.add_run(text if text is not None else "")
    fmt_run(run, cfg["font_cn"], cfg["font_en"], cfg["font_size_pt"],
            cfg["bold"], cfg["italic"], cfg["color_hex"])

    fmt_paragraph(p, cfg["alignment"],
                  cfg["space_before_pt"], cfg["space_after_pt"],
                  cfg["line_spacing_rule"], cfg["line_spacing_value"],
                  cfg["first_line_indent_chars"], cfg["font_size_pt"],
                  border)
    return p


def add_field(run, instr, placeholder="1"):
    r = run._r
    fld_begin = OxmlElement("w:fldChar")
    fld_begin.set(qn("w:fldCharType"), "begin")
    r.append(fld_begin)

    instr_el = OxmlElement("w:instrText")
    instr_el.set(qn("xml:space"), "preserve")
    instr_el.text = instr
    r.append(instr_el)

    fld_sep = OxmlElement("w:fldChar")
    fld_sep.set(qn("w:fldCharType"), "separate")
    r.append(fld_sep)

    t = OxmlElement("w:t")
    t.set(qn("xml:space"), "preserve")
    t.text = placeholder
    r.append(t)

    fld_end = OxmlElement("w:fldChar")
    fld_end.set(qn("w:fldCharType"), "end")
    r.append(fld_end)


# ---------------------------------------------------------------------------
# 版头：发文机关标志（红头） + 发文字号 + 红色分隔线
# ---------------------------------------------------------------------------
org_name = AST.get("red_header_org") or (RED["org_name"] if RED["enabled"] else None)

if org_name:
    render(org_name, _red_header_cfg, "gw_red_header")

if AST.get("doc_number"):
    render(AST["doc_number"], _doc_number_cfg, "gw_doc_number")

if RED["has_red_line"] and org_name:
    p = doc.add_paragraph()
    set_pstyle(p, "gw_red_line")
    spacer = p.add_run(" ")
    fmt_run(spacer, "仿宋_GB2312", "Times New Roman", 10.0,
            False, False, RED["color_hex"])
    fmt_paragraph(p, "center", 0.0, 0.0, "exact", 10.0, 0.0, 10.0,
                  border={"color": RED["color_hex"], "sz": 12, "space": 1})


# ---------------------------------------------------------------------------
# 标题
# ---------------------------------------------------------------------------
if AST.get("title"):
    render(AST["title"], CFG["styles"]["title"], "gw_title")


# ---------------------------------------------------------------------------
# 主送机关
# ---------------------------------------------------------------------------
if AST.get("recipient"):
    render(AST["recipient"], CFG["styles"]["recipient"], "gw_recipient")


# ---------------------------------------------------------------------------
# 正文
# ---------------------------------------------------------------------------
BLOCK_STYLE = {
    "heading_1": ("heading_1", "gw_heading_1"),
    "heading_2": ("heading_2", "gw_heading_2"),
    "heading_3": ("heading_3", "gw_heading_3"),
    "body": ("body", "gw_body"),
}

for block in AST.get("blocks", []):
    btype = block.get("type")
    text = block.get("text") or ""
    if btype in BLOCK_STYLE:
        key, sid = BLOCK_STYLE[btype]
        render(text, CFG["styles"][key], sid)
    elif block.get("rows"):
        for row in block["rows"]:
            render(str(row), CFG["styles"]["body"], "gw_body")


# ---------------------------------------------------------------------------
# 附件
# ---------------------------------------------------------------------------
attachments = AST.get("attachments") or []
if attachments:
    body_cfg = CFG["styles"]["body"]
    for idx, att in enumerate(attachments, start=1):
        name = att.get("name") if isinstance(att, dict) else str(att)
        render("附件%d：%s" % (idx, name), body_cfg, "gw_body")


# ---------------------------------------------------------------------------
# 落款与成文日期
# ---------------------------------------------------------------------------
if AST.get("signature"):
    render(AST["signature"], CFG["styles"]["signature"], "gw_signature")

if AST.get("date"):
    render(AST["date"], CFG["styles"]["date"], "gw_date")


# ---------------------------------------------------------------------------
# 页码（PAGE 域）
# ---------------------------------------------------------------------------
if CFG["page"]["show_page_number"]:
    footer = section.footer
    footer.is_linked_to_previous = False
    fp = footer.paragraphs[0]

    set_pstyle(fp, "Normal") if False else None

    fmt_paragraph(fp, "center", 0.0, 0.0, "exact", 14.0, 0.0, 14.0)

    r1 = fp.add_run("— ")
    fmt_run(r1, "宋体", "Times New Roman", 14.0, False, False, "000000")

    r2 = fp.add_run()
    fmt_run(r2, "宋体", "Times New Roman", 14.0, False, False, "000000")
    add_field(r2, " PAGE ")

    r3 = fp.add_run(" —")
    fmt_run(r3, "宋体", "Times New Roman", 14.0, False, False, "000000")


# ---------------------------------------------------------------------------
# 保存
# ---------------------------------------------------------------------------
doc.save("output.docx")

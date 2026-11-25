# -*- coding: utf-8 -*-
"""生成 GB/T 9704-2012 国标公文 output.docx"""

from docx import Document
from docx.shared import Mm
from docx.enum.style import WD_STYLE_TYPE
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

# ----------------------------------------------------------------------------
# 目标格式配置
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
            "font_cn": "宋体", "font_en": "Times New Roman",
            "font_size_pt": 12.0, "bold": False, "italic": False,
            "color_hex": "000000", "alignment": "justify",
            "line_spacing_rule": "exact", "line_spacing_value": 24.0,
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

# 正文 AST
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

# 样式标识
STYLE_ID = {
    "gw_title": "gw_title",
    "gw_heading_1": "gw_heading_1",
    "gw_heading_2": "gw_heading_2",
    "gw_heading_3": "gw_heading_3",
    "gw_body": "gw_body",
    "gw_recipient": "gw_recipient",
    "gw_signature": "gw_signature",
    "gw_date": "gw_date",
    "gw_doc_number": "gw_doc_number",
    "gw_red_header": "gw_red_header",
    "gw_red_line": "gw_red_line",
    "gw_page_number": "gw_page_number",
}

# 附加样式定义（红头 / 红线 / 页码）
EXTRA_STYLES = {
    "gw_red_header": {
        "font_cn": CFG["red_header"]["font_cn"], "font_en": "Times New Roman",
        "font_size_pt": CFG["red_header"]["font_size_pt"],
        "bold": False, "italic": False,
        "color_hex": CFG["red_header"]["color_hex"], "alignment": "center",
        "line_spacing_rule": "exact", "line_spacing_value": 44.0,
        "first_line_indent_chars": 0.0,
        "space_before_pt": 0.0, "space_after_pt": 0.0,
    },
    "gw_doc_number": {
        "font_cn": CFG["red_header"]["doc_number_font_cn"], "font_en": "Times New Roman",
        "font_size_pt": CFG["red_header"]["doc_number_size_pt"],
        "bold": False, "italic": False,
        "color_hex": "000000", "alignment": "center",
        "line_spacing_rule": "exact", "line_spacing_value": 28.0,
        "first_line_indent_chars": 0.0,
        "space_before_pt": 0.0, "space_after_pt": 0.0,
    },
    "gw_red_line": {
        "font_cn": "宋体", "font_en": "Times New Roman",
        "font_size_pt": 12.0, "bold": False, "italic": False,
        "color_hex": "000000", "alignment": "justify",
        "line_spacing_rule": "exact", "line_spacing_value": 24.0,
        "first_line_indent_chars": 0.0,
        "space_before_pt": 0.0, "space_after_pt": 0.0,
    },
    "gw_page_number": {
        "font_cn": "宋体", "font_en": "Times New Roman",
        "font_size_pt": 14.0, "bold": False, "italic": False,
        "color_hex": "000000", "alignment": "center",
        "line_spacing_rule": "exact", "line_spacing_value": 20.0,
        "first_line_indent_chars": 0.0,
        "space_before_pt": 0.0, "space_after_pt": 0.0,
    },
}

PPR_ORDER = [
    "pStyle", "keepNext", "keepLines", "pageBreakBefore", "framePr",
    "widowControl", "numPr", "suppressLineNumbers", "pBdr", "shd", "tabs",
    "suppressAutoHyphens", "kinsoku", "wordWrap", "overflowPunct",
    "topLinePunct", "autoSpaceDE", "autoSpaceDN", "bidi", "adjustRightInd",
    "snapToGrid", "spacing", "ind", "contextualSpacing", "mirrorIndents",
    "suppressOverlap", "jc", "textDirection", "textAlignment",
    "textboxTightWrap", "outlineLvl", "divId", "cnfStyle", "rPr", "sectPr",
    "pPrChange",
]

STYLE_ORDER = [
    "name", "aliases", "basedOn", "next", "link", "autoRedefine", "hidden",
    "uiPriority", "semiHidden", "unhideWhenUsed", "qFormat", "locked",
    "personal", "personalCompose", "personalReply", "rsid", "pPr", "rPr",
    "tblPr", "trPr", "tcPr", "tblStylePr",
]


def new_el(tag, attrs=()):
    el = OxmlElement(tag)
    for key, val in attrs:
        el.set(qn(key), str(val))
    return el


def reorder(parent, order):
    children = list(parent)
    def key(child):
        tag = child.tag.split("}")[-1]
        return order.index(tag) if tag in order else len(order)
    ordered = sorted(children, key=key)
    for child in children:
        parent.remove(child)
    for child in ordered:
        parent.append(child)


def get_or_make(parent, tag):
    el = parent.find(qn(tag))
    if el is None:
        el = OxmlElement(tag)
        parent.append(el)
    return el


# ----------------------------------------------------------------------------
# 字体 / 段落属性构建
# ----------------------------------------------------------------------------
def set_rpr(rpr, spec):
    for child in list(rpr):
        rpr.remove(child)

    rfonts = new_el("w:rFonts", [
        ("w:ascii", spec["font_en"]),
        ("w:hAnsi", spec["font_en"]),
        ("w:eastAsia", spec["font_cn"]),
        ("w:cs", spec["font_en"]),
    ])
    rpr.append(rfonts)

    half_pt = str(int(round(spec["font_size_pt"] * 2)))

    rpr.append(new_el("w:b", [("w:val", "1" if spec["bold"] else "0")]))
    rpr.append(new_el("w:bCs", [("w:val", "1" if spec["bold"] else "0")]))
    rpr.append(new_el("w:i", [("w:val", "1" if spec["italic"] else "0")]))
    rpr.append(new_el("w:iCs", [("w:val", "1" if spec["italic"] else "0")]))
    rpr.append(new_el("w:color", [("w:val", spec["color_hex"])]))
    rpr.append(new_el("w:sz", [("w:val", half_pt)]))
    rpr.append(new_el("w:szCs", [("w:val", half_pt)]))


def set_ppr(ppr, spec):
    for child in list(ppr):
        ppr.remove(child)

    spacing = new_el("w:spacing", [
        ("w:before", str(int(round(spec["space_before_pt"] * 20)))),
        ("w:after", str(int(round(spec["space_after_pt"] * 20)))),
        ("w:line", str(int(round(spec["line_spacing_value"] * 20)))),
        ("w:lineRule", "exact"),
    ])
    ppr.append(spacing)

    chars = spec["first_line_indent_chars"]
    ind = new_el("w:ind", [
        ("w:firstLineChars", str(int(round(chars * 100)))),
        ("w:firstLine", str(int(round(chars * spec["font_size_pt"] * 20)))),
    ])
    ppr.append(ind)

    align = spec["alignment"]
    if align == "justify":
        align = "both"
    ppr.append(new_el("w:jc", [("w:val", align)]))


def build_style(doc, style_id, spec):
    style = doc.styles.add_style(style_id, WD_STYLE_TYPE.PARAGRAPH)
    style.element.set(qn("w:styleId"), style_id)
    style.name = style_id
    try:
        style.base_style = doc.styles["Normal"]
    except KeyError:
        pass

    style_el = style.element

    old_p = style_el.find(qn("w:pPr"))
    if old_p is not None:
        style_el.remove(old_p)
    old_r = style_el.find(qn("w:rPr"))
    if old_r is not None:
        style_el.remove(old_r)

    ppr = OxmlElement("w:pPr")
    set_ppr(ppr, spec)
    style_el.append(ppr)

    rpr = OxmlElement("w:rPr")
    set_rpr(rpr, spec)
    style_el.append(rpr)

    reorder(style_el, STYLE_ORDER)
    return style


# ----------------------------------------------------------------------------
# 文档默认值 / 页面 / 页脚
# ----------------------------------------------------------------------------
def setup_doc_defaults(doc):
    styles_el = doc.styles.element
    dd = styles_el.find(qn("w:docDefaults"))
    if dd is None:
        dd = OxmlElement("w:docDefaults")
        styles_el.insert(0, dd)

    rpd = get_or_make(dd, "w:rPrDefault")
    rpr = get_or_make(rpd, "w:rPr")
    for child in list(rpr):
        rpr.remove(child)

    rpr.append(new_el("w:rFonts", [
        ("w:ascii", "Times New Roman"),
        ("w:hAnsi", "Times New Roman"),
        ("w:eastAsia", "宋体"),
        ("w:cs", "Times New Roman"),
    ]))
    rpr.append(new_el("w:sz", [("w:val", "24")]))
    rpr.append(new_el("w:szCs", [("w:val", "24")]))
    rpr.append(new_el("w:lang", [
        ("w:val", "en-US"), ("w:eastAsia", "zh-CN"), ("w:bidi", "ar-SA"),
    ]))

    ppd = get_or_make(dd, "w:pPrDefault")
    ppr = get_or_make(ppd, "w:pPr")
    for child in list(ppr):
        ppr.remove(child)
    ppr.append(new_el("w:spacing", [
        ("w:before", "0"), ("w:after", "0"),
        ("w:line", "240"), ("w:lineRule", "auto"),
    ]))


def setup_page(doc):
    sec = doc.sections[0]
    sec.page_width = Mm(210)
    sec.page_height = Mm(297)
    sec.top_margin = Mm(CFG["page"]["margin_top_mm"])
    sec.bottom_margin = Mm(CFG["page"]["margin_bottom_mm"])
    sec.left_margin = Mm(CFG["page"]["margin_left_mm"])
    sec.right_margin = Mm(CFG["page"]["margin_right_mm"])
    sec.header_distance = Mm(15)
    sec.footer_distance = Mm(17.5)
    return sec


def build_footer(section, doc):
    footer = section.footer
    footer.is_linked_to_previous = False
    para = footer.paragraphs[0] if footer.paragraphs else footer.add_paragraph()

    for run in list(para.runs):
        run._r.getparent().remove(run._r)

    para.style = doc.styles[STYLE_ID["gw_page_number"]]

    run = para.add_run()
    rpr = OxmlElement("w:rPr")
    set_rpr(rpr, EXTRA_STYLES["gw_page_number"])
    run._r.insert(0, rpr)

    begin = new_el("w:fldChar", [("w:fldCharType", "begin")])
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = " PAGE "
    sep = new_el("w:fldChar", [("w:fldCharType", "separate")])
    txt = OxmlElement("w:t")
    txt.text = "1"
    end = new_el("w:fldChar", [("w:fldCharType", "end")])

    run._r.append(begin)
    run._r.append(instr)
    run._r.append(sep)
    run._r.append(txt)
    run._r.append(end)

    para.alignment = 1  # center


# ----------------------------------------------------------------------------
# 段落工具
# ----------------------------------------------------------------------------
def add_paragraph(doc, text, style_id):
    para = doc.add_paragraph(style=doc.styles[style_id])
    if text:
        run = para.add_run(text)
        rpr = OxmlElement("w:rPr")
        spec = dict(CFG["styles"].get(style_id.replace("gw_", ""), None)
                    or EXTRA_STYLES.get(style_id)
                    or EXTRA_STYLES["gw_page_number"])
        set_rpr(rpr, spec)
        run._r.insert(0, rpr)
    return para


def add_bottom_border(para, color="FF0000", size=12, space=1):
    ppr = para._p.get_or_add_pPr()
    pbdr = get_or_make(ppr, "w:pBdr")
    for child in list(pbdr):
        pbdr.remove(child)
    bottom = new_el("w:bottom", [
        ("w:val", "single"),
        ("w:sz", str(size)),
        ("w:space", str(space)),
        ("w:color", color),
    ])
    pbdr.append(bottom)
    reorder(ppr, PPR_ORDER)


# ----------------------------------------------------------------------------
# 主流程
# ----------------------------------------------------------------------------
def main():
    doc = Document()

    setup_doc_defaults(doc)
    section = setup_page(doc)

    # Normal 样式基座
    normal = doc.styles["Normal"]
    n_rpr = normal.element.find(qn("w:rPr"))
    if n_rpr is None:
        n_rpr = OxmlElement("w:rPr")
        normal.element.append(n_rpr)
    set_rpr(n_rpr, CFG["styles"]["body"])
    n_ppr = normal.element.find(qn("w:pPr"))
    if n_ppr is None:
        n_ppr = OxmlElement("w:pPr")
        normal.element.insert(0, n_ppr)
    set_ppr(n_ppr, CFG["styles"]["body"])
    reorder(normal.element, STYLE_ORDER)

    # 注册角色样式
    role_styles = {
        STYLE_ID["gw_title"]: CFG["styles"]["title"],
        STYLE_ID["gw_heading_1"]: CFG["styles"]["heading_1"],
        STYLE_ID["gw_heading_2"]: CFG["styles"]["heading_2"],
        STYLE_ID["gw_heading_3"]: CFG["styles"]["heading_3"],
        STYLE_ID["gw_body"]: CFG["styles"]["body"],
        STYLE_ID["gw_recipient"]: CFG["styles"]["recipient"],
        STYLE_ID["gw_signature"]: CFG["styles"]["signature"],
        STYLE_ID["gw_date"]: CFG["styles"]["date"],
        STYLE_ID["gw_red_header"]: EXTRA_STYLES["gw_red_header"],
        STYLE_ID["gw_doc_number"]: EXTRA_STYLES["gw_doc_number"],
        STYLE_ID["gw_red_line"]: EXTRA_STYLES["gw_red_line"],
        STYLE_ID["gw_page_number"]: EXTRA_STYLES["gw_page_number"],
    }
    for sid, spec in role_styles.items():
        build_style(doc, sid, spec)

    # ---------------- 红头部分 ----------------
    red_cfg = CFG["red_header"]
    org = AST.get("red_header_org") or red_cfg.get("org_name")
    use_red = bool(org)

    if use_red:
        p_org = add_paragraph(doc, org, STYLE_ID["gw_red_header"])
        p_org.alignment = 1

        doc_num = AST.get("doc_number")
        if doc_num:
            p_num = add_paragraph(doc, doc_num, STYLE_ID["gw_doc_number"])
            p_num.alignment = 1

        if red_cfg.get("has_red_line", True):
            p_line = add_paragraph(doc, "", STYLE_ID["gw_red_line"])
            add_bottom_border(
                p_line,
                color=red_cfg.get("color_hex", "FF0000"),
                size=12,
                space=1,
            )

    # ---------------- 标题 ----------------
    if AST.get("title"):
        add_paragraph(doc, AST["title"], STYLE_ID["gw_title"])

    # ---------------- 主送机关 ----------------
    if AST.get("recipient"):
        add_paragraph(doc, AST["recipient"], STYLE_ID["gw_recipient"])

    # ---------------- 正文块 ----------------
    block_style_map = {
        "title": STYLE_ID["gw_title"],
        "heading_1": STYLE_ID["gw_heading_1"],
        "heading_2": STYLE_ID["gw_heading_2"],
        "heading_3": STYLE_ID["gw_heading_3"],
        "body": STYLE_ID["gw_body"],
    }

    for block in AST.get("blocks", []) or []:
        btype = block.get("type")
        style_id = block_style_map.get(btype, STYLE_ID["gw_body"])
        text = block.get("text") or ""
        rows = block.get("rows")

        add_paragraph(doc, text, style_id)

        if rows:
            table = doc.add_table(rows=len(rows), cols=len(rows[0]) if rows else 0)
            table.style = "Table Grid"
            for r_idx, row in enumerate(rows):
                for c_idx, cell_text in enumerate(row):
                    cell = table.cell(r_idx, c_idx)
                    cell.text = ""
                    para = cell.paragraphs[0]
                    para.style = doc.styles[STYLE_ID["gw_body"]]
                    if cell_text:
                        run = para.add_run(str(cell_text))
                        rpr = OxmlElement("w:rPr")
                        set_rpr(rpr, CFG["styles"]["body"])
                        run._r.insert(0, rpr)

    # ---------------- 附件 ----------------
    for idx, att in enumerate(AST.get("attachments") or []):
        prefix = "附件：" if idx == 0 else "　　　　"
        add_paragraph(doc, prefix + str(att), STYLE_ID["gw_body"])

    # ---------------- 落款 ----------------
    if AST.get("signature"):
        add_paragraph(doc, AST["signature"], STYLE_ID["gw_signature"])

    if AST.get("date"):
        add_paragraph(doc, AST["date"], STYLE_ID["gw_date"])

    # ---------------- 页码 ----------------
    if CFG["page"].get("show_page_number", True):
        build_footer(section, doc)

    doc.save("output.docx")


if __name__ == "__main__":
    main()

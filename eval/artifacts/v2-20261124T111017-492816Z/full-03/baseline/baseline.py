import json
from docx import Document
from docx.shared import Pt, Mm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.style import WD_STYLE_TYPE
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

CFG = {
    "id": "gbt-9704-2012",
    "name": "GB/T 9704-2012 国标公文",
    "source_type": "builtin",
    "parent_id": None,
    "base_template_path": None,
    "description": "",
    "page": {
        "size": "A4",
        "margin_top_mm": 32.0,
        "margin_bottom_mm": 35.0,
        "margin_left_mm": 28.0,
        "margin_right_mm": 26.0,
        "show_page_number": False
    },
    "red_header": {
        "enabled": False,
        "org_name": None,
        "font_cn": "方正小标宋简体",
        "font_size_pt": 36.0,
        "color_hex": "FF0000",
        "has_red_line": True,
        "doc_number_font_cn": "仿宋_GB2312",
        "doc_number_size_pt": 16.0
    },
    "styles": {
        "title": {
            "font_cn": "黑体",
            "font_en": "Times New Roman",
            "font_size_pt": 22.0,
            "bold": False,
            "italic": False,
            "color_hex": "000000",
            "alignment": "center",
            "line_spacing_rule": "exact",
            "line_spacing_value": 30.0,
            "first_line_indent_chars": 0.0,
            "space_before_pt": 0.0,
            "space_after_pt": 0.0
        },
        "heading_1": {
            "font_cn": "黑体",
            "font_en": "Times New Roman",
            "font_size_pt": 16.0,
            "bold": False,
            "italic": False,
            "color_hex": "000000",
            "alignment": "justify",
            "line_spacing_rule": "exact",
            "line_spacing_value": 28.0,
            "first_line_indent_chars": 2.0,
            "space_before_pt": 0.0,
            "space_after_pt": 0.0
        },
        "heading_2": {
            "font_cn": "楷体_GB2312",
            "font_en": "Times New Roman",
            "font_size_pt": 16.0,
            "bold": False,
            "italic": False,
            "color_hex": "000000",
            "alignment": "justify",
            "line_spacing_rule": "exact",
            "line_spacing_value": 28.0,
            "first_line_indent_chars": 2.0,
            "space_before_pt": 0.0,
            "space_after_pt": 0.0
        },
        "heading_3": {
            "font_cn": "仿宋_GB2312",
            "font_en": "Times New Roman",
            "font_size_pt": 16.0,
            "bold": False,
            "italic": False,
            "color_hex": "000000",
            "alignment": "justify",
            "line_spacing_rule": "exact",
            "line_spacing_value": 28.0,
            "first_line_indent_chars": 2.0,
            "space_before_pt": 0.0,
            "space_after_pt": 0.0
        },
        "body": {
            "font_cn": "黑体",
            "font_en": "Times New Roman",
            "font_size_pt": 12.0,
            "bold": False,
            "italic": False,
            "color_hex": "000000",
            "alignment": "justify",
            "line_spacing_rule": "exact",
            "line_spacing_value": 26.0,
            "first_line_indent_chars": 2.0,
            "space_before_pt": 0.0,
            "space_after_pt": 0.0
        },
        "recipient": {
            "font_cn": "仿宋_GB2312",
            "font_en": "Times New Roman",
            "font_size_pt": 16.0,
            "bold": False,
            "italic": False,
            "color_hex": "000000",
            "alignment": "left",
            "line_spacing_rule": "exact",
            "line_spacing_value": 28.0,
            "first_line_indent_chars": 0.0,
            "space_before_pt": 0.0,
            "space_after_pt": 0.0
        },
        "signature": {
            "font_cn": "仿宋_GB2312",
            "font_en": "Times New Roman",
            "font_size_pt": 16.0,
            "bold": False,
            "italic": False,
            "color_hex": "000000",
            "alignment": "right",
            "line_spacing_rule": "exact",
            "line_spacing_value": 28.0,
            "first_line_indent_chars": 0.0,
            "space_before_pt": 0.0,
            "space_after_pt": 0.0
        },
        "date": {
            "font_cn": "仿宋_GB2312",
            "font_en": "Times New Roman",
            "font_size_pt": 16.0,
            "bold": False,
            "italic": False,
            "color_hex": "000000",
            "alignment": "right",
            "line_spacing_rule": "exact",
            "line_spacing_value": 28.0,
            "first_line_indent_chars": 0.0,
            "space_before_pt": 0.0,
            "space_after_pt": 0.0
        }
    }
}

AST = {
    "doc_type": "notice",
    "red_header_org": "综合办公室",
    "doc_number": "综办〔2026〕12号",
    "title": "关于开展档案归档检查的通知",
    "recipient": "各部门：",
    "blocks": [
        {"type": "heading_1", "text": "一、检查安排", "rows": None},
        {"type": "body", "text": "请各部门核对纸质与电子档案目录，整理归档清单并反馈检查结果。", "rows": None}
    ],
    "attachments": [],
    "signature": "综合办公室",
    "date": "2026年11月24日"
}

ALIGN_MAP = {
    "left": "left",
    "center": "center",
    "right": "right",
    "justify": "both",
    "both": "both"
}

def get_or_add_child(parent, tag, first=False):
    qtag = qn(tag)
    el = parent.find(qtag)
    if el is None:
        el = OxmlElement(tag)
        if first:
            parent.insert(0, el)
        else:
            parent.append(el)
    return el

def set_bool_child(rPr, tag, value):
    el = get_or_add_child(rPr, tag)
    el.set(qn("w:val"), "1" if value else "0")

def set_rpr_format(rPr, cfg):
    font_cn = cfg.get("font_cn") or "宋体"
    font_en = cfg.get("font_en") or "Times New Roman"
    size_pt = float(cfg.get("font_size_pt", 12.0) or 12.0)
    color = str(cfg.get("color_hex", "000000") or "000000").lstrip("#")

    rFonts = get_or_add_child(rPr, "w:rFonts")
    rFonts.set(qn("w:ascii"), font_en)
    rFonts.set(qn("w:hAnsi"), font_en)
    rFonts.set(qn("w:eastAsia"), font_cn)
    rFonts.set(qn("w:cs"), font_cn)

    sz = str(int(round(size_pt * 2)))
    szCs = str(int(round(size_pt * 2)))
    get_or_add_child(rPr, "w:sz").set(qn("w:val"), sz)
    get_or_add_child(rPr, "w:szCs").set(qn("w:val"), szCs)
    get_or_add_child(rPr, "w:color").set(qn("w:val"), color)

    set_bool_child(rPr, "w:b", bool(cfg.get("bold", False)))
    set_bool_child(rPr, "w:i", bool(cfg.get("italic", False)))

def set_ppr_format(pPr, cfg):
    alignment = cfg.get("alignment", "justify")
    jc_val = ALIGN_MAP.get(alignment, "both")
    get_or_add_child(pPr, "w:jc").set(qn("w:val"), jc_val)

    before_pt = float(cfg.get("space_before_pt", 0.0) or 0.0)
    after_pt = float(cfg.get("space_after_pt", 0.0) or 0.0)
    line_pt = float(cfg.get("line_spacing_value", 12.0) or 12.0)
    line_rule = "exact" if cfg.get("line_spacing_rule") == "exact" else "auto"

    spacing = get_or_add_child(pPr, "w:spacing")
    spacing.set(qn("w:before"), str(int(round(before_pt * 20))))
    spacing.set(qn("w:after"), str(int(round(after_pt * 20))))
    spacing.set(qn("w:line"), str(int(round(line_pt * 20))))
    spacing.set(qn("w:lineRule"), line_rule)

    chars = float(cfg.get("first_line_indent_chars", 0.0) or 0.0)
    size_pt = float(cfg.get("font_size_pt", 12.0) or 12.0)
    firstLineChars = int(round(chars * 100))
    firstLine = int(round(chars * size_pt * 20))

    ind = get_or_add_child(pPr, "w:ind")
    ind.set(qn("w:firstLineChars"), str(firstLineChars))
    ind.set(qn("w:firstLine"), str(firstLine))

def ensure_style(doc, style_id, cfg):
    styles = doc.styles
    try:
        style = styles[style_id]
    except KeyError:
        style = styles.add_style(style_id, WD_STYLE_TYPE.PARAGRAPH)

    pPr = get_or_add_child(style.element, "w:pPr")
    rPr = get_or_add_child(style.element, "w:rPr")
    set_ppr_format(pPr, cfg)
    set_rpr_format(rPr, cfg)
    return style

def add_role_paragraph(doc, text, role, cfg, style_map):
    p = doc.add_paragraph(style=style_map[role])
    pPr = get_or_add_child(p._p, "w:pPr", first=True)
    set_ppr_format(pPr, cfg)
    if text is not None:
        run = p.add_run(text)
        rPr = get_or_add_child(run._r, "w:rPr", first=True)
        set_rpr_format(rPr, cfg)
    return p

def set_bottom_border(paragraph, color="FF0000", sz="12"):
    pPr = get_or_add_child(paragraph._p, "w:pPr", first=True)
    pBdr = get_or_add_child(pPr, "w:pBdr")
    bottom = get_or_add_child(pBdr, "w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), str(sz))
    bottom.set(qn("w:space"), "1")
    bottom.set(qn("w:color"), str(color).lstrip("#"))

def add_page_number_footer(doc):
    section = doc.sections[0]
    footer = section.footer
    p = footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run()
    fld_begin = OxmlElement("w:fldChar")
    fld_begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = " PAGE "
    fld_end = OxmlElement("w:fldChar")
    fld_end.set(qn("w:fldCharType"), "end")
    run._r.append(fld_begin)
    run._r.append(instr)
    run._r.append(fld_end)

doc = Document()

section = doc.sections[0]
section.page_width = Mm(210)
section.page_height = Mm(297)
section.top_margin = Mm(float(CFG["page"]["margin_top_mm"]))
section.bottom_margin = Mm(float(CFG["page"]["margin_bottom_mm"]))
section.left_margin = Mm(float(CFG["page"]["margin_left_mm"]))
section.right_margin = Mm(float(CFG["page"]["margin_right_mm"]))

style_map = {}
for style_id, style_cfg in {
    "gw_title": CFG["styles"]["title"],
    "gw_heading_1": CFG["styles"]["heading_1"],
    "gw_heading_2": CFG["styles"]["heading_2"],
    "gw_heading_3": CFG["styles"]["heading_3"],
    "gw_body": CFG["styles"]["body"],
    "gw_recipient": CFG["styles"]["recipient"],
    "gw_signature": CFG["styles"]["signature"],
    "gw_date": CFG["styles"]["date"]
}.items():
    style_map[style_id] = ensure_style(doc, style_id, style_cfg)

rh_cfg = CFG.get("red_header", {})
if rh_cfg.get("enabled"):
    rh_org = AST.get("red_header_org") or rh_cfg.get("org_name") or ""
    if rh_org:
        rh_style_cfg = {
            "font_cn": rh_cfg.get("font_cn", "方正小标宋简体"),
            "font_en": "Times New Roman",
            "font_size_pt": rh_cfg.get("font_size_pt", 36.0),
            "bold": False,
            "italic": False,
            "color_hex": rh_cfg.get("color_hex", "FF0000"),
            "alignment": "center",
            "line_spacing_rule": "exact",
            "line_spacing_value": 44.0,
            "first_line_indent_chars": 0.0,
            "space_before_pt": 0.0,
            "space_after_pt": 0.0
        }
        style_map["gw_red_header"] = ensure_style(doc, "gw_red_header", rh_style_cfg)
        rh_p = add_role_paragraph(doc, rh_org, "gw_red_header", rh_style_cfg, style_map)
    else:
        rh_p = None

    doc_num = AST.get("doc_number")
    if doc_num:
        dn_style_cfg = {
            "font_cn": rh_cfg.get("doc_number_font_cn", "仿宋_GB2312"),
            "font_en": "Times New Roman",
            "font_size_pt": rh_cfg.get("doc_number_size_pt", 16.0),
            "bold": False,
            "italic": False,
            "color_hex": "000000",
            "alignment": "center",
            "line_spacing_rule": "exact",
            "line_spacing_value": 28.0,
            "first_line_indent_chars": 0.0,
            "space_before_pt": 0.0,
            "space_after_pt": 0.0
        }
        style_map["gw_doc_number"] = ensure_style(doc, "gw_doc_number", dn_style_cfg)
        dn_p = add_role_paragraph(doc, doc_num, "gw_doc_number", dn_style_cfg, style_map)
        if rh_cfg.get("has_red_line"):
            set_bottom_border(dn_p, rh_cfg.get("color_hex", "FF0000"))
    else:
        if rh_p is not None and rh_cfg.get("has_red_line"):
            set_bottom_border(rh_p, rh_cfg.get("color_hex", "FF0000"))

if AST.get("title"):
    add_role_paragraph(doc, AST["title"], "gw_title", CFG["styles"]["title"], style_map)

if AST.get("recipient"):
    add_role_paragraph(doc, AST["recipient"], "gw_recipient", CFG["styles"]["recipient"], style_map)

block_role_map = {
    "heading_1": ("gw_heading_1", "heading_1"),
    "heading_2": ("gw_heading_2", "heading_2"),
    "heading_3": ("gw_heading_3", "heading_3"),
    "body": ("gw_body", "body")
}

for block in AST.get("blocks", []) or []:
    btype = block.get("type") or "body"
    role, cfg_key = block_role_map.get(btype, ("gw_body", "body"))
    add_role_paragraph(doc, block.get("text") or "", role, CFG["styles"][cfg_key], style_map)

for att in AST.get("attachments", []) or []:
    if att:
        add_role_paragraph(doc, str(att), "gw_body", CFG["styles"]["body"], style_map)

if AST.get("signature"):
    add_role_paragraph(doc, AST["signature"], "gw_signature", CFG["styles"]["signature"], style_map)

if AST.get("date"):
    add_role_paragraph(doc, AST["date"], "gw_date", CFG["styles"]["date"], style_map)

if CFG["page"].get("show_page_number"):
    add_page_number_footer(doc)

doc.save("output.docx")
from docx import Document
from docx.shared import Mm, Pt
from docx.enum.style import WD_STYLE_TYPE
from docx.oxml import OxmlElement
from docx.oxml.ns import qn


TARGET = {
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
            "font_cn": "方正小标宋简体",
            "font_en": "Times New Roman",
            "font_size_pt": 22.0,
            "bold": False,
            "italic": False,
            "color_hex": "000000",
            "alignment": "center",
            "line_spacing_rule": "exact",
            "line_spacing_value": 28.0,
            "first_line_indent_chars": 0.0,
            "space_before_pt": 0.0,
            "space_after_pt": 0.0,
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
            "space_after_pt": 0.0,
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
            "space_after_pt": 0.0,
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
            "space_after_pt": 0.0,
        },
        "body": {
            "font_cn": "仿宋_GB2312",
            "font_en": "Times New Roman",
            "font_size_pt": 14.0,
            "bold": False,
            "italic": False,
            "color_hex": "000000",
            "alignment": "justify",
            "line_spacing_rule": "exact",
            "line_spacing_value": 28.0,
            "first_line_indent_chars": 2.0,
            "space_before_pt": 0.0,
            "space_after_pt": 0.0,
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
            "space_after_pt": 0.0,
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
            "space_after_pt": 0.0,
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
        {
            "type": "body",
            "text": "请各部门核对纸质与电子档案目录，整理归档清单并反馈检查结果。",
            "rows": None,
        },
    ],
    "attachments": [],
    "signature": "综合办公室",
    "date": "2026年11月24日",
}


def get_or_add_child(parent, tag):
    child = parent.find(qn(tag))
    if child is None:
        child = OxmlElement(tag)
        parent.append(child)
    return child


def set_rpr(rpr, cfg):
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = OxmlElement("w:rFonts")
        rpr.insert(0, rfonts)

    font_en = cfg.get("font_en") or cfg["font_cn"]
    rfonts.set(qn("w:ascii"), font_en)
    rfonts.set(qn("w:hAnsi"), font_en)
    rfonts.set(qn("w:eastAsia"), cfg["font_cn"])
    rfonts.set(qn("w:cs"), font_en)

    for tag in ("w:b", "w:bCs", "w:i", "w:iCs", "w:color", "w:sz", "w:szCs"):
        for elem in rpr.findall(qn(tag)):
            rpr.remove(elem)

    b = OxmlElement("w:b")
    b.set(qn("w:val"), "1" if cfg.get("bold") else "0")
    rpr.append(b)

    bcs = OxmlElement("w:bCs")
    bcs.set(qn("w:val"), "1" if cfg.get("bold") else "0")
    rpr.append(bcs)

    i = OxmlElement("w:i")
    i.set(qn("w:val"), "1" if cfg.get("italic") else "0")
    rpr.append(i)

    ics = OxmlElement("w:iCs")
    ics.set(qn("w:val"), "1" if cfg.get("italic") else "0")
    rpr.append(ics)

    color = OxmlElement("w:color")
    color.set(qn("w:val"), cfg.get("color_hex", "000000"))
    rpr.append(color)

    sz_val = str(int(round(float(cfg["font_size_pt"]) * 2)))
    sz = OxmlElement("w:sz")
    sz.set(qn("w:val"), sz_val)
    rpr.append(sz)

    szcs = OxmlElement("w:szCs")
    szcs.set(qn("w:val"), sz_val)
    rpr.append(szcs)


def set_ppr(ppr, cfg):
    for tag in ("w:spacing", "w:ind", "w:jc"):
        for elem in ppr.findall(qn(tag)):
            ppr.remove(elem)

    spacing = OxmlElement("w:spacing")
    line_val = str(int(round(float(cfg["line_spacing_value"]) * 20)))
    spacing.set(qn("w:line"), line_val)
    spacing.set(qn("w:lineRule"), "exact" if cfg.get("line_spacing_rule") == "exact" else "auto")
    spacing.set(qn("w:before"), str(int(round(float(cfg.get("space_before_pt", 0.0)) * 20))))
    spacing.set(qn("w:after"), str(int(round(float(cfg.get("space_after_pt", 0.0)) * 20))))
    ppr.append(spacing)

    ind = OxmlElement("w:ind")
    chars = float(cfg.get("first_line_indent_chars", 0.0))
    ind.set(qn("w:firstLineChars"), str(int(round(chars * 100))))
    ind.set(qn("w:firstLine"), str(int(round(chars * float(cfg["font_size_pt"]) * 20))))
    ppr.append(ind)

    jc = OxmlElement("w:jc")
    align_map = {
        "justify": "both",
        "both": "both",
        "left": "left",
        "right": "right",
        "center": "center",
    }
    jc.set(qn("w:val"), align_map.get(cfg.get("alignment", "justify"), "both"))
    ppr.append(jc)


def apply_run_format(run, cfg):
    rpr = run._r.get_or_add_rPr()
    set_rpr(rpr, cfg)


def apply_paragraph_format(paragraph, cfg):
    ppr = paragraph._p.get_or_add_pPr()
    set_ppr(ppr, cfg)


def create_style(doc, style_id, cfg):
    style = doc.styles.add_style(style_id, WD_STYLE_TYPE.PARAGRAPH)
    style.element.set(qn("w:styleId"), style_id)
    style.element.set(qn("w:type"), "paragraph")

    ppr = get_or_add_child(style.element, "w:pPr")
    set_ppr(ppr, cfg)

    rpr = get_or_add_child(style.element, "w:rPr")
    set_rpr(rpr, cfg)
    return style


def add_para(doc, text, style_id, cfg):
    p = doc.add_paragraph(style=style_id)
    apply_paragraph_format(p, cfg)
    if text is not None:
        run = p.add_run(text)
        apply_run_format(run, cfg)
    return p


def set_bottom_border(paragraph, color_hex, sz=12, space=1):
    ppr = paragraph._p.get_or_add_pPr()
    pbdr = ppr.find(qn("w:pBdr"))
    if pbdr is None:
        pbdr = OxmlElement("w:pBdr")
        pstyle = ppr.find(qn("w:pStyle"))
        if pstyle is not None:
            ppr.insert(list(ppr).index(pstyle) + 1, pbdr)
        else:
            ppr.insert(0, pbdr)

    for elem in pbdr.findall(qn("w:bottom")):
        pbdr.remove(elem)

    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), str(sz))
    bottom.set(qn("w:space"), str(space))
    bottom.set(qn("w:color"), color_hex)
    pbdr.append(bottom)


def add_page_number(section, doc, page_cfg):
    footer = section.footer
    p = footer.paragraphs[0] if footer.paragraphs else footer.add_paragraph()
    p.text = ""
    p.style = doc.styles["gw_page_number"]
    apply_paragraph_format(p, page_cfg)

    run1 = p.add_run("— ")
    apply_run_format(run1, page_cfg)

    fld = OxmlElement("w:fldSimple")
    fld.set(qn("w:instr"), " PAGE ")

    r = OxmlElement("w:r")
    rpr = OxmlElement("w:rPr")
    set_rpr(rpr, page_cfg)
    r.append(rpr)

    t = OxmlElement("w:t")
    t.text = "1"
    r.append(t)
    fld.append(r)
    p._p.append(fld)

    run2 = p.add_run(" —")
    apply_run_format(run2, page_cfg)


doc = Document()

section = doc.sections[0]
section.page_width = Mm(210)
section.page_height = Mm(297)
section.top_margin = Mm(TARGET["page"]["margin_top_mm"])
section.bottom_margin = Mm(TARGET["page"]["margin_bottom_mm"])
section.left_margin = Mm(TARGET["page"]["margin_left_mm"])
section.right_margin = Mm(TARGET["page"]["margin_right_mm"])

styles_cfg = TARGET["styles"]

create_style(doc, "gw_title", styles_cfg["title"])
create_style(doc, "gw_heading_1", styles_cfg["heading_1"])
create_style(doc, "gw_heading_2", styles_cfg["heading_2"])
create_style(doc, "gw_heading_3", styles_cfg["heading_3"])
create_style(doc, "gw_body", styles_cfg["body"])
create_style(doc, "gw_recipient", styles_cfg["recipient"])
create_style(doc, "gw_signature", styles_cfg["signature"])
create_style(doc, "gw_date", styles_cfg["date"])

red_header = TARGET["red_header"]
red_header_cfg = {
    "font_cn": red_header["font_cn"],
    "font_en": "Times New Roman",
    "font_size_pt": red_header["font_size_pt"],
    "bold": False,
    "italic": False,
    "color_hex": red_header["color_hex"],
    "alignment": "center",
    "line_spacing_rule": "exact",
    "line_spacing_value": 44.0,
    "first_line_indent_chars": 0.0,
    "space_before_pt": 0.0,
    "space_after_pt": 0.0,
}
doc_number_cfg = {
    "font_cn": red_header["doc_number_font_cn"],
    "font_en": "Times New Roman",
    "font_size_pt": red_header["doc_number_size_pt"],
    "bold": False,
    "italic": False,
    "color_hex": red_header["color_hex"],
    "alignment": "center",
    "line_spacing_rule": "exact",
    "line_spacing_value": 28.0,
    "first_line_indent_chars": 0.0,
    "space_before_pt": 0.0,
    "space_after_pt": 0.0,
}
page_number_cfg = {
    "font_cn": "宋体",
    "font_en": "Times New Roman",
    "font_size_pt": 14.0,
    "bold": False,
    "italic": False,
    "color_hex": "000000",
    "alignment": "center",
    "line_spacing_rule": "exact",
    "line_spacing_value": 28.0,
    "first_line_indent_chars": 0.0,
    "space_before_pt": 0.0,
    "space_after_pt": 0.0,
}

create_style(doc, "gw_red_header", red_header_cfg)
create_style(doc, "gw_doc_number", doc_number_cfg)
create_style(doc, "gw_page_number", page_number_cfg)

if red_header.get("enabled"):
    org = AST.get("red_header_org") or red_header.get("org_name")
    if org:
        add_para(doc, org, "gw_red_header", red_header_cfg)

    doc_num = AST.get("doc_number")
    if doc_num:
        add_para(doc, doc_num, "gw_doc_number", doc_number_cfg)

    if red_header.get("has_red_line"):
        red_line_p = doc.add_paragraph()
        red_line_cfg = dict(styles_cfg["body"])
        red_line_cfg.update(
            {
                "alignment": "center",
                "line_spacing_rule": "exact",
                "line_spacing_value": 1.0,
                "first_line_indent_chars": 0.0,
                "space_before_pt": 0.0,
                "space_after_pt": 6.0,
            }
        )
        apply_paragraph_format(red_line_p, red_line_cfg)
        set_bottom_border(red_line_p, red_header["color_hex"], sz=12, space=1)

if AST.get("title"):
    add_para(doc, AST["title"], "gw_title", styles_cfg["title"])

if AST.get("recipient"):
    add_para(doc, AST["recipient"], "gw_recipient", styles_cfg["recipient"])

for block in AST.get("blocks", []):
    block_type = block.get("type")
    text = block.get("text", "")
    if block_type in ("heading_1", "heading_2", "heading_3", "body"):
        style_id = "gw_" + block_type
        cfg = styles_cfg[block_type]
        add_para(doc, text, style_id, cfg)

attachments = AST.get("attachments") or []
if attachments:
    add_para(doc, "附件：", "gw_body", styles_cfg["body"])
    for idx, item in enumerate(attachments, 1):
        if isinstance(item, dict):
            item_text = item.get("text") or item.get("name") or ""
        else:
            item_text = str(item)
        add_para(doc, f"{idx}. {item_text}", "gw_body", styles_cfg["body"])

if AST.get("signature"):
    add_para(doc, AST["signature"], "gw_signature", styles_cfg["signature"])

if AST.get("date"):
    add_para(doc, AST["date"], "gw_date", styles_cfg["date"])

if TARGET["page"].get("show_page_number"):
    add_page_number(section, doc, page_number_cfg)

doc.save("output.docx")

# -*- coding: utf-8 -*-
from docx import Document
from docx.shared import Mm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.style import WD_STYLE_TYPE
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

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

CONFIG = {
    "page": {
        "size": "A4",
        "margin_top_mm": 37.0,
        "margin_bottom_mm": 35.0,
        "margin_left_mm": 28.0,
        "margin_right_mm": 26.0,
        "show_page_number": False
    },
    "red_header": {
        "enabled": True,
        "org_name": None,
        "font_cn": "方正小标宋简体",
        "font_size_pt": 36.0,
        "color_hex": "FF0000",
        "has_red_line": True,
        "doc_number_font_cn": "仿宋_GB2312",
        "doc_number_size_pt": 16.0
    }
}

ROLES = {
    "red_header": {
        "font_cn": "方正小标宋简体",
        "font_en": "Times New Roman",
        "font_size_pt": 36.0,
        "bold": False,
        "italic": False,
        "color_hex": "FF0000",
        "alignment": "center",
        "line_spacing_rule": "exact",
        "line_spacing_value": 44.0,
        "first_line_indent_chars": 0.0,
        "space_before_pt": 0.0,
        "space_after_pt": 0.0
    },
    "doc_number": {
        "font_cn": "仿宋_GB2312",
        "font_en": "Times New Roman",
        "font_size_pt": 16.0,
        "bold": False,
        "italic": False,
        "color_hex": "000000",
        "alignment": "center",
        "line_spacing_rule": "exact",
        "line_spacing_value": 28.0,
        "first_line_indent_chars": 0.0,
        "space_before_pt": 0.0,
        "space_after_pt": 0.0
    },
    "red_line": {
        "font_cn": "仿宋_GB2312",
        "font_en": "Times New Roman",
        "font_size_pt": 12.0,
        "bold": False,
        "italic": False,
        "color_hex": "FF0000",
        "alignment": "left",
        "line_spacing_rule": "exact",
        "line_spacing_value": 12.0,
        "first_line_indent_chars": 0.0,
        "space_before_pt": 0.0,
        "space_after_pt": 0.0
    },
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
        "line_spacing_value": 31.0,
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

STYLE_IDS = {
    "gw_red_header": "red_header",
    "gw_doc_number": "doc_number",
    "gw_red_line": "red_line",
    "gw_title": "title",
    "gw_heading_1": "heading_1",
    "gw_heading_2": "heading_2",
    "gw_heading_3": "heading_3",
    "gw_body": "body",
    "gw_recipient": "recipient",
    "gw_signature": "signature",
    "gw_date": "date"
}


def set_paragraph_props(pPr, cfg):
    alignment = cfg.get("alignment", "left")
    if alignment in ("justify", "both"):
        alignment = "both"

    jc = pPr.get_or_add_jc()
    jc.set(qn("w:val"), alignment)

    spacing = pPr.get_or_add_spacing()
    line_value = int(round(float(cfg.get("line_spacing_value", 28.0)) * 20))
    spacing.set(qn("w:line"), str(line_value))
    spacing.set(qn("w:lineRule"), "exact")
    spacing.set(qn("w:before"), str(int(round(float(cfg.get("space_before_pt", 0.0)) * 20))))
    spacing.set(qn("w:after"), str(int(round(float(cfg.get("space_after_pt", 0.0)) * 20))))

    ind = pPr.get_or_add_ind()
    chars = float(cfg.get("first_line_indent_chars", 0.0))
    size = float(cfg.get("font_size_pt", 12.0))
    ind.set(qn("w:firstLineChars"), str(int(round(chars * 100))))
    ind.set(qn("w:firstLine"), str(int(round(chars * size * 20))))


def set_run_props(rPr, cfg):
    font_cn = cfg.get("font_cn", "宋体")
    font_en = cfg.get("font_en", "Times New Roman")
    size = float(cfg.get("font_size_pt", 12.0))

    rFonts = rPr.get_or_add_rFonts()
    rFonts.set(qn("w:eastAsia"), font_cn)
    rFonts.set(qn("w:ascii"), font_en)
    rFonts.set(qn("w:hAnsi"), font_en)
    rFonts.set(qn("w:cs"), font_en)

    sz = rPr.get_or_add_sz()
    sz.set(qn("w:val"), str(int(round(size * 2))))

    szCs = rPr.get_or_add_szCs()
    szCs.set(qn("w:val"), str(int(round(size * 2))))

    b = rPr.get_or_add_b()
    b.set(qn("w:val"), "1" if cfg.get("bold") else "0")

    i = rPr.get_or_add_i()
    i.set(qn("w:val"), "1" if cfg.get("italic") else "0")

    color = rPr.get_or_add_color()
    color.set(qn("w:val"), str(cfg.get("color_hex", "000000")).replace("#", "").upper())


def create_style(doc, style_id, cfg):
    style = doc.styles.add_style(style_id, WD_STYLE_TYPE.PARAGRAPH)
    style.element.set(qn("w:styleId"), style_id)
    style.name = style_id

    pPr = style.element.get_or_add_pPr()
    set_paragraph_props(pPr, cfg)

    rPr = style.element.get_or_add_rPr()
    set_run_props(rPr, cfg)

    return style


def add_role_paragraph(doc, text, style_id, cfg):
    p = doc.add_paragraph(style=style_id)
    set_paragraph_props(p._p.get_or_add_pPr(), cfg)

    if text is not None and text != "":
        run = p.add_run(str(text))
        set_run_props(run._r.get_or_add_rPr(), cfg)

    return p


def add_bottom_border(paragraph, color_hex="FF0000"):
    pPr = paragraph._p.get_or_add_pPr()

    if hasattr(pPr, "get_or_add_pBdr"):
        pBdr = pPr.get_or_add_pBdr()
    else:
        pBdr = pPr.find(qn("w:pBdr"))
        if pBdr is None:
            pBdr = OxmlElement("w:pBdr")
            spacing = pPr.find(qn("w:spacing"))
            if spacing is not None:
                spacing.addprevious(pBdr)
            else:
                pPr.append(pBdr)

    bottom = pBdr.find(qn("w:bottom"))
    if bottom is None:
        bottom = OxmlElement("w:bottom")
        pBdr.append(bottom)

    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), "12")
    bottom.set(qn("w:space"), "1")
    bottom.set(qn("w:color"), str(color_hex).replace("#", "").upper())


def add_page_number(section):
    footer = section.footer
    p = footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER

    for r in list(p.runs):
        r._r.getparent().remove(r._r)

    run = p.add_run()
    page_cfg = {
        "font_cn": "仿宋_GB2312",
        "font_en": "Times New Roman",
        "font_size_pt": 14.0,
        "bold": False,
        "italic": False,
        "color_hex": "000000"
    }
    set_run_props(run._r.get_or_add_rPr(), page_cfg)

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


def main():
    doc = Document()

    section = doc.sections[0]
    section.page_width = Mm(210)
    section.page_height = Mm(297)
    section.top_margin = Mm(CONFIG["page"]["margin_top_mm"])
    section.bottom_margin = Mm(CONFIG["page"]["margin_bottom_mm"])
    section.left_margin = Mm(CONFIG["page"]["margin_left_mm"])
    section.right_margin = Mm(CONFIG["page"]["margin_right_mm"])

    for style_id, role_key in STYLE_IDS.items():
        create_style(doc, style_id, ROLES[role_key])

    red_cfg = CONFIG["red_header"]
    if red_cfg.get("enabled"):
        org_name = AST.get("red_header_org") or red_cfg.get("org_name") or ""
        add_role_paragraph(doc, org_name, "gw_red_header", ROLES["red_header"])

        doc_number = AST.get("doc_number", "")
        add_role_paragraph(doc, doc_number, "gw_doc_number", ROLES["doc_number"])

        if red_cfg.get("has_red_line", True):
            p = doc.add_paragraph(style="gw_red_line")
            set_paragraph_props(p._p.get_or_add_pPr(), ROLES["red_line"])
            add_bottom_border(p, "FF0000")

    add_role_paragraph(doc, AST.get("title", ""), "gw_title", ROLES["title"])

    recipient = AST.get("recipient", "")
    if recipient:
        add_role_paragraph(doc, recipient, "gw_recipient", ROLES["recipient"])

    for block in AST.get("blocks", []):
        block_type = block.get("type", "body")
        text = block.get("text", "")

        if block_type == "heading_1":
            style_id = "gw_heading_1"
            role = ROLES["heading_1"]
        elif block_type == "heading_2":
            style_id = "gw_heading_2"
            role = ROLES["heading_2"]
        elif block_type == "heading_3":
            style_id = "gw_heading_3"
            role = ROLES["heading_3"]
        else:
            style_id = "gw_body"
            role = ROLES["body"]

        if text:
            add_role_paragraph(doc, text, style_id, role)

    attachments = AST.get("attachments", [])
    if attachments:
        for attachment in attachments:
            if attachment:
                add_role_paragraph(doc, attachment, "gw_body", ROLES["body"])

    signature = AST.get("signature", "")
    if signature:
        add_role_paragraph(doc, signature, "gw_signature", ROLES["signature"])

    date_text = AST.get("date", "")
    if date_text:
        add_role_paragraph(doc, date_text, "gw_date", ROLES["date"])

    if CONFIG["page"].get("show_page_number"):
        add_page_number(section)

    doc.save("output.docx")


if __name__ == "__main__":
    main()

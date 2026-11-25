from docx import Document
from docx.shared import Mm, Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.enum.style import WD_STYLE_TYPE
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

TARGET = {
    "id": "gbt-9704-2012",
    "name": "GB/T 9704-2012 国标公文",
    "page": {
        "size": "A4",
        "margin_top_mm": 30.0,
        "margin_bottom_mm": 35.0,
        "margin_left_mm": 28.0,
        "margin_right_mm": 26.0,
        "show_page_number": True
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
            "font_size_pt": 24.0,
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
            "font_cn": "宋体",
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

def ensure_style_pPr(style_element):
    pPr = style_element.find(qn("w:pPr"))
    if pPr is None:
        pPr = OxmlElement("w:pPr")
        style_element.append(pPr)
    return pPr

def ensure_style_rPr(style_element):
    rPr = style_element.find(qn("w:rPr"))
    if rPr is None:
        rPr = OxmlElement("w:rPr")
        style_element.append(rPr)
    return rPr

def set_pPr_props(pPr, cfg):
    alignment = cfg.get("alignment", "justify")
    val = "both" if alignment == "justify" else alignment
    jc = pPr.find(qn("w:jc"))
    if jc is None:
        jc = OxmlElement("w:jc")
        pPr.append(jc)
    jc.set(qn("w:val"), val)

    spacing = pPr.find(qn("w:spacing"))
    if spacing is None:
        spacing = OxmlElement("w:spacing")
        pPr.append(spacing)
    before = int(round(float(cfg.get("space_before_pt", 0.0)) * 20))
    after = int(round(float(cfg.get("space_after_pt", 0.0)) * 20))
    spacing.set(qn("w:before"), str(before))
    spacing.set(qn("w:after"), str(after))
    rule = cfg.get("line_spacing_rule", "exact")
    value = float(cfg.get("line_spacing_value", 28.0))
    if rule == "exact":
        spacing.set(qn("w:line"), str(int(round(value * 20))))
        spacing.set(qn("w:lineRule"), "exact")
    else:
        spacing.set(qn("w:line"), str(int(round(value * 240))))
        spacing.set(qn("w:lineRule"), "auto")

    ind = pPr.find(qn("w:ind"))
    if ind is None:
        ind = OxmlElement("w:ind")
        pPr.append(ind)
    chars = float(cfg.get("first_line_indent_chars", 0.0))
    size = float(cfg.get("font_size_pt", 16.0))
    ind.set(qn("w:firstLineChars"), str(int(round(chars * 100))))
    ind.set(qn("w:firstLine"), str(int(round(chars * size * 20))))

def set_rPr_props(rPr, cfg):
    font_cn = cfg.get("font_cn", "宋体")
    font_en = cfg.get("font_en", "Times New Roman")
    size = float(cfg.get("font_size_pt", 12.0))
    bold = bool(cfg.get("bold", False))
    italic = bool(cfg.get("italic", False))
    color = cfg.get("color_hex", "000000")

    rFonts = rPr.find(qn("w:rFonts"))
    if rFonts is None:
        rFonts = OxmlElement("w:rFonts")
        rPr.append(rFonts)
    rFonts.set(qn("w:ascii"), font_en)
    rFonts.set(qn("w:hAnsi"), font_en)
    rFonts.set(qn("w:eastAsia"), font_cn)
    rFonts.set(qn("w:cs"), font_en)

    sz = rPr.find(qn("w:sz"))
    if sz is None:
        sz = OxmlElement("w:sz")
        rPr.append(sz)
    sz.set(qn("w:val"), str(int(round(size * 2))))

    szCs = rPr.find(qn("w:szCs"))
    if szCs is None:
        szCs = OxmlElement("w:szCs")
        rPr.append(szCs)
    szCs.set(qn("w:val"), str(int(round(size * 2))))

    for tag, flag in (("w:b", bold), ("w:i", italic)):
        el = rPr.find(qn(tag))
        if flag:
            if el is None:
                el = OxmlElement(tag)
                rPr.append(el)
            el.set(qn("w:val"), "1")
        else:
            if el is not None:
                el.set(qn("w:val"), "0")

    color_el = rPr.find(qn("w:color"))
    if color_el is None:
        color_el = OxmlElement("w:color")
        rPr.append(color_el)
    color_el.set(qn("w:val"), color)

def apply_para_cfg(paragraph, cfg):
    pPr = paragraph._p.get_or_add_pPr()
    set_pPr_props(pPr, cfg)

def set_run_font(run, cfg):
    rPr = run._r.get_or_add_rPr()
    set_rPr_props(rPr, cfg)

def add_text_paragraph(doc, text, style_id, cfg):
    p = doc.add_paragraph(style=style_id)
    run = p.add_run(text if text is not None else "")
    apply_para_cfg(p, cfg)
    set_run_font(run, cfg)
    return p

def add_red_line(doc, color="FF0000"):
    cfg = {
        "font_cn": "宋体",
        "font_en": "Times New Roman",
        "font_size_pt": 1.0,
        "bold": False,
        "italic": False,
        "color_hex": color,
        "alignment": "center",
        "line_spacing_rule": "exact",
        "line_spacing_value": 1.0,
        "first_line_indent_chars": 0.0,
        "space_before_pt": 0.0,
        "space_after_pt": 0.0
    }
    p = doc.add_paragraph()
    apply_para_cfg(p, cfg)
    pPr = p._p.get_or_add_pPr()
    pBdr = pPr.find(qn("w:pBdr"))
    if pBdr is None:
        pBdr = OxmlElement("w:pBdr")
        pPr.append(pBdr)
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), "8")
    bottom.set(qn("w:space"), "1")
    bottom.set(qn("w:color"), color)
    pBdr.append(bottom)
    return p

def add_page_number_footer(section, cfg):
    footer = section.footer
    p = footer.paragraphs[0]
    for r in list(p.runs):
        r._r.getparent().remove(r._r)
    apply_para_cfg(p, cfg)

    r = p.add_run("— ")
    set_run_font(r, cfg)

    r = p.add_run()
    fld = OxmlElement("w:fldChar")
    fld.set(qn("w:fldCharType"), "begin")
    r._r.append(fld)
    set_run_font(r, cfg)

    r = p.add_run()
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = " PAGE "
    r._r.append(instr)
    set_run_font(r, cfg)

    r = p.add_run()
    fld = OxmlElement("w:fldChar")
    fld.set(qn("w:fldCharType"), "separate")
    r._r.append(fld)
    set_run_font(r, cfg)

    r = p.add_run("1")
    set_run_font(r, cfg)

    r = p.add_run()
    fld = OxmlElement("w:fldChar")
    fld.set(qn("w:fldCharType"), "end")
    r._r.append(fld)
    set_run_font(r, cfg)

    r = p.add_run(" —")
    set_run_font(r, cfg)

def add_style(doc, style_id, cfg):
    style = doc.styles.add_style(style_id, WD_STYLE_TYPE.PARAGRAPH)
    style.element.set(qn("w:styleId"), style_id)
    try:
        style.base_style = doc.styles["Normal"]
    except Exception:
        pass
    pPr = ensure_style_pPr(style.element)
    set_pPr_props(pPr, cfg)
    rPr = ensure_style_rPr(style.element)
    set_rPr_props(rPr, cfg)
    return style

def main():
    doc = Document()

    section = doc.sections[0]
    section.page_width = Mm(210)
    section.page_height = Mm(297)
    section.top_margin = Mm(TARGET["page"]["margin_top_mm"])
    section.bottom_margin = Mm(TARGET["page"]["margin_bottom_mm"])
    section.left_margin = Mm(TARGET["page"]["margin_left_mm"])
    section.right_margin = Mm(TARGET["page"]["margin_right_mm"])

    red_header_cfg = TARGET["red_header"]
    red_header_org_style_cfg = {
        "font_cn": red_header_cfg.get("font_cn", "方正小标宋简体"),
        "font_en": "Times New Roman",
        "font_size_pt": red_header_cfg.get("font_size_pt", 36.0),
        "bold": False,
        "italic": False,
        "color_hex": red_header_cfg.get("color_hex", "FF0000"),
        "alignment": "center",
        "line_spacing_rule": "exact",
        "line_spacing_value": red_header_cfg.get("font_size_pt", 36.0),
        "first_line_indent_chars": 0.0,
        "space_before_pt": 0.0,
        "space_after_pt": 0.0
    }
    doc_number_style_cfg = {
        "font_cn": red_header_cfg.get("doc_number_font_cn", "仿宋_GB2312"),
        "font_en": "Times New Roman",
        "font_size_pt": red_header_cfg.get("doc_number_size_pt", 16.0),
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

    style_cfgs = {
        "gw_title": TARGET["styles"]["title"],
        "gw_heading_1": TARGET["styles"]["heading_1"],
        "gw_heading_2": TARGET["styles"]["heading_2"],
        "gw_heading_3": TARGET["styles"]["heading_3"],
        "gw_body": TARGET["styles"]["body"],
        "gw_recipient": TARGET["styles"]["recipient"],
        "gw_signature": TARGET["styles"]["signature"],
        "gw_date": TARGET["styles"]["date"],
        "gw_red_header": red_header_org_style_cfg,
        "gw_doc_number": doc_number_style_cfg
    }
    for style_id, cfg in style_cfgs.items():
        add_style(doc, style_id, cfg)

    org = AST.get("red_header_org")
    if not org and red_header_cfg.get("enabled") and red_header_cfg.get("org_name"):
        org = red_header_cfg.get("org_name")

    if org:
        add_text_paragraph(doc, org, "gw_red_header", red_header_org_style_cfg)
        doc_number = AST.get("doc_number")
        if doc_number:
            add_text_paragraph(doc, doc_number, "gw_doc_number", doc_number_style_cfg)
        if red_header_cfg.get("has_red_line", True):
            add_red_line(doc, red_header_cfg.get("color_hex", "FF0000"))

    add_text_paragraph(doc, AST.get("title", ""), "gw_title", TARGET["styles"]["title"])

    recipient = AST.get("recipient")
    if recipient:
        add_text_paragraph(doc, recipient, "gw_recipient", TARGET["styles"]["recipient"])

    for block in AST.get("blocks", []) or []:
        block_type = block.get("type", "body")
        text = block.get("text", "")
        if block_type not in ("heading_1", "heading_2", "heading_3", "body"):
            block_type = "body"
        style_id = "gw_" + block_type
        cfg = TARGET["styles"][block_type]
        add_text_paragraph(doc, text, style_id, cfg)

    attachments = AST.get("attachments", []) or []
    for att in attachments:
        add_text_paragraph(doc, "附件：" + str(att), "gw_body", TARGET["styles"]["body"])

    signature = AST.get("signature")
    if signature:
        add_text_paragraph(doc, signature, "gw_signature", TARGET["styles"]["signature"])

    date = AST.get("date")
    if date:
        add_text_paragraph(doc, date, "gw_date", TARGET["styles"]["date"])

    if TARGET["page"].get("show_page_number", False):
        page_cfg = {
            "font_cn": "宋体",
            "font_en": "Times New Roman",
            "font_size_pt": 14.0,
            "bold": False,
            "italic": False,
            "color_hex": "000000",
            "alignment": "center",
            "line_spacing_rule": "exact",
            "line_spacing_value": 14.0,
            "first_line_indent_chars": 0.0,
            "space_before_pt": 0.0,
            "space_after_pt": 0.0
        }
        add_page_number_footer(section, page_cfg)

    doc.save("output.docx")

if __name__ == "__main__":
    main()
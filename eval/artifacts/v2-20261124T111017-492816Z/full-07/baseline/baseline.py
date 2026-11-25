from docx import Document
from docx.shared import Mm, Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.enum.style import WD_STYLE_TYPE
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

CONFIG = {
    "page": {
        "size": "A4",
        "margin_top_mm": 36.0,
        "margin_bottom_mm": 35.0,
        "margin_left_mm": 28.0,
        "margin_right_mm": 26.0,
        "show_page_number": False,
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
            "font_cn": "宋体",
            "font_en": "Times New Roman",
            "font_size_pt": 14.0,
            "bold": False,
            "italic": False,
            "color_hex": "000000",
            "alignment": "justify",
            "line_spacing_rule": "exact",
            "line_spacing_value": 30.0,
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
        {"type": "body", "text": "请各部门核对纸质与电子档案目录，整理归档清单并反馈检查结果。", "rows": None},
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
    "both": WD_ALIGN_PARAGRAPH.JUSTIFY,
}


def set_rpr_fonts(rpr, font_cn, font_en, size_pt, color_hex="000000", bold=False, italic=False):
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = OxmlElement("w:rFonts")
        rpr.insert(0, rfonts)
    rfonts.set(qn("w:ascii"), font_en)
    rfonts.set(qn("w:hAnsi"), font_en)
    rfonts.set(qn("w:eastAsia"), font_cn)
    rfonts.set(qn("w:cs"), font_en)

    half_points = str(int(round(size_pt * 2)))
    for tag in ("w:sz", "w:szCs"):
        el = rpr.find(qn(tag))
        if el is None:
            el = OxmlElement(tag)
            rpr.append(el)
        el.set(qn("w:val"), half_points)

    color = rpr.find(qn("w:color"))
    if color is None:
        color = OxmlElement("w:color")
        rpr.append(color)
    color.set(qn("w:val"), color_hex)

    for tag in ("w:b", "w:bCs"):
        el = rpr.find(qn(tag))
        if el is None:
            el = OxmlElement(tag)
            rpr.append(el)
        el.set(qn("w:val"), "1" if bold else "0")

    for tag in ("w:i", "w:iCs"):
        el = rpr.find(qn(tag))
        if el is None:
            el = OxmlElement(tag)
            rpr.append(el)
        el.set(qn("w:val"), "1" if italic else "0")


def apply_para_format(pf, alignment, line_value, first_chars, font_size_pt, before, after):
    pf.alignment = ALIGN_MAP.get(alignment, WD_ALIGN_PARAGRAPH.JUSTIFY)
    pf.space_before = Pt(before)
    pf.space_after = Pt(after)
    pf.line_spacing = Pt(line_value)
    pf.line_spacing_rule = WD_LINE_SPACING.EXACTLY
    pf.left_indent = Pt(0)
    pf.right_indent = Pt(0)
    pf.first_line_indent = Pt(first_chars * font_size_pt)


def set_first_line_chars(p, first_chars, font_size_pt):
    ppr = p._p.get_or_add_pPr()
    ind = ppr.get_or_add_ind()
    ind.set(qn("w:firstLineChars"), str(int(round(first_chars * 100))))
    ind.set(qn("w:firstLine"), str(int(round(first_chars * font_size_pt * 20))))
    for attr in ("w:hanging", "w:hangingChars"):
        if ind.get(qn(attr)) is not None:
            del ind.attrib[qn(attr)]


def ensure_style(doc, style_id, cfg):
    try:
        style = doc.styles[style_id]
    except KeyError:
        style = doc.styles.add_style(style_id, WD_STYLE_TYPE.PARAGRAPH)
    style.base_style = doc.styles["Normal"]

    set_rpr_fonts(
        style.element.get_or_add_rPr(),
        cfg["font_cn"],
        cfg["font_en"],
        cfg["font_size_pt"],
        cfg.get("color_hex", "000000"),
        cfg.get("bold", False),
        cfg.get("italic", False),
    )

    apply_para_format(
        style.paragraph_format,
        cfg.get("alignment", "justify"),
        cfg.get("line_spacing_value", 28.0),
        cfg.get("first_line_indent_chars", 0.0),
        cfg["font_size_pt"],
        cfg.get("space_before_pt", 0.0),
        cfg.get("space_after_pt", 0.0),
    )

    ppr = style.element.get_or_add_pPr()
    ind = ppr.get_or_add_ind()
    ind.set(qn("w:firstLineChars"), str(int(round(cfg.get("first_line_indent_chars", 0.0) * 100))))
    ind.set(qn("w:firstLine"), str(int(round(cfg.get("first_line_indent_chars", 0.0) * cfg["font_size_pt"] * 20))))
    for attr in ("w:hanging", "w:hangingChars"):
        if ind.get(qn(attr)) is not None:
            del ind.attrib[qn(attr)]

    return style


def add_para(doc, text, style_id, cfg):
    p = doc.add_paragraph(style=style_id)
    apply_para_format(
        p.paragraph_format,
        cfg.get("alignment", "justify"),
        cfg.get("line_spacing_value", 28.0),
        cfg.get("first_line_indent_chars", 0.0),
        cfg["font_size_pt"],
        cfg.get("space_before_pt", 0.0),
        cfg.get("space_after_pt", 0.0),
    )
    set_first_line_chars(p, cfg.get("first_line_indent_chars", 0.0), cfg["font_size_pt"])

    if text:
        run = p.add_run(str(text))
        set_rpr_fonts(
            run._element.get_or_add_rPr(),
            cfg["font_cn"],
            cfg["font_en"],
            cfg["font_size_pt"],
            cfg.get("color_hex", "000000"),
            cfg.get("bold", False),
            cfg.get("italic", False),
        )
    return p


def add_bottom_border(p, color_hex="FF0000", sz=24, space=1):
    ppr = p._p.get_or_add_pPr()
    pbdr = ppr.get_or_add_pBdr()

    bottom = pbdr.find(qn("w:bottom"))
    if bottom is None:
        bottom = OxmlElement("w:bottom")
        pbdr.append(bottom)

    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), str(sz))
    bottom.set(qn("w:space"), str(space))
    bottom.set(qn("w:color"), color_hex)


def add_page_number_footer(section):
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

    set_rpr_fonts(
        run._element.get_or_add_rPr(),
        "宋体",
        "Times New Roman",
        14.0,
        "000000",
        False,
        False,
    )


def main():
    doc = Document()

    section = doc.sections[0]
    section.page_width = Mm(210)
    section.page_height = Mm(297)
    section.top_margin = Mm(CONFIG["page"]["margin_top_mm"])
    section.bottom_margin = Mm(CONFIG["page"]["margin_bottom_mm"])
    section.left_margin = Mm(CONFIG["page"]["margin_left_mm"])
    section.right_margin = Mm(CONFIG["page"]["margin_right_mm"])

    normal = doc.styles["Normal"]
    normal.font.name = "Times New Roman"
    normal.font.size = Pt(14)
    set_rpr_fonts(normal.element.get_or_add_rPr(), "宋体", "Times New Roman", 14.0)

    style_map = {
        "gw_title": CONFIG["styles"]["title"],
        "gw_heading_1": CONFIG["styles"]["heading_1"],
        "gw_heading_2": CONFIG["styles"]["heading_2"],
        "gw_heading_3": CONFIG["styles"]["heading_3"],
        "gw_body": CONFIG["styles"]["body"],
        "gw_recipient": CONFIG["styles"]["recipient"],
        "gw_signature": CONFIG["styles"]["signature"],
        "gw_date": CONFIG["styles"]["date"],
        "gw_doc_number": {
            "font_cn": CONFIG["red_header"]["doc_number_font_cn"],
            "font_en": "Times New Roman",
            "font_size_pt": CONFIG["red_header"]["doc_number_size_pt"],
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
        "gw_red_header": {
            "font_cn": CONFIG["red_header"]["font_cn"],
            "font_en": "Times New Roman",
            "font_size_pt": CONFIG["red_header"]["font_size_pt"],
            "bold": False,
            "italic": False,
            "color_hex": CONFIG["red_header"]["color_hex"],
            "alignment": "center",
            "line_spacing_rule": "exact",
            "line_spacing_value": 50.0,
            "first_line_indent_chars": 0.0,
            "space_before_pt": 0.0,
            "space_after_pt": 0.0,
        },
    }

    for style_id, cfg in style_map.items():
        ensure_style(doc, style_id, cfg)

    red_enabled = bool(CONFIG["red_header"]["enabled"])
    red_cfg = CONFIG["red_header"]
    red_org = AST.get("red_header_org") or red_cfg.get("org_name")
    doc_number = AST.get("doc_number")

    red_org_p = None
    doc_number_p = None

    if red_enabled and red_org:
        red_org_p = add_para(doc, red_org, "gw_red_header", style_map["gw_red_header"])

    if doc_number:
        doc_number_p = add_para(doc, doc_number, "gw_doc_number", style_map["gw_doc_number"])

    if red_enabled and red_cfg.get("has_red_line"):
        if doc_number_p is not None:
            add_bottom_border(doc_number_p, red_cfg["color_hex"], 24, 1)
        elif red_org_p is not None:
            add_bottom_border(red_org_p, red_cfg["color_hex"], 24, 1)

    title = AST.get("title")
    if title:
        add_para(doc, title, "gw_title", style_map["gw_title"])

    recipient = AST.get("recipient")
    if recipient:
        add_para(doc, recipient, "gw_recipient", style_map["gw_recipient"])

    block_style_map = {
        "heading_1": ("gw_heading_1", style_map["gw_heading_1"]),
        "heading_2": ("gw_heading_2", style_map["gw_heading_2"]),
        "heading_3": ("gw_heading_3", style_map["gw_heading_3"]),
        "body": ("gw_body", style_map["gw_body"]),
    }

    for block in AST.get("blocks", []):
        block_type = block.get("type", "body")
        style_id, cfg = block_style_map.get(block_type, block_style_map["body"])
        text = block.get("text")
        if text is not None:
            add_para(doc, text, style_id, cfg)

    attachments = AST.get("attachments", [])
    if attachments:
        add_para(doc, "附件：", "gw_body", style_map["gw_body"])
        for idx, attachment in enumerate(attachments, 1):
            add_para(doc, f"{idx}. {attachment}", "gw_body", style_map["gw_body"])

    signature = AST.get("signature")
    if signature:
        add_para(doc, signature, "gw_signature", style_map["gw_signature"])

    date_text = AST.get("date")
    if date_text:
        add_para(doc, date_text, "gw_date", style_map["gw_date"])

    if CONFIG["page"].get("show_page_number"):
        add_page_number_footer(section)

    doc.save("output.docx")


if __name__ == "__main__":
    main()

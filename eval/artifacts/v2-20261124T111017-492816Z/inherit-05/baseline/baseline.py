from docx import Document
from docx.shared import Pt, Mm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.enum.style import WD_STYLE_TYPE
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

config = {
    "id": "gbt-9704-2012",
    "name": "GB/T 9704-2012 国标公文",
    "page": {
        "size": "A4",
        "margin_top_mm": 35.0,
        "margin_bottom_mm": 35.0,
        "margin_left_mm": 28.0,
        "margin_right_mm": 24.0,
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
            "line_spacing_value": 24.0,
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

ast = {
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


def align_from_str(s):
    return {
        "center": WD_ALIGN_PARAGRAPH.CENTER,
        "justify": WD_ALIGN_PARAGRAPH.JUSTIFY,
        "both": WD_ALIGN_PARAGRAPH.JUSTIFY,
        "left": WD_ALIGN_PARAGRAPH.LEFT,
        "right": WD_ALIGN_PARAGRAPH.RIGHT
    }[s]


def set_run_font(run, font_cn, font_en, size_pt, bold=False, italic=False, color_hex="000000"):
    run.font.name = font_en
    run.font.size = Pt(size_pt)
    run.font.bold = bold
    run.font.italic = italic
    run.font.color.rgb = RGBColor.from_string(color_hex)

    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.get_or_add_rFonts()
    rFonts.set(qn("w:ascii"), font_en)
    rFonts.set(qn("w:hAnsi"), font_en)
    rFonts.set(qn("w:eastAsia"), font_cn)
    rFonts.set(qn("w:cs"), font_en)

    sz = rPr.get_or_add_sz()
    sz.set(qn("w:val"), str(int(size_pt * 2)))
    szCs = rPr.get_or_add_szCs()
    szCs.set(qn("w:val"), str(int(size_pt * 2)))

    color = rPr.get_or_add_color()
    color.set(qn("w:val"), color_hex.replace("#", ""))


def set_style_font(style, font_cn, font_en, size_pt, bold=False, italic=False, color_hex="000000"):
    style.font.name = font_en
    style.font.size = Pt(size_pt)
    style.font.bold = bold
    style.font.italic = italic
    style.font.color.rgb = RGBColor.from_string(color_hex)

    rPr = style.element.get_or_add_rPr()
    rFonts = rPr.get_or_add_rFonts()
    rFonts.set(qn("w:ascii"), font_en)
    rFonts.set(qn("w:hAnsi"), font_en)
    rFonts.set(qn("w:eastAsia"), font_cn)
    rFonts.set(qn("w:cs"), font_en)

    sz = rPr.get_or_add_sz()
    sz.set(qn("w:val"), str(int(size_pt * 2)))
    szCs = rPr.get_or_add_szCs()
    szCs.set(qn("w:val"), str(int(size_pt * 2)))

    color = rPr.get_or_add_color()
    color.set(qn("w:val"), color_hex.replace("#", ""))


def set_paragraph_indent_chars(paragraph, chars, font_size_pt):
    pPr = paragraph._p.get_or_add_pPr()
    ind = pPr.get_or_add_ind()
    ind.set(qn("w:firstLineChars"), str(int(chars * 100)))
    ind.set(qn("w:firstLine"), str(int(chars * font_size_pt * 20)))


def set_style_indent_chars(style, chars, font_size_pt):
    pPr = style.element.get_or_add_pPr()
    ind = pPr.get_or_add_ind()
    ind.set(qn("w:firstLineChars"), str(int(chars * 100)))
    ind.set(qn("w:firstLine"), str(int(chars * font_size_pt * 20)))


def set_paragraph_format(paragraph, alignment, space_before_pt, space_after_pt,
                         line_spacing_rule, line_spacing_value,
                         first_line_indent_chars, font_size_pt):
    paragraph.alignment = alignment
    pf = paragraph.paragraph_format
    pf.space_before = Pt(space_before_pt)
    pf.space_after = Pt(space_after_pt)

    if line_spacing_rule == "exact":
        pf.line_spacing_rule = WD_LINE_SPACING.EXACTLY
        pf.line_spacing = Pt(line_spacing_value)
    elif line_spacing_rule == "single":
        pf.line_spacing_rule = WD_LINE_SPACING.SINGLE
        pf.line_spacing = None
    elif line_spacing_rule == "1.5":
        pf.line_spacing_rule = WD_LINE_SPACING.ONE_POINT_FIVE
        pf.line_spacing = None
    elif line_spacing_rule == "double":
        pf.line_spacing_rule = WD_LINE_SPACING.DOUBLE
        pf.line_spacing = None

    set_paragraph_indent_chars(paragraph, first_line_indent_chars, font_size_pt)


def set_style_paragraph_format(style, alignment, space_before_pt, space_after_pt,
                               line_spacing_rule, line_spacing_value,
                               first_line_indent_chars, font_size_pt):
    style.paragraph_format.alignment = alignment
    style.paragraph_format.space_before = Pt(space_before_pt)
    style.paragraph_format.space_after = Pt(space_after_pt)

    if line_spacing_rule == "exact":
        style.paragraph_format.line_spacing_rule = WD_LINE_SPACING.EXACTLY
        style.paragraph_format.line_spacing = Pt(line_spacing_value)
    elif line_spacing_rule == "single":
        style.paragraph_format.line_spacing_rule = WD_LINE_SPACING.SINGLE
        style.paragraph_format.line_spacing = None

    set_style_indent_chars(style, first_line_indent_chars, font_size_pt)


def get_or_create_style(doc, style_id):
    try:
        return doc.styles[style_id]
    except KeyError:
        return doc.styles.add_style(style_id, WD_STYLE_TYPE.PARAGRAPH)


def add_text_paragraph(doc, text, style_id, cfg):
    p = doc.add_paragraph(style=style_id)
    run = p.add_run(text)
    set_run_font(
        run,
        cfg["font_cn"],
        cfg["font_en"],
        cfg["font_size_pt"],
        cfg.get("bold", False),
        cfg.get("italic", False),
        cfg.get("color_hex", "000000")
    )
    set_paragraph_format(
        p,
        align_from_str(cfg["alignment"]),
        cfg["space_before_pt"],
        cfg["space_after_pt"],
        cfg["line_spacing_rule"],
        cfg["line_spacing_value"],
        cfg["first_line_indent_chars"],
        cfg["font_size_pt"]
    )
    return p


def add_page_number_field(paragraph):
    run = paragraph.add_run("— ")
    set_run_font(run, "宋体", "Times New Roman", 14, False, False, "000000")

    run = paragraph.add_run()
    fld_begin = OxmlElement("w:fldChar")
    fld_begin.set(qn("w:fldCharType"), "begin")
    run._r.append(fld_begin)
    set_run_font(run, "宋体", "Times New Roman", 14, False, False, "000000")

    run = paragraph.add_run()
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = " PAGE "
    run._r.append(instr)
    set_run_font(run, "宋体", "Times New Roman", 14, False, False, "000000")

    run = paragraph.add_run()
    fld_sep = OxmlElement("w:fldChar")
    fld_sep.set(qn("w:fldCharType"), "separate")
    run._r.append(fld_sep)
    set_run_font(run, "宋体", "Times New Roman", 14, False, False, "000000")

    run = paragraph.add_run("1")
    set_run_font(run, "宋体", "Times New Roman", 14, False, False, "000000")

    run = paragraph.add_run()
    fld_end = OxmlElement("w:fldChar")
    fld_end.set(qn("w:fldCharType"), "end")
    run._r.append(fld_end)
    set_run_font(run, "宋体", "Times New Roman", 14, False, False, "000000")

    run = paragraph.add_run(" —")
    set_run_font(run, "宋体", "Times New Roman", 14, False, False, "000000")


doc = Document()

section = doc.sections[0]
section.page_width = Mm(210)
section.page_height = Mm(297)
section.top_margin = Mm(config["page"]["margin_top_mm"])
section.bottom_margin = Mm(config["page"]["margin_bottom_mm"])
section.left_margin = Mm(config["page"]["margin_left_mm"])
section.right_margin = Mm(config["page"]["margin_right_mm"])

style_ids = [
    "gw_title", "gw_heading_1", "gw_heading_2", "gw_heading_3",
    "gw_body", "gw_recipient", "gw_signature", "gw_date", "gw_doc_number"
]
for sid in style_ids:
    get_or_create_style(doc, sid)

styles_cfg = config["styles"]
role_map = {
    "gw_title": styles_cfg["title"],
    "gw_heading_1": styles_cfg["heading_1"],
    "gw_heading_2": styles_cfg["heading_2"],
    "gw_heading_3": styles_cfg["heading_3"],
    "gw_body": styles_cfg["body"],
    "gw_recipient": styles_cfg["recipient"],
    "gw_signature": styles_cfg["signature"],
    "gw_date": styles_cfg["date"],
    "gw_doc_number": {
        "font_cn": config["red_header"]["doc_number_font_cn"],
        "font_en": "Times New Roman",
        "font_size_pt": config["red_header"]["doc_number_size_pt"],
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
}

for sid, cfg in role_map.items():
    style = doc.styles[sid]
    set_style_font(
        style,
        cfg["font_cn"],
        cfg["font_en"],
        cfg["font_size_pt"],
        cfg.get("bold", False),
        cfg.get("italic", False),
        cfg.get("color_hex", "000000")
    )
    set_style_paragraph_format(
        style,
        align_from_str(cfg["alignment"]),
        cfg["space_before_pt"],
        cfg["space_after_pt"],
        cfg["line_spacing_rule"],
        cfg["line_spacing_value"],
        cfg["first_line_indent_chars"],
        cfg["font_size_pt"]
    )

red_cfg = config["red_header"]
if red_cfg.get("enabled"):
    org_name = ast.get("red_header_org") or red_cfg.get("org_name")
    if org_name:
        p_org = doc.add_paragraph()
        run = p_org.add_run(org_name)
        set_run_font(
            run,
            red_cfg["font_cn"],
            "Times New Roman",
            red_cfg["font_size_pt"],
            False,
            False,
            red_cfg["color_hex"]
        )
        set_paragraph_format(
            p_org,
            WD_ALIGN_PARAGRAPH.CENTER,
            0,
            0,
            "exact",
            red_cfg["font_size_pt"],
            0,
            red_cfg["font_size_pt"]
        )

    doc_number = ast.get("doc_number")
    if doc_number:
        p_num = doc.add_paragraph(style="gw_doc_number")
        run = p_num.add_run(doc_number)
        set_run_font(
            run,
            red_cfg["doc_number_font_cn"],
            "Times New Roman",
            red_cfg["doc_number_size_pt"],
            False,
            False,
            "000000"
        )
        set_paragraph_format(
            p_num,
            WD_ALIGN_PARAGRAPH.CENTER,
            0,
            0,
            "exact",
            28,
            0,
            red_cfg["doc_number_size_pt"]
        )

        if red_cfg.get("has_red_line"):
            pPr = p_num._p.get_or_add_pPr()
            pBdr = pPr.find(qn("w:pBdr"))
            if pBdr is None:
                pBdr = OxmlElement("w:pBdr")
                pPr.append(pBdr)
            bottom = OxmlElement("w:bottom")
            bottom.set(qn("w:val"), "single")
            bottom.set(qn("w:sz"), "6")
            bottom.set(qn("w:space"), "1")
            bottom.set(qn("w:color"), red_cfg["color_hex"].replace("#", ""))
            pBdr.append(bottom)

title_cfg = styles_cfg["title"]
add_text_paragraph(doc, ast["title"], "gw_title", title_cfg)

recipient_cfg = styles_cfg["recipient"]
add_text_paragraph(doc, ast["recipient"], "gw_recipient", recipient_cfg)

for block in ast.get("blocks", []):
    btype = block.get("type")
    text = block.get("text") or ""
    if btype == "heading_1":
        cfg = styles_cfg["heading_1"]
        style_id = "gw_heading_1"
    elif btype == "heading_2":
        cfg = styles_cfg["heading_2"]
        style_id = "gw_heading_2"
    elif btype == "heading_3":
        cfg = styles_cfg["heading_3"]
        style_id = "gw_heading_3"
    else:
        cfg = styles_cfg["body"]
        style_id = "gw_body"
    add_text_paragraph(doc, text, style_id, cfg)

signature_cfg = styles_cfg["signature"]
add_text_paragraph(doc, ast["signature"], "gw_signature", signature_cfg)

date_cfg = styles_cfg["date"]
add_text_paragraph(doc, ast["date"], "gw_date", date_cfg)

if config["page"].get("show_page_number"):
    footer = section.footer
    if footer.paragraphs:
        p_footer = footer.paragraphs[0]
    else:
        p_footer = footer.add_paragraph()

    for child in list(p_footer._p):
        p_footer._p.remove(child)

    set_paragraph_format(
        p_footer,
        WD_ALIGN_PARAGRAPH.CENTER,
        0,
        0,
        "single",
        14,
        0,
        14
    )
    add_page_number_field(p_footer)

doc.save("output.docx")

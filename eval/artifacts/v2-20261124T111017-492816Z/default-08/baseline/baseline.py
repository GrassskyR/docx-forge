from docx import Document
from docx.shared import Mm, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

CONFIG = {
    "id": "gbt-9704-2012",
    "name": "GB/T 9704-2012 国标公文",
    "source_type": "builtin",
    "parent_id": None,
    "base_template_path": None,
    "description": "",
    "page": {
        "size": "A4",
        "margin_top_mm": 37.0,
        "margin_bottom_mm": 35.0,
        "margin_left_mm": 28.0,
        "margin_right_mm": 26.0,
        "show_page_number": False,
    },
    "red_header": {
        "enabled": True,
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
            "font_cn": "思源宋体",
            "font_en": "Times New Roman",
            "font_size_pt": 16.0,
            "bold": False,
            "italic": False,
            "color_hex": "000000",
            "alignment": "justify",
            "line_spacing_rule": "exact",
            "line_spacing_value": 28.0,
            "first_line_indent_chars": 0.0,
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

ALIGN_MAP = {
    "left": WD_ALIGN_PARAGRAPH.LEFT,
    "center": WD_ALIGN_PARAGRAPH.CENTER,
    "right": WD_ALIGN_PARAGRAPH.RIGHT,
    "justify": WD_ALIGN_PARAGRAPH.JUSTIFY,
    "both": WD_ALIGN_PARAGRAPH.JUSTIFY,
}


def set_run_font(run, font_cn, font_en, size_pt, color_hex, bold=False, italic=False):
    run.font.name = font_en
    run.font.size = Pt(size_pt)
    run.font.bold = bold
    run.font.italic = italic
    run.font.color.rgb = RGBColor.from_string(color_hex)

    rPr = run._element.get_or_add_rPr()

    rFonts = rPr.find(qn("w:rFonts"))
    if rFonts is None:
        rFonts = OxmlElement("w:rFonts")
        rPr.insert(0, rFonts)
    rFonts.set(qn("w:ascii"), font_en)
    rFonts.set(qn("w:hAnsi"), font_en)
    rFonts.set(qn("w:eastAsia"), font_cn)
    rFonts.set(qn("w:cs"), font_en)

    sz_val = str(int(round(size_pt * 2)))
    sz = rPr.find(qn("w:sz"))
    if sz is None:
        sz = OxmlElement("w:sz")
        rPr.append(sz)
    sz.set(qn("w:val"), sz_val)

    szCs = rPr.find(qn("w:szCs"))
    if szCs is None:
        szCs = OxmlElement("w:szCs")
        rPr.append(szCs)
    szCs.set(qn("w:val"), sz_val)


def set_first_line_indent(paragraph, chars, font_size_pt):
    pPr = paragraph._p.get_or_add_pPr()

    try:
        ind = pPr.get_or_add_ind()
    except AttributeError:
        ind = pPr.find(qn("w:ind"))
        if ind is None:
            ind = OxmlElement("w:ind")
            pPr.append(ind)

    ind.set(qn("w:firstLineChars"), str(int(round(chars * 100))))
    ind.set(qn("w:firstLine"), str(int(round(chars * font_size_pt * 20))))


def set_para_format(
    paragraph,
    alignment,
    line_spacing_value,
    first_line_indent_chars,
    font_size_pt,
    space_before_pt=0.0,
    space_after_pt=0.0,
):
    paragraph.alignment = ALIGN_MAP.get(alignment, WD_ALIGN_PARAGRAPH.JUSTIFY)

    pf = paragraph.paragraph_format
    pf.line_spacing_rule = WD_LINE_SPACING.EXACTLY
    pf.line_spacing = Pt(line_spacing_value)
    pf.space_before = Pt(space_before_pt)
    pf.space_after = Pt(space_after_pt)

    set_first_line_indent(paragraph, first_line_indent_chars, font_size_pt)


def add_bottom_border(paragraph, color_hex="FF0000", sz=8, space=0):
    pPr = paragraph._p.get_or_add_pPr()

    pBdr = pPr.find(qn("w:pBdr"))
    if pBdr is None:
        pBdr = OxmlElement("w:pBdr")
        pPr.append(pBdr)

    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), str(sz))
    bottom.set(qn("w:space"), str(space))
    bottom.set(qn("w:color"), color_hex)
    pBdr.append(bottom)


def add_text_paragraph(doc, text, style_cfg):
    paragraph = doc.add_paragraph()
    set_para_format(
        paragraph,
        style_cfg["alignment"],
        style_cfg["line_spacing_value"],
        style_cfg["first_line_indent_chars"],
        style_cfg["font_size_pt"],
        style_cfg["space_before_pt"],
        style_cfg["space_after_pt"],
    )
    run = paragraph.add_run(text)
    set_run_font(
        run,
        style_cfg["font_cn"],
        style_cfg["font_en"],
        style_cfg["font_size_pt"],
        style_cfg["color_hex"],
        style_cfg["bold"],
        style_cfg["italic"],
    )
    return paragraph


def add_page_number_field(paragraph):
    run = paragraph.add_run()
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

    set_run_font(run, "宋体", "Times New Roman", 14.0, "000000")


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
    normal.font.size = Pt(16)
    normal_rPr = normal._element.get_or_add_rPr()
    normal_rFonts = normal_rPr.find(qn("w:rFonts"))
    if normal_rFonts is None:
        normal_rFonts = OxmlElement("w:rFonts")
        normal_rPr.append(normal_rFonts)
    normal_rFonts.set(qn("w:ascii"), "Times New Roman")
    normal_rFonts.set(qn("w:hAnsi"), "Times New Roman")
    normal_rFonts.set(qn("w:eastAsia"), "仿宋_GB2312")
    normal_rFonts.set(qn("w:cs"), "Times New Roman")

    red_cfg = CONFIG["red_header"]

    red_org = AST.get("red_header_org") or red_cfg.get("org_name") or ""
    if red_cfg.get("enabled", False) and red_org:
        paragraph = doc.add_paragraph()
        set_para_format(
            paragraph,
            "center",
            red_cfg["font_size_pt"],
            0.0,
            red_cfg["font_size_pt"],
            0.0,
            0.0,
        )
        run = paragraph.add_run(red_org)
        set_run_font(
            run,
            red_cfg["font_cn"],
            "Times New Roman",
            red_cfg["font_size_pt"],
            red_cfg["color_hex"],
            False,
            False,
        )

    doc_number = AST.get("doc_number") or ""
    if doc_number:
        paragraph = doc.add_paragraph()
        set_para_format(paragraph, "center", 28.0, 0.0, red_cfg["doc_number_size_pt"], 0.0, 0.0)
        run = paragraph.add_run(doc_number)
        set_run_font(
            run,
            red_cfg["doc_number_font_cn"],
            "Times New Roman",
            red_cfg["doc_number_size_pt"],
            "000000",
            False,
            False,
        )

    if red_cfg.get("has_red_line", False):
        paragraph = doc.add_paragraph()
        set_para_format(paragraph, "center", 1.0, 0.0, 1.0, 0.0, 0.0)
        run = paragraph.add_run("")
        set_run_font(
            run,
            "宋体",
            "Times New Roman",
            1.0,
            red_cfg["color_hex"],
            False,
            False,
        )
        add_bottom_border(paragraph, red_cfg["color_hex"], sz=8, space=0)

    title = AST.get("title") or ""
    if title:
        add_text_paragraph(doc, title, CONFIG["styles"]["title"])

    recipient = AST.get("recipient") or ""
    if recipient:
        add_text_paragraph(doc, recipient, CONFIG["styles"]["recipient"])

    for block in AST.get("blocks", []):
        block_type = block.get("type")
        text = block.get("text") or ""
        if block_type in ("heading_1", "heading_2", "heading_3", "body"):
            style_cfg = CONFIG["styles"][block_type]
            if text:
                add_text_paragraph(doc, text, style_cfg)

    attachments = AST.get("attachments") or []
    if attachments:
        body_cfg = CONFIG["styles"]["body"]
        for attachment in attachments:
            attachment_text = str(attachment)
            if attachment_text:
                add_text_paragraph(doc, attachment_text, body_cfg)

    signature = AST.get("signature") or ""
    if signature:
        add_text_paragraph(doc, signature, CONFIG["styles"]["signature"])

    date_text = AST.get("date") or ""
    if date_text:
        add_text_paragraph(doc, date_text, CONFIG["styles"]["date"])

    if CONFIG["page"].get("show_page_number", False):
        footer = section.footer
        paragraph = footer.paragraphs[0]
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        add_page_number_field(paragraph)

    doc.save("output.docx")


if __name__ == "__main__":
    main()

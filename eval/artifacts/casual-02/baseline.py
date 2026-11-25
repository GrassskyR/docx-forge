from docx import Document
from docx.shared import Mm, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn


PROFILE = {
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
        "body": {
            "font_cn": "宋体",
            "font_en": "Times New Roman",
            "font_size_pt": 12.0,
            "bold": False,
            "italic": False,
            "color_hex": "000000",
            "alignment": "justify",
            "line_spacing_rule": "exact",
            "line_spacing_value": 24.0,
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
    "red_header_org": None,
    "doc_number": None,
    "title": "关于开展业务培训的通知",
    "recipient": "各部门：",
    "blocks": [
        {"type": "heading_1", "text": "一、培训安排", "rows": None},
        {"type": "body", "text": "请各部门做好组织协调，按时参加业务培训。", "rows": None},
    ],
    "attachments": [],
    "signature": "综合办公室",
    "date": "2026年11月24日",
}


def set_run_font(run, cn, en, size_pt, bold=False, italic=False, color_hex="000000"):
    run.font.name = en
    run.font.size = Pt(size_pt)
    run.font.bold = bold
    run.font.italic = italic
    run.font.color.rgb = RGBColor.from_string(color_hex)

    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.get_or_add_rFonts()
    rFonts.set(qn("w:ascii"), en)
    rFonts.set(qn("w:hAnsi"), en)
    rFonts.set(qn("w:eastAsia"), cn)
    rFonts.set(qn("w:cs"), en)


def set_paragraph_format(p, alignment, line_spacing_pt, first_line_chars,
                         space_before_pt, space_after_pt):
    alignment_map = {
        "left": WD_ALIGN_PARAGRAPH.LEFT,
        "center": WD_ALIGN_PARAGRAPH.CENTER,
        "right": WD_ALIGN_PARAGRAPH.RIGHT,
        "justify": WD_ALIGN_PARAGRAPH.JUSTIFY,
    }
    p.alignment = alignment_map.get(alignment, WD_ALIGN_PARAGRAPH.JUSTIFY)
    p.paragraph_format.space_before = Pt(space_before_pt)
    p.paragraph_format.space_after = Pt(space_after_pt)
    p.paragraph_format.line_spacing = Pt(line_spacing_pt)
    p.paragraph_format.line_spacing_rule = WD_LINE_SPACING.EXACTLY

    pPr = p._p.get_or_add_pPr()
    ind = pPr.get_or_add_ind()
    ind.set(qn("w:firstLineChars"), str(int(first_line_chars * 100)))
    if first_line_chars == 0:
        ind.set(qn("w:firstLine"), "0")
    else:
        if ind.get(qn("w:firstLine")) is not None:
            del ind.attrib[qn("w:firstLine")]


def add_text_paragraph(doc, text, style_spec):
    p = doc.add_paragraph()
    set_paragraph_format(
        p,
        style_spec["alignment"],
        style_spec["line_spacing_value"],
        style_spec["first_line_indent_chars"],
        style_spec["space_before_pt"],
        style_spec["space_after_pt"],
    )
    run = p.add_run(text)
    set_run_font(
        run,
        style_spec["font_cn"],
        style_spec["font_en"],
        style_spec["font_size_pt"],
        style_spec["bold"],
        style_spec["italic"],
        style_spec["color_hex"],
    )
    return p


def add_red_line(doc, color_hex="FF0000"):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(0)
    pPr = p._p.get_or_add_pPr()
    pBdr = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), "18")
    bottom.set(qn("w:space"), "0")
    bottom.set(qn("w:color"), color_hex)
    pBdr.append(bottom)
    pPr.append(pBdr)
    return p


def add_red_header_if_needed(doc, profile, ast):
    rh = profile["red_header"]
    org = ast.get("red_header_org") or rh.get("org_name")
    if not rh.get("enabled") or not org:
        return

    p = doc.add_paragraph()
    set_paragraph_format(p, "center", 44.0, 0.0, 0.0, 0.0)
    run = p.add_run(org)
    set_run_font(
        run,
        rh.get("font_cn") or "方正小标宋简体",
        "Times New Roman",
        rh.get("font_size_pt") or 36.0,
        False,
        False,
        rh.get("color_hex") or "FF0000",
    )

    if rh.get("has_red_line"):
        add_red_line(doc, rh.get("color_hex") or "FF0000")


def add_page_field(paragraph):
    run_begin = paragraph.add_run()
    set_run_font(run_begin, "宋体", "Times New Roman", 14.0, False, False, "000000")
    fld_begin = OxmlElement("w:fldChar")
    fld_begin.set(qn("w:fldCharType"), "begin")
    run_begin._r.append(fld_begin)

    run_instr = paragraph.add_run()
    set_run_font(run_instr, "宋体", "Times New Roman", 14.0, False, False, "000000")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = " PAGE "
    run_instr._r.append(instr)

    run_sep = paragraph.add_run()
    set_run_font(run_sep, "宋体", "Times New Roman", 14.0, False, False, "000000")
    fld_sep = OxmlElement("w:fldChar")
    fld_sep.set(qn("w:fldCharType"), "separate")
    run_sep._r.append(fld_sep)

    run_text = paragraph.add_run("1")
    set_run_font(run_text, "宋体", "Times New Roman", 14.0, False, False, "000000")

    run_end = paragraph.add_run()
    set_run_font(run_end, "宋体", "Times New Roman", 14.0, False, False, "000000")
    fld_end = OxmlElement("w:fldChar")
    fld_end.set(qn("w:fldCharType"), "end")
    run_end._r.append(fld_end)


def add_page_number_footer(section):
    footer = section.footer
    for p in list(footer.paragraphs):
        p._element.getparent().remove(p._element)

    p = footer.add_paragraph()
    set_paragraph_format(p, "center", 14.0, 0.0, 0.0, 0.0)

    run_left = p.add_run("— ")
    set_run_font(run_left, "宋体", "Times New Roman", 14.0, False, False, "000000")

    add_page_field(p)

    run_right = p.add_run(" —")
    set_run_font(run_right, "宋体", "Times New Roman", 14.0, False, False, "000000")


def build():
    doc = Document()

    body = doc.element.body
    for p in list(body.findall(qn("w:p"))):
        body.remove(p)

    section = doc.sections[0]
    section.page_width = Mm(210)
    section.page_height = Mm(297)
    section.top_margin = Mm(PROFILE["page"]["margin_top_mm"])
    section.bottom_margin = Mm(PROFILE["page"]["margin_bottom_mm"])
    section.left_margin = Mm(PROFILE["page"]["margin_left_mm"])
    section.right_margin = Mm(PROFILE["page"]["margin_right_mm"])
    section.footer_distance = Mm(28)

    if PROFILE["page"]["show_page_number"]:
        add_page_number_footer(section)

    settings = doc.settings.element
    if settings.find(qn("w:updateFields")) is None:
        update_fields = OxmlElement("w:updateFields")
        update_fields.set(qn("w:val"), "true")
        settings.append(update_fields)

    add_red_header_if_needed(doc, PROFILE, AST)

    add_text_paragraph(doc, AST["title"], PROFILE["styles"]["title"])
    add_text_paragraph(doc, AST["recipient"], PROFILE["styles"]["recipient"])

    for block in AST["blocks"]:
        block_type = block.get("type")
        text = block.get("text") or ""
        if block_type == "heading_1":
            add_text_paragraph(doc, text, PROFILE["styles"]["heading_1"])
        elif block_type == "body":
            add_text_paragraph(doc, text, PROFILE["styles"]["body"])

    if AST.get("signature"):
        add_text_paragraph(doc, AST["signature"], PROFILE["styles"]["signature"])
    if AST.get("date"):
        add_text_paragraph(doc, AST["date"], PROFILE["styles"]["date"])

    doc.save("output.docx")


if __name__ == "__main__":
    build()
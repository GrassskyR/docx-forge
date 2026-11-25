from docx import Document
from docx.shared import Mm, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

TARGET = {
    "id": "gbt-9704-2012",
    "name": "GB/T 9704-2012 国标公文",
    "source_type": "builtin",
    "parent_id": None,
    "base_template_path": None,
    "description": "",
    "page": {
        "size": "A4",
        "margin_top_mm": 39.0,
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
            "font_cn": "微软雅黑",
            "font_en": "Times New Roman",
            "font_size_pt": 18.0,
            "bold": False,
            "italic": False,
            "color_hex": "000000",
            "alignment": "justify",
            "line_spacing_rule": "exact",
            "line_spacing_value": 33.0,
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


def set_run_font(run, font_cn, font_en, size_pt, bold=False, italic=False, color_hex="000000"):
    run.font.name = font_en
    run.font.size = Pt(size_pt)
    run.font.bold = bool(bold)
    run.font.italic = bool(italic)
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

    sz = rPr.find(qn("w:sz"))
    if sz is None:
        sz = OxmlElement("w:sz")
        rPr.append(sz)
    sz.set(qn("w:val"), str(int(round(size_pt * 2))))

    szCs = rPr.find(qn("w:szCs"))
    if szCs is None:
        szCs = OxmlElement("w:szCs")
        sz.addnext(szCs)
    szCs.set(qn("w:val"), str(int(round(size_pt * 2))))


def apply_paragraph_format(paragraph, style):
    alignment = style.get("alignment", "justify")
    if alignment == "justify":
        paragraph.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        jc = paragraph._p.get_or_add_pPr().find(qn("w:jc"))
        if jc is not None:
            jc.set(qn("w:val"), "both")
    elif alignment == "center":
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    elif alignment == "right":
        paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    else:
        paragraph.alignment = WD_ALIGN_PARAGRAPH.LEFT

    pf = paragraph.paragraph_format
    pf.space_before = Pt(style.get("space_before_pt", 0.0))
    pf.space_after = Pt(style.get("space_after_pt", 0.0))

    if style.get("line_spacing_rule") == "exact":
        pf.line_spacing = Pt(style.get("line_spacing_value", 0.0))
        pf.line_spacing_rule = WD_LINE_SPACING.EXACTLY
    else:
        pf.line_spacing = style.get("line_spacing_value", 1.0)

    chars = float(style.get("first_line_indent_chars", 0.0))
    font_size = float(style.get("font_size_pt", 0.0))
    first_line_pt = chars * font_size
    pf.first_line_indent = Pt(first_line_pt)

    pPr = paragraph._p.get_or_add_pPr()
    ind = pPr.find(qn("w:ind"))
    if ind is None:
        ind = OxmlElement("w:ind")
        pPr.append(ind)
    ind.set(qn("w:firstLineChars"), str(int(round(chars * 100))))
    ind.set(qn("w:firstLine"), str(int(round(first_line_pt * 20))))


def add_role_paragraph(doc, text, style):
    p = doc.add_paragraph()
    apply_paragraph_format(p, style)
    run = p.add_run(text)
    set_run_font(
        run,
        style["font_cn"],
        style["font_en"],
        style["font_size_pt"],
        style.get("bold", False),
        style.get("italic", False),
        style.get("color_hex", "000000"),
    )
    return p


def set_bottom_border(paragraph, color_hex, sz=12, space=1):
    pPr = paragraph._p.get_or_add_pPr()
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
    bottom.set(qn("w:sz"), str(sz))
    bottom.set(qn("w:space"), str(space))
    bottom.set(qn("w:color"), color_hex)


def add_page_field(paragraph, instr, cached_text="1"):
    run_begin = paragraph.add_run()
    fld_begin = OxmlElement("w:fldChar")
    fld_begin.set(qn("w:fldCharType"), "begin")
    run_begin._r.append(fld_begin)

    run_instr = paragraph.add_run()
    instr_text = OxmlElement("w:instrText")
    instr_text.set(qn("xml:space"), "preserve")
    instr_text.text = " " + instr + " "
    run_instr._r.append(instr_text)

    run_sep = paragraph.add_run()
    fld_sep = OxmlElement("w:fldChar")
    fld_sep.set(qn("w:fldCharType"), "separate")
    run_sep._r.append(fld_sep)

    paragraph.add_run(cached_text)

    run_end = paragraph.add_run()
    fld_end = OxmlElement("w:fldChar")
    fld_end.set(qn("w:fldCharType"), "end")
    run_end._r.append(fld_end)


def add_footer_page_number(section):
    footer = section.footer
    p = footer.paragraphs[0] if footer.paragraphs else footer.add_paragraph()

    for child in list(p._p):
        if child.tag != qn("w:pPr"):
            p._p.remove(child)

    page_style = {
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
        "space_after_pt": 0.0,
    }
    apply_paragraph_format(p, page_style)

    p.add_run("— ")
    add_page_field(p, "PAGE", "1")
    p.add_run(" —")

    for run in p.runs:
        set_run_font(
            run,
            page_style["font_cn"],
            page_style["font_en"],
            page_style["font_size_pt"],
            False,
            False,
            page_style["color_hex"],
        )


doc = Document()

section = doc.sections[0]
section.page_width = Mm(210)
section.page_height = Mm(297)
section.top_margin = Mm(TARGET["page"]["margin_top_mm"])
section.bottom_margin = Mm(TARGET["page"]["margin_bottom_mm"])
section.left_margin = Mm(TARGET["page"]["margin_left_mm"])
section.right_margin = Mm(TARGET["page"]["margin_right_mm"])

styles = TARGET["styles"]
red = TARGET["red_header"]

if red.get("enabled"):
    red_style = {
        "font_cn": red.get("font_cn", "方正小标宋简体"),
        "font_en": "Times New Roman",
        "font_size_pt": red.get("font_size_pt", 36.0),
        "bold": False,
        "italic": False,
        "color_hex": red.get("color_hex", "FF0000"),
        "alignment": "center",
        "line_spacing_rule": "exact",
        "line_spacing_value": red.get("font_size_pt", 36.0),
        "first_line_indent_chars": 0.0,
        "space_before_pt": 0.0,
        "space_after_pt": 0.0,
    }

    doc_number_style = {
        "font_cn": red.get("doc_number_font_cn", "仿宋_GB2312"),
        "font_en": "Times New Roman",
        "font_size_pt": red.get("doc_number_size_pt", 16.0),
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

    org = AST.get("red_header_org") or red.get("org_name")
    doc_number = AST.get("doc_number")

    p_org = None
    p_doc_number = None

    if org:
        p_org = add_role_paragraph(doc, org, red_style)

    if doc_number:
        p_doc_number = add_role_paragraph(doc, doc_number, doc_number_style)

    if red.get("has_red_line"):
        line_para = p_doc_number if p_doc_number is not None else p_org
        if line_para is not None:
            set_bottom_border(line_para, red.get("color_hex", "FF0000"), sz=12, space=1)

add_role_paragraph(doc, AST["title"], styles["title"])

if AST.get("recipient"):
    add_role_paragraph(doc, AST["recipient"], styles["recipient"])

for block in AST.get("blocks", []):
    block_type = block.get("type")
    text = block.get("text", "")
    if block_type in ("heading_1", "heading_2", "heading_3", "body"):
        add_role_paragraph(doc, text, styles[block_type])
    elif block_type == "recipient":
        add_role_paragraph(doc, text, styles["recipient"])
    elif block_type == "signature":
        add_role_paragraph(doc, text, styles["signature"])
    elif block_type == "date":
        add_role_paragraph(doc, text, styles["date"])
    else:
        add_role_paragraph(doc, text, styles["body"])

attachments = AST.get("attachments") or []
if attachments:
    for idx, attachment in enumerate(attachments):
        prefix = "附件：" if idx == 0 else str(idx + 1) + ". "
        add_role_paragraph(doc, prefix + str(attachment), styles["body"])

if AST.get("signature"):
    add_role_paragraph(doc, AST["signature"], styles["signature"])

if AST.get("date"):
    add_role_paragraph(doc, AST["date"], styles["date"])

if TARGET["page"].get("show_page_number"):
    add_footer_page_number(section)

settings = doc.settings.element
update_fields = settings.find(qn("w:updateFields"))
if update_fields is None:
    update_fields = OxmlElement("w:updateFields")
    settings.append(update_fields)
update_fields.set(qn("w:val"), "true")

doc.save("output.docx")
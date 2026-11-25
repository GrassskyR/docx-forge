from docx import Document
from docx.shared import Mm, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

OUTPUT = "output.docx"

ALIGN_MAP = {
    "left": WD_ALIGN_PARAGRAPH.LEFT,
    "center": WD_ALIGN_PARAGRAPH.CENTER,
    "right": WD_ALIGN_PARAGRAPH.RIGHT,
    "justify": WD_ALIGN_PARAGRAPH.JUSTIFY,
}

STYLES = {
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
}


def set_run_font(run, font_cn, font_en, size_pt, bold=False, italic=False, color_hex="000000"):
    run.font.name = font_en
    run.font.size = Pt(size_pt)
    run.font.bold = bold
    run.font.italic = italic
    run.font.color.rgb = RGBColor.from_string(color_hex)

    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.find(qn("w:rFonts"))
    if rFonts is None:
        rFonts = OxmlElement("w:rFonts")
        rPr.append(rFonts)

    for attr in ("w:asciiTheme", "w:hAnsiTheme", "w:eastAsiaTheme", "w:cstheme"):
        key = qn(attr)
        if key in rFonts.attrib:
            del rFonts.attrib[key]

    rFonts.set(qn("w:ascii"), font_en)
    rFonts.set(qn("w:hAnsi"), font_en)
    rFonts.set(qn("w:cs"), font_en)
    rFonts.set(qn("w:eastAsia"), font_cn)


def set_first_line_chars(paragraph, chars):
    pPr = paragraph._p.get_or_add_pPr()
    ind = pPr.find(qn("w:ind"))
    if ind is None:
        ind = OxmlElement("w:ind")
        pPr.append(ind)

    first_line_key = qn("w:firstLine")
    if first_line_key in ind.attrib:
        del ind.attrib[first_line_key]

    ind.set(qn("w:firstLineChars"), str(int(round(chars * 100))))


def set_paragraph_format(paragraph, spec):
    paragraph.alignment = ALIGN_MAP.get(spec.get("alignment", "justify"), WD_ALIGN_PARAGRAPH.JUSTIFY)

    pf = paragraph.paragraph_format
    pf.space_before = Pt(spec.get("space_before_pt", 0.0))
    pf.space_after = Pt(spec.get("space_after_pt", 0.0))
    pf.line_spacing_rule = WD_LINE_SPACING.EXACTLY
    pf.line_spacing = Pt(spec.get("line_spacing_value", 28.0))

    set_first_line_chars(paragraph, spec.get("first_line_indent_chars", 0.0))


def add_text_paragraph(doc, text, spec):
    paragraph = doc.add_paragraph()
    set_paragraph_format(paragraph, spec)

    run = paragraph.add_run(text)
    set_run_font(
        run,
        spec.get("font_cn", "仿宋_GB2312"),
        spec.get("font_en", "Times New Roman"),
        spec.get("font_size_pt", 16.0),
        spec.get("bold", False),
        spec.get("italic", False),
        spec.get("color_hex", "000000"),
    )
    return paragraph


def add_page_number_footer(section):
    footer = section.footer
    footer.is_linked_to_previous = False

    paragraph = footer.paragraphs[0]
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    paragraph.paragraph_format.space_before = Pt(0)
    paragraph.paragraph_format.space_after = Pt(0)
    paragraph.paragraph_format.line_spacing_rule = WD_LINE_SPACING.SINGLE
    paragraph.paragraph_format.line_spacing = 1.0

    run = paragraph.add_run("— ")
    set_run_font(run, "宋体", "宋体", 14.0)

    run = paragraph.add_run()
    set_run_font(run, "宋体", "宋体", 14.0)
    fld = OxmlElement("w:fldChar")
    fld.set(qn("w:fldCharType"), "begin")
    run._r.append(fld)

    run = paragraph.add_run()
    set_run_font(run, "宋体", "宋体", 14.0)
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = " PAGE "
    run._r.append(instr)

    run = paragraph.add_run()
    set_run_font(run, "宋体", "宋体", 14.0)
    fld = OxmlElement("w:fldChar")
    fld.set(qn("w:fldCharType"), "separate")
    run._r.append(fld)

    run = paragraph.add_run("1")
    set_run_font(run, "宋体", "宋体", 14.0)

    run = paragraph.add_run()
    set_run_font(run, "宋体", "宋体", 14.0)
    fld = OxmlElement("w:fldChar")
    fld.set(qn("w:fldCharType"), "end")
    run._r.append(fld)

    run = paragraph.add_run(" —")
    set_run_font(run, "宋体", "宋体", 14.0)


def build_document():
    doc = Document()

    section = doc.sections[0]
    section.page_width = Mm(210)
    section.page_height = Mm(297)
    section.top_margin = Mm(37.0)
    section.bottom_margin = Mm(35.0)
    section.left_margin = Mm(28.0)
    section.right_margin = Mm(26.0)
    section.footer_distance = Mm(28.0)

    normal = doc.styles["Normal"]
    normal.font.name = "Times New Roman"
    normal.font.size = Pt(14)

    rPr = normal.element.get_or_add_rPr()
    rFonts = rPr.find(qn("w:rFonts"))
    if rFonts is None:
        rFonts = OxmlElement("w:rFonts")
        rPr.append(rFonts)

    for attr in ("w:asciiTheme", "w:hAnsiTheme", "w:eastAsiaTheme", "w:cstheme"):
        key = qn(attr)
        if key in rFonts.attrib:
            del rFonts.attrib[key]

    rFonts.set(qn("w:ascii"), "Times New Roman")
    rFonts.set(qn("w:hAnsi"), "Times New Roman")
    rFonts.set(qn("w:cs"), "Times New Roman")
    rFonts.set(qn("w:eastAsia"), "仿宋_GB2312")

    add_text_paragraph(doc, "关于开展业务培训的通知", STYLES["title"])
    add_text_paragraph(doc, "各部门：", STYLES["recipient"])

    blocks = [
        {"type": "heading_1", "text": "一、培训安排"},
        {"type": "body", "text": "请各部门做好组织协调，按时参加业务培训。"},
    ]

    for block in blocks:
        role = block["type"]
        spec = STYLES.get(role, STYLES["body"])
        add_text_paragraph(doc, block["text"], spec)

    add_text_paragraph(doc, "综合办公室", STYLES["signature"])
    add_text_paragraph(doc, "2026年11月24日", STYLES["date"])

    add_page_number_footer(section)

    settings = doc.settings.element
    update_fields = settings.find(qn("w:updateFields"))
    if update_fields is None:
        update_fields = OxmlElement("w:updateFields")
        settings.append(update_fields)
    update_fields.set(qn("w:val"), "true")

    doc.save(OUTPUT)


if __name__ == "__main__":
    build_document()

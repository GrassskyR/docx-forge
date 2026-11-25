from docx import Document
from docx.shared import Pt, Mm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

def set_font(run, font_cn, font_en, size_pt, bold=False, italic=False, color_hex="000000"):
    run.font.name = font_en
    run.font.size = Pt(size_pt)
    run.font.bold = bold
    run.font.italic = italic
    run.font.color.rgb = RGBColor.from_string(color_hex)
    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.find(qn('w:rFonts'))
    if rFonts is None:
        rFonts = OxmlElement('w:rFonts')
        rPr.append(rFonts)
    rFonts.set(qn('w:ascii'), font_en)
    rFonts.set(qn('w:hAnsi'), font_en)
    rFonts.set(qn('w:eastAsia'), font_cn)
    rFonts.set(qn('w:cs'), font_en)

def set_paragraph_format(p, alignment, first_line_indent_chars=0.0, line_spacing_value=28.0, space_before=0.0, space_after=0.0):
    p.alignment = alignment
    p.paragraph_format.line_spacing_rule = WD_LINE_SPACING.EXACTLY
    p.paragraph_format.line_spacing = Pt(line_spacing_value)
    p.paragraph_format.space_before = Pt(space_before)
    p.paragraph_format.space_after = Pt(space_after)
    pPr = p._element.get_or_add_pPr()
    ind = pPr.get_or_add_ind()
    if first_line_indent_chars > 0:
        ind.set(qn('w:firstLineChars'), str(int(first_line_indent_chars * 100)))
        if ind.get(qn('w:firstLine')) is not None:
            del ind.attrib[qn('w:firstLine')]
    else:
        if ind.get(qn('w:firstLineChars')) is not None:
            del ind.attrib[qn('w:firstLineChars')]
        if ind.get(qn('w:firstLine')) is not None:
            del ind.attrib[qn('w:firstLine')]

def add_page_field(paragraph):
    run = paragraph.add_run()
    fldChar1 = OxmlElement('w:fldChar')
    fldChar1.set(qn('w:fldCharType'), 'begin')
    run._r.append(fldChar1)

    run = paragraph.add_run()
    instrText = OxmlElement('w:instrText')
    instrText.set(qn('xml:space'), 'preserve')
    instrText.text = ' PAGE '
    run._r.append(instrText)

    run = paragraph.add_run()
    fldChar2 = OxmlElement('w:fldChar')
    fldChar2.set(qn('w:fldCharType'), 'separate')
    run._r.append(fldChar2)

    run = paragraph.add_run()
    t = OxmlElement('w:t')
    t.text = '1'
    run._r.append(t)

    run = paragraph.add_run()
    fldChar3 = OxmlElement('w:fldChar')
    fldChar3.set(qn('w:fldCharType'), 'end')
    run._r.append(fldChar3)

doc = Document()

section = doc.sections[0]
section.page_width = Mm(210)
section.page_height = Mm(297)
section.top_margin = Mm(37)
section.bottom_margin = Mm(35)
section.left_margin = Mm(28)
section.right_margin = Mm(26)

red_header_org = None
doc_number = None

if red_header_org:
    p = doc.add_paragraph()
    set_paragraph_format(p, WD_ALIGN_PARAGRAPH.CENTER, first_line_indent_chars=0.0, line_spacing_value=28.0)
    run = p.add_run(red_header_org)
    set_font(run, "方正小标宋简体", "Times New Roman", 36.0, bold=False, color_hex="FF0000")

    if doc_number:
        p = doc.add_paragraph()
        set_paragraph_format(p, WD_ALIGN_PARAGRAPH.CENTER, first_line_indent_chars=0.0, line_spacing_value=28.0)
        run = p.add_run(doc_number)
        set_font(run, "仿宋_GB2312", "Times New Roman", 16.0, bold=False, color_hex="000000")

        p = doc.add_paragraph()
        set_paragraph_format(p, WD_ALIGN_PARAGRAPH.LEFT, first_line_indent_chars=0.0, line_spacing_value=1.0)
        pPr = p._element.get_or_add_pPr()
        pBdr = OxmlElement('w:pBdr')
        bottom = OxmlElement('w:bottom')
        bottom.set(qn('w:val'), 'single')
        bottom.set(qn('w:sz'), '18')
        bottom.set(qn('w:space'), '1')
        bottom.set(qn('w:color'), 'FF0000')
        pBdr.append(bottom)
        pPr.append(pBdr)

p = doc.add_paragraph()
set_paragraph_format(p, WD_ALIGN_PARAGRAPH.CENTER, first_line_indent_chars=0.0, line_spacing_value=28.0)
run = p.add_run("关于开展业务培训的通知")
set_font(run, "方正小标宋简体", "Times New Roman", 22.0, bold=False, color_hex="000000")

p = doc.add_paragraph()
set_paragraph_format(p, WD_ALIGN_PARAGRAPH.LEFT, first_line_indent_chars=0.0, line_spacing_value=28.0)
run = p.add_run("各部门：")
set_font(run, "仿宋_GB2312", "Times New Roman", 16.0, bold=False, color_hex="000000")

blocks = [
    {"type": "heading_1", "text": "一、培训安排"},
    {"type": "body", "text": "请各部门做好组织协调，按时参加业务培训。"}
]
for block in blocks:
    if block["type"] == "heading_1":
        p = doc.add_paragraph()
        set_paragraph_format(p, WD_ALIGN_PARAGRAPH.JUSTIFY, first_line_indent_chars=2.0, line_spacing_value=28.0)
        run = p.add_run(block["text"])
        set_font(run, "黑体", "Times New Roman", 22.0, bold=True, color_hex="000000")
    elif block["type"] == "body":
        p = doc.add_paragraph()
        set_paragraph_format(p, WD_ALIGN_PARAGRAPH.JUSTIFY, first_line_indent_chars=2.0, line_spacing_value=28.0)
        run = p.add_run(block["text"])
        set_font(run, "黑体", "Times New Roman", 16.0, bold=False, color_hex="000000")

p = doc.add_paragraph()
set_paragraph_format(p, WD_ALIGN_PARAGRAPH.RIGHT, first_line_indent_chars=0.0, line_spacing_value=28.0)
run = p.add_run("综合办公室")
set_font(run, "仿宋_GB2312", "Times New Roman", 16.0, bold=False, color_hex="000000")

p = doc.add_paragraph()
set_paragraph_format(p, WD_ALIGN_PARAGRAPH.RIGHT, first_line_indent_chars=0.0, line_spacing_value=28.0)
run = p.add_run("2026年11月24日")
set_font(run, "仿宋_GB2312", "Times New Roman", 16.0, bold=False, color_hex="000000")

footer = section.footer
footer.is_linked_to_previous = False
p = footer.paragraphs[0]
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
for r in list(p.runs):
    r._element.getparent().remove(r._element)

add_page_field(p)

for run in p.runs:
    set_font(run, "宋体", "Times New Roman", 14.0, bold=False, color_hex="000000")

doc.save("output.docx")

from docx import Document
from docx.shared import Mm, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

def set_run_font(run, font_cn, font_en, size_pt, bold=False, italic=False, color_hex="000000"):
    run.font.name = font_en
    run.font.size = Pt(size_pt)
    run.font.bold = bold
    run.font.italic = italic
    run.font.color.rgb = RGBColor.from_string(color_hex)

    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.get_or_add_rFonts()
    rFonts.set(qn('w:ascii'), font_en)
    rFonts.set(qn('w:hAnsi'), font_en)
    rFonts.set(qn('w:eastAsia'), font_cn)
    rFonts.set(qn('w:cs'), font_en)

def set_first_line_indent_chars(paragraph, chars):
    pPr = paragraph._p.get_or_add_pPr()
    ind = pPr.get_or_add_ind()
    ind.set(qn('w:firstLineChars'), str(int(round(chars * 100))))
    if chars == 0:
        ind.set(qn('w:firstLine'), '0')
    else:
        ind.attrib.pop(qn('w:firstLine'), None)
    ind.attrib.pop(qn('w:hanging'), None)
    ind.attrib.pop(qn('w:hangingChars'), None)

def apply_para_format(paragraph, alignment, line_spacing_value, first_line_indent_chars,
                      space_before_pt=0.0, space_after_pt=0.0):
    pf = paragraph.paragraph_format
    pf.alignment = alignment
    pf.line_spacing_rule = WD_LINE_SPACING.EXACTLY
    pf.line_spacing = Pt(line_spacing_value)
    pf.space_before = Pt(space_before_pt)
    pf.space_after = Pt(space_after_pt)
    set_first_line_indent_chars(paragraph, first_line_indent_chars)

def add_text_paragraph(container, text, font_cn, font_en, size_pt, bold, italic, color_hex,
                       alignment, line_spacing_value, first_line_indent_chars,
                       space_before_pt=0.0, space_after_pt=0.0):
    p = container.add_paragraph()
    apply_para_format(p, alignment, line_spacing_value, first_line_indent_chars,
                      space_before_pt, space_after_pt)
    run = p.add_run(text)
    set_run_font(run, font_cn, font_en, size_pt, bold, italic, color_hex)
    return p

def clear_paragraph(paragraph):
    for child in list(paragraph._p):
        if child.tag == qn('w:pPr'):
            continue
        paragraph._p.remove(child)

def add_page_field(paragraph, font_cn, font_en, size_pt, color_hex):
    run_begin = paragraph.add_run()
    set_run_font(run_begin, font_cn, font_en, size_pt, False, False, color_hex)
    fld_begin = OxmlElement('w:fldChar')
    fld_begin.set(qn('w:fldCharType'), 'begin')
    run_begin._r.append(fld_begin)

    run_instr = paragraph.add_run()
    set_run_font(run_instr, font_cn, font_en, size_pt, False, False, color_hex)
    instr = OxmlElement('w:instrText')
    instr.set(qn('xml:space'), 'preserve')
    instr.text = ' PAGE '
    run_instr._r.append(instr)

    run_sep = paragraph.add_run()
    set_run_font(run_sep, font_cn, font_en, size_pt, False, False, color_hex)
    fld_sep = OxmlElement('w:fldChar')
    fld_sep.set(qn('w:fldCharType'), 'separate')
    run_sep._r.append(fld_sep)

    run_text = paragraph.add_run('1')
    set_run_font(run_text, font_cn, font_en, size_pt, False, False, color_hex)

    run_end = paragraph.add_run()
    set_run_font(run_end, font_cn, font_en, size_pt, False, False, color_hex)
    fld_end = OxmlElement('w:fldChar')
    fld_end.set(qn('w:fldCharType'), 'end')
    run_end._r.append(fld_end)

doc = Document()

normal_style = doc.styles['Normal']
normal_style.font.name = 'Times New Roman'
normal_style.font.size = Pt(16)
normal_rPr = normal_style.element.get_or_add_rPr()
normal_rFonts = normal_rPr.get_or_add_rFonts()
normal_rFonts.set(qn('w:ascii'), 'Times New Roman')
normal_rFonts.set(qn('w:hAnsi'), 'Times New Roman')
normal_rFonts.set(qn('w:eastAsia'), '仿宋_GB2312')
normal_rFonts.set(qn('w:cs'), 'Times New Roman')

section = doc.sections[0]
section.page_width = Mm(210)
section.page_height = Mm(297)
section.top_margin = Mm(30)
section.bottom_margin = Mm(35)
section.left_margin = Mm(28)
section.right_margin = Mm(26)
section.footer_distance = Mm(28)

settings = doc.settings.element
update_fields = settings.find(qn('w:updateFields'))
if update_fields is None:
    update_fields = OxmlElement('w:updateFields')
    settings.append(update_fields)
update_fields.set(qn('w:val'), 'true')

add_text_paragraph(
    doc, "关于开展业务培训的通知",
    "黑体", "Times New Roman", 22.0, False, False, "000000",
    WD_ALIGN_PARAGRAPH.CENTER, 30.0, 0.0, 0.0, 0.0
)

add_text_paragraph(
    doc, "各部门：",
    "仿宋_GB2312", "Times New Roman", 16.0, False, False, "000000",
    WD_ALIGN_PARAGRAPH.LEFT, 28.0, 0.0, 0.0, 0.0
)

add_text_paragraph(
    doc, "一、培训安排",
    "黑体", "Times New Roman", 16.0, False, False, "000000",
    WD_ALIGN_PARAGRAPH.JUSTIFY, 28.0, 2.0, 0.0, 0.0
)

add_text_paragraph(
    doc, "请各部门做好组织协调，按时参加业务培训。",
    "仿宋_GB2312", "Times New Roman", 16.0, False, False, "000000",
    WD_ALIGN_PARAGRAPH.JUSTIFY, 24.0, 2.0, 0.0, 0.0
)

add_text_paragraph(
    doc, "综合办公室",
    "仿宋_GB2312", "Times New Roman", 16.0, False, False, "000000",
    WD_ALIGN_PARAGRAPH.RIGHT, 28.0, 0.0, 0.0, 0.0
)

add_text_paragraph(
    doc, "2026年11月24日",
    "仿宋_GB2312", "Times New Roman", 16.0, False, False, "000000",
    WD_ALIGN_PARAGRAPH.RIGHT, 28.0, 0.0, 0.0, 0.0
)

footer = section.footer
footer.is_linked_to_previous = False
if footer.paragraphs:
    footer_p = footer.paragraphs[0]
    clear_paragraph(footer_p)
else:
    footer_p = footer.add_paragraph()

apply_para_format(footer_p, WD_ALIGN_PARAGRAPH.CENTER, 14.0, 0.0, 0.0, 0.0)

left_dash = footer_p.add_run("— ")
set_run_font(left_dash, "宋体", "宋体", 14.0, False, False, "000000")

add_page_field(footer_p, "宋体", "宋体", 14.0, "000000")

right_dash = footer_p.add_run(" —")
set_run_font(right_dash, "宋体", "宋体", 14.0, False, False, "000000")

doc.save("output.docx")
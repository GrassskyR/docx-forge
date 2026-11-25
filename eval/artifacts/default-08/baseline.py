from docx import Document
from docx.shared import Pt, Mm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml.ns import qn
from docx.oxml import OxmlElement


def set_run_font(run, font_cn, font_en, size_pt, bold=False, italic=False, color_hex="000000"):
    run.font.size = Pt(size_pt)
    run.bold = bold
    run.italic = italic
    run.font.color.rgb = RGBColor.from_string(color_hex)
    run.font.name = font_en
    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.find(qn('w:rFonts'))
    if rFonts is None:
        rFonts = OxmlElement('w:rFonts')
        rPr.append(rFonts)
    rFonts.set(qn('w:ascii'), font_en)
    rFonts.set(qn('w:hAnsi'), font_en)
    rFonts.set(qn('w:eastAsia'), font_cn)
    rFonts.set(qn('w:cs'), font_en)


def set_para_format(p, alignment, line_spacing_pt, first_line_indent_chars=0.0,
                    font_size_pt=16.0, space_before_pt=0.0, space_after_pt=0.0):
    pf = p.paragraph_format
    pf.alignment = alignment
    pf.line_spacing = Pt(line_spacing_pt)
    pf.line_spacing_rule = WD_LINE_SPACING.EXACTLY
    pf.space_before = Pt(space_before_pt)
    pf.space_after = Pt(space_after_pt)
    pPr = p._element.get_or_add_pPr()
    ind = pPr.find(qn('w:ind'))
    if ind is None:
        ind = OxmlElement('w:ind')
        pPr.append(ind)
    ind.set(qn('w:firstLineChars'), str(int(round(first_line_indent_chars * 100))))
    ind.set(qn('w:firstLine'), str(int(round(first_line_indent_chars * font_size_pt * 20))))


def add_page_field(paragraph):
    run = paragraph.add_run()
    fldChar = OxmlElement('w:fldChar')
    fldChar.set(qn('w:fldCharType'), 'begin')
    run._r.append(fldChar)
    set_run_font(run, '宋体', 'Times New Roman', 14)

    run = paragraph.add_run()
    instrText = OxmlElement('w:instrText')
    instrText.set(qn('xml:space'), 'preserve')
    instrText.text = ' PAGE '
    run._r.append(instrText)
    set_run_font(run, '宋体', 'Times New Roman', 14)

    run = paragraph.add_run()
    fldChar = OxmlElement('w:fldChar')
    fldChar.set(qn('w:fldCharType'), 'separate')
    run._r.append(fldChar)
    set_run_font(run, '宋体', 'Times New Roman', 14)

    run = paragraph.add_run('1')
    set_run_font(run, '宋体', 'Times New Roman', 14)

    run = paragraph.add_run()
    fldChar = OxmlElement('w:fldChar')
    fldChar.set(qn('w:fldCharType'), 'end')
    run._r.append(fldChar)
    set_run_font(run, '宋体', 'Times New Roman', 14)


def main():
    doc = Document()

    normal = doc.styles['Normal']
    normal.font.name = 'Times New Roman'
    normal.font.size = Pt(16)
    rpr = normal.element.get_or_add_rPr()
    rfonts = rpr.find(qn('w:rFonts'))
    if rfonts is None:
        rfonts = OxmlElement('w:rFonts')
        rpr.append(rfonts)
    rfonts.set(qn('w:ascii'), 'Times New Roman')
    rfonts.set(qn('w:hAnsi'), 'Times New Roman')
    rfonts.set(qn('w:eastAsia'), '仿宋_GB2312')
    rfonts.set(qn('w:cs'), 'Times New Roman')
    normal.paragraph_format.line_spacing = Pt(28)
    normal.paragraph_format.line_spacing_rule = WD_LINE_SPACING.EXACTLY

    section = doc.sections[0]
    section.page_width = Mm(210)
    section.page_height = Mm(297)
    section.top_margin = Mm(37)
    section.bottom_margin = Mm(35)
    section.left_margin = Mm(28)
    section.right_margin = Mm(26)
    section.footer_distance = Mm(17.5)

    footer = section.footer
    fp = footer.paragraphs[0]
    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    fp.paragraph_format.line_spacing = 1.0
    fp.paragraph_format.line_spacing_rule = WD_LINE_SPACING.SINGLE
    fp.paragraph_format.space_before = Pt(0)
    fp.paragraph_format.space_after = Pt(0)
    run = fp.add_run('— ')
    set_run_font(run, '宋体', 'Times New Roman', 14)
    add_page_field(fp)
    run = fp.add_run(' —')
    set_run_font(run, '宋体', 'Times New Roman', 14)

    p = doc.add_paragraph()
    set_para_format(p, WD_ALIGN_PARAGRAPH.CENTER, 28, 0.0, font_size_pt=22)
    run = p.add_run('关于开展业务培训的通知')
    set_run_font(run, '方正小标宋简体', 'Times New Roman', 22)

    p = doc.add_paragraph()
    set_para_format(p, WD_ALIGN_PARAGRAPH.LEFT, 28, 0.0, font_size_pt=16)
    run = p.add_run('')
    set_run_font(run, '仿宋_GB2312', 'Times New Roman', 16)

    p = doc.add_paragraph()
    set_para_format(p, WD_ALIGN_PARAGRAPH.LEFT, 28, 0.0, font_size_pt=16)
    run = p.add_run('各部门：')
    set_run_font(run, '仿宋_GB2312', 'Times New Roman', 16)

    p = doc.add_paragraph()
    set_para_format(p, WD_ALIGN_PARAGRAPH.JUSTIFY, 28, 2.0, font_size_pt=16)
    run = p.add_run('一、培训安排')
    set_run_font(run, '黑体', 'Times New Roman', 16)

    p = doc.add_paragraph()
    set_para_format(p, WD_ALIGN_PARAGRAPH.JUSTIFY, 28, 2.0, font_size_pt=16)
    run = p.add_run('请各部门做好组织协调，按时参加业务培训。')
    set_run_font(run, '仿宋_GB2312', 'Times New Roman', 16)

    p = doc.add_paragraph()
    set_para_format(p, WD_ALIGN_PARAGRAPH.LEFT, 28, 0.0, font_size_pt=16)
    run = p.add_run('')
    set_run_font(run, '仿宋_GB2312', 'Times New Roman', 16)

    p = doc.add_paragraph()
    set_para_format(p, WD_ALIGN_PARAGRAPH.RIGHT, 28, 0.0, font_size_pt=16)
    run = p.add_run('综合办公室')
    set_run_font(run, '仿宋_GB2312', 'Times New Roman', 16)

    p = doc.add_paragraph()
    set_para_format(p, WD_ALIGN_PARAGRAPH.RIGHT, 28, 0.0, font_size_pt=16)
    run = p.add_run('2026年11月24日')
    set_run_font(run, '仿宋_GB2312', 'Times New Roman', 16)

    doc.save('output.docx')


if __name__ == '__main__':
    main()

from docx import Document
from docx.shared import Pt, Mm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

def set_run_font(run, font_cn, font_en, size_pt, bold=False, italic=False, color_hex='000000'):
    run.font.name = font_en
    run.font.size = Pt(size_pt)
    run.font.bold = bold
    run.font.italic = italic
    run.font.color.rgb = RGBColor.from_string(color_hex)

    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.find(qn('w:rFonts'))
    if rFonts is None:
        rFonts = OxmlElement('w:rFonts')
        rPr.insert(0, rFonts)

    rFonts.set(qn('w:ascii'), font_en)
    rFonts.set(qn('w:hAnsi'), font_en)
    rFonts.set(qn('w:eastAsia'), font_cn)
    rFonts.set(qn('w:cs'), font_en)

    szCs = rPr.find(qn('w:szCs'))
    if szCs is None:
        szCs = OxmlElement('w:szCs')
        sz = rPr.find(qn('w:sz'))
        if sz is not None:
            sz.addnext(szCs)
        else:
            rPr.append(szCs)
    szCs.set(qn('w:val'), str(int(size_pt * 2)))

def set_paragraph_format(p, alignment, line_spacing_pt, first_line_indent_chars, space_before_pt=0, space_after_pt=0):
    p.alignment = alignment
    pf = p.paragraph_format
    pf.line_spacing = Pt(line_spacing_pt)
    pf.line_spacing_rule = WD_LINE_SPACING.EXACTLY
    pf.space_before = Pt(space_before_pt)
    pf.space_after = Pt(space_after_pt)

    pf.first_line_indent = Pt(0)
    pPr = p._p.get_or_add_pPr()
    ind = pPr.find(qn('w:ind'))
    if ind is None:
        ind = OxmlElement('w:ind')
        pPr.append(ind)

    if first_line_indent_chars and first_line_indent_chars > 0:
        ind.set(qn('w:firstLineChars'), str(int(first_line_indent_chars * 100)))
        if ind.get(qn('w:firstLine')) is not None:
            del ind.attrib[qn('w:firstLine')]
    else:
        ind.set(qn('w:firstLineChars'), '0')
        if ind.get(qn('w:firstLine')) is not None:
            del ind.attrib[qn('w:firstLine')]

def add_formatted_paragraph(doc, text, style):
    p = doc.add_paragraph()
    run = p.add_run(text)
    set_run_font(
        run,
        style['font_cn'],
        style['font_en'],
        style['size_pt'],
        style.get('bold', False),
        style.get('italic', False),
        style.get('color', '000000')
    )
    set_paragraph_format(
        p,
        style['alignment'],
        style['line_spacing'],
        style['first_line_indent_chars'],
        style.get('space_before', 0),
        style.get('space_after', 0)
    )
    return p

def add_page_field(paragraph, font_cn, font_en, size_pt, color_hex):
    fld = OxmlElement('w:fldSimple')
    fld.set(qn('w:instr'), ' PAGE ')

    r = OxmlElement('w:r')
    rPr = OxmlElement('w:rPr')

    rFonts = OxmlElement('w:rFonts')
    rFonts.set(qn('w:ascii'), font_en)
    rFonts.set(qn('w:hAnsi'), font_en)
    rFonts.set(qn('w:eastAsia'), font_cn)
    rFonts.set(qn('w:cs'), font_en)
    rPr.append(rFonts)

    color = OxmlElement('w:color')
    color.set(qn('w:val'), color_hex)
    rPr.append(color)

    sz = OxmlElement('w:sz')
    sz.set(qn('w:val'), str(int(size_pt * 2)))
    rPr.append(sz)

    szCs = OxmlElement('w:szCs')
    szCs.set(qn('w:val'), str(int(size_pt * 2)))
    rPr.append(szCs)

    r.append(rPr)
    t = OxmlElement('w:t')
    t.text = '1'
    r.append(t)
    fld.append(r)
    paragraph._p.append(fld)

def main():
    doc = Document()

    section = doc.sections[0]
    section.page_width = Mm(210)
    section.page_height = Mm(297)
    section.top_margin = Mm(30)
    section.bottom_margin = Mm(35)
    section.left_margin = Mm(28)
    section.right_margin = Mm(26)
    section.footer_distance = Mm(28)

    normal = doc.styles['Normal']
    normal.font.name = 'Times New Roman'
    normal.font.size = Pt(14)
    rPr = normal.element.get_or_add_rPr()
    rFonts = rPr.find(qn('w:rFonts'))
    if rFonts is None:
        rFonts = OxmlElement('w:rFonts')
        rPr.insert(0, rFonts)
    rFonts.set(qn('w:ascii'), 'Times New Roman')
    rFonts.set(qn('w:hAnsi'), 'Times New Roman')
    rFonts.set(qn('w:eastAsia'), '宋体')
    rFonts.set(qn('w:cs'), 'Times New Roman')

    footer = section.footer
    if footer.paragraphs:
        p_footer = footer.paragraphs[0]
        p_footer.text = ''
    else:
        p_footer = footer.add_paragraph()

    p_footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_footer.paragraph_format.space_before = Pt(0)
    p_footer.paragraph_format.space_after = Pt(0)
    p_footer.paragraph_format.line_spacing = Pt(14)
    p_footer.paragraph_format.line_spacing_rule = WD_LINE_SPACING.EXACTLY

    run1 = p_footer.add_run('— ')
    set_run_font(run1, '宋体', 'Times New Roman', 14.0)
    add_page_field(p_footer, '宋体', 'Times New Roman', 14.0, '000000')
    run2 = p_footer.add_run(' —')
    set_run_font(run2, '宋体', 'Times New Roman', 14.0)

    title_style = {
        'font_cn': '黑体',
        'font_en': 'Times New Roman',
        'size_pt': 22.0,
        'bold': False,
        'italic': False,
        'color': '000000',
        'alignment': WD_ALIGN_PARAGRAPH.CENTER,
        'line_spacing': 28.0,
        'first_line_indent_chars': 0.0,
        'space_before': 0.0,
        'space_after': 0.0
    }

    heading1_style = {
        'font_cn': '黑体',
        'font_en': 'Times New Roman',
        'size_pt': 16.0,
        'bold': False,
        'italic': False,
        'color': '000000',
        'alignment': WD_ALIGN_PARAGRAPH.JUSTIFY,
        'line_spacing': 28.0,
        'first_line_indent_chars': 2.0,
        'space_before': 0.0,
        'space_after': 0.0
    }

    body_style = {
        'font_cn': '宋体',
        'font_en': 'Times New Roman',
        'size_pt': 14.0,
        'bold': False,
        'italic': False,
        'color': '000000',
        'alignment': WD_ALIGN_PARAGRAPH.JUSTIFY,
        'line_spacing': 24.0,
        'first_line_indent_chars': 2.0,
        'space_before': 0.0,
        'space_after': 0.0
    }

    recipient_style = {
        'font_cn': '仿宋_GB2312',
        'font_en': 'Times New Roman',
        'size_pt': 16.0,
        'bold': False,
        'italic': False,
        'color': '000000',
        'alignment': WD_ALIGN_PARAGRAPH.LEFT,
        'line_spacing': 28.0,
        'first_line_indent_chars': 0.0,
        'space_before': 0.0,
        'space_after': 0.0
    }

    signature_style = {
        'font_cn': '仿宋_GB2312',
        'font_en': 'Times New Roman',
        'size_pt': 16.0,
        'bold': False,
        'italic': False,
        'color': '000000',
        'alignment': WD_ALIGN_PARAGRAPH.RIGHT,
        'line_spacing': 28.0,
        'first_line_indent_chars': 0.0,
        'space_before': 0.0,
        'space_after': 0.0
    }

    date_style = {
        'font_cn': '仿宋_GB2312',
        'font_en': 'Times New Roman',
        'size_pt': 16.0,
        'bold': False,
        'italic': False,
        'color': '000000',
        'alignment': WD_ALIGN_PARAGRAPH.RIGHT,
        'line_spacing': 28.0,
        'first_line_indent_chars': 0.0,
        'space_before': 0.0,
        'space_after': 0.0
    }

    add_formatted_paragraph(doc, '关于开展业务培训的通知', title_style)
    add_formatted_paragraph(doc, '各部门：', recipient_style)

    blocks = [
        {'type': 'heading_1', 'text': '一、培训安排'},
        {'type': 'body', 'text': '请各部门做好组织协调，按时参加业务培训。'}
    ]

    for block in blocks:
        if block['type'] == 'heading_1':
            add_formatted_paragraph(doc, block['text'], heading1_style)
        elif block['type'] == 'body':
            add_formatted_paragraph(doc, block['text'], body_style)

    add_formatted_paragraph(doc, '综合办公室', signature_style)
    add_formatted_paragraph(doc, '2026年11月24日', date_style)

    doc.save('output.docx')

if __name__ == '__main__':
    main()

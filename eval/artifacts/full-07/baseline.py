from docx import Document
from docx.shared import Mm, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn


def _set_ind(p, first_line_chars):
    pPr = p._p.get_or_add_pPr()
    ind = pPr.find(qn('w:ind'))
    if ind is None:
        ind = OxmlElement('w:ind')
        successors = {
            qn('w:contextualSpacing'), qn('w:mirrorIndents'), qn('w:suppressOverlap'),
            qn('w:jc'), qn('w:textDirection'), qn('w:textAlignment'), qn('w:textboxTightWrap'),
            qn('w:outlineLvl'), qn('w:divId'), qn('w:cnfStyle'), qn('w:rPr'),
            qn('w:sectPr'), qn('w:pPrChange')
        }
        inserted = False
        for child in list(pPr):
            if child.tag in successors:
                pPr.insert(list(pPr).index(child), ind)
                inserted = True
                break
        if not inserted:
            pPr.append(ind)

    for attr in (
        'w:firstLine', 'w:firstLineChars', 'w:hanging', 'w:hangingChars',
        'w:left', 'w:leftChars', 'w:right', 'w:rightChars'
    ):
        key = qn(attr)
        if key in ind.attrib:
            del ind.attrib[key]

    if first_line_chars is not None and first_line_chars > 0:
        ind.set(qn('w:firstLineChars'), str(int(round(first_line_chars * 100))))
    else:
        ind.set(qn('w:firstLineChars'), '0')
        ind.set(qn('w:firstLine'), '0')

    ind.set(qn('w:left'), '0')
    ind.set(qn('w:leftChars'), '0')
    ind.set(qn('w:right'), '0')
    ind.set(qn('w:rightChars'), '0')


def set_run_font(run, font_cn, font_en, size_pt, bold, italic, color_hex):
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
            rPr.insert(list(rPr).index(sz) + 1, szCs)
        else:
            rPr.append(szCs)
    szCs.set(qn('w:val'), str(int(round(size_pt * 2))))

    bCs = rPr.find(qn('w:bCs'))
    if bCs is None:
        bCs = OxmlElement('w:bCs')
        b = rPr.find(qn('w:b'))
        if b is not None:
            rPr.insert(list(rPr).index(b) + 1, bCs)
        else:
            rPr.append(bCs)
    bCs.set(qn('w:val'), '1' if bold else '0')

    iCs = rPr.find(qn('w:iCs'))
    if iCs is None:
        iCs = OxmlElement('w:iCs')
        i = rPr.find(qn('w:i'))
        if i is not None:
            rPr.insert(list(rPr).index(i) + 1, iCs)
        else:
            rPr.append(iCs)
    iCs.set(qn('w:val'), '1' if italic else '0')


def add_para(doc, text, font_cn, font_en, size_pt, bold, italic, color_hex,
             alignment, line_spacing_pt, first_line_indent_chars,
             space_before_pt, space_after_pt):
    p = doc.add_paragraph()
    p.alignment = alignment

    pf = p.paragraph_format
    pf.space_before = Pt(space_before_pt)
    pf.space_after = Pt(space_after_pt)
    pf.line_spacing = Pt(line_spacing_pt)
    pf.line_spacing_rule = WD_LINE_SPACING.EXACTLY

    _set_ind(p, first_line_indent_chars)

    if text is not None:
        run = p.add_run(text)
        set_run_font(run, font_cn, font_en, size_pt, bold, italic, color_hex)

    return p


def add_page_field(paragraph, font_cn, font_en, size_pt, color_hex):
    run = paragraph.add_run('1')
    set_run_font(run, font_cn, font_en, size_pt, False, False, color_hex)

    fld = OxmlElement('w:fldSimple')
    fld.set(qn('w:instr'), ' PAGE ')
    fld.append(run._r)
    paragraph._p.append(fld)


def setup_footer(doc):
    section = doc.sections[0]
    footer = section.footer
    footer.is_linked_to_previous = False

    p = footer.paragraphs[0]
    for child in list(p._p):
        if child.tag != qn('w:pPr'):
            p._p.remove(child)

    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    pf = p.paragraph_format
    pf.space_before = Pt(0)
    pf.space_after = Pt(0)
    pf.line_spacing = Pt(28.0)
    pf.line_spacing_rule = WD_LINE_SPACING.EXACTLY
    _set_ind(p, 0)

    r1 = p.add_run('— ')
    set_run_font(r1, '宋体', 'Times New Roman', 14.0, False, False, '000000')

    add_page_field(p, '宋体', 'Times New Roman', 14.0, '000000')

    r2 = p.add_run(' —')
    set_run_font(r2, '宋体', 'Times New Roman', 14.0, False, False, '000000')

    settings = doc.settings.element
    update = settings.find(qn('w:updateFields'))
    if update is None:
        update = OxmlElement('w:updateFields')
        settings.append(update)
    update.set(qn('w:val'), 'true')


def build():
    doc = Document()

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

    section = doc.sections[0]
    section.page_width = Mm(210)
    section.page_height = Mm(297)
    section.top_margin = Mm(36)
    section.bottom_margin = Mm(35)
    section.left_margin = Mm(28)
    section.right_margin = Mm(26)
    section.footer_distance = Mm(17.5)

    add_para(
        doc, '关于开展业务培训的通知',
        '黑体', 'Times New Roman', 22.0, False, False, '000000',
        WD_ALIGN_PARAGRAPH.CENTER, 30.0, 0.0, 0.0, 0.0
    )

    add_para(
        doc, '各部门：',
        '仿宋_GB2312', 'Times New Roman', 16.0, False, False, '000000',
        WD_ALIGN_PARAGRAPH.LEFT, 28.0, 0.0, 0.0, 0.0
    )

    blocks = [
        {'type': 'heading_1', 'text': '一、培训安排'},
        {'type': 'body', 'text': '请各部门做好组织协调，按时参加业务培训。'}
    ]

    for block in blocks:
        btype = block.get('type')
        text = block.get('text')

        if btype == 'heading_1':
            add_para(
                doc, text,
                '黑体', 'Times New Roman', 16.0, False, False, '000000',
                WD_ALIGN_PARAGRAPH.JUSTIFY, 28.0, 2.0, 0.0, 0.0
            )
        elif btype == 'heading_2':
            add_para(
                doc, text,
                '楷体_GB2312', 'Times New Roman', 16.0, False, False, '000000',
                WD_ALIGN_PARAGRAPH.JUSTIFY, 28.0, 2.0, 0.0, 0.0
            )
        elif btype == 'heading_3':
            add_para(
                doc, text,
                '仿宋_GB2312', 'Times New Roman', 16.0, False, False, '000000',
                WD_ALIGN_PARAGRAPH.JUSTIFY, 28.0, 2.0, 0.0, 0.0
            )
        else:
            add_para(
                doc, text,
                '宋体', 'Times New Roman', 14.0, False, False, '000000',
                WD_ALIGN_PARAGRAPH.JUSTIFY, 30.0, 2.0, 0.0, 0.0
            )

    add_para(
        doc, '综合办公室',
        '仿宋_GB2312', 'Times New Roman', 16.0, False, False, '000000',
        WD_ALIGN_PARAGRAPH.RIGHT, 28.0, 0.0, 0.0, 0.0
    )

    add_para(
        doc, '2026年11月24日',
        '仿宋_GB2312', 'Times New Roman', 16.0, False, False, '000000',
        WD_ALIGN_PARAGRAPH.RIGHT, 28.0, 0.0, 0.0, 0.0
    )

    setup_footer(doc)
    doc.save('output.docx')


if __name__ == '__main__':
    build()
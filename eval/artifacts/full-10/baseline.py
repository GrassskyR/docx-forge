#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generate output.docx from scratch according to the GB/T 9704-2012 profile
given in the task. Only python-docx + lxml (shiped with python-docx) are used.
"""

from docx import Document
from docx.shared import Pt, Mm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement


# --------------------------------------------------------------------------
# low level helpers
# --------------------------------------------------------------------------

_RPR_AFTER_SZCS = (
    'w:highlight', 'w:u', 'w:effect', 'w:bdr', 'w:shd', 'w:fitText',
    'w:vertAlign', 'w:rtl', 'w:cs', 'w:em', 'w:lang', 'w:eastAsianLayout',
    'w:specVanish', 'w:oMath',
)

_PPR_AFTER_IND = (
    'w:contextualSpacing', 'w:mirrorIndents', 'w:suppressOverlap', 'w:jc',
    'w:textDirection', 'w:textAlignment', 'w:textboxTightWrap',
    'w:outlineLvl', 'w:divId', 'w:cnfStyle', 'w:rPr', 'w:sectPr',
    'w:pPrChange',
)


def set_run_font(run, font_cn, font_en, size_pt,
                 bold=False, italic=False, color_hex="000000"):
    """Apply explicit eastAsia / ascii / hAnsi / cs font settings to a run."""
    run.font.size = Pt(size_pt)
    run.font.bold = bold
    run.font.italic = italic
    run.font.color.rgb = RGBColor.from_string(color_hex)
    run.font.name = font_en  # writes w:ascii and w:hAnsi

    rPr = run._element.get_or_add_rPr()

    rFonts = rPr.find(qn('w:rFonts'))
    if rFonts is None:
        rFonts = OxmlElement('w:rFonts')
        rPr.insert(0, rFonts)
    rFonts.set(qn('w:ascii'), font_en)
    rFonts.set(qn('w:hAnsi'), font_en)
    rFonts.set(qn('w:cs'), font_en)
    rFonts.set(qn('w:eastAsia'), font_cn)

    szCs = OxmlElement('w:szCs')
    szCs.set(qn('w:val'), str(int(round(size_pt * 2))))
    rPr.insert_element_before(szCs, *_RPR_AFTER_SZCS)


def add_text_run(paragraph, text, font_cn, font_en, size_pt,
                 bold=False, italic=False, color_hex="000000"):
    run = paragraph.add_run(text)
    set_run_font(run, font_cn, font_en, size_pt, bold, italic, color_hex)
    return run


def set_paragraph_format(paragraph, alignment, line_spacing_pt,
                         first_line_indent_chars=0.0, base_size_pt=16.0,
                         space_before_pt=0.0, space_after_pt=0.0):
    """
    alignment           : WD_ALIGN_PARAGRAPH member
    line_spacing_pt     : exact line spacing expressed in points
    first_line_indent   : expressed in characters (east-asian chars)
    """
    paragraph.alignment = alignment

    pf = paragraph.paragraph_format
    pf.line_spacing = Pt(line_spacing_pt)      # -> w:lineRule="exact"
    pf.space_before = Pt(space_before_pt)
    pf.space_after = Pt(space_after_pt)

    pPr = paragraph._p.get_or_add_pPr()

    spacing = pPr.find(qn('w:spacing'))
    if spacing is not None:
        spacing.set(qn('w:line'), str(int(round(line_spacing_pt * 20))))
        spacing.set(qn('w:lineRule'), 'exact')
        spacing.set(qn('w:before'), str(int(round(space_before_pt * 20))))
        spacing.set(qn('w:after'), str(int(round(space_after_pt * 20))))
        spacing.set(qn('w:beforeAutospacing'), '0')
        spacing.set(qn('w:afterAutospacing'), '0')

    ind = pPr.find(qn('w:ind'))
    if ind is None:
        ind = OxmlElement('w:ind')
        pPr.insert_element_before(ind, *_PPR_AFTER_IND)

    if first_line_indent_chars and first_line_indent_chars > 0:
        ind.set(qn('w:firstLineChars'),
                str(int(round(first_line_indent_chars * 100))))
        ind.set(qn('w:firstLine'),
                str(int(round(first_line_indent_chars * base_size_pt * 20))))
    else:
        ind.set(qn('w:firstLineChars'), '0')
        ind.set(qn('w:firstLine'), '0')


def add_page_field(paragraph, font_cn, font_en, size_pt):
    """Insert a real PAGE field (begin / instrText / separate / text / end)."""
    r_begin = paragraph.add_run()
    fld_begin = OxmlElement('w:fldChar')
    fld_begin.set(qn('w:fldCharType'), 'begin')
    r_begin._r.append(fld_begin)

    r_instr = paragraph.add_run()
    instr = OxmlElement('w:instrText')
    instr.set(qn('xml:space'), 'preserve')
    instr.text = ' PAGE '
    r_instr._r.append(instr)

    r_sep = paragraph.add_run()
    fld_sep = OxmlElement('w:fldChar')
    fld_sep.set(qn('w:fldCharType'), 'separate')
    r_sep._r.append(fld_sep)

    r_text = paragraph.add_run('1')

    r_end = paragraph.add_run()
    fld_end = OxmlElement('w:fldChar')
    fld_end.set(qn('w:fldCharType'), 'end')
    r_end._r.append(fld_end)

    for run in (r_begin, r_instr, r_sep, r_text, r_end):
        set_run_font(run, font_cn, font_en, size_pt)


def setup_page(section):
    section.page_width = Mm(210.0)
    section.page_height = Mm(297.0)
    section.top_margin = Mm(39.0)
    section.bottom_margin = Mm(35.0)
    section.left_margin = Mm(28.0)
    section.right_margin = Mm(26.0)
    section.header_distance = Mm(20.0)
    section.footer_distance = Mm(24.0)


def setup_normal_style(document):
    style = document.styles['Normal']
    style.font.name = 'Times New Roman'
    style.font.size = Pt(16)
    rPr = style.element.get_or_add_rPr()
    rFonts = rPr.find(qn('w:rFonts'))
    if rFonts is None:
        rFonts = OxmlElement('w:rFonts')
        rPr.insert(0, rFonts)
    rFonts.set(qn('w:ascii'), 'Times New Roman')
    rFonts.set(qn('w:hAnsi'), 'Times New Roman')
    rFonts.set(qn('w:cs'), 'Times New Roman')
    rFonts.set(qn('w:eastAsia'), '仿宋_GB2312')


def setup_page_number(section):
    footer = section.footer
    footer.is_linked_to_previous = False
    para = footer.paragraphs[0] if footer.paragraphs else footer.add_paragraph()
    # clear existing content
    for child in list(para._p):
        if child.tag != qn('w:pPr'):
            para._p.remove(child)

    para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    pf = para.paragraph_format
    pf.space_before = Pt(0)
    pf.space_after = Pt(0)
    pf.line_spacing = Pt(18)

    # GB style: — 1 —
    add_text_run(para, '—', '宋体', 'Times New Roman', 14.0)
    add_page_field(para, '宋体', 'Times New Roman', 14.0)
    add_text_run(para, '—', '宋体', 'Times New Roman', 14.0)


# --------------------------------------------------------------------------
# build document
# --------------------------------------------------------------------------

def build():
    doc = Document()

    setup_normal_style(doc)
    section = doc.sections[0]
    setup_page(section)
    setup_page_number(section)

    # ----- title : 黑体 22pt, centered, exact 30pt, no indent -----
    p = doc.add_paragraph()
    add_text_run(p, '关于开展业务培训的通知', '黑体', 'Times New Roman', 22.0)
    set_paragraph_format(p, WD_ALIGN_PARAGRAPH.CENTER, 30.0,
                         first_line_indent_chars=0.0, base_size_pt=22.0)

    # ----- recipient : 仿宋_GB2312 16pt, left, exact 28pt, no indent -----
    p = doc.add_paragraph()
    add_text_run(p, '各部门：', '仿宋_GB2312', 'Times New Roman', 16.0)
    set_paragraph_format(p, WD_ALIGN_PARAGRAPH.LEFT, 28.0,
                         first_line_indent_chars=0.0, base_size_pt=16.0)

    # ----- heading_1 : 黑体 16pt, justify, exact 28pt, indent 2 chars -----
    p = doc.add_paragraph()
    add_text_run(p, '一、培训安排', '黑体', 'Times New Roman', 16.0)
    set_paragraph_format(p, WD_ALIGN_PARAGRAPH.JUSTIFY, 28.0,
                         first_line_indent_chars=2.0, base_size_pt=16.0)

    # ----- body : 微软雅黑 18pt, justify, exact 33pt, indent 2 chars -----
    p = doc.add_paragraph()
    add_text_run(p, '请各部门做好组织协调，按时参加业务培训。',
                 '微软雅黑', 'Times New Roman', 18.0)
    set_paragraph_format(p, WD_ALIGN_PARAGRAPH.JUSTIFY, 33.0,
                         first_line_indent_chars=2.0, base_size_pt=18.0)

    # ----- signature : 仿宋_GB2312 16pt, right, exact 28pt -----
    p = doc.add_paragraph()
    add_text_run(p, '综合办公室', '仿宋_GB2312', 'Times New Roman', 16.0)
    set_paragraph_format(p, WD_ALIGN_PARAGRAPH.RIGHT, 28.0,
                         first_line_indent_chars=0.0, base_size_pt=16.0)

    # ----- date : 仿宋_GB2312 16pt, right, exact 28pt -----
    p = doc.add_paragraph()
    add_text_run(p, '2026年11月24日', '仿宋_GB2312', 'Times New Roman', 16.0)
    set_paragraph_format(p, WD_ALIGN_PARAGRAPH.RIGHT, 28.0,
                         first_line_indent_chars=0.0, base_size_pt=16.0)

    doc.save('output.docx')


if __name__ == '__main__':
    build()

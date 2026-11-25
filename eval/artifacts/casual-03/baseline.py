# -*- coding: utf-8 -*-
"""按 GB/T 9704-2012 国标公文格式生成 output.docx"""

from docx import Document
from docx.shared import Pt, Mm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml.ns import qn
from docx.oxml import OxmlElement


# ---------------------------------------------------------------- 常量定义
ALIGN_MAP = {
    'left': WD_ALIGN_PARAGRAPH.LEFT,
    'right': WD_ALIGN_PARAGRAPH.RIGHT,
    'center': WD_ALIGN_PARAGRAPH.CENTER,
    'justify': WD_ALIGN_PARAGRAPH.JUSTIFY,
}

S_TITLE = {
    'font_cn': '方正小标宋简体', 'font_en': 'Times New Roman',
    'font_size_pt': 22.0, 'bold': True, 'italic': False,
    'color_hex': '000000', 'alignment': 'right',
    'line_spacing_value': 28.0, 'first_line_indent_chars': 0.0,
    'space_before_pt': 0.0, 'space_after_pt': 0.0,
}

S_RECIPIENT = {
    'font_cn': '仿宋_GB2312', 'font_en': 'Times New Roman',
    'font_size_pt': 16.0, 'bold': False, 'italic': False,
    'color_hex': '000000', 'alignment': 'left',
    'line_spacing_value': 28.0, 'first_line_indent_chars': 0.0,
    'space_before_pt': 0.0, 'space_after_pt': 0.0,
}

S_HEADING1 = {
    'font_cn': '黑体', 'font_en': 'Times New Roman',
    'font_size_pt': 16.0, 'bold': False, 'italic': False,
    'color_hex': '000000', 'alignment': 'justify',
    'line_spacing_value': 28.0, 'first_line_indent_chars': 2.0,
    'space_before_pt': 0.0, 'space_after_pt': 0.0,
}

S_BODY = {
    'font_cn': '仿宋_GB2312', 'font_en': 'Times New Roman',
    'font_size_pt': 16.0, 'bold': False, 'italic': False,
    'color_hex': '000000', 'alignment': 'justify',
    'line_spacing_value': 28.0, 'first_line_indent_chars': 2.0,
    'space_before_pt': 0.0, 'space_after_pt': 0.0,
}

S_SIGNATURE = {
    'font_cn': '仿宋_GB2312', 'font_en': 'Times New Roman',
    'font_size_pt': 16.0, 'bold': False, 'italic': False,
    'color_hex': '000000', 'alignment': 'right',
    'line_spacing_value': 28.0, 'first_line_indent_chars': 0.0,
    'space_before_pt': 0.0, 'space_after_pt': 0.0,
}

S_DATE = {
    'font_cn': '仿宋_GB2312', 'font_en': 'Times New Roman',
    'font_size_pt': 16.0, 'bold': False, 'italic': False,
    'color_hex': '000000', 'alignment': 'right',
    'line_spacing_value': 28.0, 'first_line_indent_chars': 0.0,
    'space_before_pt': 0.0, 'space_after_pt': 0.0,
}


# ---------------------------------------------------------------- 工具函数
def set_run_font(run, font_cn, font_en, size_pt,
                 bold=False, italic=False, color_hex='000000'):
    """显式设置中文 eastAsia 与西文 ascii/hAnsi/cs 字体。"""
    run.font.name = font_en
    run.font.size = Pt(size_pt)
    run.font.bold = bold
    run.font.italic = italic
    try:
        run.font.color.rgb = RGBColor.from_string(color_hex)
    except Exception:
        pass

    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.find(qn('w:rFonts'))
    if rFonts is None:
        rFonts = OxmlElement('w:rFonts')
        rPr.insert(0, rFonts)
    rFonts.set(qn('w:ascii'), font_en)
    rFonts.set(qn('w:hAnsi'), font_en)
    rFonts.set(qn('w:cs'), font_en)
    rFonts.set(qn('w:eastAsia'), font_cn)


def add_paragraph(doc, text, spec):
    """按样式规格添加段落，行距用固定磅值，缩进用字符单位。"""
    paragraph = doc.add_paragraph()

    fmt = paragraph.paragraph_format
    fmt.alignment = ALIGN_MAP.get(spec['alignment'], WD_ALIGN_PARAGRAPH.JUSTIFY)
    fmt.space_before = Pt(spec['space_before_pt'])
    fmt.space_after = Pt(spec['space_after_pt'])
    fmt.line_spacing_rule = WD_LINE_SPACING.EXACTLY
    fmt.line_spacing = Pt(spec['line_spacing_value'])

    pPr = paragraph._p.get_or_add_pPr()
    ind = pPr.get_or_add_ind()
    chars = float(spec['first_line_indent_chars'])
    ind.set(qn('w:firstLineChars'), str(int(round(chars * 100))))
    ind.set(qn('w:firstLine'),
            str(int(round(chars * spec['font_size_pt'] * 20))))
    ind.set(qn('w:leftChars'), '0')
    ind.set(qn('w:left'), '0')
    ind.set(qn('w:rightChars'), '0')
    ind.set(qn('w:right'), '0')

    run = paragraph.add_run(text)
    set_run_font(
        run,
        spec['font_cn'],
        spec['font_en'],
        spec['font_size_pt'],
        spec['bold'],
        spec['italic'],
        spec['color_hex'],
    )
    return paragraph


def add_page_number_footer(section):
    """页脚居中生成 '— PAGE —' 页码域（宋体四号：14pt）。"""
    footer = section.footer
    footer.is_linked_to_previous = False

    para = footer.paragraphs[0]
    para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    fmt = para.paragraph_format
    fmt.space_before = Pt(0)
    fmt.space_after = Pt(0)
    fmt.line_spacing_rule = WD_LINE_SPACING.SINGLE

    run_left = para.add_run('— ')
    set_run_font(run_left, '宋体', 'Times New Roman', 14.0)

    # PAGE 域（fldSimple），显式指定字体
    fld = OxmlElement('w:fldSimple')
    fld.set(qn('w:instr'), ' PAGE  \\* MERGEFORMAT ')

    field_run = OxmlElement('w:r')
    field_rPr = OxmlElement('w:rPr')
    field_fonts = OxmlElement('w:rFonts')
    field_fonts.set(qn('w:ascii'), 'Times New Roman')
    field_fonts.set(qn('w:hAnsi'), 'Times New Roman')
    field_fonts.set(qn('w:cs'), 'Times New Roman')
    field_fonts.set(qn('w:eastAsia'), '宋体')
    field_rPr.append(field_fonts)
    field_sz = OxmlElement('w:sz')
    field_sz.set(qn('w:val'), '28')
    field_rPr.append(field_sz)
    field_sz_cs = OxmlElement('w:szCs')
    field_sz_cs.set(qn('w:val'), '28')
    field_rPr.append(field_sz_cs)
    field_run.append(field_rPr)

    field_text = OxmlElement('w:t')
    field_text.text = '1'
    field_run.append(field_text)
    fld.append(field_run)
    para._p.append(fld)

    run_right = para.add_run(' —')
    set_run_font(run_right, '宋体', 'Times New Roman', 14.0)


# ---------------------------------------------------------------- 文档构建
doc = Document()

# 页面设置：A4，上 37mm / 下 35mm / 左 28mm / 右 26mm
section = doc.sections[0]
section.page_width = Mm(210)
section.page_height = Mm(297)
section.top_margin = Mm(37)
section.bottom_margin = Mm(35)
section.left_margin = Mm(28)
section.right_margin = Mm(26)
section.header_distance = Mm(15)
section.footer_distance = Mm(20)

# Normal 样式的中西文字体
normal_style = doc.styles['Normal']
normal_style.font.name = 'Times New Roman'
normal_style.font.size = Pt(16)
normal_rpr = normal_style.element.get_or_add_rPr()
normal_fonts = normal_rpr.find(qn('w:rFonts'))
if normal_fonts is None:
    normal_fonts = OxmlElement('w:rFonts')
    normal_rpr.insert(0, normal_fonts)
normal_fonts.set(qn('w:ascii'), 'Times New Roman')
normal_fonts.set(qn('w:hAnsi'), 'Times New Roman')
normal_fonts.set(qn('w:cs'), 'Times New Roman')
normal_fonts.set(qn('w:eastAsia'), '仿宋_GB2312')

# 正文内容（无红头：red_header.enabled=false，故不生成红头与红线）
add_paragraph(doc, '关于开展业务培训的通知', S_TITLE)
add_paragraph(doc, '各部门：', S_RECIPIENT)
add_paragraph(doc, '一、培训安排', S_HEADING1)
add_paragraph(doc, '请各部门做好组织协调，按时参加业务培训。', S_BODY)
add_paragraph(doc, '综合办公室', S_SIGNATURE)
add_paragraph(doc, '2026年11月24日', S_DATE)

# 页码
add_page_number_footer(section)

doc.save('output.docx')

# -*- coding: utf-8 -*-
from docx import Document
from docx.shared import Pt, Mm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.enum.style import WD_STYLE_TYPE
from docx.oxml.ns import qn
from docx.oxml import OxmlElement


# ----------------------------------------------------------------------------
# 基础工具
# ----------------------------------------------------------------------------
def _get_or_add_rfonts(rPr):
    rFonts = rPr.find(qn('w:rFonts'))
    if rFonts is None:
        rFonts = OxmlElement('w:rFonts')
        rPr.insert(0, rFonts)
    return rFonts


def _apply_fonts(rPr, font_cn, font_en):
    rFonts = _get_or_add_rfonts(rPr)
    rFonts.set(qn('w:ascii'), font_en)
    rFonts.set(qn('w:hAnsi'), font_en)
    rFonts.set(qn('w:eastAsia'), font_cn)
    rFonts.set(qn('w:cs'), font_en)
    rFonts.set(qn('w:hint'), 'eastAsia')


def set_run_font(run, font_cn, font_en, size_pt, bold=False, italic=False,
                 color_hex="000000"):
    run.font.name = font_en
    run.font.size = Pt(size_pt)
    run.font.bold = bold
    run.font.italic = italic
    run.font.color.rgb = RGBColor.from_string(color_hex)
    _apply_fonts(run._element.get_or_add_rPr(), font_cn, font_en)
    return run


def set_first_line_chars(paragraph, chars, size_pt):
    """显式写入 w:ind 的 firstLineChars（单位：百分之一字符）。"""
    pf = paragraph.paragraph_format
    pf.first_line_indent = Pt(chars * size_pt)
    pPr = paragraph._p.get_or_add_pPr()
    ind = pPr.find(qn('w:ind'))
    if ind is not None:
        ind.set(qn('w:firstLineChars'), str(int(round(chars * 100))))
        ind.set(qn('w:firstLine'), str(int(round(chars * size_pt * 20))))


def build_style(doc, name, font_cn, font_en, size_pt, bold, italic, color_hex,
                align, line_pt, indent_chars, before_pt, after_pt):
    styles = doc.styles
    st = styles.add_style(name, WD_STYLE_TYPE.PARAGRAPH)
    try:
        st.base_style = styles['Normal']
    except KeyError:
        pass
    st.quick_style = True

    st.font.name = font_en
    st.font.size = Pt(size_pt)
    st.font.bold = bold
    st.font.italic = italic
    st.font.color.rgb = RGBColor.from_string(color_hex)
    _apply_fonts(st.element.get_or_add_rPr(), font_cn, font_en)

    pf = st.paragraph_format
    pf.alignment = align
    pf.line_spacing_rule = WD_LINE_SPACING.EXACTLY
    pf.line_spacing = Pt(line_pt)
    pf.space_before = Pt(before_pt)
    pf.space_after = Pt(after_pt)
    pf.widow_control = False
    pf.first_line_indent = Pt(indent_chars * size_pt)

    pPr = st.element.get_or_add_pPr()
    ind = pPr.find(qn('w:ind'))
    if ind is not None:
        ind.set(qn('w:firstLineChars'), str(int(round(indent_chars * 100))))
    return st


def add_para(doc, style_name, text, font_cn, font_en, size_pt,
             bold=False, align=None, line_pt=None, indent_chars=None,
             before_pt=0.0, after_pt=0.0):
    p = doc.add_paragraph(style=style_name)
    pf = p.paragraph_format
    if align is not None:
        pf.alignment = align
    if line_pt is not None:
        pf.line_spacing_rule = WD_LINE_SPACING.EXACTLY
        pf.line_spacing = Pt(line_pt)
    pf.space_before = Pt(before_pt)
    pf.space_after = Pt(after_pt)
    pf.widow_control = False
    if indent_chars is not None:
        set_first_line_chars(p, indent_chars, size_pt)
    run = p.add_run(text)
    set_run_font(run, font_cn, font_en, size_pt, bold=bold)
    return p


def add_page_number_field(paragraph, font_cn, font_en, size_pt):
    run = paragraph.add_run()
    set_run_font(run, font_cn, font_en, size_pt)
    r = run._r

    fld_begin = OxmlElement('w:fldChar')
    fld_begin.set(qn('w:fldCharType'), 'begin')
    r.append(fld_begin)

    instr = OxmlElement('w:instrText')
    instr.set(qn('xml:space'), 'preserve')
    instr.text = ' PAGE '
    r.append(instr)

    fld_sep = OxmlElement('w:fldChar')
    fld_sep.set(qn('w:fldCharType'), 'separate')
    r.append(fld_sep)

    txt = OxmlElement('w:t')
    txt.set(qn('xml:space'), 'preserve')
    txt.text = '1'
    r.append(txt)

    fld_end = OxmlElement('w:fldChar')
    fld_end.set(qn('w:fldCharType'), 'end')
    r.append(fld_end)
    return run


# ----------------------------------------------------------------------------
# 文档构建
# ----------------------------------------------------------------------------
def main():
    doc = Document()

    # 清空模板中的默认段落
    body = doc.element.body
    for p in list(body.findall(qn('w:p'))):
        body.remove(p)

    # ---------------- 页面设置（A4 + 国标页边距） ----------------
    sec = doc.sections[0]
    sec.page_width = Mm(210.0)
    sec.page_height = Mm(297.0)
    sec.top_margin = Mm(34.0)
    sec.bottom_margin = Mm(35.0)
    sec.left_margin = Mm(28.0)
    sec.right_margin = Mm(26.0)
    sec.header_distance = Mm(15.0)
    sec.footer_distance = Mm(20.0)

    # ---------------- 默认（Normal）字体 ----------------
    normal = doc.styles['Normal']
    normal.font.name = 'Times New Roman'
    normal.font.size = Pt(16)
    _apply_fonts(normal.element.get_or_add_rPr(), '仿宋_GB2312', 'Times New Roman')
    npf = normal.paragraph_format
    npf.space_before = Pt(0)
    npf.space_after = Pt(0)

    # ---------------- 段落角色样式 ----------------
    build_style(doc, 'gw_title', '黑体', 'Times New Roman', 22.0, False, False,
                '000000', WD_ALIGN_PARAGRAPH.CENTER, 30.0, 0.0, 0.0, 0.0)

    build_style(doc, 'gw_heading_1', '黑体', 'Times New Roman', 16.0, False, False,
                '000000', WD_ALIGN_PARAGRAPH.JUSTIFY, 28.0, 2.0, 0.0, 0.0)

    build_style(doc, 'gw_heading_2', '楷体_GB2312', 'Times New Roman', 16.0, False, False,
                '000000', WD_ALIGN_PARAGRAPH.JUSTIFY, 28.0, 2.0, 0.0, 0.0)

    build_style(doc, 'gw_heading_3', '仿宋_GB2312', 'Times New Roman', 16.0, False, False,
                '000000', WD_ALIGN_PARAGRAPH.JUSTIFY, 28.0, 2.0, 0.0, 0.0)

    build_style(doc, 'gw_body', '微软雅黑', 'Times New Roman', 18.0, False, False,
                '000000', WD_ALIGN_PARAGRAPH.JUSTIFY, 28.0, 2.0, 0.0, 0.0)

    build_style(doc, 'gw_recipient', '仿宋_GB2312', 'Times New Roman', 16.0, False, False,
                '000000', WD_ALIGN_PARAGRAPH.LEFT, 28.0, 0.0, 0.0, 0.0)

    build_style(doc, 'gw_signature', '仿宋_GB2312', 'Times New Roman', 16.0, False, False,
                '000000', WD_ALIGN_PARAGRAPH.RIGHT, 28.0, 0.0, 0.0, 0.0)

    build_style(doc, 'gw_date', '仿宋_GB2312', 'Times New Roman', 16.0, False, False,
                '000000', WD_ALIGN_PARAGRAPH.RIGHT, 28.0, 0.0, 0.0, 0.0)

    # ---------------- 正文内容 ----------------
    # 标题
    add_para(doc, 'gw_title', '关于开展业务培训的通知',
             '黑体', 'Times New Roman', 22.0,
             align=WD_ALIGN_PARAGRAPH.CENTER, line_pt=30.0, indent_chars=0.0)

    # 主送机关
    add_para(doc, 'gw_recipient', '各部门：',
             '仿宋_GB2312', 'Times New Roman', 16.0,
             align=WD_ALIGN_PARAGRAPH.LEFT, line_pt=28.0, indent_chars=0.0)

    # 正文块
    blocks = [
        {'type': 'heading_1', 'text': '一、培训安排'},
        {'type': 'body', 'text': '请各部门做好组织协调，按时参加业务培训。'},
    ]
    style_map = {
        'heading_1': ('gw_heading_1', '黑体', 16.0),
        'heading_2': ('gw_heading_2', '楷体_GB2312', 16.0),
        'heading_3': ('gw_heading_3', '仿宋_GB2312', 16.0),
        'body': ('gw_body', '微软雅黑', 18.0),
    }
    for blk in blocks:
        btype = blk.get('type') or 'body'
        style_name, cn_font, size_pt = style_map.get(btype, style_map['body'])
        text = blk.get('text') or ''
        add_para(doc, style_name, text, cn_font, 'Times New Roman', size_pt,
                 align=WD_ALIGN_PARAGRAPH.JUSTIFY, line_pt=28.0, indent_chars=2.0)

    # 附件（本 AST 为空，仍保留逻辑）
    attachments = []
    if attachments:
        add_para(doc, 'gw_body', '附件：', '仿宋_GB2312', 'Times New Roman', 16.0,
                 align=WD_ALIGN_PARAGRAPH.JUSTIFY, line_pt=28.0, indent_chars=0.0)
        for i, att in enumerate(attachments, start=1):
            add_para(doc, 'gw_body', '%d.%s' % (i, att), '仿宋_GB2312',
                     'Times New Roman', 16.0,
                     align=WD_ALIGN_PARAGRAPH.JUSTIFY, line_pt=28.0, indent_chars=2.0)

    # 发文机关署名
    add_para(doc, 'gw_signature', '综合办公室',
             '仿宋_GB2312', 'Times New Roman', 16.0,
             align=WD_ALIGN_PARAGRAPH.RIGHT, line_pt=28.0, indent_chars=0.0)

    # 成文日期
    add_para(doc, 'gw_date', '2026年11月24日',
             '仿宋_GB2312', 'Times New Roman', 16.0,
             align=WD_ALIGN_PARAGRAPH.RIGHT, line_pt=28.0, indent_chars=0.0)

    # ---------------- 页码（PAGE 域） ----------------
    footer = sec.footer
    footer.is_linked_to_previous = False
    if footer.paragraphs:
        fp = footer.paragraphs[0]
    else:
        fp = footer.add_paragraph()
    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    fpf = fp.paragraph_format
    fpf.first_line_indent = Pt(0)
    fpf.space_before = Pt(0)
    fpf.space_after = Pt(0)
    fpf.line_spacing_rule = WD_LINE_SPACING.SINGLE

    dash_left = fp.add_run('— ')
    set_run_font(dash_left, '宋体', 'Times New Roman', 14.0)

    add_page_number_field(fp, '宋体', 'Times New Roman', 14.0)

    dash_right = fp.add_run(' —')
    set_run_font(dash_right, '宋体', 'Times New Roman', 14.0)

    doc.save('output.docx')


if __name__ == '__main__':
    main()

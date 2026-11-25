# -*- coding: utf-8 -*-
"""生成 GB/T 9704-2012 国标公文 Word 文档 (output.docx)"""

from docx import Document
from docx.shared import Pt, Mm
from docx.enum.style import WD_STYLE_TYPE
from docx.oxml.ns import qn
from docx.oxml import OxmlElement


# --------------------------------------------------------------------------
# OOXML 子元素合法顺序表
# --------------------------------------------------------------------------
RPR_ORDER = [
    'rStyle', 'rFonts', 'b', 'bCs', 'i', 'iCs', 'caps', 'smallCaps', 'strike',
    'dstrike', 'outline', 'shadow', 'emboss', 'imprint', 'noProof', 'snapToGrid',
    'vanish', 'webHidden', 'color', 'spacing', 'w', 'kern', 'position', 'sz',
    'szCs', 'highlight', 'u', 'effect', 'bdr', 'shd', 'fitText', 'vertAlign',
    'rtl', 'cs', 'em', 'lang', 'eastAsianLayout', 'specVanish', 'oMath',
]

PPR_ORDER = [
    'pStyle', 'keepNext', 'keepLines', 'pageBreakBefore', 'framePr',
    'widowControl', 'numPr', 'suppressLineNumbers', 'pBdr', 'shd', 'tabs',
    'suppressAutoHyphens', 'kinsoku', 'wordWrap', 'overflowPunct',
    'topLinePunct', 'autoSpaceDE', 'autoSpaceDN', 'bidi', 'adjustRightInd',
    'snapToGrid', 'spacing', 'ind', 'contextualSpacing', 'mirrorIndents',
    'suppressOverlap', 'jc', 'textDirection', 'textAlignment',
    'textboxTightWrap', 'outlineLvl', 'divId', 'cnfStyle', 'rPr', 'sectPr',
    'pPrChange',
]


def _ordered_child(parent, tag, order):
    el = parent.find(qn('w:' + tag))
    if el is not None:
        return el
    el = OxmlElement('w:' + tag)
    idx = order.index(tag)
    inserted = False
    for child in list(parent):
        ctag = child.tag.split('}')[-1]
        if ctag in order and order.index(ctag) > idx:
            child.addprevious(el)
            inserted = True
            break
    if not inserted:
        parent.append(el)
    return el


def _rpr_child(rPr, tag):
    return _ordered_child(rPr, tag, RPR_ORDER)


def _ppr_child(pPr, tag):
    return _ordered_child(pPr, tag, PPR_ORDER)


# --------------------------------------------------------------------------
# 字体 / 段落格式化
# --------------------------------------------------------------------------
def apply_font(rPr, font_cn, font_en, size_pt,
               bold=False, italic=False, color='000000'):
    """显式写入 eastAsia / ascii / hAnsi / cs 及 sz / szCs。"""
    rFonts = _rpr_child(rPr, 'rFonts')
    rFonts.set(qn('w:ascii'), font_en)
    rFonts.set(qn('w:hAnsi'), font_en)
    rFonts.set(qn('w:eastAsia'), font_cn)
    rFonts.set(qn('w:cs'), font_en)

    half = str(int(round(size_pt * 2)))

    b = _rpr_child(rPr, 'b')
    b.set(qn('w:val'), '1' if bold else '0')
    bCs = _rpr_child(rPr, 'bCs')
    bCs.set(qn('w:val'), '1' if bold else '0')

    i = _rpr_child(rPr, 'i')
    i.set(qn('w:val'), '1' if italic else '0')
    iCs = _rpr_child(rPr, 'iCs')
    iCs.set(qn('w:val'), '1' if italic else '0')

    sz = _rpr_child(rPr, 'sz')
    sz.set(qn('w:val'), half)
    szCs = _rpr_child(rPr, 'szCs')
    szCs.set(qn('w:val'), half)

    c = _rpr_child(rPr, 'color')
    c.set(qn('w:val'), color)


def apply_para_fmt(pPr, align, before_pt, after_pt, line_pt,
                   indent_chars, size_pt):
    """对齐 / 段前段后 / 固定行距 / 首行缩进（双单位）。"""
    sp = _ppr_child(pPr, 'spacing')
    sp.set(qn('w:before'), str(int(round(before_pt * 20))))
    sp.set(qn('w:after'), str(int(round(after_pt * 20))))
    sp.set(qn('w:line'), str(int(round(line_pt * 20))))
    sp.set(qn('w:lineRule'), 'exact')

    ind = _ppr_child(pPr, 'ind')
    ind.set(qn('w:left'), '0')
    ind.set(qn('w:right'), '0')
    ind.set(qn('w:firstLine'),
            str(int(round(indent_chars * size_pt * 20))))
    ind.set(qn('w:firstLineChars'), str(int(round(indent_chars * 100))))

    jc = _ppr_child(pPr, 'jc')
    jc.set(qn('w:val'), align)   # both = 两端对齐


# --------------------------------------------------------------------------
# 样式配置（依据目标格式）
# --------------------------------------------------------------------------
def _cfg(font_cn, font_en, size, bold, italic, color,
         align, line, indent, before, after):
    return dict(font_cn=font_cn, font_en=font_en, size=size, bold=bold,
                italic=italic, color=color, align=align, line=line,
                indent=indent, before=before, after=after)


CFG = {
    'gw_title': _cfg('黑体', 'Times New Roman', 24.0, False, False,
                     '000000', 'center', 28.0, 0.0, 0.0, 0.0),
    'gw_heading_1': _cfg('黑体', 'Times New Roman', 16.0, False, False,
                         '000000', 'both', 28.0, 2.0, 0.0, 0.0),
    'gw_heading_2': _cfg('楷体_GB2312', 'Times New Roman', 16.0, False, False,
                         '000000', 'both', 28.0, 2.0, 0.0, 0.0),
    'gw_heading_3': _cfg('仿宋_GB2312', 'Times New Roman', 16.0, False, False,
                         '000000', 'both', 28.0, 2.0, 0.0, 0.0),
    'gw_body': _cfg('宋体', 'Times New Roman', 16.0, False, False,
                    '000000', 'both', 24.0, 2.0, 0.0, 0.0),
    'gw_recipient': _cfg('仿宋_GB2312', 'Times New Roman', 16.0, False, False,
                         '000000', 'left', 28.0, 0.0, 0.0, 0.0),
    'gw_signature': _cfg('仿宋_GB2312', 'Times New Roman', 16.0, False, False,
                         '000000', 'right', 28.0, 0.0, 0.0, 0.0),
    'gw_date': _cfg('仿宋_GB2312', 'Times New Roman', 16.0, False, False,
                    '000000', 'right', 28.0, 0.0, 0.0, 0.0),
    'gw_doc_number': _cfg('仿宋_GB2312', 'Times New Roman', 16.0, False, False,
                          '000000', 'center', 28.0, 0.0, 0.0, 0.0),
    'gw_red_header': _cfg('方正小标宋简体', 'Times New Roman', 36.0, False,
                          False, 'FF0000', 'center', 44.0, 0.0, 0.0, 0.0),
}


def create_style(doc, style_id, cfg):
    st = doc.styles.add_style(style_id, WD_STYLE_TYPE.PARAGRAPH)
    st.element.set(qn('w:styleId'), style_id)
    st.base_style = doc.styles['Normal']

    el = st.element
    pPr = el.find(qn('w:pPr'))
    if pPr is None:
        pPr = OxmlElement('w:pPr')
        el.append(pPr)
    apply_para_fmt(pPr, cfg['align'], cfg['before'], cfg['after'],
                   cfg['line'], cfg['indent'], cfg['size'])

    rPr = el.find(qn('w:rPr'))
    if rPr is None:
        rPr = OxmlElement('w:rPr')
        el.append(rPr)
    apply_font(rPr, cfg['font_cn'], cfg['font_en'], cfg['size'],
               cfg['bold'], cfg['italic'], cfg['color'])
    return st


# --------------------------------------------------------------------------
# 段落 / 运行辅助
# --------------------------------------------------------------------------
def add_para(doc, style, text, cfg):
    p = doc.add_paragraph(style=style)
    if text:
        r = p.add_run(text)
        apply_font(r._r.get_or_add_rPr(), cfg['font_cn'], cfg['font_en'],
                   cfg['size'], cfg['bold'], cfg['italic'], cfg['color'])
    return p


def add_spacer(doc, line_pt=28.0):
    p = doc.add_paragraph()
    apply_para_fmt(p._p.get_or_add_pPr(), 'both', 0.0, 0.0, line_pt,
                   0.0, 16.0)
    r = p.add_run('')
    apply_font(r._r.get_or_add_rPr(), '宋体', 'Times New Roman', 16.0,
               False, False, '000000')
    return p


def add_bottom_border(paragraph, color='FF0000', sz=12, space=4):
    """红色段落下边框（红线）。"""
    pPr = paragraph._p.get_or_add_pPr()
    pBdr = _ppr_child(pPr, 'pBdr')
    bottom = OxmlElement('w:bottom')
    bottom.set(qn('w:val'), 'single')
    bottom.set(qn('w:sz'), str(sz))
    bottom.set(qn('w:space'), str(space))
    bottom.set(qn('w:color'), color)
    pBdr.append(bottom)


def add_page_field(paragraph, cfg):
    """PAGE 页码域。"""
    run = paragraph.add_run()
    r = run._r
    apply_font(r.get_or_add_rPr(), cfg['font_cn'], cfg['font_en'],
               cfg['size'], cfg['bold'], cfg['italic'], cfg['color'])

    fld_begin = OxmlElement('w:fldChar')
    fld_begin.set(qn('w:fldCharType'), 'begin')

    instr = OxmlElement('w:instrText')
    instr.set(qn('xml:space'), 'preserve')
    instr.text = ' PAGE '

    fld_sep = OxmlElement('w:fldChar')
    fld_sep.set(qn('w:fldCharType'), 'separate')

    t = OxmlElement('w:t')
    t.text = '1'

    fld_end = OxmlElement('w:fldChar')
    fld_end.set(qn('w:fldCharType'), 'end')

    r.append(fld_begin)
    r.append(instr)
    r.append(fld_sep)
    r.append(t)
    r.append(fld_end)


# --------------------------------------------------------------------------
# 主流程
# --------------------------------------------------------------------------
def main():
    # ---- 正文 AST 数据 --------------------------------------------------
    red_header_org = '综合办公室'
    doc_number = '综办〔2026〕12号'
    title = '关于开展档案归档检查的通知'
    recipient = '各部门：'
    blocks = [
        {'type': 'heading_1', 'text': '一、检查安排'},
        {'type': 'body',
         'text': '请各部门核对纸质与电子档案目录，整理归档清单并反馈检查结果。'},
    ]
    attachments = []
    signature = '综合办公室'
    date_text = '2026年11月24日'

    red_header_enabled = False          # 配置值
    red_header_font_cn = '方正小标宋简体'
    red_header_size = 36.0
    red_header_color = 'FF0000'
    has_red_line = True

    # AST 中的红头机关优先
    show_red_header = red_header_enabled or bool(red_header_org)

    # ---- 文档与页面 -----------------------------------------------------
    doc = Document()

    sec = doc.sections[0]
    sec.page_width = Mm(210.0)
    sec.page_height = Mm(297.0)
    sec.top_margin = Mm(30.0)
    sec.bottom_margin = Mm(35.0)
    sec.left_margin = Mm(28.0)
    sec.right_margin = Mm(26.0)
    sec.header_distance = Mm(15.0)
    sec.footer_distance = Mm(25.0)

    # ---- 样式 -----------------------------------------------------------
    styles = {}
    for sid, cfg in CFG.items():
        styles[sid] = create_style(doc, sid, cfg)

    # Normal 也写入显式字体
    normal_rPr = doc.styles['Normal'].element.get_or_add_rPr()
    apply_font(normal_rPr, '宋体', 'Times New Roman', 16.0,
               False, False, '000000')

    # ---- 红头机关 -------------------------------------------------------
    if show_red_header:
        cfg = CFG['gw_red_header']
        cfg['font_cn'] = red_header_font_cn
        cfg['size'] = red_header_size
        cfg['color'] = red_header_color
        cfg['line'] = red_header_size + 8.0
        # 重新覆盖样式中的字形
        st_el = styles['gw_red_header'].element
        st_rPr = st_el.find(qn('w:rPr'))
        apply_font(st_rPr, cfg['font_cn'], cfg['font_en'], cfg['size'],
                   cfg['bold'], cfg['italic'], cfg['color'])
        add_para(doc, styles['gw_red_header'], red_header_org, cfg)
        add_spacer(doc, 20.0)

    # ---- 发文字号 + 红线 ------------------------------------------------
    cfg_num = CFG['gw_doc_number']
    p_num = add_para(doc, styles['gw_doc_number'], doc_number, cfg_num)
    if show_red_header and has_red_line:
        add_bottom_border(p_num, color='FF0000', sz=12, space=6)

    add_spacer(doc, 28.0)

    # ---- 标题 -----------------------------------------------------------
    cfg_title = CFG['gw_title']
    add_para(doc, styles['gw_title'], title, cfg_title)

    add_spacer(doc, 28.0)

    # ---- 主送机关 -------------------------------------------------------
    cfg_rec = CFG['gw_recipient']
    add_para(doc, styles['gw_recipient'], recipient, cfg_rec)

    # ---- 正文 -----------------------------------------------------------
    style_map = {
        'heading_1': ('gw_heading_1', CFG['gw_heading_1']),
        'heading_2': ('gw_heading_2', CFG['gw_heading_2']),
        'heading_3': ('gw_heading_3', CFG['gw_heading_3']),
        'body': ('gw_body', CFG['gw_body']),
    }
    for block in blocks:
        sid, bcfg = style_map.get(block['type'], style_map['body'])
        add_para(doc, styles[sid], block.get('text') or '', bcfg)

    # ---- 附件说明 -------------------------------------------------------
    for item in attachments:
        add_para(doc, styles['gw_body'], item, CFG['gw_body'])

    # ---- 落款与成文日期 -------------------------------------------------
    add_spacer(doc, 28.0)
    add_para(doc, styles['gw_signature'], signature, CFG['gw_signature'])
    add_para(doc, styles['gw_date'], date_text, CFG['gw_date'])

    # ---- 页码（PAGE 域，页脚居中） --------------------------------------
    footer = sec.footer
    footer.is_linked_to_previous = False
    fp = footer.paragraphs[0] if footer.paragraphs else footer.add_paragraph()
    apply_para_fmt(fp._p.get_or_add_pPr(), 'center', 0.0, 0.0, 28.0,
                   0.0, 14.0)

    cfg_footer = _cfg('宋体', 'Times New Roman', 14.0, False, False,
                      '000000', 'center', 28.0, 0.0, 0.0, 0.0)

    r1 = fp.add_run('— ')
    apply_font(r1._r.get_or_add_rPr(), cfg_footer['font_cn'],
               cfg_footer['font_en'], cfg_footer['size'],
               cfg_footer['bold'], cfg_footer['italic'],
               cfg_footer['color'])

    add_page_field(fp, cfg_footer)

    r3 = fp.add_run(' —')
    apply_font(r3._r.get_or_add_rPr(), cfg_footer['font_cn'],
               cfg_footer['font_en'], cfg_footer['size'],
               cfg_footer['bold'], cfg_footer['italic'],
               cfg_footer['color'])

    # ---- 保存 -----------------------------------------------------------
    doc.save('output.docx')


if __name__ == '__main__':
    main()

# -*- coding: utf-8 -*-
"""
生成 output.docx（GB/T 9704-2012 国标公文格式）
仅使用 python-docx / lxml，不导入项目模块、不访问网络。
"""

from docx import Document
from docx.shared import Pt, Mm
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml.ns import qn
from docx.oxml import OxmlElement


# ----------------------------------------------------------------------------
# 目标格式配置
# ----------------------------------------------------------------------------
CONFIG = {
    "page": {
        "size": "A4",
        "margin_top_mm": 38.0,
        "margin_bottom_mm": 35.0,
        "margin_left_mm": 28.0,
        "margin_right_mm": 26.0,
        "show_page_number": True,
    },
    "red_header": {
        "enabled": False,
        "org_name": None,
        "font_cn": "方正小标宋简体",
        "font_size_pt": 36.0,
        "color_hex": "FF0000",
        "has_red_line": True,
        "doc_number_font_cn": "仿宋_GB2312",
        "doc_number_size_pt": 16.0,
    },
    "styles": {
        "title": {
            "font_cn": "黑体", "font_en": "Times New Roman", "font_size_pt": 22.0,
            "bold": False, "italic": False, "color_hex": "000000",
            "alignment": "center", "line_spacing_rule": "exact",
            "line_spacing_value": 30.0, "first_line_indent_chars": 0.0,
            "space_before_pt": 0.0, "space_after_pt": 0.0,
        },
        "heading_1": {
            "font_cn": "黑体", "font_en": "Times New Roman", "font_size_pt": 16.0,
            "bold": False, "italic": False, "color_hex": "000000",
            "alignment": "justify", "line_spacing_rule": "exact",
            "line_spacing_value": 28.0, "first_line_indent_chars": 2.0,
            "space_before_pt": 0.0, "space_after_pt": 0.0,
        },
        "heading_2": {
            "font_cn": "楷体_GB2312", "font_en": "Times New Roman", "font_size_pt": 16.0,
            "bold": False, "italic": False, "color_hex": "000000",
            "alignment": "justify", "line_spacing_rule": "exact",
            "line_spacing_value": 28.0, "first_line_indent_chars": 2.0,
            "space_before_pt": 0.0, "space_after_pt": 0.0,
        },
        "heading_3": {
            "font_cn": "仿宋_GB2312", "font_en": "Times New Roman", "font_size_pt": 16.0,
            "bold": False, "italic": False, "color_hex": "000000",
            "alignment": "justify", "line_spacing_rule": "exact",
            "line_spacing_value": 28.0, "first_line_indent_chars": 2.0,
            "space_before_pt": 0.0, "space_after_pt": 0.0,
        },
        "body": {
            "font_cn": "楷体_GB2312", "font_en": "Times New Roman", "font_size_pt": 15.0,
            "bold": False, "italic": False, "color_hex": "000000",
            "alignment": "justify", "line_spacing_rule": "exact",
            "line_spacing_value": 32.0, "first_line_indent_chars": 2.0,
            "space_before_pt": 0.0, "space_after_pt": 0.0,
        },
        "recipient": {
            "font_cn": "仿宋_GB2312", "font_en": "Times New Roman", "font_size_pt": 16.0,
            "bold": False, "italic": False, "color_hex": "000000",
            "alignment": "left", "line_spacing_rule": "exact",
            "line_spacing_value": 28.0, "first_line_indent_chars": 0.0,
            "space_before_pt": 0.0, "space_after_pt": 0.0,
        },
        "signature": {
            "font_cn": "仿宋_GB2312", "font_en": "Times New Roman", "font_size_pt": 16.0,
            "bold": False, "italic": False, "color_hex": "000000",
            "alignment": "right", "line_spacing_rule": "exact",
            "line_spacing_value": 28.0, "first_line_indent_chars": 0.0,
            "space_before_pt": 0.0, "space_after_pt": 0.0,
        },
        "date": {
            "font_cn": "仿宋_GB2312", "font_en": "Times New Roman", "font_size_pt": 16.0,
            "bold": False, "italic": False, "color_hex": "000000",
            "alignment": "right", "line_spacing_rule": "exact",
            "line_spacing_value": 28.0, "first_line_indent_chars": 0.0,
            "space_before_pt": 0.0, "space_after_pt": 0.0,
        },
    },
}

# ----------------------------------------------------------------------------
# 正文 AST
# ----------------------------------------------------------------------------
AST = {
    "doc_type": "notice",
    "red_header_org": "综合办公室",
    "doc_number": "综办〔2026〕12号",
    "title": "关于开展档案归档检查的通知",
    "recipient": "各部门：",
    "blocks": [
        {"type": "heading_1", "text": "一、检查安排", "rows": None},
        {"type": "body",
         "text": "请各部门核对纸质与电子档案目录，整理归档清单并反馈检查结果。",
         "rows": None},
    ],
    "attachments": [],
    "signature": "综合办公室",
    "date": "2026年11月24日",
}

# ----------------------------------------------------------------------------
# OOXML 子元素顺序表
# ----------------------------------------------------------------------------
PPR_ORDER = [
    'w:pStyle', 'w:keepNext', 'w:keepLines', 'w:pageBreakBefore', 'w:framePr',
    'w:widowControl', 'w:numPr', 'w:suppressLineNumbers', 'w:pBdr', 'w:shd',
    'w:tabs', 'w:suppressAutoHyphens', 'w:kinsoku', 'w:wordWrap',
    'w:overflowPunct', 'w:topLinePunct', 'w:autoSpaceDE', 'w:autoSpaceDN',
    'w:bidi', 'w:adjustRightInd', 'w:snapToGrid', 'w:spacing', 'w:ind',
    'w:contextualSpacing', 'w:mirrorIndents', 'w:suppressOverlap', 'w:jc',
    'w:textDirection', 'w:textAlignment', 'w:textboxTightWrap', 'w:outlineLvl',
    'w:divId', 'w:cnfStyle', 'w:rPr', 'w:sectPr', 'w:pPrChange',
]

RPR_ORDER = [
    'w:rStyle', 'w:rFonts', 'w:b', 'w:bCs', 'w:i', 'w:iCs', 'w:caps',
    'w:smallCaps', 'w:strike', 'w:dstrike', 'w:outline', 'w:shadow',
    'w:emboss', 'w:imprint', 'w:noProof', 'w:snapToGrid', 'w:vanish',
    'w:webHidden', 'w:color', 'w:spacing', 'w:w', 'w:kern', 'w:position',
    'w:sz', 'w:szCs', 'w:highlight', 'w:u', 'w:effect', 'w:bdr', 'w:shd',
    'w:fitText', 'w:vertAlign', 'w:rtl', 'w:cs', 'w:em', 'w:lang',
    'w:eastAsianLayout', 'w:specVanish', 'w:oMath',
]

ALIGN_MAP = {
    'left': WD_ALIGN_PARAGRAPH.LEFT,
    'center': WD_ALIGN_PARAGRAPH.CENTER,
    'right': WD_ALIGN_PARAGRAPH.RIGHT,
    'justify': WD_ALIGN_PARAGRAPH.JUSTIFY,
    'both': WD_ALIGN_PARAGRAPH.JUSTIFY,
}


def insert_ordered(parent, elem, order):
    """按 OOXML 规定顺序插入子元素，同名元素先移除。"""
    tag = elem.tag
    for child in list(parent):
        if child.tag == tag:
            parent.remove(child)
    if tag not in order:
        parent.append(elem)
        return elem
    idx = order.index(tag)
    for child in list(parent):
        if child.tag in order and order.index(child.tag) > idx:
            child.addprevious(elem)
            return elem
    parent.append(elem)
    return elem


# ----------------------------------------------------------------------------
# 字形（run）处理
# ----------------------------------------------------------------------------
def build_rpr(cn, en, size_pt, bold=False, italic=False, color='000000'):
    rPr = OxmlElement('w:rPr')

    rFonts = OxmlElement('w:rFonts')
    rFonts.set(qn('w:ascii'), en)
    rFonts.set(qn('w:hAnsi'), en)
    rFonts.set(qn('w:cs'), en)
    rFonts.set(qn('w:eastAsia'), cn)
    insert_ordered(rPr, rFonts, RPR_ORDER)

    for tag in ('w:b', 'w:bCs'):
        el = OxmlElement(tag)
        el.set(qn('w:val'), '1' if bold else '0')
        insert_ordered(rPr, el, RPR_ORDER)

    for tag in ('w:i', 'w:iCs'):
        el = OxmlElement(tag)
        el.set(qn('w:val'), '1' if italic else '0')
        insert_ordered(rPr, el, RPR_ORDER)

    color_el = OxmlElement('w:color')
    color_el.set(qn('w:val'), color)
    insert_ordered(rPr, color_el, RPR_ORDER)

    half_points = str(int(round(size_pt * 2)))
    sz = OxmlElement('w:sz')
    sz.set(qn('w:val'), half_points)
    insert_ordered(rPr, sz, RPR_ORDER)

    szcs = OxmlElement('w:szCs')
    szcs.set(qn('w:val'), half_points)
    insert_ordered(rPr, szcs, RPR_ORDER)

    return rPr


def format_run(run, cn, en, size_pt, bold=False, italic=False, color='000000'):
    el = run._element
    old = el.find(qn('w:rPr'))
    if old is not None:
        el.remove(old)
    el.insert(0, build_rpr(cn, en, size_pt, bold, italic, color))


# ----------------------------------------------------------------------------
# 段落处理
# ----------------------------------------------------------------------------
def apply_pformat(p, st):
    pf = p.paragraph_format
    pf.space_before = Pt(st['space_before_pt'])
    pf.space_after = Pt(st['space_after_pt'])
    pf.line_spacing = Pt(st['line_spacing_value'])
    pf.line_spacing_rule = WD_LINE_SPACING.EXACTLY
    pf.alignment = ALIGN_MAP.get(st['alignment'], WD_ALIGN_PARAGRAPH.JUSTIFY)

    chars = float(st.get('first_line_indent_chars') or 0.0)
    pPr = p._p.get_or_add_pPr()
    ind = pPr.find(qn('w:ind'))
    if ind is None:
        ind = OxmlElement('w:ind')
        insert_ordered(pPr, ind, PPR_ORDER)
    ind.set(qn('w:firstLineChars'), str(int(round(chars * 100))))
    ind.set(qn('w:firstLine'),
            str(int(round(chars * float(st['font_size_pt']) * 20))))


def set_bottom_border(p, color_hex='FF0000', size_eighth_pt=12):
    """红色段落下边框（红头红线）。"""
    pPr = p._p.get_or_add_pPr()
    pBdr = OxmlElement('w:pBdr')
    bottom = OxmlElement('w:bottom')
    bottom.set(qn('w:val'), 'single')
    bottom.set(qn('w:sz'), str(size_eighth_pt))
    bottom.set(qn('w:space'), '1')
    bottom.set(qn('w:color'), color_hex)
    pBdr.append(bottom)
    insert_ordered(pPr, pBdr, PPR_ORDER)


def add_par(doc, text, st):
    p = doc.add_paragraph()
    apply_pformat(p, st)
    if text:
        run = p.add_run(text)
        format_run(run, st['font_cn'], st['font_en'], st['font_size_pt'],
                   st.get('bold', False), st.get('italic', False),
                   st.get('color_hex', '000000'))
    return p


# ----------------------------------------------------------------------------
# 页面 / 样式
# ----------------------------------------------------------------------------
def setup_page(doc):
    page = CONFIG['page']
    sec = doc.sections[0]
    sec.page_width = Mm(210.0)     # A4
    sec.page_height = Mm(297.0)
    sec.top_margin = Mm(page['margin_top_mm'])
    sec.bottom_margin = Mm(page['margin_bottom_mm'])
    sec.left_margin = Mm(page['margin_left_mm'])
    sec.right_margin = Mm(page['margin_right_mm'])
    sec.header_distance = Mm(15.0)
    sec.footer_distance = Mm(18.0)
    return sec


def setup_normal_style(doc):
    normal = doc.styles['Normal']
    normal.font.name = 'Times New Roman'
    normal.font.size = Pt(16)
    rPr = normal.element.get_or_add_rPr()
    rFonts = rPr.find(qn('w:rFonts'))
    if rFonts is None:
        rFonts = OxmlElement('w:rFonts')
        insert_ordered(rPr, rFonts, RPR_ORDER)
    rFonts.set(qn('w:ascii'), 'Times New Roman')
    rFonts.set(qn('w:hAnsi'), 'Times New Roman')
    rFonts.set(qn('w:cs'), 'Times New Roman')
    rFonts.set(qn('w:eastAsia'), '仿宋_GB2312')


def add_page_number_footer(section):
    """页脚居中 PAGE 页码：— 1 —"""
    footer = section.footer
    footer.is_linked_to_previous = False
    p = footer.paragraphs[0] if footer.paragraphs else footer.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    pf = p.paragraph_format
    pf.space_before = Pt(0)
    pf.space_after = Pt(0)
    pf.line_spacing = Pt(28.0)
    pf.line_spacing_rule = WD_LINE_SPACING.EXACTLY

    cn, en, size = '仿宋_GB2312', 'Times New Roman', 14.0

    r1 = p.add_run('— ')
    format_run(r1, cn, en, size)

    fld = OxmlElement('w:fldSimple')
    fld.set(qn('w:instr'), r' PAGE \* MERGEFORMAT ')
    r = OxmlElement('w:r')
    r.append(build_rpr(cn, en, size))
    t = OxmlElement('w:t')
    t.text = '1'
    r.append(t)
    fld.append(r)
    p._p.append(fld)

    r2 = p.add_run(' —')
    format_run(r2, cn, en, size)


# ----------------------------------------------------------------------------
# 主流程
# ----------------------------------------------------------------------------
def main():
    doc = Document()
    section = setup_page(doc)
    setup_normal_style(doc)

    styles = CONFIG['styles']
    red = CONFIG['red_header']

    # ---- 红头（机关名称）与文号 ----
    org = AST.get('red_header_org') or red.get('org_name')
    doc_number = AST.get('doc_number')

    if red.get('enabled') or org:
        if org:
            org_style = {
                'font_cn': red['font_cn'],
                'font_en': 'Times New Roman',
                'font_size_pt': red['font_size_pt'],
                'bold': False, 'italic': False,
                'color_hex': red['color_hex'],
                'alignment': 'center',
                'line_spacing_rule': 'exact',
                'line_spacing_value': red['font_size_pt'] * 1.2,
                'first_line_indent_chars': 0.0,
                'space_before_pt': 0.0,
                'space_after_pt': 0.0,
            }
            add_par(doc, org, org_style)

        if doc_number:
            dn_style = {
                'font_cn': red['doc_number_font_cn'],
                'font_en': 'Times New Roman',
                'font_size_pt': red['doc_number_size_pt'],
                'bold': False, 'italic': False,
                'color_hex': '000000',
                'alignment': 'center',
                'line_spacing_rule': 'exact',
                'line_spacing_value': red['doc_number_size_pt'] * 1.75,
                'first_line_indent_chars': 0.0,
                'space_before_pt': 0.0,
                'space_after_pt': 0.0,
            }
            p_dn = add_par(doc, doc_number, dn_style)
            if red.get('has_red_line'):
                set_bottom_border(p_dn, color_hex=red['color_hex'], size_eighth_pt=12)

    # ---- 标题 ----
    if AST.get('title'):
        add_par(doc, AST['title'], styles['title'])

    # ---- 主送机关 ----
    if AST.get('recipient'):
        add_par(doc, AST['recipient'], styles['recipient'])

    # ---- 正文块 ----
    for blk in AST.get('blocks', []) or []:
        btype = blk.get('type') or 'body'
        text = blk.get('text') or ''
        st = styles.get(btype, styles['body'])
        if not text:
            continue
        add_par(doc, text, st)

    # ---- 附件（本 AST 为空）----
    for att in AST.get('attachments', []) or []:
        add_par(doc, att, styles['body'])

    # ---- 落款与成文日期 ----
    if AST.get('signature'):
        add_par(doc, AST['signature'], styles['signature'])
    if AST.get('date'):
        add_par(doc, AST['date'], styles['date'])

    # ---- 页码 ----
    if CONFIG['page'].get('show_page_number'):
        add_page_number_footer(section)

    doc.save('output.docx')


if __name__ == '__main__':
    main()

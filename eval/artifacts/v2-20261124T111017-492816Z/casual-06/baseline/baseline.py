from docx import Document
from docx.shared import Mm
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

ROLE_CONFIG = {
    'title': {
        'alignment': 'center',
        'before': 0,
        'after': 0,
        'line_rule': 'exact',
        'line_value': 560,
        'first_line_chars': 0,
        'first_line_twips': 0,
        'font_cn': '方正小标宋简体',
        'font_en': 'Times New Roman',
        'size_pt': 22.0,
        'bold': False,
        'italic': False,
        'color_hex': '000000',
    },
    'heading_1': {
        'alignment': 'both',
        'before': 0,
        'after': 0,
        'line_rule': 'exact',
        'line_value': 560,
        'first_line_chars': 200,
        'first_line_twips': 640,
        'font_cn': '黑体',
        'font_en': 'Times New Roman',
        'size_pt': 16.0,
        'bold': False,
        'italic': False,
        'color_hex': '000000',
    },
    'body': {
        'alignment': 'both',
        'before': 0,
        'after': 0,
        'line_rule': 'auto',
        'line_value': 360,
        'first_line_chars': 200,
        'first_line_twips': 640,
        'font_cn': '仿宋_GB2312',
        'font_en': 'Times New Roman',
        'size_pt': 16.0,
        'bold': False,
        'italic': False,
        'color_hex': '000000',
    },
    'recipient': {
        'alignment': 'left',
        'before': 0,
        'after': 0,
        'line_rule': 'exact',
        'line_value': 560,
        'first_line_chars': 0,
        'first_line_twips': 0,
        'font_cn': '仿宋_GB2312',
        'font_en': 'Times New Roman',
        'size_pt': 16.0,
        'bold': False,
        'italic': False,
        'color_hex': '000000',
    },
    'signature': {
        'alignment': 'right',
        'before': 0,
        'after': 0,
        'line_rule': 'exact',
        'line_value': 560,
        'first_line_chars': 0,
        'first_line_twips': 0,
        'font_cn': '仿宋_GB2312',
        'font_en': 'Times New Roman',
        'size_pt': 16.0,
        'bold': False,
        'italic': False,
        'color_hex': '000000',
    },
    'date': {
        'alignment': 'right',
        'before': 0,
        'after': 0,
        'line_rule': 'exact',
        'line_value': 560,
        'first_line_chars': 0,
        'first_line_twips': 0,
        'font_cn': '仿宋_GB2312',
        'font_en': 'Times New Roman',
        'size_pt': 16.0,
        'bold': False,
        'italic': False,
        'color_hex': '000000',
    },
}


def add_paragraph(doc, text, role):
    config = ROLE_CONFIG[role]
    p = doc.add_paragraph()
    pPr = p._p.get_or_add_pPr()

    jc = pPr.find(qn('w:jc'))
    if jc is None:
        jc = OxmlElement('w:jc')
        pPr.append(jc)
    jc.set(qn('w:val'), config['alignment'])

    spacing = pPr.find(qn('w:spacing'))
    if spacing is None:
        spacing = OxmlElement('w:spacing')
        pPr.append(spacing)
    spacing.set(qn('w:before'), str(config['before']))
    spacing.set(qn('w:after'), str(config['after']))
    spacing.set(qn('w:line'), str(config['line_value']))
    spacing.set(qn('w:lineRule'), config['line_rule'])

    ind = pPr.find(qn('w:ind'))
    if ind is None:
        ind = OxmlElement('w:ind')
        pPr.append(ind)
    ind.set(qn('w:firstLineChars'), str(config['first_line_chars']))
    ind.set(qn('w:firstLine'), str(config['first_line_twips']))

    run = p.add_run(text)
    rPr = run._r.get_or_add_rPr()

    rFonts = rPr.find(qn('w:rFonts'))
    if rFonts is None:
        rFonts = OxmlElement('w:rFonts')
        rPr.append(rFonts)
    rFonts.set(qn('w:ascii'), config['font_en'])
    rFonts.set(qn('w:hAnsi'), config['font_en'])
    rFonts.set(qn('w:eastAsia'), config['font_cn'])
    rFonts.set(qn('w:cs'), config['font_en'])

    sz = rPr.find(qn('w:sz'))
    if sz is None:
        sz = OxmlElement('w:sz')
        rPr.append(sz)
    sz.set(qn('w:val'), str(int(config['size_pt'] * 2)))

    szCs = rPr.find(qn('w:szCs'))
    if szCs is None:
        szCs = OxmlElement('w:szCs')
        rPr.append(szCs)
    szCs.set(qn('w:val'), str(int(config['size_pt'] * 2)))

    b = rPr.find(qn('w:b'))
    if b is None:
        b = OxmlElement('w:b')
        rPr.append(b)
    b.set(qn('w:val'), '1' if config['bold'] else '0')

    i = rPr.find(qn('w:i'))
    if i is None:
        i = OxmlElement('w:i')
        rPr.append(i)
    i.set(qn('w:val'), '1' if config['italic'] else '0')

    color = rPr.find(qn('w:color'))
    if color is None:
        color = OxmlElement('w:color')
        rPr.append(color)
    color.set(qn('w:val'), config['color_hex'])

    return p


def main():
    doc = Document()

    section = doc.sections[0]
    section.page_width = Mm(210)
    section.page_height = Mm(297)
    section.top_margin = Mm(37)
    section.bottom_margin = Mm(35)
    section.left_margin = Mm(28)
    section.right_margin = Mm(26)

    ast = {
        "doc_type": "notice",
        "red_header_org": "综合办公室",
        "doc_number": "综办〔2026〕12号",
        "title": "关于开展档案归档检查的通知",
        "recipient": "各部门：",
        "blocks": [
            {"type": "heading_1", "text": "一、检查安排", "rows": None},
            {"type": "body", "text": "请各部门核对纸质与电子档案目录，整理归档清单并反馈检查结果。", "rows": None}
        ],
        "attachments": [],
        "signature": "综合办公室",
        "date": "2026年11月24日"
    }

    add_paragraph(doc, ast['title'], 'title')
    add_paragraph(doc, ast['recipient'], 'recipient')

    for block in ast['blocks']:
        if block['type'] == 'heading_1':
            add_paragraph(doc, block['text'], 'heading_1')
        elif block['type'] == 'body':
            add_paragraph(doc, block['text'], 'body')

    add_paragraph(doc, ast['signature'], 'signature')
    add_paragraph(doc, ast['date'], 'date')

    doc.save('output.docx')


if __name__ == '__main__':
    main()

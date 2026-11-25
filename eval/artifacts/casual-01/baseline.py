from docx import Document
from docx.shared import Pt, Mm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml.ns import qn
from docx.oxml import OxmlElement


def set_run_font(run, cn, en, size, bold=False, italic=False, color="000000"):
    run.font.name = en
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.italic = italic
    run.font.color.rgb = RGBColor.from_string(color)

    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.find(qn('w:rFonts'))
    if rFonts is None:
        rFonts = OxmlElement('w:rFonts')
        rPr.insert(0, rFonts)
    rFonts.set(qn('w:ascii'), en)
    rFonts.set(qn('w:hAnsi'), en)
    rFonts.set(qn('w:eastAsia'), cn)
    rFonts.set(qn('w:cs'), en)

    sz = rPr.find(qn('w:sz'))
    if sz is not None:
        szCs = rPr.find(qn('w:szCs'))
        if szCs is None:
            szCs = OxmlElement('w:szCs')
            sz.addnext(szCs)
        szCs.set(qn('w:val'), str(int(size * 2)))
    else:
        szCs = rPr.find(qn('w:szCs'))
        if szCs is None:
            szCs = OxmlElement('w:szCs')
            rPr.append(szCs)
        szCs.set(qn('w:val'), str(int(size * 2)))


def set_para_format(p, font_size, alignment, line_spacing=28.0,
                    first_line_chars=0.0, space_before=0.0, space_after=0.0):
    pf = p.paragraph_format
    pf.alignment = alignment
    pf.space_before = Pt(space_before)
    pf.space_after = Pt(space_after)
    pf.line_spacing_rule = WD_LINE_SPACING.EXACTLY
    pf.line_spacing = Pt(line_spacing)

    if first_line_chars > 0:
        pf.first_line_indent = Pt(font_size * first_line_chars)
    else:
        pf.first_line_indent = Pt(0)

    pPr = p._p.get_or_add_pPr()
    ind = pPr.find(qn('w:ind'))
    if ind is None:
        ind = OxmlElement('w:ind')
        pPr.append(ind)

    if first_line_chars > 0:
        ind.set(qn('w:firstLineChars'), str(int(first_line_chars * 100)))
    else:
        ind.set(qn('w:firstLineChars'), '0')

    if ind.get(qn('w:hanging')) is not None:
        del ind.attrib[qn('w:hanging')]
    if ind.get(qn('w:hangingChars')) is not None:
        del ind.attrib[qn('w:hangingChars')]


doc = Document()

style = doc.styles['Normal']
style.font.name = 'Times New Roman'
style.font.size = Pt(16)
rPr = style.element.get_or_add_rPr()
rFonts = rPr.find(qn('w:rFonts'))
if rFonts is None:
    rFonts = OxmlElement('w:rFonts')
    rPr.insert(0, rFonts)
rFonts.set(qn('w:ascii'), 'Times New Roman')
rFonts.set(qn('w:hAnsi'), 'Times New Roman')
rFonts.set(qn('w:eastAsia'), '仿宋_GB2312')
rFonts.set(qn('w:cs'), 'Times New Roman')

section = doc.sections[0]
section.page_width = Mm(210)
section.page_height = Mm(297)
section.top_margin = Mm(37)
section.bottom_margin = Mm(35)
section.left_margin = Mm(28)
section.right_margin = Mm(26)
section.header_distance = Mm(15)
section.footer_distance = Mm(28)

p = doc.add_paragraph()
run = p.add_run("关于开展业务培训的通知")
set_run_font(run, "黑体", "Times New Roman", 22)
set_para_format(p, 22, WD_ALIGN_PARAGRAPH.CENTER, 28, 0)

p = doc.add_paragraph()
run = p.add_run("各部门：")
set_run_font(run, "仿宋_GB2312", "Times New Roman", 16)
set_para_format(p, 16, WD_ALIGN_PARAGRAPH.LEFT, 28, 0)

blocks = [
    {"type": "heading_1", "text": "一、培训安排"},
    {"type": "body", "text": "请各部门做好组织协调，按时参加业务培训。"}
]

for block in blocks:
    text = block.get("text", "")
    typ = block.get("type")
    p = doc.add_paragraph()
    run = p.add_run(text)
    if typ == "heading_1":
        set_run_font(run, "黑体", "Times New Roman", 16)
        set_para_format(p, 16, WD_ALIGN_PARAGRAPH.JUSTIFY, 28, 2)
    else:
        set_run_font(run, "仿宋_GB2312", "Times New Roman", 16)
        set_para_format(p, 16, WD_ALIGN_PARAGRAPH.JUSTIFY, 28, 2)

p = doc.add_paragraph()
run = p.add_run("综合办公室")
set_run_font(run, "仿宋_GB2312", "Times New Roman", 16)
set_para_format(p, 16, WD_ALIGN_PARAGRAPH.RIGHT, 28, 0)

p = doc.add_paragraph()
run = p.add_run("2026年11月24日")
set_run_font(run, "仿宋_GB2312", "Times New Roman", 16)
set_para_format(p, 16, WD_ALIGN_PARAGRAPH.RIGHT, 28, 0)

footer = section.footer
footer.is_linked_to_previous = False
fp = footer.paragraphs[0]
fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
fp.paragraph_format.space_before = Pt(0)
fp.paragraph_format.space_after = Pt(0)
fp.paragraph_format.line_spacing_rule = WD_LINE_SPACING.SINGLE

for child in list(fp._p):
    if child.tag != qn('w:pPr'):
        fp._p.remove(child)

run = fp.add_run("— ")
set_run_font(run, "宋体", "Times New Roman", 14)

fld = OxmlElement('w:fldSimple')
fld.set(qn('w:instr'), ' PAGE ')
fld.set(qn('w:dirty'), 'true')

r = OxmlElement('w:r')
rPr = OxmlElement('w:rPr')
rFonts = OxmlElement('w:rFonts')
rFonts.set(qn('w:ascii'), 'Times New Roman')
rFonts.set(qn('w:hAnsi'), 'Times New Roman')
rFonts.set(qn('w:eastAsia'), '宋体')
rFonts.set(qn('w:cs'), 'Times New Roman')
rPr.append(rFonts)

sz = OxmlElement('w:sz')
sz.set(qn('w:val'), '28')
rPr.append(sz)

szCs = OxmlElement('w:szCs')
szCs.set(qn('w:val'), '28')
rPr.append(szCs)

r.append(rPr)
t = OxmlElement('w:t')
t.text = '1'
r.append(t)
fld.append(r)
fp._p.append(fld)

run = fp.add_run(" —")
set_run_font(run, "宋体", "Times New Roman", 14)

doc.save("output.docx")

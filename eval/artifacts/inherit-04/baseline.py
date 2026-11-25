from docx import Document
from docx.shared import Mm, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml.ns import qn
from docx.oxml import OxmlElement


def get_or_add_rfonts(rpr):
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = OxmlElement("w:rFonts")
        rpr.insert(0, rfonts)
    return rfonts


def set_run_fonts(run, font_cn, font_en, size_pt, bold, italic, color_hex):
    run.font.name = font_en
    run.font.size = Pt(size_pt)
    run.font.bold = bold
    run.font.italic = italic
    run.font.color.rgb = RGBColor.from_string(color_hex)

    rpr = run._element.get_or_add_rPr()
    rfonts = get_or_add_rfonts(rpr)
    rfonts.set(qn("w:ascii"), font_en)
    rfonts.set(qn("w:hAnsi"), font_en)
    rfonts.set(qn("w:eastAsia"), font_cn)
    rfonts.set(qn("w:cs"), font_en)

    sz = rpr.find(qn("w:sz"))
    if sz is None:
        sz = OxmlElement("w:sz")
        rpr.append(sz)
    sz.set(qn("w:val"), str(int(round(size_pt * 2))))

    szcs = rpr.find(qn("w:szCs"))
    if szcs is None:
        szcs = OxmlElement("w:szCs")
        rpr.append(szcs)
    szcs.set(qn("w:val"), str(int(round(size_pt * 2))))


def set_indent_chars(paragraph, first_line_chars=None, left_chars=None, right_chars=None):
    ppr = paragraph._p.get_or_add_pPr()
    ind = ppr.find(qn("w:ind"))
    if ind is None:
        ind = OxmlElement("w:ind")
        ppr.append(ind)

    for attr in (
        "w:left",
        "w:leftChars",
        "w:right",
        "w:rightChars",
        "w:firstLine",
        "w:firstLineChars",
        "w:hanging",
        "w:hangingChars",
    ):
        ind.attrib.pop(qn(attr), None)

    if left_chars is not None:
        ind.set(qn("w:leftChars"), str(int(round(left_chars * 100))))
    if right_chars is not None:
        ind.set(qn("w:rightChars"), str(int(round(right_chars * 100))))
    if first_line_chars is not None:
        ind.set(qn("w:firstLineChars"), str(int(round(first_line_chars * 100))))


def format_paragraph(
    paragraph,
    alignment,
    line_spacing_pt,
    first_line_chars=0.0,
    space_before_pt=0.0,
    space_after_pt=0.0,
    left_chars=None,
    right_chars=None,
):
    pf = paragraph.paragraph_format
    pf.alignment = alignment
    pf.space_before = Pt(space_before_pt)
    pf.space_after = Pt(space_after_pt)
    pf.line_spacing = Pt(line_spacing_pt)
    pf.line_spacing_rule = WD_LINE_SPACING.EXACTLY
    set_indent_chars(
        paragraph,
        first_line_chars=first_line_chars,
        left_chars=left_chars,
        right_chars=right_chars,
    )


def add_formatted_paragraph(
    doc,
    text,
    font_cn,
    font_en,
    size_pt,
    bold,
    italic,
    color_hex,
    alignment,
    line_spacing_pt,
    first_line_chars,
    space_before_pt=0.0,
    space_after_pt=0.0,
):
    p = doc.add_paragraph()
    run = p.add_run(text)
    set_run_fonts(run, font_cn, font_en, size_pt, bold, italic, color_hex)
    format_paragraph(
        p,
        alignment,
        line_spacing_pt,
        first_line_chars=first_line_chars,
        space_before_pt=space_before_pt,
        space_after_pt=space_after_pt,
    )
    return p


def prepare_footer_paragraph(footer):
    if footer.paragraphs:
        p = footer.paragraphs[0]
        for child in list(p._p):
            if child.tag != qn("w:pPr"):
                p._p.remove(child)
    else:
        p = footer.add_paragraph()
    return p


def add_page_number_to_footer(footer, alignment, left_chars=None, right_chars=None):
    p = prepare_footer_paragraph(footer)

    run = p.add_run("— ")
    set_run_fonts(run, "宋体", "Times New Roman", 14.0, False, False, "000000")

    run = p.add_run()
    set_run_fonts(run, "宋体", "Times New Roman", 14.0, False, False, "000000")
    fld_begin = OxmlElement("w:fldChar")
    fld_begin.set(qn("w:fldCharType"), "begin")
    run._r.append(fld_begin)

    run = p.add_run()
    set_run_fonts(run, "宋体", "Times New Roman", 14.0, False, False, "000000")
    instr_text = OxmlElement("w:instrText")
    instr_text.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
    instr_text.text = " PAGE \\* MERGEFORMAT "
    run._r.append(instr_text)

    run = p.add_run()
    set_run_fonts(run, "宋体", "Times New Roman", 14.0, False, False, "000000")
    fld_sep = OxmlElement("w:fldChar")
    fld_sep.set(qn("w:fldCharType"), "separate")
    run._r.append(fld_sep)

    run = p.add_run("1")
    set_run_fonts(run, "宋体", "Times New Roman", 14.0, False, False, "000000")

    run = p.add_run()
    set_run_fonts(run, "宋体", "Times New Roman", 14.0, False, False, "000000")
    fld_end = OxmlElement("w:fldChar")
    fld_end.set(qn("w:fldCharType"), "end")
    run._r.append(fld_end)

    run = p.add_run(" —")
    set_run_fonts(run, "宋体", "Times New Roman", 14.0, False, False, "000000")

    format_paragraph(
        p,
        alignment,
        14.0,
        first_line_chars=0.0,
        space_before_pt=0.0,
        space_after_pt=0.0,
        left_chars=left_chars,
        right_chars=right_chars,
    )


def set_normal_style_fonts(doc):
    style = doc.styles["Normal"]
    style.font.name = "Times New Roman"
    style.font.size = Pt(14)

    rpr = style.element.get_or_add_rPr()
    rfonts = get_or_add_rfonts(rpr)
    rfonts.set(qn("w:ascii"), "Times New Roman")
    rfonts.set(qn("w:hAnsi"), "Times New Roman")
    rfonts.set(qn("w:eastAsia"), "仿宋_GB2312")
    rfonts.set(qn("w:cs"), "Times New Roman")

    sz = rpr.find(qn("w:sz"))
    if sz is None:
        sz = OxmlElement("w:sz")
        rpr.append(sz)
    sz.set(qn("w:val"), "28")

    szcs = rpr.find(qn("w:szCs"))
    if szcs is None:
        szcs = OxmlElement("w:szCs")
        rpr.append(szcs)
    szcs.set(qn("w:val"), "28")


def configure_settings(doc):
    settings_element = doc.settings.element

    if settings_element.find(qn("w:evenAndOddHeaders")) is None:
        even_odd = OxmlElement("w:evenAndOddHeaders")
        settings_element.append(even_odd)

    if settings_element.find(qn("w:updateFields")) is None:
        update_fields = OxmlElement("w:updateFields")
        update_fields.set(qn("w:val"), "true")
        settings_element.append(update_fields)


def main():
    doc = Document()

    set_normal_style_fonts(doc)

    section = doc.sections[0]
    section.page_width = Mm(210)
    section.page_height = Mm(297)
    section.top_margin = Mm(30)
    section.bottom_margin = Mm(35)
    section.left_margin = Mm(28)
    section.right_margin = Mm(26)
    section.header_distance = Mm(15)
    section.footer_distance = Mm(7)

    configure_settings(doc)

    add_formatted_paragraph(
        doc,
        "关于开展业务培训的通知",
        "黑体",
        "Times New Roman",
        24.0,
        False,
        False,
        "000000",
        WD_ALIGN_PARAGRAPH.CENTER,
        28.0,
        0.0,
        0.0,
        0.0,
    )

    add_formatted_paragraph(
        doc,
        "各部门：",
        "仿宋_GB2312",
        "Times New Roman",
        16.0,
        False,
        False,
        "000000",
        WD_ALIGN_PARAGRAPH.LEFT,
        28.0,
        0.0,
        0.0,
        0.0,
    )

    add_formatted_paragraph(
        doc,
        "一、培训安排",
        "黑体",
        "Times New Roman",
        16.0,
        False,
        False,
        "000000",
        WD_ALIGN_PARAGRAPH.JUSTIFY,
        28.0,
        2.0,
        0.0,
        0.0,
    )

    add_formatted_paragraph(
        doc,
        "请各部门做好组织协调，按时参加业务培训。",
        "仿宋_GB2312",
        "Times New Roman",
        14.0,
        False,
        False,
        "000000",
        WD_ALIGN_PARAGRAPH.JUSTIFY,
        24.0,
        2.0,
        0.0,
        0.0,
    )

    add_formatted_paragraph(
        doc,
        "综合办公室",
        "仿宋_GB2312",
        "Times New Roman",
        16.0,
        False,
        False,
        "000000",
        WD_ALIGN_PARAGRAPH.RIGHT,
        28.0,
        0.0,
        0.0,
        0.0,
    )

    add_formatted_paragraph(
        doc,
        "2026年11月24日",
        "仿宋_GB2312",
        "Times New Roman",
        16.0,
        False,
        False,
        "000000",
        WD_ALIGN_PARAGRAPH.RIGHT,
        28.0,
        0.0,
        0.0,
        0.0,
    )

    odd_footer = section.footer
    odd_footer.is_linked_to_previous = False
    add_page_number_to_footer(
        odd_footer,
        WD_ALIGN_PARAGRAPH.RIGHT,
        left_chars=None,
        right_chars=1.0,
    )

    even_footer = section.even_page_footer
    even_footer.is_linked_to_previous = False
    add_page_number_to_footer(
        even_footer,
        WD_ALIGN_PARAGRAPH.LEFT,
        left_chars=1.0,
        right_chars=None,
    )

    doc.save("output.docx")


if __name__ == "__main__":
    main()
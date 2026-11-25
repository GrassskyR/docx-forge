from docx import Document
from docx.shared import Pt, Mm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn


def set_run_font(run, font_cn, font_en, size_pt, bold=False, italic=False, color_hex="000000"):
    run.font.name = font_en
    run.font.size = Pt(size_pt)
    run.font.bold = bold
    run.font.italic = italic
    run.font.color.rgb = RGBColor.from_string(color_hex)

    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.get_or_add_rFonts()
    rFonts.set(qn("w:ascii"), font_en)
    rFonts.set(qn("w:hAnsi"), font_en)
    rFonts.set(qn("w:eastAsia"), font_cn)
    rFonts.set(qn("w:cs"), font_en)


def set_style_font(style, font_cn, font_en, size_pt, bold=False, italic=False, color_hex="000000"):
    style.font.name = font_en
    style.font.size = Pt(size_pt)
    style.font.bold = bold
    style.font.italic = italic
    style.font.color.rgb = RGBColor.from_string(color_hex)

    rPr = style.element.get_or_add_rPr()
    rFonts = rPr.get_or_add_rFonts()
    rFonts.set(qn("w:ascii"), font_en)
    rFonts.set(qn("w:hAnsi"), font_en)
    rFonts.set(qn("w:eastAsia"), font_cn)
    rFonts.set(qn("w:cs"), font_en)


def set_para_format(p, alignment, line_pt, indent_chars, font_size_pt, space_before=0.0, space_after=0.0):
    pf = p.paragraph_format
    pf.alignment = alignment
    pf.space_before = Pt(space_before)
    pf.space_after = Pt(space_after)
    pf.line_spacing_rule = WD_LINE_SPACING.EXACTLY
    pf.line_spacing = Pt(line_pt)

    pPr = p._p.get_or_add_pPr()
    ind = pPr.get_or_add_ind()
    ind.set(qn("w:firstLineChars"), str(int(round(indent_chars * 100))))
    ind.set(qn("w:firstLine"), str(int(round(indent_chars * font_size_pt * 20))))


def add_text_paragraph(doc, text, font_cn, font_en, size_pt, alignment, line_pt, indent_chars,
                       bold=False, italic=False, color_hex="000000",
                       space_before=0.0, space_after=0.0):
    p = doc.add_paragraph()
    set_para_format(p, alignment, line_pt, indent_chars, size_pt, space_before, space_after)
    run = p.add_run(text)
    set_run_font(run, font_cn, font_en, size_pt, bold, italic, color_hex)
    return p


def clear_paragraph(p):
    for child in list(p._p):
        if child.tag in (qn("w:r"), qn("w:hyperlink"), qn("w:fldSimple")):
            p._p.remove(child)


def add_page_number_field(paragraph, font_cn="宋体", font_en="Times New Roman", size_pt=14.0):
    run = paragraph.add_run("— ")
    set_run_font(run, font_cn, font_en, size_pt)

    run = paragraph.add_run()
    fld = OxmlElement("w:fldChar")
    fld.set(qn("w:fldCharType"), "begin")
    run._r.append(fld)
    set_run_font(run, font_cn, font_en, size_pt)

    run = paragraph.add_run()
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = " PAGE "
    run._r.append(instr)
    set_run_font(run, font_cn, font_en, size_pt)

    run = paragraph.add_run()
    fld = OxmlElement("w:fldChar")
    fld.set(qn("w:fldCharType"), "separate")
    run._r.append(fld)
    set_run_font(run, font_cn, font_en, size_pt)

    run = paragraph.add_run("1")
    set_run_font(run, font_cn, font_en, size_pt)

    run = paragraph.add_run()
    fld = OxmlElement("w:fldChar")
    fld.set(qn("w:fldCharType"), "end")
    run._r.append(fld)
    set_run_font(run, font_cn, font_en, size_pt)

    run = paragraph.add_run(" —")
    set_run_font(run, font_cn, font_en, size_pt)


def enable_update_fields(doc):
    settings = doc.settings.element
    update = settings.find(qn("w:updateFields"))
    if update is None:
        update = OxmlElement("w:updateFields")
        settings.append(update)
    update.set(qn("w:val"), "true")


def main():
    doc = Document()

    normal = doc.styles["Normal"]
    set_style_font(normal, "仿宋_GB2312", "Times New Roman", 15.0, False, False, "000000")
    normal.paragraph_format.space_before = Pt(0)
    normal.paragraph_format.space_after = Pt(0)
    normal.paragraph_format.line_spacing_rule = WD_LINE_SPACING.EXACTLY
    normal.paragraph_format.line_spacing = Pt(28)

    section = doc.sections[0]
    section.page_width = Mm(210)
    section.page_height = Mm(297)
    section.top_margin = Mm(37)
    section.bottom_margin = Mm(35)
    section.left_margin = Mm(28)
    section.right_margin = Mm(26)
    section.footer_distance = Mm(28)

    footer = section.footer
    footer.is_linked_to_previous = False
    footer_p = footer.paragraphs[0]
    clear_paragraph(footer_p)
    set_para_format(footer_p, WD_ALIGN_PARAGRAPH.CENTER, 14.0, 0.0, 14.0)
    add_page_number_field(footer_p, "宋体", "Times New Roman", 14.0)
    enable_update_fields(doc)

    add_text_paragraph(
        doc,
        "关于开展业务培训的通知",
        "方正小标宋简体",
        "Times New Roman",
        22.0,
        WD_ALIGN_PARAGRAPH.CENTER,
        28.0,
        0.0,
    )

    add_text_paragraph(
        doc,
        "各部门：",
        "仿宋_GB2312",
        "Times New Roman",
        16.0,
        WD_ALIGN_PARAGRAPH.LEFT,
        28.0,
        0.0,
    )

    add_text_paragraph(
        doc,
        "一、培训安排",
        "黑体",
        "Times New Roman",
        16.0,
        WD_ALIGN_PARAGRAPH.JUSTIFY,
        28.0,
        2.0,
    )

    add_text_paragraph(
        doc,
        "请各部门做好组织协调，按时参加业务培训。",
        "仿宋_GB2312",
        "Times New Roman",
        15.0,
        WD_ALIGN_PARAGRAPH.JUSTIFY,
        28.0,
        2.0,
    )

    add_text_paragraph(
        doc,
        "综合办公室",
        "仿宋_GB2312",
        "Times New Roman",
        16.0,
        WD_ALIGN_PARAGRAPH.RIGHT,
        28.0,
        0.0,
    )

    add_text_paragraph(
        doc,
        "2026年11月24日",
        "仿宋_GB2312",
        "Times New Roman",
        16.0,
        WD_ALIGN_PARAGRAPH.RIGHT,
        28.0,
        0.0,
    )

    doc.save("output.docx")


if __name__ == "__main__":
    main()
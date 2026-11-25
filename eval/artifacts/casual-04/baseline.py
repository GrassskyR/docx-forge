from docx import Document
from docx.shared import Pt, Mm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn


def set_run_font(run, cn_font, en_font, size_pt, bold=False, italic=False, color_hex="000000"):
    run.font.name = en_font
    run.font.size = Pt(size_pt)
    run.font.bold = bold
    run.font.italic = italic
    run.font.color.rgb = RGBColor.from_string(color_hex)

    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.find(qn("w:rFonts"))
    if rFonts is None:
        rFonts = OxmlElement("w:rFonts")
        rPr.insert(0, rFonts)

    rFonts.set(qn("w:ascii"), en_font)
    rFonts.set(qn("w:hAnsi"), en_font)
    rFonts.set(qn("w:cs"), en_font)
    rFonts.set(qn("w:eastAsia"), cn_font)

    sz_value = str(int(round(size_pt * 2)))
    sz = rPr.find(qn("w:sz"))
    if sz is None:
        sz = OxmlElement("w:sz")
        rPr.append(sz)
    sz.set(qn("w:val"), sz_value)

    szCs = rPr.find(qn("w:szCs"))
    if szCs is None:
        szCs = OxmlElement("w:szCs")
        rPr.append(szCs)
    szCs.set(qn("w:val"), sz_value)


def set_paragraph_format(p, alignment, line_pt, first_line_chars, font_size_pt, before_pt=0, after_pt=0):
    p.alignment = alignment

    pf = p.paragraph_format
    pf.line_spacing_rule = WD_LINE_SPACING.EXACTLY
    pf.line_spacing = Pt(line_pt)
    pf.space_before = Pt(before_pt)
    pf.space_after = Pt(after_pt)

    pf.first_line_indent = Pt(first_line_chars * font_size_pt)

    pPr = p._p.get_or_add_pPr()
    ind = pPr.find(qn("w:ind"))
    if ind is None:
        ind = OxmlElement("w:ind")
        jc = pPr.find(qn("w:jc"))
        rPr = pPr.find(qn("w:rPr"))
        if jc is not None:
            jc.addprevious(ind)
        elif rPr is not None:
            rPr.addprevious(ind)
        else:
            pPr.append(ind)

    for attr in ("w:hanging", "w:hangingChars"):
        if ind.get(qn(attr)) is not None:
            del ind.attrib[qn(attr)]

    ind.set(qn("w:firstLineChars"), str(int(round(first_line_chars * 100))))
    ind.set(qn("w:firstLine"), str(int(round(first_line_chars * font_size_pt * 20))))
    ind.set(qn("w:left"), "0")
    ind.set(qn("w:leftChars"), "0")
    ind.set(qn("w:right"), "0")
    ind.set(qn("w:rightChars"), "0")


def add_text_paragraph(
    doc,
    text,
    alignment,
    cn_font,
    en_font,
    size_pt,
    line_pt,
    first_line_chars,
    bold=False,
    italic=False,
    color_hex="000000",
    before_pt=0,
    after_pt=0,
):
    p = doc.add_paragraph()
    set_paragraph_format(
        p,
        alignment,
        line_pt,
        first_line_chars,
        size_pt,
        before_pt=before_pt,
        after_pt=after_pt,
    )
    run = p.add_run(text)
    set_run_font(
        run,
        cn_font=cn_font,
        en_font=en_font,
        size_pt=size_pt,
        bold=bold,
        italic=italic,
        color_hex=color_hex,
    )
    return p


def add_empty_paragraph(doc, cn_font, en_font, size_pt, line_pt):
    p = doc.add_paragraph()
    set_paragraph_format(
        p,
        WD_ALIGN_PARAGRAPH.LEFT,
        line_pt,
        0,
        size_pt,
    )
    run = p.add_run("")
    set_run_font(run, cn_font, en_font, size_pt)
    return p


def add_page_number_field(paragraph):
    fld = OxmlElement("w:fldSimple")
    fld.set(qn("w:instr"), " PAGE ")

    r = OxmlElement("w:r")
    rPr = OxmlElement("w:rPr")

    rFonts = OxmlElement("w:rFonts")
    rFonts.set(qn("w:ascii"), "Times New Roman")
    rFonts.set(qn("w:hAnsi"), "Times New Roman")
    rFonts.set(qn("w:cs"), "Times New Roman")
    rFonts.set(qn("w:eastAsia"), "宋体")
    rPr.append(rFonts)

    sz = OxmlElement("w:sz")
    sz.set(qn("w:val"), "28")
    rPr.append(sz)

    szCs = OxmlElement("w:szCs")
    szCs.set(qn("w:val"), "28")
    rPr.append(szCs)

    color = OxmlElement("w:color")
    color.set(qn("w:val"), "000000")
    rPr.append(color)

    r.append(rPr)

    t = OxmlElement("w:t")
    t.text = "1"
    r.append(t)

    fld.append(r)
    paragraph._p.append(fld)


def configure_document_defaults(doc):
    normal = doc.styles["Normal"]
    normal.font.name = "Times New Roman"
    normal.font.size = Pt(16)

    rPr = normal.element.get_or_add_rPr()
    rFonts = rPr.find(qn("w:rFonts"))
    if rFonts is None:
        rFonts = OxmlElement("w:rFonts")
        rPr.insert(0, rFonts)

    rFonts.set(qn("w:ascii"), "Times New Roman")
    rFonts.set(qn("w:hAnsi"), "Times New Roman")
    rFonts.set(qn("w:cs"), "Times New Roman")
    rFonts.set(qn("w:eastAsia"), "仿宋_GB2312")


def main():
    doc = Document()
    configure_document_defaults(doc)

    body = doc.element.body
    for paragraph in list(doc.paragraphs):
        body.remove(paragraph._element)

    section = doc.sections[0]
    section.page_width = Mm(210)
    section.page_height = Mm(297)
    section.top_margin = Mm(30)
    section.bottom_margin = Mm(30)
    section.left_margin = Mm(20)
    section.right_margin = Mm(20)

    title_cn = "方正小标宋简体"
    title_en = "Times New Roman"
    heading_cn = "黑体"
    body_cn = "仿宋_GB2312"
    en_font = "Times New Roman"

    title = "关于开展业务培训的通知"
    recipient = "各部门："
    blocks = [
        {"type": "heading_1", "text": "一、培训安排"},
        {"type": "body", "text": "请各部门做好组织协调，按时参加业务培训。"},
    ]
    signature = "综合办公室"
    date = "2026年11月24日"

    add_text_paragraph(
        doc,
        title,
        WD_ALIGN_PARAGRAPH.CENTER,
        title_cn,
        title_en,
        22.0,
        28.0,
        0.0,
    )

    add_empty_paragraph(doc, body_cn, en_font, 16.0, 28.0)

    add_text_paragraph(
        doc,
        recipient,
        WD_ALIGN_PARAGRAPH.LEFT,
        body_cn,
        en_font,
        16.0,
        28.0,
        0.0,
    )

    for block in blocks:
        block_type = block.get("type")
        text = block.get("text") or ""

        if block_type == "heading_1":
            add_text_paragraph(
                doc,
                text,
                WD_ALIGN_PARAGRAPH.JUSTIFY,
                heading_cn,
                en_font,
                16.0,
                28.0,
                2.0,
            )
        elif block_type == "heading_2":
            add_text_paragraph(
                doc,
                text,
                WD_ALIGN_PARAGRAPH.JUSTIFY,
                "楷体_GB2312",
                en_font,
                16.0,
                28.0,
                2.0,
            )
        elif block_type == "heading_3":
            add_text_paragraph(
                doc,
                text,
                WD_ALIGN_PARAGRAPH.JUSTIFY,
                body_cn,
                en_font,
                16.0,
                28.0,
                2.0,
            )
        else:
            add_text_paragraph(
                doc,
                text,
                WD_ALIGN_PARAGRAPH.JUSTIFY,
                body_cn,
                en_font,
                16.0,
                28.0,
                2.0,
            )

    add_empty_paragraph(doc, body_cn, en_font, 16.0, 28.0)

    add_text_paragraph(
        doc,
        signature,
        WD_ALIGN_PARAGRAPH.RIGHT,
        body_cn,
        en_font,
        16.0,
        28.0,
        0.0,
    )

    add_text_paragraph(
        doc,
        date,
        WD_ALIGN_PARAGRAPH.RIGHT,
        body_cn,
        en_font,
        16.0,
        28.0,
        0.0,
    )

    footer = section.footer
    footer_p = footer.paragraphs[0] if footer.paragraphs else footer.add_paragraph()
    set_paragraph_format(
        footer_p,
        WD_ALIGN_PARAGRAPH.CENTER,
        28.0,
        0.0,
        14.0,
    )
    for r in list(footer_p.runs):
        r._element.getparent().remove(r._element)
    add_page_number_field(footer_p)

    settings = doc.settings.element
    update_fields = OxmlElement("w:updateFields")
    update_fields.set(qn("w:val"), "true")
    settings.append(update_fields)

    doc.save("output.docx")


if __name__ == "__main__":
    main()
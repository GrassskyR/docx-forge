from docx import Document
from docx.shared import Pt, Mm, RGBColor
from docx.enum.style import WD_STYLE_TYPE
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml.ns import qn
from docx.oxml import OxmlElement


def get_or_add(parent, tag):
    child = parent.find(qn(tag))
    if child is None:
        child = OxmlElement(tag)
        parent.append(child)
    return child


ALIGN_MAP = {
    "left": WD_ALIGN_PARAGRAPH.LEFT,
    "center": WD_ALIGN_PARAGRAPH.CENTER,
    "right": WD_ALIGN_PARAGRAPH.RIGHT,
    "justify": WD_ALIGN_PARAGRAPH.JUSTIFY,
    "both": WD_ALIGN_PARAGRAPH.JUSTIFY,
}


def set_style_paragraph(style, alignment, line_spacing_value, first_line_indent_chars,
                        space_before_pt, space_after_pt, font_size_pt):
    pf = style.paragraph_format
    pf.alignment = alignment
    pf.line_spacing = Pt(line_spacing_value)
    pf.line_spacing_rule = WD_LINE_SPACING.EXACTLY
    pf.space_before = Pt(space_before_pt)
    pf.space_after = Pt(space_after_pt)
    pf.first_line_indent = Pt(first_line_indent_chars * font_size_pt)

    pPr = get_or_add(style.element, "w:pPr")
    ind = get_or_add(pPr, "w:ind")
    ind.set(qn("w:firstLineChars"), str(int(first_line_indent_chars * 100)))
    ind.set(qn("w:firstLine"), str(int(first_line_indent_chars * font_size_pt * 20)))


def set_style_font(style, font_cn, font_en, size_pt, bold, italic, color_hex):
    style.font.name = font_en
    style.font.size = Pt(size_pt)
    style.font.bold = bold
    style.font.italic = italic
    style.font.color.rgb = RGBColor.from_string(color_hex)

    rPr = get_or_add(style.element, "w:rPr")
    rFonts = get_or_add(rPr, "w:rFonts")
    rFonts.set(qn("w:ascii"), font_en)
    rFonts.set(qn("w:hAnsi"), font_en)
    rFonts.set(qn("w:eastAsia"), font_cn)
    rFonts.set(qn("w:cs"), font_en)

    sz = get_or_add(rPr, "w:sz")
    sz.set(qn("w:val"), str(int(size_pt * 2)))
    szCs = get_or_add(rPr, "w:szCs")
    szCs.set(qn("w:val"), str(int(size_pt * 2)))


def add_style(doc, style_id, font_cn, font_en, size_pt, bold, italic, color_hex,
              alignment, line_spacing_value, first_line_indent_chars,
              space_before_pt, space_after_pt):
    styles = doc.styles
    try:
        style = styles[style_id]
    except KeyError:
        style = styles.add_style(style_id, WD_STYLE_TYPE.PARAGRAPH)

    style.element.set(qn("w:styleId"), style_id)
    style.name = style_id

    set_style_paragraph(
        style, alignment, line_spacing_value, first_line_indent_chars,
        space_before_pt, space_after_pt, size_pt
    )
    set_style_font(style, font_cn, font_en, size_pt, bold, italic, color_hex)
    return style


def set_run_font(run, font_cn, font_en, size_pt, bold=False, italic=False, color_hex="000000"):
    run.font.name = font_en
    run.font.size = Pt(size_pt)
    run.font.bold = bold
    run.font.italic = italic
    run.font.color.rgb = RGBColor.from_string(color_hex)

    rPr = get_or_add(run._element, "w:rPr")
    rFonts = get_or_add(rPr, "w:rFonts")
    rFonts.set(qn("w:ascii"), font_en)
    rFonts.set(qn("w:hAnsi"), font_en)
    rFonts.set(qn("w:eastAsia"), font_cn)
    rFonts.set(qn("w:cs"), font_en)

    sz = get_or_add(rPr, "w:sz")
    sz.set(qn("w:val"), str(int(size_pt * 2)))
    szCs = get_or_add(rPr, "w:szCs")
    szCs.set(qn("w:val"), str(int(size_pt * 2)))


def set_paragraph_bottom_border(paragraph, color_hex, sz=12, space=1):
    pPr = get_or_add(paragraph._p, "w:pPr")
    pBdr = get_or_add(pPr, "w:pBdr")
    bottom = pBdr.find(qn("w:bottom"))
    if bottom is None:
        bottom = OxmlElement("w:bottom")
        pBdr.append(bottom)
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), str(sz))
    bottom.set(qn("w:space"), str(space))
    bottom.set(qn("w:color"), color_hex)


def add_page_field(paragraph):
    run = paragraph.add_run()

    fld_begin = OxmlElement("w:fldChar")
    fld_begin.set(qn("w:fldCharType"), "begin")

    instr_text = OxmlElement("w:instrText")
    instr_text.set(qn("xml:space"), "preserve")
    instr_text.text = " PAGE "

    fld_sep = OxmlElement("w:fldChar")
    fld_sep.set(qn("w:fldCharType"), "separate")

    text = OxmlElement("w:t")
    text.text = "1"

    fld_end = OxmlElement("w:fldChar")
    fld_end.set(qn("w:fldCharType"), "end")

    run._r.append(fld_begin)
    run._r.append(instr_text)
    run._r.append(fld_sep)
    run._r.append(text)
    run._r.append(fld_end)
    return run


def main():
    doc = Document()

    section = doc.sections[0]
    section.page_width = Mm(210)
    section.page_height = Mm(297)
    section.top_margin = Mm(34.0)
    section.bottom_margin = Mm(35.0)
    section.left_margin = Mm(28.0)
    section.right_margin = Mm(26.0)

    # 标题
    add_style(
        doc, "gw_title", "黑体", "Times New Roman", 22.0, False, False, "000000",
        ALIGN_MAP["center"], 30.0, 0.0, 0.0, 0.0
    )
    # 一级标题
    add_style(
        doc, "gw_heading_1", "黑体", "Times New Roman", 16.0, False, False, "000000",
        ALIGN_MAP["justify"], 28.0, 2.0, 0.0, 0.0
    )
    # 正文
    add_style(
        doc, "gw_body", "微软雅黑", "Times New Roman", 18.0, False, False, "000000",
        ALIGN_MAP["justify"], 28.0, 2.0, 0.0, 0.0
    )
    # 主送机关
    add_style(
        doc, "gw_recipient", "仿宋_GB2312", "Times New Roman", 16.0, False, False, "000000",
        ALIGN_MAP["left"], 28.0, 0.0, 0.0, 0.0
    )
    # 署名
    add_style(
        doc, "gw_signature", "仿宋_GB2312", "Times New Roman", 16.0, False, False, "000000",
        ALIGN_MAP["right"], 28.0, 0.0, 0.0, 0.0
    )
    # 日期
    add_style(
        doc, "gw_date", "仿宋_GB2312", "Times New Roman", 16.0, False, False, "000000",
        ALIGN_MAP["right"], 28.0, 0.0, 0.0, 0.0
    )
    # 发文字号
    add_style(
        doc, "gw_doc_number", "仿宋_GB2312", "Times New Roman", 16.0, False, False, "000000",
        ALIGN_MAP["center"], 28.0, 0.0, 0.0, 0.0
    )
    # 红头机关样式（配置未启用时不会实际使用）
    add_style(
        doc, "gw_red_header", "方正小标宋简体", "Times New Roman", 36.0, False, False, "FF0000",
        ALIGN_MAP["center"], 44.0, 0.0, 0.0, 0.0
    )

    red_header_enabled = False
    red_header_has_red_line = True
    red_header_org_from_ast = "综合办公室"
    doc_number = "综办〔2026〕12号"

    if red_header_enabled:
        if red_header_org_from_ast:
            p = doc.add_paragraph(style="gw_red_header")
            p.add_run(red_header_org_from_ast)

        if doc_number:
            p = doc.add_paragraph(style="gw_doc_number")
            p.add_run(doc_number)

        if red_header_has_red_line:
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(0)
            p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.line_spacing = Pt(1)
            p.paragraph_format.line_spacing_rule = WD_LINE_SPACING.EXACTLY
            set_paragraph_bottom_border(p, "FF0000", sz=12, space=1)
    else:
        if doc_number:
            p = doc.add_paragraph(style="gw_doc_number")
            p.add_run(doc_number)

    # 标题
    p = doc.add_paragraph(style="gw_title")
    p.add_run("关于开展档案归档检查的通知")

    # 主送机关
    p = doc.add_paragraph(style="gw_recipient")
    p.add_run("各部门：")

    # 正文块
    blocks = [
        {"type": "heading_1", "text": "一、检查安排", "rows": None},
        {"type": "body", "text": "请各部门核对纸质与电子档案目录，整理归档清单并反馈检查结果。", "rows": None},
    ]
    for block in blocks:
        if block["type"] == "heading_1":
            p = doc.add_paragraph(style="gw_heading_1")
        else:
            p = doc.add_paragraph(style="gw_body")
        p.add_run(block["text"])

    # 附件（AST 为空，不生成）
    attachments = []

    # 署名与日期
    p = doc.add_paragraph(style="gw_signature")
    p.add_run("综合办公室")

    p = doc.add_paragraph(style="gw_date")
    p.add_run("2026年11月24日")

    # 页码
    footer = section.footer
    footer.is_linked_to_previous = False
    p = footer.paragraphs[0] if footer.paragraphs else footer.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(0)
    p.paragraph_format.line_spacing = Pt(14.0)
    p.paragraph_format.line_spacing_rule = WD_LINE_SPACING.EXACTLY

    for run in list(p.runs):
        run._element.getparent().remove(run._element)

    page_run = add_page_field(p)
    set_run_font(page_run, "宋体", "Times New Roman", 14.0, False, False, "000000")

    doc.save("output.docx")


if __name__ == "__main__":
    main()

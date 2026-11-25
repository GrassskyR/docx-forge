from docx import Document
from docx.shared import Pt, Mm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.enum.style import WD_STYLE_TYPE
from docx.oxml.ns import qn
from docx.oxml import OxmlElement


def set_rpr_fonts(rPr, font_cn, font_en):
    rFonts = rPr.find(qn("w:rFonts"))
    if rFonts is None:
        rFonts = OxmlElement("w:rFonts")
        rPr.insert(0, rFonts)
    rFonts.set(qn("w:ascii"), font_en)
    rFonts.set(qn("w:hAnsi"), font_en)
    rFonts.set(qn("w:eastAsia"), font_cn)
    rFonts.set(qn("w:cs"), font_en)


def set_rpr_size(rPr, size_pt):
    half_points = str(int(round(size_pt * 2)))
    for tag in ("w:sz", "w:szCs"):
        el = rPr.find(qn(tag))
        if el is None:
            el = OxmlElement(tag)
            rPr.append(el)
        el.set(qn("w:val"), half_points)


def set_rpr_color(rPr, color_hex):
    if not color_hex:
        return
    el = rPr.find(qn("w:color"))
    if el is None:
        el = OxmlElement("w:color")
        rPr.append(el)
    el.set(qn("w:val"), color_hex.upper())


def set_run_font(run, cfg):
    run.font.name = cfg["font_en"]
    run.font.size = Pt(cfg["size"])
    run.font.bold = cfg["bold"]
    run.font.italic = cfg["italic"]
    if cfg.get("color"):
        run.font.color.rgb = RGBColor.from_string(cfg["color"])
    rPr = run._element.get_or_add_rPr()
    set_rpr_fonts(rPr, cfg["font_cn"], cfg["font_en"])
    set_rpr_size(rPr, cfg["size"])
    set_rpr_color(rPr, cfg.get("color"))


def set_style_font(style, cfg):
    style.font.name = cfg["font_en"]
    style.font.size = Pt(cfg["size"])
    style.font.bold = cfg["bold"]
    style.font.italic = cfg["italic"]
    if cfg.get("color"):
        style.font.color.rgb = RGBColor.from_string(cfg["color"])
    rPr = style._element.get_or_add_rPr()
    set_rpr_fonts(rPr, cfg["font_cn"], cfg["font_en"])
    set_rpr_size(rPr, cfg["size"])
    set_rpr_color(rPr, cfg.get("color"))


def apply_paragraph_format(p, cfg):
    p.alignment = cfg["align"]
    pf = p.paragraph_format
    pf.space_before = Pt(cfg["before"])
    pf.space_after = Pt(cfg["after"])
    pf.line_spacing = Pt(cfg["line"])
    pf.line_spacing_rule = WD_LINE_SPACING.EXACTLY

    chars = cfg["first"]
    pf.first_line_indent = Pt(chars * cfg["size"])

    pPr = p._p.get_or_add_pPr()
    ind = pPr.find(qn("w:ind"))
    if ind is None:
        ind = OxmlElement("w:ind")
        pPr.append(ind)
    ind.set(qn("w:firstLineChars"), str(int(round(chars * 100))))
    ind.set(qn("w:firstLine"), str(int(round(chars * cfg["size"] * 20))))


def apply_style_paragraph_format(style, cfg):
    style.paragraph_format.alignment = cfg["align"]
    pf = style.paragraph_format
    pf.space_before = Pt(cfg["before"])
    pf.space_after = Pt(cfg["after"])
    pf.line_spacing = Pt(cfg["line"])
    pf.line_spacing_rule = WD_LINE_SPACING.EXACTLY

    chars = cfg["first"]
    pf.first_line_indent = Pt(chars * cfg["size"])

    pPr = style._element.get_or_add_pPr()
    ind = pPr.find(qn("w:ind"))
    if ind is None:
        ind = OxmlElement("w:ind")
        pPr.append(ind)
    ind.set(qn("w:firstLineChars"), str(int(round(chars * 100))))
    ind.set(qn("w:firstLine"), str(int(round(chars * cfg["size"] * 20))))


def add_bottom_border(p, color="FF0000", sz="8", space="1"):
    pPr = p._p.get_or_add_pPr()
    pBdr = pPr.find(qn("w:pBdr"))
    if pBdr is None:
        pBdr = OxmlElement("w:pBdr")
        pPr.append(pBdr)
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), sz)
    bottom.set(qn("w:space"), space)
    bottom.set(qn("w:color"), color.upper())
    pBdr.append(bottom)


def ensure_style(doc, style_id, cfg):
    try:
        style = doc.styles[style_id]
    except KeyError:
        style = doc.styles.add_style(style_id, WD_STYLE_TYPE.PARAGRAPH)
    style.base_style = doc.styles["Normal"]
    set_style_font(style, cfg)
    apply_style_paragraph_format(style, cfg)
    return style


def add_para(doc, text, style_id, cfg, border=False):
    p = doc.add_paragraph(style=style_id)
    if border:
        add_bottom_border(p, "FF0000")
    apply_paragraph_format(p, cfg)
    run = p.add_run(text)
    set_run_font(run, cfg)
    return p


def main():
    doc = Document()

    section = doc.sections[0]
    section.page_width = Mm(210)
    section.page_height = Mm(297)
    section.top_margin = Mm(33)
    section.bottom_margin = Mm(35)
    section.left_margin = Mm(28)
    section.right_margin = Mm(26)

    if len(doc.paragraphs) == 1 and not doc.paragraphs[0].text:
        p = doc.paragraphs[0]
        p._element.getparent().remove(p._element)

    role_cfg = {
        "gw_red_header": {
            "font_cn": "方正小标宋简体",
            "font_en": "Times New Roman",
            "size": 36.0,
            "bold": False,
            "italic": False,
            "color": "FF0000",
            "align": WD_ALIGN_PARAGRAPH.CENTER,
            "line": 40.0,
            "first": 0.0,
            "before": 0.0,
            "after": 0.0,
        },
        "gw_doc_number": {
            "font_cn": "仿宋_GB2312",
            "font_en": "Times New Roman",
            "size": 16.0,
            "bold": False,
            "italic": False,
            "color": "000000",
            "align": WD_ALIGN_PARAGRAPH.CENTER,
            "line": 28.0,
            "first": 0.0,
            "before": 0.0,
            "after": 0.0,
        },
        "gw_red_line": {
            "font_cn": "仿宋_GB2312",
            "font_en": "Times New Roman",
            "size": 1.0,
            "bold": False,
            "italic": False,
            "color": "FF0000",
            "align": WD_ALIGN_PARAGRAPH.CENTER,
            "line": 1.0,
            "first": 0.0,
            "before": 0.0,
            "after": 0.0,
        },
        "gw_title": {
            "font_cn": "黑体",
            "font_en": "Times New Roman",
            "size": 22.0,
            "bold": False,
            "italic": False,
            "color": "000000",
            "align": WD_ALIGN_PARAGRAPH.CENTER,
            "line": 30.0,
            "first": 0.0,
            "before": 0.0,
            "after": 0.0,
        },
        "gw_heading_1": {
            "font_cn": "黑体",
            "font_en": "Times New Roman",
            "size": 16.0,
            "bold": False,
            "italic": False,
            "color": "000000",
            "align": WD_ALIGN_PARAGRAPH.JUSTIFY,
            "line": 28.0,
            "first": 2.0,
            "before": 0.0,
            "after": 0.0,
        },
        "gw_heading_2": {
            "font_cn": "楷体_GB2312",
            "font_en": "Times New Roman",
            "size": 16.0,
            "bold": False,
            "italic": False,
            "color": "000000",
            "align": WD_ALIGN_PARAGRAPH.JUSTIFY,
            "line": 28.0,
            "first": 2.0,
            "before": 0.0,
            "after": 0.0,
        },
        "gw_heading_3": {
            "font_cn": "仿宋_GB2312",
            "font_en": "Times New Roman",
            "size": 16.0,
            "bold": False,
            "italic": False,
            "color": "000000",
            "align": WD_ALIGN_PARAGRAPH.JUSTIFY,
            "line": 28.0,
            "first": 2.0,
            "before": 0.0,
            "after": 0.0,
        },
        "gw_body": {
            "font_cn": "楷体_GB2312",
            "font_en": "Times New Roman",
            "size": 15.0,
            "bold": False,
            "italic": False,
            "color": "000000",
            "align": WD_ALIGN_PARAGRAPH.JUSTIFY,
            "line": 27.0,
            "first": 2.0,
            "before": 0.0,
            "after": 0.0,
        },
        "gw_recipient": {
            "font_cn": "仿宋_GB2312",
            "font_en": "Times New Roman",
            "size": 16.0,
            "bold": False,
            "italic": False,
            "color": "000000",
            "align": WD_ALIGN_PARAGRAPH.LEFT,
            "line": 28.0,
            "first": 0.0,
            "before": 0.0,
            "after": 0.0,
        },
        "gw_signature": {
            "font_cn": "仿宋_GB2312",
            "font_en": "Times New Roman",
            "size": 16.0,
            "bold": False,
            "italic": False,
            "color": "000000",
            "align": WD_ALIGN_PARAGRAPH.RIGHT,
            "line": 28.0,
            "first": 0.0,
            "before": 0.0,
            "after": 0.0,
        },
        "gw_date": {
            "font_cn": "仿宋_GB2312",
            "font_en": "Times New Roman",
            "size": 16.0,
            "bold": False,
            "italic": False,
            "color": "000000",
            "align": WD_ALIGN_PARAGRAPH.RIGHT,
            "line": 28.0,
            "first": 0.0,
            "before": 0.0,
            "after": 0.0,
        },
    }

    for style_id, cfg in role_cfg.items():
        ensure_style(doc, style_id, cfg)

    red_header_org = "综合办公室"
    doc_number = "综办〔2026〕12号"
    title = "关于开展档案归档检查的通知"
    recipient = "各部门："
    blocks = [
        {"type": "heading_1", "text": "一、检查安排"},
        {"type": "body", "text": "请各部门核对纸质与电子档案目录，整理归档清单并反馈检查结果。"},
    ]
    signature = "综合办公室"
    date = "2026年11月24日"

    add_para(doc, red_header_org, "gw_red_header", role_cfg["gw_red_header"])
    add_para(doc, doc_number, "gw_doc_number", role_cfg["gw_doc_number"])
    add_para(doc, "", "gw_red_line", role_cfg["gw_red_line"], border=True)

    add_para(doc, title, "gw_title", role_cfg["gw_title"])
    add_para(doc, recipient, "gw_recipient", role_cfg["gw_recipient"])

    for block in blocks:
        if block["type"] == "heading_1":
            add_para(doc, block["text"], "gw_heading_1", role_cfg["gw_heading_1"])
        elif block["type"] == "heading_2":
            add_para(doc, block["text"], "gw_heading_2", role_cfg["gw_heading_2"])
        elif block["type"] == "heading_3":
            add_para(doc, block["text"], "gw_heading_3", role_cfg["gw_heading_3"])
        elif block["type"] == "body":
            add_para(doc, block["text"], "gw_body", role_cfg["gw_body"])

    add_para(doc, signature, "gw_signature", role_cfg["gw_signature"])
    add_para(doc, date, "gw_date", role_cfg["gw_date"])

    doc.save("output.docx")


if __name__ == "__main__":
    main()
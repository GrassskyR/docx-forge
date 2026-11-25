# -*- coding: utf-8 -*-
from docx import Document
from docx.shared import Pt, Mm
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.enum.style import WD_STYLE_TYPE
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

OUTPUT = "output.docx"

TARGET = {
    "id": "gbt-9704-2012",
    "name": "GB/T 9704-2012 国标公文",
    "page": {
        "size": "A4",
        "margin_top_mm": 37.0,
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
            "alignment": "center", "line_spacing_rule": "exact", "line_spacing_value": 28.0,
            "first_line_indent_chars": 0.0, "space_before_pt": 0.0, "space_after_pt": 0.0,
        },
        "heading_1": {
            "font_cn": "黑体", "font_en": "Times New Roman", "font_size_pt": 16.0,
            "bold": False, "italic": False, "color_hex": "000000",
            "alignment": "justify", "line_spacing_rule": "exact", "line_spacing_value": 28.0,
            "first_line_indent_chars": 2.0, "space_before_pt": 0.0, "space_after_pt": 0.0,
        },
        "heading_2": {
            "font_cn": "楷体_GB2312", "font_en": "Times New Roman", "font_size_pt": 16.0,
            "bold": False, "italic": False, "color_hex": "000000",
            "alignment": "justify", "line_spacing_rule": "exact", "line_spacing_value": 28.0,
            "first_line_indent_chars": 2.0, "space_before_pt": 0.0, "space_after_pt": 0.0,
        },
        "heading_3": {
            "font_cn": "仿宋_GB2312", "font_en": "Times New Roman", "font_size_pt": 16.0,
            "bold": False, "italic": False, "color_hex": "000000",
            "alignment": "justify", "line_spacing_rule": "exact", "line_spacing_value": 28.0,
            "first_line_indent_chars": 2.0, "space_before_pt": 0.0, "space_after_pt": 0.0,
        },
        "body": {
            "font_cn": "仿宋_GB2312", "font_en": "Times New Roman", "font_size_pt": 16.0,
            "bold": False, "italic": False, "color_hex": "000000",
            "alignment": "justify", "line_spacing_rule": "exact", "line_spacing_value": 28.0,
            "first_line_indent_chars": 2.0, "space_before_pt": 0.0, "space_after_pt": 0.0,
        },
        "recipient": {
            "font_cn": "仿宋_GB2312", "font_en": "Times New Roman", "font_size_pt": 16.0,
            "bold": False, "italic": False, "color_hex": "000000",
            "alignment": "left", "line_spacing_rule": "exact", "line_spacing_value": 28.0,
            "first_line_indent_chars": 0.0, "space_before_pt": 0.0, "space_after_pt": 0.0,
        },
        "signature": {
            "font_cn": "仿宋_GB2312", "font_en": "Times New Roman", "font_size_pt": 16.0,
            "bold": False, "italic": False, "color_hex": "000000",
            "alignment": "right", "line_spacing_rule": "exact", "line_spacing_value": 28.0,
            "first_line_indent_chars": 0.0, "space_before_pt": 0.0, "space_after_pt": 0.0,
        },
        "date": {
            "font_cn": "仿宋_GB2312", "font_en": "Times New Roman", "font_size_pt": 16.0,
            "bold": False, "italic": False, "color_hex": "000000",
            "alignment": "right", "line_spacing_rule": "exact", "line_spacing_value": 28.0,
            "first_line_indent_chars": 0.0, "space_before_pt": 0.0, "space_after_pt": 0.0,
        },
    },
}

AST = {
    "doc_type": "notice",
    "red_header_org": "综合办公室",
    "doc_number": "综办〔2026〕12号",
    "title": "关于开展档案归档检查的通知",
    "recipient": "各部门：",
    "blocks": [
        {"type": "heading_1", "text": "一、检查安排", "rows": None},
        {"type": "body", "text": "请各部门核对纸质与电子档案目录，整理归档清单并反馈检查结果。", "rows": None},
    ],
    "attachments": [],
    "signature": "综合办公室",
    "date": "2026年11月24日",
}

ALIGN_MAP = {
    "left": WD_ALIGN_PARAGRAPH.LEFT,
    "center": WD_ALIGN_PARAGRAPH.CENTER,
    "right": WD_ALIGN_PARAGRAPH.RIGHT,
    "justify": WD_ALIGN_PARAGRAPH.JUSTIFY,
    "both": WD_ALIGN_PARAGRAPH.JUSTIFY,
    "distribute": WD_ALIGN_PARAGRAPH.DISTRIBUTE,
}

ROLE_STYLE = {
    "title": "gw_title",
    "heading_1": "gw_heading_1",
    "heading_2": "gw_heading_2",
    "heading_3": "gw_heading_3",
    "body": "gw_body",
    "recipient": "gw_recipient",
    "signature": "gw_signature",
    "date": "gw_date",
}


def _drop(rPr, tags):
    for tag in tags:
        for el in rPr.findall(qn(tag)):
            rPr.remove(el)


def set_style_font(style, font_cn, font_en, size_pt, bold, italic, color_hex):
    rPr = style.element.get_or_add_rPr()
    _drop(rPr, ("w:rFonts", "w:b", "w:bCs", "w:i", "w:iCs", "w:color", "w:sz", "w:szCs"))

    rFonts = OxmlElement("w:rFonts")
    rFonts.set(qn("w:ascii"), font_en)
    rFonts.set(qn("w:hAnsi"), font_en)
    rFonts.set(qn("w:eastAsia"), font_cn)
    rFonts.set(qn("w:cs"), font_en)
    rPr.append(rFonts)

    for tag, on in (("w:b", bold), ("w:bCs", bold), ("w:i", italic), ("w:iCs", italic)):
        el = OxmlElement(tag)
        el.set(qn("w:val"), "1" if on else "0")
        rPr.append(el)

    col = OxmlElement("w:color")
    col.set(qn("w:val"), (color_hex or "000000").replace("#", ""))
    rPr.append(col)

    half = str(int(round(float(size_pt) * 2)))
    for tag in ("w:sz", "w:szCs"):
        el = OxmlElement(tag)
        el.set(qn("w:val"), half)
        rPr.append(el)


def set_style_para(style, cfg):
    pf = style.paragraph_format
    pf.alignment = ALIGN_MAP.get(str(cfg.get("alignment", "justify")).lower(),
                                 WD_ALIGN_PARAGRAPH.JUSTIFY)

    pf.space_before = Pt(float(cfg.get("space_before_pt", 0.0) or 0.0))
    pf.space_after = Pt(float(cfg.get("space_after_pt", 0.0) or 0.0))

    rule = str(cfg.get("line_spacing_rule", "exact")).lower()
    value = float(cfg.get("line_spacing_value", 28.0) or 28.0)
    if rule in ("single",):
        pf.line_spacing_rule = WD_LINE_SPACING.SINGLE
    elif rule in ("1.5", "onehalf", "one_and_half"):
        pf.line_spacing = 1.5
    elif rule in ("double",):
        pf.line_spacing = 2.0
    elif rule in ("multiple", "multi"):
        pf.line_spacing = value
    elif rule in ("atleast", "at_least"):
        pf.line_spacing_rule = WD_LINE_SPACING.AT_LEAST
        pf.line_spacing = Pt(value)
    else:
        pf.line_spacing_rule = WD_LINE_SPACING.EXACTLY
        pf.line_spacing = Pt(value)

    chars = float(cfg.get("first_line_indent_chars", 0.0) or 0.0)
    size = float(cfg.get("font_size_pt", 16.0) or 16.0)
    pf.first_line_indent = Pt(chars * size)

    pPr = style.element.get_or_add_pPr()
    ind = pPr.find(qn("w:ind"))
    if ind is None:
        ind = OxmlElement("w:ind")
        pPr.append(ind)
    ind.set(qn("w:firstLineChars"), str(int(round(chars * 100))))
    ind.set(qn("w:firstLine"), str(int(round(chars * size * 20))))


def ensure_style(doc, name):
    styles = doc.styles
    try:
        st = styles[name]
    except KeyError:
        st = styles.add_style(name, WD_STYLE_TYPE.PARAGRAPH)
    try:
        st.base_style = styles["Normal"]
    except Exception:
        pass
    try:
        st.quick_style = True
    except Exception:
        pass
    return st


def build_style(doc, name, cfg):
    st = ensure_style(doc, name)
    set_style_font(
        st,
        cfg.get("font_cn", "仿宋_GB2312"),
        cfg.get("font_en", "Times New Roman"),
        float(cfg.get("font_size_pt", 16.0)),
        bool(cfg.get("bold", False)),
        bool(cfg.get("italic", False)),
        cfg.get("color_hex", "000000"),
    )
    set_style_para(st, cfg)
    return st


def style_run_font(run, font_cn, font_en, size_pt, color_hex="000000"):
    rPr = run._r.get_or_add_rPr()
    _drop(rPr, ("w:rFonts", "w:color", "w:sz", "w:szCs"))
    rFonts = OxmlElement("w:rFonts")
    rFonts.set(qn("w:ascii"), font_en)
    rFonts.set(qn("w:hAnsi"), font_en)
    rFonts.set(qn("w:eastAsia"), font_cn)
    rFonts.set(qn("w:cs"), font_en)
    rPr.append(rFonts)
    col = OxmlElement("w:color")
    col.set(qn("w:val"), (color_hex or "000000").replace("#", ""))
    rPr.append(col)
    half = str(int(round(float(size_pt) * 2)))
    for tag in ("w:sz", "w:szCs"):
        el = OxmlElement(tag)
        el.set(qn("w:val"), half)
        rPr.append(el)


def add_bottom_border(paragraph, color_hex, sz=18, space=1):
    pPr = paragraph._p.get_or_add_pPr()
    for el in pPr.findall(qn("w:pBdr")):
        pPr.remove(el)
    pBdr = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), str(int(sz)))
    bottom.set(qn("w:space"), str(int(space)))
    bottom.set(qn("w:color"), (color_hex or "FF0000").replace("#", ""))
    pBdr.append(bottom)

    spacing = pPr.find(qn("w:spacing"))
    if spacing is not None:
        spacing.addprevious(pBdr)
    else:
        pPr.append(pBdr)


def add_page_field(paragraph, font_cn, font_en, size_pt):
    run = paragraph.add_run()
    style_run_font(run, font_cn, font_en, size_pt, "000000")

    fld_begin = OxmlElement("w:fldChar")
    fld_begin.set(qn("w:fldCharType"), "begin")

    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = " PAGE "

    fld_sep = OxmlElement("w:fldChar")
    fld_sep.set(qn("w:fldCharType"), "separate")

    txt = OxmlElement("w:t")
    txt.text = "1"

    fld_end = OxmlElement("w:fldChar")
    fld_end.set(qn("w:fldCharType"), "end")

    run._r.append(fld_begin)
    run._r.append(instr)
    run._r.append(fld_sep)
    run._r.append(txt)
    run._r.append(fld_end)


def add_paragraph(doc, style, text):
    p = doc.add_paragraph(style=style)
    if text:
        p.add_run(text)
    return p


def main():
    doc = Document()

    # ---------- 页面设置 ----------
    page = TARGET["page"]
    sec = doc.sections[0]
    sec.page_width = Mm(210.0)
    sec.page_height = Mm(297.0)
    sec.top_margin = Mm(float(page["margin_top_mm"]))
    sec.bottom_margin = Mm(float(page["margin_bottom_mm"]))
    sec.left_margin = Mm(float(page["margin_left_mm"]))
    sec.right_margin = Mm(float(page["margin_right_mm"]))
    sec.header_distance = Mm(15.0)
    sec.footer_distance = Mm(17.5)

    # ---------- Normal 基础样式 ----------
    normal = doc.styles["Normal"]
    set_style_font(normal, "仿宋_GB2312", "Times New Roman", 16.0, False, False, "000000")
    n_pf = normal.paragraph_format
    n_pf.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    n_pf.space_before = Pt(0)
    n_pf.space_after = Pt(0)
    n_pf.line_spacing_rule = WD_LINE_SPACING.EXACTLY
    n_pf.line_spacing = Pt(28.0)
    n_pf.first_line_indent = Pt(0)

    # ---------- 角色样式 ----------
    styles = {}
    for role, style_id in ROLE_STYLE.items():
        cfg = TARGET["styles"].get(role)
        if cfg is None:
            continue
        styles[role] = build_style(doc, style_id, cfg)

    # ---------- 红头 / 文号 / 红线 ----------
    red_cfg = TARGET["red_header"]
    org = AST.get("red_header_org") or red_cfg.get("org_name")
    doc_number = AST.get("doc_number")

    red_header_style = None
    doc_number_style = None

    if org or doc_number:
        red_header_style = build_style(doc, "gw_red_header", {
            "font_cn": red_cfg.get("font_cn", "方正小标宋简体"),
            "font_en": "Times New Roman",
            "font_size_pt": float(red_cfg.get("font_size_pt", 36.0)),
            "bold": False,
            "italic": False,
            "color_hex": red_cfg.get("color_hex", "FF0000"),
            "alignment": "center",
            "line_spacing_rule": "single",
            "line_spacing_value": 40.0,
            "first_line_indent_chars": 0.0,
            "space_before_pt": 0.0,
            "space_after_pt": 0.0,
        })
        doc_number_style = build_style(doc, "gw_doc_number", {
            "font_cn": red_cfg.get("doc_number_font_cn", "仿宋_GB2312"),
            "font_en": "Times New Roman",
            "font_size_pt": float(red_cfg.get("doc_number_size_pt", 16.0)),
            "bold": False,
            "italic": False,
            "color_hex": "000000",
            "alignment": "center",
            "line_spacing_rule": "exact",
            "line_spacing_value": 28.0,
            "first_line_indent_chars": 0.0,
            "space_before_pt": 0.0,
            "space_after_pt": 14.0,
        })

    last_red_para = None
    if org:
        p = add_paragraph(doc, red_header_style, org)
        last_red_para = p
    if doc_number:
        p = add_paragraph(doc, doc_number_style, doc_number)
        last_red_para = p

    if last_red_para is not None and red_cfg.get("has_red_line", True):
        add_bottom_border(last_red_para, red_cfg.get("color_hex", "FF0000"), sz=18, space=4)

    # ---------- 标题 ----------
    if AST.get("title"):
        add_paragraph(doc, styles["title"], AST["title"])

    # ---------- 主送机关 ----------
    if AST.get("recipient"):
        add_paragraph(doc, styles["recipient"], AST["recipient"])

    # ---------- 正文块 ----------
    for block in AST.get("blocks", []) or []:
        btype = block.get("type", "body")
        text = block.get("text") or ""
        if btype not in styles:
            btype = "body"
        if btype == "body" and not text:
            continue
        p = add_paragraph(doc, styles[btype], text)
        rows = block.get("rows")
        if rows:
            for row in rows:
                if isinstance(row, (list, tuple)):
                    line = "".join(str(c) for c in row)
                else:
                    line = str(row)
                add_paragraph(doc, styles["body"], line)

    # ---------- 附件 ----------
    attachments = AST.get("attachments") or []
    if attachments:
        for idx, att in enumerate(attachments, 1):
            label = "附件：{}".format(att) if idx == 1 else "　　　{}".format(att)
            add_paragraph(doc, styles["body"], label)

    # ---------- 落款 ----------
    if AST.get("signature"):
        add_paragraph(doc, styles["signature"], AST["signature"])
    if AST.get("date"):
        add_paragraph(doc, styles["date"], AST["date"])

    # ---------- 页码 ----------
    if page.get("show_page_number", False):
        footer = sec.footer
        try:
            footer.is_linked_to_previous = False
        except Exception:
            pass
        fp = footer.paragraphs[0]
        for r in list(fp.runs):
            r._r.getparent().remove(r._r)
        fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
        fp.paragraph_format.space_before = Pt(0)
        fp.paragraph_format.space_after = Pt(0)
        fp.paragraph_format.first_line_indent = Pt(0)
        fp.paragraph_format.line_spacing_rule = WD_LINE_SPACING.SINGLE
        add_page_field(fp, "宋体", "Times New Roman", 14.0)

    doc.save(OUTPUT)


if __name__ == "__main__":
    main()

from docx import Document
from docx.shared import Mm
from docx.enum.style import WD_STYLE_TYPE
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

CONFIG = {
    "id": "gbt-9704-2012",
    "name": "GB/T 9704-2012 国标公文",
    "source_type": "builtin",
    "parent_id": None,
    "base_template_path": None,
    "description": "",
    "page": {
        "size": "A4",
        "margin_top_mm": 37.0,
        "margin_bottom_mm": 35.0,
        "margin_left_mm": 28.0,
        "margin_right_mm": 26.0,
        "show_page_number": False
    },
    "red_header": {
        "enabled": False,
        "org_name": None,
        "font_cn": "方正小标宋简体",
        "font_size_pt": 36.0,
        "color_hex": "FF0000",
        "has_red_line": True,
        "doc_number_font_cn": "仿宋_GB2312",
        "doc_number_size_pt": 16.0
    },
    "styles": {
        "title": {
            "font_cn": "方正小标宋简体",
            "font_en": "Times New Roman",
            "font_size_pt": 22.0,
            "bold": False,
            "italic": False,
            "color_hex": "000000",
            "alignment": "center",
            "line_spacing_rule": "exact",
            "line_spacing_value": 28.0,
            "first_line_indent_chars": 0.0,
            "space_before_pt": 0.0,
            "space_after_pt": 0.0
        },
        "heading_1": {
            "font_cn": "黑体",
            "font_en": "Times New Roman",
            "font_size_pt": 16.0,
            "bold": False,
            "italic": False,
            "color_hex": "000000",
            "alignment": "justify",
            "line_spacing_rule": "exact",
            "line_spacing_value": 28.0,
            "first_line_indent_chars": 2.0,
            "space_before_pt": 0.0,
            "space_after_pt": 0.0
        },
        "heading_2": {
            "font_cn": "楷体_GB2312",
            "font_en": "Times New Roman",
            "font_size_pt": 16.0,
            "bold": False,
            "italic": False,
            "color_hex": "000000",
            "alignment": "justify",
            "line_spacing_rule": "exact",
            "line_spacing_value": 28.0,
            "first_line_indent_chars": 2.0,
            "space_before_pt": 0.0,
            "space_after_pt": 0.0
        },
        "heading_3": {
            "font_cn": "仿宋_GB2312",
            "font_en": "Times New Roman",
            "font_size_pt": 16.0,
            "bold": False,
            "italic": False,
            "color_hex": "000000",
            "alignment": "justify",
            "line_spacing_rule": "exact",
            "line_spacing_value": 28.0,
            "first_line_indent_chars": 2.0,
            "space_before_pt": 0.0,
            "space_after_pt": 0.0
        },
        "body": {
            "font_cn": "仿宋_GB2312",
            "font_en": "Times New Roman",
            "font_size_pt": 16.0,
            "bold": False,
            "italic": False,
            "color_hex": "000000",
            "alignment": "justify",
            "line_spacing_rule": "exact",
            "line_spacing_value": 28.0,
            "first_line_indent_chars": 2.0,
            "space_before_pt": 0.0,
            "space_after_pt": 0.0
        },
        "recipient": {
            "font_cn": "华文中宋",
            "font_en": "Times New Roman",
            "font_size_pt": 16.0,
            "bold": False,
            "italic": False,
            "color_hex": "000000",
            "alignment": "left",
            "line_spacing_rule": "exact",
            "line_spacing_value": 28.0,
            "first_line_indent_chars": 0.0,
            "space_before_pt": 0.0,
            "space_after_pt": 0.0
        },
        "signature": {
            "font_cn": "仿宋_GB2312",
            "font_en": "Times New Roman",
            "font_size_pt": 16.0,
            "bold": False,
            "italic": False,
            "color_hex": "000000",
            "alignment": "right",
            "line_spacing_rule": "exact",
            "line_spacing_value": 28.0,
            "first_line_indent_chars": 0.0,
            "space_before_pt": 0.0,
            "space_after_pt": 0.0
        },
        "date": {
            "font_cn": "仿宋_GB2312",
            "font_en": "Times New Roman",
            "font_size_pt": 16.0,
            "bold": False,
            "italic": False,
            "color_hex": "000000",
            "alignment": "right",
            "line_spacing_rule": "exact",
            "line_spacing_value": 28.0,
            "first_line_indent_chars": 0.0,
            "space_before_pt": 0.0,
            "space_after_pt": 0.0
        }
    }
}

AST = {
    "doc_type": "notice",
    "red_header_org": "综合办公室",
    "doc_number": "综办〔2026〕12号",
    "title": "关于开展档案归档检查的通知",
    "recipient": "各部门：",
    "blocks": [
        {
            "type": "heading_1",
            "text": "一、检查安排",
            "rows": None
        },
        {
            "type": "body",
            "text": "请各部门核对纸质与电子档案目录，整理归档清单并反馈检查结果。",
            "rows": None
        }
    ],
    "attachments": [],
    "signature": "综合办公室",
    "date": "2026年11月24日"
}

ALIGN_MAP = {
    "justify": "both",
    "center": "center",
    "left": "left",
    "right": "right"
}


def _get_or_add_style_pPr(style):
    pPr = style.element.find(qn("w:pPr"))
    if pPr is None:
        pPr = OxmlElement("w:pPr")
        rPr = style.element.find(qn("w:rPr"))
        if rPr is not None:
            rPr.addprevious(pPr)
        else:
            style.element.append(pPr)
    return pPr


def _get_or_add_style_rPr(style):
    rPr = style.element.find(qn("w:rPr"))
    if rPr is None:
        rPr = OxmlElement("w:rPr")
        style.element.append(rPr)
    return rPr


def _set_style_font(style, font_cn, font_en, size_pt, bold=False, italic=False, color_hex="000000"):
    rPr = _get_or_add_style_rPr(style)
    for child in list(rPr):
        rPr.remove(child)

    font_en = font_en or font_cn
    rFonts = OxmlElement("w:rFonts")
    rFonts.set(qn("w:ascii"), font_en)
    rFonts.set(qn("w:hAnsi"), font_en)
    rFonts.set(qn("w:eastAsia"), font_cn)
    rFonts.set(qn("w:cs"), font_en)
    rPr.append(rFonts)

    b = OxmlElement("w:b")
    b.set(qn("w:val"), "1" if bold else "0")
    rPr.append(b)

    bCs = OxmlElement("w:bCs")
    bCs.set(qn("w:val"), "1" if bold else "0")
    rPr.append(bCs)

    i = OxmlElement("w:i")
    i.set(qn("w:val"), "1" if italic else "0")
    rPr.append(i)

    iCs = OxmlElement("w:iCs")
    iCs.set(qn("w:val"), "1" if italic else "0")
    rPr.append(iCs)

    color = OxmlElement("w:color")
    color.set(qn("w:val"), color_hex.upper().lstrip("#"))
    rPr.append(color)

    sz_val = str(int(round(size_pt * 2)))
    sz = OxmlElement("w:sz")
    sz.set(qn("w:val"), sz_val)
    rPr.append(sz)

    szCs = OxmlElement("w:szCs")
    szCs.set(qn("w:val"), sz_val)
    rPr.append(szCs)


def _set_style_para(style, alignment, line_spacing_pt, first_line_chars,
                    space_before_pt, space_after_pt, font_size_pt):
    pPr = _get_or_add_style_pPr(style)
    for child in list(pPr):
        pPr.remove(child)

    spacing = OxmlElement("w:spacing")
    spacing.set(qn("w:before"), str(int(round(space_before_pt * 20))))
    spacing.set(qn("w:after"), str(int(round(space_after_pt * 20))))
    spacing.set(qn("w:line"), str(int(round(line_spacing_pt * 20))))
    spacing.set(qn("w:lineRule"), "exact")
    pPr.append(spacing)

    ind = OxmlElement("w:ind")
    ind.set(qn("w:firstLineChars"), str(int(round(first_line_chars * 100))))
    ind.set(qn("w:firstLine"), str(int(round(first_line_chars * font_size_pt * 20))))
    pPr.append(ind)

    jc = OxmlElement("w:jc")
    jc.set(qn("w:val"), ALIGN_MAP.get(alignment, alignment))
    pPr.append(jc)


def ensure_paragraph_style(doc, style_id):
    styles = doc.styles
    for s in styles:
        if getattr(s, "style_id", None) == style_id or s.name == style_id:
            return s
    return styles.add_style(style_id, WD_STYLE_TYPE.PARAGRAPH)


def add_red_line(doc, color_hex, sz=8, space=1):
    p = doc.add_paragraph()
    pPr = p._p.get_or_add_pPr()
    pBdr = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), str(sz))
    bottom.set(qn("w:space"), str(space))
    bottom.set(qn("w:color"), color_hex.upper().lstrip("#"))
    pBdr.append(bottom)
    pPr.append(pBdr)
    return p


def add_page_number_footer(section):
    footer = section.footer
    footer.is_linked_to_previous = False
    p = footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run()
    fldChar1 = OxmlElement("w:fldChar")
    fldChar1.set(qn("w:fldCharType"), "begin")
    instrText = OxmlElement("w:instrText")
    instrText.set(qn("xml:space"), "preserve")
    instrText.text = "PAGE"
    fldChar2 = OxmlElement("w:fldChar")
    fldChar2.set(qn("w:fldCharType"), "end")
    run._r.append(fldChar1)
    run._r.append(instrText)
    run._r.append(fldChar2)


doc = Document()

section = doc.sections[0]
section.page_width = Mm(210)
section.page_height = Mm(297)
section.top_margin = Mm(CONFIG["page"]["margin_top_mm"])
section.bottom_margin = Mm(CONFIG["page"]["margin_bottom_mm"])
section.left_margin = Mm(CONFIG["page"]["margin_left_mm"])
section.right_margin = Mm(CONFIG["page"]["margin_right_mm"])

body_cfg = CONFIG["styles"]["body"]
normal = doc.styles["Normal"]
_set_style_font(
    normal,
    body_cfg["font_cn"],
    body_cfg.get("font_en", "Times New Roman"),
    body_cfg["font_size_pt"],
    body_cfg.get("bold", False),
    body_cfg.get("italic", False),
    body_cfg.get("color_hex", "000000")
)
_set_style_para(
    normal,
    body_cfg["alignment"],
    body_cfg["line_spacing_value"],
    body_cfg["first_line_indent_chars"],
    body_cfg["space_before_pt"],
    body_cfg["space_after_pt"],
    body_cfg["font_size_pt"]
)

role_styles = {}
for role, cfg in CONFIG["styles"].items():
    style_id = "gw_" + role
    style = ensure_paragraph_style(doc, style_id)
    _set_style_font(
        style,
        cfg["font_cn"],
        cfg.get("font_en", "Times New Roman"),
        cfg["font_size_pt"],
        cfg.get("bold", False),
        cfg.get("italic", False),
        cfg.get("color_hex", "000000")
    )
    _set_style_para(
        style,
        cfg["alignment"],
        cfg["line_spacing_value"],
        cfg["first_line_indent_chars"],
        cfg["space_before_pt"],
        cfg["space_after_pt"],
        cfg["font_size_pt"]
    )
    role_styles[style_id] = style

rh = CONFIG["red_header"]
doc_number_style = ensure_paragraph_style(doc, "gw_doc_number")
_set_style_font(
    doc_number_style,
    rh["doc_number_font_cn"],
    "Times New Roman",
    rh["doc_number_size_pt"],
    False,
    False,
    "000000"
)
_set_style_para(
    doc_number_style,
    "center",
    28.0,
    0.0,
    0.0,
    0.0,
    rh["doc_number_size_pt"]
)
role_styles["gw_doc_number"] = doc_number_style

if rh["enabled"]:
    red_header_style = ensure_paragraph_style(doc, "gw_red_header")
    _set_style_font(
        red_header_style,
        rh["font_cn"],
        "Times New Roman",
        rh["font_size_pt"],
        False,
        False,
        rh["color_hex"]
    )
    _set_style_para(
        red_header_style,
        "center",
        36.0,
        0.0,
        0.0,
        0.0,
        rh["font_size_pt"]
    )
    role_styles["gw_red_header"] = red_header_style

    org = AST.get("red_header_org") or rh.get("org_name")
    if org:
        doc.add_paragraph(org, style=role_styles["gw_red_header"])
    if AST.get("doc_number"):
        doc.add_paragraph(AST["doc_number"], style=role_styles["gw_doc_number"])
    if rh.get("has_red_line"):
        add_red_line(doc, rh["color_hex"])

if CONFIG["page"].get("show_page_number"):
    add_page_number_footer(section)

if AST.get("title"):
    doc.add_paragraph(AST["title"], style=role_styles["gw_title"])

if AST.get("recipient"):
    doc.add_paragraph(AST["recipient"], style=role_styles["gw_recipient"])

for block in AST.get("blocks", []):
    block_type = block.get("type", "body")
    text = block.get("text", "")
    style_id = "gw_" + block_type if "gw_" + block_type in role_styles else "gw_body"
    doc.add_paragraph(text, style=role_styles[style_id])

for att in AST.get("attachments", []):
    doc.add_paragraph(att, style=role_styles["gw_body"])

if AST.get("signature"):
    doc.add_paragraph(AST["signature"], style=role_styles["gw_signature"])

if AST.get("date"):
    doc.add_paragraph(AST["date"], style=role_styles["gw_date"])

doc.save("output.docx")
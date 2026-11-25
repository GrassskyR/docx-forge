import json
from docx import Document
from docx.shared import Pt, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.style import WD_STYLE_TYPE
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

TARGET = json.loads(r'''{
  "id": "gbt-9704-2012",
  "name": "GB/T 9704-2012 国标公文",
  "source_type": "builtin",
  "parent_id": null,
  "base_template_path": null,
  "description": "",
  "page": {
    "size": "A4",
    "margin_top_mm": 31.0,
    "margin_bottom_mm": 35.0,
    "margin_left_mm": 28.0,
    "margin_right_mm": 26.0,
    "show_page_number": true
  },
  "red_header": {
    "enabled": true,
    "org_name": null,
    "font_cn": "方正小标宋简体",
    "font_size_pt": 36.0,
    "color_hex": "FF0000",
    "has_red_line": true,
    "doc_number_font_cn": "仿宋_GB2312",
    "doc_number_size_pt": 16.0
  },
  "styles": {
    "title": {
      "font_cn": "黑体",
      "font_en": "Times New Roman",
      "font_size_pt": 22.0,
      "bold": false,
      "italic": false,
      "color_hex": "000000",
      "alignment": "center",
      "line_spacing_rule": "exact",
      "line_spacing_value": 30.0,
      "first_line_indent_chars": 0.0,
      "space_before_pt": 0.0,
      "space_after_pt": 0.0
    },
    "heading_1": {
      "font_cn": "黑体",
      "font_en": "Times New Roman",
      "font_size_pt": 16.0,
      "bold": false,
      "italic": false,
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
      "bold": false,
      "italic": false,
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
      "bold": false,
      "italic": false,
      "color_hex": "000000",
      "alignment": "justify",
      "line_spacing_rule": "exact",
      "line_spacing_value": 28.0,
      "first_line_indent_chars": 2.0,
      "space_before_pt": 0.0,
      "space_after_pt": 0.0
    },
    "body": {
      "font_cn": "宋体",
      "font_en": "Times New Roman",
      "font_size_pt": 14.0,
      "bold": false,
      "italic": false,
      "color_hex": "000000",
      "alignment": "justify",
      "line_spacing_rule": "exact",
      "line_spacing_value": 25.0,
      "first_line_indent_chars": 2.0,
      "space_before_pt": 0.0,
      "space_after_pt": 0.0
    },
    "recipient": {
      "font_cn": "仿宋_GB2312",
      "font_en": "Times New Roman",
      "font_size_pt": 16.0,
      "bold": false,
      "italic": false,
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
      "bold": false,
      "italic": false,
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
      "bold": false,
      "italic": false,
      "color_hex": "000000",
      "alignment": "right",
      "line_spacing_rule": "exact",
      "line_spacing_value": 28.0,
      "first_line_indent_chars": 0.0,
      "space_before_pt": 0.0,
      "space_after_pt": 0.0
    }
  }
}''')

AST = json.loads(r'''{
  "doc_type": "notice",
  "red_header_org": "综合办公室",
  "doc_number": "综办〔2026〕12号",
  "title": "关于开展档案归档检查的通知",
  "recipient": "各部门：",
  "blocks": [
    {
      "type": "heading_1",
      "text": "一、检查安排",
      "rows": null
    },
    {
      "type": "body",
      "text": "请各部门核对纸质与电子档案目录，整理归档清单并反馈检查结果。",
      "rows": null
    }
  ],
  "attachments": [],
  "signature": "综合办公室",
  "date": "2026年11月24日"
}''')

ALIGN_MAP = {
    "left": WD_ALIGN_PARAGRAPH.LEFT,
    "center": WD_ALIGN_PARAGRAPH.CENTER,
    "right": WD_ALIGN_PARAGRAPH.RIGHT,
    "justify": WD_ALIGN_PARAGRAPH.JUSTIFY,
    "both": WD_ALIGN_PARAGRAPH.JUSTIFY,
}

STYLE_MAP = {
    "title": "gw_title",
    "heading_1": "gw_heading_1",
    "heading_2": "gw_heading_2",
    "heading_3": "gw_heading_3",
    "body": "gw_body",
    "recipient": "gw_recipient",
    "signature": "gw_signature",
    "date": "gw_date",
}

doc = Document()


def get_or_add_el(parent, tag):
    el = parent.find(qn(tag))
    if el is None:
        el = OxmlElement(tag)
        parent.append(el)
    return el


def apply_run_font(rPr, cfg):
    font_cn = cfg.get("font_cn", "宋体")
    font_en = cfg.get("font_en", "Times New Roman")
    size_pt = float(cfg.get("font_size_pt", 14.0))
    color_hex = str(cfg.get("color_hex", "000000")).lstrip("#").upper()
    bold = bool(cfg.get("bold", False))
    italic = bool(cfg.get("italic", False))

    rFonts = get_or_add_el(rPr, "w:rFonts")
    rFonts.set(qn("w:ascii"), font_en)
    rFonts.set(qn("w:hAnsi"), font_en)
    rFonts.set(qn("w:eastAsia"), font_cn)
    rFonts.set(qn("w:cs"), font_en)

    sz = get_or_add_el(rPr, "w:sz")
    sz.set(qn("w:val"), str(int(round(size_pt * 2))))
    szCs = get_or_add_el(rPr, "w:szCs")
    szCs.set(qn("w:val"), str(int(round(size_pt * 2))))

    color = get_or_add_el(rPr, "w:color")
    color.set(qn("w:val"), color_hex)

    b = get_or_add_el(rPr, "w:b")
    b.set(qn("w:val"), "1" if bold else "0")
    bCs = get_or_add_el(rPr, "w:bCs")
    bCs.set(qn("w:val"), "1" if bold else "0")
    i = get_or_add_el(rPr, "w:i")
    i.set(qn("w:val"), "1" if italic else "0")
    iCs = get_or_add_el(rPr, "w:iCs")
    iCs.set(qn("w:val"), "1" if italic else "0")


def configure_style(style_id, cfg):
    try:
        style = doc.styles[style_id]
    except KeyError:
        style = doc.styles.add_style(style_id, WD_STYLE_TYPE.PARAGRAPH)

    style.base_style = doc.styles["Normal"]
    style.paragraph_format.alignment = ALIGN_MAP.get(
        str(cfg.get("alignment", "left")), WD_ALIGN_PARAGRAPH.LEFT
    )

    font_size_pt = float(cfg.get("font_size_pt", 14.0))
    space_before_pt = float(cfg.get("space_before_pt", 0.0))
    space_after_pt = float(cfg.get("space_after_pt", 0.0))
    line_pt = float(cfg.get("line_spacing_value", 28.0))
    first_chars = float(cfg.get("first_line_indent_chars", 0.0))

    pPr = get_or_add_el(style.element, "w:pPr")

    spacing = get_or_add_el(pPr, "w:spacing")
    spacing.set(qn("w:before"), str(int(round(space_before_pt * 20))))
    spacing.set(qn("w:after"), str(int(round(space_after_pt * 20))))
    spacing.set(qn("w:line"), str(int(round(line_pt * 20))))
    spacing.set(qn("w:lineRule"), "exact")

    ind = get_or_add_el(pPr, "w:ind")
    ind.set(qn("w:firstLineChars"), str(int(round(first_chars * 100))))
    ind.set(qn("w:firstLine"), str(int(round(first_chars * font_size_pt * 20))))
    ind.set(qn("w:left"), "0")
    ind.set(qn("w:right"), "0")

    rPr = get_or_add_el(style.element, "w:rPr")
    apply_run_font(rPr, cfg)


# 页面设置
section = doc.sections[0]
section.page_width = Cm(21.0)
section.page_height = Cm(29.7)
section.top_margin = Cm(3.1)
section.bottom_margin = Cm(3.5)
section.left_margin = Cm(2.8)
section.right_margin = Cm(2.6)

# 基础角色样式
for role, style_id in STYLE_MAP.items():
    if role in TARGET["styles"]:
        configure_style(style_id, TARGET["styles"][role])

# 红头样式
red_cfg = TARGET["red_header"]
configure_style("gw_red_header", {
    "font_cn": red_cfg.get("font_cn", "方正小标宋简体"),
    "font_en": "Times New Roman",
    "font_size_pt": red_cfg.get("font_size_pt", 36.0),
    "bold": False,
    "italic": False,
    "color_hex": red_cfg.get("color_hex", "FF0000"),
    "alignment": "center",
    "line_spacing_rule": "exact",
    "line_spacing_value": red_cfg.get("font_size_pt", 36.0),
    "first_line_indent_chars": 0.0,
    "space_before_pt": 0.0,
    "space_after_pt": 0.0,
})

# 发文字号样式
configure_style("gw_doc_number", {
    "font_cn": red_cfg.get("doc_number_font_cn", "仿宋_GB2312"),
    "font_en": "Times New Roman",
    "font_size_pt": red_cfg.get("doc_number_size_pt", 16.0),
    "bold": False,
    "italic": False,
    "color_hex": "000000",
    "alignment": "center",
    "line_spacing_rule": "exact",
    "line_spacing_value": 28.0,
    "first_line_indent_chars": 0.0,
    "space_before_pt": 0.0,
    "space_after_pt": 0.0,
})

# 红色分隔线样式
configure_style("gw_red_line", {
    "font_cn": "宋体",
    "font_en": "Times New Roman",
    "font_size_pt": 1.0,
    "bold": False,
    "italic": False,
    "color_hex": "000000",
    "alignment": "left",
    "line_spacing_rule": "exact",
    "line_spacing_value": 1.0,
    "first_line_indent_chars": 0.0,
    "space_before_pt": 4.0,
    "space_after_pt": 0.0,
})

# 页码样式
configure_style("gw_page_number", {
    "font_cn": "宋体",
    "font_en": "Times New Roman",
    "font_size_pt": 14.0,
    "bold": False,
    "italic": False,
    "color_hex": "000000",
    "alignment": "center",
    "line_spacing_rule": "exact",
    "line_spacing_value": 14.0,
    "first_line_indent_chars": 0.0,
    "space_before_pt": 0.0,
    "space_after_pt": 0.0,
})

# 红头机关
if red_cfg.get("enabled", True):
    org = AST.get("red_header_org") or red_cfg.get("org_name")
    if org:
        doc.add_paragraph(str(org), style="gw_red_header")

    doc_number = AST.get("doc_number")
    if doc_number:
        doc.add_paragraph(str(doc_number), style="gw_doc_number")

    if red_cfg.get("has_red_line", True):
        red_line_p = doc.add_paragraph(style="gw_red_line")
        pPr = get_or_add_el(red_line_p._p, "w:pPr")
        pBdr = get_or_add_el(pPr, "w:pBdr")
        bottom = get_or_add_el(pBdr, "w:bottom")
        bottom.set(qn("w:val"), "single")
        bottom.set(qn("w:sz"), "12")
        bottom.set(qn("w:space"), "1")
        bottom.set(qn("w:color"), str(red_cfg.get("color_hex", "FF0000")).lstrip("#").upper())

# 标题
title = AST.get("title")
if title:
    doc.add_paragraph(str(title), style="gw_title")

# 主送机关
recipient = AST.get("recipient")
if recipient:
    doc.add_paragraph(str(recipient), style="gw_recipient")

# 正文块
for block in AST.get("blocks", []):
    btype = block.get("type")
    text = block.get("text")
    if not text:
        continue
    style_id = STYLE_MAP.get(btype)
    if not style_id:
        style_id = "gw_body"
    doc.add_paragraph(str(text), style=style_id)

# 附件
attachments = AST.get("attachments") or []
if attachments:
    doc.add_paragraph("附件：", style="gw_body")
    for idx, item in enumerate(attachments, 1):
        doc.add_paragraph(f"{idx}. {item}", style="gw_body")

# 发文机关署名
signature = AST.get("signature")
if signature:
    doc.add_paragraph(str(signature), style="gw_signature")

# 成文日期
date_text = AST.get("date")
if date_text:
    doc.add_paragraph(str(date_text), style="gw_date")

# 页码
if TARGET.get("page", {}).get("show_page_number", False):
    footer_p = section.footer.paragraphs[0]
    footer_p.style = doc.styles["gw_page_number"]
    footer_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    footer_p.text = ""

    footer_p.add_run("—")

    fld = OxmlElement("w:fldSimple")
    fld.set(qn("w:instr"), " PAGE ")
    fld.set(qn("w:dirty"), "true")
    r = OxmlElement("w:r")
    rPr = OxmlElement("w:rPr")
    apply_run_font(rPr, {
        "font_cn": "宋体",
        "font_en": "Times New Roman",
        "font_size_pt": 14.0,
        "bold": False,
        "italic": False,
        "color_hex": "000000",
    })
    r.append(rPr)
    t = OxmlElement("w:t")
    t.text = "1"
    r.append(t)
    fld.append(r)
    footer_p._p.append(fld)

    footer_p.add_run("—")

doc.save("output.docx")
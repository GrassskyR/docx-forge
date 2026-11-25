# -*- coding: utf-8 -*-
"""
生成 GB/T 9704-2012 国标公文 Word 文档：output.docx
依赖：python-docx（内部使用 lxml）
"""

from docx import Document
from docx.shared import Pt, Mm
from docx.oxml import parse_xml
from docx.oxml.ns import qn

# ----------------------------------------------------------------------------
# 配置与 AST
# ----------------------------------------------------------------------------
W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NSDECL = 'xmlns:w="%s"' % W_NS

CONFIG = {
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
            "font_cn": "方正小标宋简体", "font_en": "Times New Roman",
            "font_size_pt": 22.0, "bold": False, "italic": False,
            "color_hex": "000000", "alignment": "center",
            "line_spacing_rule": "exact", "line_spacing_value": 28.0,
            "first_line_indent_chars": 0.0,
            "space_before_pt": 0.0, "space_after_pt": 0.0,
        },
        "heading_1": {
            "font_cn": "黑体", "font_en": "Times New Roman",
            "font_size_pt": 16.0, "bold": False, "italic": False,
            "color_hex": "000000", "alignment": "justify",
            "line_spacing_rule": "exact", "line_spacing_value": 28.0,
            "first_line_indent_chars": 2.0,
            "space_before_pt": 0.0, "space_after_pt": 0.0,
        },
        "heading_2": {
            "font_cn": "楷体_GB2312", "font_en": "Times New Roman",
            "font_size_pt": 16.0, "bold": False, "italic": False,
            "color_hex": "000000", "alignment": "justify",
            "line_spacing_rule": "exact", "line_spacing_value": 28.0,
            "first_line_indent_chars": 2.0,
            "space_before_pt": 0.0, "space_after_pt": 0.0,
        },
        "heading_3": {
            "font_cn": "仿宋_GB2312", "font_en": "Times New Roman",
            "font_size_pt": 16.0, "bold": False, "italic": False,
            "color_hex": "000000", "alignment": "justify",
            "line_spacing_rule": "exact", "line_spacing_value": 28.0,
            "first_line_indent_chars": 2.0,
            "space_before_pt": 0.0, "space_after_pt": 0.0,
        },
        "body": {
            "font_cn": "仿宋_GB2312", "font_en": "Times New Roman",
            "font_size_pt": 16.0, "bold": False, "italic": False,
            "color_hex": "000000", "alignment": "justify",
            "line_spacing_rule": "exact", "line_spacing_value": 28.0,
            "first_line_indent_chars": 2.0,
            "space_before_pt": 0.0, "space_after_pt": 0.0,
        },
        "recipient": {
            "font_cn": "仿宋_GB2312", "font_en": "Times New Roman",
            "font_size_pt": 16.0, "bold": False, "italic": False,
            "color_hex": "000000", "alignment": "left",
            "line_spacing_rule": "exact", "line_spacing_value": 28.0,
            "first_line_indent_chars": 0.0,
            "space_before_pt": 0.0, "space_after_pt": 0.0,
        },
        "signature": {
            "font_cn": "仿宋_GB2312", "font_en": "Times New Roman",
            "font_size_pt": 16.0, "bold": False, "italic": False,
            "color_hex": "000000", "alignment": "right",
            "line_spacing_rule": "exact", "line_spacing_value": 28.0,
            "first_line_indent_chars": 0.0,
            "space_before_pt": 0.0, "space_after_pt": 0.0,
        },
        "date": {
            "font_cn": "仿宋_GB2312", "font_en": "Times New Roman",
            "font_size_pt": 16.0, "bold": False, "italic": False,
            "color_hex": "000000", "alignment": "right",
            "line_spacing_rule": "exact", "line_spacing_value": 28.0,
            "first_line_indent_chars": 0.0,
            "space_before_pt": 0.0, "space_after_pt": 0.0,
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
        {"type": "body",
         "text": "请各部门核对纸质与电子档案目录，整理归档清单并反馈检查结果。",
         "rows": None},
    ],
    "attachments": [],
    "signature": "综合办公室",
    "date": "2026年11月24日",
}

ALIGN_MAP = {
    "center": "center",
    "justify": "both",
    "both": "both",
    "left": "left",
    "right": "right",
    "distribute": "distribute",
}


# ----------------------------------------------------------------------------
# 底层 XML 构造
# ----------------------------------------------------------------------------
def rpr_xml(cn, en, size_pt, bold=False, italic=False, color="000000"):
    """构造 run 属性：显式写入 rFonts(ascii/hAnsi/eastAsia/cs) 与 sz/szCs。"""
    sz = str(int(round(size_pt * 2)))
    b = "<w:b/><w:bCs/>" if bold else '<w:b w:val="0"/><w:bCs w:val="0"/>'
    i = "<w:i/><w:iCs/>" if italic else '<w:i w:val="0"/><w:iCs w:val="0"/>'
    return (
        "<w:rPr %s>"
        '<w:rFonts w:ascii="%s" w:hAnsi="%s" w:eastAsia="%s" w:cs="%s"/>'
        "%s%s"
        '<w:color w:val="%s"/>'
        '<w:sz w:val="%s"/><w:szCs w:val="%s"/>'
        "</w:rPr>"
    ) % (NSDECL, en, en, cn, en, b, i, color, sz, sz)


def add_par(doc, text, st, alignment=None, indent_chars=None, border=None,
            right_chars=0.0, left_chars=0.0, line_override=None,
            size_override=None, color_override=None):
    """追加一个段落，显式设置对齐、段前段后、行距、缩进与字形。"""
    p = doc.add_paragraph()
    pPr = p._p.get_or_add_pPr()
    for child in list(pPr):
        pPr.remove(child)

    size = size_override if size_override is not None else st.get("font_size_pt", 16.0)
    ind = st.get("first_line_indent_chars", 0.0) if indent_chars is None else indent_chars
    al = ALIGN_MAP.get(alignment or st.get("alignment", "justify"), "both")
    line_pt = line_override if line_override is not None else st.get("line_spacing_value", 28.0)
    line_tw = int(round(line_pt * 20))                       # 行距（twips）
    before_tw = int(round(st.get("space_before_pt", 0.0) * 20))
    after_tw = int(round(st.get("space_after_pt", 0.0) * 20))

    # 首行缩进：firstLineChars = 字符数×100；firstLine = 字符数×字号磅×20
    fl_chars = int(round(ind * 100))
    fl_tw = int(round(ind * size * 20))

    parts = ["<w:pPr %s>" % NSDECL]
    if border:
        parts.append(
            '<w:pBdr><w:bottom w:val="single" w:sz="%d" w:space="1" w:color="%s"/></w:pBdr>'
            % (int(border[0]), border[1])
        )
    parts.append(
        '<w:spacing w:before="%d" w:after="%d" w:line="%d" w:lineRule="exact"/>'
        % (before_tw, after_tw, line_tw)
    )
    ind_attrs = 'w:firstLineChars="%d" w:firstLine="%d"' % (fl_chars, fl_tw)
    if right_chars:
        ind_attrs += ' w:rightChars="%d" w:right="%d"' % (
            int(round(right_chars * 100)), int(round(right_chars * size * 20)))
    if left_chars:
        ind_attrs += ' w:leftChars="%d" w:left="%d"' % (
            int(round(left_chars * 100)), int(round(left_chars * size * 20)))
    parts.append("<w:ind %s/>" % ind_attrs)
    parts.append('<w:jc w:val="%s"/>' % al)
    parts.append("</w:pPr>")

    p._p.insert(0, parse_xml("".join(parts)))

    if text:
        run = p.add_run(text)
        run._r.insert(0, parse_xml(rpr_xml(
            st.get("font_cn", "仿宋_GB2312"),
            st.get("font_en", "Times New Roman"),
            size,
            st.get("bold", False),
            st.get("italic", False),
            color_override or st.get("color_hex", "000000"),
        )))
    return p


def build_footer_xml():
    """页码：— 1 —，居中，PAGE 域。"""
    rpr = rpr_xml("仿宋_GB2312", "Times New Roman", 14.0)
    return (
        "<w:p %s>"
        "<w:pPr>"
        '<w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>'
        '<w:jc w:val="center"/>'
        "</w:pPr>"
        '<w:r>%s<w:t xml:space="preserve">— </w:t></w:r>'
        '<w:r>%s<w:fldChar w:fldCharType="begin"/></w:r>'
        '<w:r>%s<w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>'
        '<w:r>%s<w:fldChar w:fldCharType="separate"/></w:r>'
        '<w:r>%s<w:t>1</w:t></w:r>'
        '<w:r>%s<w:fldChar w:fldCharType="end"/></w:r>'
        '<w:r>%s<w:t xml:space="preserve"> —</w:t></w:r>'
        "</w:p>"
    ) % ((NSDECL,) + (rpr,) * 7)


# ----------------------------------------------------------------------------
# 文档主流程
# ----------------------------------------------------------------------------
def main():
    page = CONFIG["page"]
    red = CONFIG["red_header"]
    S = CONFIG["styles"]

    doc = Document()

    # ---- 页面设置 ----
    sec = doc.sections[0]
    sec.page_width = Mm(210)
    sec.page_height = Mm(297)
    sec.top_margin = Mm(page["margin_top_mm"])
    sec.bottom_margin = Mm(page["margin_bottom_mm"])
    sec.left_margin = Mm(page["margin_left_mm"])
    sec.right_margin = Mm(page["margin_right_mm"])
    sec.header_distance = Mm(15)
    sec.footer_distance = Mm(17.5)

    # ---- Normal 样式默认字形 ----
    normal = doc.styles["Normal"]
    normal.font.name = "Times New Roman"
    normal.font.size = Pt(16)
    rpr = normal.element.rPr
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = parse_xml(
            '<w:rFonts %s w:ascii="Times New Roman" w:hAnsi="Times New Roman" '
            'w:eastAsia="仿宋_GB2312" w:cs="Times New Roman"/>' % NSDECL
        )
        rpr.insert(0, rfonts)
    rfonts.set(qn("w:ascii"), "Times New Roman")
    rfonts.set(qn("w:hAnsi"), "Times New Roman")
    rfonts.set(qn("w:cs"), "Times New Roman")
    rfonts.set(qn("w:eastAsia"), "仿宋_GB2312")

    # ---- 派生样式：红头 / 文号 ----
    red_title_style = {
        "font_cn": red["font_cn"],
        "font_en": "Times New Roman",
        "font_size_pt": red["font_size_pt"],
        "bold": False,
        "italic": False,
        "color_hex": red["color_hex"],
        "alignment": "center",
        "line_spacing_rule": "exact",
        "line_spacing_value": red["font_size_pt"] * 1.4,
        "first_line_indent_chars": 0.0,
        "space_before_pt": 0.0,
        "space_after_pt": 0.0,
    }
    doc_num_style = {
        "font_cn": red["doc_number_font_cn"],
        "font_en": "Times New Roman",
        "font_size_pt": red["doc_number_size_pt"],
        "bold": False,
        "italic": False,
        "color_hex": "000000",
        "alignment": "center",
        "line_spacing_rule": "exact",
        "line_spacing_value": 28.0,
        "first_line_indent_chars": 0.0,
        "space_before_pt": 0.0,
        "space_after_pt": 0.0,
    }

    # ---- 红头（机关名称优先取 AST） ----
    org_name = AST.get("red_header_org") or (red.get("org_name") if red.get("enabled") else None)
    has_red_header = bool(org_name)

    if has_red_header:
        add_par(doc, org_name, red_title_style)
        # 发文机关标志下空二行
        add_par(doc, "", S["body"])
        add_par(doc, "", S["body"])

    # ---- 发文字号 + 红色反线 ----
    if AST.get("doc_number"):
        line_border = None
        if red.get("has_red_line", True):
            line_border = (12, red["color_hex"])   # sz=12 -> 1.5pt 红色下边框
        add_par(doc, AST["doc_number"], doc_num_style, border=line_border)
        # 反线以下留白
        add_par(doc, "", S["body"])
        add_par(doc, "", S["body"])
    elif red.get("has_red_line", True) and has_red_header:
        add_par(doc, "", doc_num_style, border=(12, red["color_hex"]))
        add_par(doc, "", S["body"])

    # ---- 标题 ----
    if AST.get("title"):
        add_par(doc, AST["title"], S["title"])
        add_par(doc, "", S["body"])

    # ---- 主送机关 ----
    if AST.get("recipient"):
        add_par(doc, AST["recipient"], S["recipient"], indent_chars=0.0)

    # ---- 正文块 ----
    block_style_map = {
        "heading_1": S["heading_1"],
        "heading_2": S["heading_2"],
        "heading_3": S["heading_3"],
        "body": S["body"],
    }
    for blk in AST.get("blocks", []):
        btype = blk.get("type", "body")
        st = block_style_map.get(btype, S["body"])
        text = blk.get("text") or ""
        if text:
            add_par(doc, text, st)
        elif blk.get("rows"):
            for row in blk["rows"]:
                add_par(doc, "".join(str(c) for c in row), S["body"])

    # ---- 附件说明 ----
    for att in AST.get("attachments", []) or []:
        att_text = att if isinstance(att, str) else att.get("text", "")
        if att_text:
            add_par(doc, att_text, S["body"])

    # ---- 落款：空二行 + 署名 + 日期 ----
    add_par(doc, "", S["body"])
    add_par(doc, "", S["body"])

    if AST.get("signature"):
        add_par(doc, AST["signature"], S["signature"], right_chars=2.0)
    if AST.get("date"):
        add_par(doc, AST["date"], S["date"], right_chars=4.0)

    # ---- 页脚页码 ----
    if page.get("show_page_number", True):
        footer = sec.footer
        footer.is_linked_to_previous = False
        for p in list(footer.paragraphs):
            p._p.getparent().remove(p._p)
        footer._element.append(parse_xml(build_footer_xml()))

    doc.save("output.docx")


if __name__ == "__main__":
    main()

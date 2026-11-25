from zipfile import ZipFile
from docx import Document
from docx.shared import Mm
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from engine.ooxml_extractor import extract
from engine.doc_converter import convert


def attr(parent, tag, **values):
    e = OxmlElement("w:" + tag)
    for k, v in values.items():
        e.set(qn("w:" + k), str(v))
    parent.append(e)
    return e


def fixture(path):
    d = Document()
    s = d.sections[0]
    s.top_margin = Mm(31)
    s.bottom_margin = Mm(29)
    s.left_margin = Mm(24)
    s.right_margin = Mm(23)
    for text, font, size, line, indent, align in [
        ("关于测试的通知", "黑体", 24, 30, 0, "center"),
        ("正文中英 ABC 测试。", "仿宋_GB2312", 16, 28, 200, "both"),
    ]:
        p = d.add_paragraph()
        pp = p._p.get_or_add_pPr()
        attr(pp, "jc", val=align)
        attr(pp, "spacing", line=line * 20, lineRule="exact")
        attr(pp, "ind", firstLineChars=indent)
        for value in [text, "x"]:
            r = p.add_run(value)
            rp = r._r.get_or_add_rPr()
            attr(rp, "rFonts", eastAsia=font if value != "x" else "宋体", ascii="Times New Roman")
            attr(rp, "sz", val=size * 2)
    d.save(path)
    return path


def test_direct_formatting_trap(tmp_path):
    p = extract(fixture(tmp_path / "trap.docx"), "trap", tmp_path / "templates")
    for side, v in [("top", 31), ("bottom", 29), ("left", 24), ("right", 23)]:
        assert abs(getattr(p.page, "margin_" + side + "_mm") - v) < 0.02
    for role, font, size, line, indent in [
        ("title", "黑体", 24, 30, 0),
        ("body", "仿宋_GB2312", 16, 28, 2),
    ]:
        s = p.styles[role]
        assert (
            s.font_cn,
            s.font_en,
            s.font_size_pt,
            s.line_spacing_value,
            s.first_line_indent_chars,
        ) == (font, "Times New Roman", size, line, indent)
    with ZipFile(p.base_template_path) as z:
        assert b"ABC" not in z.read("word/document.xml")


def test_real_binary_doc(tmp_path):
    source = fixture(tmp_path / "legacy.docx")
    legacy = convert(source, tmp_path / "doc", "doc")
    assert legacy.read_bytes()[:8] == bytes.fromhex("D0CF11E0A1B11AE1")
    p = extract(legacy, "legacy", tmp_path / "templates")
    assert p.styles["body"].font_size_pt == 16
    assert p.styles["title"].font_cn == "黑体"


def test_recursive_style_cascade(tmp_path):
    d = Document()
    normal = d.styles["Normal"]
    attr(normal.element.get_or_add_rPr(), "rFonts", eastAsia="楷体_GB2312", ascii="Arial")
    parent = d.styles.add_style("Parent", 1)
    parent.base_style = normal
    attr(parent.element.get_or_add_pPr(), "spacing", line=640, lineRule="exact")
    child = d.styles.add_style("Child", 1)
    child.base_style = parent
    attr(child.element.get_or_add_rPr(), "sz", val=30)
    p = d.add_paragraph("继承正文内容", style=child)
    attr(p._p.get_or_add_pPr(), "ind", firstLineChars=300)
    d.add_paragraph("大标题").runs[0].font.size = __import__("docx").shared.Pt(24)
    d.save(tmp_path / "cascade.docx")
    profile = extract(tmp_path / "cascade.docx", "cascade", tmp_path / "t")
    s = profile.styles["body"]
    assert (
        s.font_cn,
        s.font_en,
        s.font_size_pt,
        s.line_spacing_value,
        s.first_line_indent_chars,
    ) == ("楷体_GB2312", "Arial", 15, 32, 3)


def test_docdefaults_and_absent_indent(tmp_path):
    d = Document()
    defaults = d.styles.element.find(qn("w:docDefaults"))
    rp = defaults.find(qn("w:rPrDefault")).find(qn("w:rPr"))
    for child in list(rp):
        rp.remove(child)
    attr(rp, "rFonts", eastAsia="宋体", ascii="Arial")
    attr(rp, "sz", val=28)
    p = d.add_paragraph("没有指定缩进的正文")
    p.add_run(" English")
    d.add_paragraph("标题").runs[0].font.size = __import__("docx").shared.Pt(24)
    d.save(tmp_path / "defaults.docx")
    profile = extract(tmp_path / "defaults.docx", "defaults", tmp_path / "t")
    assert profile.styles["body"].font_cn == "宋体"
    assert profile.styles["body"].font_en == "Arial"
    assert profile.styles["body"].font_size_pt == 14
    assert profile.styles["body"].first_line_indent_chars == 0


def test_zip_without_word_document_is_rejected(tmp_path):
    import pytest

    source = tmp_path / "ordinary.docx"
    with ZipFile(source, "w") as archive:
        archive.writestr("example.txt", "ordinary ZIP")
    with pytest.raises(ValueError, match="word/document.xml"):
        extract(source, "ordinary zip", tmp_path / "templates")

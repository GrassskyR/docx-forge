from zipfile import ZipFile, ZIP_DEFLATED
from lxml import etree as E
import pytest
from engine.renderer import render
from engine.linter import lint
from engine.schemas import DocContentAST, Block
from engine.defaults import national_profile

N = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
W = "{" + N["w"] + "}"


@pytest.fixture
def rendered(tmp_path):
    p = national_profile()
    p.red_header.enabled = True
    p.red_header.org_name = "测试机关"
    ast = DocContentAST(
        title="关于测试的通知",
        doc_number="测〔2026〕1号",
        recipient="各部门：",
        blocks=[
            Block(type="heading_1", text="一、工作要求"),
            Block(type="body", text="正文 English 混排。"),
            Block(type="table", rows=[["项目", "值"], ["甲", "乙"]]),
        ],
        signature="测试单位",
        date="2026年11月24日",
    )
    return render(ast, p, tmp_path / "out.docx"), p


def test_render_compliant(rendered):
    path, p = rendered
    report = lint(path, p)
    assert report.passed, report.model_dump()
    assert report.score == 100 and report.checked > 100


@pytest.mark.parametrize(
    "kind,xpath,attr,value,field",
    [
        ("cn", ".//w:rFonts", "eastAsia", "错误字体", "font_eastAsia"),
        ("en", ".//w:rFonts", "ascii", "Arial", "font_ascii"),
        ("size", ".//w:sz", "val", "10", "font_size_pt"),
        ("line", ".//w:pPr/w:spacing", "line", "999", "line_spacing_value"),
        ("indent", ".//w:ind", "firstLineChars", "900", "first_line_indent_chars"),
        ("margin", ".//w:pgMar", "top", "100", "page.margin_top_mm"),
        ("align", ".//w:jc", "val", "left", "alignment"),
        ("bold", ".//w:rPr/w:b", "val", "1", "bold"),
    ],
)
def test_eight_corruptions(rendered, kind, xpath, attr, value, field):
    path, p = rendered
    with ZipFile(path) as z:
        entries = {n: z.read(n) for n in z.namelist()}
    root = E.fromstring(entries["word/document.xml"])
    node = root.find(xpath, N)
    assert node is not None
    node.set(W + attr, value)
    entries["word/document.xml"] = E.tostring(root)
    with ZipFile(path, "w", ZIP_DEFLATED) as z:
        for n, v in entries.items():
            z.writestr(n, v)
    report = lint(path, p)
    assert not report.passed
    assert any(v.field == field for v in report.violations), report.model_dump()


def test_styles_xml_effective_inheritance_is_audited(rendered):
    path, p = rendered
    with ZipFile(path) as z:
        entries = {n: z.read(n) for n in z.namelist()}
    doc = E.fromstring(entries["word/document.xml"])
    styles = E.fromstring(entries["word/styles.xml"])
    body = doc.xpath('.//w:p[w:pPr/w:pStyle[@w:val="gw_body"]]', namespaces=N)[0]
    style = styles.xpath('./w:style[@w:styleId="gw_body"]', namespaces=N)[0]
    rp = body.find("w:r/w:rPr", N)
    style.append(rp)
    entries["word/document.xml"] = E.tostring(doc)
    entries["word/styles.xml"] = E.tostring(styles)
    with ZipFile(path, "w", ZIP_DEFLATED) as z:
        for n, v in entries.items():
            z.writestr(n, v)
    assert lint(path, p).passed
    style.find("w:rPr/w:rFonts", N).set(W + "eastAsia", "篡改样式字体")
    entries["word/styles.xml"] = E.tostring(styles)
    with ZipFile(path, "w", ZIP_DEFLATED) as z:
        for n, v in entries.items():
            z.writestr(n, v)
    report = lint(path, p)
    assert not report.passed
    assert any(v.field == "font_eastAsia" for v in report.violations)


def test_footer_page_field_structure_and_fonts(rendered):
    path, _ = rendered
    with ZipFile(path) as z:
        footer = E.fromstring(z.read("word/footer1.xml"))
        styles = E.fromstring(z.read("word/styles.xml"))
    assert footer.find("w:p/w:fldSimple", N) is not None
    assert not footer.findall(".//w:r/w:fldSimple", N)
    assert footer.find("w:p/w:pPr/w:jc", N).get(W + "val") == "center"
    for run in footer.findall(".//w:r", N):
        fonts = run.find("w:rPr/w:rFonts", N)
        assert fonts is not None
        assert fonts.get(W + "eastAsia") == "宋体" and fonts.get(W + "ascii") == "Times New Roman"
    assert styles.xpath('./w:style[@w:styleId="gw_page_number"]', namespaces=N)


def test_red_header_uses_known_signature_or_requests_org(tmp_path):
    p = national_profile()
    p.red_header.enabled = True
    with pytest.raises(ValueError, match="红头已启用"):
        render(DocContentAST(title="通知"), p, tmp_path / "missing.docx")
    path = render(
        DocContentAST(title="通知", signature="综合办公室"), p, tmp_path / "fallback.docx"
    )
    assert lint(path, p).passed
    with ZipFile(path) as z:
        xml = z.read("word/document.xml").decode()
    assert xml.count("综合办公室") == 2


def mutate_document(path, edit):
    """Simulate an external Word editor changing the serialized package."""
    with ZipFile(path) as package:
        entries = {name: package.read(name) for name in package.namelist()}
    edit(entries)
    with ZipFile(path, "w", ZIP_DEFLATED) as package:
        for name, payload in entries.items():
            package.writestr(name, payload)


def test_raw_justification_and_dual_indentation(rendered):
    path, profile = rendered

    def edit(entries):
        document = E.fromstring(entries["word/document.xml"])
        for role in ("body", "heading_1", "recipient"):
            paragraph = document.xpath(
                ".//w:p[w:pPr/w:pStyle[@w:val=$style]]", namespaces=N, style=f"gw_{role}"
            )[0]
            properties = paragraph.find("w:pPr", N)
            indentation = properties.find("w:ind", N)
            style = profile.styles[role]
            assert indentation.get(W + "firstLineChars") == str(
                round(style.first_line_indent_chars * 100)
            )
            assert indentation.get(W + "firstLine") == str(
                round(style.first_line_indent_chars * style.font_size_pt * 20)
            )
            if role == "body":
                alignment = properties.find("w:jc", N)
                assert alignment.get(W + "val") == "both"
                alignment.set(W + "val", "justify")
                indentation.attrib.pop(W + "firstLine")
        entries["word/document.xml"] = E.tostring(document)

    mutate_document(path, edit)
    report = lint(path, profile)
    assert report.passed is False
    violations = report.violations
    assert any(
        item.field == "alignment" and item.expected == "both" and item.actual == "justify"
        for item in violations
    )
    assert any(item.field == "first_line_indent_twips" for item in violations)


def damage_docx(path):
    """Exercise all targeted repair families using a real serialized package."""

    def edit(entries):
        document = E.fromstring(entries["word/document.xml"])
        body = document.find("w:body", N)
        for role in ("gw_red_header",):
            paragraph = body.xpath(".//w:p[w:pPr/w:pStyle[@w:val=$role]]", namespaces=N, role=role)[
                0
            ]
            body.remove(paragraph)
        border = body.find(".//w:pBdr", N)
        border.getparent().remove(border)
        paragraph = body.xpath('.//w:p[w:pPr/w:pStyle[@w:val="gw_body"]]', namespaces=N)[0]
        paragraph.find("w:r/w:t", N).text = "修复前由外部编辑保留的正文"
        for query, attribute, value in (
            ("w:pPr/w:jc", "val", "justify"),
            ("w:pPr/w:ind", "firstLine", "0"),
            ("w:pPr/w:ind", "firstLineChars", "0"),
            ("w:pPr/w:spacing", "line", "120"),
            ("w:pPr/w:spacing", "lineRule", "auto"),
            ("w:r/w:rPr/w:rFonts", "eastAsia", "Wrong"),
            ("w:r/w:rPr/w:rFonts", "ascii", "Wrong"),
            ("w:r/w:rPr/w:sz", "val", "8"),
            ("w:r/w:rPr/w:b", "val", "1"),
            ("w:r/w:rPr/w:i", "val", "1"),
            ("w:r/w:rPr/w:color", "val", "222222"),
        ):
            paragraph.find(query, N).set(W + attribute, value)
        properties = paragraph.find("w:r/w:rPr", N)
        properties.remove(properties.find("w:szCs", N))
        body.find("w:sectPr/w:pgMar", N).set(W + "right", "123")
        body.find("w:sectPr/w:pgSz", N).set(W + "w", "456")
        footer = E.fromstring(entries["word/footer1.xml"])
        footer.remove(footer.find("w:p[w:fldSimple]", N))
        entries["word/footer1.xml"] = E.tostring(footer)
        entries["word/document.xml"] = E.tostring(document)

    mutate_document(path, edit)


def test_real_targeted_repair_preserves_external_text(rendered, tmp_path):
    from engine.repair import repair_docx

    path, profile = rendered
    damage_docx(path)
    damaged_bytes = path.read_bytes()
    before = lint(path, profile)
    assert not before.passed and len(before.violations) >= 16
    repaired = repair_docx(path, profile, before.violations, tmp_path / "repaired.docx")
    after = lint(repaired, profile)
    assert after.passed and after.violations == [], after.model_dump()
    with ZipFile(repaired) as package:
        assert "修复前由外部编辑保留的正文" in package.read("word/document.xml").decode()
    assert path.read_bytes() == damaged_bytes


def test_numpages_does_not_satisfy_page_requirement(rendered):
    path, profile = rendered

    def edit(entries):
        footer = E.fromstring(entries["word/footer1.xml"])
        footer.find("w:p/w:fldSimple", N).set(W + "instr", "NUMPAGES")
        entries["word/footer1.xml"] = E.tostring(footer)

    mutate_document(path, edit)
    report = lint(path, profile)
    assert not report.passed
    assert any(item.field == "page.show_page_number" for item in report.violations)

"""Independent gold authoring: no engine/extractor/renderer imports."""

from pathlib import Path
import json
import tempfile
import subprocess
from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

ROOT = Path(__file__).resolve().parent
ROLES = ["title", "heading_1", "heading_2", "heading_3", "body", "recipient", "signature", "date"]


def node(parent, tag: str, **attributes):
    element = OxmlElement("w:" + tag)
    for attribute, value in attributes.items():
        element.set(qn("w:" + attribute), str(value))
    parent.append(element)
    return element


def build():
    folder = ROOT / "fixtures"
    folder.mkdir(exist_ok=True)
    for category in range(5):
        for variation in range(4):
            index = category * 4 + variation
            id = f"{index+1:02d}"
            kind = ["notice", "request", "minutes", "custom", "direct"][category]
            page = {
                "margin_top_mm": 37.0,
                "margin_bottom_mm": 35.0,
                "margin_left_mm": 28.0,
                "margin_right_mm": 26.0,
                "show_page_number": variation in (0, 1, 3),
                "size": "A4",
            }
            if category >= 3:
                page.update(
                    margin_top_mm=25.0 + variation,
                    margin_bottom_mm=24.0 + variation,
                    margin_left_mm=22.0,
                    margin_right_mm=21.0,
                )
            specs = {
                role: {
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
                    "space_after_pt": 0.0,
                }
                for role in ROLES
            }
            specs["title"].update(
                font_cn="方正小标宋简体",
                font_size_pt=22.0,
                alignment="center",
                first_line_indent_chars=0.0,
            )
            specs["heading_1"]["font_cn"] = "黑体"
            specs["heading_2"]["font_cn"] = "楷体_GB2312"
            for role in ("recipient", "signature", "date"):
                specs[role].update(
                    first_line_indent_chars=0.0,
                    alignment="left" if role == "recipient" else "right",
                )
            if category < 3:
                specs["body"]["line_spacing_value"] = (28.0, 30.0, 26.0, 29.0)[variation]
                specs["title"]["space_after_pt"] = (0.0, 4.0, 8.0, 2.0)[variation]
                if category == 1:
                    specs["heading_1"]["space_before_pt"] = 6.0
                if category == 2:
                    specs["heading_2"]["bold"] = True
            if category >= 3:
                for role in ROLES:
                    specs[role].update(
                        font_en=("Arial", "Cambria", "Calibri", "Times New Roman")[variation],
                        line_spacing_value=24.0 + variation,
                        font_size_pt=14.0 if role != "title" else 24.0,
                        first_line_indent_chars=1.0 if role == "body" else 0.0,
                    )
                specs["body"]["font_cn"] = ("宋体", "黑体", "楷体_GB2312", "宋体")[variation]
                if category == 3:
                    specs["title"]["alignment"] = "left"
                specs["heading_1"]["bold"] = True
                specs["heading_2"]["italic"] = True
            document = Document()
            sect = document.sections[0]._sectPr
            for tag in ("pgSz", "pgMar"):
                for x in sect.findall(qn("w:" + tag)):
                    sect.remove(x)
            node(sect, "pgSz", w=11906, h=16838)
            node(
                sect,
                "pgMar",
                **{
                    k: round(page["margin_" + k + "_mm"] * 1440 / 25.4)
                    for k in ("top", "bottom", "left", "right")
                },
            )

            if page["show_page_number"]:
                footer = document.sections[0].footer.paragraphs[0]
                footer.add_run("— ")
                if variation == 3:
                    field = footer.add_run()
                    node(field._r, "fldChar", fldCharType="begin")
                    instruction = node(footer.add_run()._r, "instrText")
                    instruction.text = " PAGE "
                    node(footer.add_run()._r, "fldChar", fldCharType="separate")
                    footer.add_run("1")
                    node(footer.add_run()._r, "fldChar", fldCharType="end")
                else:
                    node(footer._p, "fldSimple", instr="PAGE")
                footer.add_run(" —")

            def style_into(pp, rp, s):
                node(pp, "jc", val="both" if s["alignment"] == "justify" else s["alignment"])
                node(
                    pp,
                    "spacing",
                    line=round(s["line_spacing_value"] * 20),
                    lineRule="atLeast" if category == 4 else "exact",
                    before=round(s["space_before_pt"] * 20),
                    after=round(s["space_after_pt"] * 20),
                )
                node(
                    pp,
                    "ind",
                    firstLineChars=round(s["first_line_indent_chars"] * 100),
                    firstLine=round(s["first_line_indent_chars"] * s["font_size_pt"] * 20),
                )
                node(
                    rp,
                    "rFonts",
                    eastAsia=s["font_cn"],
                    ascii=s["font_en"],
                    hAnsi=s["font_en"],
                    cs=s["font_en"],
                )
                node(rp, "sz", val=round(s["font_size_pt"] * 2))
                node(rp, "b", val=int(s["bold"]))
                node(rp, "i", val=int(s["italic"]))
                node(rp, "color", val=s["color_hex"])

            if category != 4:
                for role, spec in specs.items():
                    parent = document.styles.add_style("GoldBase_" + role, 1)
                    parent.base_style = document.styles["Normal"]
                    style_into(
                        parent.element.get_or_add_pPr(), parent.element.get_or_add_rPr(), spec
                    )
                    child = document.styles.add_style("Gold_" + role, 1)
                    child.base_style = parent

            def paragraph(text, role, spec=None):
                p = document.add_paragraph()
                if category == 4 or spec:
                    r = p.add_run(text)
                    style_into(p._p.get_or_add_pPr(), r._r.get_or_add_rPr(), spec or specs[role])
                    if category == 4 and role in (
                        "title",
                        "body",
                        "heading_1",
                        "heading_2",
                        "heading_3",
                    ):
                        # Incorrect short run must lose the weighted mode to real content.
                        r = p.add_run("x")
                        node(
                            r._r.get_or_add_rPr(),
                            "rFonts",
                            eastAsia="错误短Run",
                            ascii="Courier New",
                        )
                else:
                    p.style = document.styles["Gold_" + role]
                    p.add_run(text)
                return p

            red = category == 0
            number_font = ("方正仿宋_GBK", "宋体", "楷体_GB2312", "仿宋_GB2312")[variation]
            number_size = (16.0, 15.0, 14.0, 16.0)[variation]
            if red:
                redspec = dict(
                    specs["title"], font_cn="方正小标宋简体", font_size_pt=36.0, color_hex="FF0000"
                )
                paragraph("测试机关文件", "red_header", redspec)
                number_spec = dict(specs["title"], font_cn=number_font, font_size_pt=number_size)
                paragraph(f"测发〔2026〕{variation + 1}号", "doc_number", number_spec)
                p = document.add_paragraph()
                node(
                    node(p._p.get_or_add_pPr(), "pBdr"),
                    "bottom",
                    val="single",
                    sz=12,
                    color="FF0000",
                )
            title = {
                "notice": "关于开展业务培训的通知",
                "request": "关于建设信息平台的请示",
                "minutes": "专项工作会议纪要",
                "custom": "关于企业内部工作安排的通知",
                "direct": "关于中英混排 ABC 工作的通知",
            }[kind]
            subjects = ("档案归档", "安全检查", "年度培训", "项目验收")
            paragraph(f"{title}（{subjects[variation]}）", "title")
            paragraph("各部门：", "recipient")
            paragraph("一、主要工作", "heading_1")
            paragraph("（一）具体安排", "heading_2")
            paragraph("1. 实施步骤", "heading_3")
            paragraph(
                "请各部门严格落实工作要求，做好组织协调。English mixed content for review.", "body"
            )
            paragraph(
                f"请围绕{subjects[variation]}落实各项安排，按要求填写办理情况并报送承办部门。",
                "body",
            )
            if category == 2:
                table = document.add_table(rows=2, cols=2)
                for row, values in zip(table.rows, [["议题", "决定"], ["平台建设", "按期实施"]]):
                    for cell, value in zip(row.cells, values):
                        p = cell.paragraphs[0]
                        p.style = document.styles["Gold_body"]
                        p.add_run(value)
            paragraph("测试单位", "signature")
            paragraph("2026年11月24日", "date")
            expected = {"page." + k: v for k, v in page.items()}
            expected.update(
                {
                    "styles." + role + "." + field: value
                    for role, spec in specs.items()
                    for field, value in spec.items()
                }
            )
            expected["red_header.enabled"] = red
            if red:
                expected.update(
                    {
                        "red_header.org_name": "测试机关文件",
                        "red_header.font_cn": "方正小标宋简体",
                        "red_header.font_size_pt": 36.0,
                        "red_header.color_hex": "FF0000",
                        "red_header.has_red_line": True,
                        "red_header.doc_number_font_cn": number_font,
                        "red_header.doc_number_size_pt": number_size,
                    }
                )
            extension = "doc" if variation == 3 else "docx"
            with tempfile.TemporaryDirectory() as temp:
                source = Path(temp) / (id + ".docx")
                document.save(source)
                if extension == "doc":
                    with tempfile.TemporaryDirectory() as lo:
                        subprocess.run(
                            [
                                "soffice",
                                f"-env:UserInstallation={Path(lo).as_uri()}",
                                "--headless",
                                "--convert-to",
                                "doc",
                                "--outdir",
                                str(folder),
                                str(source),
                            ],
                            check=True,
                            capture_output=True,
                            timeout=90,
                        )
                    assert (folder / (id + ".doc")).read_bytes()[:8] == bytes.fromhex(
                        "D0CF11E0A1B11AE1"
                    )
                else:
                    (folder / (id + ".docx")).write_bytes(source.read_bytes())
            (folder / (id + ".json")).write_text(
                json.dumps(
                    {
                        "id": id,
                        "category": kind,
                        "file": id + "." + extension,
                        "expected_assertions": expected,
                    },
                    ensure_ascii=False,
                    indent=2,
                )
            )
    assert (
        len(list(folder.glob("*.docx"))) == 15
        and len(list(folder.glob("*.doc"))) == 5
        and len(list(folder.glob("*.json"))) == 20
    )
    print("Gold fixtures: 15 DOCX + 5 real binary DOC + 20 ground truth JSON")


if __name__ == "__main__":
    build()

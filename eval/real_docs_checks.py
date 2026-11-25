"""Assertions and round trips for the hash-locked public-document corpus."""

import json
import re
from hashlib import sha256
from pathlib import Path
from zipfile import ZipFile

from lxml import etree

from engine.doc_converter import preview
from engine.linter import lint
from engine.nl_parser import flatten
from engine.ooxml_extractor import extract
from engine.renderer import render
from engine.schemas import Block, DocContentAST

CORPUS = Path(__file__).resolve().parent / "real_docs"
NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
SPECIAL = {
    "real_01": {
        "red_header.has_red_line": True,
        "red_header.org_name": "中共成都体育学院委员会\n处（室）文件\n成都体育学院",
        "red_header.doc_number_font_cn": "方正仿宋_GBK",
        "red_header.doc_number_size_pt": 16.0,
    },
    "real_02": {
        "red_header.enabled": False,
        "red_header.doc_number_font_cn": "方正仿宋_GBK",
        "red_header.doc_number_size_pt": 16.0,
    },
    "real_03": {"red_header.has_red_line": True},
    "real_04": {"red_header.org_name": "中国传媒大学XXX学院(部门）\nXX会会议纪要"},
    "real_05": {"red_header.has_red_line": True},
    "real_06": {"styles.body.line_spacing_rule": "exact", "styles.body.line_spacing_value": 28.0},
    "real_13": {"styles.title.font_cn": "方正小标宋简体", "styles.title.font_size_pt": 22.0},
}
NOTICE = DocContentAST(
    doc_type="notice",
    title="关于开展档案归档检查的通知",
    recipient="各部门：",
    red_header_org="综合办公室",
    doc_number="综办〔2026〕12号",
    blocks=[
        Block(type="heading_1", text="一、检查安排"),
        Block(type="body", text="请各部门核对纸质与电子档案目录，整理归档清单并反馈检查结果。"),
    ],
    signature="综合办公室",
    date="2026年11月24日",
)


def manifest() -> list[dict]:
    entries = json.loads((CORPUS / "manifest.json").read_text())
    assert len(entries) == len({entry["file"] for entry in entries}) == 16
    assert set(path.name for path in CORPUS.glob("*.doc*")) == {entry["file"] for entry in entries}
    return entries


def verify_locked_file(entry: dict) -> Path:
    source = CORPUS / entry["file"]
    payload = source.read_bytes()
    assert len(payload) == entry["size_bytes"], source.name
    assert payload[:8].hex().upper() == entry["magic_hex"], source.name
    assert sha256(payload).hexdigest() == entry["sha256"], source.name
    return source


def twips(millimeters: float) -> int:
    return round(millimeters * 1440 / 25.4)


def verify_empty_template(path: str) -> None:
    with ZipFile(path) as archive:
        body = etree.fromstring(archive.read("word/document.xml")).find("w:body", NS)
        assert [etree.QName(node).localname for node in body] == ["sectPr"]
        for name in archive.namelist():
            if re.fullmatch(
                r"word/(?:(?:header|footer)\d+|comments|footnotes|endnotes)\.xml", name
            ):
                root = etree.fromstring(archive.read(name))
                assert not root.xpath(".//w:t/text() | .//w:instrText/text()", namespaces=NS), name


def run_real_doc(entry: dict, folder: Path) -> dict:
    source = verify_locked_file(entry)
    profile = extract(source, source.stem, folder / "templates")
    fields = flatten(profile.model_dump())
    fonts = {name: value for name, value in fields.items() if name.endswith(("font_cn", "font_en"))}
    assert fonts and all(value and ";" not in value for value in fonts.values()), fonts

    assertions = []
    expected_fields = {
        k: value for k, value in entry["observed_facts"].items() if k.startswith("page.")
    }
    expected_fields.update(SPECIAL.get(source.name[:7], {}))
    for field, expected in expected_fields.items():
        actual = fields[field]
        if field.endswith("_mm"):
            expected, actual = twips(expected), twips(actual)
        assertions.append(
            {"field": field, "expected": expected, "actual": actual, "passed": expected == actual}
        )
    assert all(item["passed"] for item in assertions), (source.name, assertions)

    verify_empty_template(profile.base_template_path)
    output = render(NOTICE, profile, folder / "document.docx")
    report = lint(output, profile)
    assert report.passed, (source.name, report.model_dump())
    images = preview(output, folder)
    assert images and all(image.read_bytes().startswith(b"\x89PNG\r\n\x1a\n") for image in images)
    return {
        "file": source.name,
        "actual_format": entry["actual_format"],
        "sha256": entry["sha256"],
        "font_names_checked": len(fonts),
        "assertions": assertions,
        "template_stripped": True,
        "lint_report": report.model_dump(),
        "preview": [str(image) for image in images],
    }

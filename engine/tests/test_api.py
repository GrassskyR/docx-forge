from fastapi.testclient import TestClient
from engine.api import create_app
from engine.tests.test_extractor import fixture


def test_all_endpoints(tmp_path):
    c = TestClient(create_app(tmp_path / "data", use_llm=False))
    assert c.get("/").status_code == 200
    assert all(c.get("/health").json()[k] for k in ("libreoffice", "pdftoppm"))
    initial = c.get("/api/profiles").json()
    id = initial["active_profile_id"]
    assert c.get("/api/profiles/" + id).json()["id"] == id
    path = fixture(tmp_path / "upload.docx")
    with path.open("rb") as f:
        r = c.post(
            "/api/profiles/extract", files={"file": ("upload.docx", f)}, data={"name": "导入"}
        )
    assert r.status_code == 200, r.text
    imported = r.json()
    assert imported["base_template_path"]
    r = c.post("/api/profiles/from-nl", json={"instruction": "正文四号黑体", "name": "规则预设"})
    assert r.status_code == 200, r.text
    parsed = r.json()
    assert parsed["profile"]["styles"]["body"]["font_size_pt"] == 14
    child = c.post(
        "/api/profiles/" + id + "/fork",
        json={"name": "派生", "patch_instruction": "标题小二号黑体"},
    ).json()
    assert child["styles"]["title"]["font_size_pt"] == 18
    assert c.put("/api/profiles/active", json={"profile_id": child["id"]}).status_code == 200
    ast = {
        "title": "验收通知",
        "blocks": [{"type": "body", "text": "真实文件上传、渲染、审计与预览。"}],
    }
    r = c.post("/api/documents/render", json={"content_ast": ast})
    assert r.status_code == 200, r.text
    result = r.json()
    assert result["lint_report"]["passed"] and result["preview_urls"]
    assert c.get(result["docx_url"]).content[:2] == b"PK"
    assert c.get(result["preview_urls"][0]).content[:8] == b"\x89PNG\r\n\x1a\n"
    assert c.post(
        "/api/documents/lint", json={"docx_path": result["docx_path"], "profile_id": child["id"]}
    ).json()["passed"]
    with open(result["docx_path"], "rb") as f:
        assert c.post(
            "/api/documents/lint",
            files={"file": ("output.docx", f)},
            data={"profile_id": child["id"]},
        ).json()["passed"]
    assert (
        TestClient(create_app(tmp_path / "data", False))
        .get("/api/profiles")
        .json()["active_profile_id"]
        == child["id"]
    )
    assert c.get("/api/profiles/missing").status_code == 404
    assert (
        c.post(
            "/api/profiles/" + id + "/fork", json={"name": "bad", "patch_json": {"id": "x"}}
        ).status_code
        == 422
    )


def test_repair_endpoint_reaudits_source_and_returns_real_preview(tmp_path):
    from pathlib import Path
    from zipfile import ZipFile

    from engine.tests.test_renderer_and_linter import damage_docx

    client = TestClient(create_app(tmp_path / "data", use_llm=False))
    profile_id = client.get("/api/profiles").json()["active_profile_id"]
    profile = client.post(
        f"/api/profiles/{profile_id}/fork",
        json={
            "name": "Repair",
            "patch_json": {"red_header": {"enabled": True, "org_name": "测试机关"}},
        },
    ).json()
    rendered = client.post(
        "/api/documents/render",
        json={
            "profile_id": profile["id"],
            "content_ast": {"title": "原始标题", "blocks": [{"type": "body", "text": "原始正文"}]},
        },
    ).json()
    assert rendered["lint_report"]["passed"]
    path = Path(rendered["docx_path"])
    damage_docx(path)
    damaged = path.read_bytes()
    before = client.post(
        "/api/documents/lint", json={"profile_id": profile["id"], "docx_path": str(path)}
    ).json()
    assert not before["passed"] and len(before["violations"]) >= 16
    request = {
        "docx_path": str(path),
        "effective_profile": rendered["effective_profile"],
        "repair_violations": before["violations"],
    }
    stale = client.post("/api/documents/repair", json={**request, "repair_violations": []})
    assert stale.status_code == 409
    reply = client.post("/api/documents/repair", json=request)
    assert reply.status_code == 200, reply.text
    result = reply.json()
    assert result["lint_before"] == before
    assert result["lint_report"]["passed"] and not result["lint_report"]["violations"]
    assert client.get(result["preview_urls"][0]).content.startswith(b"\x89PNG")
    assert path.read_bytes() == damaged
    with ZipFile(result["docx_path"]) as repaired:
        assert "修复前由外部编辑保留的正文".encode() in repaired.read("word/document.xml")


def test_render_returns_structured_ast_guidance(tmp_path):
    client = TestClient(create_app(tmp_path, use_llm=False))
    cases = [
        ({"content_ast": {"title": "  "}}, "title.count"),
        (
            {"content_ast": {"title": "通知"}, "overrides": {"red_header": {"enabled": True}}},
            "red_header_org",
        ),
    ]
    for payload, field in cases:
        response = client.post("/api/documents/render", json=payload)
        assert response.status_code == 422
        detail = response.json()["detail"]
        assert detail["code"] == "ast_structure" and detail["field"] == field
        assert detail["guidance"]

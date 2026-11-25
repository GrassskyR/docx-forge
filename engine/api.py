from pathlib import Path
from uuid import uuid4
import shutil
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Body, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from .schemas import DocContentAST, FormatProfile, LintReport, Violation
from .store import Store, merge
from .nl_parser import parse
from .ooxml_extractor import extract
from .renderer import ContentError, render
from .repair import repair_docx
from .linter import lint
from .doc_converter import preview

ROOT = Path(__file__).resolve().parents[1]


class NLRequest(BaseModel):
    instruction: str
    name: str
    base_profile_id: str | None = None


class ForkRequest(BaseModel):
    name: str
    patch_instruction: str | None = None
    patch_json: dict | None = None


class RenderRequest(BaseModel):
    content_ast: DocContentAST
    profile_id: str | None = None
    overrides: dict = Field(default_factory=dict)


class RepairRequest(BaseModel):
    docx_path: str
    effective_profile: FormatProfile
    repair_violations: list[Violation]


def create_app(data_dir=None, use_llm=None):
    data = Path(data_dir or ROOT / "data")
    data.mkdir(parents=True, exist_ok=True)
    store = Store(data / "profiles.db")
    app = FastAPI(title="智能公文 Agent")
    app.state.store = store

    @app.exception_handler(KeyError)
    async def not_found(request, exc):
        return JSONResponse(status_code=404, content={"detail": "资源不存在"})

    @app.exception_handler(ValueError)
    async def bad_request(request, exc):
        return JSONResponse(status_code=422, content={"detail": str(exc)})

    @app.get("/health")
    def health():
        with store.connect() as database:
            database.execute("SELECT 1")
        return {
            "service": "ok",
            "sqlite": "ok",
            "libreoffice": bool(shutil.which("soffice")),
            "pdftoppm": bool(shutil.which("pdftoppm")),
        }

    @app.get("/api/profiles")
    def profiles():
        return {"profiles": store.list(), "active_profile_id": store.active_id}

    @app.get("/api/profiles/{profile_id}")
    def profile(profile_id: str):
        return store.get(profile_id)

    @app.post("/api/profiles/extract")
    async def imported(file: UploadFile = File(...), name: str = Form(...)):
        suffix = Path(file.filename or "").suffix.lower()
        if suffix not in (".doc", ".docx"):
            raise HTTPException(422, "需要 .doc/.docx")
        folder = data / "uploads"
        folder.mkdir(exist_ok=True)
        path = folder / (str(uuid4()) + suffix)
        path.write_bytes(await file.read())
        return store.save(extract(path, name, data / "templates"))

    @app.post("/api/profiles/from-nl")
    def from_nl(payload: NLRequest):
        profile_data, explicit_fields, defaulted_fields = parse(
            payload.instruction,
            payload.name,
            store.get(payload.base_profile_id) if payload.base_profile_id else None,
            use_llm,
        )
        store.save(profile_data)
        return {
            "profile": profile_data,
            "explicit_fields": explicit_fields,
            "defaulted_fields": defaulted_fields,
        }

    @app.post("/api/profiles/{profile_id}/fork")
    def fork(profile_id: str, payload: ForkRequest):
        if payload.patch_json is not None and payload.patch_instruction is not None:
            raise ValueError("只能选择一种微调方式")
        patch = payload.patch_json or {}
        if payload.patch_instruction:
            profile_data, explicit_fields, _ = parse(
                payload.patch_instruction, payload.name, store.get(profile_id), use_llm
            )
            patch = {}
            for field in explicit_fields:
                keys = field.split(".")
                destination = patch
                source = profile_data.model_dump()
                for key in keys[:-1]:
                    destination = destination.setdefault(key, {})
                    source = source[key]
                destination[keys[-1]] = source[keys[-1]]
        if set(patch) - {"page", "styles", "red_header", "description"}:
            raise ValueError("禁止修改预设身份字段")
        return store.fork(profile_id, payload.name, patch)

    @app.put("/api/profiles/active")
    def active(payload: dict = Body(...)):
        store.set_active(payload["profile_id"])
        return {"active_profile_id": store.active_id}

    @app.delete("/api/profiles/{profile_id}")
    def delete(profile_id: str):
        store.delete(profile_id)
        return {"deleted": profile_id}

    def document_response(
        doc_id: str, path: Path, profile: FormatProfile, before: LintReport | None = None
    ) -> dict:
        report = lint(path, profile)
        images = preview(path, path.parent) if report.passed else []
        response = {
            "doc_id": doc_id,
            "docx_path": str(path.resolve()),
            "docx_url": f"/files/documents/{doc_id}/document.docx",
            "preview_urls": [f"/files/documents/{doc_id}/{image.name}" for image in images],
            "lint_report": report,
            "effective_profile": profile,
        }
        if before is not None:
            response["lint_before"] = before
        return response

    @app.post("/api/documents/render")
    def rendered(payload: RenderRequest):
        if set(payload.overrides) - {"page", "styles", "red_header"}:
            raise ValueError("overrides 仅支持格式字段")
        profile = FormatProfile.model_validate(
            merge(store.get(payload.profile_id or store.active_id).model_dump(), payload.overrides)
        )
        doc_id = str(uuid4())
        destination = data / "documents" / doc_id / "document.docx"
        try:
            path = render(payload.content_ast, profile, destination)
        except ContentError as exc:
            raise HTTPException(
                422, {"code": "ast_structure", "field": exc.field, "guidance": str(exc)}
            ) from exc
        return document_response(doc_id, path, profile)

    @app.post("/api/documents/repair")
    def repaired(payload: RepairRequest):
        source = Path(payload.docx_path).resolve()
        if not source.is_relative_to(data.resolve()) or source.suffix.lower() != ".docx":
            raise HTTPException(403, "需要数据目录中的 DOCX 文件")
        if not source.is_file():
            raise HTTPException(404, "待修复文件不存在")
        before = lint(source, payload.effective_profile)
        if before.violations != payload.repair_violations:
            raise HTTPException(409, "文件或格式已变更，请重新审计后提交最新的违规项")
        doc_id = str(uuid4())
        output = data / "documents" / doc_id / "document.docx"
        path = repair_docx(source, payload.effective_profile, before.violations, output)
        return document_response(doc_id, path, payload.effective_profile, before)

    @app.post("/api/documents/lint")
    async def linted(request: Request):
        if "multipart/form-data" in request.headers.get("content-type", ""):
            form = await request.form()
            profile_data = store.get(str(form["profile_id"]))
            folder = data / "uploads"
            folder.mkdir(exist_ok=True)
            path = folder / (str(uuid4()) + ".docx")
            path.write_bytes(await form["file"].read())
        else:
            payload = await request.json()
            profile_data = store.get(payload["profile_id"])
            path = Path(payload["docx_path"]).resolve()
            if not path.is_relative_to(data.resolve()):
                raise HTTPException(403, "文件不在数据目录")
        return lint(path, profile_data)

    @app.get("/")
    def home():
        return FileResponse(ROOT / "web/index.html")

    app.mount("/files", StaticFiles(directory=data), name="files")
    return app


app = create_app()

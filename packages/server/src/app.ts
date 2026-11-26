import { Workspace } from "./workspace.js"
import { readDraft, visionMode } from "@docs-agent/engine"
import { Assert } from "typebox/value"
import { toolSchemas, adjustments } from "@docs-agent/shared"
import { createServer, type IncomingMessage } from "node:http"
import { readFile, mkdir, writeFile } from "node:fs/promises"
import { constants, accessSync } from "node:fs"
import { extname, join, resolve } from "node:path"
import { randomUUID } from "node:crypto"
import { Readable } from "node:stream"
import { fileURLToPath } from "node:url"
import { Documents, HttpError, dataFile } from "./documents.js"
import { chatHandler } from "./chat.js"
import { logger } from "./logger.js"
import { langfuseEnabled } from "./observability.js"

export const root = fileURLToPath(new URL("../../../", import.meta.url))
const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".json": "application/json; charset=utf-8",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pdf": "application/pdf",
}
function available(name: string) {
  return process.env.PATH?.split(":").some((dir) => {
    try {
      accessSync(join(dir, name), constants.X_OK)
      return true
    } catch {
      return false
    }
  })
}

async function upload(req: IncomingMessage, dir: string, draft = false) {
  const body = Readable.toWeb(req) as ReadableStream<Uint8Array<ArrayBuffer>>
  const form = await new Response(body, {
    headers: { "content-type": req.headers["content-type"]! },
  }).formData()
  const file = form.get("file")
  if (!(file instanceof File) || !(draft ? /\.(docx|txt|md)$/i : /\.docx?$/i).test(file.name))
    throw new HttpError(422, "需要 .doc/.docx")
  const folder = join(dir, "uploads")
  await mkdir(folder, { recursive: true })
  const path = join(folder, randomUUID() + extname(file.name))
  await writeFile(path, new Uint8Array(await file.arrayBuffer()))
  return { form, path }
}

export function createApp(
  directory = join(root, "data"),
  useModel = Boolean(process.env.LLM_API_KEY),
) {
  const docs = new Documents(directory, useModel)
  const work = new Workspace(docs)
  const chat = chatHandler(docs, work)
  const server = createServer(async (req, res) => {
    const started = Date.now()
    const reqPath = decodeURIComponent(new URL(req.url!, "http://localhost").pathname)
    res.on("finish", () => {
      if (!reqPath.startsWith("/assets/") && !reqPath.startsWith("/files/")) {
        logger.info(
          { method: req.method, path: reqPath, status: res.statusCode, ms: Date.now() - started },
          "HTTP 请求完成",
        )
      }
    })
    function send(code: number, value: unknown) {
      res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" })
      res.end(JSON.stringify(value))
    }
    try {
      const path = reqPath
      const method = req.method
      if (path === "/chat" || path.startsWith("/sessions")) return await chat(req, res, send)
      if (method === "GET") {
        if (path === "/health") {
          docs.store.db.prepare("SELECT 1").get()
          return send(200, {
            service: "ok",
            sqlite: "ok",
            libreoffice: available("soffice"),
            pdftoppm: available("pdftoppm"),
            llm_configured: Boolean(process.env.LLM_API_KEY),
            vision_mode: visionMode(),
            langfuse_enabled: langfuseEnabled(),
          })
        }
        if (path === "/api/v3/templates")
          return send(200, {
            templates: work.templates.list(),
            active_template_id: work.templates.activeId,
            ...docs.profiles(),
            usage: docs.bill.snapshot(),
          })
        if (/^\/api\/v3\/templates\/[^/]+$/.test(path))
          return send(200, work.templates.get(path.split("/")[4]))
        if (path === "/api/profiles") return send(200, docs.profiles())
        if (/^\/api\/profiles\/[^/]+$/.test(path)) return send(200, docs.get(path.split("/")[3]))
        const dist = join(root, "packages/web/dist")
        const file =
          path === "/"
            ? join(dist, "index.html")
            : path.startsWith("/assets/")
              ? await dataFile(dist, join(dist, path))
              : path.startsWith("/files/")
                ? await dataFile(directory, join(directory, path.slice(7)))
                : null
        if (file) {
          const bytes = await readFile(file)
          res.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream" })
          res.end(bytes)
          return
        }
      }
      if (method === "POST" && req.headers["content-type"]?.startsWith("multipart/form-data")) {
        const { form, path: source } = await upload(
          req,
          directory,
          path === "/api/v3/drafts/ingest",
        )
        if (path === "/api/v3/templates/inspect") return send(200, await work.inspect(source))
        if (path === "/api/v3/drafts/ingest") {
          const index = await work.ingest({ file_path: source })
          const paragraphs = await readDraft(directory, index.draft_id)
          return send(200, { ...index, paragraphs })
        }
        if (path === "/api/profiles/extract")
          return send(200, await docs.extract(source, String(form.get("name"))))
        if (path === "/api/documents/lint")
          return send(200, await docs.lint(source, String(form.get("profile_id"))))
      }
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(Buffer.from(chunk))
      const payload = JSON.parse(Buffer.concat(chunks).toString() || "{}")
      if (path.startsWith("/api/v3/")) {
        const id = path.split("/")[4]
        if (path === "/api/v3/templates" && method === "POST") {
          const p = payload
          const asset = p.blueprint
            ? work.templates.save(
                p.inspect_id,
                p.name,
                p.category,
                p.blueprint,
                p.rules_md,
                p.set_active,
              )
            : await work.internalize(p.inspect_id, p.name, p.category, p.rules_md ?? "")
          return send(200, asset)
        }
        if (path === "/api/v3/templates/active" && method === "PUT") {
          if (payload.template_id) work.templates.activate(payload.template_id)
          else docs.store.db.prepare("DELETE FROM settings WHERE key='active_template'").run()
          return send(200, { active_template_id: work.templates.activeId })
        }
        if (path === "/api/v3/templates/" + id + "/fork" && method === "POST")
          return send(200, work.templates.fork(id, payload.name))
        if (path === "/api/v3/templates/" + id && method === "DELETE") {
          work.templates.delete(id)
          return send(200, { deleted: id })
        }
        if (path === "/api/v3/drafts/ingest" && method === "POST") {
          const index = await work.ingest({ text: payload.text })
          const paragraphs = await readDraft(directory, index.draft_id)
          return send(200, { ...index, paragraphs })
        }
        if (path === "/api/v3/documents/compose" && method === "POST") {
          if (payload.body_plan) Assert(toolSchemas.compose_document, payload)
          else if (payload.mode !== "exact_copy" || typeof payload.draft_id !== "string")
            throw new HttpError(422, "未提供 body_plan 时需使用 exact_copy 模式并提供 draft_id")
          return send(200, await work.compose(payload))
        }
        if (path === "/api/v3/documents/" + id + "/adjust-layout" && method === "POST") {
          Assert(adjustments, payload.operations)
          return send(200, await work.adjust(id, payload.operations))
        }
        if (path === "/api/v3/documents/" + id + "/visual-audit" && method === "POST")
          return send(200, await work.audit(id, payload.run_vision))
      }
      if (path === "/api/profiles/active" && method === "PUT")
        return send(200, docs.setActive(payload.profile_id))
      if (method === "DELETE" && /^\/api\/profiles\/[^/]+$/.test(path)) {
        const id = path.split("/")[3]
        docs.get(id)
        docs.store.delete(id)
        return send(200, { deleted: id })
      }
      if (method === "POST") {
        if (/^\/api\/profiles\/[^/]+\/fork$/.test(path)) {
          return send(
            200,
            await docs.fork(
              path.split("/")[3],
              payload.name,
              payload.patch_json,
              payload.patch_instruction,
            ),
          )
        }
        if (path === "/api/profiles/from-nl") {
          return send(
            200,
            await docs.fromNl(payload.instruction, payload.name, payload.base_profile_id),
          )
        }
        if (path === "/api/documents/render") {
          return send(
            200,
            await docs.render(payload.content_ast, payload.profile_id, payload.overrides),
          )
        }
        if (path === "/api/documents/repair") {
          return send(
            200,
            await docs.repair(
              payload.docx_path,
              payload.effective_profile,
              payload.repair_violations,
            ),
          )
        }
        if (path === "/api/documents/lint")
          return send(200, await docs.lint(payload.docx_path, payload.profile_id))
      }
      send(404, { detail: "资源不存在" })
    } catch (e) {
      const status =
        e instanceof HttpError
          ? e.status
          : (e as NodeJS.ErrnoException).code === "ENOENT"
            ? 404
            : 422
      logger.error({ method: req.method, path: reqPath, status, err: e }, "HTTP 请求异常")
      send(status, { detail: e instanceof HttpError ? e.detail : String(e) })
    }
  })
  server.on("close", () => docs.store.db.close())
  return server
}

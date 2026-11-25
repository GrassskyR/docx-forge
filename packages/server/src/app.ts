import { createServer, type IncomingMessage } from "node:http"
import { readFile, mkdir, writeFile } from "node:fs/promises"
import { constants, accessSync } from "node:fs"
import { extname, join, resolve } from "node:path"
import { randomUUID } from "node:crypto"
import { Readable } from "node:stream"
import { fileURLToPath } from "node:url"
import { Documents, HttpError, dataFile } from "./documents.js"
import { chatHandler } from "./chat.js"

export const root = fileURLToPath(new URL("../../../", import.meta.url))
const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
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

async function upload(req: IncomingMessage, dir: string) {
  const body = Readable.toWeb(req) as ReadableStream<Uint8Array<ArrayBuffer>>
  const form = await new Response(body, {
    headers: { "content-type": req.headers["content-type"]! },
  }).formData()
  const file = form.get("file")
  if (!(file instanceof File) || !/\.docx?$/i.test(file.name))
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
  const chat = chatHandler(docs)
  const server = createServer(async (req, res) => {
    function send(code: number, value: unknown) {
      res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" })
      res.end(JSON.stringify(value))
    }
    try {
      const path = decodeURIComponent(new URL(req.url!, "http://localhost").pathname)
      const method = req.method
      if (path === "/chat" || path.startsWith("/sessions")) return await chat(req, res, send)
      if (method === "GET") {
        if (path === "/health") {
          docs.store.db.prepare("SELECT 1").get()
          const vision =
            process.env.LLM_SUPPORTS_VISION === "true"
              ? "native"
              : process.env.VISION_MODEL
                ? "sidecar"
                : "text_only"
          return send(200, {
            service: "ok",
            sqlite: "ok",
            libreoffice: available("soffice"),
            pdftoppm: available("pdftoppm"),
            llm_configured: Boolean(process.env.LLM_API_KEY),
            vision_mode: vision,
          })
        }
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
        const { form, path: source } = await upload(req, directory)
        if (path === "/api/profiles/extract")
          return send(200, await docs.extract(source, String(form.get("name"))))
        if (path === "/api/documents/lint")
          return send(200, await docs.lint(source, String(form.get("profile_id"))))
      }
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(Buffer.from(chunk))
      const payload = JSON.parse(Buffer.concat(chunks).toString() || "{}")
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
      send(status, { detail: e instanceof HttpError ? e.detail : String(e) })
    }
  })
  server.on("close", () => docs.store.db.close())
  return server
}

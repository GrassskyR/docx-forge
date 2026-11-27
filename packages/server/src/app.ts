import { randomUUID, timingSafeEqual } from "node:crypto"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { basename, extname, join } from "node:path"
import { Readable } from "node:stream"
import { fileURLToPath } from "node:url"
import { probeToolchain, readDraft, visionMode } from "@docs-agent/engine"
import { adjustments, toolSchemas } from "@docs-agent/shared"
import { Assert } from "typebox/value"
import { sessionAndChatHandler } from "./chat.js"
import type { AppConfigPatch, SecretCipher } from "./config_store.js"
import { Documents, HttpError, dataFile } from "./documents.js"
import { logger } from "./logger.js"
import { langfuseEnabled } from "./observability.js"
import { SessionStore } from "./session_store.js"
import { Workspace } from "./workspace.js"

export const root = fileURLToPath(new URL("../../../", import.meta.url))

export interface CreateAppOptions {
  dataDir?: string
  distDir?: string
  useModel?: boolean
  authToken?: string
  secretCipher?: SecretCipher
  isDesktop?: boolean
  isPortable?: boolean
  syncToolchain?: boolean
}

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

function tokenMatches(expected: string, actual: string | string[] | undefined): boolean {
  if (typeof actual !== "string") return false
  const a = Buffer.from(expected)
  const b = Buffer.from(actual)
  return a.length === b.length && timingSafeEqual(a, b)
}

async function upload(req: IncomingMessage, dir: string, draft = false) {
  const body = Readable.toWeb(req) as ReadableStream<Uint8Array<ArrayBuffer>>
  const form = await new Response(body, {
    headers: { "content-type": req.headers["content-type"]! },
  }).formData()
  const file = form.get("file")
  if (!(file instanceof File) || !(draft ? /\.(docx|txt|md)$/i : /\.docx?$/i).test(file.name)) {
    throw new HttpError(422, "需要合法的文档文件")
  }
  const folder = join(dir, "uploads")
  await mkdir(folder, { recursive: true })
  const path = join(folder, randomUUID() + extname(file.name))
  await writeFile(path, new Uint8Array(await file.arrayBuffer()))
  return { form, path, originalName: file.name }
}

function openSse(res: ServerResponse) {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache",
    connection: "keep-alive",
  })
  const ctl = new AbortController()
  res.on("close", () => {
    if (!res.writableEnded) ctl.abort()
  })
  const emit = (data: unknown) => {
    if (!res.writableEnded) res.write("data: " + JSON.stringify(data) + "\n\n")
  }
  return { ctl, emit }
}

export function createApp(
  directoryOrOptions: string | CreateAppOptions = join(root, "data"),
  useModel?: boolean,
) {
  const opts: CreateAppOptions =
    typeof directoryOrOptions === "string"
      ? { dataDir: directoryOrOptions, useModel }
      : directoryOrOptions
  const directory = opts.dataDir ?? join(root, "data")
  const dist = opts.distDir ?? join(root, "packages/web/dist")
  const docs = new Documents(directory, opts.useModel, {
    secretCipher: opts.secretCipher,
    syncToolchain: opts.syncToolchain,
  })
  const work = new Workspace(docs)
  const sessions = new SessionStore(docs.store, work.templates)
  const chatAndSessions = sessionAndChatHandler(docs, work, sessions)

  async function buildHealth(forceProbe = false) {
    docs.store.db.prepare("SELECT 1").get()
    const tc = await probeToolchain(forceProbe)
    const cfg = docs.config.current()
    return {
      service: "ok",
      sqlite: "ok",
      libreoffice: tc.libreoffice,
      pdftoppm: tc.pdftoppm,
      llm_configured: Boolean(cfg.llm_api_key),
      vision_mode: visionMode(cfg),
      langfuse_enabled: langfuseEnabled(),
      renderer_ready: tc.renderer_ready,
      active_renderer: tc.active_renderer,
      word_com: tc.word_com,
      wps_com: tc.wps_com,
      poppler_source: tc.poppler_source,
      platform: tc.platform,
      is_desktop: Boolean(opts.isDesktop),
      is_portable: Boolean(opts.isPortable),
      data_dir: directory,
    }
  }

  const server = createServer(async (req, res) => {
    const started = Date.now()
    const path = decodeURIComponent(new URL(req.url!, "http://localhost").pathname)
    res.on("finish", () => {
      if (!path.startsWith("/assets/") && !path.startsWith("/files/")) {
        logger.info(
          { method: req.method, path, status: res.statusCode, ms: Date.now() - started },
          "HTTP 请求完成",
        )
      }
    })
    function send(code: number, value: unknown) {
      res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" })
      res.end(JSON.stringify(value))
    }
    try {
      const protectedRoute =
        path === "/health" || path.startsWith("/api/") || path.startsWith("/files/")
      if (opts.authToken && protectedRoute) {
        if (!tokenMatches(opts.authToken, req.headers["x-docforge-token"])) {
          return send(403, { detail: "未授权的本地访问请求" })
        }
      }

      const method = req.method
      if (path === "/api/chat" || path.startsWith("/api/sessions")) {
        return await chatAndSessions(req, res, path, send)
      }

      if (method === "GET") {
        if (path === "/health") {
          return send(200, await buildHealth(false))
        }
        if (path === "/api/settings") {
          const toolchain = await probeToolchain(true)
          return send(200, {
            config: docs.config.publicView(),
            toolchain,
            data_dir: directory,
            is_desktop: Boolean(opts.isDesktop),
            is_portable: Boolean(opts.isPortable),
          })
        }
        if (path === "/api/templates") {
          return send(200, {
            templates: work.templates.list(),
            usage: docs.bill.snapshot(),
          })
        }
        const sampleMatch = /^\/api\/templates\/([^/]+)\/samples$/.exec(path)
        if (sampleMatch) {
          if (!work.templates.has(sampleMatch[1])) {
            throw new HttpError(404, "模板不存在")
          }
          const sample_urls = await work.templates.ensureSamples(sampleMatch[1])
          return send(200, { sample_urls })
        }
        const inspectMatch = /^\/api\/templates\/([^/]+)\/inspect$/.exec(path)
        if (inspectMatch) {
          try {
            return send(200, await work.inspectTemplate(inspectMatch[1]))
          } catch {
            throw new HttpError(404, "模板不存在")
          }
        }
        if (/^\/api\/templates\/[^/]+$/.test(path)) {
          try {
            return send(200, work.templates.get(path.split("/")[3]))
          } catch {
            throw new HttpError(404, "模板不存在")
          }
        }
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
          res.writeHead(200, {
            "Content-Type": types[extname(file)] ?? "application/octet-stream",
          })
          res.end(bytes)
          return
        }
      }

      if (method === "POST" && req.headers["content-type"]?.startsWith("multipart/form-data")) {
        const isDraft = path === "/api/drafts/ingest"
        const { form, path: source, originalName } = await upload(req, directory, isDraft)
        if (path === "/api/templates/inspect") {
          return send(200, await work.inspect(source))
        }
        if (path === "/api/templates/import") {
          const { ctl, emit } = openSse(res)
          let inspectDir = ""
          try {
            emit({ type: "phase", label: "正在解析原件版式与渲染样张…" })
            const inspected = await work.inspect(source, [1, 2, 3])
            inspectDir = join(directory, "inspections", inspected.inspect_id)
            emit({ type: "sample", sample_urls: inspected.sample_urls })
            const rawName = String(form.get("name") ?? "").trim()
            const tplName = rawName || basename(originalName).replace(/\.[^.]+$/, "")
            const tplCat = String(form.get("category") ?? "gongwen").trim() || "gongwen"
            const rules = String(form.get("rules_md") ?? "").trim()
            const asset = await work.internalize(
              inspected.inspect_id,
              tplName,
              tplCat,
              rules,
              false,
              {
                signal: ctl.signal,
                onPhase: (label) => emit({ type: "phase", label }),
              },
            )
            emit({ type: "done", template: asset, usage: docs.bill.snapshot() })
          } catch (err) {
            if (!ctl.signal.aborted) {
              emit({ type: "error", error: err instanceof Error ? err.message : String(err) })
            } else if (inspectDir) {
              await rm(inspectDir, { recursive: true, force: true }).catch(() => {})
            }
          } finally {
            await rm(source, { force: true }).catch(() => {})
            if (!res.writableEnded) res.end()
          }
          return
        }
        if (isDraft) {
          const index = await work.ingest({ file_path: source })
          const paragraphs = await readDraft(directory, index.draft_id)
          return send(200, { ...index, paragraphs })
        }
      }

      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(Buffer.from(chunk))
      const payload = JSON.parse(Buffer.concat(chunks).toString() || "{}")

      if (path === "/api/settings" && method === "PUT") {
        const config = docs.config.update(payload as AppConfigPatch)
        const toolchain = await probeToolchain(true)
        const health = await buildHealth(false)
        return send(200, {
          config,
          toolchain,
          health,
          data_dir: directory,
          is_desktop: Boolean(opts.isDesktop),
          is_portable: Boolean(opts.isPortable),
        })
      }

      if (path === "/api/documents/compose-stream" && method === "POST") {
        const draftText = typeof payload.draft_text === "string" ? payload.draft_text : ""
        if (!draftText.trim()) {
          throw new HttpError(422, "请先输入或导入正文内容")
        }
        const { ctl, emit } = openSse(res)
        try {
          emit({ type: "phase", label: "正在切分草稿段落结构…" })
          const index = await work.ingest({ text: draftText })
          const paragraphs = await readDraft(directory, index.draft_id)
          const sessId =
            typeof payload.session_id === "string" && payload.session_id
              ? payload.session_id
              : sessions.activeId
          const sess = sessions.get(sessId)
          const tplId = payload.template_id || sess.template_id
          const slotValues =
            (payload.slot_values as Record<string, string> | undefined) ?? sess.slot_values
          const doc = await work.compose(
            {
              template_id: tplId,
              mode: "exact_copy",
              draft_id: index.draft_id,
              slot_values: slotValues,
              normalize_punctuation: payload.normalize_punctuation ?? true,
              generate_cover: payload.generate_cover,
              generate_toc: payload.generate_toc,
            },
            {
              signal: ctl.signal,
              onPhase: (label) => emit({ type: "phase", label }),
            },
          )
          const liveVision = visionMode(docs.config.current())
          if (payload.run_vision !== false && liveVision !== "text_only") {
            emit({ type: "phase", label: "正在执行关键页视觉核查…" })
            const audited = await work.audit(doc.doc_id, true, ctl.signal)
            Object.assign(doc, { vision: audited.vision })
          }
          const updatedSession = sessions.update(sess.id, {
            draft_text: draftText,
            slot_values: slotValues,
            generate_cover: Boolean(payload.generate_cover),
            generate_toc: Boolean(payload.generate_toc),
            normalize_punct: payload.normalize_punctuation !== false,
            current_doc: doc as unknown as Record<string, unknown>,
            preview_stale: false,
          })
          emit({
            type: "done",
            result: doc,
            paragraphs,
            session: updatedSession,
            usage: docs.bill.snapshot(),
          })
        } catch (err) {
          if (!ctl.signal.aborted) {
            emit({ type: "error", error: err instanceof Error ? err.message : String(err) })
          }
        } finally {
          if (!res.writableEnded) res.end()
        }
        return
      }

      if (path.startsWith("/api/")) {
        const id = path.split("/")[3]
        if (path === "/api/templates" && method === "POST") {
          const p = payload
          const asset = p.blueprint
            ? work.templates.save(
                p.inspect_id,
                p.name,
                p.category,
                p.blueprint,
                p.rules_md ?? "",
                p.set_active !== false,
              )
            : await work.internalize(
                p.inspect_id,
                p.name,
                p.category,
                p.rules_md ?? "",
                p.set_active !== false,
              )
          return send(200, asset)
        }
        if (path === "/api/templates/" + id && method === "PATCH") {
          const isDeepEdit =
            payload.page_setup !== undefined ||
            payload.format_paragraphs !== undefined ||
            payload.insert_paragraphs !== undefined ||
            payload.blueprint !== undefined ||
            payload.rules_md !== undefined ||
            payload.save_as_new !== undefined
          if (isDeepEdit) {
            Assert(toolSchemas.update_template, payload)
            const edited = await work.editTemplate(id, payload)
            return send(200, edited.template)
          }
          return send(
            200,
            work.templates.update(id, { name: payload.name, category: payload.category }),
          )
        }
        if (path === "/api/templates/" + id + "/fork" && method === "POST") {
          return send(200, work.templates.fork(id, payload.name))
        }
        if (path === "/api/templates/" + id && method === "DELETE") {
          work.templates.delete(id)
          sessions.fallbackDeletedTemplate(id)
          return send(200, { deleted: id, active_session: sessions.active() })
        }
        if (path === "/api/drafts/ingest" && method === "POST") {
          const index = await work.ingest({ text: payload.text })
          const paragraphs = await readDraft(directory, index.draft_id)
          return send(200, { ...index, paragraphs })
        }
        if (path === "/api/documents/compose" && method === "POST") {
          if (payload.body_plan) Assert(toolSchemas.compose_document, payload)
          else if (payload.mode !== "exact_copy" || typeof payload.draft_id !== "string") {
            throw new HttpError(422, "未提供 body_plan 时需使用 exact_copy 模式并提供 draft_id")
          }
          return send(200, await work.compose(payload))
        }
        if (path === "/api/documents/" + id + "/adjust-layout" && method === "POST") {
          Assert(adjustments, payload.operations)
          const updated = await work.adjust(id, payload.operations)
          if (typeof payload.session_id === "string" && payload.session_id) {
            sessions.update(payload.session_id, {
              current_doc: updated as Record<string, unknown>,
              preview_stale: false,
            })
          }
          return send(200, updated)
        }
        if (path === "/api/documents/" + id + "/visual-audit" && method === "POST") {
          const audited = await work.audit(id, payload.run_vision)
          if (typeof payload.session_id === "string" && payload.session_id) {
            const cur = sessions.get(payload.session_id)
            if (cur.current_doc) {
              sessions.update(payload.session_id, {
                current_doc: { ...cur.current_doc, vision: audited.vision },
              })
            }
          }
          return send(200, audited)
        }
      }
      send(404, { detail: "资源不存在" })
    } catch (e) {
      const status =
        e instanceof HttpError
          ? e.status
          : (e as NodeJS.ErrnoException).code === "ENOENT"
            ? 404
            : 422
      logger.error({ method: req.method, path, status, err: e }, "HTTP 请求异常")
      send(status, { detail: e instanceof HttpError ? e.detail : String(e) })
    }
  })
  server.on("close", () => docs.store.db.close())
  return server
}

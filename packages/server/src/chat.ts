import type { IncomingMessage, ServerResponse } from "node:http"
import { visionMode } from "@docs-agent/engine"
import { makeAgent } from "./agent.js"
import { clearReviewedImages, countImages } from "./context_hook.js"
import { Documents } from "./documents.js"
import { runTracedAgentPrompt } from "./observability.js"
import { SessionStore } from "./session_store.js"
import type { Workspace } from "./workspace.js"

const TOOL_PHASE_LABELS: Record<string, string> = {
  learn_reference_doc: "正在解析参考文档版式与槽位…",
  manage_templates: "正在读取模板配置…",
  update_template: "正在微调模板样式与结构并自检…",
  ingest_draft: "正在切分草稿段落结构…",
  compose_document: "正在写入模板槽位并生成 Word…",
  refine_and_audit: "正在微调跨页版面收口…",
}

async function readJsonBody(req: IncomingMessage) {
  let raw = ""
  for await (const chunk of req) {
    raw += chunk
    if (raw.length > 2_000_000) throw new Error("请求过大")
  }
  return JSON.parse(raw || "{}")
}

export function sessionAndChatHandler(
  client: Documents,
  work: Workspace,
  sessions: SessionStore,
) {
  const busySessions = new Set<string>()

  function statePayload(active = sessions.active()) {
    return {
      sessions: sessions.list(),
      active_session_id: active.id,
      active,
    }
  }

  return async (
    req: IncomingMessage,
    res: ServerResponse,
    path: string,
    send: (code: number, value: unknown) => void,
  ) => {
    const method = req.method || "GET"

    if (path === "/api/sessions" && method === "GET") {
      send(200, statePayload())
      return
    }

    const body = method === "DELETE" ? {} : await readJsonBody(req)

    if (path === "/api/sessions" && method === "POST") {
      const created = sessions.create({
        name: body.name,
        template_id: body.template_id,
      })
      send(200, statePayload(created))
      return
    }

    if (path === "/api/sessions/active" && method === "PUT") {
      if (typeof body.session_id !== "string" || !body.session_id) {
        send(422, { detail: "缺少 session_id" })
        return
      }
      const switched = sessions.setActive(body.session_id)
      send(200, statePayload(switched))
      return
    }

    const forkMatch = /^\/api\/sessions\/([^/]+)\/fork$/.exec(path)
    if (forkMatch && method === "POST") {
      const targetId = forkMatch[1]
      if (busySessions.has(targetId)) {
        send(409, { detail: "当前会话正在生成中，请先停止后再分叉" })
        return
      }
      const forked = sessions.fork(targetId, body.name, body.template_id)
      send(200, statePayload(forked))
      return
    }

    const itemMatch = /^\/api\/sessions\/([^/]+)$/.exec(path)
    if (itemMatch) {
      const targetId = itemMatch[1]
      if (method === "PATCH") {
        const updated = sessions.update(targetId, {
          name: body.name,
          template_id: body.template_id,
          draft_text: body.draft_text,
          slot_values: body.slot_values,
          generate_cover: body.generate_cover,
          generate_toc: body.generate_toc,
          normalize_punct: body.normalize_punct,
          preview_stale: body.preview_stale,
        })
        send(200, statePayload(updated))
        return
      }
      if (method === "DELETE") {
        if (busySessions.has(targetId)) {
          send(409, { detail: "该会话正在执行生成任务，请先停止" })
          return
        }
        const next = sessions.delete(targetId)
        send(200, { deleted: targetId, ...statePayload(next) })
        return
      }
    }

    if (path !== "/api/chat" || method !== "POST") {
      send(404, { detail: "资源不存在" })
      return
    }
    if (!process.env.LLM_API_KEY) {
      send(503, { detail: "请配置 .env 中的 LLM_API_KEY、LLM_BASE_URL、LLM_MODEL" })
      return
    }
    if (typeof body.prompt !== "string" || !body.prompt.trim()) {
      send(422, { detail: "请输入对话内容" })
      return
    }
    if (body.vision_enabled !== undefined && typeof body.vision_enabled !== "boolean") {
      send(422, { detail: "vision_enabled 必须为布尔值" })
      return
    }

    const sessionId =
      typeof body.session_id === "string" && body.session_id
        ? body.session_id
        : sessions.activeId
    let node = sessions.setActive(sessionId)
    if (busySessions.has(node.id)) {
      send(409, { detail: "当前文档会话正在处理请求" })
      return
    }

    const useVision = body.vision_enabled !== false
    const vision_mode = useVision ? visionMode() : "text_only"
    let vision_pages_isolated = 0
    let abortedByClient = false
    busySessions.add(node.id)

    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive",
    })
    const event = (data: unknown) => {
      if (!res.writableEnded) {
        res.write("data: " + JSON.stringify(data) + "\n\n")
      }
    }

    let curTemplateId = node.template_id
    let curDraft = node.draft_text
    let curSlots = { ...node.slot_values }
    let curDoc = node.current_doc

    const agent = makeAgent(
      work,
      {
        vision: useVision,
        getTemplateId: () => curTemplateId,
        setTemplateId: (nextId) => {
          if (!work.templates.has(nextId) || nextId === curTemplateId) return
          curTemplateId = nextId
          node = sessions.update(node.id, { template_id: nextId })
          event({
            type: "template",
            template_id: nextId,
            events: node.events,
          })
        },
        onTemplateUpdated: (asset, forked) => {
          if (forked && asset.id !== curTemplateId) {
            curTemplateId = asset.id
            node = sessions.update(node.id, { template_id: asset.id })
          } else {
            node = sessions.update(node.id, {
              preview_stale: Boolean(curDoc),
              append_event: `已微调当前排版格式「${asset.name}」`,
            })
          }
          event({
            type: "template",
            template_id: curTemplateId,
            events: node.events,
          })
        },
        onTemplateDeleted: (deletedId) => {
          sessions.fallbackDeletedTemplate(deletedId)
          node = sessions.get(node.id)
          curTemplateId = node.template_id
        },
        onComposed: (doc, input) => {
          const bodyTexts = Array.isArray(doc.body_texts)
            ? (doc.body_texts as string[])
            : []
          const resolvedSlots =
            (doc.resolved_slots as Record<string, string> | undefined) ?? {}
          if (bodyTexts.length > 0) {
            curDraft = bodyTexts.join("\n")
          }
          if (Object.keys(resolvedSlots).length > 0) {
            curSlots = { ...curSlots, ...resolvedSlots }
          }
          curDoc = doc
          const hint =
            resolvedSlots.title ||
            resolvedSlots.report_title ||
            (typeof input.cover_subtitle === "string" ? input.cover_subtitle : undefined)
          node = sessions.update(node.id, {
            draft_text: curDraft,
            slot_values: curSlots,
            current_doc: curDoc,
            preview_stale: false,
            title_hint: hint,
          })
          event({
            type: "workspace_sync",
            session_name: node.name,
            auto_named: node.auto_named,
            draft_text: curDraft,
            slot_values: curSlots,
            doc: curDoc,
          })
        },
        onAdjusted: (doc) => {
          curDoc = { ...(curDoc ?? {}), ...doc }
          node = sessions.update(node.id, { current_doc: curDoc, preview_stale: false })
        },
      },
      () => ({
        template_id: curTemplateId,
        draft_text: curDraft,
        slot_values: curSlots,
        generate_cover: node.generate_cover,
        generate_toc: node.generate_toc,
        doc_id: (curDoc?.doc_id as string | undefined) ?? null,
      }),
    )

    agent.state.messages = structuredClone(node.messages)
    res.on("close", () => {
      if (!res.writableEnded) {
        abortedByClient = true
        agent.abort()
      }
    })

    event({ type: "phase", label: "正在结合当前底稿理解需求…" })

    const unsubscribe = agent.subscribe((e) => {
      if (e.type === "message_update" && e.assistantMessageEvent.type === "text_delta") {
        event({ type: "text", text: e.assistantMessageEvent.delta })
      }
      if (e.type === "message_end" && e.message.role === "assistant") {
        const usage = client.bill.record(
          e.message.usage,
          Boolean(process.env.LLM_INPUT_USD_PER_MILLION && process.env.LLM_OUTPUT_USD_PER_MILLION),
        )
        event({ type: "usage", usage })
      }
      if (e.type === "tool_execution_start") {
        const label = TOOL_PHASE_LABELS[e.toolName] ?? "正在执行排版操作…"
        event({ type: "phase", label })
        event({ type: "tool", name: e.toolName, label, phase: "start" })
      }
      if (e.type === "tool_execution_end") {
        const label = TOOL_PHASE_LABELS[e.toolName] ?? "完成排版操作"
        event({ type: "tool", name: e.toolName, label, isError: e.isError })
        const result = e.result.details
        if (result?.layout) event({ type: "layout", layout: result.layout })
        if (result?.vision) {
          vision_pages_isolated += result.vision.pages.length
          event({ type: "vision", vision: result.vision, vision_enabled: useVision })
        }
        if (result?.docx_url) event({ type: "document", result })
      }
    })

    const timer = setTimeout(() => agent.abort(), 180_000)
    try {
      await runTracedAgentPrompt(agent, {
        sessionId: node.id,
        prompt: body.prompt,
        activeTemplate: curTemplateId,
      })
      if (!abortedByClient) {
        if (agent.state.errorMessage) event({ type: "error", error: agent.state.errorMessage })
        const history = clearReviewedImages(agent.state.messages)
        node = sessions.update(node.id, { messages: history })
        event({
          type: "done",
          session_name: node.name,
          vision_enabled: useVision,
          vision_mode,
          vision_pages_isolated,
          vision_images_purged: countImages(agent.state.messages) - countImages(history),
        })
      }
    } catch (e) {
      if (!abortedByClient) {
        event({ type: "error", error: e instanceof Error ? e.message : String(e) })
      }
    } finally {
      clearTimeout(timer)
      unsubscribe()
      busySessions.delete(node.id)
      if (!res.writableEnded) res.end()
    }
  }
}

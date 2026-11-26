import { computed, reactive } from "vue"
import type { ComposePlan } from "@docs-agent/shared"
import * as api from "./api.js"
import {
  CATEGORY_LABELS,
  normalizeCategory,
  STARTER_DRAFTS,
  type CategoryId,
  type ChatTurn,
  type DocumentResult,
  type FormatOption,
  type HealthInfo,
  type MappingRow,
  type RawAgentMessage,
  type SessionBranch,
  type UsageSnapshot,
} from "./types.js"

function parseHistory(messages: RawAgentMessage[]): ChatTurn[] {
  const turns: ChatTurn[] = []
  for (const msg of messages) {
    if (msg.role === "user") {
      const text =
        typeof msg.content === "string"
          ? msg.content
          : msg.content.map((c) => c.text ?? "").join("")
      if (text.trim()) turns.push({ role: "user", text })
      continue
    }
    let last = turns.at(-1)
    if (!last || last.role !== "assistant") {
      last = { role: "assistant", text: "", steps: [] }
      turns.push(last)
    }
    if (msg.role === "toolResult") {
      last.steps?.push({
        status: msg.isError ? "warn" : "ok",
        text: "执行工具 " + (msg.toolName ?? "tool") + (msg.isError ? "（异常）" : "（完成）"),
      })
      const rawTool =
        typeof msg.content === "string"
          ? msg.content
          : msg.content.map((c) => c.text ?? "").join("")
      const urlMatch = /\/files\/documents\/[0-9a-f-]{36}\/document\.docx/.exec(rawTool)
      if (urlMatch) {
        last.docUrl = urlMatch[0]
        const pgMatch = /"total_pages":(\d+)/.exec(rawTool)
        if (pgMatch) last.docPages = Number(pgMatch[1])
      }
    } else if (Array.isArray(msg.content)) {
      const piece = msg.content
        .filter((c) => c.type === "text" && c.text)
        .map((c) => c.text)
        .join("")
      if (piece) last.text = last.text ? last.text + "\n" + piece : piece
    }
  }
  return turns
}

function buildMappings(plan: ComposePlan | undefined, paragraphs: string[]): MappingRow[] {
  if (!plan?.length) return []
  return plan.map((item) => {
    const id = item.range ?? "P0"
    const match = /^P(\d+)(?:-P(\d+))?$/.exec(id)
    const first = match ? Number(match[1]) : 0
    const second = match && match[2] ? Number(match[2]) : first
    const count = second - first + 1
    const raw = paragraphs[first] ?? item.text ?? ""
    const sample = raw.length > 26 ? raw.slice(0, 26) + "…" : raw
    const text = count > 1 ? sample + "（共 " + count + " 段零拷贝）" : sample
    return {
      id: id.replace("-", "–"),
      target:
        item.slot && item.slot !== "body"
          ? item.slot + ":" + item.prototype
          : "proto:" + item.prototype,
      text,
    }
  })
}

export function useWorkbench() {
  const state = reactive({
    debug: false,
    popoverOpen: false,
    popoverCat: "all" as CategoryId,
    importOpen: false,
    mode: "copy" as "copy" | "chat",
    drawerTab: "telemetry" as "telemetry" | "ooxml" | "vision",
    visionEnabled: true,
    normalizePunct: true,
    zoom: 1,
    page: 1,
    docVersion: 1,
    busy: false,
    busyLabel: "",
    toastText: "",
    draftText: STARTER_DRAFTS.gongwen,
    draftEdited: false,
    draftParagraphs: [] as string[],
    slotValues: {} as Record<string, string>,
    lastTokenDelta: 0,
    purgedImages: 0,
    isolatedPages: 0,
    health: null as HealthInfo | null,
    formats: [] as FormatOption[],
    activeId: "",
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      cached_tokens: 0,
      total_tokens: 0,
      cost_usd: 0,
    } as UsageSnapshot,
    currentDoc: null as DocumentResult | null,
    mappings: [] as MappingRow[],
    branches: [] as SessionBranch[],
    activeBranchId: "root",
    chatMessages: [] as ChatTurn[],
  })

  let toastTimer: ReturnType<typeof setTimeout> | undefined

  function toast(msg: string) {
    state.toastText = msg
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => {
      state.toastText = ""
    }, 2600)
  }

  const activeFormat = computed<FormatOption | undefined>(
    () => state.formats.find((f) => f.id === state.activeId) ?? state.formats[0],
  )

  const previewUrls = computed(() =>
    (state.currentDoc?.preview_urls ?? []).map((u) => u + "?v=" + state.docVersion),
  )

  async function refreshFormats() {
    const data = await api.fetchTemplates()
    state.usage = data.usage
    state.formats = data.templates.map((t) => {
      const cat = normalizeCategory(t.category)
      return {
        id: t.id,
        name: t.name,
        category: cat,
        categoryLabel: CATEGORY_LABELS[cat],
        desc:
          "保留：" +
          (t.blueprint.preserved.length
            ? t.blueprint.preserved.join(" · ")
            : "原件母版壳与样式"),
        fields: t.blueprint.fields.map((f) => ({ name: f.name, label: f.label })),
        contentSlots: t.blueprint.content_slots.map((s) => s.name),
        prototypes: Object.keys(t.blueprint.prototypes),
        preserved: t.blueprint.preserved,
        capabilityCard: t.capability_card,
        asset: t,
      }
    })
    if (data.active_template_id && state.formats.some((f) => f.id === data.active_template_id)) {
      state.activeId = data.active_template_id
    } else if (state.formats[0]) {
      state.activeId = state.formats[0].id
    }
  }

  async function refreshSessions() {
    const data = await api.fetchSessions()
    state.branches = data.nodes
    state.activeBranchId = data.current
    state.chatMessages = parseHistory(data.node.messages)
  }

  async function init() {
    const [health] = await Promise.all([api.fetchHealth(), refreshFormats(), refreshSessions()])
    state.health = health
    state.visionEnabled = health.vision_mode !== "text_only"
    const cur = activeFormat.value
    if (cur && !state.draftEdited) {
      state.draftText = STARTER_DRAFTS[cur.category]
    }
  }

  async function selectFormat(option: FormatOption) {
    state.popoverOpen = false
    await api.setActiveTemplate(option.id)
    state.activeId = option.id
    state.slotValues = {}
    state.page = 1
    if (!state.draftEdited) {
      state.draftText = STARTER_DRAFTS[option.category]
    }
    toast("已切换格式「" + option.name + "」")
  }

  async function uploadDraft(file: File) {
    state.busy = true
    state.busyLabel = "正在读取草稿…"
    try {
      const res = await api.ingestDraftFile(file)
      state.draftParagraphs = res.paragraphs
      state.draftText = res.paragraphs.join("\n")
      state.draftEdited = true
      toast("已导入草稿（共 " + res.count + " 段 · " + res.characters + " 字）")
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    } finally {
      state.busy = false
      state.busyLabel = ""
    }
  }

  async function applyFormat() {
    const fmt = activeFormat.value
    if (!fmt || !state.draftText.trim()) {
      toast("请先输入或导入正文内容")
      return
    }
    state.busy = true
    state.busyLabel = "正在排版并执行审计…"
    const prevTokens = state.usage.total_tokens
    try {
      const draft = await api.ingestDraftText(state.draftText)
      state.draftParagraphs = draft.paragraphs
      const fallbackPlan: ComposePlan | undefined = state.health?.llm_configured
        ? undefined
        : [
            {
              range: draft.count > 1 ? "P0-P" + (draft.count - 1) : "P0",
              prototype: Object.keys(fmt.asset.blueprint.prototypes)[0] ?? "body",
            },
          ]
      const slotEntries = Object.entries(state.slotValues).filter(([, v]) => v.trim())
      const doc = await api.composeDocument({
        template_id: fmt.id,
        mode: "exact_copy",
        draft_id: draft.draft_id,
        ...(slotEntries.length ? { slot_values: Object.fromEntries(slotEntries) } : {}),
        body_plan: fallbackPlan,
        normalize_punctuation: state.normalizePunct,
      })
      if (doc.usage) {
        state.usage = doc.usage
        state.lastTokenDelta = Math.max(0, doc.usage.total_tokens - prevTokens)
      }
      const audit = await api.visualAuditDocument(doc.doc_id, state.visionEnabled)
      doc.vision = audit.vision
      state.currentDoc = doc
      state.mappings = buildMappings(doc.body_plan, draft.paragraphs)
      state.docVersion++
      state.page = 1
      toast("已按「" + fmt.name + "」完成排版")
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    } finally {
      state.busy = false
      state.busyLabel = ""
    }
  }

  async function runSurgery(kind: "compact" | "orphan" | "tighten" | "vision") {
    if (!state.currentDoc) {
      toast("请先套用格式或生成一份文档")
      return
    }
    state.busy = true
    state.busyLabel = kind === "vision" ? "正在执行关键页视觉终审…" : "正在微调版面收口…"
    try {
      if (kind === "vision") {
        state.visionEnabled = true
        const res = await api.visualAuditDocument(state.currentDoc.doc_id, true)
        state.currentDoc.vision = res.vision
        state.drawerTab = "vision"
        toast(
          res.vision.status === "skipped_no_vision_model"
            ? "未配置视觉模型，已优雅降级为纯文本遥测"
            : "已完成关键页视觉终审",
        )
        return
      }
      const ops =
        kind === "compact"
          ? [{ type: "compact_pages" as const }]
          : kind === "orphan"
            ? [{ type: "prevent_orphan_signature" as const }]
            : [{ type: "line_spacing_delta" as const, delta: -1 }]
      const updated = await api.adjustDocumentLayout(state.currentDoc.doc_id, ops)
      state.currentDoc.layout = updated.layout
      state.currentDoc.preview_urls = updated.preview_urls
      state.docVersion++
      const total = updated.layout?.total_pages ?? 1
      if (state.page > total) state.page = total
      toast("已完成版面收口（共 " + total + " 页）")
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    } finally {
      state.busy = false
      state.busyLabel = ""
    }
  }

  async function importTemplate(file: File, name: string, category: string, rules: string) {
    state.busy = true
    state.busyLabel = "正在全量透视解剖并试填验证模板…"
    try {
      const inspected = await api.inspectDocFile(file)
      const asset = await api.saveTemplateFromInspect(inspected.inspect_id, name, category, rules)
      await refreshFormats()
      state.activeId = asset.id
      if (!state.draftEdited) {
        state.draftText = STARTER_DRAFTS[normalizeCategory(category)]
      }
      state.importOpen = false
      toast("已通过自检并保存新格式「" + asset.name + "」")
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    } finally {
      state.busy = false
      state.busyLabel = ""
    }
  }

  async function forkCurrentFormat() {
    const fmt = activeFormat.value
    if (!fmt) return
    const copyName = fmt.name + "（副本）"
    try {
      const created = await api.forkTemplateAsset(fmt.id, copyName)
      await api.setActiveTemplate(created.id)
      await refreshFormats()
      toast("已派生格式「" + copyName + "」")
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    }
  }

  async function sendChat(prompt: string) {
    const clean = prompt.trim()
    if (!clean || state.busy) return
    state.busy = true
    state.busyLabel = "AI 正在处理…"
    state.chatMessages.push({ role: "user", text: clean })
    const reply: ChatTurn = { role: "assistant", text: "", steps: [] }
    state.chatMessages.push(reply)
    try {
      await api.streamChat(clean, state.visionEnabled, (ev) => {
        if (ev.type === "text" && ev.text) {
          reply.text += ev.text
        } else if (ev.type === "tool") {
          if (ev.phase === "start") {
            reply.steps?.push({ status: "running", text: "调用工具 " + ev.name + "…" })
          } else {
            reply.steps?.push({
              status: ev.isError ? "warn" : "ok",
              text: "完成工具 " + ev.name,
            })
          }
        } else if (ev.type === "usage" && ev.usage) {
          state.usage = ev.usage
        } else if (ev.type === "layout" && ev.layout) {
          const warnCount = ev.layout.warnings?.length ?? 0
          reply.steps?.push({
            status: warnCount ? "warn" : "ok",
            text:
              "Poppler 遥测：共 " +
              ev.layout.total_pages +
              " 页" +
              (warnCount ? "（" + ev.layout.warnings[0].message + "）" : "（无溢出）"),
          })
          if (state.currentDoc) state.currentDoc.layout = ev.layout
        } else if (ev.type === "vision" && ev.vision) {
          reply.steps?.push({
            status: ev.vision.status === "issues" ? "warn" : "ok",
            text: "视觉终审：" + ev.vision.mode + " (" + ev.vision.status + ")",
          })
          if (state.currentDoc) state.currentDoc.vision = ev.vision
        } else if (ev.type === "document" && ev.result) {
          state.currentDoc = ev.result
          reply.docUrl = ev.result.docx_url
          reply.docPages =
            ev.result.preview_urls?.length || ev.result.layout?.total_pages || 1
          state.docVersion++
          state.page = 1
        } else if (ev.type === "done") {
          state.isolatedPages += ev.vision_pages_isolated ?? 0
          state.purgedImages += ev.vision_images_purged ?? 0
        } else if (ev.type === "error" && ev.error) {
          reply.text = reply.text || "请求异常：" + ev.error
        }
      })
      if (!reply.text.trim()) {
        reply.text = "已完成排版操作，请在右侧查看最新预览。"
      }
      await Promise.all([refreshFormats(), refreshSessions()])
    } catch (e) {
      reply.text = e instanceof Error ? e.message : String(e)
      toast(reply.text)
    } finally {
      state.busy = false
      state.busyLabel = ""
    }
  }

  async function forkBranch() {
    const fmt = activeFormat.value
    const label = "v" + (state.branches.length + 1) + " · 分支"
    try {
      await api.forkSessionBranch(label, fmt?.id ?? null)
      await Promise.all([refreshSessions(), refreshFormats()])
      toast("已创建并切换到「" + label + "」")
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    }
  }

  async function switchBranch(branchId: string) {
    try {
      await api.switchSessionBranch(branchId)
      await Promise.all([refreshSessions(), refreshFormats()])
      state.page = 1
      toast("已切换会话分支")
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    }
  }

  function downloadDocx() {
    if (!state.currentDoc?.docx_url) {
      toast("请先点击左侧「套用格式」生成 Word 文档")
      return
    }
    const a = document.createElement("a")
    a.href = state.currentDoc.docx_url
    a.download = (activeFormat.value?.name || "DocForge文档") + ".docx"
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  return {
    state,
    activeFormat,
    previewUrls,
    init,
    toast,
    selectFormat,
    uploadDraft,
    applyFormat,
    runSurgery,
    importTemplate,
    forkCurrentFormat,
    sendChat,
    forkBranch,
    switchBranch,
    downloadDocx,
  }
}

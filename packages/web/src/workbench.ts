import { computed, reactive } from "vue"
import type { ComposePlan, SessionSummary, SessionTimelineEvent } from "@docs-agent/shared"
import * as api from "./api.js"
import {
  CATEGORY_LABELS,
  cleanSlotLabel,
  extractDocTitle,
  normalizeCategory,
  STARTER_DRAFTS,
  TOOL_FRIENDLY_LABELS,
  type ActiveSessionRecord,
  type BackgroundImportState,
  type CategoryId,
  type DocumentResult,
  type DropdownId,
  type FormatOption,
  type HealthInfo,
  type MappingRow,
  type RawAgentMessage,
  type SessionsPayload,
  type SettingsPatch,
  type SettingsResponse,
  type TimelineItem,
  type UsageSnapshot,
} from "./types.js"

const BUILTIN_ID = "builtin-standard-doc"

function parseTimeline(
  messages: RawAgentMessage[],
  events: SessionTimelineEvent[] = [],
): TimelineItem[] {
  const items: TimelineItem[] = []
  const sortedEvents = [...events].sort((a, b) => a.after_msg_count - b.after_msg_count)
  let evCursor = 0

  function flushEventsUpTo(msgCount: number) {
    while (evCursor < sortedEvents.length && sortedEvents[evCursor].after_msg_count <= msgCount) {
      items.push({ kind: "event", text: sortedEvents[evCursor].text })
      evCursor++
    }
  }

  flushEventsUpTo(0)
  for (const [idx, msg] of messages.entries()) {
    if (msg.role === "user") {
      const text =
        typeof msg.content === "string"
          ? msg.content
          : msg.content.map((c) => c.text ?? "").join("")
      if (text.trim()) items.push({ kind: "user", text })
      flushEventsUpTo(idx + 1)
      continue
    }
    let last = items.at(-1)
    if (!last || last.kind !== "assistant") {
      last = { kind: "assistant", text: "", collapsed: true, steps: [] }
      items.push(last)
    }
    if (msg.role === "toolResult") {
      const rawName = msg.toolName ?? "tool"
      const friendly = TOOL_FRIENDLY_LABELS[rawName] ?? "执行排版处理"
      last.steps.push({
        status: msg.isError ? "warn" : "ok",
        label: friendly + (msg.isError ? "（存在告警）" : ""),
        rawName,
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
    flushEventsUpTo(idx + 1)
  }
  while (evCursor < sortedEvents.length) {
    items.push({ kind: "event", text: sortedEvents[evCursor].text })
    evCursor++
  }
  return items
}

function buildMappings(plan: ComposePlan | undefined, paragraphs: string[]): MappingRow[] {
  if (!plan?.length || !paragraphs.length) return []
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
    debugDrawerOpen: false,
    narrowPane: "edit" as "edit" | "preview",
    unreadPreview: false,
    openDropdown: null as DropdownId,
    popoverCat: "all" as CategoryId,
    importOpen: false,
    importInitialFile: null as File | null,
    settingsOpen: false,
    settingsSaving: false,
    settingsData: null as SettingsResponse | null,
    bannerDismissed: false,
    mode: "copy" as "copy" | "chat",
    drawerTab: "telemetry" as "telemetry" | "ooxml" | "vision",
    visionEnabled: true,
    zoom: 1,
    page: 1,
    docVersion: 1,
    busy: false,
    busyKind: null as "copy" | "chat" | "surgery" | null,
    busyLabel: "",
    elapsedSec: 0,
    toastText: "",
    sessions: [] as SessionSummary[],
    activeSessionId: "",
    sessionName: "未命名文档",
    autoNamed: true,
    templateId: BUILTIN_ID,
    draftText: "",
    slotValues: {} as Record<string, string>,
    generateCover: false,
    generateToc: false,
    normalizePunct: true,
    currentDoc: null as DocumentResult | null,
    previewStale: false,
    timeline: [] as TimelineItem[],
    mappings: [] as MappingRow[],
    lastTokenDelta: 0,
    purgedImages: 0,
    isolatedPages: 0,
    health: null as HealthInfo | null,
    formats: [] as FormatOption[],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      cached_tokens: 0,
      total_tokens: 0,
      cost_usd: 0,
    } as UsageSnapshot,
    bgImport: null as BackgroundImportState | null,
  })

  let toastTimer: ReturnType<typeof setTimeout> | undefined
  let saveDebounceTimer: ReturnType<typeof setTimeout> | undefined
  let activeAbort: AbortController | null = null
  let elapsedTimer: ReturnType<typeof setInterval> | undefined
  let bgImportAbort: AbortController | null = null
  let bgImportTimer: ReturnType<typeof setInterval> | undefined

  function toast(msg: string) {
    state.toastText = msg
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => {
      state.toastText = ""
    }, 2600)
  }

  const activeFormat = computed<FormatOption | undefined>(
    () => state.formats.find((f) => f.id === state.templateId) ?? state.formats[0],
  )

  const suggestedDocxName = computed(() => {
    const title = extractDocTitle(state.slotValues, state.draftText, state.sessionName)
    return title + ".docx"
  })

  const previewUrls = computed(() =>
    (state.currentDoc?.preview_urls ?? []).map((u) => u + "?v=" + state.docVersion),
  )

  const samplePreviewUrls = computed(() =>
    (activeFormat.value?.sampleUrls ?? []).map((u) => u + "?v=" + state.docVersion),
  )

  function startBusy(kind: "copy" | "chat" | "surgery", initialLabel: string) {
    if (activeAbort) activeAbort.abort()
    activeAbort = new AbortController()
    state.busy = true
    state.busyKind = kind
    state.busyLabel = initialLabel
    state.elapsedSec = 0
    if (elapsedTimer) clearInterval(elapsedTimer)
    elapsedTimer = setInterval(() => {
      state.elapsedSec++
    }, 1000)
    return activeAbort
  }

  function finishBusy() {
    if (elapsedTimer) clearInterval(elapsedTimer)
    elapsedTimer = undefined
    activeAbort = null
    state.busy = false
    state.busyKind = null
    state.busyLabel = ""
  }

  function stopActiveTask(silent = false) {
    if (!state.busy) return
    const wasChat = state.busyKind === "chat"
    activeAbort?.abort()
    finishBusy()
    if (wasChat) {
      const last = state.timeline.at(-1)
      if (last && last.kind === "assistant" && last.streaming) {
        last.streaming = false
        last.collapsed = true
        last.elapsed = state.elapsedSec
        if (!last.text.trim()) {
          last.text = "已按您的指令停止本次生成，右侧保留停止前最近一次完好预览与底稿。"
        }
      }
    }
    if (!silent) toast("已停止当前任务，原有完好预览与草稿已保留")
  }

  function hydrateActiveSession(active: ActiveSessionRecord) {
    state.activeSessionId = active.id
    state.sessionName = active.name
    state.autoNamed = active.auto_named
    state.templateId = active.template_id || BUILTIN_ID
    state.draftText = active.draft_text ?? ""
    state.slotValues = { ...(active.slot_values ?? {}) }
    state.generateCover = Boolean(active.generate_cover)
    state.generateToc = Boolean(active.generate_toc)
    state.normalizePunct = active.normalize_punct !== false
    state.currentDoc = active.current_doc ?? null
    state.previewStale = Boolean(active.preview_stale)
    state.timeline = parseTimeline(active.messages ?? [], active.events ?? [])
    const paras = state.draftText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
    state.mappings = buildMappings(state.currentDoc?.body_plan, paras)
    state.docVersion++
    state.page = 1
    void ensureFormatSamples(state.templateId)
  }

  function applySessionsPayload(payload: SessionsPayload, fullHydrate = true) {
    state.sessions = payload.sessions
    if (fullHydrate) {
      hydrateActiveSession(payload.active)
    } else {
      state.sessionName = payload.active.name
      state.autoNamed = payload.active.auto_named
      state.previewStale = payload.active.preview_stale
    }
  }

  function mapAssetToOption(t: FormatOption["asset"]): FormatOption {
    const cat = normalizeCategory(t.category)
    const hasCover =
      Boolean(t.blueprint.cover_builder?.enabled) ||
      t.blueprint.fields.length >= 3 ||
      t.blueprint.preserved.some((p) => p.includes("封面") || p.includes("版头"))
    const hasToc =
      t.style_dna.has_existing_toc ||
      t.blueprint.toc?.mode === "generate" ||
      t.blueprint.toc?.mode === "refresh_existing"
    return {
      id: t.id,
      name: t.name,
      builtin: t.id === BUILTIN_ID,
      category: cat,
      categoryLabel: CATEGORY_LABELS[cat],
      hasCover,
      hasToc,
      desc:
        "保留：" +
        (t.blueprint.preserved.length ? t.blueprint.preserved.join(" · ") : "原件母版壳与样式"),
      fields: t.blueprint.fields.map((f) => ({
        name: f.name,
        label: cleanSlotLabel(f),
        sample: f.sample,
      })),
      contentSlots: t.blueprint.content_slots.map((s) => s.name),
      prototypes: Object.keys(t.blueprint.prototypes),
      preserved: t.blueprint.preserved,
      capabilityCard: t.capability_card,
      sampleUrls: t.sample_urls ?? [],
      asset: t,
    }
  }

  async function refreshFormats() {
    const data = await api.fetchTemplates()
    state.usage = data.usage
    state.formats = data.templates.map(mapAssetToOption)
  }

  async function ensureFormatSamples(formatId: string) {
    const fmt = state.formats.find((f) => f.id === formatId)
    if (!fmt || fmt.sampleUrls.length > 0) return
    try {
      const res = await api.fetchTemplateSamples(formatId)
      const target = state.formats.find((f) => f.id === formatId)
      if (target) target.sampleUrls = res.sample_urls
    } catch {
      // Non-fatal if soffice preview fails
    }
  }

  async function init() {
    const [health, , sessPayload] = await Promise.all([
      api.fetchHealth(),
      refreshFormats(),
      api.fetchSessions(),
    ])
    state.health = health
    state.visionEnabled = health.vision_mode !== "text_only"
    applySessionsPayload(sessPayload, true)
  }

  function scheduleWorkspaceSave() {
    if (saveDebounceTimer) clearTimeout(saveDebounceTimer)
    const targetId = state.activeSessionId
    if (!targetId) return
    saveDebounceTimer = setTimeout(async () => {
      try {
        const res = await api.patchSession(targetId, {
          draft_text: state.draftText,
          slot_values: state.slotValues,
          generate_cover: state.generateCover,
          generate_toc: state.generateToc,
          normalize_punct: state.normalizePunct,
        })
        if (state.activeSessionId === targetId) {
          applySessionsPayload(res, false)
        }
      } catch {
        // Ignore transient typing sync errors
      }
    }, 400)
  }

  function updateDraftText(text: string) {
    state.draftText = text
    if (!text.trim()) state.mappings = []
    scheduleWorkspaceSave()
  }

  function updateSlotValue(key: string, val: string) {
    state.slotValues[key] = val
    scheduleWorkspaceSave()
  }

  function fillStarterDraft() {
    const cat = activeFormat.value?.category ?? "gongwen"
    updateDraftText(STARTER_DRAFTS[cat])
    toast("已填入示例正文，可直接点击套用格式或按需修改")
  }

  async function createBlankSession() {
    if (state.busy) stopActiveTask(true)
    state.openDropdown = null
    try {
      const res = await api.createSession({ template_id: state.templateId })
      applySessionsPayload(res, true)
      toast("已新建空白文档会话")
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    }
  }

  async function switchSession(id: string) {
    if (id === state.activeSessionId) {
      state.openDropdown = null
      return
    }
    if (state.busy) stopActiveTask(true)
    state.openDropdown = null
    try {
      const res = await api.switchActiveSession(id)
      applySessionsPayload(res, true)
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    }
  }

  async function forkCurrentSession() {
    if (!state.activeSessionId) return
    try {
      const res = await api.forkSession(state.activeSessionId)
      applySessionsPayload(res, true)
      toast("已分叉当前会话：「" + state.sessionName + "」")
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    }
  }

  async function renameSessionById(id: string, newName: string) {
    const clean = newName.trim()
    if (!clean) return
    try {
      const res = await api.patchSession(id, { name: clean })
      state.sessions = res.sessions
      if (id === state.activeSessionId) {
        state.sessionName = res.active.name
        state.autoNamed = false
      }
      toast("已重命名文档会话")
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    }
  }

  async function deleteSessionById(id: string) {
    try {
      const res = await api.deleteSession(id)
      const switched = res.active_session_id !== state.activeSessionId || state.sessions.length <= 1
      applySessionsPayload(res, switched)
      toast("已删除文档会话")
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    }
  }

  async function selectFormat(option: FormatOption) {
    state.openDropdown = null
    if (option.id === state.templateId) return
    try {
      const res = await api.patchSession(state.activeSessionId, {
        template_id: option.id,
      })
      state.sessions = res.sessions
      state.templateId = res.active.template_id
      state.previewStale = res.active.preview_stale
      state.timeline = parseTimeline(res.active.messages ?? [], res.active.events ?? [])
      state.page = 1
      void ensureFormatSamples(option.id)
      toast("当前文档已切换为「" + option.name + "」")
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    }
  }

  async function renameFormat(id: string, name: string) {
    const clean = name.trim()
    if (!clean) return
    try {
      await api.updateTemplate(id, { name: clean })
      await refreshFormats()
      const sessRes = await api.fetchSessions()
      state.sessions = sessRes.sessions
      toast("已更新格式名称")
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    }
  }

  async function updateFormatCategory(id: string, category: Exclude<CategoryId, "all">) {
    try {
      await api.updateTemplate(id, { category })
      await refreshFormats()
      toast("已修改格式分类为「" + CATEGORY_LABELS[category] + "」")
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    }
  }

  async function duplicateFormat(id: string) {
    const src = state.formats.find((f) => f.id === id)
    if (!src) return
    try {
      await api.forkTemplateAsset(id, src.name + "（副本）")
      await refreshFormats()
      toast("已复制格式「" + src.name + "（副本）」")
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    }
  }

  async function removeFormat(id: string) {
    try {
      await api.deleteTemplate(id)
      await refreshFormats()
      const sessRes = await api.fetchSessions()
      applySessionsPayload(sessRes, sessRes.active.template_id !== state.templateId)
      toast("已删除格式模板")
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    }
  }

  async function uploadDraft(file: File) {
    const ctl = startBusy("copy", "正在读取草稿文件…")
    try {
      const res = await api.ingestDraftFile(file)
      if (!ctl.signal.aborted) {
        updateDraftText(res.paragraphs.join("\n"))
        toast("已导入草稿（共 " + res.count + " 段 · " + res.characters + " 字）")
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    } finally {
      finishBusy()
    }
  }

  async function applyFormat() {
    const fmt = activeFormat.value
    if (!fmt || !state.draftText.trim() || state.busy) {
      if (!state.draftText.trim()) toast("请先输入或导入正文内容")
      return
    }
    const ctl = startBusy("copy", "正在切分草稿段落结构…")
    const prevTokens = state.usage.total_tokens
    try {
      await api.streamComposeDocument(
        {
          session_id: state.activeSessionId,
          template_id: fmt.id,
          draft_text: state.draftText,
          slot_values: state.slotValues,
          normalize_punctuation: state.normalizePunct,
          generate_cover: state.generateCover,
          generate_toc: state.generateToc,
          run_vision: state.visionEnabled,
        },
        ctl.signal,
        (ev) => {
          if (ev.type === "phase" && ev.label) {
            state.busyLabel = ev.label
          } else if (ev.type === "done" && ev.result) {
            const doc = ev.result as DocumentResult
            state.currentDoc = doc
            state.previewStale = false
            state.mappings = buildMappings(doc.body_plan, ev.paragraphs ?? [])
            if (ev.usage) {
              state.usage = ev.usage
              state.lastTokenDelta = Math.max(0, ev.usage.total_tokens - prevTokens)
            }
            if (ev.session) {
              state.sessionName = ev.session.name
              state.autoNamed = ev.session.auto_named
            }
            state.docVersion++
            state.page = 1
            state.narrowPane = "preview"
            state.unreadPreview = false
            toast("已按「" + fmt.name + "」完成排版（耗时 " + Math.max(1, state.elapsedSec) + "s）")
          } else if (ev.type === "error" && ev.error) {
            throw new Error(ev.error)
          }
        },
      )
      const sessRes = await api.fetchSessions()
      state.sessions = sessRes.sessions
    } catch (e) {
      if (!ctl.signal.aborted) {
        toast(e instanceof Error ? e.message : String(e))
      }
    } finally {
      if (activeAbort === ctl) finishBusy()
    }
  }

  async function runSurgery(kind: "compact" | "orphan" | "tighten" | "vision") {
    if (!state.currentDoc || state.busy) {
      if (!state.currentDoc) toast("请先套用格式或生成一份文档")
      return
    }
    state.openDropdown = null
    const ctl = startBusy(
      "surgery",
      kind === "vision" ? "正在执行关键页视觉核查…" : "正在微调跨页版面…",
    )
    try {
      if (kind === "vision") {
        state.visionEnabled = true
        const res = await api.visualAuditDocument(
          state.currentDoc.doc_id,
          true,
          state.activeSessionId,
        )
        state.currentDoc.vision = res.vision
        state.drawerTab = "vision"
        toast(
          res.vision.status === "skipped_no_vision_model"
            ? "未配置视觉模型，已使用版面几何遥测核验"
            : "已完成关键页视觉核查",
        )
        return
      }
      const ops =
        kind === "compact"
          ? [{ type: "compact_pages" as const }]
          : kind === "orphan"
            ? [{ type: "prevent_orphan_signature" as const }]
            : [{ type: "line_spacing_delta" as const, delta: -1 }]
      const updated = await api.adjustDocumentLayout(
        state.currentDoc.doc_id,
        ops,
        state.activeSessionId,
      )
      state.currentDoc.layout = updated.layout
      state.currentDoc.preview_urls = updated.preview_urls
      state.docVersion++
      const total = updated.layout?.total_pages ?? 1
      if (state.page > total) state.page = total
      const sessRes = await api.fetchSessions()
      state.sessions = sessRes.sessions
      toast("已完成版面微调（当前共 " + total + " 页）")
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    } finally {
      if (activeAbort === ctl) finishBusy()
    }
  }

  function startBackgroundImport(
    file: File,
    name: string,
    category: Exclude<CategoryId, "all">,
    rules: string,
  ) {
    if (bgImportAbort) bgImportAbort.abort()
    if (bgImportTimer) clearInterval(bgImportTimer)

    const cleanName = name.trim() || file.name.replace(/\.docx?$/i, "") || "新导入格式"
    state.importOpen = false
    bgImportAbort = new AbortController()
    const myAbort = bgImportAbort

    state.bgImport = {
      name: cleanName,
      category,
      phase: "正在解析原件版式…",
      elapsedSec: 0,
      done: false,
    }
    bgImportTimer = setInterval(() => {
      if (state.bgImport && !state.bgImport.done) state.bgImport.elapsedSec++
    }, 1000)

    toast("「" + cleanName + "」已转入后台自检入库，可继续编写当前文档")

    void (async () => {
      try {
        await api.streamImportTemplate(
          file,
          cleanName,
          category,
          rules,
          myAbort.signal,
          (ev) => {
            if (!state.bgImport || bgImportAbort !== myAbort) return
            if (ev.type === "phase" && ev.label) {
              state.bgImport.phase = ev.label
            } else if (ev.type === "sample" && ev.sample_urls?.[0]) {
              state.bgImport.sampleUrl = ev.sample_urls[0]
            } else if (ev.type === "done" && ev.template) {
              state.bgImport.done = true
              state.bgImport.phase = "已入库就绪"
              state.bgImport.templateId = ev.template.id
              if (ev.usage) state.usage = ev.usage
            } else if (ev.type === "error" && ev.error) {
              throw new Error(ev.error)
            }
          },
        )
        if (bgImportAbort === myAbort) {
          await refreshFormats()
          toast("新格式「" + cleanName + "」已入库，可在顶栏一键应用")
        }
      } catch (e) {
        if (!myAbort.signal.aborted && state.bgImport && bgImportAbort === myAbort) {
          state.bgImport.done = true
          state.bgImport.error = e instanceof Error ? e.message : String(e)
          toast("导入失败：" + state.bgImport.error)
        }
      } finally {
        if (bgImportAbort === myAbort && bgImportTimer) {
          clearInterval(bgImportTimer)
          bgImportTimer = undefined
        }
      }
    })()
  }

  function cancelOrDismissBgImport() {
    bgImportAbort?.abort()
    bgImportAbort = null
    if (bgImportTimer) clearInterval(bgImportTimer)
    bgImportTimer = undefined
    const wasRunning = state.bgImport && !state.bgImport.done
    state.bgImport = null
    if (wasRunning) toast("已取消后台模板导入")
  }

  async function applyBgImportedTemplate() {
    const tplId = state.bgImport?.templateId
    state.bgImport = null
    const fmt = tplId ? state.formats.find((f) => f.id === tplId) : undefined
    if (fmt) await selectFormat(fmt)
  }

  async function sendChat(prompt: string) {
    const clean = prompt.trim()
    if (!clean || state.busy) return
    const ctl = startBusy("chat", "正在结合当前底稿理解需求…")
    state.timeline.push({ kind: "user", text: clean })
    const reply: Extract<TimelineItem, { kind: "assistant" }> = {
      kind: "assistant",
      text: "",
      streaming: true,
      collapsed: false,
      elapsed: 0,
      steps: [],
    }
    state.timeline.push(reply)

    try {
      await api.streamChat(
        {
          session_id: state.activeSessionId,
          prompt: clean,
          vision_enabled: state.visionEnabled,
        },
        ctl.signal,
        (ev) => {
          if (ev.type === "phase" && ev.label) {
            state.busyLabel = ev.label
          } else if (ev.type === "text" && ev.text) {
            reply.text += ev.text
          } else if (ev.type === "tool") {
            const rawName = String(ev.name ?? "tool")
            const friendly = TOOL_FRIENDLY_LABELS[rawName] ?? "执行排版操作"
            if (ev.phase === "start") {
              reply.steps.push({ status: "running", label: friendly, rawName })
            } else {
              const running = [...reply.steps]
                .reverse()
                .find((s) => s.rawName === rawName && s.status === "running")
              if (running) {
                running.status = ev.isError ? "warn" : "ok"
              } else {
                reply.steps.push({
                  status: ev.isError ? "warn" : "ok",
                  label: friendly,
                  rawName,
                })
              }
            }
          } else if (ev.type === "template" && ev.template_id) {
            state.templateId = ev.template_id
            state.docVersion++
            const latestEv = Array.isArray(ev.events) ? ev.events.at(-1) : undefined
            if (latestEv?.text) {
              const idx = state.timeline.indexOf(reply)
              if (idx >= 0) {
                state.timeline.splice(idx, 0, { kind: "event", text: latestEv.text })
              }
            }
            void refreshFormats()
          } else if (ev.type === "workspace_sync") {
            if (typeof ev.draft_text === "string") state.draftText = ev.draft_text
            if (ev.slot_values) state.slotValues = { ...ev.slot_values }
            if (ev.session_name) state.sessionName = ev.session_name
            if (typeof ev.auto_named === "boolean") state.autoNamed = ev.auto_named
            if (ev.doc) {
              state.currentDoc = ev.doc
              state.previewStale = false
              state.docVersion++
              state.page = 1
              state.unreadPreview = true
            }
          } else if (ev.type === "usage" && ev.usage) {
            state.usage = ev.usage
          } else if (ev.type === "layout" && ev.layout) {
            const warnCount = ev.layout.warnings?.length ?? 0
            reply.steps.push({
              status: warnCount ? "warn" : "ok",
              label:
                "版面核查：共 " +
                ev.layout.total_pages +
                " 页" +
                (warnCount ? "（" + ev.layout.warnings[0].message + "）" : "（跨页均衡）"),
            })
            if (state.currentDoc) state.currentDoc.layout = ev.layout
          } else if (ev.type === "vision" && ev.vision) {
            if (ev.vision.status !== "skipped_no_vision_model") {
              reply.steps.push({
                status: ev.vision.status === "issues" ? "warn" : "ok",
                label:
                  ev.vision.status === "issues" ? "视觉核查发现版面细节建议" : "关键页视觉核查通过",
              })
            }
            if (state.currentDoc) state.currentDoc.vision = ev.vision
          } else if (ev.type === "document" && ev.result) {
            state.currentDoc = ev.result
            state.previewStale = false
            reply.docUrl = ev.result.docx_url
            reply.docPages =
              ev.result.preview_urls?.length || ev.result.layout?.total_pages || 1
            state.docVersion++
            state.page = 1
            state.unreadPreview = true
          } else if (ev.type === "done") {
            state.isolatedPages += ev.vision_pages_isolated ?? 0
            state.purgedImages += ev.vision_images_purged ?? 0
            if (ev.session_name) state.sessionName = ev.session_name
          } else if (ev.type === "error" && ev.error) {
            reply.text = reply.text || "处理未能完成：" + ev.error
          }
        },
      )
      if (!ctl.signal.aborted) {
        reply.streaming = false
        reply.collapsed = true
        reply.elapsed = Math.max(1, state.elapsedSec)
        if (!reply.text.trim()) {
          reply.text = "已完成排版并同步回填至左侧编辑器，请在右侧查看最新预览。"
        }
        const [, sessRes] = await Promise.all([refreshFormats(), api.fetchSessions()])
        state.sessions = sessRes.sessions
      }
    } catch (e) {
      if (!ctl.signal.aborted) {
        reply.streaming = false
        reply.collapsed = true
        reply.text = e instanceof Error ? e.message : String(e)
        toast(reply.text)
      }
    } finally {
      if (activeAbort === ctl) finishBusy()
    }
  }

  async function loadSettings() {
    try {
      state.settingsData = await api.fetchSettings()
    } catch (e) {
      toast("加载设置失败：" + (e instanceof Error ? e.message : String(e)))
    }
  }

  async function openSettings() {
    state.openDropdown = null
    state.settingsOpen = true
    await loadSettings()
  }

  async function saveSettings(patch: SettingsPatch) {
    state.settingsSaving = true
    try {
      const res = await api.updateSettings(patch)
      state.settingsData = res
      if (res.health) {
        state.health = res.health
        state.visionEnabled = res.health.vision_mode !== "text_only"
      }
      state.settingsOpen = false
      toast("设置已保存并立即生效")
    } catch (e) {
      toast("保存设置失败：" + (e instanceof Error ? e.message : String(e)))
    } finally {
      state.settingsSaving = false
    }
  }

  async function downloadDocx(customUrl?: string) {
    const url = customUrl || state.currentDoc?.docx_url
    if (!url) {
      toast("请先套用格式或通过 AI 生成文档后再下载")
      return
    }
    const desktop = window.docforgeDesktop
    if (desktop) {
      try {
        const res = await desktop.saveDocxAs(url, suggestedDocxName.value)
        if (!res.canceled && res.filePath) {
          toast("已保存到：" + res.filePath)
        }
      } catch (e) {
        toast("保存失败：" + (e instanceof Error ? e.message : String(e)))
      }
      return
    }
    const a = document.createElement("a")
    a.href = url
    a.download = suggestedDocxName.value
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  async function openDocInLocalApp(customUrl?: string) {
    const url = customUrl || state.currentDoc?.docx_url
    if (!url || !window.docforgeDesktop) return
    try {
      await window.docforgeDesktop.openDocInApp(url, suggestedDocxName.value)
      toast("正在用本机默认程序打开文档…")
    } catch (e) {
      toast("打开失败：" + (e instanceof Error ? e.message : String(e)))
    }
  }

  async function revealDocInLocalFolder(customUrl?: string) {
    const url = customUrl || state.currentDoc?.docx_url
    if (!url || !window.docforgeDesktop) return
    try {
      await window.docforgeDesktop.revealDocInFolder(url, suggestedDocxName.value)
    } catch (e) {
      toast("定位文件失败：" + (e instanceof Error ? e.message : String(e)))
    }
  }

  return {
    state,
    activeFormat,
    suggestedDocxName,
    previewUrls,
    samplePreviewUrls,
    init,
    toast,
    stopActiveTask,
    updateDraftText,
    updateSlotValue,
    fillStarterDraft,
    createBlankSession,
    switchSession,
    forkCurrentSession,
    renameSessionById,
    deleteSessionById,
    selectFormat,
    renameFormat,
    updateFormatCategory,
    duplicateFormat,
    removeFormat,
    uploadDraft,
    applyFormat,
    runSurgery,
    startBackgroundImport,
    cancelOrDismissBgImport,
    applyBgImportedTemplate,
    sendChat,
    downloadDocx,
    openDocInLocalApp,
    revealDocInLocalFolder,
    loadSettings,
    openSettings,
    saveSettings,
  }
}

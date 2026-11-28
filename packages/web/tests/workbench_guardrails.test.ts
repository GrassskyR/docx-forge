import { expect, test, vi } from "vitest"
import type { TemplateAsset } from "@docs-agent/shared"
import type { SessionsPayload } from "../src/types.js"

function makeAsset(id: string, name: string): TemplateAsset {
  return {
    id,
    name,
    category: "gongwen",
    parent_id: null,
    created_at: Date.now(),
    updated_at: Date.now(),
    rules_md: "",
    capability_card: "card",
    sample_urls: ["/s1.png"],
    style_dna: {
      page_width_twips: 11906,
      page_height_twips: 16838,
      margins_twips: { top: 1440, bottom: 1440, left: 1800, right: 1440, header: 851, footer: 992 },
      has_existing_toc: false,
      fonts: ["FangSong"],
    },
    blueprint: {
      template_kind: "flowing",
      fields: [],
      content_slots: [{ name: "body", start: "B0", end: "B0", placement: "replace" }],
      remove_targets: [],
      must_preserve: [],
      prototypes: { body: "B0" },
      preserved: ["原件样式"],
      cover_builder: null,
      toc: null,
      grid: null,
    },
  } as unknown as TemplateAsset
}

test("useWorkbench 侧边栏折叠持久化、清空对话与三处防上下文污染护栏状态机", async () => {
  const storage = new Map<string, string>()
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
  })
  vi.stubGlobal("window", { innerWidth: 1440 })

  const sessions = new Map<string, SessionsPayload["active"]>()
  let activeId = "s1"
  sessions.set("s1", {
    id: "s1",
    parent_id: null,
    name: "未命名文档",
    auto_named: true,
    template_id: "builtin-standard-doc",
    updated_at: Date.now(),
    draft_text: "",
    slot_values: {},
    generate_cover: false,
    generate_toc: false,
    normalize_punct: true,
    current_doc: null,
    preview_stale: false,
    events: [],
    messages: [],
  })

  function buildPayload(id = activeId): SessionsPayload {
    const active = structuredClone(sessions.get(id)!)
    return {
      active_session_id: active.id,
      active,
      sessions: [...sessions.values()].map((s) => ({
        id: s.id,
        parent_id: s.parent_id,
        name: s.name,
        auto_named: s.auto_named,
        template_id: s.template_id,
        template_name: s.template_id === "tpl-2" ? "高校实验报告" : "通用标准文档格式",
        updated_at: s.updated_at,
        message_count: s.messages.filter((m) => m.role === "user" || m.role === "assistant").length,
        has_draft: s.draft_text.trim().length > 0,
      })),
    }
  }

  vi.doMock("../src/api.js", () => ({
    fetchHealth: async () => ({
      service: "ok",
      sqlite: "ok",
      libreoffice: true,
      pdftoppm: true,
      llm_configured: true,
      vision_mode: "text_only",
    }),
    fetchTemplates: async () => ({
      templates: [
        makeAsset("builtin-standard-doc", "通用标准文档格式"),
        makeAsset("tpl-2", "高校实验报告"),
      ],
      usage: { prompt_tokens: 0, completion_tokens: 0, cached_tokens: 0, total_tokens: 0, cost_usd: 0 },
    }),
    fetchSessions: async () => buildPayload(),
    ingestDraftFile: async (file: File) => ({
      draft_id: "d1",
      count: 2,
      characters: 18,
      paragraphs: [file.name.replace(/\.[^.]+$/, ""), "正文第一段内容"],
    }),
    createSession: async (opts?: { template_id?: string }) => {
      const id = "s-" + (sessions.size + 1)
      sessions.set(id, {
        id,
        parent_id: null,
        name: "未命名文档",
        auto_named: true,
        template_id: opts?.template_id || "builtin-standard-doc",
        updated_at: Date.now(),
        draft_text: "",
        slot_values: {},
        generate_cover: false,
        generate_toc: false,
        normalize_punct: true,
        current_doc: null,
        preview_stale: false,
        events: [],
        messages: [],
      })
      activeId = id
      return buildPayload(id)
    },
    patchSession: async (id: string, patch: Record<string, unknown>) => {
      const cur = sessions.get(id)!
      if (typeof patch.draft_text === "string") {
        cur.draft_text = patch.draft_text
        const first = patch.draft_text.split("\n")[0]?.trim()
        if (cur.auto_named && first) cur.name = first
      }
      if (patch.slot_values !== undefined) {
        cur.slot_values = patch.slot_values as Record<string, string>
      }
      if (typeof patch.template_id === "string") {
        cur.template_id = patch.template_id
        if (cur.messages.length > 0) {
          cur.events.push({
            after_msg_count: cur.messages.length,
            text: "已切换模板",
            timestamp: Date.now(),
          })
        }
      }
      return buildPayload(id)
    },
    clearSessionChat: async (id: string) => {
      const cur = sessions.get(id)!
      cur.messages = []
      cur.events = []
      return buildPayload(id)
    },
    switchActiveSession: async (id: string) => {
      activeId = id
      return buildPayload(id)
    },
  }))

  const { useWorkbench } = await import("../src/workbench.js")
  const wb = useWorkbench()
  await wb.init()

  // 1. Desktop sidebar toggle & localStorage persistence + narrow drawer toggle
  expect(wb.state.sidebarOpen).toBe(true)
  wb.toggleSidebar()
  expect(wb.state.sidebarOpen).toBe(false)
  expect(storage.get("docforge.sidebarOpen")).toBe("0")

  ;(globalThis as unknown as { window: { innerWidth: number } }).window.innerWidth = 768
  wb.toggleSidebar()
  expect(wb.state.sidebarDrawerOpen).toBe(true)
  ;(globalThis as unknown as { window: { innerWidth: number } }).window.innerWidth = 1440

  // 2. Empty session imports draft directly without opening guard modal
  const f1 = new File(["a"], "通知初稿.txt", { type: "text/plain" })
  wb.requestImportDraft(f1)
  expect(wb.state.pendingDraftFile).toBeNull()
  await vi.waitFor(() => expect(wb.state.draftText).toContain("通知初稿"))

  // 3. Seed chat history -> switching template triggers templateSwitchGuard
  const s1 = sessions.get("s1")!
  s1.slot_values = { author: "王五" }
  s1.messages = [
    { role: "user", content: "润色一下" },
    { role: "assistant", content: [{ type: "text", text: "已润色完成" }] },
  ]
  await wb.switchSession("s1")
  // Force re-hydrate with messages via selectFormat
  const fmt2 = wb.state.formats.find((f) => f.id === "tpl-2")!
  await wb.selectFormat(fmt2)
  expect(wb.chatMessageCount.value).toBe(2)
  expect(wb.state.templateSwitchGuard).toBe(true)

  // 4. Non-empty session triggers import guard modal -> choose "new_session"
  const f2 = new File(["b"], "网络安全演练方案.docx")
  wb.requestImportDraft(f2)
  expect(wb.state.pendingDraftFile?.name).toBe("网络安全演练方案.docx")
  wb.confirmPendingDraftImport("new_session")
  await vi.waitFor(() => expect(wb.state.activeSessionId).toBe("s-2"))
  expect(wb.state.draftText).toContain("网络安全演练方案")
  expect(wb.chatMessageCount.value).toBe(0)
  expect(sessions.get("s1")?.draft_text).toContain("通知初稿")
  expect(sessions.get("s1")?.messages.length).toBe(2)

  // 5. Switch back to s1 -> clearDraft sets draftClearedNotice -> clearCurrentChat preserves slots
  await wb.switchSession("s1")
  expect(wb.chatMessageCount.value).toBe(2)
  wb.clearDraft()
  expect(wb.state.draftClearedNotice).toBe(true)
  await wb.clearCurrentChat()
  expect(wb.chatMessageCount.value).toBe(0)
  expect(wb.state.draftClearedNotice).toBe(false)
  expect(wb.state.templateSwitchGuard).toBe(false)
  expect(wb.state.slotValues).toEqual({ author: "王五" })

  // 6. Verify overwrite_keep and overwrite_clear modes on non-empty session
  s1.messages = [
    { role: "user", content: "继续改稿" },
    { role: "assistant", content: [{ type: "text", text: "好的" }] },
  ]
  s1.draft_text = "旧稿正文"
  await wb.switchSession("s-2")
  await wb.switchSession("s1")
  wb.requestImportDraft(new File(["c"], "修订版草稿.txt"))
  wb.confirmPendingDraftImport("overwrite_keep")
  await vi.waitFor(() => expect(wb.state.draftText).toContain("修订版草稿"))
  expect(wb.chatMessageCount.value).toBe(2)
  expect(wb.state.slotValues).toEqual({ author: "王五" })

  wb.requestImportDraft(new File(["d"], "全新文章.txt"))
  wb.confirmPendingDraftImport("overwrite_clear")
  await vi.waitFor(() => expect(wb.state.draftText).toContain("全新文章"))
  expect(wb.chatMessageCount.value).toBe(0)
  expect(wb.state.slotValues).toEqual({})
  vi.unstubAllGlobals()
})

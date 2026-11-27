import { randomUUID } from "node:crypto"
import type { AgentMessage } from "@mariozechner/pi-agent-core"
import {
  BUILTIN_TEMPLATE_ID,
  type Store,
  type TemplateStore,
} from "@docs-agent/engine"
import type { SessionSummary, SessionTimelineEvent } from "@docs-agent/shared"

export interface SessionNode {
  id: string
  parent_id: string | null
  name: string
  auto_named: boolean
  template_id: string
  updated_at: number
  draft_text: string
  slot_values: Record<string, string>
  generate_cover: boolean
  generate_toc: boolean
  normalize_punct: boolean
  current_doc: Record<string, unknown> | null
  preview_stale: boolean
  events: SessionTimelineEvent[]
  messages: AgentMessage[]
}

export interface SessionPatch {
  name?: string
  template_id?: string
  draft_text?: string
  slot_values?: Record<string, string>
  generate_cover?: boolean
  generate_toc?: boolean
  normalize_punct?: boolean
  current_doc?: Record<string, unknown> | null
  preview_stale?: boolean
  messages?: AgentMessage[]
  append_event?: string
  title_hint?: string
}

export function deriveSessionTitle(
  slotValues: Record<string, string>,
  draftText: string,
  hint?: string,
): string {
  const candidates = [
    slotValues.title,
    slotValues.report_title,
    hint,
    draftText
      .split(/\r?\n/)
      .map((s) => s.replace(/^#+\s*/, "").trim())
      .find((s) => s.length > 0 && s.length <= 48 && !/^[一二三四五六1-9][、.]/.test(s)),
  ]
  for (const raw of candidates) {
    const clean = (raw ?? "").replace(/[\\/:*?"<>|\r\n]+/g, " ").trim()
    if (clean && clean !== "未命名文档" && clean !== "文档标题") {
      return clean.slice(0, 28)
    }
  }
  return ""
}

export class SessionStore {
  constructor(
    private readonly store: Store,
    private readonly templates: TemplateStore,
  ) {
    this.ensureInitialSession()
  }

  private ensureInitialSession() {
    const row = this.store.db.prepare("SELECT COUNT(*) as n FROM sessions").get() as { n: number }
    if (row.n > 0) return
    this.create({ name: "未命名文档", template_id: BUILTIN_TEMPLATE_ID })
  }

  private validTemplateId(id?: string | null): string {
    if (id && this.templates.has(id)) return id
    return BUILTIN_TEMPLATE_ID
  }

  private write(node: SessionNode) {
    node.updated_at = Date.now()
    this.store.db
      .prepare("INSERT OR REPLACE INTO sessions(id,updated_at,payload) VALUES(?,?,?)")
      .run(node.id, node.updated_at, JSON.stringify(node))
  }

  private heal(node: SessionNode): SessionNode {
    const validTpl = this.validTemplateId(node.template_id)
    if (validTpl !== node.template_id) {
      node.template_id = validTpl
      if (node.current_doc) node.preview_stale = true
      this.write(node)
    }
    return node
  }

  get activeId(): string {
    const row = this.store.db
      .prepare("SELECT value FROM settings WHERE key='active_session'")
      .get() as { value: string } | undefined
    if (row) {
      const exists = this.store.db.prepare("SELECT 1 FROM sessions WHERE id=?").get(row.value)
      if (exists) return row.value
    }
    const latest = this.store.db
      .prepare("SELECT id FROM sessions ORDER BY updated_at DESC LIMIT 1")
      .get() as { id: string } | undefined
    if (latest) {
      this.setActiveId(latest.id)
      return latest.id
    }
    return this.create().id
  }

  private setActiveId(id: string) {
    this.store.db
      .prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('active_session',?)")
      .run(id)
  }

  get(id: string): SessionNode {
    const row = this.store.db
      .prepare("SELECT payload FROM sessions WHERE id=?")
      .get(id) as { payload: string } | undefined
    if (!row) throw new Error("会话不存在: " + id)
    return this.heal(JSON.parse(row.payload) as SessionNode)
  }

  active(): SessionNode {
    return this.get(this.activeId)
  }

  setActive(id: string): SessionNode {
    const node = this.get(id)
    this.setActiveId(node.id)
    return node
  }

  private summarize(node: SessionNode): SessionSummary {
    const tplId = this.validTemplateId(node.template_id)
    const tplName = this.templates.get(tplId).name
    const layout = node.current_doc?.layout as { total_pages?: number } | undefined
    const previews = node.current_doc?.preview_urls as unknown[] | undefined
    const docPages = previews?.length || layout?.total_pages
    const msgCount = node.messages.filter(
      (m) => m.role === "user" || m.role === "assistant",
    ).length
    return {
      id: node.id,
      parent_id: node.parent_id,
      name: node.name,
      auto_named: node.auto_named,
      template_id: tplId,
      template_name: tplName,
      updated_at: node.updated_at,
      message_count: msgCount,
      ...(docPages ? { doc_pages: docPages } : {}),
      has_draft: node.draft_text.trim().length > 0,
    }
  }

  list(): SessionSummary[] {
    const rows = this.store.db
      .prepare("SELECT payload FROM sessions ORDER BY updated_at DESC")
      .all() as { payload: string }[]
    return rows.map((r) => this.summarize(JSON.parse(r.payload) as SessionNode))
  }

  create(opts?: { name?: string; template_id?: string | null }): SessionNode {
    const customName = opts?.name?.trim()
    const isDefault = !customName || customName === "未命名文档"
    const node: SessionNode = {
      id: randomUUID(),
      parent_id: null,
      name: customName || "未命名文档",
      auto_named: isDefault,
      template_id: this.validTemplateId(opts?.template_id),
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
    }
    this.write(node)
    this.setActiveId(node.id)
    return node
  }

  fork(id: string, name?: string, templateId?: string | null): SessionNode {
    const src = this.get(id)
    const copy: SessionNode = {
      ...structuredClone(src),
      id: randomUUID(),
      parent_id: src.id,
      name: name?.trim() || src.name + " · 分叉",
      auto_named: false,
      template_id:
        templateId !== undefined ? this.validTemplateId(templateId) : src.template_id,
      updated_at: Date.now(),
    }
    this.write(copy)
    this.setActiveId(copy.id)
    return copy
  }

  update(id: string, patch: SessionPatch): SessionNode {
    const node = this.get(id)
    if (patch.name !== undefined && patch.name.trim()) {
      node.name = patch.name.trim().slice(0, 48)
      node.auto_named = false
    }
    if (patch.draft_text !== undefined) node.draft_text = patch.draft_text
    if (patch.slot_values !== undefined) node.slot_values = patch.slot_values
    if (patch.generate_cover !== undefined) node.generate_cover = patch.generate_cover
    if (patch.generate_toc !== undefined) node.generate_toc = patch.generate_toc
    if (patch.normalize_punct !== undefined) node.normalize_punct = patch.normalize_punct
    if (patch.messages !== undefined) node.messages = structuredClone(patch.messages)

    if (patch.template_id !== undefined) {
      const nextTpl = this.validTemplateId(patch.template_id)
      if (nextTpl !== node.template_id) {
        const hasContext =
          node.messages.length > 0 ||
          node.draft_text.trim().length > 0 ||
          Boolean(node.current_doc)
        node.template_id = nextTpl
        if (hasContext) {
          const tplName = this.templates.get(nextTpl).name
          node.events.push({
            after_msg_count: node.messages.length,
            text: `已将当前文档排版格式切换为「${tplName}」`,
            timestamp: Date.now(),
          })
        }
        if (node.current_doc && patch.current_doc === undefined) {
          node.preview_stale = true
        }
      }
    }

    if (patch.append_event) {
      node.events.push({
        after_msg_count: node.messages.length,
        text: patch.append_event,
        timestamp: Date.now(),
      })
    }

    if (patch.current_doc !== undefined) {
      node.current_doc = patch.current_doc
      node.preview_stale = patch.preview_stale ?? false
    } else if (patch.preview_stale !== undefined) {
      node.preview_stale = patch.preview_stale
    }

    if (node.auto_named) {
      const candidate = deriveSessionTitle(node.slot_values, node.draft_text, patch.title_hint)
      if (candidate) node.name = candidate
    }

    this.write(node)
    return node
  }

  delete(id: string): SessionNode {
    this.store.db.prepare("DELETE FROM sessions WHERE id=?").run(id)
    const remaining = this.store.db
      .prepare("SELECT id FROM sessions ORDER BY updated_at DESC LIMIT 1")
      .get() as { id: string } | undefined
    if (!remaining) {
      return this.create({ name: "未命名文档", template_id: BUILTIN_TEMPLATE_ID })
    }
    if (this.activeId === id) {
      this.setActiveId(remaining.id)
    }
    return this.active()
  }

  fallbackDeletedTemplate(deletedTemplateId: string) {
    const rows = this.store.db
      .prepare("SELECT payload FROM sessions")
      .all() as { payload: string }[]
    for (const r of rows) {
      const node = JSON.parse(r.payload) as SessionNode
      if (node.template_id === deletedTemplateId) {
        node.template_id = BUILTIN_TEMPLATE_ID
        if (node.current_doc) node.preview_stale = true
        this.write(node)
      }
    }
  }
}

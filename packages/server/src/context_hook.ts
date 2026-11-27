import type { AgentMessage } from "@mariozechner/pi-agent-core"
import { BUILTIN_TEMPLATE_ID, type TemplateStore } from "@docs-agent/engine"

export interface WorkspaceContextSnapshot {
  template_id?: string | null
  draft_text?: string
  slot_values?: Record<string, string>
  generate_cover?: boolean
  generate_toc?: boolean
  doc_id?: string | null
}

export function countImages(messages: AgentMessage[]) {
  return messages.reduce(
    (n, m) =>
      (m.role === "user" || m.role === "toolResult") && typeof m.content !== "string"
        ? n + m.content.filter((c) => c.type === "image").length
        : n,
    0,
  )
}

export function clearReviewedImages(messages: AgentMessage[]): AgentMessage[] {
  const reviewed = messages.findLastIndex((m) => m.role === "assistant")
  return messages.map((m, i) => {
    if (
      i >= reviewed ||
      (m.role !== "user" && m.role !== "toolResult") ||
      typeof m.content === "string"
    ) {
      return m
    }
    const image = m.content.some((c) => c.type === "image")
    if (!image) return m
    const content = m.content.map((c) =>
      c.type === "image" ? { type: "text" as const, text: "关键页图像已审阅。" } : c,
    )
    return m.role === "toolResult" ? { ...m, details: undefined, content } : { ...m, content }
  })
}

function formatWorkspaceSection(snap?: WorkspaceContextSnapshot): string {
  if (!snap) return ""
  const lines: string[] = []
  if (snap.doc_id) lines.push(`最新已生成成品 doc_id: ${snap.doc_id}`)
  const filledSlots = Object.entries(snap.slot_values ?? {}).filter(([, v]) => v?.trim())
  if (filledSlots.length) {
    lines.push(
      "用户已填元数据槽位: " +
        filledSlots.map(([k, v]) => `${k}=${JSON.stringify(v.trim())}`).join(", "),
    )
  }
  if (snap.generate_cover || snap.generate_toc) {
    const flags = [
      snap.generate_cover ? "generate_cover=true" : "",
      snap.generate_toc ? "generate_toc=true" : "",
    ].filter(Boolean)
    lines.push("用户已勾选补件开关: " + flags.join(", "))
  }
  const draft = snap.draft_text?.trim() ?? ""
  if (draft) {
    const clipped = draft.length > 12000 ? draft.slice(0, 12000) + "\n…(后略)" : draft
    lines.push("当前工作区草稿全文:\n" + clipped)
  }
  return lines.length ? "\n\n[当前文档工作区底稿]\n" + lines.join("\n") : ""
}

export function contextHook(
  templates: TemplateStore,
  getSnapshot?: () => WorkspaceContextSnapshot,
) {
  return async (messages: AgentMessage[]): Promise<AgentMessage[]> => {
    let history = clearReviewedImages(messages)
    const current = history.findLastIndex((m) => m.role === "user")
    const snap = getSnapshot?.()
    const rawTplId = snap?.template_id ?? templates.activeId
    const activeTplId = rawTplId && templates.has(rawTplId) ? rawTplId : BUILTIN_TEMPLATE_ID
    history = history.map((m, i) => {
      if (i >= current || m.role !== "toolResult") return m
      const isListing =
        m.toolName === "manage_templates" || m.toolName === "update_template"
      const prefix =
        isListing && activeTplId
          ? `[历史快照，当前激活模板为 ${activeTplId}，以顶部最新能力卡为准] `
          : ""
      const summary = m.content
        .flatMap((c) => (c.type === "text" ? [c.text.slice(0, 260)] : []))
        .join(" ")
      return {
        ...m,
        details: undefined,
        content: [{ type: "text", text: (prefix + summary).slice(0, 320) }],
      }
    })
    if (JSON.stringify(history).length > 80000) {
      const turns = history.map((m, i) => (m.role === "user" ? i : -1)).filter((i) => i >= 0)
      history = history.slice(turns.at(-5) ?? 0)
    }
    const card = activeTplId ? templates.get(activeTplId).capability_card : "[当前未激活模板]"
    const content = card + formatWorkspaceSection(snap)
    return [{ role: "user", content, timestamp: Date.now() }, ...history]
  }
}

import type { AgentMessage } from "@mariozechner/pi-agent-core"
import type { TemplateStore } from "@docs-agent/engine"

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

export function contextHook(templates: TemplateStore) {
  return async (messages: AgentMessage[]): Promise<AgentMessage[]> => {
    let history = clearReviewedImages(messages)
    const current = history.findLastIndex((m) => m.role === "user")
    const activeTplId = templates.activeId
    history = history.map((m, i) => {
      if (i >= current || m.role !== "toolResult") return m
      const isListing = m.toolName === "manage_templates"
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
    const content = activeTplId
      ? templates.get(activeTplId).capability_card
      : "[当前未激活模板]"
    return [{ role: "user", content, timestamp: Date.now() }, ...history]
  }
}

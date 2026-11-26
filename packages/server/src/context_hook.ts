import type { AgentMessage } from "@mariozechner/pi-agent-core"
import type { TemplateStore } from "@docs-agent/engine"
import type { Documents } from "./documents.js"

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
    )
      return m
    const image = m.content.some((c) => c.type === "image")
    if (!image) return m
    const content = m.content.map((c) =>
      c.type === "image" ? { type: "text" as const, text: "关键页图像已审阅。" } : c,
    )
    return m.role === "toolResult" ? { ...m, details: undefined, content } : { ...m, content }
  })
}

export function contextHook(client: Documents, templates: TemplateStore) {
  return async (messages: AgentMessage[]): Promise<AgentMessage[]> => {
    let history = clearReviewedImages(messages)
    const current = history.findLastIndex((m) => m.role === "user")
    const activeTplId = templates.activeId
    history = history.map((m, i) => {
      if (i >= current || m.role !== "toolResult") return m
      const isListing = m.toolName === "manage_templates" || m.toolName === "manage_profiles"
      const prefix =
        isListing && activeTplId
          ? "[历史旧快照，当前已激活新模板 " + activeTplId + "，请以顶部能力卡或重新查询为准] "
          : ""
      const summary = m.content
        .flatMap((c) => (c.type === "text" ? [c.text.slice(0, 180)] : []))
        .join(" ")
      return {
        ...m,
        details: undefined,
        content: [{ type: "text", text: (prefix + summary).slice(0, 240) }],
      }
    })
    if (JSON.stringify(history).length > 60000) {
      const turns = history.map((m, i) => (m.role === "user" ? i : -1)).filter((i) => i >= 0)
      history = history.slice(turns.at(-4) ?? 0)
    }
    const content = activeTplId
      ? templates.get(activeTplId).capability_card
      : "[Active Profile]\n" + JSON.stringify(client.active())
    return [{ role: "user", content, timestamp: Date.now() }, ...history]
  }
}

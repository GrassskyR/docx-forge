import type { AgentMessage } from "@mariozechner/pi-agent-core"
import { EngineClient } from "./engine_client.js"
export function contextHook(client: EngineClient) {
  return async (messages: AgentMessage[]): Promise<AgentMessage[]> => {
    try {
      const active = await client.active()
      // Keep complete user turns, never orphan an assistant tool call from its result.
      let history = messages.filter(
        (m) =>
          !(
            m.role === "user" &&
            typeof m.content === "string" &&
            m.content.startsWith("[Active Profile]")
          ),
      )
      if (JSON.stringify(history).length > 60000) {
        const indexes = history.map((m, i) => (m.role === "user" ? i : -1)).filter((i) => i >= 0)
        const cut = indexes[Math.max(0, indexes.length - 4)] || 0
        const older = history
          .slice(0, cut)
          .filter((m) => m.role === "user")
          .map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content)))
          .join("\n")
          .slice(-10000)
        history = [
          { role: "user", content: "[较早需求摘要]\n" + older, timestamp: Date.now() },
          ...history.slice(cut),
        ]
      }
      return [
        {
          role: "user",
          content: "[Active Profile]\n" + JSON.stringify(active),
          timestamp: Date.now(),
        },
        ...history,
      ]
    } catch {
      return messages
    }
  }
}

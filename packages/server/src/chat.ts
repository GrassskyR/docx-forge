import type { IncomingMessage, ServerResponse } from "node:http"
import { join } from "node:path"
import { Documents } from "./documents.js"
import { SessionTree, type SessionNode } from "./session_tree.js"
import { makeAgent } from "./agent.js"

export function chatHandler(client: Documents) {
  const tree = new SessionTree(join(client.directory, "sessions.json"))
  const agent = makeAgent(client)
  let busy = false
  async function branchState(node: SessionNode) {
    const profile = node.profile_id ? client.get(node.profile_id) : client.active()
    return { ...node, profile_id: profile.id, profile_name: profile.name }
  }
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    send: (code: number, value: unknown) => void,
  ) => {
    if (req.url === "/sessions" && req.method === "GET") {
      send(200, {
        nodes: Object.values(tree.nodes).map(({ messages, ...node }) => ({
          ...node,
          message_count: messages.length,
        })),
        current: tree.current,
        node: await branchState(tree.node),
      })
      return
    }
    if (busy) {
      send(409, { error: "当前会话正在处理请求" })
      return
    }
    let raw = ""
    for await (const chunk of req) {
      raw += chunk
      if (raw.length > 2000000) throw Error("请求过大")
    }
    const body = JSON.parse(raw || "{}")
    if (busy) {
      send(409, { error: "当前会话正在处理请求" })
      return
    }
    if (req.method === "POST" && ["/sessions/fork", "/sessions/switch"].includes(req.url || "")) {
      busy = true
      try {
        const forking = req.url === "/sessions/fork"
        const target = forking ? undefined : tree.nodes[body.id]
        if (!forking && !target) {
          send(404, { error: "分支不存在" })
          return
        }
        const active = await client.active()
        const profileId = (forking ? body.profile_id : target?.profile_id) || active.id
        const targetProfile = await client.get(profileId)
        tree.checkpoint(tree.node.messages, active.id)
        await client.setActive(targetProfile.id)
        const node = forking ? tree.fork(body.name || "新版本", profileId) : tree.switch(body.id)
        if (!node.profile_id) tree.checkpoint(node.messages, profileId)
        agent.state.messages = structuredClone(node.messages)
        send(200, { ...node, profile_name: targetProfile.name })
      } finally {
        busy = false
      }
      return
    }
    if (req.url !== "/chat" || req.method !== "POST") {
      send(404, { error: "not found" })
      return
    }
    if (!process.env.LLM_API_KEY) {
      send(503, { error: "请配置 .env 中的 LLM_API_KEY、LLM_BASE_URL、LLM_MODEL" })
      return
    }
    if (typeof body.prompt !== "string" || !body.prompt.trim()) {
      send(422, { error: "请输入对话内容" })
      return
    }
    busy = true
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive",
    })
    const event = (data: unknown) => res.write("data: " + JSON.stringify(data) + "\n\n")
    agent.state.messages = structuredClone(tree.node.messages)
    const unsubscribe = agent.subscribe((e) => {
      if (e.type === "message_update" && e.assistantMessageEvent.type === "text_delta")
        event({ type: "text", text: e.assistantMessageEvent.delta })
      if (e.type === "tool_execution_end") {
        event({ type: "tool", name: e.toolName, isError: e.isError })
        const result = e.result.details
        if (result?.docx_url) event({ type: "document", result })
      }
    })
    const timer = setTimeout(() => agent.abort(), 180000)
    try {
      await agent.prompt(body.prompt)
      if (agent.state.errorMessage) event({ type: "error", error: agent.state.errorMessage })
      tree.checkpoint(agent.state.messages, (await client.active()).id)
      event({ type: "done" })
    } catch (e) {
      event({ type: "error", error: String(e) })
    } finally {
      clearTimeout(timer)
      unsubscribe()
      busy = false
      res.end()
    }
  }
}

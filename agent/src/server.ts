import { createServer } from "node:http"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { Agent } from "@mariozechner/pi-agent-core"
import type { Model } from "@mariozechner/pi-ai"
import { EngineClient } from "./engine_client.js"
import { createTools } from "./tools.js"
import { contextHook } from "./context_hook.js"
import { SessionTree, type SessionNode } from "./session_tree.js"
const envPath = new URL("../../.env", import.meta.url)
try {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const at = line.indexOf("=")
    if (at > 0 && !line.startsWith("#"))
      process.env[line.slice(0, at).trim()] ??= line
        .slice(at + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "")
  }
} catch {}
export function makeAgent(client: EngineClient) {
  const model: Model<"openai-completions"> = {
    id: process.env.LLM_MODEL || "unconfigured",
    name: "公文模型",
    provider: "openai",
    api: "openai-completions",
    baseUrl: process.env.LLM_BASE_URL || "https://api.openai.com/v1",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 64000,
    maxTokens: 6000,
    compat: { supportsStore: false, supportsDeveloperRole: false },
  }
  return new Agent({
    initialState: {
      model,
      systemPrompt: [
        "你是智能公文格式与生成 Agent。写公文时先加载文种 Skill 再用 DocContentAST 调用 render_gongwen_docx。",
        "改写也重新编译 AST。所有格式以每轮 Active Profile 为准。只调用提供的六个工具。",
        "不得直接生成 Word 代码。生成成功须向用户说明文件与审计结果。",
      ].join("\n"),
      tools: createTools(client),
    },
    transformContext: contextHook(client),
    getApiKey: () => process.env.LLM_API_KEY,
    toolExecution: "sequential",
  })
}
export function serve(
  sessionPath = fileURLToPath(new URL("../../data/sessions.json", import.meta.url)),
  port = 8787,
) {
  const client = new EngineClient(),
    agent = makeAgent(client),
    tree = new SessionTree(sessionPath)
  let busy = false
  async function branchState(node: SessionNode) {
    const profile = node.profile_id ? await client.get(node.profile_id) : await client.active()
    return { ...node, profile_id: profile.id, profile_name: profile.name }
  }
  const server = createServer(async (req, res) => {
    const origin = req.headers.origin
    if (origin && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))
      res.setHeader("Access-Control-Allow-Origin", origin)
    res.setHeader("Vary", "Origin")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type")
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
    if (req.method === "OPTIONS") {
      res.writeHead(204)
      res.end()
      return
    }
    const send = (status: number, data: unknown) => {
      res.writeHead(status, { "content-type": "application/json; charset=utf-8" })
      res.end(JSON.stringify(data))
    }
    try {
      if (req.url === "/health") {
        send(200, { service: "ok", llm_configured: !!process.env.LLM_API_KEY })
        return
      }
      if (req.url === "/sessions" && req.method === "GET") {
        send(200, {
          nodes: Object.values(tree.nodes).map(({ messages, ...node }) => node),
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
    } catch (e) {
      if (!res.headersSent) send(400, { error: String(e) })
      else res.end()
    }
  })
  server.listen(port, "127.0.0.1")
  return server
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  serve().on("listening", () => console.log("Pi-Agent: http://localhost:8787"))
}

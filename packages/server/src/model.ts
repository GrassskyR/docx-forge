import { completeSimple, type Model } from "@mariozechner/pi-ai"
import type { FormatProfile } from "@docs-agent/shared"

export function textModel(): Model<"openai-completions"> {
  return {
    id: process.env.LLM_MODEL || "unconfigured", name: "文档排版模型", provider: "openai",
    api: "openai-completions", baseUrl: process.env.LLM_BASE_URL || "https://api.openai.com/v1",
    reasoning: false, input: ["text"], contextWindow: 64000, maxTokens: 6000,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    compat: { supportsStore: false, supportsDeveloperRole: false },
  }
}

export async function requestPatch(instruction: string, base: FormatProfile) {
  if (!process.env.LLM_MODEL) throw new Error("请配置 LLM_MODEL")
  const result = await completeSimple(textModel(), {
    systemPrompt: "解析公文格式，返回 JSON 对象 {\"patch\":{}}。仅含明确要求的 page、red_header、styles 字段。基准如下。\n" +
      JSON.stringify(base),
    messages: [{ role: "user", content: instruction, timestamp: Date.now() }],
  }, { apiKey: process.env.LLM_API_KEY })
  if (result.stopReason === "error") throw new Error(result.errorMessage)
  const output = result.content.flatMap(c => c.type === "text" ? [c.text] : []).join("")
  const { patch } = JSON.parse(output.trim().replace(/^\x60{3}(?:json)?\s*|\s*\x60{3}$/g, ""))
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("模型返回非法格式补丁")
  return patch
}

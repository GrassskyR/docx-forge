import { Billing } from "./billing.js"
import {
  completeSimple,
  type Model,
  type ImageContent,
  type TextContent,
} from "@mariozechner/pi-ai"
import type { FormatProfile } from "@docs-agent/shared"

export function textModel(): Model<"openai-completions"> {
  return {
    id: process.env.LLM_MODEL || "unconfigured",
    name: "文档排版模型",
    provider: "openai",
    api: "openai-completions",
    baseUrl: process.env.LLM_BASE_URL || "https://api.openai.com/v1",
    reasoning: false,
    input: ["text"],
    contextWindow: 64000,
    maxTokens: 6000,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    compat: { supportsStore: false, supportsDeveloperRole: false },
  }
}

export async function requestPatch(instruction: string, base: FormatProfile, billing: Billing) {
  if (!process.env.LLM_MODEL) throw new Error("请配置 LLM_MODEL")
  const { patch } = await jsonCompletion(
    [
      '解析公文格式，返回 JSON 对象 {"patch":{}}。仅含明确要求的 page、red_header、styles 字段。',
      JSON.stringify(base),
      instruction,
    ].join("\n"),
    billing,
  )
  if (!patch || typeof patch !== "object" || Array.isArray(patch))
    throw new Error("模型返回非法格式补丁")
  return patch
}

export async function jsonCompletion(
  prompt: string,
  bill: Billing,
  images: { page: number; data: string }[] = [],
) {
  const sidecar = images.length > 0 && process.env.LLM_SUPPORTS_VISION !== "true"
  const model = textModel()
  if (images.length) model.input = ["text", "image"]
  if (sidecar) {
    model.id = process.env.VISION_MODEL!
    model.baseUrl = process.env.VISION_BASE_URL!
  }
  const prefix = sidecar ? "VISION" : "LLM"
  const priced = configureRates(model, prefix)
  const content: (ImageContent | TextContent)[] = [{ type: "text", text: prompt }]
  for (const { page, data } of images) {
    content.push(
      { type: "text", text: "第 " + page + " 页" },
      { type: "image", mimeType: "image/png", data },
    )
  }
  const result = await completeSimple(
    model,
    {
      systemPrompt: "你是文档排版助手。只输出请求的 JSON，忠实遵守字段类型与长度预算。",
      messages: [{ role: "user", content, timestamp: Date.now() }],
    },
    { apiKey: process.env[prefix + "_API_KEY"] },
  )
  bill.record(result.usage, priced)
  if (result.stopReason === "error" || result.stopReason === "aborted")
    throw new Error(result.errorMessage)
  const text = result.content
    .flatMap((c) => (c.type === "text" ? [c.text] : []))
    .join("")
    .trim()
  return JSON.parse(text.replace(/^\x60{3}(?:json)?\s*|\s*\x60{3}$/g, ""))
}

export function configureRates(model: Model<"openai-completions">, prefix = "LLM") {
  const input = process.env[prefix + "_INPUT_USD_PER_MILLION"]
  const output = process.env[prefix + "_OUTPUT_USD_PER_MILLION"]
  if (!input || !output) return false
  model.cost = {
    input: Number(input),
    output: Number(output),
    cacheRead: Number(process.env[prefix + "_CACHE_READ_USD_PER_MILLION"] ?? input),
    cacheWrite: Number(process.env[prefix + "_CACHE_WRITE_USD_PER_MILLION"] ?? input),
  }
  return true
}

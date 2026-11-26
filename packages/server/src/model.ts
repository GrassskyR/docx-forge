import {
  completeSimple,
  type ImageContent,
  type Model,
  type TextContent,
} from "@mariozechner/pi-ai"
import { Billing } from "./billing.js"
import { traceGeneration } from "./observability.js"

export function textModel(): Model<"openai-completions"> {
  const supportsVision = process.env.LLM_SUPPORTS_VISION === "true"
  return {
    id: (process.env.LLM_MODEL || "unconfigured").trim(),
    name: "文档排版模型",
    provider: "openai",
    api: "openai-completions",
    baseUrl: (process.env.LLM_BASE_URL || "https://api.openai.com/v1").trim(),
    reasoning: false,
    input: supportsVision ? ["text", "image"] : ["text"],
    contextWindow: 64000,
    maxTokens: 16384,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    compat: { supportsStore: false, supportsDeveloperRole: false },
  }
}

function parseLooseJson(rawText: string) {
  const trimmed = rawText.trim().replace(/^\x60{3}(?:json)?\s*|\s*\x60{3}$/g, "")
  try {
    return JSON.parse(trimmed)
  } catch {
    const firstObj = trimmed.indexOf("{")
    const firstArr = trimmed.indexOf("[")
    const useArr = firstArr >= 0 && (firstObj < 0 || firstArr < firstObj)
    const start = useArr ? firstArr : firstObj
    const end = useArr ? trimmed.lastIndexOf("]") : trimmed.lastIndexOf("}")
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1))
    }
    throw new Error("模型未返回合法 JSON: " + trimmed.slice(0, 160))
  }
}

export async function jsonCompletion(
  prompt: string,
  bill: Billing,
  images: { page: number; data: string }[] = [],
  opName = "json-completion",
) {
  const sidecar = images.length > 0 && process.env.LLM_SUPPORTS_VISION !== "true"
  const model = textModel()
  if (images.length) model.input = ["text", "image"]
  if (sidecar) {
    model.id = process.env.VISION_MODEL!.trim()
    model.baseUrl = process.env.VISION_BASE_URL!.trim()
  }
  const prefix = sidecar ? "VISION" : "LLM"
  const priced = configureRates(model, prefix)
  const content: (ImageContent | TextContent)[] = [{ type: "text", text: prompt }]
  for (const { page, data } of images) {
    content.push(
      { type: "text", text: "第 " + page + " 页渲染图" },
      { type: "image", mimeType: "image/png", data },
    )
  }
  return traceGeneration(
    opName,
    { model: model.id, prompt, imageCount: images.length },
    async () => {
      let lastErr = ""
      for (let attempt = 0; attempt < 2; attempt++) {
        const result = await completeSimple(
          model,
          {
            systemPrompt:
              "你是资深 OOXML 文档结构解析与排版规划专家。只输出合法 JSON，字符串内严禁包含未转义英文双引号。",
            messages: [{ role: "user", content, timestamp: Date.now() }],
          },
          { apiKey: process.env[prefix + "_API_KEY"]?.trim() },
        )
        bill.record(result.usage, priced)
        if (result.stopReason === "error" || result.stopReason === "aborted") {
          lastErr = result.errorMessage || "LLM 请求中断"
          if (attempt === 0 && /EOF|fetch|network|reset|timeout|502|503|429/i.test(lastErr)) {
            await new Promise((r) => setTimeout(r, 1500))
            continue
          }
          throw new Error(lastErr)
        }
        const rawText = result.content
          .flatMap((c) => (c.type === "text" ? [c.text] : []))
          .join("")
          .trim()
        return { parsed: parseLooseJson(rawText), rawText, usage: result.usage }
      }
      throw new Error(lastErr)
    },
  )
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

import { NodeSDK } from "@opentelemetry/sdk-node"
import { LangfuseSpanProcessor } from "@langfuse/otel"
import {
  propagateAttributes,
  startActiveObservation,
  startObservation,
  type LangfuseGeneration,
  type LangfuseSpan,
  type LangfuseTool,
} from "@langfuse/tracing"
import type { Agent } from "@mariozechner/pi-agent-core"
import { logger } from "./logger.js"

let sdk: NodeSDK | null = null
let processor: LangfuseSpanProcessor | null = null

export function langfuseEnabled() {
  return Boolean(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY)
}

export function initObservability() {
  if (sdk) return
  if (!langfuseEnabled()) {
    logger.info("Langfuse 未配置密钥，已启用本地 pino 结构化日志 (data/logs/server.log)")
    return
  }
  const baseUrl = process.env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com"
  processor = new LangfuseSpanProcessor({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    baseUrl,
  })
  sdk = new NodeSDK({ spanProcessors: [processor] })
  sdk.start()
  logger.info({ baseUrl }, "Langfuse OpenTelemetry 追踪已启用")
}

export async function flushObservability() {
  if (processor) {
    await processor.forceFlush().catch((err) => logger.warn({ err }, "Langfuse flush 失败"))
  }
}

export async function traceGeneration<T>(
  name: string,
  meta: { model: string; prompt: string; imageCount?: number },
  fn: () => Promise<{
    parsed: T
    rawText: string
    usage: { input: number; output: number; totalTokens: number }
  }>,
): Promise<T> {
  const start = Date.now()
  if (!langfuseEnabled()) {
    try {
      const res = await fn()
      logger.info(
        {
          op: name,
          model: meta.model,
          inTok: res.usage.input,
          outTok: res.usage.output,
          ms: Date.now() - start,
        },
        "LLM 调用完成",
      )
      return res.parsed
    } catch (err) {
      logger.error({ op: name, model: meta.model, ms: Date.now() - start, err }, "LLM 调用失败")
      throw err
    }
  }

  return startActiveObservation(
    name,
    async (gen) => {
      gen.update({
        model: meta.model,
        input: meta.imageCount
          ? { prompt: meta.prompt, images: meta.imageCount }
          : meta.prompt,
      })
      try {
        const res = await fn()
        gen.update({
          output: res.rawText,
          usageDetails: {
            input: res.usage.input,
            output: res.usage.output,
            total: res.usage.totalTokens,
          },
        })
        logger.info(
          {
            op: name,
            model: meta.model,
            inTok: res.usage.input,
            outTok: res.usage.output,
            ms: Date.now() - start,
          },
          "LLM 调用完成 (已上报 Langfuse)",
        )
        return res.parsed
      } catch (err) {
        gen.update({ level: "ERROR", statusMessage: String(err) })
        logger.error({ op: name, model: meta.model, ms: Date.now() - start, err }, "LLM 调用失败")
        throw err
      }
    },
    { asType: "generation" },
  )
}

export async function runTracedAgentPrompt(
  agent: Agent,
  opts: { sessionId: string; prompt: string; activeTemplate: string | null },
) {
  const turnStart = Date.now()
  const toolTimers = new Map<string, number>()
  const toolSpans = new Map<string, LangfuseTool>()
  let rootSpan: LangfuseSpan | null = null
  let activeGen: LangfuseGeneration | null = null

  if (langfuseEnabled()) {
    rootSpan = startObservation("docforge-chat-turn", {
      input: opts.prompt,
      metadata: { sessionId: opts.sessionId, activeTemplate: opts.activeTemplate ?? "v2_profile" },
    })
  }

  const unsub = agent.subscribe((ev) => {
    if (ev.type === "turn_start" && rootSpan) {
      activeGen = rootSpan.startObservation(
        "pi-agent-llm-step",
        { model: agent.state.model.id, input: { messageCount: agent.state.messages.length } },
        { asType: "generation" },
      )
    }
    if (ev.type === "message_end" && ev.message.role === "assistant") {
      const textOut = ev.message.content
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("")
      const toolsCalled = ev.message.content
        .filter((c) => c.type === "toolCall")
        .map((c) => c.name)
      logger.info(
        {
          sessionId: opts.sessionId,
          model: ev.message.model,
          inTok: ev.message.usage.input,
          outTok: ev.message.usage.output,
          toolsCalled,
        },
        "Pi-Agent 模型轮次完成",
      )
      if (activeGen) {
        activeGen.update({
          output: { text: textOut, toolsCalled },
          usageDetails: {
            input: ev.message.usage.input,
            output: ev.message.usage.output,
            total: ev.message.usage.totalTokens,
          },
        })
        activeGen.end()
        activeGen = null
      }
    }
    if (ev.type === "tool_execution_start") {
      toolTimers.set(ev.toolCallId, Date.now())
      logger.info({ tool: ev.toolName, args: ev.args }, "工具开始执行")
      if (rootSpan) {
        toolSpans.set(
          ev.toolCallId,
          rootSpan.startObservation(ev.toolName, { input: ev.args }, { asType: "tool" }),
        )
      }
    }
    if (ev.type === "tool_execution_end") {
      const ms = Date.now() - (toolTimers.get(ev.toolCallId) ?? Date.now())
      logger.info({ tool: ev.toolName, isError: ev.isError, ms }, "工具执行结束")
      const span = toolSpans.get(ev.toolCallId)
      if (span) {
        span.update({
          output: JSON.stringify(ev.result.details ?? {}).slice(0, 1200),
          level: ev.isError ? "ERROR" : "DEFAULT",
        })
        span.end()
        toolSpans.delete(ev.toolCallId)
      }
    }
  })

  try {
    const exec = () => agent.prompt(opts.prompt)
    if (langfuseEnabled()) {
      await propagateAttributes({ sessionId: opts.sessionId }, exec)
    } else {
      await exec()
    }
    const lastMsg = agent.state.messages.at(-1)
    const finalReply =
      lastMsg && lastMsg.role === "assistant"
        ? lastMsg.content
            .filter((c) => c.type === "text")
            .map((c) => c.text)
            .join("")
        : ""
    if (rootSpan) {
      rootSpan.update({ output: finalReply, metadata: { durationMs: Date.now() - turnStart } })
      rootSpan.end()
    }
    logger.info({ sessionId: opts.sessionId, ms: Date.now() - turnStart }, "对话请求处理完成")
  } catch (err) {
    if (rootSpan) {
      rootSpan.update({ level: "ERROR", statusMessage: String(err) })
      rootSpan.end()
    }
    logger.error({ sessionId: opts.sessionId, err }, "对话请求异常")
    throw err
  } finally {
    unsub()
    await flushObservability()
  }
}

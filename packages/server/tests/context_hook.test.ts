import { expect, test } from "vitest"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { AgentMessage } from "@mariozechner/pi-agent-core"
import { Documents } from "../src/documents.js"
import { Workspace } from "../src/workspace.js"
import { contextHook } from "../src/context_hook.js"

test("审阅完成后清除图片和原始详情，仅注入精简能力卡，按返回用量累计账单", async () => {
  const data = await mkdtemp(join(tmpdir(), "docforge-hook-"))
  const docs = new Documents(data, false)
  try {
    const work = new Workspace(docs)
    const { inspect_id, skeleton } = await work.inspect("eval/fixtures/01.docx", [])
    const anchor = skeleton.clusters[0].anchor
    const asset = work.templates.save(inspect_id, "模板", "公文", {
      slots: [{ name: "body", start: anchor, end: anchor }], preserved: [],
      prototypes: { body: anchor },
    }, "真实约束".repeat(500))
    const usage = { input: 100, output: 12, cacheRead: 3, cacheWrite: 0, totalTokens: 115,
      cost: { input: 0.1, output: 0.02, cacheRead: 0.001, cacheWrite: 0, total: 0.121 } }
    const tool: AgentMessage = { role: "toolResult", toolCallId: "i", toolName: "audit_and_inspect",
      isError: false, timestamp: 1, details: { data: "historical-base64" },
      content: [{ type: "image", mimeType: "image/png", data: "historical-base64" }] }
    const hook = contextHook(docs, work.templates)
    expect(JSON.stringify(await hook([tool]))).toContain("historical-base64")
    const reviewed = await hook([tool, { role: "assistant", api: "openai-completions", provider: "openai",
      model: "test", content: [{ type: "text", text: "图像已经审阅" }], stopReason: "stop", usage, timestamp: 2 },
      { role: "user", content: "继续", timestamp: 3 }])
    expect(JSON.stringify(reviewed)).not.toContain("historical-base64")
    expect(JSON.stringify(reviewed)).not.toContain('"type":"image"')
    expect(JSON.stringify(reviewed)).toContain("关键页图像已审阅")
    expect(reviewed[0].content).toBe(asset.capability_card)
    expect(asset.capability_card.length).toBeLessThanOrEqual(1500)
    docs.bill.record(usage, true)
    expect(docs.bill.record(usage, true)).toMatchObject({ total_tokens: 230, cost_usd: 0.242 })
  } finally {
    docs.store.db.close()
    await rm(data, { recursive: true, force: true })
  }
})

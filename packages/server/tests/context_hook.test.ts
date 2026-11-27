import { expect, test } from "vitest"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { AgentMessage } from "@mariozechner/pi-agent-core"
import { Documents } from "../src/documents.js"
import { Workspace } from "../src/workspace.js"
import { contextHook } from "../src/context_hook.js"

test("审阅后清除历史图片，按会话置顶模板能力卡与工作区底稿快照，累计账单", async () => {
  const data = await mkdtemp(join(tmpdir(), "docforge-hook-"))
  const docs = new Documents(data, false)
  try {
    const work = new Workspace(docs)
    const { inspect_id, doc_map } = await work.inspect("eval/fixtures/01.docx", [])
    const asset = work.templates.save(
      inspect_id,
      "模板",
      "公文",
      {
        template_kind: "flowing",
        fields: [],
        content_slots: [{ name: "body", start: "B0", end: "B0" }],
        prototypes: { body: "B0" },
        preserved: doc_map.preserved,
      },
      "真实业务规则说明",
    )
    const usage = {
      input: 100,
      output: 12,
      cacheRead: 3,
      cacheWrite: 0,
      totalTokens: 115,
      cost: { input: 0.1, output: 0.02, cacheRead: 0.001, cacheWrite: 0, total: 0.121 },
    }
    const tool: AgentMessage = {
      role: "toolResult",
      toolCallId: "i",
      toolName: "refine_and_audit",
      isError: false,
      timestamp: 1,
      details: { data: "historical-base64" },
      content: [{ type: "image", mimeType: "image/png", data: "historical-base64" }],
    }
    const hook = contextHook(work.templates, () => ({
      template_id: asset.id,
      draft_text: "左侧编辑器当前手写草稿内容",
      slot_values: { student_name: "林知远" },
      generate_cover: true,
      doc_id: "doc-123",
    }))
    expect(JSON.stringify(await hook([tool]))).toContain("historical-base64")
    const reviewed = await hook([
      tool,
      {
        role: "assistant",
        api: "openai-completions",
        provider: "openai",
        model: "test",
        content: [{ type: "text", text: "图像已经审阅" }],
        stopReason: "stop",
        usage,
        timestamp: 2,
      },
      { role: "user", content: "继续", timestamp: 3 },
    ])
    expect(JSON.stringify(reviewed)).not.toContain("historical-base64")
    expect(JSON.stringify(reviewed)).not.toContain('"type":"image"')
    expect(JSON.stringify(reviewed)).toContain("关键页图像已审阅")
    const topContent = String(reviewed[0].content)
    expect(topContent).toContain(asset.capability_card)
    expect(topContent).toContain("[当前文档工作区底稿]")
    expect(topContent).toContain("左侧编辑器当前手写草稿内容")
    expect(topContent).toContain("林知远")
    docs.bill.record(usage, true)
    expect(docs.bill.record(usage, true)).toMatchObject({ total_tokens: 230, cost_usd: 0.242 })
  } finally {
    docs.store.db.close()
    await rm(data, { recursive: true, force: true })
  }
})

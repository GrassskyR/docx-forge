import { expect, test, vi } from "vitest"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { TemplateAsset } from "@docs-agent/shared"
import { Documents } from "../src/documents.js"
import { Workspace } from "../src/workspace.js"

const prompts: string[] = []
vi.mock("../src/model.js", async (original) => ({
  ...(await original<typeof import("../src/model.js")>()),
  jsonCompletion: async (prompt: string) => {
    prompts.push(prompt)
    return [{ prototype: "body", range: "P0-P59" }]
  },
}))

test("长草稿规划向模型提供全量段落目录", async () => {
  const data = await mkdtemp(join(tmpdir(), "docforge-plan-"))
  const docs = new Documents(data, false)
  try {
    const work = new Workspace(docs)
    const lines = Array.from({ length: 58 }, (_, i) => "第" + i + "段正文".repeat(20))
    const { draft_id } = await work.ingest({ text: [...lines, "某某市人民政府", "2026年11月25日"].join("\n") })
    const template = { capability_card: "能力卡", blueprint: { slots: [{ name: "body" }] } }
    await work.plan(template as TemplateAsset, draft_id)
    expect(prompts[0]).toContain("P30|" + lines[30].length + "|" + lines[30].slice(0, 24))
    expect(prompts[0]).toContain("P58|7|某某市人民政府")
    expect(prompts[0]).toContain("P59|11|2026年11月25日")
  } finally {
    docs.store.db.close()
    await rm(data, { recursive: true, force: true })
  }
})

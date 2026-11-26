import { expect, test, vi } from "vitest"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Documents } from "../src/documents.js"
import { Workspace } from "../src/workspace.js"

const callOps: string[] = []
vi.mock("../src/model.js", async (original) => ({
  ...(await original<typeof import("../src/model.js")>()),
  jsonCompletion: async (_prompt: string, _bill: unknown, _imgs: unknown, opName = "") => {
    callOps.push(opName)
    if (opName === "internalize-v4-propose") {
      // Intentional coordinate error on initial proposal -> triggers coord-fix without stealing ReAct rounds
      return {
        blueprint: {
          template_kind: "flowing",
          fields: [],
          content_slots: [{ name: "body", start: "B999", end: "B999", placement: "replace" }],
          prototypes: { body: "B0" },
        },
        rules_md: "初稿规则",
      }
    }
    if (opName === "internalize-v4-coord-fix-init") {
      return {
        blueprint: {
          template_kind: "flowing",
          fields: [],
          content_slots: [{ name: "body", start: "B1", end: "B1", placement: "replace" }],
          prototypes: { body: "B1" },
        },
        rules_md: "修复坐标规则",
      }
    }
    if (opName === "internalize-v4-react-1" || opName === "internalize-v4-react-2") {
      return {
        thought: "继续修订范围",
        verdict: "revise",
        blueprint: {
          template_kind: "flowing",
          fields: [],
          content_slots: [{ name: "body", start: "B1", end: "B2", placement: "replace" }],
          prototypes: { body: "B1" },
        },
        rules_md: "二轮规则",
      }
    }
    if (opName === "internalize-v4-react-3") {
      // Final round revision MUST be validated and saved, NOT discarded!
      return {
        thought: "末轮补齐清理项",
        verdict: "revise",
        blueprint: {
          template_kind: "flowing",
          fields: [{ name: "title", label: "标题", coord: "B0", mode: "cell" }],
          content_slots: [{ name: "body", start: "B1", end: "B2", placement: "replace" }],
          prototypes: { body: "B1" },
        },
        rules_md: "末轮最终规则",
      }
    }
    return { verdict: "accept" }
  },
}))

test("ReAct 内化状态机：坐标修复不挤占自审轮次且末轮有效修订不被丢弃", async () => {
  vi.stubEnv("LLM_API_KEY", "test-key")
  const data = await mkdtemp(join(tmpdir(), "docforge-react-loop-"))
  const docs = new Documents(data, true)
  try {
    const work = new Workspace(docs)
    const asset = await work.learnFile("eval/fixtures/01.docx", "状态机测试模板", "general")
    expect(callOps).toEqual([
      "internalize-v4-propose",
      "internalize-v4-coord-fix-init",
      "internalize-v4-react-1",
      "internalize-v4-react-2",
      "internalize-v4-react-3",
    ])
    expect(asset.blueprint.fields.map((f) => f.name)).toEqual(["title"])
    expect(asset.capability_card).toContain("末轮最终规则")
  } finally {
    docs.store.db.close()
    await rm(data, { recursive: true, force: true })
  }
}, 60_000)

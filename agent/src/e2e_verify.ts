import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { once } from "node:events"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { Agent } from "@mariozechner/pi-agent-core"
import { registerFauxProvider, fauxAssistantMessage, fauxToolCall } from "@mariozechner/pi-ai"
import { EngineClient, type DocContentAST } from "./engine_client.js"
import { createTools, repairAfterAudit } from "./tools.js"
import { contextHook } from "./context_hook.js"
import { SessionTree } from "./session_tree.js"
import { makeAgent, serve } from "./server.js"
const root = fileURLToPath(new URL("../../", import.meta.url)),
  temp = mkdtempSync(join(tmpdir(), "gongwen-e2e-"))
interface ProfileCreation {
  id?: string
  profile?: { id: string }
}

class VerificationClient extends EngineClient {
  readonly createdProfiles: string[] = []

  override async request<T>(path: string, body?: unknown, method = "POST"): Promise<T> {
    const result = await super.request<T>(path, body, method)
    if (
      method === "POST" &&
      body !== undefined &&
      (path === "/api/profiles/extract" ||
        path === "/api/profiles/from-nl" ||
        path.endsWith("/fork"))
    ) {
      const created = result as ProfileCreation
      const id = created.id ?? created.profile?.id
      if (id) this.createdProfiles.push(id)
    }
    return result
  }
}

const client = new VerificationClient()
const startingState = await client.profiles()
const original = startingState.active_profile_id
const ast: DocContentAST = {
  doc_type: "notice",
  title: "关于验收测试的通知",
  signature: "综合办公室",
  blocks: [{ type: "body", text: "请各部门按要求开展工作。" }],
}
const tools = createTools(client),
  call = async (name: string, args: unknown) =>
    (await tools.find((t) => t.name === name)!.execute("test", args)).details
try {
  const source = join(temp, "source.docx")
  execFileSync(
    join(root, ".venv/bin/python"),
    [
      "-c",
      [
        "import sys",
        "from pathlib import Path",
        "from engine.tests.test_extractor import fixture",
        "fixture(Path(sys.argv[1]))",
      ].join("\n"),
      source,
    ],
    { cwd: root },
  )
  const imported = await call("import_doc_format", {
    file_path: source,
    profile_name: "E2E 导入",
    set_active: true,
  })
  assert.equal((await client.active()).id, imported.id)
  const first = await call("render_gongwen_docx", { content_ast: ast })
  assert(first.lint_report.passed)
  assert(first.preview_urls.length)
  assert(
    (await call("lint_and_preview_docx", { docx_path: first.docx_path, profile_id: imported.id }))
      .lint_report.passed,
  )
  console.log("PASS 1: import → Active → render → independent lint + PNG")
  const parsed = await call("parse_nl_format", {
    instruction: "正文四号黑体，行距26磅；标题小二号黑体",
    profile_name: "E2E 自然语言",
    set_active: true,
  })
  assert.equal(parsed.profile.styles.body.font_size_pt, 14)
  const fork = await call("manage_profiles", {
    action: "fork",
    profile_id: parsed.profile.id,
    name: "E2E 分支",
    patch_json: { styles: { body: { font_size_pt: 15 } } },
  })
  assert((await call("manage_profiles", { action: "list" })).profiles.length >= 3)
  assert.equal(
    (await call("manage_profiles", { action: "get", profile_id: fork.id })).parent_id,
    parsed.profile.id,
  )
  assert((await call("load_doc_skill", { doc_type: "notice" })).rules.includes("通知"))
  const hook = contextHook(client)
  let context = await hook([{ role: "user", content: "写通知", timestamp: Date.now() }])
  assert(JSON.stringify(context[0]).includes(parsed.profile.id))
  context = await hook([{ role: "user", content: "已压缩摘要", timestamp: Date.now() }])
  assert(JSON.stringify(context[0]).includes(parsed.profile.id))
  const faux = registerFauxProvider({ tokensPerSecond: 100000 })
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall("manage_profiles", { action: "list" }), {
      stopReason: "toolUse",
    }),
    fauxAssistantMessage("工具执行完成"),
  ])
  const agent = new Agent({
    initialState: { model: faux.getModel(), tools },
    transformContext: hook,
  })
  await agent.prompt("验证真实 Pi-Agent 工具循环")
  assert(agent.state.messages.some((m) => m.role === "toolResult"))
  faux.unregister()
  console.log(
    "PASS 2: NL → inheritance → six tools + actual Pi-Agent loop + context after compression",
  )
  const treePath = join(temp, "sessions.json")
  let tree = new SessionTree(treePath)
  tree.checkpoint(agent.state.messages, parsed.profile.id)
  const branch = tree.fork("格式分支", fork.id)
  const branchMessages = [{ role: "user" as const, content: "分支独立内容", timestamp: Date.now() }]
  tree.checkpoint(branchMessages, fork.id)
  tree = new SessionTree(treePath)
  assert.equal(tree.node.profile_id, fork.id)
  await client.setActive(fork.id)
  const branchServer = serve(treePath, 0)
  try {
    await once(branchServer, "listening")
    const address = branchServer.address()
    assert(address && typeof address !== "string")
    const sessionClient = new EngineClient(`http://127.0.0.1:${address.port}`)
    const root = await sessionClient.request<typeof tree.node & { profile_name: string }>(
      "/sessions/switch",
      { id: "root" },
    )
    assert.equal(JSON.stringify(root.messages), JSON.stringify(agent.state.messages))
    assert.equal(root.profile_name, parsed.profile.name)
    assert.equal((await client.active()).id, parsed.profile.id)
    const restored = await sessionClient.request<typeof root>("/sessions/switch", { id: branch.id })
    assert.deepEqual(restored.messages, branchMessages)
    assert.equal(restored.profile_name, fork.name)
    assert.equal((await client.active()).id, fork.id)
  } finally {
    branchServer.close()
  }
  console.log("PASS 3: persisted tree fork/switch restores transcript + format")
  const damageProfile = await call("manage_profiles", {
    action: "fork",
    profile_id: fork.id,
    name: "E2E 修复",
    patch_json: { red_header: { enabled: true, org_name: "测试机关" } },
  })
  const damaged = await client.render(ast, damageProfile.id)
  assert(damaged.lint_report.passed)
  execFileSync(
    join(root, ".venv/bin/python"),
    [
      "-c",
      [
        "import sys",
        "from engine.tests.test_renderer_and_linter import damage_docx",
        "damage_docx(sys.argv[1])",
      ].join("\n"),
      damaged.docx_path,
    ],
    { cwd: root },
  )
  damaged.lint_report = await client.lint(damaged.docx_path, damageProfile.id)
  assert(damaged.lint_report.violations.length >= 16)
  const fixed = await repairAfterAudit(client, damaged)
  assert.equal(fixed.repair_attempts, 1)
  assert.deepEqual(fixed.repair_violation_counts, [damaged.lint_report.violations.length, 0])
  assert.equal(fixed.lint_before?.passed, false)
  assert((await client.lint(fixed.docx_path, damageProfile.id)).passed)
  assert(fixed.preview_urls.length)
  console.log(`PASS 4: actual XML repair ${fixed.repair_violation_counts.join(" → ")}`)
  if (!process.argv.includes("--deterministic")) {
    assert(process.env.LLM_API_KEY, "真实 LLM 验证需要 LLM_API_KEY")
    const live = makeAgent(client)
    let renders = 0,
      failed = false
    live.subscribe((e) => {
      if (e.type === "tool_execution_end") {
        if (e.isError || e.result.details?.error) failed = true
        if (e.toolName === "render_gongwen_docx" && e.result.details?.lint_report?.passed) renders++
      }
    })
    const prompts = [
      `请调用 import_doc_format 导入 ${source}，命名为真实对话导入并设为默认，然后加载通知 Skill，用默认格式生成一份测试通知，正文为请各部门开展验收。`,
      "请用 parse_nl_format 创建正文四号黑体、标题小二号黑体的预设，命名真实对话格式，并设为默认；用此默认格式生成关于测试的通知。",
      "请获取当前格式并 fork 为真实对话派生，patch_json 将正文 font_size_pt 调为15，切换成新默认，然后重新生成刚才通知。",
      "请把刚才通知正文改为请各部门于下周开展验收，使用当前默认格式重新渲染，并调用 lint_and_preview_docx 独立核验输出。",
    ]
    for (let i = 0; i < prompts.length; i++) {
      const before = renders
      await live.prompt(prompts[i])
      assert.equal(live.state.errorMessage, undefined)
      assert(renders > before, `真实对话 ${i + 1} 未渲染`)
      console.log(`PASS LLM ${i + 1}: live conversation rendered and audited`)
    }
    assert(!failed, "真实工具调用有错误")
  }
  console.log("R3 ALL FOUR DETERMINISTIC SCENARIOS PASS")
} finally {
  try {
    await client.setActive(original)
    const failures: unknown[] = []
    for (const id of client.createdProfiles.reverse()) {
      try {
        await client.request("/api/profiles/" + id, {}, "DELETE")
      } catch (error) {
        failures.push(error)
      }
    }
    if (failures.length) throw new AggregateError(failures, "验收预设清理失败")
    const finalState = await client.profiles()
    assert.equal(finalState.active_profile_id, original)
    assert.deepEqual(
      finalState.profiles.map((profile) => profile.id),
      startingState.profiles.map((profile) => profile.id),
    )
    console.log("PASS cleanup: original Active restored and all temporary profiles deleted")
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
}

import { strict as assert } from "node:assert"
import { once } from "node:events"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createApp } from "../src/app.js"

process.loadEnvFile(".env")
const data = await mkdtemp(join(tmpdir(), "docforge-e2e-"))
const server = createApp(data, true)
server.listen(0, "127.0.0.1")
await once(server, "listening")
const origin = "http://127.0.0.1:" + (server.address() as AddressInfo).port
async function post(path: string, body: unknown) {
  const r = await fetch(origin + path, {
    method: "POST",
    headers: body instanceof FormData ? {} : { "Content-Type": "application/json" },
    body: body instanceof FormData ? body : JSON.stringify(body),
  })
  const json = await r.json()
  assert(r.ok, path + " " + JSON.stringify(json))
  return json
}
try {
  for (const [file, category] of [
    ["eval/real_docs/real_01_cdsu_red_notice.docx", "公文"],
    ["eval/real_docs_v3/v3_01_pku_master_thesis.docx", "论文"],
    ["eval/real_docs_v3/v3_08_shgov_coop_dev_contract.doc", "合同"],
  ]) {
    const form = new FormData()
    form.set("file", new Blob([await readFile(file)]), file.split("/").at(-1)!)
    const inspection = await post("/api/templates/inspect", form)
    assert(inspection.sample_urls.length)
    const asset = await post("/api/templates", {
      inspect_id: inspection.inspect_id,
      category,
      name: category + "内化验证",
      rules_md: "保留原件图片与分节。正文原型名 body。",
    })
    assert(asset.blueprint.content_slots.length)
    const draft = await post("/api/drafts/ingest", {
      text: "项目执行安排\n请相关部门确认进度。\n项目办公室",
    })
    const result = await post("/api/documents/compose", {
      template_id: asset.id,
      mode: "exact_copy",
      draft_id: draft.draft_id,
    })
    assert(result.lint_report.passed && result.fidelity === 1 && result.preview_urls.length)
    assert(result.usage.prompt_tokens > 0 && result.usage.completion_tokens > 0)
    const audit = await post("/api/documents/" + result.doc_id + "/visual-audit", {})
    assert(audit.vision.status)
    const adjust = await post("/api/documents/" + result.doc_id + "/adjust-layout", {
      operations: [{ type: "space_after_delta", delta: -1 }],
    })
    assert(adjust.after.total_pages > 0)
    console.log(
      category,
      asset.blueprint.content_slots.length,
      result.layout.total_pages,
      result.usage,
      audit.vision.status,
    )
  }
  const response = await fetch(origin + "/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: "调用 manage_templates 列出当前模板，然后只回复模板数量。",
    }),
  })
  const sse = await response.text()
  assert(
    sse.includes('"type":"tool"') &&
      sse.includes('"type":"usage"') &&
      sse.includes('"type":"done"'),
  )
  assert(!sse.includes('"type":"error"'))
  console.log("Pi-Agent real tool call and SSE usage verified")
} finally {
  server.close()
  await once(server, "close")
  await rm(data, { recursive: true, force: true })
}

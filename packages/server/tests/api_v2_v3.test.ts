import { test, expect } from "vitest"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { once } from "node:events"
import type { AddressInfo } from "node:net"
import { createApp } from "../src/app.js"

test("单端口 V4 HTTP 契约、模板管理、无壳补齐生成、版面收口与会话树", async () => {
  const dir = await mkdtemp(join(tmpdir(), "docforge-api-"))
  const server = createApp(dir, false)
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const origin = "http://127.0.0.1:" + (server.address() as AddressInfo).port
  async function request(path: string, body?: unknown, method = body ? "POST" : "GET") {
    const res = await fetch(origin + path, {
      method,
      headers: body instanceof FormData ? {} : { "Content-Type": "application/json" },
      body: body instanceof FormData ? body : JSON.stringify(body),
    })
    const result = await res.json()
    expect(res.status, JSON.stringify(result)).toBe(200)
    return result
  }
  try {
    expect((await fetch(origin + "/")).status).toBe(200)
    expect(await request("/health")).toMatchObject({
      service: "ok",
      sqlite: "ok",
      libreoffice: true,
      pdftoppm: true,
    })

    const listed = await request("/api/templates")
    const seedId = listed.active_template_id
    expect(seedId).toBe("builtin-standard-doc")
    expect((await request("/api/templates/" + seedId)).id).toBe(seedId)

    const form = new FormData()
    form.set("file", new Blob([await readFile("eval/fixtures/04.doc")]), "格式.doc")
    const inspected = await request("/api/templates/inspect", form)
    expect(inspected.inspect_id).toBeTruthy()
    expect(inspected.sample_urls.length).toBeGreaterThan(0)

    const learned = await request("/api/templates", {
      inspect_id: inspected.inspect_id,
      name: "上传测试模板",
      category: "gongwen",
      rules_md: "保持默认段落样式。",
    })
    expect(learned.blueprint.content_slots.length).toBeGreaterThan(0)

    const child = await request("/api/templates/" + learned.id + "/fork", { name: "派生子模板" })
    expect(child.parent_id).toBe(learned.id)
    await request("/api/templates/active", { template_id: child.id }, "PUT")

    const composed = await request("/api/documents/compose", {
      mode: "authored",
      generate_cover: true,
      generate_toc: true,
      slot_values: { title: "年度总结报告", student_name: "测试人", date: "2026年11月26日" },
      body_plan: [
        { prototype: "heading_1", text: "一、总体进展" },
        { prototype: "body", text: "真实文件上传、封面与目录补齐、审计与预览。" },
      ],
    })
    expect(composed.lint_report.passed).toBe(true)
    const docxHead = Buffer.from(await (await fetch(origin + composed.docx_url)).arrayBuffer())
    expect(docxHead.subarray(0, 2).toString()).toBe("PK")
    const png = Buffer.from(await (await fetch(origin + composed.preview_urls[0])).arrayBuffer())
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a")

    const adjusted = await request("/api/documents/" + composed.doc_id + "/adjust-layout", {
      operations: [{ type: "space_after_delta", delta: -1 }],
    })
    expect(adjusted.after.total_pages).toBeGreaterThan(0)

    const tree = await request("/sessions")
    const branch = await request("/sessions/fork", { name: "修改稿", template_id: seedId })
    expect((await request("/sessions")).current).toBe(branch.id)
    expect((await request("/sessions/switch", { id: tree.current })).template_id).toBe(child.id)

    await request("/api/templates/active", { template_id: seedId }, "PUT")
    expect((await request("/api/templates/" + child.id, {}, "DELETE")).deleted).toBe(child.id)
    expect((await fetch(origin + "/api/templates/" + child.id)).status).toBe(404)

    const unplanned = await fetch(origin + "/api/v3/documents/compose", {
      method: "POST",
      body: JSON.stringify({ mode: "authored" }),
    })
    expect(unplanned.status).toBe(422)
    expect((await unplanned.json()).detail).toContain("body_plan")
    expect((await fetch(origin + "/chat", { method: "POST", body: "{}" })).status).toBe(
      process.env.LLM_API_KEY ? 422 : 503,
    )
  } finally {
    server.close()
    await once(server, "close")
    await rm(dir, { recursive: true, force: true })
  }
}, 120_000)

import { test, expect } from "vitest"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { once } from "node:events"
import type { AddressInfo } from "node:net"
import { DatabaseSync } from "node:sqlite"
import { strFromU8, unzipSync } from "fflate"
import { createApp } from "../src/app.js"

test("单端口 V4 统一 /api 契约、SQLite 多会话隔离、SSE 阶段流、后台导入与未填槽位擦除", async () => {
  const dir = await mkdtemp(join(tmpdir(), "docforge-api-"))
  const server = createApp(dir, false)
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const origin = "http://127.0.0.1:" + (server.address() as AddressInfo).port

  async function request(path: string, body?: unknown, method = body ? "POST" : "GET") {
    const res = await fetch(origin + path, {
      method,
      headers: body instanceof FormData ? {} : { "Content-Type": "application/json" },
      body:
        body === undefined
          ? undefined
          : body instanceof FormData
            ? body
            : JSON.stringify(body),
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

    // 1. Builtin template & lazy sample preview rendering
    const listed = await request("/api/templates")
    const seedId = "builtin-standard-doc"
    expect(listed.templates.some((t: { id: string }) => t.id === seedId)).toBe(true)
    const sampleRes = await request("/api/templates/" + seedId + "/samples")
    expect(sampleRes.sample_urls.length).toBeGreaterThan(0)
    const samplePng = Buffer.from(
      await (await fetch(origin + sampleRes.sample_urls[0])).arrayBuffer(),
    )
    expect(samplePng.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a")

    // 2. Background SSE template import stream (/api/templates/import)
    const importForm = new FormData()
    importForm.set("file", new Blob([await readFile("eval/fixtures/04.doc")]), "高校实验报告.doc")
    importForm.set("name", "后台导入测试模板")
    importForm.set("category", "thesis")
    const importResp = await fetch(origin + "/api/templates/import", {
      method: "POST",
      body: importForm,
    })
    expect(importResp.status).toBe(200)
    const importSse = await importResp.text()
    expect(importSse).toContain('"type":"phase"')
    expect(importSse).toContain('"type":"sample"')
    expect(importSse).toContain('"type":"done"')

    const afterImport = await request("/api/templates")
    const imported = afterImport.templates.find(
      (t: { name: string }) => t.name === "后台导入测试模板",
    )
    expect(imported).toBeTruthy()
    expect(imported.sample_urls.length).toBeGreaterThan(0)

    // 3. Rename, update category & fork template
    const renamed = await request(
      "/api/templates/" + imported.id,
      { name: "计算机实验报告模板", category: "thesis" },
      "PATCH",
    )
    expect(renamed.name).toBe("计算机实验报告模板")
    const child = await request("/api/templates/" + imported.id + "/fork", { name: "派生子模板" })
    expect(child.parent_id).toBe(imported.id)

    // 4. Document-centric SQLite sessions: create, auto-name, compose-stream, format switch divider
    const initSess = await request("/api/sessions")
    expect(initSess.active.name).toBe("未命名文档")
    expect(initSess.active.draft_text).toBe("")

    const s1Id = initSess.active_session_id
    const composeResp = await fetch(origin + "/api/documents/compose-stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: s1Id,
        template_id: seedId,
        draft_text: "2026年秋季校园学术创新周通知\n请各学院积极组织申报。",
        slot_values: {},
        generate_cover: true,
        generate_toc: true,
        run_vision: false,
      }),
    })
    expect(composeResp.status).toBe(200)
    const composeSse = await composeResp.text()
    expect(composeSse).toContain('"type":"phase"')
    expect(composeSse).toContain('"type":"done"')

    // Verify session auto-named from draft first line & saved current_doc
    const s1After = await request("/api/sessions")
    expect(s1After.active.name).toBe("2026年秋季校园学术创新周通知")
    expect(s1After.active.current_doc.doc_id).toBeTruthy()
    expect(s1After.active.preview_stale).toBe(false)

    // Verify unfilled title slot ("文档标题") in builtin template was cleanly erased
    const docZip = unzipSync(
      Buffer.from(
        await (await fetch(origin + s1After.active.current_doc.docx_url)).arrayBuffer(),
      ),
    )
    const docXml = strFromU8(docZip["word/document.xml"])
    expect(docXml).not.toContain(">文档标题<")
    expect(docXml).toContain("2026年秋季校园学术创新周通知")

    // Switch template in-place on non-empty session -> records timeline divider & marks preview stale
    const switchedFmt = await request(
      "/api/sessions/" + s1Id,
      { template_id: child.id },
      "PATCH",
    )
    expect(switchedFmt.active.template_id).toBe(child.id)
    expect(switchedFmt.active.preview_stale).toBe(true)
    expect(switchedFmt.active.events.at(-1).text).toContain("派生子模板")

    // Create a second isolated blank session -> clean context isolation
    const s2 = await request("/api/sessions", { template_id: imported.id })
    expect(s2.active.id).not.toBe(s1Id)
    expect(s2.active.draft_text).toBe("")
    expect(s2.active.current_doc).toBeNull()
    expect(s2.active.events.length).toBe(0)

    // Fork s1 in debug mode & switch between sessions
    const forked = await request("/api/sessions/" + s1Id + "/fork", { name: "实验分叉稿" })
    expect(forked.active.parent_id).toBe(s1Id)
    expect(forked.active.draft_text).toContain("校园学术创新周")

    // Patch slot_values + seed chat messages on s1, then verify clear-chat preserves draft/slots/template/doc
    await request(
      "/api/sessions/" + s1Id,
      { slot_values: { author: "李明" } },
      "PATCH",
    )
    const db = new DatabaseSync(join(dir, "docforge.db"))
    try {
      const row = db
        .prepare("SELECT payload FROM sessions WHERE id=?")
        .get(s1Id) as { payload: string }
      const parsed = JSON.parse(row.payload)
      parsed.messages = [
        { role: "user", content: "帮我检查一下通知格式" },
        { role: "assistant", content: [{ type: "text", text: "已核对格式无误。" }] },
      ]
      db.prepare("UPDATE sessions SET payload=? WHERE id=?").run(JSON.stringify(parsed), s1Id)
    } finally {
      db.close()
    }

    const beforeClear = await request("/api/sessions/active", { session_id: s1Id }, "PUT")
    expect(beforeClear.active.messages.length).toBe(2)
    expect(beforeClear.active.events.length).toBeGreaterThan(0)
    expect(
      beforeClear.sessions.find((s: { id: string }) => s.id === s1Id).message_count,
    ).toBe(2)

    const afterClear = await request("/api/sessions/" + s1Id + "/clear-chat", {}, "POST")
    expect(afterClear.active.id).toBe(s1Id)
    expect(afterClear.active.messages).toEqual([])
    expect(afterClear.active.events).toEqual([])
    expect(afterClear.active.draft_text).toContain("2026年秋季校园学术创新周通知")
    expect(afterClear.active.slot_values).toEqual({ author: "李明" })
    expect(afterClear.active.template_id).toBe(child.id)
    expect(afterClear.active.current_doc.doc_id).toBeTruthy()
    expect(
      afterClear.sessions.find((s: { id: string }) => s.id === s1Id).message_count,
    ).toBe(0)

    const backToS2 = await request("/api/sessions/active", { session_id: s2.active.id }, "PUT")
    expect(backToS2.active.id).toBe(s2.active.id)

    // Delete template currently bound to forked session -> auto-fallback to builtin template
    expect((await request("/api/templates/" + child.id, undefined, "DELETE")).deleted).toBe(
      child.id,
    )
    expect((await fetch(origin + "/api/templates/" + child.id)).status).toBe(404)
    const checkFallback = await request(
      "/api/sessions/active",
      { session_id: forked.active.id },
      "PUT",
    )
    expect(checkFallback.active.template_id).toBe(seedId)

    // Delete session
    const afterDelSess = await request("/api/sessions/" + forked.active.id, undefined, "DELETE")
    expect(afterDelSess.deleted).toBe(forked.active.id)

    // Validation checks
    const unplanned = await fetch(origin + "/api/documents/compose", {
      method: "POST",
      body: JSON.stringify({ mode: "authored" }),
    })
    expect(unplanned.status).toBe(422)
    expect((await fetch(origin + "/api/chat", { method: "POST", body: "{}" })).status).toBe(
      process.env.LLM_API_KEY ? 422 : 503,
    )
  } finally {
    server.close()
    await once(server, "close")
    await rm(dir, { recursive: true, force: true })
  }
}, 120_000)

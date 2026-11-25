import { test, expect } from "vitest"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { once } from "node:events"
import type { AddressInfo } from "node:net"
import { unzipSync, zipSync } from "fflate"
import { createApp } from "../src/app.js"
import { parseXml, xmlBytes, W } from "@docs-agent/engine"

test("单端口 V2 HTTP 契约、文件、修复与会话树", async () => {
  const dir = await mkdtemp(join(tmpdir(), "docforge-api-"))
  const server = createApp(dir, false)
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const origin = "http://127.0.0.1:" + (server.address() as AddressInfo).port
  async function request(path: string, body?: unknown, method = body ? "POST" : "GET") {
    const res = await fetch(origin + path, { method, headers: body instanceof FormData ? {} :
      { "Content-Type": "application/json" }, body: body instanceof FormData ? body : JSON.stringify(body) })
    const result = await res.json()
    expect(res.status, JSON.stringify(result)).toBe(200)
    return result
  }
  try {
    expect((await fetch(origin + "/")).status).toBe(200)
    expect(await request("/health")).toMatchObject({ service: "ok", sqlite: "ok", libreoffice: true, pdftoppm: true })
    const { active_profile_id: id } = await request("/api/profiles")
    expect((await request("/api/profiles/" + id)).id).toBe(id)
    const form = new FormData()
    form.set("name", "格式")
    form.set("file", new Blob([await readFile("eval/fixtures/04.doc")]), "格式.doc")
    expect((await request("/api/profiles/extract", form)).base_template_path).toBeTruthy()
    const parsed = await request("/api/profiles/from-nl", { name: "自然语言", instruction: "正文四号黑体" })
    expect(parsed.profile.styles.body.font_size_pt).toBe(14)
    const child = await request("/api/profiles/" + id + "/fork", { name: "子预设", patch_instruction: "标题小二号" })
    expect(child.styles.title.font_size_pt).toBe(18)
    await request("/api/profiles/active", { profile_id: child.id }, "PUT")
    const result = await request("/api/documents/render", { content_ast: { title: "关于测试的通知",
      blocks: [{ type: "body", text: "真实文件上传、渲染、审计与预览。" }] } })
    expect(result.lint_report.passed).toBe(true)
    expect(Buffer.from(await (await fetch(origin + result.docx_url)).arrayBuffer()).subarray(0, 2).toString()).toBe("PK")
    const png = Buffer.from(await (await fetch(origin + result.preview_urls[0])).arrayBuffer())
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a")
    const lintRequest = { docx_path: result.docx_path, profile_id: child.id }
    expect((await request("/api/documents/lint", lintRequest)).passed).toBe(true)
    const zip = unzipSync(await readFile(result.docx_path))
    form.set("file", new Blob([await readFile(result.docx_path)]), "notice.docx")
    form.set("profile_id", child.id)
    expect((await request("/api/documents/lint", form)).passed).toBe(true)
    const doc = parseXml(zip["word/document.xml"])
    for (const [tag, key, value] of [["pgMar", "top", "100"], ["rFonts", "ascii", "错"],
      ["jc", "val", "left"], ["sz", "val", "8"], ["ind", "firstLine", "500"], ["spacing", "line", "1"],
      ["b", "val", "1"], ["i", "val", "1"]]) {
      doc.getElementsByTagNameNS(W, tag)[0].setAttributeNS(W, "w:" + key, value)
    }
    doc.getElementsByTagNameNS(W, "t")[0].textContent = "保留外部改动"
    zip["word/document.xml"] = xmlBytes(doc)
    await writeFile(result.docx_path, zipSync(zip))
    const damaged = await request("/api/documents/lint", lintRequest)
    expect(damaged.violations.length).toBeGreaterThanOrEqual(8)
    const repaired = await request("/api/documents/repair", {
      docx_path: result.docx_path, effective_profile: result.effective_profile, repair_violations: damaged.violations,
    })
    expect(repaired.lint_report.violations).toEqual([])
    const fixed = unzipSync(await readFile(repaired.docx_path))
    expect(parseXml(fixed["word/document.xml"]).documentElement!.textContent).toContain("保留外部改动")
    const tree = await request("/sessions")
    const branch = await request("/sessions/fork", { name: "修改稿", profile_id: id })
    expect((await request("/sessions")).current).toBe(branch.id)
    expect((await request("/sessions/switch", { id: tree.current })).profile_id).toBe(child.id)
    await request("/api/profiles/active", { profile_id: id }, "PUT")
    expect((await request("/api/profiles/" + child.id, {}, "DELETE")).deleted).toBe(child.id)
    expect((await fetch(origin + "/api/profiles/" + child.id)).status).toBe(404)
    const unplanned = await fetch(origin + "/api/v3/documents/compose", { method: "POST",
      body: JSON.stringify({ mode: "authored" }) })
    expect(unplanned.status).toBe(422)
    expect((await unplanned.json()).detail).toContain("body_plan")
    expect((await fetch(origin + "/chat", { method: "POST", body: "{}" })).status).toBe(
      process.env.LLM_API_KEY ? 422 : 503)
  } finally {
    server.close()
    await once(server, "close")
    await rm(dir, { recursive: true, force: true })
  }
}, 120_000)

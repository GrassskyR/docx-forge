import { test, expect, vi, afterEach } from "vitest"
import { copyFile, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { adjustLayout, compose, Store, telemetry, TemplateStore, visualAudit } from "../src/index.js"

afterEach(() => vi.unstubAllEnvs())

test("真实末页两行落款自动收口；无视觉、侧车和原生三模式", async () => {
  const dir = await mkdtemp(join(tmpdir(), "docforge-layout-"))
  const db = new Store(join(dir, "profiles.db"))
  try {
    const store = new TemplateStore(dir, db)
    const seed = store.get("builtin-standard-doc")
    const path = join(dir, "document.docx")
    let count = 21
    const generate = async () => {
      const out = await compose(dir, seed, {
        mode: "authored",
        slot_values: { title: "关于归档的通知" },
        body_plan: [
          ...Array.from({ length: count }, (_, i) => ({
            prototype: "body",
            text: "第" + (i + 1) + "项档案与安全核查工作。",
          })),
          { prototype: "body", text: "综合办公室" },
          { prototype: "body", text: "2026年11月25日" },
        ],
      })
      await copyFile(out.docx_path, path)
    }
    await generate()
    let before = await telemetry(path, dir)
    if (before.total_pages === 1 || before.pages.at(-1)?.lines !== 2) {
      const p1 = before.pages[0]?.lines ?? 22
      for (let cand = Math.max(10, p1 - 4); cand <= p1 + 6; cand++) {
        count = cand
        await generate()
        before = await telemetry(path, dir)
        if (before.total_pages === 2 && before.pages.at(-1)?.lines === 2) break
      }
    }
    expect(before.pages.at(-1)?.lines).toBe(2)
    expect(before.warnings.map((w) => w.code)).toEqual(["tail_overflow", "orphan_signature"])
    const { after } = await adjustLayout(path, [{ type: "compact_pages" }])
    expect(after.warnings).toEqual([])
    expect(after.total_pages).toBe(before.total_pages - 1)
    const pdf = join(dir, "document.pdf")
    vi.stubEnv("LLM_SUPPORTS_VISION", "false")
    vi.stubEnv("VISION_MODEL", "")
    const review = vi.fn(async (images: { page: number; data: string }[]) => {
      const png = Buffer.from(images[0].data, "base64")
      expect(png.readUInt32BE(16)).toBeLessThanOrEqual(960)
      return [{ page: 1, description: "测试解析的版面问题" }]
    })
    expect((await visualAudit(pdf, after, true, review)).status).toBe("skipped_no_vision_model")
    expect(review).not.toHaveBeenCalled()
    vi.stubEnv("VISION_MODEL", "test-vision")
    vi.stubEnv("VISION_API_KEY", "test")
    vi.stubEnv("VISION_BASE_URL", "http://localhost")
    expect((await visualAudit(pdf, before, true, review)).status).toBe("skipped_pending_layout")
    expect(review).not.toHaveBeenCalled()
    expect(await visualAudit(pdf, after, true, review)).toMatchObject({
      mode: "sidecar",
      status: "issues",
    })
    vi.stubEnv("LLM_SUPPORTS_VISION", "true")
    expect(await visualAudit(pdf, after, true, async () => [])).toMatchObject({
      mode: "native",
      status: "passed",
    })
  } finally {
    db.db.close()
    await rm(dir, { recursive: true, force: true })
  }
}, 180_000)

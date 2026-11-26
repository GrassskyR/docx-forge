import { test, expect } from "vitest"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { bodyBlocks, inspectReference, parseXml, Store, TemplateStore } from "../src/index.js"
import { unzipSync } from "fflate"

test("模板原件、风格基因、蓝图、规则、能力卡与默认选择在重启后可复用", async () => {
  const dir = await mkdtemp(join(tmpdir(), "docforge-assets-"))
  let db = new Store(join(dir, "profiles.db"))
  try {
    let assets = new TemplateStore(dir, db)
    expect(assets.list().map((a) => a.id)).toContain("builtin-standard-doc")

    const source = "eval/real_docs_v3/v3_01_pku_master_thesis.docx"
    const { doc_map, inspect_id } = await inspectReference(source, dir)
    const style_dna = doc_map.style_dna
    const baseZip = unzipSync(await readFile(join(dir, "inspections", inspect_id, "base.docx")))
    const blocks = bodyBlocks(parseXml(baseZip["word/document.xml"]).documentElement!)
    const pIdx = blocks.findIndex((b) => b.localName === "p" && b.textContent?.trim())
    const anchor = "B" + Math.max(0, pIdx)
    const blueprint = {
      template_kind: "flowing" as const,
      fields: [],
      content_slots: [{ name: "body", start: anchor, end: anchor, placement: "replace" as const }],
      prototypes: { body: anchor },
      preserved: doc_map.preserved,
    }
    const rules = "继承示范段落的字体、行距与缩进。\n".repeat(40)
    const asset = assets.save(inspect_id, "论文", "academic", blueprint, rules)
    const folder = assets.folder(asset.id)
    expect(await readFile(join(folder, "base.docx"))).toEqual(await readFile(source))
    expect(JSON.parse(await readFile(join(folder, "blueprint.json"), "utf8"))).toEqual(blueprint)
    expect(JSON.parse(await readFile(join(folder, "style_dna.json"), "utf8"))).toEqual(style_dna)
    expect(await readFile(join(folder, "SKILL.md"), "utf8")).toBe(rules)
    const child = assets.fork(asset.id, "子模板")
    assets.activate(child.id)
    db.db.close()
    db = new Store(join(dir, "profiles.db"))
    assets = new TemplateStore(dir, db)
    expect(assets.activeId).toBe(child.id)
    expect(assets.get(child.id).parent_id).toBe(asset.id)
    expect(child.capability_card).toContain("字体规范：正文")
    assets.delete(asset.id)
    expect(assets.list().map((a) => a.id)).toContain(child.id)
  } finally {
    db.db.close()
    await rm(dir, { recursive: true, force: true })
  }
}, 30_000)

import { test, expect } from "vitest"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { inspectReference, TemplateStore, Store } from "../src/index.js"

test("模板原件、蓝图、规则、能力卡与默认选择在重启后可复用", async () => {
  const dir = await mkdtemp(join(tmpdir(), "docforge-assets-"))
  let db = new Store(join(dir, "profiles.db"))
  try {
    let assets = new TemplateStore(dir, db)
    const source = "eval/real_docs_v3/v3_01_pku_master_thesis.docx"
    const { skeleton, inspect_id } = await inspectReference(source, dir)
    const { anchor } = skeleton.clusters.find(c => c.kind === "paragraph")!
    const blueprint = { slots: [{ name: "body", start: anchor, end: anchor }],
      prototypes: { body: anchor }, preserved: skeleton.preserved }
    const rules = "继承示范段落的字体、行距与缩进。\n".repeat(180)
    const asset = assets.save(inspect_id, "论文", "academic", blueprint, rules)
    const folder = assets.folder(asset.id)
    expect(await readFile(join(folder, "base.docx"))).toEqual(await readFile(source))
    expect(JSON.parse(await readFile(join(folder, "blueprint.json"), "utf8"))).toEqual(blueprint)
    expect(await readFile(join(folder, "SKILL.md"), "utf8")).toBe(rules)
    const child = assets.fork(asset.id, "子模板")
    assets.activate(child.id)
    db.db.close()
    db = new Store(join(dir, "profiles.db"))
    assets = new TemplateStore(dir, db)
    expect(assets.activeId).toBe(child.id)
    expect(assets.get(child.id).parent_id).toBe(asset.id)
    expect(child.capability_card.length).toBeLessThanOrEqual(1500)
    assets.delete(asset.id)
    expect(assets.list().map(a => a.id)).toEqual([child.id])
  } finally {
    db.db.close()
    await rm(dir, { recursive: true, force: true })
  }
}, 30_000)

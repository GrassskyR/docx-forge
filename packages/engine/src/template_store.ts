import { randomUUID } from "node:crypto"
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { unzipSync } from "fflate"
import { Assert } from "typebox/value"
import { Blueprint, type TemplateAsset } from "@docs-agent/shared"
import { Store } from "./store.js"
import { bodyBlocks } from "./doc_inspector.js"
import { W, children, parseXml } from "./xml_utils.js"

function describePrototypes(base: string, prototypes: Record<string, string>) {
  const xml = unzipSync(readFileSync(base))["word/document.xml"]
  if (!xml) return Object.keys(prototypes).join("、")
  const blocks = bodyBlocks(parseXml(xml).documentElement!)
  return Object.entries(prototypes)
    .map(([role, anchor]) => {
      const el = blocks[Number(anchor.slice(1))]
      if (el?.localName !== "tbl") return role
      const grid = children(el, "tblGrid")[0]
      const cols = grid
        ? children(grid, "gridCol").length
        : Math.max(0, ...children(el, "tr").map((r) => children(r, "tc").length))
      return cols > 0 ? `${role}(${cols}列)` : role
    })
    .join("、")
}

export class TemplateStore {
  constructor(
    readonly data: string,
    readonly store: Store,
  ) {
    store.db.exec(
      "CREATE TABLE IF NOT EXISTS template_assets(id TEXT PRIMARY KEY, payload TEXT NOT NULL)",
    )
  }
  get activeId() {
    const row = this.store.db
      .prepare("SELECT value FROM settings WHERE key='active_template'")
      .get()
    return row ? String(row.value) : null
  }
  list(): TemplateAsset[] {
    return this.store.db
      .prepare("SELECT payload FROM template_assets ORDER BY rowid")
      .all()
      .map((row) => JSON.parse(String(row.payload)))
  }
  get(id: string): TemplateAsset {
    const row = this.store.db.prepare("SELECT payload FROM template_assets WHERE id=?").get(id)
    if (!row) throw new Error("模板不存在")
    return JSON.parse(String(row.payload))
  }
  folder(id: string) {
    return join(this.data, "template_assets", this.get(id).id)
  }
  activate(id: string) {
    this.get(id)
    this.store.db.prepare("INSERT OR REPLACE INTO settings VALUES('active_template',?)").run(id)
  }
  save(
    inspectId: string,
    name: string,
    category: string,
    blueprint: Blueprint,
    rules: string,
    active = false,
  ) {
    if (!/^[0-9a-f-]{36}$/.test(inspectId)) throw new Error("无效检查编号")
    return this.persist(
      join(this.data, "inspections", inspectId, "base.docx"),
      name,
      category,
      blueprint,
      rules,
      null,
      active,
    )
  }
  fork(id: string, name: string) {
    const asset = this.get(id)
    const folder = this.folder(id)
    return this.persist(
      join(folder, "base.docx"),
      name,
      asset.category,
      asset.blueprint,
      readFileSync(join(folder, "SKILL.md"), "utf8"),
      id,
      false,
    )
  }
  private persist(
    base: string,
    name: string,
    category: string,
    blueprint: Blueprint,
    rules: string,
    parent_id: string | null,
    active: boolean,
  ) {
    Assert(Blueprint, blueprint)
    const id = randomUUID()
    const folder = join(this.data, "template_assets", id)
    const removedInfo = blueprint.remove_ranges?.length
      ? "剔除说明区 " + blueprint.remove_ranges.map((r) => r.start + "-" + r.end).join("、")
      : ""
    const capability_card = [
      name + " · " + category,
      "槽位 " + blueprint.slots.map((s) => s.name + "(" + s.start + "-" + s.end + ")").join("、"),
      "原型 " + describePrototypes(base, blueprint.prototypes),
      "保留 " + blueprint.preserved.join("、"),
      removedInfo,
      rules.split("\n").filter(Boolean).slice(0, 5).join("\n"),
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 1500)
    const asset = { id, name, category, blueprint, parent_id, capability_card }
    mkdirSync(folder, { recursive: true })
    this.store.db.exec("BEGIN")
    try {
      copyFileSync(base, join(folder, "base.docx"))
      writeFileSync(join(folder, "blueprint.json"), JSON.stringify(blueprint, null, 2))
      writeFileSync(join(folder, "SKILL.md"), rules)
      this.store.db
        .prepare("INSERT INTO template_assets VALUES(?,?)")
        .run(id, JSON.stringify(asset))
      if (active || !this.activeId) this.activate(id)
      this.store.db.exec("COMMIT")
    } catch (e) {
      this.store.db.exec("ROLLBACK")
      rmSync(folder, { recursive: true, force: true })
      throw e
    }
    return asset
  }
  delete(id: string) {
    const folder = this.folder(id)
    if (id === this.activeId) throw new Error("不能删除当前模板")
    this.store.db.prepare("DELETE FROM template_assets WHERE id=?").run(id)
    rmSync(folder, { recursive: true, force: true })
  }
}

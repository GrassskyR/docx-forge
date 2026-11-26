import { randomUUID } from "node:crypto"
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { unzipSync } from "fflate"
import { Assert } from "typebox/value"
import { Blueprint, StyleDNA, type TemplateAsset } from "@docs-agent/shared"
import { buildDefaultSeedDocx } from "./builders.js"
import { resolveCoord } from "./dom_locator.js"
import { Store } from "./store.js"
import { children, parseXml } from "./xml_utils.js"

const BUILTIN_ID = "builtin-standard-doc"

function describePrototypes(base: string, prototypes: Record<string, string>) {
  const xml = unzipSync(readFileSync(base))["word/document.xml"]
  if (!xml) return Object.keys(prototypes).join("、")
  const root = parseXml(xml).documentElement!
  const entries = Object.entries(prototypes).map(([role, coord]) => {
    const resolved = resolveCoord(root, coord)
    if (resolved?.element.localName !== "tbl") return role
    const grid = children(resolved.element, "tblGrid")[0]
    const cols = grid
      ? children(grid, "gridCol").length
      : Math.max(0, ...children(resolved.element, "tr").map((r) => children(r, "tc").length))
    return cols > 0 ? `${role}(${cols}列)` : role
  })
  if (!prototypes.table) entries.push("table(标准三线表)")
  return entries.join("、")
}

export function buildCapabilityCard(
  name: string,
  category: string,
  baseDocxPath: string,
  blueprint: Blueprint,
  dna: StyleDNA,
  rules: string,
): string {
  const fieldDesc = blueprint.fields.length
    ? blueprint.fields
        .map((f) => (f.label ? `${f.name}[${f.label}]` : f.name))
        .join("、")
    : "无固定填空项（如需生成独立封面可传 generate_cover=true 与自定义 slot_values）"

  const slotDesc = blueprint.content_slots
    .map((s) => (s.label ? `${s.name}[固定标题:${s.label}]` : `${s.name}(${s.start}..${s.end})`))
    .join("、")

  const builders: string[] = []
  if (blueprint.cover_builder?.enabled) builders.push("自动生成封面")
  if (blueprint.toc?.mode === "generate") builders.push("自动生成原生Word目录TOC")
  else if (blueprint.toc?.mode === "refresh_existing" || dna.has_existing_toc) {
    builders.push("自动刷新原件目录TOC与真实页码")
  }
  if (dna.has_header_logo) builders.push("无损保留页眉图像资源")

  const styleLine =
    `字体规范：正文 ${dna.body_style.font_cn}/${dna.body_style.font_en} ` +
    `${dna.body_style.size_pt}pt；一级标题 ${dna.heading_1_style.font_cn} ` +
    `${dna.heading_1_style.size_pt}pt`

  return [
    `[激活模板] ${name} · ${category}`,
    `元数据填空项(slot_values,只填纯值不带标签): ${fieldDesc}`,
    `正文内容槽位(body_plan.slot): ${slotDesc}`,
    `可用样式原型(prototype): ${describePrototypes(baseDocxPath, blueprint.prototypes)}`,
    `保留与自动组件: ${[...blueprint.preserved, ...builders].join("、") || "母版节属性与样式"}`,
    styleLine,
    rules.trim() ? `排版约束: ${rules.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n")
}

export class TemplateStore {
  constructor(
    readonly data: string,
    readonly store: Store,
  ) {
    this.ensureBuiltinSeed()
  }

  private ensureBuiltinSeed() {
    const countRow = this.store.db
      .prepare("SELECT COUNT(*) as n FROM template_assets")
      .get() as { n: number }
    if (countRow.n > 0) return
    const folder = join(this.data, "template_assets", BUILTIN_ID)
    mkdirSync(folder, { recursive: true })
    const basePath = join(folder, "base.docx")
    writeFileSync(basePath, buildDefaultSeedDocx())
    const dna: StyleDNA = {
      page_width_twips: 11906,
      page_height_twips: 16838,
      margins_twips: {
        top: 2098,
        bottom: 1985,
        left: 1588,
        right: 1474,
        header: 851,
        footer: 992,
      },
      has_header_logo: false,
      header_texts: [],
      footer_texts: [],
      header_refs: [],
      footer_refs: [],
      media_count: 0,
      has_existing_toc: false,
      title_style: {
        font_cn: "方正小标宋简体",
        font_en: "Times New Roman",
        size_pt: 22,
        bold: true,
        alignment: "center",
        line_twips: 560,
        line_rule: "exact",
        first_line_twips: 0,
      },
      heading_1_style: {
        font_cn: "黑体",
        font_en: "Times New Roman",
        size_pt: 16,
        bold: true,
        alignment: "left",
        line_twips: 560,
        line_rule: "exact",
        first_line_twips: 640,
      },
      heading_2_style: {
        font_cn: "楷体_GB2312",
        font_en: "Times New Roman",
        size_pt: 16,
        bold: true,
        alignment: "left",
        line_twips: 560,
        line_rule: "exact",
        first_line_twips: 640,
      },
      heading_3_style: {
        font_cn: "仿宋_GB2312",
        font_en: "Times New Roman",
        size_pt: 16,
        bold: true,
        alignment: "both",
        line_twips: 560,
        line_rule: "exact",
        first_line_twips: 640,
      },
      body_style: {
        font_cn: "仿宋_GB2312",
        font_en: "Times New Roman",
        size_pt: 16,
        bold: false,
        alignment: "both",
        line_twips: 560,
        line_rule: "exact",
        first_line_twips: 640,
      },
    }
    const blueprint: Blueprint = {
      template_kind: "flowing",
      fields: [{ name: "title", label: "文档标题", coord: "B0", mode: "cell" }],
      content_slots: [{ name: "body", start: "B1", end: "B3", placement: "replace" }],
      prototypes: {
        title: "B0",
        heading_1: "B1",
        heading_2: "B2",
        heading_3: "B3",
        body: "B3",
      },
      preserved: ["A4标准版心", "文档样式链"],
    }
    const rules =
      "一级标题用 heading_1，二级标题用 heading_2，三级条目用 heading_3，正文用 body；" +
      "若需独立封面与目录可开启 generate_cover 与 generate_toc。"
    const capability_card = buildCapabilityCard(
      "通用标准文档格式",
      "gongwen",
      basePath,
      blueprint,
      dna,
      rules,
    )
    const asset: TemplateAsset = {
      id: BUILTIN_ID,
      name: "通用标准文档格式",
      category: "gongwen",
      blueprint,
      style_dna: dna,
      parent_id: null,
      capability_card,
    }
    writeFileSync(join(folder, "blueprint.json"), JSON.stringify(blueprint, null, 2))
    writeFileSync(join(folder, "style_dna.json"), JSON.stringify(dna, null, 2))
    writeFileSync(join(folder, "SKILL.md"), rules)
    this.store.db
      .prepare("INSERT OR REPLACE INTO template_assets VALUES(?,?)")
      .run(BUILTIN_ID, JSON.stringify(asset))
    this.store.db
      .prepare("INSERT OR REPLACE INTO settings VALUES('active_template',?)")
      .run(BUILTIN_ID)
  }

  get activeId(): string | null {
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
    if (!row) throw new Error("模板不存在: " + id)
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
    active = true,
  ) {
    if (!/^[0-9a-f-]{36}$/.test(inspectId)) throw new Error("无效检查编号")
    const inspDir = join(this.data, "inspections", inspectId)
    const docMapPath = join(inspDir, "doc_map.json")
    const dna: StyleDNA = existsSync(docMapPath)
      ? JSON.parse(readFileSync(docMapPath, "utf8")).style_dna
      : this.get(BUILTIN_ID).style_dna
    return this.persist(
      join(inspDir, "base.docx"),
      name,
      category,
      blueprint,
      dna,
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
      asset.style_dna,
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
    style_dna: StyleDNA,
    rules: string,
    parent_id: string | null,
    active: boolean,
  ) {
    Assert(Blueprint, blueprint)
    Assert(StyleDNA, style_dna)
    const id = randomUUID()
    const folder = join(this.data, "template_assets", id)
    const capability_card = buildCapabilityCard(name, category, base, blueprint, style_dna, rules)
    const asset: TemplateAsset = {
      id,
      name,
      category,
      blueprint,
      style_dna,
      parent_id,
      capability_card,
    }
    mkdirSync(folder, { recursive: true })
    this.store.db.exec("BEGIN")
    try {
      copyFileSync(base, join(folder, "base.docx"))
      writeFileSync(join(folder, "blueprint.json"), JSON.stringify(blueprint, null, 2))
      writeFileSync(join(folder, "style_dna.json"), JSON.stringify(style_dna, null, 2))
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
    if (id === BUILTIN_ID || id === this.activeId) throw new Error("不能删除当前或内置模板")
    const folder = this.folder(id)
    this.store.db.prepare("DELETE FROM template_assets WHERE id=?").run(id)
    rmSync(folder, { recursive: true, force: true })
  }
}

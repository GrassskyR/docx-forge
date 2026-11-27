import { execFile } from "node:child_process"
import { randomUUID } from "node:crypto"
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { unzipSync } from "fflate"
import { Assert } from "typebox/value"
import { Blueprint, StyleDNA, type FieldSlot, type TemplateAsset } from "@docs-agent/shared"
import { buildDefaultSeedDocx } from "./builders.js"
import { convert } from "./doc_converter.js"
import { paraPlainText, resolveCoord } from "./dom_locator.js"
import { Store } from "./store.js"
import { children, parseXml } from "./xml_utils.js"

const run = promisify(execFile)
export const BUILTIN_TEMPLATE_ID = "builtin-standard-doc"
const BUILTIN_ID = BUILTIN_TEMPLATE_ID

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

function extractFieldSamples(id: string, base: string, fields: FieldSlot[]): FieldSlot[] {
  if (!fields.length || !existsSync(base)) return fields
  const xml = unzipSync(readFileSync(base))["word/document.xml"]
  if (!xml) return fields
  const root = parseXml(xml).documentElement!
  return fields.map((f) => {
    if (f.sample !== undefined) return f
    let sample = f.match?.trim() ?? ""
    if (!sample && f.coord && id !== BUILTIN_ID) {
      const node = resolveCoord(root, f.coord)
      if (node) {
        const raw =
          node.element.localName === "p"
            ? paraPlainText(node.element)
            : (node.element.textContent ?? "")
        let cleaned = raw.replace(/\s+/g, " ").trim()
        if (f.label) {
          const cleanLbl = f.label.replace(/[：:\s]+$/, "")
          if (cleanLbl && cleaned.startsWith(cleanLbl)) {
            cleaned = cleaned.slice(cleanLbl.length).replace(/^[：:\s]+/, "")
          }
        }
        if (f.mode === "colon") {
          const cIdx = cleaned.search(/[：:]/)
          if (cIdx >= 0) cleaned = cleaned.slice(cIdx + 1).trim()
        }
        if (!/^[_\s＿—-]+$/.test(cleaned)) sample = cleaned.slice(0, 40)
      }
    }
    return sample ? { ...f, sample } : f
  })
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
    `元数据填空项(slot_values,只填纯值不带标签,未填项自动置空): ${fieldDesc}`,
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

  private sampleUrlsOf(id: string): string[] {
    const dir = join(this.data, "template_assets", id)
    if (!existsSync(dir)) return []
    return readdirSync(dir)
      .filter((f) => /^sample-\d+\.png$/.test(f))
      .sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
      .map((f) => `/files/template_assets/${id}/${f}`)
  }

  private enrich(asset: TemplateAsset): TemplateAsset {
    const base = join(this.data, "template_assets", asset.id, "base.docx")
    const fields = extractFieldSamples(asset.id, base, asset.blueprint.fields)
    const sample_urls = this.sampleUrlsOf(asset.id)
    return {
      ...asset,
      blueprint: { ...asset.blueprint, fields },
      ...(sample_urls.length ? { sample_urls } : {}),
    }
  }

  get activeId(): string | null {
    const row = this.store.db
      .prepare("SELECT value FROM settings WHERE key='active_template'")
      .get()
    return row ? String(row.value) : BUILTIN_ID
  }

  list(): TemplateAsset[] {
    return this.store.db
      .prepare("SELECT payload FROM template_assets ORDER BY rowid")
      .all()
      .map((row) => this.enrich(JSON.parse(String(row.payload))))
  }

  get(id: string): TemplateAsset {
    const row = this.store.db.prepare("SELECT payload FROM template_assets WHERE id=?").get(id)
    if (!row) throw new Error("模板不存在: " + id)
    return this.enrich(JSON.parse(String(row.payload)))
  }

  has(id: string): boolean {
    const row = this.store.db.prepare("SELECT 1 FROM template_assets WHERE id=?").get(id)
    return Boolean(row)
  }

  rulesOf(id: string): string {
    const folder = this.folder(id)
    const p = join(folder, "SKILL.md")
    return existsSync(p) ? readFileSync(p, "utf8") : ""
  }

  folder(id: string) {
    return join(this.data, "template_assets", this.get(id).id)
  }

  activate(id: string) {
    this.get(id)
    this.store.db.prepare("INSERT OR REPLACE INTO settings VALUES('active_template',?)").run(id)
  }

  async ensureSamples(id: string): Promise<string[]> {
    const existing = this.sampleUrlsOf(id)
    if (existing.length) return existing
    const folder = this.folder(id)
    const basePath = join(folder, "base.docx")
    const work = await mkdtemp(join(tmpdir(), "docforge-tpl-sample-"))
    try {
      const pdf = await convert(basePath, work, "pdf")
      const infoOut = await run("pdfinfo", [pdf], { env: { ...process.env, LC_ALL: "C" } })
      const maxPage = Math.min(3, Number(/^Pages:\s*(\d+)/m.exec(infoOut.stdout)?.[1] ?? 1))
      for (let p = 1; p <= maxPage; p++) {
        await run("pdftoppm", [
          "-f",
          String(p),
          "-l",
          String(p),
          "-singlefile",
          "-scale-to",
          "960",
          "-png",
          pdf,
          join(folder, `sample-${p}`),
        ])
      }
      return this.sampleUrlsOf(id)
    } finally {
      await rm(work, { recursive: true, force: true })
    }
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
    const samples = existsSync(inspDir)
      ? readdirSync(inspDir).filter((f) => /^sample-\d+\.png$/.test(f))
      : []
    return this.persist(
      join(inspDir, "base.docx"),
      name,
      category,
      blueprint,
      dna,
      rules,
      null,
      active,
      samples.map((f) => join(inspDir, f)),
    )
  }

  fork(id: string, name: string) {
    const asset = this.get(id)
    const folder = this.folder(id)
    const samples = existsSync(folder)
      ? readdirSync(folder)
          .filter((f) => /^sample-\d+\.png$/.test(f))
          .map((f) => join(folder, f))
      : []
    return this.persist(
      join(folder, "base.docx"),
      name,
      asset.category,
      asset.blueprint,
      asset.style_dna,
      readFileSync(join(folder, "SKILL.md"), "utf8"),
      id,
      false,
      samples,
    )
  }

  update(id: string, patch: { name?: string; category?: string }): TemplateAsset {
    const rawRow = this.store.db.prepare("SELECT payload FROM template_assets WHERE id=?").get(id)
    if (!rawRow) throw new Error("模板不存在: " + id)
    const raw = JSON.parse(String(rawRow.payload)) as TemplateAsset
    const folder = join(this.data, "template_assets", id)
    const rules = existsSync(join(folder, "SKILL.md"))
      ? readFileSync(join(folder, "SKILL.md"), "utf8")
      : ""
    const nextName = patch.name?.trim() || raw.name
    const nextCat = patch.category?.trim() || raw.category
    const capability_card = buildCapabilityCard(
      nextName,
      nextCat,
      join(folder, "base.docx"),
      raw.blueprint,
      raw.style_dna,
      rules,
    )
    const updated: TemplateAsset = {
      ...raw,
      name: nextName,
      category: nextCat,
      capability_card,
    }
    this.store.db
      .prepare("UPDATE template_assets SET payload=? WHERE id=?")
      .run(JSON.stringify(updated), id)
    return this.enrich(updated)
  }

  async saveEdited(
    sourceId: string,
    opts: {
      saveAsNew?: boolean
      setActive?: boolean
      name?: string
      category?: string
      blueprint: Blueprint
      style_dna: StyleDNA
      rules_md: string
      baseBytes: Uint8Array
    },
  ): Promise<{ asset: TemplateAsset; forked: boolean }> {
    const rawRow = this.store.db
      .prepare("SELECT payload FROM template_assets WHERE id=?")
      .get(sourceId)
    if (!rawRow) throw new Error("模板不存在: " + sourceId)
    const raw = JSON.parse(String(rawRow.payload)) as TemplateAsset
    Assert(Blueprint, opts.blueprint)
    Assert(StyleDNA, opts.style_dna)

    const shouldFork = sourceId === BUILTIN_ID || Boolean(opts.saveAsNew)
    const nextCategory = opts.category?.trim() || raw.category
    if (shouldFork) {
      const fallbackName =
        sourceId === BUILTIN_ID ? raw.name + "（定制版）" : raw.name + "（修订版）"
      const nextName = opts.name?.trim() || fallbackName
      const work = await mkdtemp(join(tmpdir(), "docforge-tpl-edit-"))
      try {
        const tmpBase = join(work, "base.docx")
        writeFileSync(tmpBase, opts.baseBytes)
        const created = this.persist(
          tmpBase,
          nextName,
          nextCategory,
          opts.blueprint,
          opts.style_dna,
          opts.rules_md,
          sourceId,
          Boolean(opts.setActive),
        )
        await this.ensureSamples(created.id)
        return { asset: this.get(created.id), forked: true }
      } finally {
        await rm(work, { recursive: true, force: true })
      }
    }

    const nextName = opts.name?.trim() || raw.name
    const folder = join(this.data, "template_assets", sourceId)
    const basePath = join(folder, "base.docx")
    writeFileSync(basePath, opts.baseBytes)
    for (const f of readdirSync(folder)) {
      if (/^sample-\d+\.png$/.test(f)) rmSync(join(folder, f), { force: true })
    }
    writeFileSync(join(folder, "blueprint.json"), JSON.stringify(opts.blueprint, null, 2))
    writeFileSync(join(folder, "style_dna.json"), JSON.stringify(opts.style_dna, null, 2))
    writeFileSync(join(folder, "SKILL.md"), opts.rules_md)
    const capability_card = buildCapabilityCard(
      nextName,
      nextCategory,
      basePath,
      opts.blueprint,
      opts.style_dna,
      opts.rules_md,
    )
    const updated: TemplateAsset = {
      ...raw,
      name: nextName,
      category: nextCategory,
      blueprint: opts.blueprint,
      style_dna: opts.style_dna,
      capability_card,
    }
    this.store.db
      .prepare("UPDATE template_assets SET payload=? WHERE id=?")
      .run(JSON.stringify(updated), sourceId)
    if (opts.setActive) this.activate(sourceId)
    await this.ensureSamples(sourceId)
    return { asset: this.get(sourceId), forked: false }
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
    sampleFiles: string[] = [],
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
      for (const sf of sampleFiles) {
        const fname = sf.split(/[/\\]/).at(-1)!
        copyFileSync(sf, join(folder, fname))
      }
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
    return this.enrich(asset)
  }

  delete(id: string) {
    if (id === BUILTIN_ID) throw new Error("不能删除系统内置默认模板")
    const folder = this.folder(id)
    if (this.activeId === id) {
      this.activate(BUILTIN_ID)
    }
    this.store.db.prepare("DELETE FROM template_assets WHERE id=?").run(id)
    rmSync(folder, { recursive: true, force: true })
  }
}

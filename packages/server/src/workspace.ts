import { join, dirname, basename } from "node:path"
import { readFile, writeFile } from "node:fs/promises"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { unzipSync } from "fflate"
import { Assert } from "typebox/value"
import {
  Blueprint,
  ComposePlan,
  type LayoutTelemetry,
  type LintReport,
  type Skeleton,
  type TemplateAsset,
} from "@docs-agent/shared"
import {
  TemplateStore,
  bodyBlocks,
  inspectReference,
  ingestDraft,
  compose,
  readDraft,
  preview,
  convert,
  telemetry,
  adjustLayout,
  visualAudit,
  auditComposition,
  parseXml,
  type Adjustment,
  type ComposeInput,
} from "@docs-agent/engine"
import { Documents } from "./documents.js"
import { jsonCompletion } from "./model.js"
import { logger } from "./logger.js"

const run = promisify(execFile)

function sanitizeBlueprint(raw: Blueprint, parsed: Skeleton, basePathBytes: Uint8Array): Blueprint {
  const doc = parseXml(unzipSync(basePathBytes)["word/document.xml"])
  const blocks = bodyBlocks(doc.documentElement!)
  const validAnchor = (a: string) => {
    const idx = Number(a?.slice(1))
    return /^B\d+$/.test(a) && idx >= 0 && idx < blocks.length
  }
  const validPara = (a: string) => validAnchor(a) && blocks[Number(a.slice(1))].localName === "p"
  const fallbackBody =
    parsed.clusters.find((c) => c.kind === "paragraph" && validPara(c.anchor))?.anchor ??
    "B" + Math.max(0, blocks.findIndex((b) => b.localName === "p"))

  const remove_ranges = [
    ...(raw.remove_ranges ?? []).filter(
      (r) => validAnchor(r.start) && validAnchor(r.end) && Number(r.end.slice(1)) >= Number(r.start.slice(1)),
    ),
  ]
  for (const sec of parsed.section_outline ?? []) {
    if (
      sec.role_hint === "instruction_guide_removable" &&
      !remove_ranges.some((r) => r.start === sec.start && r.end === sec.end)
    ) {
      remove_ranges.push({ start: sec.start, end: sec.end, reason: "填写说明与格式示例节" })
    }
  }
  const removedIdx = new Set<number>()
  for (const r of remove_ranges) {
    for (let i = Number(r.start.slice(1)); i <= Number(r.end.slice(1)); i++) removedIdx.add(i)
  }

  let slots = (raw.slots ?? []).filter((s) => {
    if (!validAnchor(s.start) || !validAnchor(s.end)) return false
    const st = Number(s.start.slice(1))
    const ed = Number(s.end.slice(1))
    return ed >= st && !removedIdx.has(st)
  })
  if (!slots.some((s) => s.name === "body")) {
    slots.push({ name: "body", start: fallbackBody, end: fallbackBody })
  }

  // 多节模板（含封面或说明节）中，若正文节是占位章节骨架而模型仅映射了单行，自动扩展覆盖整个正文占位节。
  const outline = parsed.section_outline ?? []
  const hasFrontMatter = outline.some((s) =>
    ["cover", "instruction_guide_removable", "toc_preserved"].includes(s.role_hint),
  )
  const lastBodySec = [...outline].reverse().find((s) => s.role_hint === "body_or_content")
  if (hasFrontMatter && lastBodySec) {
    const bodySlot = slots.find((s) => s.name === "body")!
    const st = Number(bodySlot.start.slice(1))
    const ed = Number(bodySlot.end.slice(1))
    const secStart = Number(lastBodySec.start.slice(1))
    const secEnd = Number(lastBodySec.end.slice(1))
    if (st === ed && st >= secStart && st <= secEnd && secEnd > secStart) {
      bodySlot.start = "B" + secStart
      bodySlot.end = "B" + secEnd
    }
  }

  // 消除槽位重叠（封面单行槽位优先，正文区间避让）
  const claimed = new Set<number>()
  const cleanSlots: Blueprint["slots"] = []
  for (const s of [
    ...slots.filter((x) => x.name !== "body"),
    ...slots.filter((x) => x.name === "body"),
  ]) {
    let st = Number(s.start.slice(1))
    const ed = Number(s.end.slice(1))
    while (st <= ed && (claimed.has(st) || removedIdx.has(st))) st++
    if (st > ed) continue
    let overlap = false
    for (let i = st; i <= ed; i++) {
      if (claimed.has(i) || removedIdx.has(i)) overlap = true
    }
    if (overlap) continue
    for (let i = st; i <= ed; i++) claimed.add(i)
    cleanSlots.push({ name: s.name, start: "B" + st, end: "B" + ed })
  }

  const prototypes: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw.prototypes ?? {})) {
    if (validAnchor(v)) prototypes[k] = v
  }
  if (!prototypes.body || !validPara(prototypes.body)) prototypes.body = fallbackBody
  if (!prototypes.heading_3 || !validPara(prototypes.heading_3)) {
    prototypes.heading_3 = prototypes.heading_2 ?? prototypes.heading_1 ?? prototypes.body
  }

  const clean: Blueprint = {
    ...(raw.grid ? { grid: raw.grid } : {}),
    slots: cleanSlots.length ? cleanSlots : [{ name: "body", start: fallbackBody, end: fallbackBody }],
    ...(remove_ranges.length ? { remove_ranges } : {}),
    prototypes,
    preserved: raw.preserved ?? parsed.preserved,
  }
  Assert(Blueprint, clean)
  return clean
}

export class Workspace {
  readonly templates: TemplateStore
  constructor(readonly docs: Documents) {
    this.templates = new TemplateStore(docs.directory, docs.store)
  }
  async inspect(path: string, sample_pages: number[] = [1]) {
    const result = await inspectReference(path, this.docs.directory)
    const dir = join(this.docs.directory, "inspections", result.inspect_id)
    const urls = []
    if (sample_pages.length) {
      const pdf = await convert(join(dir, "base.docx"), dir, "pdf")
      for (const page of [...new Set(sample_pages)].slice(0, 3)) {
        if (!Number.isInteger(page) || page < 1) throw new Error("无效采样页")
        const name = "sample-" + page
        await run("pdftoppm", [
          "-f",
          String(page),
          "-l",
          String(page),
          "-singlefile",
          "-scale-to",
          "960",
          "-png",
          pdf,
          join(dir, name),
        ])
        urls.push("/files/inspections/" + result.inspect_id + "/" + name + ".png")
      }
    }
    logger.info(
      {
        inspectId: result.inspect_id,
        paragraphs: result.skeleton.paragraphs,
        sections: result.skeleton.sections,
        skeletonChars: JSON.stringify(result.skeleton).length,
      },
      "完成范例文档骨架解剖",
    )
    return { ...result, sample_urls: urls }
  }
  async internalize(id: string, name: string, category: string, rules: string) {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("无效检查编号")
    const dir = join(this.docs.directory, "inspections", id)
    const skeletonRaw = await readFile(join(dir, "skeleton.json"), "utf8")
    const parsedSkeleton = JSON.parse(skeletonRaw) as Skeleton
    const baseBytes = await readFile(join(dir, "base.docx"))

    if (!this.docs.useModel) {
      const anchor = parsedSkeleton.clusters.find((c) => c.kind === "paragraph")?.anchor ?? "B0"
      const fallback = sanitizeBlueprint(
        {
          slots: [{ name: "body", start: anchor, end: anchor }],
          prototypes: { body: anchor, heading_3: anchor },
          preserved: parsedSkeleton.preserved,
        },
        parsedSkeleton,
        baseBytes,
      )
      return this.templates.save(id, name, category, fallback, rules || "继承原件示范段落样式。", true)
    }

    const result = await jsonCompletion(
      [
        "从文档骨架学习模板结构并只输出合法 JSON：",
        '{"blueprint":{"slots":[{"name":"title","start":"B7","end":"B7"},' +
          '{"name":"body","start":"B48","end":"B84"}],',
        '"remove_ranges":[{"start":"B21","end":"B46","reason":"填写说明页"}],',
        '"prototypes":{"heading_1":"B48","heading_2":"B49","heading_3":"B50","body":"B51"},' +
          '"preserved":["封面","页眉","页脚"]},',
        '"rules_md":"简明排版规则"}。',
        "核心规则：",
        "1. 只使用 skeleton 中真实出现的 B<数字> 锚点。",
        "2. 若 section_outline 中存在 role_hint=instruction_guide_removable（如填写说明、" +
          "本页不打印、图表格式示例），必须将其 start..end 放入 remove_ranges 剔除，并提炼规则进 rules_md。",
        "3. 若存在 cover 封面节：保留校名/徽标/大标题，将可填写的报告题目、学号、学院、专业、" +
          "班级、学生姓名、指导教师、日期设为独立单行槽位（start=end）；保留 toc_preserved 自动目录节。",
        "4. 正文槽位 name='body'：若正文节整节都是示例章节与占位文字（如 1.xxx、1.1小标题、" +
          "正文内容...、心得体会），start 必须填该正文示范区首块、end 填末块以完整替换示例！" +
          "若为单节红头公文无分节封面，则只选正文示范段作 body 槽位以保留红头和文末版记。",
        "5. prototypes 尽可能提取 heading_1、heading_2、heading_3、body（均为段落锚点）及 table（若有表格锚点）。",
        "6. rules_md 控制在 140 字以内纯文本，不要包含未转义英文双引号。",
        "模板类别：" + category,
        "用户额外约束：" + rules,
        skeletonRaw,
      ].join("\n"),
      this.docs.bill,
      [],
      "internalize-template",
    )
    const blueprint = sanitizeBlueprint(result.blueprint, parsedSkeleton, baseBytes)
    const saved = this.templates.save(id, name, category, blueprint, String(result.rules_md ?? ""), true)
    logger.info(
      {
        templateId: saved.id,
        name: saved.name,
        slots: saved.blueprint.slots,
        removeRanges: saved.blueprint.remove_ranges ?? [],
        prototypes: saved.blueprint.prototypes,
      },
      "模板资产内化入库完成",
    )
    return saved
  }
  ingest(input: { text?: string; file_path?: string }) {
    return ingestDraft(this.docs.directory, input)
  }
  async plan(template: TemplateAsset, draftId: string) {
    const paragraphs = await readDraft(this.docs.directory, draftId)
    const outline = paragraphs.map((p, i) => "P" + i + "|" + p.length + "|" + p.slice(0, 24))
    const paraProtos = Object.keys(template.blueprint.prototypes ?? {}).filter((k) => k !== "table")
    const protoRule = paraProtos.length
      ? "prototype 只能从以下已声明段落原型中选择：" + paraProtos.join("、") + "。"
      : 'prototype 使用已声明的角色名，如 "body"、"heading_1" 等。'
    const plan = await jsonCompletion(
      [
        "只输出 JSON 数组，按顺序无遗漏覆盖 P0 到 P" +
          (paragraphs.length - 1) +
          "。相邻同类型正文合并为一个区间。",
        '每项只含 prototype 和 range，如 {"prototype":"body","range":"P0-P9"}。禁止输出 slot。',
        protoRule,
        "下方草稿目录每行为「段落编号|总字数|前 24 字」，据此识别各级标题、正文、落款与日期。",
        template.capability_card,
        outline.join("\n"),
      ].join("\n"),
      this.docs.bill,
      [],
      "plan-zero-copy",
    )
    Assert(ComposePlan, plan)
    const slot =
      template.blueprint.slots.find((s) => s.name === "body") ?? template.blueprint.slots[0]
    const fallbackProto = paraProtos.includes("body") || !paraProtos.length ? "body" : paraProtos[0]
    return plan.map(({ range, prototype }) => ({
      range,
      prototype: !paraProtos.length || paraProtos.includes(prototype) ? prototype : fallbackProto,
      slot: slot.name,
    }))
  }
  async compose(
    input: Omit<ComposeInput, "body_plan"> & { template_id?: string; body_plan?: ComposePlan },
  ) {
    const asset = this.templates.get(input.template_id ?? this.templates.activeId ?? "")
    const body_plan = input.body_plan ?? (await this.plan(asset, input.draft_id!))
    const result = await compose(this.docs.directory, asset, { ...input, body_plan })
    const expected =
      input.mode === "exact_copy"
        ? await readDraft(this.docs.directory, input.draft_id!)
        : undefined
    const directory = dirname(result.docx_path)
    const lint_report = await auditComposition(
      result.docx_path,
      join(this.templates.folder(asset.id), "base.docx"),
      result.body_indices,
      expected?.map((s) =>
        input.normalize_punctuation ? s.replace(/[\[［](\d{4})[\]］]/g, "〔$1〕") : s,
      ),
      result.removed_sections,
    )
    const layout = await telemetry(result.docx_path, directory)
    const pages = await preview(result.docx_path, directory)
    const response = {
      ...result,
      template_id: asset.id,
      lint_report,
      layout,
      fidelity: expected && lint_report.passed ? 1 : null,
      usage: this.docs.bill.snapshot(),
      preview_urls: pages.map((p) => "/files/documents/" + result.doc_id + "/" + basename(p)),
    }
    await writeFile(join(directory, "result.json"), JSON.stringify(response))
    logger.info(
      {
        docId: result.doc_id,
        templateId: asset.id,
        mode: input.mode,
        pages: layout.total_pages,
        passed: lint_report.passed,
      },
      "文档留壳组装与双轨遥测完成",
    )
    return response
  }
  private directory(id: string) {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("无效文档编号")
    return join(this.docs.directory, "documents", id)
  }
  async adjust(id: string, operations: Adjustment[]) {
    const dir = this.directory(id)
    const result = JSON.parse(await readFile(join(dir, "result.json"), "utf8"))
    const changes = await adjustLayout(join(dir, "document.docx"), operations)
    result.layout = changes.after
    result.preview_urls = changes.preview_files.map((p) => "/files/documents/" + id + "/" + p)
    await writeFile(join(dir, "result.json"), JSON.stringify(result))
    logger.info(
      {
        docId: id,
        pagesBefore: changes.before.total_pages,
        pagesAfter: changes.after.total_pages,
        warningsAfter: changes.after.warnings.length,
      },
      "文档版面收口调整完成",
    )
    return { ...result, before: changes.before, after: changes.after }
  }
  async audit(id: string, runVision = true) {
    const dir = this.directory(id)
    const result = JSON.parse(await readFile(join(dir, "result.json"), "utf8")) as {
      layout: LayoutTelemetry
      lint_report: LintReport
    }
    const vision = await visualAudit(
      join(dir, "document.pdf"),
      result.layout,
      result.lint_report.passed,
      async (images) => {
        const output = await jsonCompletion(
          '检查关键页的排版。返回 {"issues":[{"page":1,"description":"问题"}]}，无问题时返回空数组。',
          this.docs.bill,
          images,
          "visual-audit",
        )
        return output.issues
      },
      runVision,
    )
    return { ...result, vision }
  }
}

import { join, dirname, basename } from "node:path"
import { readFile, writeFile } from "node:fs/promises"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { Assert } from "typebox/value"
import {
  Blueprint,
  ComposePlan,
  type LayoutTelemetry,
  type LintReport,
  type TemplateAsset,
} from "@docs-agent/shared"
import {
  TemplateStore,
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
  type Adjustment,
  type ComposeInput,
} from "@docs-agent/engine"
import { Documents } from "./documents.js"
import { jsonCompletion } from "./model.js"

const run = promisify(execFile)
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
    return { ...result, sample_urls: urls }
  }
  async internalize(id: string, name: string, category: string, rules: string) {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("无效检查编号")
    const skeleton = await readFile(
      join(this.docs.directory, "inspections", id, "skeleton.json"),
      "utf8",
    )
    const result = await jsonCompletion(
      [
        '从骨架学习模板并输出 {"blueprint":{"slots":[{"name":"body","start":"B2","end":"B2"}],',
        '"prototypes":{"body":"B2","heading_3":"B2"},"preserved":[]},"rules_md":"规则书"}。',
        "只用骨架出现的锚点。正文槽位选正文示范段落，保留封面、页眉与版记。原型可包含表格、题注和参考文献。",
        "模板类别 " + category,
        "用户约束 " + rules,
        skeleton,
      ].join("\n"),
      this.docs.bill,
    )
    Assert(Blueprint, result.blueprint)
    return this.templates.save(id, name, category, result.blueprint, result.rules_md, true)
  }
  ingest(input: { text?: string; file_path?: string }) {
    return ingestDraft(this.docs.directory, input)
  }
  async plan(template: TemplateAsset, draftId: string) {
    const paragraphs = await readDraft(this.docs.directory, draftId)
    // 全量紧凑目录：每段一行「编号|字数|前 24 字」，约 30 字/段，80 段草稿约 2.4k 字符。
    const outline = paragraphs.map((p, i) => "P" + i + "|" + p.length + "|" + p.slice(0, 24))
    const plan = await jsonCompletion(
      [
        "只输出 JSON 数组，按顺序无遗漏覆盖 P0 到 P" +
          (paragraphs.length - 1) +
          "。相邻正文合并为一个区间。",
        '每项只含 prototype 和 range，如 {"prototype":"body","range":"P0-P9"}。禁止输出 slot。',
        "下方草稿目录每行为「段落编号|总字数|前 24 字」，据此识别各级标题、正文、落款与日期。",
        template.capability_card,
        outline.join("\n"),
      ].join("\n"),
      this.docs.bill,
    )
    Assert(ComposePlan, plan)
    const slot = template.blueprint.slots.find(s => s.name === "body") ?? template.blueprint.slots[0]
    return plan.map(({ range, prototype }) => ({ range, prototype, slot: slot.name }))
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
        )
        return output.issues
      },
      runVision,
    )
    return { ...result, vision }
  }
}

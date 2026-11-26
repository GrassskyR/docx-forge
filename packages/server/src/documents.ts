import { Billing } from "./billing.js"
import { randomUUID } from "node:crypto"
import { basename, dirname, join, relative, resolve, sep } from "node:path"
import { realpath, writeFile } from "node:fs/promises"
import { isDeepStrictEqual } from "node:util"
import { Assert } from "typebox/value"
import {
  extract,
  Store,
  render,
  repairDocx,
  preview,
  telemetry,
  parseFormat,
  merge,
  lint,
} from "@docs-agent/engine"
import { DocContentAST, FormatProfile, type LintReport } from "@docs-agent/shared"
import { requestPatch } from "./model.js"

export class HttpError extends Error {
  constructor(
    public status: number,
    public detail: unknown,
  ) {
    super(typeof detail === "string" ? detail : JSON.stringify(detail))
  }
}

export async function dataFile(root: string, path: string) {
  const inside = (file: string) => {
    const part = relative(resolve(root), file)
    if (part === ".." || part.startsWith(".." + sep)) throw new HttpError(403, "文件不在数据目录")
    return file
  }
  return inside(await realpath(inside(resolve(path))))
}

export class Documents {
  readonly bill = new Billing()
  readonly store: Store
  constructor(
    readonly directory: string,
    readonly useModel = Boolean(process.env.LLM_API_KEY),
  ) {
    this.store = new Store(join(directory, "profiles.db"))
  }

  get(id: string) {
    try {
      return this.store.get(id)
    } catch (e) {
      if (e instanceof Error && e.message === "预设不存在") throw new HttpError(404, e.message)
      throw e
    }
  }

  active() {
    return this.get(this.store.activeId)
  }

  profiles() {
    return { profiles: this.store.list(), active_profile_id: this.store.activeId }
  }

  setActive(id: string) {
    this.get(id)
    this.store.setActive(id)
    return { active_profile_id: id }
  }

  async extract(path: string, name: string) {
    return this.store.save(await extract(path, name, join(this.directory, "templates")))
  }

  async parse(instruction: string, name: string, parent?: string) {
    const base = this.get(parent ?? "gbt-9704-2012")
    const patch = this.useModel ? await requestPatch(instruction, base, this.bill) : {}
    return parseFormat(instruction, name, base, patch)
  }

  async fromNl(instruction: string, name: string, parent?: string) {
    const result = await this.parse(instruction, name, parent)
    this.store.save(result.profile)
    return result
  }

  async fork(id: string, name: string, patch?: Record<string, unknown>, instruction?: string) {
    if (patch && instruction) throw new HttpError(422, "只能选择一种微调方式")
    if (instruction) {
      const { profile } = await this.parse(instruction, name, id)
      profile.source_type = "inherited"
      return this.store.save(profile)
    }
    if (
      Object.keys(patch ?? {}).some(
        (k) => !["styles", "page", "red_header", "description"].includes(k),
      )
    ) {
      throw new HttpError(422, "禁止修改预设身份字段")
    }
    this.get(id)
    return this.store.fork(id, name, patch ?? {})
  }

  async result(path: string, profile: FormatProfile, before?: LintReport) {
    const report = await lint(path, profile)
    const dir = dirname(path)
    const id = basename(dir)
    const prefix = "/files/documents/" + id + "/"
    const pages = report.passed ? await preview(path, dir) : []
    const layout = report.passed ? await telemetry(path, dir) : undefined
    const payload = {
      doc_id: id,
      docx_path: resolve(path),
      docx_url: prefix + "document.docx",
      lint_report: report,
      effective_profile: profile,
      ...(layout ? { layout } : {}),
      preview_urls: pages.map((p) => prefix + basename(p)),
      ...(before ? { lint_before: before } : {}),
    }
    if (layout) await writeFile(join(dir, "result.json"), JSON.stringify(payload))
    return payload
  }

  async render(ast: DocContentAST, id?: string, overrides: Record<string, unknown> = {}) {
    Assert(DocContentAST, ast)
    if (Object.keys(overrides).some((k) => !["styles", "page", "red_header"].includes(k))) {
      throw new HttpError(422, "overrides 仅支持格式字段")
    }
    const profile = merge(this.get(id || this.store.activeId), overrides)
    Assert(FormatProfile, profile)
    const path = join(this.directory, "documents", randomUUID(), "document.docx")
    if (
      !ast.title.trim() ||
      (profile.red_header.enabled &&
        ![ast.red_header_org, profile.red_header.org_name, ast.signature].some((v) => v?.trim()))
    ) {
      const field = ast.title.trim() ? "red_header_org" : "title.count"
      throw new HttpError(422, {
        code: "ast_structure",
        field,
        guidance: "请补全 " + field + " 后重新编译",
      })
    }
    await render(ast, profile, path)
    return this.result(path, profile)
  }

  async repair(source: string, profile: FormatProfile, violations: LintReport["violations"]) {
    Assert(FormatProfile, profile)
    const path = await dataFile(this.directory, source)
    if (!path.toLowerCase().endsWith(".docx"))
      throw new HttpError(403, "需要数据目录中的 DOCX 文件")
    const before = await lint(path, profile)
    if (!isDeepStrictEqual(before.violations, violations))
      throw new HttpError(409, "请重新审计后提交最新的违规项")
    const output = join(this.directory, "documents", randomUUID(), "document.docx")
    await repairDocx(path, profile, violations, output)
    return this.result(output, profile, before)
  }

  async lint(path: string, id: string) {
    return lint(await dataFile(this.directory, path), this.get(id))
  }
}

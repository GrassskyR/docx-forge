import { Type } from "@mariozechner/pi-ai"
import type { AgentTool } from "@mariozechner/pi-agent-core"
import { Documents, HttpError } from "./documents.js"
import { DocContentAST, type LintReport } from "@docs-agent/shared"

type RenderResult = Awaited<ReturnType<Documents["render"]>> & {
  repair_attempts?: number
  repair_history?: LintReport[]
  repair_violation_counts?: number[]
}
import { loadSkill } from "./skills.js"
export async function verifyAndFix(
  client: Documents,
  ast: DocContentAST,
  profile_id?: string,
  overrides?: Record<string, unknown>,
): Promise<RenderResult> {
  return repairAfterAudit(client, await client.render(ast, profile_id, overrides))
}

/** Repair the actual audited file and retain each independent audit report. */
export async function repairAfterAudit(
  client: Documents,
  initial: RenderResult,
): Promise<RenderResult> {
  let result = initial
  const history = [result.lint_report]
  for (let round = 1; !result.lint_report.passed && round <= 3; round++) {
    if (result.lint_report.violations.some((item) => item.field === "title.count")) break
    const next = await client.repair(
      result.docx_path, result.effective_profile, result.lint_report.violations,
    )
    history.push(next.lint_report)
    result = next
    if (
      JSON.stringify(history.at(-2)?.violations) === JSON.stringify(result.lint_report.violations)
    ) {
      break
    }
  }
  return {
    ...result,
    repair_attempts: history.length - 1,
    repair_history: history,
    repair_violation_counts: history.map((report) => report.violations.length),
  }
}

export function createTools(client: Documents): AgentTool[] {
  const str = () => Type.String()
  const opt = () => Type.Optional(str())
  const tool = (
    name: string,
    description: string,
    parameters: AgentTool["parameters"],
    fn: (p: any) => Promise<unknown>,
  ): AgentTool => ({
    name,
    label: name,
    description,
    parameters,
    executionMode: "sequential",
    execute: async (_id, p) => {
      const details = await fn(p)
      return { content: [{ type: "text", text: JSON.stringify(details) }], details }
    },
  })
  return [
    tool(
      "import_doc_format",
      "从本地 .doc/.docx 提取并保存格式，按需设默认",
      Type.Object({
        file_path: str(),
        profile_name: str(),
        set_active: Type.Optional(Type.Boolean()),
      }),
      async (p) => {
        const profile = await client.extract(p.file_path, p.profile_name)
        if (p.set_active) await client.setActive(profile.id)
        return profile
      },
    ),
    tool(
      "parse_nl_format",
      "自然语言创建或基于父预设微调格式",
      Type.Object({
        instruction: str(),
        profile_name: str(),
        base_profile_id: opt(),
        set_active: Type.Optional(Type.Boolean()),
      }),
      async (p) => {
        const result = await client.fromNl(p.instruction, p.profile_name, p.base_profile_id)
        if (p.set_active) await client.setActive(result.profile.id)
        return result
      },
    ),
    tool(
      "manage_profiles",
      "列出、获取、切换、派生或删除格式预设",
      Type.Object({
        action: Type.Union(
          ["list", "get", "set_active", "fork", "delete"].map((x) => Type.Literal(x)),
        ),
        profile_id: opt(),
        name: opt(),
        patch_instruction: opt(),
        patch_json: Type.Optional(Type.Any()),
      }),
      async (p) => {
        if (p.action === "list") return client.profiles()
        if (!p.profile_id) throw Error("需要 profile_id")
        if (p.action === "get") return client.get(p.profile_id)
        if (p.action === "set_active") return client.setActive(p.profile_id)
        if (p.action === "fork")
          return client.fork(p.profile_id, p.name, p.patch_json, p.patch_instruction)
        client.store.delete(p.profile_id)
        return { deleted: p.profile_id }
      },
    ),
    tool(
      "load_doc_skill",
      "按需加载指定公文文种写作规则",
      Type.Object({
        doc_type: Type.Union(
          ["notice", "request", "minutes", "letter"].map((x) => Type.Literal(x)),
        ),
      }),
      async (p) => ({ doc_type: p.doc_type, rules: await loadSkill(p.doc_type) }),
    ),
    tool(
      "render_gongwen_docx",
      "将结构化正文 AST 按当前默认或指定预设编译为 Word，自动审计与最多三轮修复。禁止生成代码。",
      Type.Object({
        content_ast: DocContentAST,
        profile_id: opt(),
        overrides: Type.Optional(Type.Any()),
      }),
      async (params) => {
        try {
          const result = await verifyAndFix(
            client,
            params.content_ast,
            params.profile_id,
            params.overrides,
          )
          if (result.lint_report.passed) return result
          const invalidTitle = result.lint_report.violations.some(
            (violation) => violation.field === "title.count",
          )
          return {
            error: invalidTitle ? "ast_structure" : "audit_failed",
            guidance: invalidTitle
              ? "请在 DocContentAST.title 中保留一个非空标题，然后重新编译。"
              : "请根据剩余违规项修正正文结构或预设后重新编译。",
            lint_report: result.lint_report,
            repair_violation_counts: result.repair_violation_counts,
          }
        } catch (error) {
          if (error instanceof HttpError && error.status === 422) {
            return {
              error: "invalid_content",
              detail: error.detail,
              guidance: "请根据 detail 修正 DocContentAST 后重新调用 render_gongwen_docx。",
            }
          }
          throw error
        }
      },
    ),
    tool(
      "lint_and_preview_docx",
      "独立审计已生成文件；返回现有 PNG 预览地址",
      Type.Object({ docx_path: str(), profile_id: str() }),
      async (p) => ({
        lint_report: await client.lint(p.docx_path, p.profile_id),
        preview_urls: await (async () => {
          const path = p.docx_path.replaceAll("\\", "/")
          const match = path.match(/documents\/([^/]+)\/document.docx$/)
          if (!match) return []
          const { readdir } = await import("node:fs/promises")
          return (await readdir(path.slice(0, path.lastIndexOf("/"))))
            .filter((x) => /^page-.*\.png$/.test(x))
            .map((x) => `/files/documents/${match[1]}/${x}`)
        })(),
      }),
    ),
  ]
}

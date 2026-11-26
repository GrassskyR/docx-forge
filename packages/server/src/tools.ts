import type { AgentTool } from "@mariozechner/pi-agent-core"
import { toolSchemas } from "@docs-agent/shared"
import type { Workspace } from "./workspace.js"

export function createTools(work: Workspace, settings: { vision: boolean }): AgentTool[] {
  const specs: [keyof typeof toolSchemas, string, (p: any) => Promise<unknown> | unknown][] = [
    [
      "learn_reference_doc",
      "从本地 .doc/.docx 参考文档解析字体样式链、页眉页脚资源与槽位蓝图，经试填与真实 PDF 遥测校验后保存为模板",
      (p) =>
        work.learnFile(
          p.file_path,
          p.name,
          p.category ?? "general",
          p.rules_md ?? "",
          p.set_active !== false,
        ),
    ],
    [
      "manage_templates",
      "查询、获取详情、切换激活、派生复制或删除模板资产",
      (p) => {
        if (p.action === "list") {
          const templates = work.templates.list()
          return {
            active_template_id: work.templates.activeId,
            count: templates.length,
            templates,
          }
        }
        if (p.action === "get") {
          return work.templates.get(p.template_id ?? work.templates.activeId ?? "")
        }
        if (p.action === "fork") return work.templates.fork(p.template_id, p.name)
        if (p.action === "set_active") work.templates.activate(p.template_id)
        else work.templates.delete(p.template_id)
        return { template_id: p.template_id, active_template_id: work.templates.activeId }
      },
    ],
    [
      "ingest_draft",
      "导入纯文本或 .docx 草稿，返回段落索引用于零改字套版",
      (p) => work.ingest(p),
    ],
    [
      "compose_document",
      "按当前模板确定性组装生成 .docx，支持原件填槽、可选封面与真实页码目录构建及标准三线表生成",
      (p) => work.compose(p),
    ],
    [
      "refine_and_audit",
      "按分节或全局执行版面微调（compact_pages / prevent_orphan_signature / line_spacing_delta）并获取审计结果",
      async (p) => {
        if (p.operations?.length) {
          await work.adjust(p.doc_id, p.operations)
        }
        return work.audit(p.doc_id, settings.vision && p.run_vision !== false)
      },
    ],
  ]

  return specs.map(([name, description, perform]) => ({
    name,
    label: name,
    description,
    parameters: toolSchemas[name],
    executionMode: "sequential",
    execute: async (_id, params) => {
      const details = await perform(params)
      return { details, content: [{ type: "text", text: JSON.stringify(details) }] }
    },
  }))
}

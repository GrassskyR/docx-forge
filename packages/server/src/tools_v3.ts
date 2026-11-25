import type { AgentTool } from "@mariozechner/pi-agent-core"
import { toolSchemas } from "@docs-agent/shared"
import type { Workspace } from "./workspace.js"

// vision 由 /chat 每轮按顶栏双轨开关写入；关闭时视觉终审一律降级为纯文本。
export function createV3Tools(work: Workspace, settings: { vision: boolean }): AgentTool[] {
  const specs: [keyof typeof toolSchemas, string, (p: any) => unknown][] = [
    [
      "inspect_reference_doc",
      "检查真实 Word 范例，返回紧凑原型骨架和关键页路径",
      (p) => work.inspect(p.file_path, p.sample_pages),
    ],
    [
      "save_template_asset",
      "保存模板原件、蓝图和规则书",
      (p) =>
        work.templates.save(
          p.inspect_id,
          p.name,
          p.category,
          p.blueprint,
          p.rules_md,
          p.set_active,
        ),
    ],
    [
      "manage_templates",
      "查询、选择、复制或删除模板",
      (p) => {
        if (p.action === "list") return work.templates.list()
        if (p.action === "get") return work.templates.get(p.template_id)
        if (p.action === "fork") return work.templates.fork(p.template_id, p.name)
        if (p.action === "set_active") work.templates.activate(p.template_id)
        else work.templates.delete(p.template_id)
        return { template_id: p.template_id }
      },
    ],
    ["ingest_draft", "将草稿留存本地，返回编号索引", (p) => work.ingest(p)],
    ["compose_document", "按原型组装文档，保真模式只传连续编号区间", (p) => work.compose(p)],
    ["adjust_layout", "根据真实遥测调整版面", (p) => work.adjust(p.doc_id, p.operations)],
    [
      "audit_and_inspect",
      "获取审计结果及可选视觉终审",
      (p) => work.audit(p.doc_id, settings.vision && p.run_vision !== false),
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

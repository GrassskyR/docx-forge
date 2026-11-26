import { existsSync } from "node:fs"
import { readFile, readdir } from "node:fs/promises"
import { join } from "node:path"
import type { AgentTool } from "@mariozechner/pi-agent-core"
import type { ImageContent, TextContent } from "@mariozechner/pi-ai"
import { visionMode } from "@docs-agent/engine"
import { toolSchemas, type LayoutTelemetry } from "@docs-agent/shared"
import type { Workspace } from "./workspace.js"

async function buildPageImageObservations(
  docDir: string,
  layout: LayoutTelemetry | undefined,
): Promise<(TextContent | ImageContent)[]> {
  if (!layout || !existsSync(docDir)) return []
  const files = (await readdir(docDir)).filter((f) => /^page-\d+\.png$/.test(f)).sort()
  if (!files.length) return []

  const warnPages = layout.warnings.map((w) => w.page)
  const targetPages = [...new Set([1, ...warnPages, layout.total_pages])]
    .filter((p) => p >= 1 && p <= layout.total_pages)
    .slice(0, 3)

  const out: (TextContent | ImageContent)[] = []
  for (const page of targetPages) {
    const match = files.find((f) => Number(/^page-0*(\d+)\.png$/.exec(f)?.[1]) === page)
    if (!match) continue
    const data = (await readFile(join(docDir, match))).toString("base64")
    out.push(
      { type: "text", text: `成品第 ${page} 页实时渲染图` },
      { type: "image", mimeType: "image/png", data },
    )
  }
  return out
}

export function createTools(work: Workspace, settings: { vision: boolean }): AgentTool[] {
  const specs: [keyof typeof toolSchemas, string, (p: any) => Promise<unknown> | unknown][] = [
    [
      "learn_reference_doc",
      "从本地 .doc/.docx 参考文档执行多模态 ReAct 试填观测与自审闭环，保存并激活模板资产",
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
      "按当前模板确定性组装生成 .docx，返回每页物理遥测及关键告警页渲染图供 ReAct 自检",
      (p) => work.compose(p),
    ],
    [
      "refine_and_audit",
      "按指定 section 分节或全局执行版面微调（compact_pages / prevent_orphan_signature / line_spacing_delta）并返回渲染图与审计结果",
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
      const details = (await perform(params)) as Record<string, unknown> | undefined
      const content: (TextContent | ImageContent)[] = [
        { type: "text", text: JSON.stringify(details) },
      ]
      const canSeeImages = settings.vision && visionMode() !== "text_only"
      if (canSeeImages && details) {
        const docId =
          typeof details.doc_id === "string"
            ? details.doc_id
            : typeof (params as Record<string, unknown>)?.doc_id === "string"
              ? String((params as Record<string, unknown>).doc_id)
              : undefined
        const layout = details.layout as LayoutTelemetry | undefined
        const shouldAttach =
          (name === "compose_document" && Boolean(layout?.warnings.length)) ||
          (name === "refine_and_audit" &&
            (params as Record<string, unknown>)?.run_vision !== false)
        if (docId && shouldAttach) {
          const imgs = await buildPageImageObservations(work.directoryOf(docId), layout)
          content.push(...imgs)
        }
      }
      return { details, content }
    },
  }))
}

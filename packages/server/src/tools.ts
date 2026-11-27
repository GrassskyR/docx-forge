import { existsSync } from "node:fs"
import { readFile, readdir } from "node:fs/promises"
import { join } from "node:path"
import type { AgentTool } from "@mariozechner/pi-agent-core"
import type { ImageContent, TextContent } from "@mariozechner/pi-ai"
import { visionMode } from "@docs-agent/engine"
import {
  toolSchemas,
  type LayoutTelemetry,
  type TemplateAsset,
} from "@docs-agent/shared"
import type { Workspace } from "./workspace.js"

export interface ToolSessionBinding {
  vision: boolean
  getTemplateId: () => string
  setTemplateId: (id: string) => void
  onTemplateUpdated?: (asset: TemplateAsset, forked: boolean) => void
  onTemplateDeleted?: (id: string) => void
  onComposed?: (doc: Record<string, unknown>, input: Record<string, unknown>) => void
  onAdjusted?: (doc: Record<string, unknown>) => void
}

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

export function createTools(work: Workspace, binding: ToolSessionBinding): AgentTool[] {
  const specs: [
    keyof typeof toolSchemas,
    string,
    (p: any, signal?: AbortSignal) => Promise<unknown> | unknown,
  ][] = [
    [
      "learn_reference_doc",
      "从本地 .doc/.docx 参考文档执行多模态试填自审闭环，保存并设为当前会话模板",
      async (p, signal) => {
        const asset = await work.learnFile(
          p.file_path,
          p.name,
          p.category ?? "gongwen",
          p.rules_md ?? "",
          p.set_active !== false,
          { signal },
        )
        if (p.set_active !== false) binding.setTemplateId(asset.id)
        return asset
      },
    ],
    [
      "manage_templates",
      "查询、获取详情、透视模板底层结构与段落样式(inspect)、切换模板、改名分类、派生或删除模板",
      async (p) => {
        const curTpl = binding.getTemplateId()
        if (p.action === "list") {
          const templates = work.templates.list()
          return {
            active_template_id: curTpl,
            count: templates.length,
            templates,
          }
        }
        if (p.action === "get") {
          return work.templates.get(p.template_id ?? curTpl)
        }
        if (p.action === "inspect") {
          return work.inspectTemplate(p.template_id ?? curTpl)
        }
        if (p.action === "update") {
          return work.templates.update(p.template_id ?? curTpl, {
            name: p.name,
            category: p.category,
          })
        }
        if (p.action === "fork") {
          return work.templates.fork(p.template_id ?? curTpl, p.name || "派生格式")
        }
        if (p.action === "set_active") {
          if (p.template_id) binding.setTemplateId(p.template_id)
          return { template_id: p.template_id, active_template_id: binding.getTemplateId() }
        }
        if (p.template_id) {
          work.templates.delete(p.template_id)
          binding.onTemplateDeleted?.(p.template_id)
        }
        return { deleted: p.template_id, active_template_id: binding.getTemplateId() }
      },
    ],
    [
      "update_template",
      "按用户要求微调或修复模板（修改段落字体/字号/加粗/下划线/缩进/对齐/行距/大纲级别、" +
        "增补样式原型段、调整页边距、修正蓝图 fields/content_slots/remove_targets/prototypes 及规则；" +
        "自定义模板默认就地更新，内置默认模板自动派生新模板）",
      async (p, signal) => {
        const targetId = p.template_id || binding.getTemplateId()
        const res = await work.editTemplate(targetId, p, { signal })
        binding.onTemplateUpdated?.(res.template, res.forked)
        return res
      },
    ],
    [
      "ingest_draft",
      "导入纯文本或 .docx 草稿，返回段落索引用于零改字套版",
      (p) => work.ingest(p),
    ],
    [
      "compose_document",
      "按模板确定性组装生成 .docx（未填槽位自动擦除旧示例），返回每页遥测与预览",
      async (p, signal) => {
        const targetTpl = p.template_id || binding.getTemplateId()
        if (p.template_id && p.template_id !== binding.getTemplateId()) {
          binding.setTemplateId(p.template_id)
        }
        const res = await work.compose({ ...p, template_id: targetTpl }, { signal })
        binding.onComposed?.(res as unknown as Record<string, unknown>, p)
        return res
      },
    ],
    [
      "refine_and_audit",
      "执行版面微调（compact_pages / prevent_orphan_signature / line_spacing_delta）并返回渲染结果",
      async (p, signal) => {
        let adjustedDoc: Record<string, unknown> | undefined
        if (p.operations?.length) {
          adjustedDoc = (await work.adjust(p.doc_id, p.operations)) as Record<string, unknown>
        }
        const audited = await work.audit(
          p.doc_id,
          binding.vision && p.run_vision !== false,
          signal,
        )
        const merged = { ...(adjustedDoc ?? {}), ...audited }
        binding.onAdjusted?.(merged)
        return merged
      },
    ],
  ]

  return specs.map(([name, description, perform]) => ({
    name,
    label: name,
    description,
    parameters: toolSchemas[name],
    executionMode: "sequential",
    execute: async (_id, params, signal) => {
      const details = (await perform(params, signal)) as Record<string, unknown> | undefined
      const content: (TextContent | ImageContent)[] = [
        { type: "text", text: JSON.stringify(details) },
      ]
      const canSeeImages = binding.vision && visionMode() !== "text_only"
      if (canSeeImages && details) {
        const docId =
          typeof details.doc_id === "string"
            ? details.doc_id
            : typeof (params as Record<string, unknown>)?.doc_id === "string"
              ? String((params as Record<string, unknown>)?.doc_id)
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

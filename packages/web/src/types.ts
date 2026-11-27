import type {
  ComposePlan,
  DraftIndex,
  LayoutTelemetry,
  LintReport,
  SessionSummary,
  SessionTimelineEvent,
  TemplateAsset,
  VisionAudit,
} from "@docs-agent/shared"

export type CategoryId = "all" | "gongwen" | "thesis" | "contract"
export type DropdownId = "session" | "format" | "layout" | null

export interface FormatField {
  name: string
  label: string
  sample?: string
}

export interface FormatOption {
  id: string
  name: string
  builtin: boolean
  category: Exclude<CategoryId, "all">
  categoryLabel: string
  hasCover: boolean
  hasToc: boolean
  desc: string
  fields: FormatField[]
  contentSlots: string[]
  prototypes: string[]
  preserved: string[]
  capabilityCard: string
  sampleUrls: string[]
  asset: TemplateAsset
}

export interface UsageSnapshot {
  prompt_tokens: number
  completion_tokens: number
  cached_tokens: number
  total_tokens: number
  cost_usd: number | null
}

export interface HealthInfo {
  service: string
  sqlite: string
  libreoffice: boolean
  pdftoppm: boolean
  llm_configured: boolean
  vision_mode: "native" | "sidecar" | "text_only"
  langfuse_enabled?: boolean
}

export interface TemplatesResponse {
  templates: TemplateAsset[]
  usage: UsageSnapshot
}

export interface DraftIngestResponse extends DraftIndex {
  paragraphs: string[]
}

export interface DocumentResult {
  doc_id: string
  docx_path: string
  docx_url: string
  template_id?: string
  body_plan?: ComposePlan
  body_indices?: number[]
  body_texts?: string[]
  resolved_slots?: Record<string, string>
  lint_report: LintReport
  layout?: LayoutTelemetry
  vision?: VisionAudit
  fidelity?: number | null
  usage?: UsageSnapshot
  preview_urls: string[]
}

export interface MappingRow {
  id: string
  target: string
  text: string
}

export interface ToolTraceStep {
  id?: string
  status: "running" | "ok" | "warn"
  label: string
  rawName?: string
}

export type TimelineItem =
  | { kind: "event"; text: string }
  | { kind: "user"; text: string }
  | {
      kind: "assistant"
      text: string
      streaming?: boolean
      collapsed?: boolean
      elapsed?: number
      steps: ToolTraceStep[]
      docUrl?: string
      docPages?: number
    }

export interface RawAgentMessage {
  role: "user" | "assistant" | "toolResult"
  content: string | { type: string; text?: string; name?: string }[]
  toolName?: string
  isError?: boolean
}

export interface ActiveSessionRecord {
  id: string
  parent_id: string | null
  name: string
  auto_named: boolean
  template_id: string
  updated_at: number
  draft_text: string
  slot_values: Record<string, string>
  generate_cover: boolean
  generate_toc: boolean
  normalize_punct: boolean
  current_doc: DocumentResult | null
  preview_stale: boolean
  events: SessionTimelineEvent[]
  messages: RawAgentMessage[]
}

export interface SessionsPayload {
  sessions: SessionSummary[]
  active_session_id: string
  active: ActiveSessionRecord
  deleted?: string
}

export interface BackgroundImportState {
  name: string
  category: Exclude<CategoryId, "all">
  phase: string
  elapsedSec: number
  sampleUrl?: string
  done: boolean
  error?: string
  templateId?: string
}

export const SLOT_LABELS: Record<string, string> = {
  title: "文档标题",
  report_title: "报告题目",
  course: "课程名称",
  student_id: "学号",
  college: "学院 / 部门",
  major: "专业",
  class_name: "班级",
  class: "班级",
  author: "姓名 / 作者",
  student_name: "学生姓名",
  student: "学生姓名",
  advisor: "指导教师",
  teacher: "指导教师",
  score: "评分",
  comment: "评语",
  date: "日期",
  doc_no: "发文字号",
  party_a: "委托方（甲方）",
  party_b: "受托方（乙方）",
  contract_no: "合同编号",
}

export function cleanSlotLabel(field: { name: string; label?: string }): string {
  const raw = (field.label || SLOT_LABELS[field.name] || field.name).trim()
  let s = raw
    .replace(/[：:\s]+$/, "")
    .replace(/[（(][^）)]*(?:下划线|封面|括号|填写|选填|空位)[^）)]*[）)]/g, "")
    .trim()
  if (/^[\u4e00-\u9fa5](?:\s+[\u4e00-\u9fa5])+$/.test(s)) {
    s = s.replace(/\s+/g, "")
  }
  s = s.replace(/评\s*分\/价/, "评分")
  return s || SLOT_LABELS[field.name] || field.name
}

export function extractDocTitle(
  slotValues: Record<string, string>,
  draftText: string,
  fallbackName?: string,
): string {
  const candidates = [
    slotValues.title,
    slotValues.report_title,
    draftText
      .split(/\r?\n/)
      .map((l) => l.replace(/^#+\s*/, "").trim())
      .find((l) => l.length > 0 && l.length <= 48 && !/^[一二三四五六1-9][、.]/.test(l)),
    fallbackName && fallbackName !== "未命名文档" ? fallbackName : "",
  ]
  for (const item of candidates) {
    const clean = (item ?? "").replace(/[\\/:*?"<>|\r\n]+/g, " ").trim()
    if (clean && clean !== "文档标题") return clean.slice(0, 32)
  }
  return "未命名文档"
}

export const CATEGORY_LABELS: Record<Exclude<CategoryId, "all">, string> = {
  gongwen: "公文",
  thesis: "论文/报告",
  contract: "合同/表",
}

export function normalizeCategory(raw: string): Exclude<CategoryId, "all"> {
  const value = raw.toLowerCase()
  if (
    value.includes("thesis") ||
    value.includes("academic") ||
    value.includes("lab") ||
    value.includes("论文") ||
    value.includes("报告") ||
    value.includes("实验") ||
    value.includes("课程设计") ||
    value.includes("实习")
  ) {
    return "thesis"
  }
  if (
    value.includes("contract") ||
    value.includes("form") ||
    value.includes("合同") ||
    value.includes("协议") ||
    value.includes("申报") ||
    value.includes("表")
  ) {
    return "contract"
  }
  return "gongwen"
}

export const TOOL_FRIENDLY_LABELS: Record<string, string> = {
  learn_reference_doc: "解析参考文档版式与槽位",
  manage_templates: "读取模板配置信息",
  update_template: "微调并保存排版模板",
  ingest_draft: "切分草稿段落结构",
  compose_document: "写入模板槽位并生成 Word",
  refine_and_audit: "微调跨页版面收口",
}

export const STARTER_DRAFTS: Record<Exclude<CategoryId, "all">, string> = {
  gongwen: [
    "关于开展2026年度实验室安全专项检查的通知",
    "各二级学院、重点实验室：",
    "为切实加强校园实验室安全管理，防范化解重大风险隐患，经研究决定组织开展2026年度实验室安全专项检查。现将有关事项通知如下：",
    "一、检查范围与重点内容",
    "1.危化品全流程台账。各单位须逐瓶核对易制毒、易制爆及剧毒化学品出入库记录，严格落实双人双锁要求。",
    "2.特种设备与用电安全。重点排查高压灭菌锅、气瓶室及大功率加热设备运行状态，杜绝私拉乱接现象。",
    "二、时间安排与报送要求",
    "请各单位于2026年12月5日前完成全面自查，通过校内OA系统报送自查汇总表。",
    "综合办公室",
    "2026年11月27日",
  ].join("\n"),
  thesis: [
    "1. 实验目的与运行环境",
    "掌握操作系统银行家死锁避免安全性序列检测算法，对比最近最少使用（LRU）页面置换策略在不同物理页框配额下的缺页率表现。",
    "2. 算法设计与关键步骤",
    "2.1 安全性状态向量迭代检查",
    "维护可利用资源向量 Work 与完成标记 Finish，循环寻找需求矩阵小于等于当前可用向量的就绪进程并回收其分配矩阵。",
    "3. 实验结果分析与总结",
    "实验结果表明增加物理页框并结合哈希双向链表实现 LRU 淘汰策略可显著降低抖动风险。",
  ].join("\n"),
  contract: [
    "大数据平台技术开发委托合同",
    "第一条 交付成果、验收标准及知识产权归属",
    "1.1 乙方应于本合同生效后30个工作日内完成全部流式采集模块交付并配合终验。",
    "1.2 乙方承诺交付成果不侵犯任何第三方合法权益，否则承担全部法律及赔偿责任。",
  ].join("\n"),
}

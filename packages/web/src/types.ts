import type {
  ComposePlan,
  DocumentMap,
  DraftIndex,
  LayoutTelemetry,
  LintReport,
  TemplateAsset,
  VisionAudit,
} from "@docs-agent/shared"

export type CategoryId = "all" | "gongwen" | "thesis" | "contract"

export interface FormatOption {
  id: string
  name: string
  category: Exclude<CategoryId, "all">
  categoryLabel: string
  desc: string
  fields: { name: string; label?: string }[]
  contentSlots: string[]
  prototypes: string[]
  preserved: string[]
  capabilityCard: string
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
  active_template_id: string | null
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
  status: "running" | "ok" | "warn"
  text: string
}

export interface ChatTurn {
  role: "user" | "assistant"
  text: string
  steps?: ToolTraceStep[]
  docUrl?: string
  docPages?: number
}

export const SLOT_LABELS: Record<string, string> = {
  title: "题目 / 标题",
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
  date: "日期",
  party_a: "甲方名称",
  party_b: "乙方名称",
  contract_no: "合同编号",
}

export interface SessionBranch {
  id: string
  parent_id: string | null
  name: string
  template_id: string | null
  message_count: number
}

export interface SessionsResponse {
  nodes: SessionBranch[]
  current: string
  node: {
    id: string
    name: string
    template_id: string | null
    template_name: string
    messages: RawAgentMessage[]
  }
}

export interface RawAgentMessage {
  role: "user" | "assistant" | "toolResult"
  content: string | { type: string; text?: string; name?: string }[]
  toolName?: string
  isError?: boolean
}

export interface InspectResponse {
  inspect_id: string
  doc_map: DocumentMap
  sample_urls: string[]
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
    value.includes("报告")
  ) {
    return "thesis"
  }
  if (
    value.includes("contract") ||
    value.includes("form") ||
    value.includes("合同") ||
    value.includes("申报") ||
    value.includes("表")
  ) {
    return "contract"
  }
  return "gongwen"
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
    "2026年11月25日",
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
    "合同编号：HT-2026-TECH-0092",
    "委托方（甲方）：长三角数字科技有限公司",
    "受托方（乙方）：先进智能软件研究院",
    "第三条 交付成果、验收标准及知识产权归属",
    "3.1 乙方应于本合同生效后30个工作日内完成全部模块交付并配合验收。",
    "3.2 乙方承诺交付成果不侵犯任何第三方合法权益，否则承担全部法律及赔偿责任。",
  ].join("\n"),
}

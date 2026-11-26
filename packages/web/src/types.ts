import type {
  ComposePlan,
  DocContentAST,
  DraftIndex,
  FormatProfile,
  LayoutTelemetry,
  LintReport,
  Skeleton,
  TemplateAsset,
  VisionAudit,
} from "@docs-agent/shared"

export type CategoryId = "all" | "gongwen" | "thesis" | "contract"

export interface FormatOption {
  id: string
  kind: "v3" | "v2"
  name: string
  category: Exclude<CategoryId, "all">
  categoryLabel: string
  desc: string
  slots: string[]
  prototypes: string[]
  preserved: string[]
  capabilityCard: string
  asset?: TemplateAsset
  profile?: FormatProfile
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
  profiles: FormatProfile[]
  active_profile_id: string
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
  effective_profile?: FormatProfile
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
  template_id?: string | null
  profile_id: string | null
  message_count: number
}

export interface SessionsResponse {
  nodes: SessionBranch[]
  current: string
  node: {
    id: string
    name: string
    template_id?: string | null
    profile_id: string
    profile_name: string
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
  skeleton: Skeleton
  sample_urls: string[]
}

export const CATEGORY_LABELS: Record<Exclude<CategoryId, "all">, string> = {
  gongwen: "公文",
  thesis: "论文",
  contract: "合同/表",
}

export function normalizeCategory(raw: string): Exclude<CategoryId, "all"> {
  const value = raw.toLowerCase()
  if (value.includes("thesis") || value.includes("academic") || value.includes("论文")) {
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
    "第3章 原生 XML 原型克隆与零拷贝套版引擎",
    "3.1 样式指纹聚类与语义骨架压缩机制",
    "针对长篇学术论文直接输入大语言模型导致上下文膨胀与格式失真的问题，本文提出基于 OOXML 样式指纹的确定性骨架压缩方法。",
    "系统在保留原件封面、多节奇偶页眉及图片资产的前提下，直接深拷贝示范段落与表格的底层属性节点。",
    "参考文献",
    "[1] 全国信息与文献标准化技术委员会. 党政机关公文格式: GB/T 9704—2012[S]. 北京: 中国标准出版社, 2012.",
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

export function buildAstFromDraft(raw: string, normalizePunct: boolean): DocContentAST {
  const fix = (s: string) =>
    normalizePunct ? s.replace(/[\[［](\d{4})[\]］]/g, "〔$1〕").replace(/:/g, "：") : s
  const lines = raw
    .split(/\r\n|\r|\n/)
    .map((s) => fix(s.trim()))
    .filter(Boolean)
  const title = lines[0] || "未命名公文"
  let start = 1
  let doc_number: string | undefined
  let recipient: string | undefined
  if (lines[start] && /〔\d{4}〕.*号$/.test(lines[start])) {
    doc_number = lines[start]
    start++
  }
  if (lines[start] && /[：:]$/.test(lines[start]) && lines[start].length <= 36) {
    recipient = lines[start]
    start++
  }
  let end = lines.length
  let date: string | undefined
  let signature: string | undefined
  if (end > start && /^\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日$/.test(lines[end - 1])) {
    date = lines[end - 1]
    end--
  }
  if (
    end > start &&
    lines[end - 1].length <= 24 &&
    !/[。！？；，]/.test(lines[end - 1]) &&
    /(办公室|委员会|学院|大学|局|处|部|公司|中心|院)$/.test(lines[end - 1])
  ) {
    signature = lines[end - 1]
    end--
  }
  const attachments: string[] = []
  const blocks: NonNullable<DocContentAST["blocks"]> = []
  for (const line of lines.slice(start, end)) {
    if (/^附件[：:]/.test(line)) {
      attachments.push(line.replace(/^附件[：:]\s*/, ""))
    } else if (/^[一二三四五六七八九十]+、/.test(line)) {
      blocks.push({ type: "heading_1", text: line })
    } else if (/^[（(][一二三四五六七八九十]+[)）]/.test(line)) {
      blocks.push({ type: "heading_2", text: line })
    } else if (/^\d+[.．、]/.test(line)) {
      blocks.push({ type: "heading_3", text: line })
    } else {
      blocks.push({ type: "body", text: line })
    }
  }
  if (!blocks.length) blocks.push({ type: "body", text: title })
  return {
    doc_type: "notice",
    title,
    ...(doc_number ? { doc_number } : {}),
    ...(recipient ? { recipient } : {}),
    ...(attachments.length ? { attachments } : {}),
    ...(signature ? { signature, red_header_org: signature } : {}),
    ...(date ? { date } : {}),
    blocks,
  }
}

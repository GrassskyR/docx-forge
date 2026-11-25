export type DocType = "notice" | "request" | "minutes" | "letter" | "general"
export type Role =
  "title" | "heading_1" | "heading_2" | "heading_3" | "body" | "recipient" | "signature" | "date"
export interface StyleSpec {
  font_cn: string
  font_en: string
  font_size_pt: number
  bold: boolean
  italic: boolean
  color_hex: string
  alignment: "left" | "center" | "right" | "justify"
  line_spacing_rule: "exact" | "multiple"
  line_spacing_value: number
  first_line_indent_chars: number
  space_before_pt: number
  space_after_pt: number
}
export interface FormatProfile {
  id: string
  name: string
  source_type: "builtin" | "extracted_doc" | "nl_parsed" | "inherited"
  parent_id: string | null
  base_template_path: string | null
  description: string
  page: {
    size: "A4"
    margin_top_mm: number
    margin_bottom_mm: number
    margin_left_mm: number
    margin_right_mm: number
    show_page_number: boolean
  }
  red_header: {
    enabled: boolean
    org_name: string | null
    font_cn: string
    font_size_pt: number
    color_hex: string
    has_red_line: boolean
    doc_number_font_cn: string
    doc_number_size_pt: number
  }
  styles: Record<Role, StyleSpec>
}
export interface DocContentAST {
  doc_type?: DocType
  title: string
  red_header_org?: string | null
  doc_number?: string | null
  recipient?: string | null
  blocks?: {
    type: "heading_1" | "heading_2" | "heading_3" | "body" | "table"
    text?: string | null
    rows?: string[][] | null
  }[]
  attachments?: string[]
  signature?: string | null
  date?: string | null
}
export interface Violation {
  location: string
  field: string
  expected: unknown
  actual: unknown
}

export interface ProfilesResult {
  profiles: FormatProfile[]
  active_profile_id: string
}

export interface LintReport {
  passed: boolean
  score: number
  checked: number
  violations: Violation[]
}
export interface RenderResult {
  doc_id: string
  docx_path: string
  docx_url: string
  preview_urls: string[]
  lint_report: LintReport
  effective_profile: FormatProfile
  lint_before?: LintReport
  repair_violation_counts?: number[]
  repair_attempts?: number
  repair_history?: LintReport[]
}
export class EngineError extends Error {
  constructor(
    public status: number,
    public detail: unknown,
  ) {
    super(`${status}: ${JSON.stringify(detail)}`)
  }
}

export class EngineClient {
  constructor(public base = process.env.ENGINE_URL || "http://127.0.0.1:8000") {}
  async request<T>(path: string, body?: unknown, method = "POST"): Promise<T> {
    const response = await fetch(this.base + path, {
      method: body === undefined ? "GET" : method,
      headers: body instanceof FormData ? {} : { "content-type": "application/json" },
      body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(180000),
    })
    if (!response.ok) {
      const raw = await response.text()
      let detail: unknown = raw
      try {
        detail = JSON.parse(raw).detail ?? raw
      } catch {
        // Non-JSON gateway responses retain their original text.
      }
      throw new EngineError(response.status, detail)
    }
    return (await response.json()) as T
  }
  profiles() {
    return this.request<ProfilesResult>("/api/profiles")
  }
  get(id: string) {
    return this.request<FormatProfile>("/api/profiles/" + encodeURIComponent(id))
  }
  async active() {
    const p = await this.profiles()
    return this.get(p.active_profile_id)
  }
  setActive(id: string) {
    return this.request("/api/profiles/active", { profile_id: id }, "PUT")
  }
  render(ast: DocContentAST, profile_id?: string, overrides?: unknown) {
    return this.request<RenderResult>("/api/documents/render", {
      content_ast: ast,
      profile_id,
      overrides: overrides || {},
    })
  }
  repair(result: RenderResult) {
    return this.request<RenderResult>("/api/documents/repair", {
      docx_path: result.docx_path,
      effective_profile: result.effective_profile,
      repair_violations: result.lint_report.violations,
    })
  }

  lint(path: string, id: string) {
    return this.request<LintReport>("/api/documents/lint", { docx_path: path, profile_id: id })
  }
}

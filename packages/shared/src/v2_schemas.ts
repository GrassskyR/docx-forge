import { Type, type Static } from "typebox"

const strict = { additionalProperties: false }
const color = Type.String({ pattern: "^[0-9A-Fa-f]{6}$" })
const nullableText = Type.Union([Type.String(), Type.Null()])
const positive = Type.Number({ exclusiveMinimum: 0 })
export const roles = [
  "title", "heading_1", "heading_2", "heading_3", "body", "recipient", "signature", "date",
] as const
export type Role = typeof roles[number]
export const StyleSpec = Type.Object({
  font_cn: Type.String(),
  font_en: Type.String(),
  font_size_pt: Type.Number({ exclusiveMinimum: 0, maximum: 100 }),
  bold: Type.Boolean(),
  italic: Type.Boolean(),
  color_hex: color,
  alignment: Type.Enum(["left", "center", "right", "justify"]),
  line_spacing_rule: Type.Enum(["exact", "multiple"]),
  line_spacing_value: positive,
  first_line_indent_chars: Type.Number(),
  space_before_pt: Type.Number(),
  space_after_pt: Type.Number(),
}, strict)
export type StyleSpec = Static<typeof StyleSpec>

const margin = (maximum: number) => Type.Number({ minimum: 0, exclusiveMaximum: maximum })
export const FormatProfile = Type.Object({
  id: Type.String(),
  name: Type.String(),
  source_type: Type.Enum(["builtin", "extracted_doc", "nl_parsed", "inherited"]),
  parent_id: nullableText,
  base_template_path: nullableText,
  description: Type.String(),
  page: Type.Object({
    size: Type.Literal("A4"),
    margin_top_mm: margin(140),
    margin_bottom_mm: margin(140),
    margin_left_mm: margin(100),
    margin_right_mm: margin(100),
    show_page_number: Type.Boolean(),
  }, strict),
  red_header: Type.Object({
    enabled: Type.Boolean(),
    org_name: nullableText,
    font_cn: Type.String(),
    font_size_pt: positive,
    color_hex: color,
    has_red_line: Type.Boolean(),
    doc_number_font_cn: Type.String(),
    doc_number_size_pt: positive,
  }, strict),
  styles: Type.Record(Type.Enum([...roles]), StyleSpec, strict),
}, strict)
export type FormatProfile = Static<typeof FormatProfile>

const textBlock = Type.Object({
  type: Type.Enum(["heading_1", "heading_2", "heading_3", "body"]),
  text: Type.String(),
  rows: Type.Optional(Type.Null()),
}, strict)
const tableBlock = Type.Object({
  type: Type.Literal("table"),
  rows: Type.Array(Type.Array(Type.String(), { minItems: 1 }), { minItems: 1 }),
  text: Type.Optional(nullableText),
}, strict)
export const DocContentAST = Type.Object({
  doc_type: Type.Optional(Type.Enum(["notice", "request", "minutes", "letter", "general"])),
  red_header_org: Type.Optional(nullableText),
  doc_number: Type.Optional(nullableText),
  title: Type.String(),
  recipient: Type.Optional(nullableText),
  blocks: Type.Optional(Type.Array(Type.Union([textBlock, tableBlock]))),
  attachments: Type.Optional(Type.Array(Type.String())),
  signature: Type.Optional(nullableText),
  date: Type.Optional(nullableText),
}, strict)
export type DocContentAST = Static<typeof DocContentAST>

export const Violation = Type.Object({
  location: Type.String(),
  field: Type.String(),
  expected: Type.Unknown(),
  actual: Type.Unknown(),
}, strict)
export const LintReport = Type.Object({
  passed: Type.Boolean(),
  score: Type.Number(),
  checked: Type.Integer(),
  violations: Type.Array(Violation),
}, strict)
export type LintReport = Static<typeof LintReport>

import { Type, type Static } from "typebox"

const integer = Type.Integer({ minimum: 0 })
const anchor = Type.String({ pattern: "^[BT][0-9]+$" })
export const Skeleton = Type.Object({
  paragraphs: integer,
  tables: integer,
  sections: integer,
  media: integer,
  clusters: Type.Array(
    Type.Object({
      anchor,
      kind: Type.Enum(["paragraph", "table"]),
      count: integer,
      example: Type.String(),
      style: Type.String(),
      font: Type.String(),
      size: Type.String(),
    }),
  ),
  preserved: Type.Array(Type.String()),
})
export type Skeleton = Static<typeof Skeleton>
export const Blueprint = Type.Object(
  {
    grid: Type.Optional(Type.Object({ lines: Type.Literal(22), characters: Type.Literal(28) })),
    slots: Type.Array(Type.Object({ name: Type.String(), start: anchor, end: anchor })),
    prototypes: Type.Record(Type.String(), anchor),
    preserved: Type.Array(Type.String()),
  },
  { additionalProperties: false },
)
export type Blueprint = Static<typeof Blueprint>
export const TemplateAsset = Type.Object({
  id: Type.String(),
  name: Type.String(),
  category: Type.String(),
  blueprint: Blueprint,
  parent_id: Type.Union([Type.String(), Type.Null()]),
  capability_card: Type.String(),
})
export type TemplateAsset = Static<typeof TemplateAsset>

export const DraftIndex = Type.Object({
  draft_id: Type.String(),
  count: integer,
  characters: integer,
  samples: Type.Array(Type.Object({ id: Type.String(), excerpt: Type.String() })),
})
export type DraftIndex = Static<typeof DraftIndex>
export const ComposePlan = Type.Array(
  Type.Object(
    {
      range: Type.Optional(Type.String()),
      prototype: Type.String(),
      slot: Type.Optional(Type.String()),
      text: Type.Optional(Type.String()),
      rows: Type.Optional(Type.Array(Type.Array(Type.String()))),
      emphasis: Type.Optional(Type.Enum(["first_sentence", "underline_first_sentence"])),
    },
    { additionalProperties: false },
  ),
)
export type ComposePlan = Static<typeof ComposePlan>

export const LayoutTelemetry = Type.Object({
  total_pages: integer,
  pages: Type.Array(
    Type.Object({
      number: integer,
      lines: integer,
      bottom_occupancy: Type.Number(),
      has_table: Type.Boolean(),
    }),
  ),
  warnings: Type.Array(
    Type.Object({
      code: Type.Enum(["tail_overflow", "orphan_signature", "split_table"]),
      page: integer,
      message: Type.String(),
    }),
  ),
})
export type LayoutTelemetry = Static<typeof LayoutTelemetry>
export const VisionAudit = Type.Object({
  status: Type.Enum(["passed", "issues", "skipped_no_vision_model", "skipped_pending_layout"]),
  mode: Type.Enum(["native", "sidecar", "text_only"]),
  pages: Type.Array(integer),
  issues: Type.Array(Type.Object({ page: integer, description: Type.String() })),
})
export type VisionAudit = Static<typeof VisionAudit>

export const adjustments = Type.Array(
  Type.Object({
    type: Type.Enum([
      "compact_pages",
      "prevent_orphan_signature",
      "line_spacing_delta",
      "space_after_delta",
      "table_col_widths",
    ]),
    delta: Type.Optional(Type.Number()),
    widths: Type.Optional(Type.Array(Type.Integer({ minimum: 1 }))),
    table: Type.Optional(integer),
  }),
)
const optionalText = Type.Optional(Type.String())
export const toolSchemas = {
  inspect_reference_doc: Type.Object({
    file_path: Type.String(),
    sample_pages: Type.Optional(Type.Array(integer)),
  }),
  save_template_asset: Type.Object({
    inspect_id: Type.String(),
    name: Type.String(),
    category: Type.String(),
    blueprint: Blueprint,
    rules_md: Type.String(),
    set_active: Type.Optional(Type.Boolean()),
  }),
  manage_templates: Type.Object({
    action: Type.Enum(["list", "get", "set_active", "fork", "delete"]),
    template_id: optionalText,
    name: optionalText,
  }),
  ingest_draft: Type.Object({ text: optionalText, file_path: optionalText }),
  compose_document: Type.Object({
    template_id: optionalText,
    mode: Type.Enum(["exact_copy", "authored"]),
    draft_id: optionalText,
    slot_values: Type.Optional(Type.Record(Type.String(), Type.String())),
    body_plan: ComposePlan,
    normalize_punctuation: Type.Optional(Type.Boolean()),
  }),
  adjust_layout: Type.Object({ doc_id: Type.String(), operations: adjustments }),
  audit_and_inspect: Type.Object({
    doc_id: Type.String(),
    run_vision: Type.Optional(Type.Boolean()),
  }),
}
export const SSEEvent = Type.Object(
  {
    type: Type.Enum(["text", "tool", "document", "usage", "layout", "vision", "done", "error"]),
  },
  { additionalProperties: true },
)

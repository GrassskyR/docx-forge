import { Type, type Static } from "typebox"

const integer = Type.Integer({ minimum: 0 })
export const COORD_REGEX =
  /^(?:B\d+(?:\.R\d+(?:\.C\d+(?:\.P\d+)?)?|\.TX\d+(?:\.P\d+)?)?|D\d+\.P\d+)$/
const coord = Type.String({ pattern: COORD_REGEX.source })

export const FontRoleSpec = Type.Object({
  font_cn: Type.String(),
  font_en: Type.String(),
  size_pt: Type.Number({ minimum: 6, maximum: 96 }),
  bold: Type.Boolean(),
  italic: Type.Optional(Type.Boolean()),
  color_hex: Type.Optional(Type.String()),
  alignment: Type.Enum(["left", "center", "right", "both"]),
  line_twips: Type.Optional(integer),
  line_rule: Type.Optional(Type.Enum(["auto", "exact", "atLeast"])),
  first_line_twips: Type.Optional(Type.Integer()),
})
export type FontRoleSpec = Static<typeof FontRoleSpec>

export const HeaderFooterRef = Type.Object({
  type: Type.String(),
  rId: Type.String(),
})
export type HeaderFooterRef = Static<typeof HeaderFooterRef>

export const StyleDNA = Type.Object({
  page_width_twips: integer,
  page_height_twips: integer,
  margins_twips: Type.Object({
    top: integer,
    bottom: integer,
    left: integer,
    right: integer,
    header: integer,
    footer: integer,
  }),
  has_header_logo: Type.Boolean(),
  header_texts: Type.Array(Type.String()),
  footer_texts: Type.Array(Type.String()),
  header_refs: Type.Array(HeaderFooterRef),
  footer_refs: Type.Array(HeaderFooterRef),
  media_count: integer,
  has_existing_toc: Type.Boolean(),
  title_style: FontRoleSpec,
  heading_1_style: FontRoleSpec,
  heading_2_style: FontRoleSpec,
  heading_3_style: FontRoleSpec,
  body_style: FontRoleSpec,
})
export type StyleDNA = Static<typeof StyleDNA>

export const DocumentMap = Type.Object({
  paragraphs: integer,
  tables: integer,
  sections: integer,
  page_breaks: integer,
  textboxes: integer,
  media: integer,
  table_ratio: Type.Number(),
  preserved: Type.Array(Type.String()),
  style_dna: StyleDNA,
  map_text: Type.String(),
})
export type DocumentMap = Static<typeof DocumentMap>

export const FieldSlot = Type.Object(
  {
    name: Type.String(),
    label: Type.Optional(Type.String()),
    coord: Type.Optional(coord),
    mode: Type.Optional(Type.Enum(["blank", "match", "cell", "colon"])),
    blank_index: Type.Optional(integer),
    match: Type.Optional(Type.String()),
    sample: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
)
export type FieldSlot = Static<typeof FieldSlot>

export const ContentSlot = Type.Object(
  {
    name: Type.String(),
    label: Type.Optional(Type.String()),
    start: coord,
    end: coord,
    placement: Type.Optional(Type.Enum(["replace", "insert_after"])),
  },
  { additionalProperties: false },
)
export type ContentSlot = Static<typeof ContentSlot>

export const RemoveTarget = Type.Object(
  {
    start: coord,
    end: Type.Optional(coord),
    match: Type.Optional(Type.String()),
    only_textboxes: Type.Optional(Type.Boolean()),
    drop_section: Type.Optional(Type.Boolean()),
    drop_page_break: Type.Optional(Type.Boolean()),
    reason: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
)
export type RemoveTarget = Static<typeof RemoveTarget>

export const CoverFieldDef = Type.Object(
  {
    name: Type.String(),
    label: Type.String(),
  },
  { additionalProperties: false },
)
export type CoverFieldDef = Static<typeof CoverFieldDef>

export const CoverBuilderSpec = Type.Object(
  {
    enabled: Type.Boolean(),
    banner: Type.Optional(Type.String()),
    subtitle: Type.Optional(Type.String()),
    layout: Type.Optional(Type.Enum(["single_column", "double_column"])),
    fields: Type.Optional(Type.Array(CoverFieldDef)),
  },
  { additionalProperties: false },
)
export type CoverBuilderSpec = Static<typeof CoverBuilderSpec>

export const TocBuilderSpec = Type.Object(
  {
    mode: Type.Enum(["none", "refresh_existing", "generate"]),
  },
  { additionalProperties: false },
)
export type TocBuilderSpec = Static<typeof TocBuilderSpec>

export const Blueprint = Type.Object(
  {
    template_kind: Type.Optional(
      Type.Enum(["flowing", "form_table", "style_shell"]),
    ),
    grid: Type.Optional(
      Type.Object({
        lines: Type.Integer({ minimum: 1 }),
        characters: Type.Integer({ minimum: 1 }),
      }),
    ),
    fields: Type.Array(FieldSlot),
    content_slots: Type.Array(ContentSlot),
    remove_targets: Type.Optional(Type.Array(RemoveTarget)),
    must_preserve: Type.Optional(Type.Array(Type.String())),
    prototypes: Type.Record(Type.String(), coord),
    cover_builder: Type.Optional(CoverBuilderSpec),
    toc: Type.Optional(TocBuilderSpec),
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
  style_dna: StyleDNA,
  parent_id: Type.Union([Type.String(), Type.Null()]),
  capability_card: Type.String(),
  sample_urls: Type.Optional(Type.Array(Type.String())),
})
export type TemplateAsset = Static<typeof TemplateAsset>

export const SessionTimelineEvent = Type.Object({
  after_msg_count: integer,
  text: Type.String(),
  timestamp: integer,
})
export type SessionTimelineEvent = Static<typeof SessionTimelineEvent>

export const SessionSummary = Type.Object({
  id: Type.String(),
  parent_id: Type.Union([Type.String(), Type.Null()]),
  name: Type.String(),
  auto_named: Type.Boolean(),
  template_id: Type.String(),
  template_name: Type.String(),
  updated_at: integer,
  message_count: integer,
  doc_pages: Type.Optional(integer),
  has_draft: Type.Boolean(),
})
export type SessionSummary = Static<typeof SessionSummary>

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
      emphasis: Type.Optional(
        Type.Enum(["first_sentence", "underline_first_sentence"]),
      ),
    },
    { additionalProperties: false },
  ),
)
export type ComposePlan = Static<typeof ComposePlan>

export const Violation = Type.Object({
  location: Type.String(),
  field: Type.String(),
  expected: Type.Unknown(),
  actual: Type.Unknown(),
})
export const LintReport = Type.Object({
  passed: Type.Boolean(),
  score: Type.Number(),
  checked: Type.Integer(),
  violations: Type.Array(Violation),
})
export type LintReport = Static<typeof LintReport>

export const LayoutTelemetry = Type.Object({
  total_pages: integer,
  pages: Type.Array(
    Type.Object({
      number: integer,
      lines: integer,
      bottom_occupancy: Type.Number(),
      has_table: Type.Boolean(),
      excerpt: Type.Optional(Type.String()),
    }),
  ),
  warnings: Type.Array(
    Type.Object({
      code: Type.Enum(["blank_page", "tail_overflow", "orphan_signature", "split_table"]),
      page: integer,
      message: Type.String(),
    }),
  ),
})
export type LayoutTelemetry = Static<typeof LayoutTelemetry>

export const VisionAudit = Type.Object({
  status: Type.Enum([
    "passed",
    "issues",
    "skipped_no_vision_model",
    "skipped_pending_layout",
  ]),
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
    section: Type.Optional(integer),
    delta: Type.Optional(Type.Number()),
    widths: Type.Optional(Type.Array(Type.Integer({ minimum: 1 }))),
    table: Type.Optional(integer),
  }),
)

const optionalText = Type.Optional(Type.String())
export const toolSchemas = {
  learn_reference_doc: Type.Object({
    file_path: Type.String(),
    name: optionalText,
    category: optionalText,
    rules_md: optionalText,
    set_active: Type.Optional(Type.Boolean()),
  }),
  manage_templates: Type.Object({
    action: Type.Enum(["list", "get", "set_active", "update", "fork", "delete"]),
    template_id: optionalText,
    name: optionalText,
    category: optionalText,
  }),
  ingest_draft: Type.Object({
    text: optionalText,
    file_path: optionalText,
  }),
  compose_document: Type.Object({
    template_id: optionalText,
    mode: Type.Enum(["exact_copy", "authored"]),
    draft_id: optionalText,
    slot_values: Type.Optional(Type.Record(Type.String(), Type.String())),
    body_plan: Type.Optional(ComposePlan),
    normalize_punctuation: Type.Optional(Type.Boolean()),
    generate_cover: Type.Optional(Type.Boolean()),
    cover_subtitle: optionalText,
    generate_toc: Type.Optional(Type.Boolean()),
  }),
  refine_and_audit: Type.Object({
    doc_id: Type.String(),
    operations: Type.Optional(adjustments),
    run_vision: Type.Optional(Type.Boolean()),
  }),
}

export const SSEEvent = Type.Object(
  {
    type: Type.Enum([
      "phase",
      "text",
      "tool",
      "template",
      "workspace_sync",
      "sample",
      "document",
      "usage",
      "layout",
      "vision",
      "done",
      "error",
    ]),
  },
  { additionalProperties: true },
)

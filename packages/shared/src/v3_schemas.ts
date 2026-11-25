import { Type, type Static } from "typebox"

const integer = Type.Integer({ minimum: 0 })
const anchor = Type.String({ pattern: "^[BT][0-9]+$" })
export const Skeleton = Type.Object({
  paragraphs: integer, tables: integer, sections: integer, media: integer,
  clusters: Type.Array(Type.Object({
    anchor, kind: Type.Enum(["paragraph", "table"]), count: integer, example: Type.String(),
    style: Type.String(), font: Type.String(), size: Type.String(),
  })),
  preserved: Type.Array(Type.String()),
})
export type Skeleton = Static<typeof Skeleton>
export const Blueprint = Type.Object({
  grid: Type.Optional(Type.Object({ lines: Type.Literal(22), characters: Type.Literal(28) })),
  slots: Type.Array(Type.Object({ name: Type.String(), start: anchor, end: anchor })),
  prototypes: Type.Record(Type.String(), anchor),
  preserved: Type.Array(Type.String()),
}, { additionalProperties: false })
export type Blueprint = Static<typeof Blueprint>
export const TemplateAsset = Type.Object({
  id: Type.String(), name: Type.String(), category: Type.String(), blueprint: Blueprint,
  parent_id: Type.Union([Type.String(), Type.Null()]), capability_card: Type.String(),
})
export type TemplateAsset = Static<typeof TemplateAsset>

export const DraftIndex = Type.Object({
  draft_id: Type.String(), count: integer, characters: integer,
  samples: Type.Array(Type.Object({ id: Type.String(), excerpt: Type.String() })),
})
export type DraftIndex = Static<typeof DraftIndex>
export const ComposePlan = Type.Array(Type.Object({
  range: Type.Optional(Type.String()), prototype: Type.String(), slot: Type.Optional(Type.String()),
  text: Type.Optional(Type.String()), rows: Type.Optional(Type.Array(Type.Array(Type.String()))),
  emphasis: Type.Optional(Type.Enum(["first_sentence", "underline_first_sentence"])),
}, { additionalProperties: false }))
export type ComposePlan = Static<typeof ComposePlan>

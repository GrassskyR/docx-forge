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

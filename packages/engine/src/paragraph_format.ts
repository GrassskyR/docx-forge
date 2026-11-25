import type { Element } from "@xmldom/xmldom"
import type { StyleSpec } from "@docs-agent/shared"
import { W, children } from "./xml_utils.js"

type Properties = Partial<StyleSpec> & { indentPt?: number }
export interface ParagraphFormat {
  text: string
  style: string
  table: boolean
  values: Properties
}
export function child(parent: Element | undefined, tag: string) {
  return parent && children(parent, tag)[0]
}
export function attr(element: Element | undefined, key = "val") {
  return element?.getAttributeNS(W, key) ?? undefined
}

function properties(node?: Element): Properties {
  const result: Properties = {}
  const fonts = child(node, "rFonts")
  for (const [key, field] of [["eastAsia", "font_cn"], ["ascii", "font_en"]] as const) {
    const font = attr(fonts, key)?.split(";")[0].trim()
    if (font) result[field] = font
  }
  const size = attr(child(node, "sz"))
  if (size) result.font_size_pt = Number(size) / 2
  const color = attr(child(node, "color"))
  if (color && /^[0-9a-f]{6}$/i.test(color)) result.color_hex = color.toUpperCase()
  const jc = attr(child(node, "jc"))
  if (jc === "both" || jc === "justify") result.alignment = "justify"
  if (jc === "left" || jc === "center" || jc === "right") result.alignment = jc
  for (const [tag, field] of [["b", "bold"], ["i", "italic"]] as const) {
    const toggle = child(node, tag)
    if (toggle) result[field] = !["0", "false", "off"].includes(attr(toggle) ?? "1")
  }
  const spacing = child(node, "spacing")
  const line = attr(spacing, "line")
  if (line) {
    const fixed = ["exact", "atLeast"].includes(attr(spacing, "lineRule") ?? "auto")
    result.line_spacing_rule = fixed ? "exact" : "multiple"
    result.line_spacing_value = Number(line) / (fixed ? 20 : 240)
  }
  for (const [key, field] of [["before", "space_before_pt"], ["after", "space_after_pt"]] as const) {
    const value = attr(spacing, key)
    if (value) result[field] = Number(value) / 20
  }
  const indent = child(node, "ind")
  for (const key of ["firstLineChars", "hangingChars", "firstLine", "hanging"]) {
    const value = attr(indent, key)
    if (value === undefined) continue
    const n = Number(value) * (key.startsWith("hanging") ? -1 : 1)
    if (key.endsWith("Chars")) result.first_line_indent_chars = n / 100
    else result.indentPt = n / 20
    break
  }
  return result
}

function overlay(...layers: Properties[]) {
  const result: Properties = {}
  for (const layer of layers) {
    if (layer.indentPt !== undefined) delete result.first_line_indent_chars
    if (layer.first_line_indent_chars !== undefined) delete result.indentPt
    Object.assign(result, layer)
  }
  return result
}

export function weighted(items: { text: string, values: Properties }[]): Properties {
  const counts = new Map<string, Map<unknown, number>>()
  for (const item of items) {
    for (const [key, value] of Object.entries(item.values)) {
      const field = counts.get(key) ?? new Map()
      field.set(value, (field.get(value) ?? 0) + [...item.text].length)
      counts.set(key, field)
    }
  }
  return Object.fromEntries([...counts].map(([key, field]) => [
    key, [...field].sort((a, b) => b[1] - a[1])[0][0],
  ]))
}

function ancestors(node: Element) {
  const names: string[] = []
  for (let parent = node.parentNode; parent?.nodeType === 1; parent = parent.parentNode) {
    names.push((parent as Element).localName!)
  }
  return names
}

export function paragraphFormats(root: Element, styles?: Element): ParagraphFormat[] {
  const defaults = child(styles, "docDefaults")
  const base = overlay(
    { first_line_indent_chars: 0 },
    properties(child(child(defaults, "pPrDefault"), "pPr")),
    properties(child(child(defaults, "rPrDefault"), "rPr")),
  )
  const definitions = new Map<string, Element>()
  const defaultIds = new Map<string, string>()
  for (const style of styles ? children(styles, "style") : []) {
    const id = attr(style, "styleId")!
    definitions.set(id, style)
    if (["1", "true", "on"].includes(attr(style, "default") ?? "")) defaultIds.set(attr(style, "type")!, id)
  }
  function cascade(id?: string, seen = new Set<string>()): Properties {
    const style = id && definitions.get(id)
    if (!style || seen.has(id!)) return {}
    seen.add(id!)
    return overlay(cascade(attr(child(style, "basedOn")), seen),
      properties(child(style, "pPr")), properties(child(style, "rPr")))
  }
  const records: ParagraphFormat[] = []
  for (const p of Array.from(root.getElementsByTagNameNS(W, "p"))) {
    const parents = ancestors(p)
    if (parents.some(name => ["drawing", "pict", "txbxContent", "AlternateContent"].includes(name))) continue
    const pPr = child(p, "pPr")
    const style = attr(child(pPr, "pStyle")) ?? defaultIds.get("paragraph")
    const paragraph = overlay(base, cascade(style), properties(pPr))
    const runs = Array.from(p.getElementsByTagNameNS(W, "r")).flatMap(run => {
      if (ancestors(run).includes("txbxContent")) return []
      const text = children(run, "t").map(t => t.textContent).join("")
      const rPr = child(run, "rPr")
      const id = attr(child(rPr, "rStyle")) ?? defaultIds.get("character")
      const values = overlay(paragraph, cascade(id), properties(rPr))
      if (values.indentPt !== undefined) {
        values.first_line_indent_chars = Number((values.indentPt / (values.font_size_pt ?? 16)).toFixed(4))
        delete values.indentPt
      }
      return [{ text, values }]
    })
    const text = runs.map(run => run.text).join("").trim()
    if (text) records.push({ text, style: style ?? "", table: parents.includes("tbl"),
      values: weighted(runs.filter(run => run.text.trim())) })
  }
  return records
}

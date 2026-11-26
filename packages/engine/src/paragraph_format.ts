import type { Element } from "@xmldom/xmldom"
import type { FontRoleSpec } from "@docs-agent/shared"
import { W, children } from "./xml_utils.js"

export interface RawStyleProps {
  font_cn?: string
  font_en?: string
  size_pt?: number
  bold?: boolean
  italic?: boolean
  color_hex?: string
  alignment?: "left" | "center" | "right" | "both"
  line_twips?: number
  line_rule?: "auto" | "exact" | "atLeast"
  first_line_twips?: number
}

export interface ParagraphFormat {
  element: Element
  text: string
  style: string
  outline_lvl: number | null
  table: boolean
  values: RawStyleProps
}

export function child(parent: Element | undefined, tag: string) {
  return parent && children(parent, tag)[0]
}

export function attr(element: Element | undefined, key = "val") {
  return element?.getAttributeNS(W, key) ?? undefined
}

function readNodeProps(node?: Element): RawStyleProps {
  const out: RawStyleProps = {}
  const fonts = child(node, "rFonts")
  const cn = attr(fonts, "eastAsia")?.split(";")[0]?.trim()
  const en = attr(fonts, "ascii")?.split(";")[0]?.trim()
  if (cn) out.font_cn = cn
  if (en) out.font_en = en
  const sz = attr(child(node, "sz"))
  if (sz && Number(sz) > 0) out.size_pt = Number(sz) / 2
  const color = attr(child(node, "color"))
  if (color && /^[0-9a-f]{6}$/i.test(color)) out.color_hex = color.toUpperCase()
  const jc = attr(child(node, "jc"))
  if (jc === "both" || jc === "justify" || jc === "distribute") out.alignment = "both"
  else if (jc === "left" || jc === "center" || jc === "right") out.alignment = jc
  for (const [tag, field] of [["b", "bold"], ["i", "italic"]] as const) {
    const toggle = child(node, tag)
    if (toggle) out[field] = !["0", "false", "off"].includes(attr(toggle) ?? "1")
  }
  const spacing = child(node, "spacing")
  const line = attr(spacing, "line")
  if (line && Number(line) > 0) {
    const rule = attr(spacing, "lineRule")
    out.line_rule = rule === "exact" || rule === "atLeast" ? rule : "auto"
    out.line_twips = Number(line)
  }
  const ind = child(node, "ind")
  const flChars = attr(ind, "firstLineChars")
  const flTwips = attr(ind, "firstLine")
  if (flTwips !== undefined) out.first_line_twips = Number(flTwips)
  else if (flChars !== undefined) {
    out.first_line_twips = Math.round((Number(flChars) / 100) * (out.size_pt ?? 12) * 20)
  }
  return out
}

function mergeProps(...layers: RawStyleProps[]): RawStyleProps {
  const out: RawStyleProps = {}
  for (const layer of layers) {
    for (const [k, v] of Object.entries(layer)) {
      if (v !== undefined) (out as Record<string, unknown>)[k] = v
    }
  }
  return out
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
  const base = mergeProps(
    readNodeProps(child(child(defaults, "pPrDefault"), "pPr")),
    readNodeProps(child(child(defaults, "rPrDefault"), "rPr")),
  )
  const definitions = new Map<string, Element>()
  const defaultIds = new Map<string, string>()
  for (const st of styles ? children(styles, "style") : []) {
    const id = attr(st, "styleId")
    if (!id) continue
    definitions.set(id, st)
    if (["1", "true", "on"].includes(attr(st, "default") ?? "")) {
      const tp = attr(st, "type")
      if (tp) defaultIds.set(tp, id)
    }
  }
  function cascade(id?: string, seen = new Set<string>()): RawStyleProps {
    const st = id ? definitions.get(id) : undefined
    if (!st || !id || seen.has(id)) return {}
    seen.add(id)
    return mergeProps(
      cascade(attr(child(st, "basedOn")), seen),
      readNodeProps(child(st, "pPr")),
      readNodeProps(child(st, "rPr")),
    )
  }
  function cascadeOutline(id?: string, seen = new Set<string>()): number | null {
    const st = id ? definitions.get(id) : undefined
    if (!st || !id || seen.has(id)) return null
    seen.add(id)
    const own = attr(child(child(st, "pPr"), "outlineLvl"))
    if (own !== undefined && own !== "" && Number(own) >= 0 && Number(own) <= 8) {
      return Number(own)
    }
    return cascadeOutline(attr(child(st, "basedOn")), seen)
  }
  const records: ParagraphFormat[] = []
  for (const p of Array.from(root.getElementsByTagNameNS(W, "p"))) {
    const parents = ancestors(p)
    if (parents.some((n) => ["txbxContent", "AlternateContent"].includes(n))) continue
    const pPr = child(p, "pPr")
    const style = attr(child(pPr, "pStyle")) ?? defaultIds.get("paragraph")
    const pBase = mergeProps(base, cascade(style), readNodeProps(pPr))
    const directOut = attr(child(pPr, "outlineLvl"))
    const outline_lvl =
      directOut !== undefined && directOut !== "" && Number(directOut) <= 8
        ? Number(directOut)
        : cascadeOutline(style)
    const runItems = children(p, "r").flatMap((r) => {
      if (r.getElementsByTagNameNS(W, "txbxContent").length) return []
      const text = children(r, "t")
        .map((t) => t.textContent ?? "")
        .join("")
      if (!text.trim()) return []
      const rPr = child(r, "rPr")
      const rStyle = attr(child(rPr, "rStyle")) ?? defaultIds.get("character")
      return [{ text, props: mergeProps(pBase, cascade(rStyle), readNodeProps(rPr)) }]
    })
    const fullText = runItems.map((x) => x.text).join("").trim()
    if (!fullText) continue
    const dominant = runItems.sort((a, b) => b.text.length - a.text.length)[0]?.props ?? pBase
    records.push({
      element: p,
      text: fullText,
      style: style ?? "",
      outline_lvl,
      table: parents.includes("tbl"),
      values: dominant,
    })
  }
  return records
}

export function toFontRoleSpec(
  raw: RawStyleProps | undefined,
  fallback: FontRoleSpec,
): FontRoleSpec {
  return {
    font_cn: raw?.font_cn || fallback.font_cn,
    font_en: raw?.font_en || fallback.font_en,
    size_pt: raw?.size_pt || fallback.size_pt,
    bold: raw?.bold ?? fallback.bold,
    ...(raw?.italic ? { italic: true } : {}),
    ...(raw?.color_hex ? { color_hex: raw.color_hex } : {}),
    alignment: raw?.alignment ?? fallback.alignment,
    line_twips: raw?.line_twips ?? fallback.line_twips,
    line_rule: raw?.line_rule ?? fallback.line_rule,
    first_line_twips: raw?.first_line_twips ?? fallback.first_line_twips,
  }
}

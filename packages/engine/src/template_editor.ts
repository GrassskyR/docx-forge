import type { Document, Element } from "@xmldom/xmldom"
import { unzipSync, zipSync } from "fflate"
import type {
  Blueprint,
  StyleDNA,
  TemplateInsertParagraphOp,
  TemplatePageSetupPatch,
  TemplateParaStylePatch,
  TemplateParagraphFormatOp,
} from "@docs-agent/shared"
import { bodyBlocks, paraPlainText, resolveCoord } from "./dom_locator.js"
import { attr, child, toFontRoleSpec, type RawStyleProps } from "./paragraph_format.js"
import {
  PPR_ORDER,
  RPR_ORDER,
  SECTPR_ORDER,
  W,
  children,
  insertInSchemaOrder,
  parseXml,
  wordElement,
  xmlBytes,
} from "./xml_utils.js"

const XML_SPACE_NS = "http://www.w3.org/XML/1998/namespace"

export interface InspectedParagraphStyle {
  coord: string
  text: string
  font_cn?: string
  font_en?: string
  size_pt?: number
  bold?: boolean
  italic?: boolean
  underline?: string
  color_hex?: string
  alignment?: "left" | "center" | "right" | "both" | "distribute"
  line_twips?: number
  line_rule?: "auto" | "exact" | "atLeast"
  space_before_twips?: number
  space_after_twips?: number
  first_line_twips?: number
  left_twips?: number
  outline_lvl: number | null
}

type ExtendedProps = Omit<InspectedParagraphStyle, "coord" | "text" | "outline_lvl">

function readExtendedProps(node?: Element): ExtendedProps {
  const out: ExtendedProps = {}
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
  if (jc === "justify") out.alignment = "both"
  else if (
    jc === "left" ||
    jc === "center" ||
    jc === "right" ||
    jc === "both" ||
    jc === "distribute"
  ) {
    out.alignment = jc
  }
  for (const [tag, field] of [["b", "bold"], ["i", "italic"]] as const) {
    const toggle = child(node, tag)
    if (toggle) {
      out[field] = !["0", "false", "off"].includes(attr(toggle) ?? "1")
    }
  }
  const uEl = child(node, "u")
  if (uEl) {
    const uVal = attr(uEl) ?? "single"
    out.underline = ["0", "false", "none"].includes(uVal) ? "none" : uVal
  }
  const spacing = child(node, "spacing")
  const line = attr(spacing, "line")
  if (line && Number(line) > 0) {
    const rule = attr(spacing, "lineRule")
    out.line_rule = rule === "exact" || rule === "atLeast" ? rule : "auto"
    out.line_twips = Number(line)
  }
  const before = attr(spacing, "before")
  if (before !== undefined && before !== "") out.space_before_twips = Number(before)
  const after = attr(spacing, "after")
  if (after !== undefined && after !== "") out.space_after_twips = Number(after)

  const ind = child(node, "ind")
  const flChars = attr(ind, "firstLineChars")
  const flTwips = attr(ind, "firstLine")
  if (flTwips !== undefined && flTwips !== "") {
    out.first_line_twips = Number(flTwips)
  } else if (flChars !== undefined && flChars !== "") {
    out.first_line_twips = Math.round((Number(flChars) / 100) * (out.size_pt ?? 12) * 20)
  }
  const leftTwips = attr(ind, "left")
  if (leftTwips !== undefined && leftTwips !== "") out.left_twips = Number(leftTwips)
  return out
}

function mergeLayers<T extends Record<string, unknown>>(...layers: Partial<T>[]): Partial<T> {
  const out: Partial<T> = {}
  for (const layer of layers) {
    for (const [k, v] of Object.entries(layer)) {
      if (v !== undefined) (out as Record<string, unknown>)[k] = v
    }
  }
  return out
}

function makeStyleInspector(stylesXml?: Element) {
  const defaults = child(stylesXml, "docDefaults")
  const base = mergeLayers(
    readExtendedProps(child(child(defaults, "pPrDefault"), "pPr")),
    readExtendedProps(child(child(defaults, "rPrDefault"), "rPr")),
  )
  const definitions = new Map<string, Element>()
  const defaultIds = new Map<string, string>()
  for (const st of stylesXml ? children(stylesXml, "style") : []) {
    const id = attr(st, "styleId")
    if (!id) continue
    definitions.set(id, st)
    if (["1", "true", "on"].includes(attr(st, "default") ?? "")) {
      const tp = attr(st, "type")
      if (tp) defaultIds.set(tp, id)
    }
  }
  function cascade(id?: string, seen = new Set<string>()): ExtendedProps {
    const st = id ? definitions.get(id) : undefined
    if (!st || !id || seen.has(id)) return {}
    seen.add(id)
    return mergeLayers(
      cascade(attr(child(st, "basedOn")), seen),
      readExtendedProps(child(st, "pPr")),
      readExtendedProps(child(st, "rPr")),
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

  return function inspectParagraph(coord: string, p: Element): InspectedParagraphStyle {
    const pPr = child(p, "pPr")
    const style = attr(child(pPr, "pStyle")) ?? defaultIds.get("paragraph")
    const pMarkRpr = child(pPr, "rPr")
    const pBase = mergeLayers(
      base,
      cascade(style),
      readExtendedProps(pPr),
      readExtendedProps(pMarkRpr),
    )
    const directOut = attr(child(pPr, "outlineLvl"))
    const outline_lvl =
      directOut !== undefined && directOut !== "" && Number(directOut) <= 8
        ? Number(directOut)
        : cascadeOutline(style)

    const plainRuns = children(p, "r").filter(
      (r) => !r.getElementsByTagNameNS(W, "txbxContent").length,
    )
    const textRuns = plainRuns
      .map((r) => {
        const text = children(r, "t")
          .map((t) => t.textContent ?? "")
          .join("")
        const rPr = child(r, "rPr")
        const rStyle = attr(child(rPr, "rStyle")) ?? defaultIds.get("character")
        return {
          text,
          props: mergeLayers(pBase, cascade(rStyle), readExtendedProps(rPr)),
        }
      })
      .filter((x) => x.text.length > 0)

    const fallbackRunProps = plainRuns[0]
      ? mergeLayers(pBase, readExtendedProps(child(plainRuns[0], "rPr")))
      : pBase
    const dominant =
      textRuns.sort((a, b) => b.text.length - a.text.length)[0]?.props ?? fallbackRunProps
    const text = paraPlainText(p).replace(/\s+/g, " ").trim().slice(0, 120)
    return {
      coord,
      text,
      ...dominant,
      outline_lvl,
    }
  }
}

export function inspectTemplateDocx(baseBytes: Uint8Array, blueprint: Blueprint) {
  const files = unzipSync(baseBytes)
  const root = parseXml(files["word/document.xml"]).documentElement!
  const stylesXml = files["word/styles.xml"]
    ? parseXml(files["word/styles.xml"]).documentElement!
    : undefined
  const inspectPara = makeStyleInspector(stylesXml)

  const prototype_styles: Record<string, InspectedParagraphStyle | { coord: string; kind: string }> =
    {}
  for (const [role, c] of Object.entries(blueprint.prototypes)) {
    const res = resolveCoord(root, c)
    if (!res) continue
    if (res.element.localName === "p") {
      prototype_styles[role] = inspectPara(c, res.element)
    } else {
      prototype_styles[role] = { coord: c, kind: res.element.localName ?? res.kind }
    }
  }

  const targetCoords = new Set<string>()
  const blocks = bodyBlocks(root)
  for (let i = 0; i < Math.min(blocks.length, 60); i++) {
    if (blocks[i].localName === "p") targetCoords.add(`B${i}`)
  }
  for (const c of Object.values(blueprint.prototypes)) targetCoords.add(c)
  for (const f of blueprint.fields) {
    if (f.coord) targetCoords.add(f.coord)
  }
  for (const cs of blueprint.content_slots) {
    targetCoords.add(cs.start)
    targetCoords.add(cs.end)
  }
  for (const rm of blueprint.remove_targets ?? []) {
    targetCoords.add(rm.start)
    if (rm.end) targetCoords.add(rm.end)
  }

  const paragraph_styles: InspectedParagraphStyle[] = []
  for (const c of targetCoords) {
    if (paragraph_styles.length >= 80) break
    const res = resolveCoord(root, c)
    if (!res) continue
    const pEl =
      res.element.localName === "p" ? res.element : children(res.element, "p")[0]
    if (pEl) {
      const pCoord =
        res.element.localName === "p"
          ? c
          : res.kind === "cell"
            ? `${c}.P0`
            : c
      paragraph_styles.push(inspectPara(pCoord, pEl))
    }
  }

  return { prototype_styles, paragraph_styles }
}

export function syncPrototypeStyleDna(
  baseBytes: Uint8Array,
  blueprint: Blueprint,
  dna: StyleDNA,
): StyleDNA {
  const files = unzipSync(baseBytes)
  const root = parseXml(files["word/document.xml"]).documentElement!
  const stylesXml = files["word/styles.xml"]
    ? parseXml(files["word/styles.xml"]).documentElement!
    : undefined
  const inspectPara = makeStyleInspector(stylesXml)

  function toRaw(c?: string): RawStyleProps | undefined {
    if (!c) return undefined
    const res = resolveCoord(root, c)
    if (!res || res.element.localName !== "p") return undefined
    const p = inspectPara(c, res.element)
    const align = p.alignment === "distribute" ? "both" : p.alignment
    return {
      font_cn: p.font_cn,
      font_en: p.font_en,
      size_pt: p.size_pt,
      bold: p.bold,
      italic: p.italic,
      color_hex: p.color_hex,
      alignment: align,
      line_twips: p.line_twips,
      line_rule: p.line_rule,
      first_line_twips: p.first_line_twips,
    }
  }

  const protos = blueprint.prototypes
  return {
    ...dna,
    title_style: toFontRoleSpec(toRaw(protos.title), dna.title_style),
    heading_1_style: toFontRoleSpec(
      toRaw(protos.heading_1 ?? protos.chapter),
      dna.heading_1_style,
    ),
    heading_2_style: toFontRoleSpec(
      toRaw(protos.heading_2 ?? protos.section),
      dna.heading_2_style,
    ),
    heading_3_style: toFontRoleSpec(
      toRaw(protos.heading_3 ?? protos.subsection),
      dna.heading_3_style,
    ),
    body_style: toFontRoleSpec(toRaw(protos.body), dna.body_style),
  }
}

function ensureChildInOrder(
  d: Document,
  parent: Element,
  tag: string,
  order: string[],
): Element {
  return (
    children(parent, tag)[0] ??
    (insertInSchemaOrder(parent, wordElement(d, tag), order) as Element)
  )
}

function replaceChildInOrder(
  d: Document,
  parent: Element,
  tag: string,
  attrs: Record<string, string | number>,
  order: string[],
) {
  for (const prev of children(parent, tag)) parent.removeChild(prev)
  insertInSchemaOrder(parent, wordElement(d, tag, attrs), order)
}

function applyRunStylePatch(d: Document, rPr: Element, patch: TemplateParaStylePatch) {
  if (patch.font_cn !== undefined || patch.font_en !== undefined) {
    const fonts = ensureChildInOrder(d, rPr, "rFonts", RPR_ORDER)
    if (patch.font_cn) fonts.setAttributeNS(W, "w:eastAsia", patch.font_cn)
    if (patch.font_en) {
      fonts.setAttributeNS(W, "w:ascii", patch.font_en)
      fonts.setAttributeNS(W, "w:hAnsi", patch.font_en)
      fonts.setAttributeNS(W, "w:cs", patch.font_en)
    }
  }
  if (patch.size_pt !== undefined) {
    const halfPt = Math.round(patch.size_pt * 2)
    replaceChildInOrder(d, rPr, "sz", { val: halfPt }, RPR_ORDER)
    replaceChildInOrder(d, rPr, "szCs", { val: halfPt }, RPR_ORDER)
  }
  if (patch.bold !== undefined) {
    const val = patch.bold ? "1" : "0"
    replaceChildInOrder(d, rPr, "b", { val }, RPR_ORDER)
    replaceChildInOrder(d, rPr, "bCs", { val }, RPR_ORDER)
  }
  if (patch.italic !== undefined) {
    const val = patch.italic ? "1" : "0"
    replaceChildInOrder(d, rPr, "i", { val }, RPR_ORDER)
    replaceChildInOrder(d, rPr, "iCs", { val }, RPR_ORDER)
  }
  if (patch.underline !== undefined) {
    replaceChildInOrder(d, rPr, "u", { val: patch.underline }, RPR_ORDER)
  }
  if (patch.color_hex !== undefined) {
    const clean = patch.color_hex.replace(/^#/, "").trim() || "auto"
    replaceChildInOrder(d, rPr, "color", { val: clean }, RPR_ORDER)
  }
}

function formatSingleParagraph(d: Document, p: Element, patch: TemplateParaStylePatch) {
  const pPr =
    children(p, "pPr")[0] ??
    (p.insertBefore(wordElement(d, "pPr"), p.firstChild) as Element)

  if (patch.alignment !== undefined) {
    replaceChildInOrder(d, pPr, "jc", { val: patch.alignment }, PPR_ORDER)
  }
  if (
    patch.line_twips !== undefined ||
    patch.line_rule !== undefined ||
    patch.space_before_twips !== undefined ||
    patch.space_after_twips !== undefined
  ) {
    const sp = ensureChildInOrder(d, pPr, "spacing", PPR_ORDER)
    if (patch.line_twips !== undefined) {
      sp.setAttributeNS(W, "w:line", String(patch.line_twips))
      if (!patch.line_rule && !sp.getAttributeNS(W, "lineRule")) {
        sp.setAttributeNS(W, "w:lineRule", "auto")
      }
    }
    if (patch.line_rule !== undefined) {
      sp.setAttributeNS(W, "w:lineRule", patch.line_rule)
    }
    if (patch.space_before_twips !== undefined) {
      sp.setAttributeNS(W, "w:before", String(patch.space_before_twips))
    }
    if (patch.space_after_twips !== undefined) {
      sp.setAttributeNS(W, "w:after", String(patch.space_after_twips))
    }
  }
  if (patch.first_line_twips !== undefined || patch.left_twips !== undefined) {
    const ind = ensureChildInOrder(d, pPr, "ind", PPR_ORDER)
    if (patch.first_line_twips !== undefined) {
      ind.setAttributeNS(W, "w:firstLine", String(patch.first_line_twips))
      ind.removeAttributeNS(W, "firstLineChars")
      ind.removeAttribute("w:firstLineChars")
      ind.removeAttributeNS(W, "hanging")
      ind.removeAttribute("w:hanging")
      ind.removeAttributeNS(W, "hangingChars")
      ind.removeAttribute("w:hangingChars")
    }
    if (patch.left_twips !== undefined) {
      ind.setAttributeNS(W, "w:left", String(patch.left_twips))
      ind.removeAttributeNS(W, "leftChars")
      ind.removeAttribute("w:leftChars")
    }
  }
  if (patch.outline_lvl !== undefined) {
    for (const prev of children(pPr, "outlineLvl")) pPr.removeChild(prev)
    if (patch.outline_lvl !== null) {
      insertInSchemaOrder(
        pPr,
        wordElement(d, "outlineLvl", { val: patch.outline_lvl }),
        PPR_ORDER,
      )
    }
  }

  const plainRuns = () =>
    children(p, "r").filter((r) => !r.getElementsByTagNameNS(W, "txbxContent").length)

  if (patch.text !== undefined) {
    const donor =
      (plainRuns()[0] && children(plainRuns()[0], "rPr")[0]) ?? child(pPr, "rPr")
    for (const r of plainRuns()) p.removeChild(r)
    const r = wordElement(d, "r")
    const rPr = donor ? (d.importNode(donor, true) as Element) : wordElement(d, "rPr")
    r.appendChild(rPr)
    if (patch.text.length > 0) {
      const t = wordElement(d, "t")
      t.setAttributeNS(XML_SPACE_NS, "xml:space", "preserve")
      t.textContent = patch.text
      r.appendChild(t)
    }
    p.appendChild(r)
  }

  const hasRunPatch =
    patch.font_cn !== undefined ||
    patch.font_en !== undefined ||
    patch.size_pt !== undefined ||
    patch.bold !== undefined ||
    patch.italic !== undefined ||
    patch.underline !== undefined ||
    patch.color_hex !== undefined

  if (hasRunPatch) {
    const pMarkRpr = ensureChildInOrder(d, pPr, "rPr", PPR_ORDER)
    applyRunStylePatch(d, pMarkRpr, patch)
    for (const r of plainRuns()) {
      const rPr =
        children(r, "rPr")[0] ??
        (r.insertBefore(wordElement(d, "rPr"), r.firstChild) as Element)
      applyRunStylePatch(d, rPr, patch)
    }
  }
}

function collectRangeParagraphs(root: Element, start: string, end?: string): Element[] {
  const st = resolveCoord(root, start)
  if (!st) throw new Error(`format_paragraphs 起点坐标不存在: ${start}`)
  if (!end || end === start) {
    const targets = [st.element, ...st.mirrors]
    return targets.flatMap((el) =>
      el.localName === "p" ? [el] : Array.from(el.getElementsByTagNameNS(W, "p")),
    )
  }
  const ed = resolveCoord(root, end)
  if (!ed) throw new Error(`format_paragraphs 终点坐标不存在: ${end}`)
  if (st.kind !== ed.kind || st.element.parentNode !== ed.element.parentNode) {
    throw new Error(`format_paragraphs 起止坐标 (${start}..${end}) 不在同一父容器内`)
  }
  const parent = st.element.parentNode as Element
  const siblings =
    st.kind === "block"
      ? bodyBlocks(root)
      : children(parent).filter((n) => n.localName === st.element.localName)
  const sIdx = siblings.indexOf(st.element)
  const eIdx = siblings.indexOf(ed.element)
  if (sIdx < 0 || eIdx < sIdx) {
    throw new Error(`format_paragraphs 区间顺序无效: ${start}..${end}`)
  }
  return siblings
    .slice(sIdx, eIdx + 1)
    .flatMap((el) =>
      el.localName === "p" ? [el] : Array.from(el.getElementsByTagNameNS(W, "p")),
    )
}

export function applyTemplateDocxEdits(
  baseBytes: Uint8Array,
  edits: {
    page_setup?: TemplatePageSetupPatch
    format_paragraphs?: TemplateParagraphFormatOp[]
    insert_paragraphs?: TemplateInsertParagraphOp[]
  },
): Uint8Array {
  const files = unzipSync(baseBytes)
  const d = parseXml(files["word/document.xml"])
  const root = d.documentElement!

  if (edits.page_setup) {
    const ps = edits.page_setup
    const sectPrs = Array.from(d.getElementsByTagNameNS(W, "sectPr"))
    const targetSect = sectPrs.at(-1)
    if (targetSect) {
      if (ps.page_width_twips !== undefined || ps.page_height_twips !== undefined) {
        const pgSz = ensureChildInOrder(d, targetSect, "pgSz", SECTPR_ORDER)
        if (ps.page_width_twips !== undefined) {
          pgSz.setAttributeNS(W, "w:w", String(ps.page_width_twips))
        }
        if (ps.page_height_twips !== undefined) {
          pgSz.setAttributeNS(W, "w:h", String(ps.page_height_twips))
        }
      }
      if (ps.margins_twips) {
        const pgMar = ensureChildInOrder(d, targetSect, "pgMar", SECTPR_ORDER)
        for (const [k, v] of Object.entries(ps.margins_twips)) {
          if (v !== undefined) pgMar.setAttributeNS(W, "w:" + k, String(v))
        }
      }
    }
  }

  for (const op of edits.format_paragraphs ?? []) {
    const paras = collectRangeParagraphs(root, op.start, op.end)
    if (!paras.length) {
      throw new Error(`format_paragraphs 坐标范围 (${op.start}) 内没有可修改的段落`)
    }
    for (const p of paras) formatSingleParagraph(d, p, op.style)
  }

  const body = root.getElementsByTagNameNS(W, "body")[0]
  for (const op of edits.insert_paragraphs ?? []) {
    const newP = wordElement(d, "p")
    const effectiveText = op.text ?? op.style.text ?? ""
    formatSingleParagraph(d, newP, { ...op.style, text: effectiveText })

    if (op.position === "end") {
      const sectPr = children(body, "sectPr")[0]
      body.insertBefore(newP, sectPr ?? null)
      continue
    }
    const refCoord = "before" in op.position ? op.position.before : op.position.after
    const resolved = resolveCoord(root, refCoord)
    if (!resolved) {
      throw new Error(`insert_paragraphs 参照坐标不存在: ${refCoord}`)
    }
    if (resolved.kind === "cell") {
      if ("before" in op.position) {
        const firstP = children(resolved.element, "p")[0]
        resolved.element.insertBefore(newP, firstP ?? null)
      } else {
        resolved.element.appendChild(newP)
      }
      continue
    }
    if (resolved.kind !== "block" && resolved.kind !== "para") {
      throw new Error(`insert_paragraphs 仅支持在块/段落/单元格坐标前后插入: ${refCoord}`)
    }
    const parent = resolved.element.parentNode
    if (!parent) throw new Error(`insert_paragraphs 目标无父容器: ${refCoord}`)
    const anchor =
      "before" in op.position ? resolved.element : resolved.element.nextSibling
    parent.insertBefore(newP, anchor)
  }

  files["word/document.xml"] = xmlBytes(d)
  return zipSync(files)
}

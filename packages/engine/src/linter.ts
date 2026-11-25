import { readFile } from "node:fs/promises"
import { posix } from "node:path"
import type { Element } from "@xmldom/xmldom"
import { unzipSync } from "fflate"
import { type FormatProfile, type LintReport, type Role, roles } from "@docs-agent/shared"
import { W, children, parseXml } from "./xml_utils.js"
import { nationalProfile } from "./defaults.js"

const rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
const val = (node?: Element, key = "val") => node?.getAttributeNS(W, key) ?? null
const one = (p: Element | undefined, tag: string) => p && children(p, tag)[0]
const all = (p: Element, tag: string) => Array.from(p.getElementsByTagNameNS(W, tag))

export function referencedFooters(root: Element, files: Record<string, Uint8Array>) {
  const refs = new Set(all(root, "footerReference").map(e => e.getAttributeNS(rel, "id")))
  const bytes = files["word/_rels/document.xml.rels"]
  if (!bytes) return []
  const links = parseXml(bytes).documentElement!
  return Array.from(links.childNodes).flatMap(node => {
    const e = node as Element
    if (!e.getAttribute || !refs.has(e.getAttribute("Id")) || e.getAttribute("TargetMode") === "External") {
      return []
    }
    const target = e.getAttribute("Target")!
    const path = posix.resolve("/word", target).slice(1)
    return files[path] ? [path] : []
  })
}

function hasPage(root: Element) {
  if (all(root, "fldSimple").some(n => /^\s*PAGE(?:\s|$)/i.test(val(n, "instr") ?? ""))) return true
  const stack: string[] = []
  for (const n of Array.from(root.getElementsByTagNameNS(W, "*"))) {
    if (n.localName === "instrText" && stack.length) stack[stack.length - 1] += n.textContent
    if (n.localName !== "fldChar") continue
    if (val(n, "fldCharType") === "begin") stack.push("")
    if (val(n, "fldCharType") === "end" && /^\s*PAGE(?:\s|$)/i.test(stack.pop() ?? "")) return true
  }
  return false
}

export async function lint(path: string, profile: FormatProfile): Promise<LintReport> {
  const files = unzipSync(await readFile(path))
  const root = parseXml(files["word/document.xml"]).documentElement!
  const styles = parseXml(files["word/styles.xml"]).documentElement!
  const definitions = new Map(children(styles, "style").map(n => [val(n, "styleId"), n]))
  const normal = [...definitions].find(([, s]) => val(s, "type") === "paragraph" && val(s, "default") === "1")
  const defaults = one(styles, "docDefaults")
  function inheritance(id: string | null, kind: string, seen = new Set<string>()): Element[] {
    if (!id || seen.has(id)) return []
    const style = definitions.get(id)
    if (!style) return []
    seen.add(id)
    const props = one(style, kind)
    return [...inheritance(val(one(style, "basedOn")), kind, seen), ...(props ? [props] : [])]
  }
  function effective(p: Element, run?: Element) {
    const props = one(p, "pPr")
    const kind = run ? "rPr" : "pPr"
    const direct = run ? one(run, kind) : props
    const id = val(one(props, "pStyle")) ?? normal?.[0] ?? null
    const layers = [one(one(defaults, kind + "Default"), kind), ...inheritance(id, kind),
      ...(run ? inheritance(val(one(direct, "rStyle")), kind) : []), direct].reverse()
    return (tag: string, attribute = "val") => {
      for (const layer of layers) {
        const property = one(layer, tag)
        if (!property) continue
        const v = val(property, attribute)
        if (tag === "b" || tag === "i") return ["0", "false", "off"].includes(v ?? "1") ? "0" : "1"
        if (v !== null) return v
      }
      return tag === "b" || tag === "i" ? "0" : null
    }
  }
  const violations: LintReport["violations"] = []
  let checked = 0
  function check(location: string, field: string, expected: unknown, observed: unknown, tolerance = 0) {
    checked++
    const actual = typeof expected === "number" && typeof observed === "string" && observed.trim() !== ""
      ? Number(observed) : observed
    if (expected === actual) return
    const numeric = typeof expected === "number" && typeof actual === "number"
    if (numeric && Math.abs(expected - actual) <= tolerance) {
      return
    }
    violations.push({ location, field, expected, actual })
  }
  for (const [i, section] of all(root, "sectPr").entries()) {
    const where = "section[" + i + "]"
    for (const side of ["top", "bottom", "left", "right"] as const) {
      const key = `margin_${side}_mm` as const
      check(where, "page." + key, Math.round(profile.page[key] * 1440 / 25.4),
        val(one(section, "pgMar"), side))
    }
    check(where, "page.width", 11906, val(one(section, "pgSz"), "w"))
    check(where, "page.height", 16838, val(one(section, "pgSz"), "h"))
  }
  const numbered = referencedFooters(root, files).some(f => hasPage(parseXml(files[f]).documentElement!))
  check("footer", "page.show_page_number", profile.page.show_page_number, numbered)
  const paragraphs = all(root, "p").map((p, index) => {
    const text = all(p, "t").map(t => t.textContent).join("")
    const runs = children(p, "r").map(r => effective(p, r))
    const red = runs.some(get => get("color")?.toUpperCase() === "FF0000")
    const size = Math.max(0, ...runs.map(get => Number(get("sz")) || 0))
    return { p, index, text, runs, red, size }
  }).filter(rec => rec.text)
  const title = paragraphs.filter(rec => !rec.red).sort((a, b) => b.size - a.size)[0]
  const header = profile.red_header
  let titles = 0
  let hasRed = false
  for (const rec of paragraphs) {
    const { p, text } = rec
    const where = "paragraph[" + rec.index + "]"
    const get = effective(p)
    const id = val(one(one(p, "pPr"), "pStyle"))
    let role = id?.replace(/^gw_/, "") ?? ""
    const known = !id || definitions.has(id) || ["red_header", "doc_number"].includes(role)
    check(where, "style.exists", true, known)
    if (!roles.includes(role as Role) && !["red_header", "doc_number"].includes(role)) {
      if (rec.red && rec.size >= 44) role = "red_header"
      else if (rec === title) role = "title"
      else if (/^[一二三四五六七八九十]+、/.test(text)) role = "heading_1"
      else if (/^[（(][一二三四五六七八九十]+[）)]/.test(text)) role = "heading_2"
      else if (/^\d+[.．、]/.test(text)) role = "heading_3"
      else if (/^\d{4}年\d+月\d+日/.test(text)) role = "date"
      else if (/[：:]$/.test(text)) role = "recipient"
      else role = get("jc") === "right" ? "signature" : "body"
    }
    if (role === "title") titles++
    if (role === "red_header") hasRed = true
    let style = profile.styles[role as Role]
    if (!style) {
      style = nationalProfile().styles.body
      style.alignment = "center"
      style.first_line_indent_chars = 0
      style.font_cn = role === "red_header" ? header.font_cn : header.doc_number_font_cn
      style.font_size_pt = role === "red_header" ? header.font_size_pt : header.doc_number_size_pt
      if (role === "red_header") style.color_hex = header.color_hex
    }
    const fixed = style.line_spacing_rule === "exact"
    check(where, "alignment", style.alignment === "justify" ? "both" : style.alignment, get("jc"))
    check(where, "line_spacing_rule", fixed ? "exact" : "auto", get("spacing", "lineRule"))
    check(where, "line_spacing_value", Math.round(style.line_spacing_value * (fixed ? 20 : 240)),
      get("spacing", "line"))
    check(where, "first_line_indent_chars", Math.round(style.first_line_indent_chars * 100),
      get("ind", "firstLineChars"))
    const twips = Math.round(style.first_line_indent_chars * style.font_size_pt * 20)
    check(where, "first_line_indent_twips", twips,
      get("ind", "firstLine"), 1)
    check(where, "space_before_pt", Math.round(style.space_before_pt * 20), get("spacing", "before"))
    check(where, "space_after_pt", Math.round(style.space_after_pt * 20), get("spacing", "after"))
    for (const [i, run] of children(p, "r").entries()) {
      if (!all(run, "t").some(t => t.textContent)) continue
      const location = where + ".run[" + i + "]"
      const prop = rec.runs[i]
      for (const key of ["ascii", "hAnsi", "eastAsia", "cs"]) {
        const font = key === "eastAsia" ? style.font_cn : style.font_en
        check(location, "font_" + key, font, prop("rFonts", key))
      }
      check(location, "font_size_pt", Math.round(style.font_size_pt * 2), prop("sz"))
      check(location, "font_size_cs_pt", Math.round(style.font_size_pt * 2), prop("szCs"))
      check(location, "bold", style.bold ? "1" : "0", prop("b"))
      check(location, "italic", style.italic ? "1" : "0", prop("i"))
      check(location, "color_hex", style.color_hex.toUpperCase(), prop("color")?.toUpperCase() ?? "")
    }
  }
  const line = all(root, "pBdr").some(b => children(b, "bottom").some(n =>
    val(n, "color") === header.color_hex && !["nil", "none"].includes(val(n) ?? "")))
  check("document", "title.count", 1, titles)
  check("document", "red_header.enabled", header.enabled, hasRed)
  check("document", "red_header.has_red_line", header.enabled && header.has_red_line, line)
  return { passed: !violations.length, checked, violations,
    score: Number((100 * (1 - violations.length / checked)).toFixed(2)) }
}

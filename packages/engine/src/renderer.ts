import { nationalProfile } from "./defaults.js"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import type { Document, Element } from "@xmldom/xmldom"
import { strToU8, unzipSync, zipSync } from "fflate"
import { type DocContentAST, type FormatProfile, type StyleSpec, roles } from "@docs-agent/shared"
import {
  W, children, insertInSchemaOrder, parseXml, SECTPR_ORDER, wordElement, xmlBytes,
} from "./xml_utils.js"

const relationship = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
const packageRel = "http://schemas.openxmlformats.org/package/2006/relationships"
const types = "http://schemas.openxmlformats.org/package/2006/content-types"
const wordType = "application/vnd.openxmlformats-officedocument.wordprocessingml."
const empty = (tag: string) => strToU8('<w:' + tag + ' xmlns:w="' + W + '"/>')

function addPart(document: Document, ns: string, name: string, attrs: Record<string, string>) {
  const e = document.createElementNS(ns, name)
  for (const [key, value] of Object.entries(attrs)) e.setAttribute(key, value)
  document.documentElement!.appendChild(e)
}

export function formattedParagraph(d: Document, role: string, text: string, s: StyleSpec) {
  const p = wordElement(d, "p")
  const props = p.appendChild(wordElement(d, "pPr"))
  props.appendChild(wordElement(d, "pStyle", { val: "gw_" + role }))
  const exact = s.line_spacing_rule === "exact"
  props.appendChild(wordElement(d, "spacing", {
    before: Math.round(s.space_before_pt * 20), after: Math.round(s.space_after_pt * 20),
    line: Math.round(s.line_spacing_value * (exact ? 20 : 240)), lineRule: exact ? "exact" : "auto",
  }))
  props.appendChild(wordElement(d, "ind", {
    firstLineChars: Math.round(s.first_line_indent_chars * 100),
    firstLine: Math.round(s.first_line_indent_chars * s.font_size_pt * 20),
  }))
  props.appendChild(wordElement(d, "jc", { val: s.alignment === "justify" ? "both" : s.alignment }))
  const run = p.appendChild(wordElement(d, "r"))
  const rPr = run.appendChild(wordElement(d, "rPr"))
  rPr.appendChild(wordElement(d, "rFonts", { ascii: s.font_en, hAnsi: s.font_en, eastAsia: s.font_cn,
    cs: s.font_en }))
  const format = { b: +s.bold, i: +s.italic, color: s.color_hex, sz: Math.round(2 * s.font_size_pt) }
  for (const [key, val] of Object.entries({ ...format, szCs: format.sz })) {
    rPr.appendChild(wordElement(d, key, { val }))
  }
  for (const segment of text.split(/(\r\n|[\r\n\t])/)) {
    if (segment === "\t") run.appendChild(wordElement(d, "tab"))
    else if (/^[\r\n]/.test(segment)) run.appendChild(wordElement(d, "br"))
    else {
      const t = wordElement(d, "t")
      run.appendChild(t)
      t.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve")
      t.appendChild(d.createTextNode(segment))
    }
  }
  return p
}

function registerParts(files: Record<string, Uint8Array>) {
  const manifest = parseXml(files["[Content_Types].xml"] ?? strToU8('<Types xmlns="' + types + '"/>'))
  const main = "word/document.xml"
  const links = parseXml(files["word/_rels/document.xml.rels"] ??
    strToU8('<Relationships xmlns="' + packageRel + '"/>'))
  const rootLinks = parseXml(files["_rels/.rels"] ?? strToU8('<Relationships xmlns="' + packageRel + '"/>'))
  if (!files["_rels/.rels"]) {
    addPart(manifest, types, "Default", { Extension: "rels",
      ContentType: "application/vnd.openxmlformats-package.relationships+xml" })
    addPart(rootLinks, packageRel, "Relationship", { Id: "rId1", Target: main,
      Type: relationship + "/officeDocument" })
    files["_rels/.rels"] = xmlBytes(rootLinks)
  }
  for (const [name, kind] of [["document", "document.main"], ["styles", "styles"], ["footerV2", "footer"]]) {
    const part = "/word/" + name + ".xml"
    if (!Array.from(manifest.documentElement!.childNodes).some(n => (n as Element).getAttribute?.("PartName")
      === part)) {
      addPart(manifest, types, "Override", { PartName: part, ContentType: wordType + kind + "+xml" })
    }
    if (name === "footerV2" || (name === "styles" && !files["word/styles.xml"])) {
      addPart(links, packageRel, "Relationship", { Id: "docforge" + name, Target: name + ".xml",
        Type: relationship + "/" + kind })
    }
  }
  files["word/_rels/document.xml.rels"] = xmlBytes(links)
  files["[Content_Types].xml"] = xmlBytes(manifest)
}

export async function render(content: DocContentAST, profile: FormatProfile, output: string) {
  if (!content.title.trim()) throw new Error("请在 title 中提供一个非空的公文标题")
  const h = profile.red_header
  const org = [content.red_header_org, h.org_name, content.signature].find(n => n?.trim())
  if (h.enabled && !org) throw new Error("请在 red_header_org 中填写发文机关名称")
  const files = profile.base_template_path ? unzipSync(await readFile(profile.base_template_path)) : {}
  registerParts(files)
  const d = parseXml(files["word/document.xml"] ?? empty("document"))
  const body = children(d.documentElement!, "body")[0] 
    ?? d.documentElement!.appendChild(wordElement(d, "body"))
  const section = children(body, "sectPr")[0] ?? wordElement(d, "sectPr")
  while (body.firstChild) body.removeChild(body.firstChild)
  const styles = parseXml(files["word/styles.xml"] ?? empty("styles"))
  const ids = children(styles.documentElement!, "style").map(s => s.getAttributeNS(W, "styleId"))
  for (const role of [...roles, "red_header", "doc_number", "page_number"]) {
    const id = "gw_" + role
    if (!ids.includes(id)) {
      const style = styles.documentElement!.appendChild(wordElement(styles, "style", {
        type: "paragraph", styleId: id,
      }))
      style.appendChild(wordElement(styles, "name", { val: id }))
    }
  }
  for (const node of children(section)) {
    if (["pgSz", "pgMar", "footerReference", "titlePg"].includes(node.localName!)) section.removeChild(node)
  }
  const margins: Record<string, number> = { header: 851, footer: 992, gutter: 0 }
  for (const side of ["top", "bottom", "left", "right"] as const) {
    margins[side] = Math.round(profile.page[`margin_${side}_mm`] * 1440 / 25.4)
  }
  insertInSchemaOrder(section, wordElement(d, "pgSz", { w: 11906, h: 16838 }), SECTPR_ORDER)
  insertInSchemaOrder(section, wordElement(d, "pgMar", margins), SECTPR_ORDER)
  const ref = wordElement(d, "footerReference", { type: "default" })
  ref.setAttributeNS(relationship, "r:id", "docforgefooterV2")
  insertInSchemaOrder(section, ref, SECTPR_ORDER)
  const footer = parseXml(empty("ftr"))
  const centered: StyleSpec = {
    ...nationalProfile().styles.body, alignment: "center", first_line_indent_chars: 0,
  }
  if (profile.page.show_page_number) {
    const pageStyle = { ...centered, font_cn: "宋体", font_size_pt: 14 }
    const p = formattedParagraph(footer, "page_number", "— ", pageStyle)
    const field = p.appendChild(wordElement(footer, "fldSimple", { instr: "PAGE" }))
    field.appendChild(formattedParagraph(footer, "page_number", "1", pageStyle).lastChild!)
    p.appendChild(formattedParagraph(footer, "page_number", " —", pageStyle).lastChild!)
    footer.documentElement!.appendChild(p)
  } else footer.documentElement!.appendChild(wordElement(footer, "p"))
  if (h.enabled) body.appendChild(formattedParagraph(d, "red_header", org!, {
    ...centered, font_cn: h.font_cn, font_size_pt: h.font_size_pt, color_hex: h.color_hex,
  }))
  if (content.doc_number) body.appendChild(formattedParagraph(d, "doc_number", content.doc_number, {
    ...centered, font_cn: h.doc_number_font_cn, font_size_pt: h.doc_number_size_pt,
  }))
  if (h.enabled && h.has_red_line) {
    const p = body.appendChild(wordElement(d, "p"))
    const border = p.appendChild(wordElement(d, "pPr")).appendChild(wordElement(d, "pBdr"))
    border.appendChild(wordElement(d, "bottom", { val: "single", sz: 12, color: h.color_hex }))
  }
  body.appendChild(formattedParagraph(d, "title", content.title, profile.styles.title))
  if (content.recipient) {
    body.appendChild(formattedParagraph(d, "recipient", content.recipient, profile.styles.recipient))
  }
  for (const block of content.blocks ?? []) {
    if (block.type !== "table") {
      body.appendChild(formattedParagraph(d, block.type, block.text, profile.styles[block.type]))
      continue
    }
    const table = body.appendChild(wordElement(d, "tbl"))
    const props = table.appendChild(wordElement(d, "tblPr"))
    const borders = props.appendChild(wordElement(d, "tblBorders"))
    for (const side of ["top", "left", "bottom", "right", "insideH", "insideV"]) {
      borders.appendChild(wordElement(d, side, { val: "single", sz: 4, color: "000000" }))
    }
    const grid = table.appendChild(wordElement(d, "tblGrid"))
    const cols = block.rows[0]?.length
    if (!cols || block.rows.some(row => row.length !== cols)) throw new Error("表格必须是非空矩形")
    for (let i = 0; i < cols; i++) grid.appendChild(wordElement(d, "gridCol"))
    for (const values of block.rows) {
      const row = table.appendChild(wordElement(d, "tr"))
      for (const text of values) {
        const cell = row.appendChild(wordElement(d, "tc"))
        cell.appendChild(formattedParagraph(d, "body", text, profile.styles.body))
      }
    }
  }
  for (const item of content.attachments ?? []) {
    body.appendChild(formattedParagraph(d, "body", "附件：" + item, profile.styles.body))
  }
  for (const role of ["signature", "date"] as const) {
    if (content[role]) body.appendChild(formattedParagraph(d, role, content[role], profile.styles[role]))
  }
  body.appendChild(section)
  files["word/document.xml"] = xmlBytes(d)
  files["word/styles.xml"] = xmlBytes(styles)
  files["word/footerV2.xml"] = xmlBytes(footer)
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, zipSync(files))
  return output
}

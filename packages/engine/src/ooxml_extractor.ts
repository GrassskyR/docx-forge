import { randomUUID } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { unzipSync, zipSync } from "fflate"
import type { Element } from "@xmldom/xmldom"
import { roles, type Role } from "@docs-agent/shared"
import { nationalProfile } from "./defaults.js"
import { toDocx } from "./doc_converter.js"
import { attr, child, paragraphFormats, weighted, type ParagraphFormat } from "./paragraph_format.js"
import { W, parseXml, xmlBytes } from "./xml_utils.js"

const issue = /[^。！？：:]{0,30}[〔\[［][\d×Xx〇○０-９]{4}[〕\]］]\s*[\d×Xx〇○零一二三四五六七八九十]+\s*号/
const serial = /[（(]?(?:[\d×Xx〇○]{2,4}年)?\s*第\s*[\d×Xx〇○零一二三四五六七八九十]+\s*期[）)]?/
const numberPattern = new RegExp("^\\s*(?:" + issue.source + "|" + serial.source + ")\\s*$")
const red = (value?: string | null) => {
  if (!value) return false
  const color = value.toLowerCase().replace(/^#/, "")
  if (color === "red") return true
  if (!/^[0-9a-f]{6}$/.test(color)) return false
  const [r, g, b] = color.match(/../g)!.map(pair => parseInt(pair, 16))
  return r >= 128 && g <= r / 3 && b <= r / 3
}

function hasRedLine(root: Element) {
  return Array.from(root.getElementsByTagName("*")).some(node => {
    const parent = (node.parentNode as Element)?.localName
    if (parent === "tblBorders" || (parent === "pBdr" && node.localName === "bottom")) {
      return red(attr(node, "color")) && !["none", "nil"].includes(attr(node) ?? "")
    }
    if (node.namespaceURI === "urn:schemas-microsoft-com:vml") {
      return !["f", "false", "0"].includes(node.getAttribute("stroked") ?? "") &&
        red(node.getAttribute("strokecolor"))
    }
    if (node.localName === "ln") {
      return Array.from(node.getElementsByTagNameNS("*", "srgbClr")).some(c => red(c.getAttribute("val")))
    }
    if (node.localName !== "r") return false
    const props = child(node, "rPr")
    const underline = child(props, "u")
    return underline && attr(underline) !== "none" && red(attr(child(props, "color"))) &&
      /^\s{8,}$/.test(node.textContent ?? "")
  })
}

function roleFor(record: ParagraphFormat, title?: ParagraphFormat): Role {
  const explicit = record.style.replace(/^gw_/, "") as Role
  if (roles.includes(explicit)) return explicit
  if (record === title) return "title"
  const { text } = record
  if (/^[一二三四五六七八九十]+、/.test(text)) return "heading_1"
  if (/^[（(][一二三四五六七八九十]+[）)]/.test(text)) return "heading_2"
  if (/^\d+[.．、]/.test(text)) return "heading_3"
  if (/^\d{4}年\d+月\d+日/.test(text)) return "date"
  if (/^[^。！？]{1,60}[：:]/.test(text)) return "recipient"
  return record.values.alignment === "right" ? "signature" : "body"
}

export async function extract(source: string, name: string, directory: string) {
  const staging = await mkdtemp(join(tmpdir(), "docforge-extract-"))
  try {
    const files = unzipSync(await readFile(await toDocx(source, staging)))
    const document = parseXml(files["word/document.xml"])
    const root = document.documentElement!
    const styles = files["word/styles.xml"] && parseXml(files["word/styles.xml"]).documentElement!
    const profile = nationalProfile()
    profile.id = randomUUID()
    profile.name = name
    profile.source_type = "extracted_doc"
    const margin = root.getElementsByTagNameNS(W, "pgMar")[0]
    for (const side of ["top", "bottom", "left", "right"] as const) {
      const value = attr(margin, side)
      if (value) profile.page[`margin_${side}_mm`] = Number((Number(value) * 25.4 / 1440).toFixed(4))
    }
    profile.page.show_page_number = false
    const header = profile.red_header
    header.has_red_line = hasRedLine(root)
    for (const [path, bytes] of Object.entries(files)) {
      if (!/^word\/(?:(?:header|footer)\d+|comments|footnotes|endnotes)\.xml$/.test(path)) continue
      const story = parseXml(bytes)
      const element = story.documentElement!
      if (/\/(header|footer)/.test(path)) header.has_red_line ||= hasRedLine(element)
      if (path.startsWith("word/footer")) {
        const fields = [
          ...Array.from(element.getElementsByTagNameNS(W, "fldSimple")).map(n => attr(n, "instr")),
          ...Array.from(element.getElementsByTagNameNS(W, "instrText")).map(n => n.textContent),
        ]
        profile.page.show_page_number ||= fields.some(s => /^\s*PAGE(?:\s|$)/i.test(s ?? ""))
      }
      while (element.firstChild) element.removeChild(element.firstChild)
      files[path] = xmlBytes(story)
    }
    const records = paragraphFormats(root, styles)
    const headers: ParagraphFormat[] = []
    const other: ParagraphFormat[] = []
    let numbered = false
    for (const record of records) {
      const v = record.values
      if (record.style === "gw_doc_number" || numberPattern.test(record.text)) {
        if (!numbered) {
          header.doc_number_font_cn = v.font_cn ?? header.doc_number_font_cn
          header.doc_number_size_pt = v.font_size_pt ?? header.doc_number_size_pt
        }
        numbered = true
      } else if (record.style === "gw_red_header" ||
        (!numbered && !other.length && red(v.color_hex) && (v.font_size_pt ?? 0) >= 22)) {
        headers.push(record)
      } else {
        other.push(record)
      }
    }
    if (headers.length) {
      const primary = [...headers].sort((a, b) => b.text.length - a.text.length)[0].values
      header.enabled = true
      header.org_name = headers.map(r => r.text).join("\n")
      header.font_cn = primary.font_cn ?? header.font_cn
      header.font_size_pt = primary.font_size_pt ?? header.font_size_pt
      header.color_hex = primary.color_hex ?? header.color_hex
    }
    const eligible = other.filter(r => !r.table)
    const title = [...(eligible.length ? eligible : other)]
      .sort((a, b) => (b.values.font_size_pt ?? 0) - (a.values.font_size_pt ?? 0))[0]
    for (const role of roles) {
      Object.assign(profile.styles[role], weighted(other.filter(r => roleFor(r, title) === role)))
    }
    const body = root.getElementsByTagNameNS(W, "body")[0]
    for (const node of Array.from(body.childNodes)) {
      if ((node as Element).localName !== "sectPr") body.removeChild(node)
    }
    files["word/document.xml"] = xmlBytes(document)
    await mkdir(directory, { recursive: true })
    profile.base_template_path = resolve(directory, profile.id + ".docx")
    await writeFile(profile.base_template_path, zipSync(files))
    return profile
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

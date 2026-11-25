import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import type { Element } from "@xmldom/xmldom"
import type { FormatProfile, LintReport } from "@docs-agent/shared"
import { unzipSync, zipSync } from "fflate"
import { W, children, insertInSchemaOrder, parseXml, wordElement, xmlBytes } from "./xml_utils.js"
import { PPR_ORDER, RPR_ORDER, SECTPR_ORDER } from "./xml_utils.js"
import { referencedFooters } from "./linter.js"
import { formattedParagraph } from "./renderer.js"
import { nationalProfile } from "./defaults.js"

const fields: Record<string, [string, string]> = {
  alignment: ["jc", "val"], line_spacing_rule: ["spacing", "lineRule"],
  line_spacing_value: ["spacing", "line"],
  first_line_indent_chars: ["ind", "firstLineChars"], first_line_indent_twips: ["ind", "firstLine"],
  space_before_pt: ["spacing", "before"], space_after_pt: ["spacing", "after"],
  font_size_pt: ["sz", "val"], font_size_cs_pt: ["szCs", "val"], bold: ["b", "val"], italic: ["i", "val"],
  color_hex: ["color", "val"],
}
for (const font of ["ascii", "hAnsi", "eastAsia", "cs"]) fields["font_" + font] = ["rFonts", font]

export async function repairDocx(path: string, profile: FormatProfile,
  violations: LintReport["violations"], output = path) {
  const files = unzipSync(await readFile(path))
  const document = parseXml(files["word/document.xml"])
  const root = document.documentElement!
  const paragraphs = Array.from(root.getElementsByTagNameNS(W, "p"))
  const sections = Array.from(root.getElementsByTagNameNS(W, "sectPr"))
  const body = children(root, "body")[0]
  const style = (p: Element) => children(children(p, "pPr")[0] ?? p, "pStyle")[0]?.getAttributeNS(W, "val")
  function property(parent: Element, tag: string, order: string[]) {
    return children(parent, tag)[0] ??
      insertInSchemaOrder(parent, wordElement(document, tag), order) as Element
  }
  for (const { location, field, expected } of violations) {
    const section = /^section\[(\d+)\]$/.exec(location)
    if (section) {
      const margin = /^page\.margin_(top|bottom|left|right)_mm$/.exec(field)
      const tag = margin ? "pgMar" : "pgSz"
      const node = property(sections[Number(section[1])], tag, SECTPR_ORDER)
      const key = margin?.[1] ?? (field === "page.width" ? "w" : "h")
      node.setAttributeNS(W, "w:" + key, String(expected))
      if (!margin) node.removeAttributeNS(W, "orient")
      continue
    }
    const position = /^paragraph\[(\d+)\](?:\.run\[(\d+)\])?$/.exec(location)
    if (position && fields[field]) {
      const run = position[2] !== undefined
      const p = paragraphs[Number(position[1])]
      const owner = run ? children(p, "r")[Number(position[2])] : p
      const kind = run ? "rPr" : "pPr"
      const props = children(owner, kind)[0] ??
        owner.insertBefore(wordElement(document, kind), owner.firstChild)
      const [tag, key] = fields[field]
      property(props, tag, run ? RPR_ORDER : PPR_ORDER).setAttributeNS(W, "w:" + key, String(expected))
    }
    if (field === "page.show_page_number") {
      for (const filename of referencedFooters(root, files)) {
        const footer = parseXml(files[filename])
        const f = footer.documentElement!
        if (expected) {
          const p = wordElement(footer, "p")
          const page = p.appendChild(wordElement(footer, "fldSimple", { instr: "PAGE" }))
          page.appendChild(wordElement(footer, "r")).appendChild(wordElement(footer, "t")).textContent = "1"
          f.appendChild(p)
        } else {
          for (const field of Array.from(f.getElementsByTagNameNS(W, "fldSimple"))) {
            if (/^\s*PAGE(?:\s|$)/i.test(field.getAttributeNS(W, "instr") ?? "")) {
              field.parentNode!.removeChild(field)
            }
          }
          for (const p of Array.from(f.getElementsByTagNameNS(W, "p"))) {
            const groups: Element[][] = []
            for (const r of children(p, "r")) {
              const marks = children(r, "fldChar").map(n => n.getAttributeNS(W, "fldCharType"))
              if (marks.includes("begin")) groups.push([])
              for (const group of groups) group.push(r)
              if (!marks.includes("end")) continue
              const group = groups.pop() ?? []
              const instruction = group
                .flatMap(n => children(n, "instrText").map(t => t.textContent)).join("")
              if (/^\s*PAGE(?:\s|$)/i.test(instruction)) {
                for (const node of group) node.parentNode?.removeChild(node)
              }
            }
          }
        }
        files[filename] = xmlBytes(footer)
      }
    }
  }
  for (const { field, expected } of violations.filter(v => v.location === "document")) {
    const title = paragraphs.find(p => style(p) === "gw_title")
    if (!title) continue
    if (field === "red_header.enabled") {
      if (expected) {
        const name = profile.red_header.org_name
          ?? paragraphs.find(p => style(p) === "gw_signature")?.textContent
        if (!name) continue
        const h = profile.red_header
        const header = formattedParagraph(document, "red_header", name, {
          ...nationalProfile().styles.body, alignment: "center", first_line_indent_chars: 0,
          font_cn: h.font_cn, font_size_pt: h.font_size_pt, color_hex: h.color_hex,
        })
        body.insertBefore(header, body.firstChild)
      } else {
        for (const p of paragraphs.filter(p => style(p) === "gw_red_header")) p.parentNode?.removeChild(p)
      }
    }
    if (field === "red_header.has_red_line") {
      if (expected) {
        const p = wordElement(document, "p")
        const border = p.appendChild(wordElement(document, "pPr")).appendChild(wordElement(document, "pBdr"))
        border.appendChild(wordElement(document, "bottom", {
          val: "single", sz: 12, color: profile.red_header.color_hex,
        }))
        body.insertBefore(p, title)
      } else {
        for (const b of Array.from(body.getElementsByTagNameNS(W, "pBdr"))) {
          for (const n of children(b, "bottom")) {
            if (n.getAttributeNS(W, "color") === profile.red_header.color_hex) b.removeChild(n)
          }
        }
      }
    }
  }
  files["word/document.xml"] = xmlBytes(document)
  await mkdir(dirname(output), { recursive: true })
  const temporary = output + "." + randomUUID() + ".tmp"
  try {
    await writeFile(temporary, zipSync(files))
    await rename(temporary, output)
  } finally {
    await rm(temporary, { force: true })
  }
  return output
}

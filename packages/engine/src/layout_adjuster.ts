import { mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { unzipSync, zipSync } from "fflate"
import type { Element } from "@xmldom/xmldom"
import {
  W,
  children,
  insertInSchemaOrder,
  parseXml,
  PPR_ORDER,
  wordElement,
  xmlBytes,
} from "./xml_utils.js"
import { telemetry } from "./layout_telemetry.js"
import { preview } from "./doc_converter.js"

export type Adjustment = {
  type:
    | "compact_pages"
    | "prevent_orphan_signature"
    | "line_spacing_delta"
    | "space_after_delta"
    | "table_col_widths"
  section?: number
  delta?: number
  widths?: number[]
  table?: number
}

function collectSectionParagraphs(doc: ReturnType<typeof parseXml>): Element[][] {
  const body = doc.getElementsByTagNameNS(W, "body")[0]
  if (!body) return []
  const tocParas = new Set<Element>()
  for (const sdt of Array.from(doc.getElementsByTagNameNS(W, "sdt"))) {
    const instr = Array.from(sdt.getElementsByTagNameNS(W, "instrText"))
      .map((x) => x.textContent ?? "")
      .join("")
    if (/\bTOC\b/.test(instr)) {
      for (const p of Array.from(sdt.getElementsByTagNameNS(W, "p"))) tocParas.add(p)
    }
  }
  const sections: Element[][] = []
  let current: Element[] = []
  for (const el of children(body)) {
    if (el.localName === "sectPr") continue
    if (el.localName === "p" && !tocParas.has(el)) current.push(el)
    for (const p of Array.from(el.getElementsByTagNameNS(W, "p"))) {
      if (!tocParas.has(p)) current.push(p)
    }
    const hasSectBreak =
      (el.localName === "p" &&
        children(el, "pPr").some((pr) => children(pr, "sectPr").length > 0)) ||
      (el.localName === "sdt" && el.getElementsByTagNameNS(W, "sectPr").length > 0)
    if (hasSectBreak) {
      sections.push(current)
      current = []
    }
  }
  if (current.length > 0 || sections.length === 0) sections.push(current)
  return sections
}

export async function adjustLayout(path: string, operations: Adjustment[]) {
  const directory = dirname(path)
  const staging = await mkdtemp(join(directory, ".adjust-"))
  try {
    const before = await telemetry(path, staging)
    const files = unzipSync(await readFile(path))
    const doc = parseXml(files["word/document.xml"])
    const sections = collectSectionParagraphs(doc)
    const candidate = join(staging, "document.docx")

    function targetParas(secIdx?: number): Element[] {
      if (secIdx !== undefined) return sections[secIdx] ?? []
      return sections.at(-1) ?? []
    }
    function maxHalfPt(p: Element) {
      let max = 0
      for (const sz of Array.from(p.getElementsByTagNameNS(W, "sz"))) {
        const val = Number(sz.getAttributeNS(W, "val") || 0)
        if (val > max) max = val
      }
      return max
    }
    function isHeadingPara(p: Element) {
      const pPr = children(p, "pPr")[0]
      if (!pPr) return false
      if (children(pPr, "outlineLvl").length > 0) return true
      const st = children(pPr, "pStyle")[0]?.getAttributeNS(W, "val") ?? ""
      return /^(?:[1-6]|Heading\s*\d)$/i.test(st) || maxHalfPt(p) >= 34
    }
    function props(p: Element) {
      return children(p, "pPr")[0] ?? p.insertBefore(wordElement(doc, "pPr"), p.firstChild)
    }
    function property(p: Element, tag: string) {
      const parent = props(p)
      return (
        children(parent, tag)[0] ??
        (insertInSchemaOrder(parent, wordElement(doc, tag), PPR_ORDER) as Element)
      )
    }
    function spacing(paras: Element[], key: string, delta: number) {
      for (const p of paras) {
        if (key === "line" && isHeadingPara(p)) continue
        const sz = maxHalfPt(p)
        const e = property(p, "spacing")
        const rule = e.getAttributeNS(W, "lineRule")
        const relative = !rule || rule === "auto"
        const raw = e.getAttributeNS(W, key)
        if ((key === "before" || key === "after") && !raw) continue
        const fallback = key === "line" ? (relative ? 240 : Math.max(560, sz * 12)) : 0
        const original = Number(raw || fallback)
        const unit = key === "line" && relative ? 12 : 20
        const minLine = relative ? (sz >= 36 ? 240 : 200) : Math.max(240, sz * 11)
        const floor = key === "line" ? minLine : 0
        if (key === "line" && relative) {
          e.setAttributeNS(W, "w:lineRule", "auto")
        }
        e.setAttributeNS(
          W,
          "w:" + key,
          String(Math.max(floor, Math.round(original + unit * delta))),
        )
      }
    }

    const compactTargets: Element[][] = []
    for (const operation of operations) {
      const paras = targetParas(operation.section)
      if (operation.type === "compact_pages") {
        compactTargets.push(paras)
      } else if (operation.type === "line_spacing_delta") {
        spacing(paras, "line", operation.delta ?? -1)
      } else if (operation.type === "space_after_delta") {
        spacing(paras, "after", operation.delta ?? -1)
      } else if (operation.type === "prevent_orphan_signature") {
        const nonempty = paras.filter((p) => p.textContent?.trim())
        for (const p of nonempty.slice(-3, -1)) {
          property(p, "keepNext").setAttributeNS(W, "w:val", "1")
        }
      } else if (operation.type === "table_col_widths") {
        const table = doc.getElementsByTagNameNS(W, "tbl")[operation.table ?? 0]
        const grid = table && children(table, "tblGrid")[0]
        const cols = grid && children(grid, "gridCol")
        if (!cols || cols.length !== operation.widths?.length) throw new Error("表格列宽数量不匹配")
        for (const [i, col] of cols.entries()) {
          col.setAttributeNS(W, "w:w", String(operation.widths![i]))
        }
      } else {
        throw new Error("未知版面操作")
      }
    }

    let after = before
    const maxAttempts = compactTargets.length > 0 ? 8 : 1
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      for (const paras of compactTargets) {
        for (const p of paras) property(p, "snapToGrid").setAttributeNS(W, "w:val", "0")
        spacing(paras, "line", -1)
        spacing(paras, "before", -2)
        spacing(paras, "after", -2)
      }
      files["word/document.xml"] = xmlBytes(doc)
      await writeFile(candidate, zipSync(files))
      after = await telemetry(candidate, staging)
      if (!compactTargets.length || after.total_pages < before.total_pages || !after.warnings.length) {
        break
      }
    }

    await preview(candidate, staging)
    const outputs = await readdir(staging)
    for (const name of outputs.filter((n) => n !== "document.docx")) {
      await rename(join(staging, name), join(directory, name))
    }
    await rename(candidate, path)
    for (const name of await readdir(directory)) {
      if (/^page-\d+\.png$/.test(name) && !outputs.includes(name)) await rm(join(directory, name))
    }
    return { before, after, preview_files: outputs.filter((n) => n.endsWith(".png")).sort() }
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

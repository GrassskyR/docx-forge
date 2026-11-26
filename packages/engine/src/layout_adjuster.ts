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
  delta?: number
  widths?: number[]
  table?: number
}

export async function adjustLayout(path: string, operations: Adjustment[]) {
  const directory = dirname(path)
  const staging = await mkdtemp(join(directory, ".adjust-"))
  try {
    const before = await telemetry(path, staging)
    const files = unzipSync(await readFile(path))
    const doc = parseXml(files["word/document.xml"])
    const body = doc.getElementsByTagNameNS(W, "body")[0]
    const topBlocks = body ? children(body).filter((el) => el.localName !== "sectPr") : []
    const firstSectIdx = topBlocks.findIndex(
      (el) => el.localName === "p" && el.getElementsByTagNameNS(W, "sectPr").length > 0,
    )
    const coverSet = new Set<Element>()
    if (firstSectIdx >= 0) {
      for (const blk of topBlocks.slice(0, firstSectIdx + 1)) {
        if (blk.localName === "p") coverSet.add(blk)
        for (const p of Array.from(blk.getElementsByTagNameNS(W, "p"))) coverSet.add(p)
      }
    }
    const allParagraphs = Array.from(doc.getElementsByTagNameNS(W, "p"))
    const paragraphs = allParagraphs.filter((p) => !coverSet.has(p))
    const candidate = join(staging, "document.docx")
    function maxHalfPt(p: Element) {
      let max = 0
      for (const sz of Array.from(p.getElementsByTagNameNS(W, "sz"))) {
        const val = Number(sz.getAttributeNS(W, "val") || 0)
        if (val > max) max = val
      }
      return max
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
    function spacing(key: string, delta: number) {
      for (const p of paragraphs) {
        const sz = maxHalfPt(p)
        const e = property(p, "spacing")
        const rule = e.getAttributeNS(W, "lineRule")
        const relative = !rule || rule === "auto"
        const raw = e.getAttributeNS(W, key)
        const fallback = key === "line" ? (relative ? 240 : Math.max(560, sz * 12)) : 0
        const original = Number(raw || fallback)
        const unit = key === "line" && relative ? 12 : 20
        const minLine = relative ? (sz >= 36 ? 240 : 180) : Math.max(200, sz * 11)
        const floor = key === "line" ? minLine : 0
        e.setAttributeNS(
          W,
          "w:" + key,
          String(Math.max(floor, Math.round(original + unit * delta))),
        )
      }
    }
    let compact = false
    for (const operation of operations) {
      if (operation.type === "compact_pages") compact = true
      else if (operation.type === "line_spacing_delta") spacing("line", operation.delta ?? -1)
      else if (operation.type === "space_after_delta") spacing("after", operation.delta ?? -1)
      else if (operation.type === "prevent_orphan_signature") {
        const nonempty = paragraphs.filter((p) => p.textContent?.trim())
        for (const p of nonempty.slice(-3, -1))
          property(p, "keepNext").setAttributeNS(W, "w:val", "1")
      } else if (operation.type === "table_col_widths") {
        const table = doc.getElementsByTagNameNS(W, "tbl")[operation.table ?? 0]
        const grid = table && children(table, "tblGrid")[0]
        const cols = grid && children(grid, "gridCol")
        if (!cols || cols.length !== operation.widths?.length) throw new Error("表格列宽数量不匹配")
        for (const [i, col] of cols.entries())
          col.setAttributeNS(W, "w:w", String(operation.widths![i]))
      } else throw new Error("未知版面操作")
    }
    let after = before
    for (let attempt = 0; attempt < (compact ? 8 : 1); attempt++) {
      if (compact) {
        for (const p of paragraphs) property(p, "snapToGrid").setAttributeNS(W, "w:val", "0")
        spacing("line", -1)
        spacing("before", -2)
        spacing("after", -2)
      }
      files["word/document.xml"] = xmlBytes(doc)
      await writeFile(candidate, zipSync(files))
      after = await telemetry(candidate, staging)
      if (!compact || after.total_pages < before.total_pages || !after.warnings.length) break
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

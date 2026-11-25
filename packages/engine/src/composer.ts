import { randomUUID } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { Document, Element } from "@xmldom/xmldom"
import { unzipSync, zipSync } from "fflate"
import { ComposePlan, type TemplateAsset } from "@docs-agent/shared"
import { Assert } from "typebox/value"
import { bodyBlocks } from "./doc_inspector.js"
import { readDraft } from "./draft_ingestor.js"
import {
  W,
  children,
  parseXml,
  wordElement,
  xmlBytes,
  insertInSchemaOrder,
  RPR_ORDER,
  SECTPR_ORDER,
} from "./xml_utils.js"

export type ComposeInput = {
  mode: "exact_copy" | "authored"
  draft_id?: string
  body_plan: ComposePlan
  slot_values?: Record<string, string>
  normalize_punctuation?: boolean
}
function cloneParagraph(d: Document, prototype: Element, text: string, emphasis?: string) {
  const p = wordElement(d, "p")
  const pPr = children(prototype, "pPr")[0]
  if (pPr) {
    const props = d.importNode(pPr, true) as Element
    for (const section of children(props, "sectPr")) props.removeChild(section)
    p.appendChild(props)
  }
  const rPr = prototype.getElementsByTagNameNS(W, "rPr")[0]
  const end = emphasis ? (/^[^。！？!?]*[。！？!?]/.exec(text)?.[0].length ?? text.length) : 0
  function add(value: string, first: boolean) {
    const r = wordElement(d, "r")
    p.appendChild(r)
    const props = rPr ? (d.importNode(rPr, true) as Element) : wordElement(d, "rPr")
    r.appendChild(props)
    if (emphasis) {
      for (const [tag, val] of [
        ["b", first ? "1" : "0"],
        ...(emphasis === "underline_first_sentence" ? [["u", first ? "single" : "none"]] : []),
      ]) {
        const last = children(props, tag)[0]
        if (last) props.removeChild(last)
        insertInSchemaOrder(props, wordElement(d, tag, { val }), RPR_ORDER)
      }
    }
    for (const piece of value.split(/(\t|\n)/)) {
      if (piece === "\t" || piece === "\n")
        r.appendChild(wordElement(d, piece === "\t" ? "tab" : "br"))
      else {
        const t = wordElement(d, "t")
        t.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve")
        t.textContent = piece
        r.appendChild(t)
      }
    }
  }
  if (end) add(text.slice(0, end), true)
  if (!end || end < text.length) add(text.slice(end), false)
  return p
}

function cloneTable(d: Document, prototype: Element, rows: string[][]) {
  const copy = d.importNode(prototype, true) as Element
  const examples = children(copy, "tr")
  for (const row of examples) copy.removeChild(row)
  for (const [i, values] of rows.entries()) {
    const row = d.importNode(examples[Math.min(i, examples.length - 1)], true) as Element
    const cells = children(row, "tc")
    if (values.length !== cells.length) throw new Error("表格列数与原型不匹配")
    for (const [c, cell] of cells.entries()) {
      const example = cell.getElementsByTagNameNS(W, "p")[0]
      const p = cloneParagraph(d, example, values[c])
      for (const node of children(cell)) if (node.localName !== "tcPr") cell.removeChild(node)
      cell.appendChild(p)
    }
    copy.appendChild(row)
  }
  return copy
}

export async function compose(data: string, asset: TemplateAsset, input: ComposeInput) {
  Assert(ComposePlan, input.body_plan)
  const files = unzipSync(await readFile(join(data, "template_assets", asset.id, "base.docx")))
  const d = parseXml(files["word/document.xml"])
  const blocks = bodyBlocks(d.documentElement!)
  const draft = input.mode === "exact_copy" ? await readDraft(data, input.draft_id ?? "") : []
  const slots = asset.blueprint.slots
  let cursor = 0
  const inserted: { slot: string; element: Element; text?: string }[] = []
  const anchor = (id: string) => {
    const node = blocks[Number(id.slice(1))]
    if (!node) throw new Error("模板锚点不存在 " + id)
    return node
  }
  for (const entry of input.body_plan) {
    const id = asset.blueprint.prototypes[entry.prototype]
    if (!id) throw new Error("模板未声明原型 " + entry.prototype)
    const proto = anchor(id)
    const slot = entry.slot ?? "body"
    if (!slots.some((s) => s.name === slot)) throw new Error("模板未声明槽位 " + slot)
    if (entry.rows) {
      if (input.mode === "exact_copy" || proto.localName !== "tbl")
        throw new Error("表格需要起草模式和表格原型")
      inserted.push({ slot, element: cloneTable(d, proto, entry.rows) })
      continue
    }
    let texts: string[]
    if (input.mode === "exact_copy") {
      const range = /^P(\d+)(?:-P(\d+))?$/.exec(entry.range ?? "")
      if (!range || Number(range[1]) !== cursor || entry.text !== undefined)
        throw new Error("段落映射必须连续完整")
      const end = Number(range[2] ?? range[1])
      if (end >= draft.length || end < cursor) throw new Error("段落区间越界")
      texts = draft.slice(cursor, end + 1)
      cursor = end + 1
    } else {
      if (entry.text === undefined) throw new Error("起草段落缺少正文")
      texts = [entry.text]
    }
    if (proto.localName !== "p") throw new Error("文本段落需要段落原型")
    for (const original of texts) {
      const text = input.normalize_punctuation
        ? original.replace(/[\[［](\d{4})[\]］]/g, "〔$1〕")
        : original
      const emphasis =
        entry.emphasis ?? (entry.prototype === "heading_3" ? "first_sentence" : undefined)
      inserted.push({ slot, element: cloneParagraph(d, proto, text, emphasis), text })
    }
  }
  if (cursor !== draft.length) throw new Error("段落映射遗漏草稿内容")
  const used = new Set<Element>()
  for (const slot of slots) {
    const value = input.slot_values?.[slot.name]
    const items = inserted.filter((i) => i.slot === slot.name).map((i) => i.element)
    const first = anchor(slot.start)
    if (value !== undefined) items.unshift(cloneParagraph(d, first, value))
    if (!items.length) continue
    const end = blocks.indexOf(anchor(slot.end))
    const start = blocks.indexOf(first)
    if (end < start) throw new Error("槽位区间顺序错误")
    const parent = first.parentNode!
    for (const item of items) parent.insertBefore(item, first)
    for (const block of blocks.slice(start, end + 1)) {
      if (used.has(block)) throw new Error("槽位区间重叠")
      used.add(block)
      const keep = ["drawing", "pict", "sectPr"].some(
        (tag) => block.getElementsByTagNameNS(W, tag).length,
      )
      if (!keep) parent.removeChild(block)
    }
  }
  if (asset.blueprint.grid) {
    for (const section of Array.from(d.getElementsByTagNameNS(W, "sectPr"))) {
      const paper = children(section, "pgSz")[0]
      const margins = children(section, "pgMar")[0]
      const dimension = (e: Element | undefined, key: string, fallback: number) =>
        Number(e?.getAttributeNS(W, key) ?? fallback)
      const height = dimension(paper, "h", 16838) - dimension(margins, "top", 1440)
        - dimension(margins, "bottom", 1440)
      const width = dimension(paper, "w", 11906) - dimension(margins, "left", 1440)
        - dimension(margins, "right", 1440)
      const defaults = files["word/styles.xml"] && parseXml(files["word/styles.xml"])
      const baseSize = defaults && defaults.getElementsByTagNameNS(W, "rPrDefault")[0]
        ?.getElementsByTagNameNS(W, "sz")[0]
      const fontPt = Number(baseSize?.getAttributeNS(W, "val") ?? 20) / 2
      const current = children(section, "docGrid")[0]
      const grid = current ?? wordElement(d, "docGrid")
      grid.setAttributeNS(W, "w:type", "linesAndChars")
      grid.setAttributeNS(W, "w:linePitch", String(Math.round(height / 22)))
      grid.setAttributeNS(W, "w:charSpace", String(Math.round((width / 560 - fontPt) * 4096)))
      if (!current) insertInSchemaOrder(section, grid, SECTPR_ORDER)
    }
  }
  const placed = bodyBlocks(d.documentElement!)
  const ordered = inserted.filter((i) => i.text !== undefined)
  if (
    input.mode === "exact_copy" &&
    ordered.some((v, i) => i && placed.indexOf(v.element) <= placed.indexOf(ordered[i - 1].element))
  )
    throw new Error("槽位顺序将打乱原文")
  const doc_id = randomUUID()
  const directory = join(data, "documents", doc_id)
  await mkdir(directory, { recursive: true })
  files["word/document.xml"] = xmlBytes(d)
  const docx_path = join(directory, "document.docx")
  await writeFile(docx_path, zipSync(files))
  return {
    doc_id,
    docx_path,
    docx_url: "/files/documents/" + doc_id + "/document.docx",
    body_plan: input.body_plan,
    body_indices: ordered.map((i) => placed.indexOf(i.element)),
  }
}

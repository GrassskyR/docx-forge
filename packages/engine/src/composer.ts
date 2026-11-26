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

function textRunProps(prototype: Element): Element | undefined {
  const run = Array.from(prototype.getElementsByTagNameNS(W, "r")).find((r) =>
    Array.from(r.getElementsByTagNameNS(W, "t")).some((t) => t.textContent),
  )
  if (run) return children(run, "rPr")[0]
  const pPr = children(prototype, "pPr")[0]
  return pPr && children(pPr, "rPr")[0]
}

function cloneParagraph(d: Document, prototype: Element, text: string, emphasis?: string) {
  const p = wordElement(d, "p")
  const pPr = children(prototype, "pPr")[0]
  if (pPr) {
    const props = d.importNode(pPr, true) as Element
    for (const section of children(props, "sectPr")) props.removeChild(section)
    p.appendChild(props)
  }
  const rPr = textRunProps(prototype)
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

function visualCols(s: string) {
  let n = 0
  for (const ch of s) n += ch.charCodeAt(0) > 255 ? 2 : 1
  return n
}

function fillFieldParagraph(d: Document, prototype: Element, rawValue: string) {
  const full = Array.from(prototype.getElementsByTagNameNS(W, "t"))
    .map((t) => t.textContent ?? "")
    .join("")
  const cleanVal = rawValue.replace(/^[^：:\n]{1,14}[：:]\s*/, "").trim()
  if (!/^\s*[^。！？\n]{1,18}[：:]/.test(full)) {
    return cloneParagraph(d, prototype, cleanVal)
  }
  const p = d.importNode(prototype, true) as Element
  const pPr = children(p, "pPr")[0]
  if (pPr) {
    for (const s of children(pPr, "sectPr")) pPr.removeChild(s)
    const prRpr = children(pPr, "rPr")[0]
    const prColor = prRpr && children(prRpr, "color")[0]
    if (prColor?.getAttributeNS(W, "val")?.toUpperCase() === "FFFFFF") {
      prRpr.removeChild(prColor)
    }
  }
  const runs = children(p, "r")
  let colonIdx = -1
  for (const [idx, r] of runs.entries()) {
    const rt = Array.from(r.getElementsByTagNameNS(W, "t"))
      .map((t) => t.textContent ?? "")
      .join("")
    const pos = rt.search(/[：:]/)
    if (pos >= 0) {
      colonIdx = idx
      const tNodes = children(r, "t")
      if (tNodes.length) {
        tNodes[0].textContent = rt.slice(0, pos + 1)
        for (const extra of tNodes.slice(1)) r.removeChild(extra)
      }
      break
    }
  }
  if (colonIdx < 0) return cloneParagraph(d, prototype, cleanVal)
  const tailRuns = runs.slice(colonIdx + 1)
  const oldTail = tailRuns
    .map((r) =>
      Array.from(r.getElementsByTagNameNS(W, "t"))
        .map((t) => t.textContent ?? "")
        .join(""),
    )
    .join("")
  const targetWidth = Math.max(visualCols(oldTail), visualCols(cleanVal) + 2)
  const donor =
    tailRuns.find((r) => {
      const c = children(children(r, "rPr")[0], "color")[0]
      return c?.getAttributeNS(W, "val")?.toUpperCase() !== "FFFFFF"
    }) ?? tailRuns[0]
  const valRpr = donor && children(donor, "rPr")[0]
    ? (d.importNode(children(donor, "rPr")[0], true) as Element)
    : wordElement(d, "rPr")
  const badColor = children(valRpr, "color")[0]
  if (badColor?.getAttributeNS(W, "val")?.toUpperCase() === "FFFFFF") {
    valRpr.removeChild(badColor)
  }
  for (const r of tailRuns) p.removeChild(r)
  const pad = Math.max(0, targetWidth - visualCols(cleanVal) - 1)
  const padded = " " + cleanVal + " ".repeat(pad)
  const newRun = wordElement(d, "r")
  newRun.appendChild(valRpr)
  const t = wordElement(d, "t")
  t.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve")
  t.textContent = padded
  newRun.appendChild(t)
  p.appendChild(newRun)
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

function refreshTocSdt(d: Document, headings: { level: number; text: string }[]) {
  const body = d.documentElement!.getElementsByTagNameNS(W, "body")[0]
  for (const sdt of children(body, "sdt")) {
    const raw = sdt.textContent ?? ""
    const instr = Array.from(sdt.getElementsByTagNameNS(W, "instrText"))
      .map((n) => n.textContent ?? "")
      .join("")
    if (!instr.includes("TOC") && !raw.includes("Table of Contents")) continue
    const content = children(sdt, "sdtContent")[0]
    if (!content) continue
    const paras = children(content, "p")
    const titlePara = paras.find(
      (p) => !p.getElementsByTagNameNS(W, "fldChar").length && (p.textContent ?? "").trim(),
    )
    const samplePpr =
      paras
        .map((p) => children(p, "pPr")[0])
        .find((pr) => pr && children(pr, "tabs").length) ??
      (paras[1] && children(paras[1], "pPr")[0])
    for (const node of Array.from(content.childNodes)) {
      if (node !== titlePara) content.removeChild(node)
    }
    const items = headings.length ? headings : [{ level: 1, text: "正文" }]
    for (const [idx, h] of items.entries()) {
      const p = wordElement(d, "p")
      if (samplePpr) {
        const pr = d.importNode(samplePpr, true) as Element
        const ind = children(pr, "ind")[0] ?? insertInSchemaOrder(pr, wordElement(d, "ind"), [
          "pStyle",
          "tabs",
          "ind",
          "rPr",
        ])
        ind.setAttributeNS(W, "w:left", String((h.level - 1) * 240))
        p.appendChild(pr)
      }
      if (idx === 0) {
        const rBegin = p.appendChild(wordElement(d, "r"))
        rBegin.appendChild(wordElement(d, "fldChar", { fldCharType: "begin", dirty: "true" }))
        const rInstr = p.appendChild(wordElement(d, "r"))
        const it = wordElement(d, "instrText")
        it.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve")
        it.textContent = ' TOC \\o "1-3" \\h \\z \\u '
        rInstr.appendChild(it)
        const rSep = p.appendChild(wordElement(d, "r"))
        rSep.appendChild(wordElement(d, "fldChar", { fldCharType: "separate" }))
      }
      const rText = p.appendChild(wordElement(d, "r"))
      const t = rText.appendChild(wordElement(d, "t"))
      t.textContent = h.text
      if (idx === items.length - 1) {
        const rEnd = p.appendChild(wordElement(d, "r"))
        rEnd.appendChild(wordElement(d, "fldChar", { fldCharType: "end" }))
      }
      content.appendChild(p)
    }
  }
}

function headingLevelFor(protoName: string, element: Element): number | null {
  if (protoName === "heading_1" || protoName === "chapter") return 1
  if (protoName === "heading_2" || protoName === "section") return 2
  if (protoName === "heading_3" || protoName === "subsection") return 3
  const pPr = children(element, "pPr")[0]
  const lvl = pPr && children(pPr, "outlineLvl")[0]?.getAttributeNS(W, "val")
  if (lvl !== undefined && lvl !== "") {
    const n = Number(lvl)
    if (n >= 0 && n <= 2) return n + 1
  }
  const style = pPr && children(pPr, "pStyle")[0]?.getAttributeNS(W, "val")
  if (style === "1" || style === "Heading1") return 1
  if (style === "2" || style === "Heading2") return 2
  if (style === "3" || style === "Heading3") return 3
  return null
}

export async function compose(data: string, asset: TemplateAsset, input: ComposeInput) {
  Assert(ComposePlan, input.body_plan)
  const files = unzipSync(await readFile(join(data, "template_assets", asset.id, "base.docx")))
  const d = parseXml(files["word/document.xml"])
  const blocks = bodyBlocks(d.documentElement!)
  const draft = input.mode === "exact_copy" ? await readDraft(data, input.draft_id ?? "") : []
  const slots = asset.blueprint.slots
  let cursor = 0
  const inserted: { slot: string; element: Element; text?: string; protoName: string }[] = []
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
      inserted.push({ slot, element: cloneTable(d, proto, entry.rows), protoName: entry.prototype })
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
      inserted.push({
        slot,
        element: cloneParagraph(d, proto, text, emphasis),
        text,
        protoName: entry.prototype,
      })
    }
  }
  if (cursor !== draft.length) throw new Error("段落映射遗漏草稿内容")

  const used = new Set<Element>()
  let removedSections = 0
  for (const range of asset.blueprint.remove_ranges ?? []) {
    const first = anchor(range.start)
    const last = anchor(range.end)
    const start = blocks.indexOf(first)
    const end = blocks.indexOf(last)
    if (end < start) throw new Error("移除区间顺序错误")
    for (const block of blocks.slice(start, end + 1)) {
      if (used.has(block)) continue
      used.add(block)
      removedSections += block.getElementsByTagNameNS(W, "sectPr").length
      block.parentNode?.removeChild(block)
    }
  }

  let multiBlockReplaced = Boolean(asset.blueprint.remove_ranges?.length)
  for (const slot of slots) {
    const value = input.slot_values?.[slot.name]
    const slotItems = inserted.filter((i) => i.slot === slot.name).map((i) => i.element)
    const first = anchor(slot.start)
    if (used.has(first)) continue
    if (value !== undefined) {
      const filled =
        slot.start === slot.end && !slotItems.length
          ? fillFieldParagraph(d, first, value)
          : cloneParagraph(d, first, value)
      slotItems.unshift(filled)
    }
    if (!slotItems.length) continue
    const end = blocks.indexOf(anchor(slot.end))
    const start = blocks.indexOf(first)
    if (end < start) throw new Error("槽位区间顺序错误")
    if (end > start) multiBlockReplaced = true
    const parent = first.parentNode!
    for (const item of slotItems) parent.insertBefore(item, first)
    for (const block of blocks.slice(start, end + 1)) {
      if (used.has(block)) throw new Error("槽位区间重叠")
      used.add(block)
      const hasSect = block.getElementsByTagNameNS(W, "sectPr").length > 0
      const hasGraphic =
        end === start &&
        ["drawing", "pict"].some((tag) => block.getElementsByTagNameNS(W, tag).length > 0)
      if (hasSect && !hasGraphic) {
        for (const node of children(block)) {
          if (node.localName !== "pPr") block.removeChild(node)
        }
      } else if (!hasSect && !hasGraphic) {
        parent.removeChild(block)
      }
    }
  }

  if (multiBlockReplaced) {
    const headings = inserted
      .filter((i) => i.text)
      .flatMap((i) => {
        const level = headingLevelFor(i.protoName, i.element)
        return level ? [{ level, text: i.text!.trim() }] : []
      })
    refreshTocSdt(d, headings)
  }

  if (asset.blueprint.grid) {
    const bodyId = asset.blueprint.prototypes.body
    const bodySize = bodyId ? textRunProps(anchor(bodyId)) : undefined
    const sz = bodySize && children(bodySize, "sz")[0]?.getAttributeNS(W, "val")
    const fontPt = sz ? Number(sz) / 2 : 16
    for (const section of Array.from(d.getElementsByTagNameNS(W, "sectPr"))) {
      const paper = children(section, "pgSz")[0]
      const margins = children(section, "pgMar")[0]
      const dimension = (e: Element | undefined, key: string, fallback: number) =>
        Number(e?.getAttributeNS(W, key) ?? fallback)
      const height =
        dimension(paper, "h", 16838) -
        dimension(margins, "top", 1440) -
        dimension(margins, "bottom", 1440)
      const width =
        dimension(paper, "w", 11906) -
        dimension(margins, "left", 1440) -
        dimension(margins, "right", 1440)
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
    removed_sections: removedSections,
  }
}

import { execFile } from "node:child_process"
import { randomUUID } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { promisify } from "node:util"
import type { Document, Element } from "@xmldom/xmldom"
import { unzipSync, zipSync } from "fflate"
import {
  ComposePlan,
  type FieldSlot,
  type FontRoleSpec,
  type TemplateAsset,
} from "@docs-agent/shared"
import { Assert } from "typebox/value"
import {
  buildCoverSectionNodes,
  buildThreeLineTable,
  buildTocSectionNodes,
  refreshExistingToc,
  resetBodyPageNumberStart,
  synthesizeParagraph,
  type TocPageRef,
} from "./builders.js"
import { convert } from "./doc_converter.js"
import {
  analyzeParagraphBlanks,
  bodyBlocks,
  coalesceParagraphRuns,
  findTocSdts,
  logicalTextboxes,
  resolveCoord,
  runPlainText,
  stampSourceCoords,
  visualCols,
} from "./dom_locator.js"
import { readDraft } from "./draft_ingestor.js"
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

const run = promisify(execFile)
const XML_SPACE_NS = "http://www.w3.org/XML/1998/namespace"

export type ComposeInput = {
  mode: "exact_copy" | "authored"
  draft_id?: string
  body_plan: ComposePlan
  slot_values?: Record<string, string>
  normalize_punctuation?: boolean
  generate_cover?: boolean
  cover_subtitle?: string
  generate_toc?: boolean
  stamp_source_coords?: boolean
}

function textRunProps(prototype: Element): Element | undefined {
  const r = Array.from(prototype.getElementsByTagNameNS(W, "r")).find((node) =>
    Array.from(node.getElementsByTagNameNS(W, "t")).some((t) => t.textContent),
  )
  if (r) return children(r, "rPr")[0]
  const pPr = children(prototype, "pPr")[0]
  return pPr && children(pPr, "rPr")[0]
}

function cloneParagraph(
  d: Document,
  prototype: Element,
  text: string,
  emphasis?: "first_sentence" | "underline_first_sentence",
  outlineLevel?: number,
) {
  const p = wordElement(d, "p")
  const pPr = children(prototype, "pPr")[0]
  if (pPr) {
    const props = d.importNode(pPr, true) as Element
    for (const section of children(props, "sectPr")) props.removeChild(section)
    if (outlineLevel !== undefined && !children(props, "outlineLvl").length) {
      insertInSchemaOrder(props, wordElement(d, "outlineLvl", { val: outlineLevel }), PPR_ORDER)
    }
    p.appendChild(props)
  } else if (outlineLevel !== undefined) {
    const props = wordElement(d, "pPr")
    props.appendChild(wordElement(d, "outlineLvl", { val: outlineLevel }))
    p.appendChild(props)
  }
  const rPr = textRunProps(prototype)
  const end = emphasis
    ? (/^.*?(?:[。！？!?]|\.(?=\s|$))/.exec(text)?.[0].length ?? text.length)
    : 0

  function add(value: string, first: boolean) {
    const r = wordElement(d, "r")
    p.appendChild(r)
    const props = rPr ? (d.importNode(rPr, true) as Element) : wordElement(d, "rPr")
    r.appendChild(props)
    if (emphasis) {
      const pairs: [string, string][] = [["b", first ? "1" : "0"]]
      if (emphasis === "underline_first_sentence") {
        pairs.push(["u", first ? "single" : "none"])
      }
      for (const [tag, val] of pairs) {
        const prev = children(props, tag)[0]
        if (prev) props.removeChild(prev)
        insertInSchemaOrder(props, wordElement(d, tag, { val }), RPR_ORDER)
      }
    }
    for (const piece of value.split(/(\t|\n)/)) {
      if (piece === "\t" || piece === "\n") {
        r.appendChild(wordElement(d, piece === "\t" ? "tab" : "br"))
      } else {
        const t = wordElement(d, "t")
        t.setAttributeNS(XML_SPACE_NS, "xml:space", "preserve")
        t.textContent = piece
        r.appendChild(t)
      }
    }
  }
  if (end) add(text.slice(0, end), true)
  if (!end || end < text.length) add(text.slice(end), false)
  return p
}

function makeTextRunWithRpr(
  d: Document,
  rPr: Element | undefined,
  text: string,
  forceUnderline = false,
) {
  const r = wordElement(d, "r")
  const props = rPr ? (d.importNode(rPr, true) as Element) : wordElement(d, "rPr")
  if (forceUnderline) {
    const prevU = children(props, "u")[0]
    if (prevU) props.removeChild(prevU)
    insertInSchemaOrder(props, wordElement(d, "u", { val: "single" }), RPR_ORDER)
  }
  r.appendChild(props)
  const t = wordElement(d, "t")
  t.setAttributeNS(XML_SPACE_NS, "xml:space", "preserve")
  t.textContent = text
  r.appendChild(t)
  return r
}

function unwrapInlineSdts(container: Element) {
  for (const sdt of children(container, "sdt")) {
    const content = children(sdt, "sdtContent")[0]
    if (content) {
      unwrapInlineSdts(content)
      for (const child of Array.from(content.childNodes)) {
        container.insertBefore(child, sdt)
      }
    }
    container.removeChild(sdt)
  }
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function replaceCrossRunSubstring(d: Document, p: Element, needle: string, replacement: string) {
  if (!needle) return false
  unwrapInlineSdts(p)
  coalesceParagraphRuns(p)
  const runs = children(p, "r").filter(
    (r) => !r.getElementsByTagNameNS(W, "txbxContent").length || children(r, "t").length > 0,
  )
  const texts = runs.map(runPlainText)
  const flat = texts.join("")
  let pos = flat.indexOf(needle)
  let matchLen = needle.length
  if (pos < 0 && needle.trim().length > 0) {
    const pattern = needle.trim().split(/\s+/).map(escapeRegExp).join("\\s+")
    const m = new RegExp(pattern).exec(flat)
    if (m) {
      pos = m.index
      matchLen = m[0].length
    }
  }
  if (pos < 0) return false
  const endPos = pos + matchLen

  let acc = 0
  let startRun = 0
  let startOff = 0
  let endRun = 0
  let endOff = 0
  for (let i = 0; i < texts.length; i++) {
    const nextAcc = acc + texts[i].length
    if (pos >= acc && pos < nextAcc) {
      startRun = i
      startOff = pos - acc
    }
    if (endPos > acc && endPos <= nextAcc) {
      endRun = i
      endOff = endPos - acc
      break
    }
    acc = nextAcc
  }

  const prefix = texts[startRun].slice(0, startOff)
  const suffix = texts[endRun].slice(endOff)
  const donorRpr = children(runs[startRun], "rPr")[0]
  const merged = prefix + replacement + (startRun === endRun ? suffix : "")
  const newFirst = makeTextRunWithRpr(d, donorRpr, merged)
  p.insertBefore(newFirst, runs[startRun])
  p.removeChild(runs[startRun])

  if (startRun !== endRun) {
    for (let k = startRun + 1; k < endRun; k++) p.removeChild(runs[k])
    if (suffix) {
      const endRpr = children(runs[endRun], "rPr")[0]
      p.insertBefore(makeTextRunWithRpr(d, endRpr, suffix), runs[endRun])
    }
    p.removeChild(runs[endRun])
  }
  return true
}

function stripLeadingFieldLabel(rawValue: string, label?: string): string {
  const trimmed = rawValue.trim()
  if (label) {
    const cleanLbl = label.replace(/[：:\s]+$/, "")
    if (cleanLbl && trimmed.startsWith(cleanLbl)) {
      const rest = trimmed.slice(cleanLbl.length).replace(/^[：:\s]+/, "")
      if (rest) return rest
    }
  }
  return trimmed
}

function applyParagraphFieldEdits(
  d: Document,
  p: Element,
  edits: { field: FieldSlot; value: string }[],
) {
  unwrapInlineSdts(p)
  coalesceParagraphRuns(p)

  // 1. Match-mode replacements first (sorted descending by match position)
  const matchEdits = edits.filter((e) => e.field.mode === "match" && e.field.match)
  if (matchEdits.length) {
    const flat = children(p, "r").map(runPlainText).join("")
    const ordered = [...matchEdits].sort(
      (a, b) => flat.indexOf(b.field.match!) - flat.indexOf(a.field.match!),
    )
    for (const item of ordered) {
      replaceCrossRunSubstring(
        d,
        p,
        item.field.match!,
        stripLeadingFieldLabel(item.value, item.field.label),
      )
    }
  }

  // 2. Whole-paragraph cell mode
  const cellEdit = edits.find((e) => e.field.mode === "cell")
  if (cellEdit && edits.length === 1) {
    const val = stripLeadingFieldLabel(cellEdit.value, cellEdit.field.label)
    const donor = textRunProps(p)
    for (const r of children(p, "r")) {
      if (!r.getElementsByTagNameNS(W, "txbxContent").length) p.removeChild(r)
    }
    p.appendChild(makeTextRunWithRpr(d, donor, val))
    return
  }

  // 3. Blank-index mode
  const remaining = edits.filter((e) => e.field.mode !== "match" && e.field.mode !== "cell")
  if (!remaining.length) return
  const blanks = analyzeParagraphBlanks(p)
  if (blanks.length > 0) {
    const runs = children(p, "r")
    const paired = remaining
      .map((e, seqIdx) => {
        const bIdx = e.field.blank_index ?? (remaining.length === 1 ? 0 : seqIdx)
        const span = blanks[bIdx]
        return span ? { span, value: stripLeadingFieldLabel(e.value, e.field.label) } : null
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x))
      .sort((a, b) => b.span.runIndices[0] - a.span.runIndices[0])

    const seenSpan = new Set<number>()
    for (const { span, value } of paired) {
      if (seenSpan.has(span.index)) continue
      seenSpan.add(span.index)
      const firstRun = runs[span.runIndices[0]]
      if (!firstRun?.parentNode) continue

      if (span.keepPrefix) {
        const prefRpr = children(firstRun, "rPr")[0]
          ? (d.importNode(children(firstRun, "rPr")[0], true) as Element)
          : undefined
        if (prefRpr && span.kind === "underscore") {
          const u = children(prefRpr, "u")[0]
          if (u) prefRpr.removeChild(u)
        }
        p.insertBefore(makeTextRunWithRpr(d, prefRpr, span.keepPrefix), firstRun)
      }

      const targetW = Math.max(span.visualWidth, visualCols(value) + 2)
      const pad = Math.max(0, targetW - visualCols(value) - 1)
      const padded = " " + value + " ".repeat(pad)
      const forceU = span.kind === "underscore"
      p.insertBefore(makeTextRunWithRpr(d, span.donorRPr, padded, forceU), firstRun)

      if (span.keepSuffix) {
        p.insertBefore(makeTextRunWithRpr(d, children(firstRun, "rPr")[0], span.keepSuffix), firstRun)
      }
      for (const ri of span.runIndices) {
        if (runs[ri]?.parentNode === p) p.removeChild(runs[ri])
      }
    }
    return
  }

  // 4. Colon mode on single-field paragraph
  const firstEdit = remaining[0]
  const cleanVal = stripLeadingFieldLabel(firstEdit.value, firstEdit.field.label)
  const runs = children(p, "r")
  for (const [idx, r] of runs.entries()) {
    const rt = runPlainText(r)
    const cPos = rt.search(/[：:]/)
    if (cPos >= 0) {
      const rPr = children(r, "rPr")[0]
      p.insertBefore(makeTextRunWithRpr(d, rPr, rt.slice(0, cPos + 1) + " " + cleanVal), r)
      for (const tail of runs.slice(idx)) {
        if (!tail.getElementsByTagNameNS(W, "txbxContent").length) p.removeChild(tail)
      }
      return
    }
  }
  const donor = textRunProps(p)
  for (const r of runs) {
    if (!r.getElementsByTagNameNS(W, "txbxContent").length) p.removeChild(r)
  }
  p.appendChild(makeTextRunWithRpr(d, donor, cleanVal))
}

function stripExplicitPageBreaks(target: Element) {
  const paras =
    target.localName === "p"
      ? [target]
      : Array.from(target.getElementsByTagNameNS(W, "p"))
  for (const p of paras) {
    for (const br of Array.from(p.getElementsByTagNameNS(W, "br"))) {
      if (br.getAttributeNS(W, "type") === "page") {
        br.parentNode?.removeChild(br)
      }
    }
    const pPr = children(p, "pPr")[0]
    if (pPr) {
      for (const pb of children(pPr, "pageBreakBefore")) pPr.removeChild(pb)
    }
  }
}

function cellGridSpan(tc: Element): number {
  const tcPr = children(tc, "tcPr")[0]
  const gs = tcPr && children(tcPr, "gridSpan")[0]?.getAttributeNS(W, "val")
  return Math.max(1, Number(gs || 1))
}

function findCellAtGridCol(tr: Element, targetCol: number): Element | undefined {
  let col = 0
  for (const tc of children(tr, "tc")) {
    if (col === targetCol) return tc
    col += cellGridSpan(tc)
  }
  return undefined
}

function removeTableRowSafely(d: Document, tbl: Element, tr: Element) {
  const rows = children(tbl, "tr")
  const idx = rows.indexOf(tr)
  if (idx < 0) return
  if (rows.length <= 1) {
    for (const tc of children(tr, "tc")) {
      for (const node of children(tc)) {
        if (node.localName !== "tcPr") tc.removeChild(node)
      }
      ensureCellEndsWithParagraph(d, tc)
    }
    const trPr = children(tr, "trPr")[0]
    if (trPr) {
      for (const h of children(trPr, "trHeight")) trPr.removeChild(h)
    }
    return
  }

  const nextTr = rows[idx + 1]
  if (nextTr) {
    let col = 0
    for (const tc of children(tr, "tc")) {
      const tcPr = children(tc, "tcPr")[0]
      const vM = tcPr && children(tcPr, "vMerge")[0]
      if (vM && vM.getAttributeNS(W, "val") === "restart") {
        const nextTc = findCellAtGridCol(nextTr, col)
        const nextPr = nextTc && children(nextTc, "tcPr")[0]
        const nextVm = nextPr && children(nextPr, "vMerge")[0]
        if (nextVm && !nextVm.getAttributeNS(W, "val")) {
          nextVm.setAttributeNS(W, "w:val", "restart")
        }
      }
      col += cellGridSpan(tc)
    }
  }
  tbl.removeChild(tr)
}

function clearOrRemoveBlock(block: Element, allowDropSectPr: boolean): number {
  const sectCount = block.getElementsByTagNameNS(W, "sectPr").length
  if (sectCount > 0 && !allowDropSectPr) {
    if (block.localName === "p") {
      for (const node of Array.from(block.childNodes)) {
        if ((node as Element).localName !== "pPr") block.removeChild(node)
      }
      const pPr = children(block, "pPr")[0]
      if (pPr) {
        const numPr = children(pPr, "numPr")[0]
        if (numPr) pPr.removeChild(numPr)
      }
      return 0
    }
    return 0
  }
  block.parentNode?.removeChild(block)
  return sectCount
}

function ensureCellEndsWithParagraph(d: Document, tc: Element) {
  const kids = children(tc).filter((n) => n.localName !== "tcPr")
  const last = kids.at(-1)
  if (!last || last.localName !== "p") {
    const emptyP = wordElement(d, "p")
    const pPr = wordElement(d, "pPr")
    pPr.appendChild(wordElement(d, "spacing", { before: 0, after: 0, line: 40, lineRule: "exact" }))
    emptyP.appendChild(pPr)
    tc.appendChild(emptyP)
  }
}

function cellWidthTwips(tc: Element, fallback: number): number {
  const tcPr = children(tc, "tcPr")[0]
  const tcW = tcPr && children(tcPr, "tcW")[0]
  if (tcW?.getAttributeNS(W, "type") === "dxa") {
    const w = Number(tcW.getAttributeNS(W, "w") ?? 0)
    if (w > 0) return w
  }
  return fallback
}

function canCloneDataTable(proto: Element, colCount: number): boolean {
  if (proto.localName !== "tbl") return false
  const rows = children(proto, "tr")
  if (!rows.length) return false
  const sample = rows.at(-1)!
  if (sample.getElementsByTagNameNS(W, "vMerge").length > 0) return false
  if (sample.getElementsByTagNameNS(W, "gridSpan").length > 0) return false
  return rows.every((r) => children(r, "tc").length === colCount)
}

function cloneDataTable(d: Document, prototype: Element, rows: string[][]): Element {
  const copy = d.importNode(prototype, true) as Element
  const examples = children(copy, "tr")
  for (const r of examples) copy.removeChild(r)
  for (const [i, values] of rows.entries()) {
    const row = d.importNode(examples[Math.min(i, examples.length - 1)], true) as Element
    const cells = children(row, "tc")
    for (const [c, cell] of cells.entries()) {
      const exampleP = cell.getElementsByTagNameNS(W, "p")[0]
      const p = exampleP
        ? cloneParagraph(d, exampleP, values[c] ?? "")
        : wordElement(d, "p")
      for (const node of children(cell)) {
        if (node.localName !== "tcPr") cell.removeChild(node)
      }
      cell.appendChild(p)
    }
    copy.appendChild(row)
  }
  return copy
}

function headingLevelFor(protoName: string, element?: Element): number | undefined {
  if (protoName === "heading_1" || protoName === "chapter") return 0
  if (protoName === "heading_2" || protoName === "section") return 1
  if (protoName === "heading_3" || protoName === "subsection") return 2
  const pPr = element && children(element, "pPr")[0]
  const lvl = pPr && children(pPr, "outlineLvl")[0]?.getAttributeNS(W, "val")
  if (lvl !== undefined && lvl !== "") {
    const n = Number(lvl)
    if (n >= 0 && n <= 2) return n
  }
  const style = pPr && children(pPr, "pStyle")[0]?.getAttributeNS(W, "val")
  if (style === "1" || style === "Heading1") return 0
  if (style === "2" || style === "Heading2") return 1
  if (style === "3" || style === "Heading3") return 2
  return undefined
}

function roleStyleFor(protoName: string, asset: TemplateAsset): FontRoleSpec {
  const dna = asset.style_dna
  if (protoName === "title") return dna.title_style
  if (protoName === "heading_1" || protoName === "chapter") return dna.heading_1_style
  if (protoName === "heading_2" || protoName === "section") return dna.heading_2_style
  if (protoName === "heading_3" || protoName === "subsection") return dna.heading_3_style
  return dna.body_style
}

async function syncRealTocPages(
  docxPath: string,
  directory: string,
  d: Document,
  files: Record<string, Uint8Array>,
  tocRefs: TocPageRef[],
  bodySectPr: Element | undefined,
) {
  if (!tocRefs.length) return
  const staging = await mkdtemp(join(directory, ".toc-sync-"))
  try {
    const pdf = await convert(docxPath, staging, "pdf")
    const { stdout: xml } = await run("pdftohtml", ["-xml", "-i", "-stdout", pdf], {
      maxBuffer: 64 * 1024 * 1024,
    })
    const pdfXml = parseXml(Buffer.from(xml))
    const compact = (s: string) => s.replace(/\s+/g, "")
    const pageTexts = Array.from(pdfXml.getElementsByTagName("page")).map((p) =>
      compact(
        Array.from(p.getElementsByTagName("text"))
          .map((t) => t.textContent ?? "")
          .join(""),
      ),
    )
    if (!pageTexts.length) return

    const firstKey = compact(tocRefs[0].text).slice(0, 16)
    let tocPageIdx = pageTexts.findIndex((t) => firstKey && t.includes(firstKey))
    if (tocPageIdx < 0) tocPageIdx = 0
    const bodyStartIdx = Math.min(pageTexts.length - 1, tocPageIdx + 1)

    const pgNumStartAttr =
      bodySectPr && children(bodySectPr, "pgNumType")[0]?.getAttributeNS(W, "start")
    const resetStart = pgNumStartAttr ? Number(pgNumStartAttr) : null

    let cursor = bodyStartIdx
    for (const ref of tocRefs) {
      const needle = compact(ref.text).slice(0, 20)
      if (!needle) continue
      let found = -1
      for (let p = cursor; p < pageTexts.length; p++) {
        if (pageTexts[p].includes(needle)) {
          found = p
          break
        }
      }
      if (found >= 0) {
        cursor = found
        const pageNum =
          resetStart !== null ? Math.max(1, resetStart + (found - bodyStartIdx)) : found + 1
        ref.pageNode.textContent = String(pageNum)
      }
    }

    files["word/document.xml"] = xmlBytes(d)
    await writeFile(docxPath, zipSync(files))
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

export async function compose(data: string, asset: TemplateAsset, input: ComposeInput) {
  Assert(ComposePlan, input.body_plan)
  const files = unzipSync(await readFile(join(data, "template_assets", asset.id, "base.docx")))
  const d = parseXml(files["word/document.xml"])
  const root = d.documentElement!
  if (input.stamp_source_coords) {
    stampSourceCoords(d, root)
  }
  const initialBlocks = bodyBlocks(root)
  const draft = input.mode === "exact_copy" ? await readDraft(data, input.draft_id ?? "") : []
  const bp = asset.blueprint
  const contentSlots = bp.content_slots
  const bodyWidth =
    asset.style_dna.page_width_twips -
    asset.style_dna.margins_twips.left -
    asset.style_dna.margins_twips.right

  const protoElements = new Map<string, Element>()
  for (const [k, coord] of Object.entries(bp.prototypes)) {
    const res = resolveCoord(root, coord)
    if (res) protoElements.set(k, res.element)
  }

  const resolvedSlots = contentSlots
    .map((slot) => {
      const st = resolveCoord(root, slot.start)
      const ed = resolveCoord(root, slot.end)
      return st && ed ? { slot, startNode: st, endNode: ed } : null
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
  if (!resolvedSlots.length) throw new Error("模板未包含有效正文槽位")

  const resolvedFields = bp.fields.map((f) => ({
    field: f,
    target: f.coord ? resolveCoord(root, f.coord) : null,
  }))

  const resolvedRemovals = (bp.remove_targets ?? []).map((rm) => ({
    rm,
    st: resolveCoord(root, rm.start),
    ed: resolveCoord(root, rm.end ?? rm.start),
  }))

  // 1. Validate explicit slot bindings (no hidden keyword guessing)
  const validSlotNames = new Set(resolvedSlots.map((s) => s.slot.name))
  const normalizedPlan: ComposePlan = []
  for (const entry of input.body_plan) {
    if (resolvedSlots.length === 1) {
      const slotName =
        entry.slot && validSlotNames.has(entry.slot) ? entry.slot : resolvedSlots[0].slot.name
      normalizedPlan.push({ ...entry, slot: slotName })
    } else {
      if (!entry.slot || !validSlotNames.has(entry.slot)) {
        throw new Error(
          `多槽位模板必须在 body_plan 中显式指定有效 slot (${[...validSlotNames].join(", ")})`,
        )
      }
      normalizedPlan.push(entry)
    }
  }

  // 2. Build DOM elements for body_plan
  let cursor = 0
  const inserted: {
    slot: string
    element: Element
    text?: string
    protoName: string
  }[] = []

  for (const entry of normalizedPlan) {
    const slotName = entry.slot!
    const slotTarget = resolvedSlots.find((s) => s.slot.name === slotName)!
    const containerW =
      slotTarget.startNode.kind === "cell"
        ? cellWidthTwips(slotTarget.startNode.element, bodyWidth)
        : slotTarget.startNode.element.parentNode &&
            (slotTarget.startNode.element.parentNode as Element).localName === "tc"
          ? cellWidthTwips(slotTarget.startNode.element.parentNode as Element, bodyWidth)
          : bodyWidth

    if (entry.rows) {
      if (input.mode === "exact_copy") throw new Error("exact_copy 模式不支持凭空生成表格")
      const tblProto = protoElements.get(entry.prototype) ?? protoElements.get("table")
      const colCount = Math.max(1, ...entry.rows.map((r) => r.length))
      const tblEl =
        tblProto && canCloneDataTable(tblProto, colCount)
          ? cloneDataTable(d, tblProto, entry.rows)
          : buildThreeLineTable(d, entry.rows, containerW, asset.style_dna.body_style)
      inserted.push({ slot: slotName, element: tblEl, protoName: entry.prototype })
      continue
    }

    let texts: string[]
    if (input.mode === "exact_copy") {
      const range = /^P(\d+)(?:-P(\d+))?$/.exec(entry.range ?? "")
      if (!range || Number(range[1]) !== cursor || entry.text !== undefined) {
        throw new Error("段落映射必须连续完整")
      }
      const end = Number(range[2] ?? range[1])
      if (end >= draft.length || end < cursor) throw new Error("段落区间越界")
      texts = draft.slice(cursor, end + 1)
      cursor = end + 1
    } else {
      if (entry.text === undefined) throw new Error("起草段落缺少正文")
      texts = [entry.text]
    }

    const protoEl = protoElements.get(entry.prototype) ?? protoElements.get("body")
    const outLvl = headingLevelFor(entry.prototype, protoEl)
    for (const original of texts) {
      const text = input.normalize_punctuation
        ? original.replace(/[\[［](\d{4})[\]］]/g, "〔$1〕")
        : original
      const el =
        protoEl && protoEl.localName === "p"
          ? cloneParagraph(d, protoEl, text, entry.emphasis, outLvl)
          : synthesizeParagraph(
              d,
              text,
              roleStyleFor(entry.prototype, asset),
              outLvl,
              entry.emphasis,
            )
      inserted.push({ slot: slotName, element: el, text, protoName: entry.prototype })
    }
  }
  if (input.mode === "exact_copy" && cursor !== draft.length) {
    throw new Error("段落映射遗漏草稿内容")
  }

  // 3. Execute remove_targets strictly on declared ranges
  let removedSections = 0
  const slotProtectedSet = new Set<Element>()
  for (const rs of resolvedSlots) {
    slotProtectedSet.add(rs.startNode.element)
    slotProtectedSet.add(rs.endNode.element)
  }
  for (const rf of resolvedFields) {
    if (rf.target) slotProtectedSet.add(rf.target.element)
  }

  for (const { rm, st, ed } of resolvedRemovals) {
    if (!st) continue
    if (rm.match && st.element.localName === "p") {
      replaceCrossRunSubstring(d, st.element, rm.match, "")
      if (rm.drop_page_break) stripExplicitPageBreaks(st.element)
      for (const m of st.mirrors) {
        replaceCrossRunSubstring(d, m, rm.match, "")
        if (rm.drop_page_break) stripExplicitPageBreaks(m)
      }
      continue
    }
    if (rm.drop_page_break) {
      if (st.kind === "block" && ed?.kind === "block") {
        const sIdx = initialBlocks.indexOf(st.element)
        const eIdx = initialBlocks.indexOf(ed.element)
        if (sIdx >= 0 && eIdx >= sIdx) {
          for (const blk of initialBlocks.slice(sIdx, eIdx + 1)) {
            stripExplicitPageBreaks(blk)
          }
        }
      } else {
        stripExplicitPageBreaks(st.element)
      }
      continue
    }
    if (st.kind === "textbox") {
      st.element.parentNode?.removeChild(st.element)
      continue
    }
    if (
      st.kind === "row" &&
      ed?.kind === "row" &&
      st.element.parentNode === ed.element.parentNode
    ) {
      const tbl = st.element.parentNode as Element
      const initialRows = children(tbl, "tr")
      const sIdx = initialRows.indexOf(st.element)
      const eIdx = initialRows.indexOf(ed.element)
      if (sIdx >= 0 && eIdx >= sIdx) {
        for (const tr of initialRows.slice(sIdx, eIdx + 1)) {
          if (slotProtectedSet.has(tr)) continue
          removeTableRowSafely(d, tbl, tr)
        }
      }
      continue
    }
    if (rm.only_textboxes && st.kind === "block" && ed?.kind === "block") {
      const sIdx = initialBlocks.indexOf(st.element)
      const eIdx = initialBlocks.indexOf(ed.element)
      if (sIdx >= 0 && eIdx >= sIdx) {
        for (const blk of initialBlocks.slice(sIdx, eIdx + 1)) {
          for (const tg of logicalTextboxes(blk)) {
            tg.host.parentNode?.removeChild(tg.host)
          }
        }
      }
      continue
    }
    if (st.kind === "block" && ed?.kind === "block") {
      const sIdx = initialBlocks.indexOf(st.element)
      const eIdx = initialBlocks.indexOf(ed.element)
      if (sIdx >= 0 && eIdx >= sIdx) {
        for (const blk of initialBlocks.slice(sIdx, eIdx + 1)) {
          if (slotProtectedSet.has(blk)) continue
          removedSections += clearOrRemoveBlock(blk, Boolean(rm.drop_section))
        }
      }
      continue
    }
    if (
      st.kind === "para" &&
      ed?.kind === "para" &&
      st.element.parentNode === ed.element.parentNode
    ) {
      const parent = st.element.parentNode as Element
      const siblings = children(parent, "p")
      const sIdx = siblings.indexOf(st.element)
      const eIdx = siblings.indexOf(ed.element)
      if (sIdx >= 0 && eIdx >= sIdx) {
        for (const p of siblings.slice(sIdx, eIdx + 1)) {
          if (slotProtectedSet.has(p)) continue
          if (parent.localName === "tc" && children(parent, "p").length <= 1) {
            for (const c of Array.from(p.childNodes)) {
              if ((c as Element).localName !== "pPr") p.removeChild(c)
            }
          } else {
            clearOrRemoveBlock(p, false)
          }
        }
      }
    }
  }

  // 4. Fill metadata FieldSlots
  const slotVals = input.slot_values ?? {}
  const paraEditGroups = new Map<
    Element,
    { mirrors: Element[]; edits: { field: FieldSlot; value: string }[] }
  >()
  for (const { field, target } of resolvedFields) {
    const val = slotVals[field.name]
    if (val === undefined || !target) continue
    if (target.kind === "cell") {
      const tc = target.element
      const sampleP = children(tc, "p")[0]
      const cleanVal = stripLeadingFieldLabel(val, field.label)
      const newP = sampleP
        ? cloneParagraph(d, sampleP, cleanVal)
        : synthesizeParagraph(d, cleanVal, asset.style_dna.body_style)
      for (const node of children(tc)) {
        if (node.localName !== "tcPr") tc.removeChild(node)
      }
      tc.appendChild(newP)
    } else if (target.element.localName === "p") {
      const group = paraEditGroups.get(target.element) ?? {
        mirrors: target.mirrors,
        edits: [],
      }
      group.edits.push({ field, value: val })
      paraEditGroups.set(target.element, group)
    }
  }
  for (const [pEl, group] of paraEditGroups.entries()) {
    applyParagraphFieldEdits(d, pEl, group.edits)
    for (const mirrorP of group.mirrors) {
      applyParagraphFieldEdits(d, mirrorP, group.edits)
    }
  }

  // 5. Inject content into content_slots
  for (const { slot, startNode, endNode } of resolvedSlots) {
    const items = inserted.filter((i) => i.slot === slot.name).map((i) => i.element)
    const placement = slot.placement ?? "replace"
    if (!items.length && placement === "insert_after") continue

    if (startNode.kind === "cell") {
      const tc = startNode.element
      if (placement === "replace") {
        for (const node of children(tc)) {
          if (node.localName !== "tcPr") tc.removeChild(node)
        }
      }
      for (const item of items) tc.appendChild(item)
      ensureCellEndsWithParagraph(d, tc)
      continue
    }

    const firstEl = startNode.element
    const lastEl = endNode.element
    const parent = firstEl.parentNode as Element | null
    if (!parent) continue

    if (placement === "insert_after") {
      const ref = lastEl.nextSibling
      for (const item of items) parent.insertBefore(item, ref)
      continue
    }

    const siblings = children(parent).filter(
      (n) => n.localName === "p" || n.localName === "tbl",
    )
    const sIdx = siblings.indexOf(firstEl)
    const eIdx = siblings.indexOf(lastEl)
    if (sIdx < 0 || eIdx < sIdx) continue
    for (const item of items) parent.insertBefore(item, firstEl)

    for (const old of siblings.slice(sIdx, eIdx + 1)) {
      const hasGraphic =
        sIdx === eIdx &&
        ["drawing", "pict"].some((tag) => old.getElementsByTagNameNS(W, tag).length > 0) &&
        old.getElementsByTagNameNS(W, "txbxContent").length === 0
      if (!hasGraphic) {
        clearOrRemoveBlock(old, false)
      }
    }
    if (parent.localName === "tc") ensureCellEndsWithParagraph(d, parent)
  }

  // 6. Optional Cover Builder & Native TOC Builder / Refresher
  const allHeadings = inserted
    .filter((i) => i.text)
    .flatMap((i) => {
      const lvl = headingLevelFor(i.protoName, i.element)
      return lvl !== undefined ? [{ level: lvl + 1, text: i.text!.trim() }] : []
    })

  const bodyEl = root.getElementsByTagNameNS(W, "body")[0]
  let addedSections = 0
  const wantCover = input.generate_cover ?? bp.cover_builder?.enabled ?? false
  const existingTocSdts = findTocSdts(root)
  const wantGenerateToc =
    input.generate_toc === true
      ? existingTocSdts.length === 0
      : input.generate_toc === false
        ? false
        : bp.toc?.mode === "generate" && existingTocSdts.length === 0

  const tocRefs: TocPageRef[] = []
  if (existingTocSdts.length > 0 && bp.toc?.mode !== "none") {
    tocRefs.push(...refreshExistingToc(d, existingTocSdts, allHeadings, bodyWidth))
  }

  const frontNodes: Element[] = []
  if (wantCover) {
    const coverSpec = input.cover_subtitle
      ? { ...(bp.cover_builder ?? { enabled: true }), subtitle: input.cover_subtitle }
      : bp.cover_builder
    frontNodes.push(
      ...buildCoverSectionNodes(
        d,
        asset.style_dna,
        coverSpec,
        slotVals,
        inserted[0]?.text,
      ),
    )
    addedSections++
  }
  if (wantGenerateToc) {
    const builtToc = buildTocSectionNodes(d, asset.style_dna, allHeadings)
    frontNodes.push(...builtToc.nodes)
    tocRefs.push(...builtToc.pageRefs)
    addedSections++
  }
  const bodySectPr = children(bodyEl, "sectPr")[0]
  if (frontNodes.length > 0) {
    const firstBodyChild = bodyEl.firstChild
    for (const node of frontNodes) bodyEl.insertBefore(node, firstBodyChild)
    if (bodySectPr) resetBodyPageNumberStart(bodySectPr, d)
  }

  // 7. Apply optional document grid
  if (bp.grid) {
    const bodyProto = protoElements.get("body")
    const runSz = bodyProto
      ? children(bodyProto, "r")
          .map((r) => children(children(r, "rPr")[0], "sz")[0]?.getAttributeNS(W, "val"))
          .find(Boolean)
      : undefined
    const pSz = bodyProto
      ? children(children(children(bodyProto, "pPr")[0], "rPr")[0], "sz")[0]?.getAttributeNS(
          W,
          "val",
        )
      : undefined
    const fontPt = Number(runSz ?? pSz ?? 0) / 2 || asset.style_dna.body_style.size_pt || 12
    const gridLines = bp.grid.lines
    const gridChars = bp.grid.characters
    for (const section of Array.from(d.getElementsByTagNameNS(W, "sectPr"))) {
      const paper = children(section, "pgSz")[0]
      const margins = children(section, "pgMar")[0]
      const dimension = (e: Element | undefined, key: string, fb: number) =>
        Number(e?.getAttributeNS(W, key) ?? fb)
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
      grid.setAttributeNS(W, "w:linePitch", String(Math.round(height / gridLines)))
      grid.setAttributeNS(
        W,
        "w:charSpace",
        String(Math.round((width / (gridChars * 20) - fontPt) * 4096)),
      )
      if (!current) insertInSchemaOrder(section, grid, SECTPR_ORDER)
    }
  }

  // 8. Record document-wide paragraph indices for zero-copy audit
  const allPlacedParas = Array.from(root.getElementsByTagNameNS(W, "p"))
  const orderedTextItems = inserted.filter((i) => i.text !== undefined)
  const paraIndices = orderedTextItems.map((i) => allPlacedParas.indexOf(i.element))

  const doc_id = randomUUID()
  const directory = join(data, "documents", doc_id)
  await mkdir(directory, { recursive: true })
  files["word/document.xml"] = xmlBytes(d)
  const docx_path = join(directory, "document.docx")
  await writeFile(docx_path, zipSync(files))

  // 9. Populate real rendered page numbers in TOC if TOC exists
  if (tocRefs.length > 0) {
    await syncRealTocPages(docx_path, directory, d, files, tocRefs, bodySectPr)
  }

  return {
    doc_id,
    docx_path,
    docx_url: "/files/documents/" + doc_id + "/document.docx",
    body_plan: normalizedPlan,
    body_indices: paraIndices,
    removed_sections: removedSections,
    added_sections: addedSections,
  }
}

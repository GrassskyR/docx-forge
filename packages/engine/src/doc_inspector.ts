import { randomUUID } from "node:crypto"
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { Element } from "@xmldom/xmldom"
import type { DocumentMap, FontRoleSpec, StyleDNA } from "@docs-agent/shared"
import { unzipSync } from "fflate"
import { toDocx } from "./doc_converter.js"
import {
  analyzeParagraphBlanks,
  bodyBlocks,
  coalesceRuns,
  findTocSdts,
  logicalTextboxes,
  nonTocSdtParas,
  paraPlainText,
} from "./dom_locator.js"
import { attr, child, paragraphFormats, toFontRoleSpec } from "./paragraph_format.js"
import { R_NS, W, children, parseXml } from "./xml_utils.js"

const DEFAULT_BODY: FontRoleSpec = {
  font_cn: "宋体",
  font_en: "Times New Roman",
  size_pt: 12,
  bold: false,
  alignment: "both",
  line_twips: 360,
  line_rule: "auto",
  first_line_twips: 0,
}

const DEFAULT_TITLE: FontRoleSpec = {
  font_cn: "黑体",
  font_en: "Times New Roman",
  size_pt: 20,
  bold: true,
  alignment: "center",
  line_twips: 360,
  line_rule: "auto",
  first_line_twips: 0,
}

const DEFAULT_H1: FontRoleSpec = {
  font_cn: "黑体",
  font_en: "Times New Roman",
  size_pt: 15,
  bold: true,
  alignment: "left",
  line_twips: 360,
  line_rule: "auto",
  first_line_twips: 0,
}

const DEFAULT_H2: FontRoleSpec = {
  font_cn: "黑体",
  font_en: "Times New Roman",
  size_pt: 14,
  bold: true,
  alignment: "left",
  line_twips: 360,
  line_rule: "auto",
  first_line_twips: 0,
}

const DEFAULT_H3: FontRoleSpec = {
  font_cn: "宋体",
  font_en: "Times New Roman",
  size_pt: 12,
  bold: true,
  alignment: "left",
  line_twips: 360,
  line_rule: "auto",
  first_line_twips: 0,
}

function normSpace(s: string) {
  return s.replace(/\s+/g, " ").trim()
}

function extractStyleDNA(files: Record<string, Uint8Array>, root: Element): StyleDNA {
  const stylesXml = files["word/styles.xml"]
    ? parseXml(files["word/styles.xml"]).documentElement!
    : undefined
  const records = paragraphFormats(root, stylesXml)
  const nonTable = records.filter((r) => !r.table)

  const bodyCandidates = nonTable.filter((r) => r.outline_lvl === null)
  const bodyPick =
    bodyCandidates.sort((a, b) => b.text.length - a.text.length)[0]?.values ??
    records.sort((a, b) => b.text.length - a.text.length)[0]?.values
  const body_style = toFontRoleSpec(bodyPick, DEFAULT_BODY)

  const h1Pick = nonTable.find(
    (r) => r.outline_lvl === 0 || r.style === "1" || /^Heading\s*1$/i.test(r.style),
  )?.values
  const h2Pick = nonTable.find(
    (r) => r.outline_lvl === 1 || r.style === "2" || /^Heading\s*2$/i.test(r.style),
  )?.values
  const h3Pick = nonTable.find(
    (r) => r.outline_lvl === 2 || r.style === "3" || /^Heading\s*3$/i.test(r.style),
  )?.values
  const titlePick = records.find(
    (r) =>
      /^Title$/i.test(r.style) ||
      (r.values.alignment === "center" && (r.values.size_pt ?? 0) > body_style.size_pt),
  )?.values

  const allSectPr = Array.from(root.getElementsByTagNameNS(W, "sectPr"))
  const bodySectPr = allSectPr.at(-1)
  const pgSz = child(bodySectPr, "pgSz")
  const pgMar = child(bodySectPr, "pgMar")
  const dim = (el: Element | undefined, k: string, fb: number) =>
    Number(attr(el, k) ?? fb)

  const header_refs: { type: string; rId: string }[] = []
  const footer_refs: { type: string; rId: string }[] = []
  if (bodySectPr) {
    for (const hr of children(bodySectPr, "headerReference")) {
      const rId = hr.getAttributeNS(R_NS, "id")
      if (rId) header_refs.push({ type: attr(hr, "type") ?? "default", rId })
    }
    for (const fr of children(bodySectPr, "footerReference")) {
      const rId = fr.getAttributeNS(R_NS, "id")
      if (rId) footer_refs.push({ type: attr(fr, "type") ?? "default", rId })
    }
  }

  let has_header_logo = false
  const header_texts: string[] = []
  const footer_texts: string[] = []
  for (const [k, bytes] of Object.entries(files)) {
    if (/^word\/header\d+\.xml$/.test(k)) {
      const hRoot = parseXml(bytes).documentElement!
      const txt = normSpace(hRoot.textContent ?? "")
      if (txt) header_texts.push(txt)
      if (
        hRoot.getElementsByTagNameNS(W, "drawing").length > 0 ||
        hRoot.getElementsByTagNameNS(W, "pict").length > 0
      ) {
        has_header_logo = true
      }
    } else if (/^word\/footer\d+\.xml$/.test(k)) {
      const fRoot = parseXml(bytes).documentElement!
      const txt = normSpace(fRoot.textContent ?? "")
      if (txt) footer_texts.push(txt)
    }
  }

  const has_existing_toc = findTocSdts(root).length > 0
  const media_count = Object.keys(files).filter((k) => /^word\/media\/[^/]+$/.test(k)).length

  return {
    page_width_twips: dim(pgSz, "w", 11906),
    page_height_twips: dim(pgSz, "h", 16838),
    margins_twips: {
      top: dim(pgMar, "top", 1440),
      bottom: dim(pgMar, "bottom", 1440),
      left: dim(pgMar, "left", 1800),
      right: dim(pgMar, "right", 1800),
      header: dim(pgMar, "header", 850),
      footer: dim(pgMar, "footer", 992),
    },
    has_header_logo,
    header_texts,
    footer_texts,
    header_refs,
    footer_refs,
    media_count,
    has_existing_toc,
    title_style: toFontRoleSpec(titlePick, DEFAULT_TITLE),
    heading_1_style: toFontRoleSpec(h1Pick, DEFAULT_H1),
    heading_2_style: toFontRoleSpec(h2Pick, DEFAULT_H2),
    heading_3_style: toFontRoleSpec(h3Pick, DEFAULT_H3),
    body_style,
  }
}

function describeParaLine(coord: string, p: Element): {
  line: string
  plainBodySig: string | null
  nonEmpty: boolean
} {
  const pPr = child(p, "pPr")
  const hasSect = Boolean(pPr && children(pPr, "sectPr").length)
  const hasPageBr = Array.from(p.getElementsByTagNameNS(W, "br")).some(
    (b) => attr(b, "type") === "page",
  )
  const hasGraphic =
    p.getElementsByTagNameNS(W, "drawing").length > 0 ||
    p.getElementsByTagNameNS(W, "pict").length > 0
  const txGroups = logicalTextboxes(p)
  const blanks = analyzeParagraphBlanks(p)
  const rawText = normSpace(paraPlainText(p))
  const style = attr(child(pPr, "pStyle")) ?? ""
  const outLvl = attr(child(pPr, "outlineLvl"))
  const jc = attr(child(pPr, "jc"))

  let maxSz = 0
  const colors = new Set<string>()
  for (const r of children(p, "r")) {
    const rPr = child(r, "rPr")
    const sz = Number(attr(child(rPr, "sz")) ?? 0)
    if (sz > maxSz) maxSz = sz
    const c = attr(child(rPr, "color"))?.toUpperCase()
    if (c && !["000000", "AUTO"].includes(c)) colors.add(c)
  }

  const tags: string[] = []
  if (hasSect) tags.push("SECT_BREAK")
  if (hasPageBr) tags.push("PAGE_BREAK")
  if (hasGraphic && !txGroups.length) tags.push("GRAPHIC")
  if (style && style !== "Normal" && style !== "a") tags.push("st=" + style)
  if (outLvl !== undefined) tags.push("lvl=" + outLvl)
  if (jc === "center" || jc === "right") tags.push("jc=" + jc)
  if (maxSz >= 28) tags.push(maxSz / 2 + "pt")
  if (colors.size) tags.push("color=" + [...colors].join(","))

  let contentRepr = JSON.stringify(rawText.slice(0, 240))
  if (blanks.length > 0) {
    const runs = children(p, "r")
    const blankStartMap = new Map<number, (typeof blanks)[number]>()
    const inBlank = new Set<number>()
    for (const b of blanks) {
      blankStartMap.set(b.runIndices[0], b)
      for (const ri of b.runIndices) inBlank.add(ri)
    }
    const parts: string[] = []
    let buf = ""
    for (let ri = 0; ri < runs.length; ri++) {
      const b = blankStartMap.get(ri)
      if (b) {
        const prefix = buf + b.keepPrefix
        if (prefix.trim()) parts.push(JSON.stringify(normSpace(prefix)))
        buf = ""
        const cur = b.currentText ? `,原值=${JSON.stringify(b.currentText.slice(0, 24))}` : ""
        parts.push(`[空${b.index}:${b.kind},宽${b.visualWidth}${cur}]`)
        if (b.keepSuffix.trim()) buf += b.keepSuffix
      } else if (!inBlank.has(ri)) {
        const t = Array.from(runs[ri].getElementsByTagNameNS(W, "t"))
          .map((x) => x.textContent ?? "")
          .join("")
        buf += t
      }
    }
    if (buf.trim()) parts.push(JSON.stringify(normSpace(buf)))
    contentRepr = parts.join(" ")
  }

  const txLines: string[] = []
  for (const [ti, tg] of txGroups.entries()) {
    const txPs = children(tg.contents[0], "p")
    const txSummary = txPs
      .map((tp, pi) => {
        const tb = analyzeParagraphBlanks(tp)
        const tt = normSpace(paraPlainText(tp))
        if (!tt && !tb.length) return ""
        const bInfo = tb.length ? ` [含${tb.length}个空]` : ""
        return `P${pi}:${JSON.stringify(tt.slice(0, 120))}${bInfo}`
      })
      .filter(Boolean)
      .join(" ; ")
    if (txSummary) txLines.push(`  ${coord}.TX${ti} [文本框]: ${txSummary}`)
  }

  const nonEmpty =
    rawText.length > 0 ||
    hasSect ||
    hasPageBr ||
    hasGraphic ||
    txLines.length > 0 ||
    blanks.length > 0

  const isPlainBody =
    rawText.length >= 20 &&
    !hasSect &&
    !hasPageBr &&
    !hasGraphic &&
    !txLines.length &&
    !blanks.length &&
    !colors.size &&
    outLvl === undefined &&
    jc !== "center" &&
    jc !== "right" &&
    maxSz < 28

  const tagStr = tags.length ? ` [${tags.join(",")}]` : ""
  const baseLine = `${coord}${tagStr}: ${contentRepr}`
  const fullLine = txLines.length ? baseLine + "\n" + txLines.join("\n") : baseLine
  return {
    line: fullLine,
    plainBodySig: isPlainBody ? `${style}|${maxSz}` : null,
    nonEmpty,
  }
}

function tableGridSig(tbl: Element): string {
  const grid = child(tbl, "tblGrid")
  const cols = grid ? children(grid, "gridCol").map((c) => attr(c, "w") ?? "").join(",") : ""
  const rows = children(tbl, "tr").length
  return `${rows}x[${cols}]`
}

function describeTable(coord: string, tbl: Element): string {
  const grid = child(tbl, "tblGrid")
  const gridCols = grid ? children(grid, "gridCol").length : 0
  const rows = children(tbl, "tr")
  const out: string[] = [`${coord} [表格 ${rows.length}行 × 网格${gridCols}列]:`]

  const rowSigs = rows.map((tr) => {
    const tcs = children(tr, "tc")
    const empty = tcs.every((tc) => normSpace(tc.textContent ?? "") === "")
    const trH = Number(attr(child(children(tr, "trPr")[0], "trHeight")) ?? 0)
    return `${tcs.length}:${trH}:${empty ? "E" : "F"}`
  })

  let r = 0
  while (r < rows.length) {
    if (r >= 1 && r < rows.length - 1 && rowSigs[r].endsWith(":E")) {
      let end = r
      while (end + 1 < rows.length - 1 && rowSigs[end + 1] === rowSigs[r]) end++
      if (end - r >= 3) {
        out.push(`  R${r}..R${end}: [连续 ${end - r + 1} 行同构空白行]`)
        r = end + 1
        continue
      }
    }
    const tr = rows[r]
    const trPr = child(tr, "trPr")
    const trH = Number(attr(child(trPr, "trHeight")) ?? 0)
    const tcs = children(tr, "tc")
    const cellParts: string[] = []
    const multiParaDetails: string[] = []

    for (let c = 0; c < tcs.length; c++) {
      const tc = tcs[c]
      const tcPr = child(tc, "tcPr")
      const span = attr(child(tcPr, "gridSpan"))
      const vMNode = child(tcPr, "vMerge")
      const vM = vMNode ? (attr(vMNode) ?? "cont") : ""
      const nestedTbl = children(tc, "tbl").length
      const ps = children(tc, "p")
      const flags: string[] = []
      if (span && Number(span) > 1) flags.push(`span=${span}`)
      if (vM) flags.push(`vM=${vM}`)
      if (trH > 0) flags.push(`h=${trH}`)
      if (nestedTbl) flags.push(`内嵌表=${nestedTbl}`)
      const fStr = flags.length ? `[${flags.join(",")}]` : ""

      if (ps.length <= 1) {
        const p0 = ps[0]
        const blanks = p0 ? analyzeParagraphBlanks(p0) : []
        if (blanks.length > 0 && p0) {
          const d = describeParaLine(`${coord}.R${r}.C${c}.P0`, p0)
          cellParts.push(`C${c}${fStr}=${d.line.split(": ").slice(1).join(": ")}`)
        } else {
          const txt = p0 ? normSpace(paraPlainText(p0)) : ""
          cellParts.push(`C${c}${fStr}=${JSON.stringify(txt.slice(0, 180))}`)
        }
      } else {
        const nonEmptyPs = ps
          .map((p, pi) => ({ p, pi, d: describeParaLine(`${coord}.R${r}.C${c}.P${pi}`, p) }))
          .filter((x) => x.d.nonEmpty)
        cellParts.push(`C${c}${fStr}(共${ps.length}段,非空${nonEmptyPs.length}段)`)
        const showPs =
          nonEmptyPs.length <= 24
            ? nonEmptyPs
            : [...nonEmptyPs.slice(0, 12), ...nonEmptyPs.slice(-2)]
        for (const [si, item] of showPs.entries()) {
          if (nonEmptyPs.length > 24 && si === 12) {
            multiParaDetails.push(
              `      ... [格内同构段落省略 ${nonEmptyPs.length - 14} 段，总末段为 P${ps.length - 1}] ...`,
            )
          }
          multiParaDetails.push("    " + item.d.line)
        }
      }
    }
    out.push(`  ${coord}.R${r}: ${cellParts.join(" | ")}`)
    for (const mp of multiParaDetails) out.push(mp)
    r++
  }
  return out.join("\n")
}

function buildSectionRanges(blocks: Element[]): { start: number; end: number; hasBreak: boolean }[] {
  if (!blocks.length) return []
  const ranges: { start: number; end: number; hasBreak: boolean }[] = []
  let start = 0
  for (let i = 0; i < blocks.length; i++) {
    const pPr = blocks[i].localName === "p" ? child(blocks[i], "pPr") : undefined
    const hasBreak = Boolean(pPr && children(pPr, "sectPr").length > 0)
    if (hasBreak) {
      ranges.push({ start, end: i, hasBreak: true })
      start = i + 1
    }
  }
  if (start < blocks.length) {
    ranges.push({ start, end: blocks.length - 1, hasBreak: false })
  }
  return ranges
}

function buildFullMapText(root: Element, dna: StyleDNA, blocks: Element[]): string {
  const lines: string[] = []
  const allSectCount = root.getElementsByTagNameNS(W, "sectPr").length
  lines.push(
    `[文档概览] 顶层块=${blocks.length} (B0..B${Math.max(0, blocks.length - 1)}), ` +
      `分节sectPr=${allSectCount}, 媒体/图片=${dna.media_count}, ` +
      `页眉Logo=${dna.has_header_logo}, 已有目录TOC=${dna.has_existing_toc}`,
  )
  if (dna.header_texts.length) {
    lines.push(`[页眉文本] ${dna.header_texts.join(" | ").slice(0, 140)}`)
  }
  if (dna.footer_texts.length) {
    lines.push(`[页脚文本] ${dna.footer_texts.join(" | ").slice(0, 140)}`)
  }

  const sdtGroups = nonTocSdtParas(root)
  for (const [di, ps] of sdtGroups.entries()) {
    if (!ps.length) continue
    lines.push(`[顶层内容控件 D${di} (共${ps.length}段, D${di}.P0..D${di}.P${ps.length - 1})]:`)
    for (const [pi, p] of ps.entries()) {
      const d = describeParaLine(`D${di}.P${pi}`, p)
      if (d.nonEmpty) lines.push("  " + d.line)
    }
  }

  const body = root.getElementsByTagNameNS(W, "body")[0]
  const bodyKids = children(body)
  const tocBeforeBlock = new Set<number>()
  let bCounter = 0
  const tocList = findTocSdts(root)
  for (const node of bodyKids) {
    if (node.localName === "sdt" && tocList.includes(node)) {
      tocBeforeBlock.add(bCounter)
    }
    if (node.localName === "p" || node.localName === "tbl") bCounter++
  }

  const sectionRanges = buildSectionRanges(blocks)
  for (const [secIdx, sec] of sectionRanges.entries()) {
    if (sectionRanges.length > 1) {
      const brkNote = sec.hasBreak ? `, 尾分节符位于 B${sec.end}` : ", 文档末节"
      lines.push(`=== 第 ${secIdx + 1} 节 (Section ${secIdx}: B${sec.start}..B${sec.end}${brkNote}) ===`)
    }

    let i = sec.start
    while (i <= sec.end) {
      if (tocBeforeBlock.has(i)) {
        lines.push(`[自动目录控件 <w:sdt TOC> 位于 B${i} 之前]`)
      }
      const blk = blocks[i]

      if (blk.localName === "tbl") {
        const sig = tableGridSig(blk)
        let tEnd = i
        while (
          tEnd + 1 <= sec.end &&
          blocks[tEnd + 1].localName === "tbl" &&
          tableGridSig(blocks[tEnd + 1]) === sig &&
          !tocBeforeBlock.has(tEnd + 1)
        ) {
          tEnd++
        }
        if (tEnd - i >= 4) {
          lines.push(describeTable(`B${i}`, blocks[i]))
          lines.push(describeTable(`B${i + 1}`, blocks[i + 1]))
          lines.push(`  ... [B${i + 2}..B${tEnd - 1}: 连续同规格表格 ${tEnd - i - 2} 张 (${sig})] ...`)
          lines.push(describeTable(`B${tEnd}`, blocks[tEnd]))
          i = tEnd + 1
          continue
        }
        lines.push(describeTable(`B${i}`, blk))
        i++
        continue
      }

      const desc = describeParaLine(`B${i}`, blk)
      if (!desc.nonEmpty) {
        let eEnd = i
        while (eEnd + 1 <= sec.end && blocks[eEnd + 1].localName === "p" && !tocBeforeBlock.has(eEnd + 1)) {
          const nd = describeParaLine(`B${eEnd + 1}`, blocks[eEnd + 1])
          if (nd.nonEmpty) break
          eEnd++
        }
        if (eEnd === i) lines.push(`B${i}: "" [空白段]`)
        else lines.push(`B${i}..B${eEnd}: "" [连续 ${eEnd - i + 1} 个空白段]`)
        i = eEnd + 1
        continue
      }

      if (desc.plainBodySig) {
        let pEnd = i
        while (pEnd + 1 <= sec.end && blocks[pEnd + 1].localName === "p" && !tocBeforeBlock.has(pEnd + 1)) {
          const nd = describeParaLine(`B${pEnd + 1}`, blocks[pEnd + 1])
          if (nd.plainBodySig !== desc.plainBodySig) break
          pEnd++
        }
        if (pEnd - i + 1 >= 8) {
          lines.push(describeParaLine(`B${i}`, blocks[i]).line)
          lines.push(describeParaLine(`B${i + 1}`, blocks[i + 1]).line)
          lines.push(
            `  ... [B${i + 2}..B${pEnd - 2}: 同样式连续正文段 ${pEnd - i - 3} 段] ...`,
          )
          lines.push(describeParaLine(`B${pEnd - 1}`, blocks[pEnd - 1]).line)
          lines.push(describeParaLine(`B${pEnd}`, blocks[pEnd]).line)
          i = pEnd + 1
          continue
        }
      }

      lines.push(desc.line)
      i++
    }
  }
  if (tocBeforeBlock.has(blocks.length)) {
    lines.push(`[自动目录控件 <w:sdt TOC> 位于 B${blocks.length} 之前]`)
  }
  return lines.join("\n")
}

export async function inspectReference(source: string, data: string) {
  const inspect_id = randomUUID()
  const directory = join(data, "inspections", inspect_id)
  await mkdir(directory, { recursive: true })
  try {
    const path = join(directory, "base.docx")
    const converted = await toDocx(source, directory)
    if (converted !== path) await copyFile(converted, path)
    const files = unzipSync(await readFile(path))
    const root = parseXml(files["word/document.xml"]).documentElement!
    coalesceRuns(root)
    const all = (tag: string) => Array.from(root.getElementsByTagNameNS(W, tag))
    const blocks = bodyBlocks(root)
    const style_dna = extractStyleDNA(files, root)

    const allNonEmptyP = all("p").filter((p) => normSpace(p.textContent ?? "").length > 0)
    const txbxNodes = all("txbxContent")
    const txbxParas = new Set<Element>()
    for (const tx of txbxNodes) {
      for (const p of Array.from(tx.getElementsByTagNameNS(W, "p"))) txbxParas.add(p)
    }
    let tblParaCount = 0
    for (const tbl of all("tbl")) {
      for (const p of Array.from(tbl.getElementsByTagNameNS(W, "p"))) {
        if (!txbxParas.has(p) && normSpace(p.textContent ?? "").length > 0) tblParaCount++
      }
    }
    const table_ratio = Number((tblParaCount / Math.max(1, allNonEmptyP.length)).toFixed(2))

    const preserved: string[] = []
    if (style_dna.media_count) preserved.push("嵌入媒体资源")
    if (style_dna.header_refs.length) preserved.push("页眉")
    if (style_dna.footer_refs.length) preserved.push("页脚")
    if (all("docGrid").length) preserved.push("文档网格")
    if (all("pict").length || all("drawing").length) preserved.push("版式图形")
    if (all("sectPr").length > 1) preserved.push("多节版式")

    const page_breaks = all("br").filter((b) => attr(b, "type") === "page").length
    const map_text = buildFullMapText(root, style_dna, blocks)

    const doc_map: DocumentMap = {
      paragraphs: allNonEmptyP.length,
      tables: all("tbl").length,
      sections: all("sectPr").length,
      page_breaks,
      textboxes: txbxNodes.length,
      media: style_dna.media_count,
      table_ratio,
      preserved,
      style_dna,
      map_text,
    }
    await writeFile(join(directory, "doc_map.json"), JSON.stringify(doc_map, null, 2))
    return { inspect_id, doc_map }
  } catch (e) {
    await rm(directory, { recursive: true, force: true })
    throw e
  }
}

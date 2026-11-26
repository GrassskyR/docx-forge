import type { Document, Element } from "@xmldom/xmldom"
import { strToU8, zipSync } from "fflate"
import type { CoverBuilderSpec, CoverFieldDef, FontRoleSpec, StyleDNA } from "@docs-agent/shared"
import {
  PPR_ORDER,
  SECTPR_ORDER,
  W,
  children,
  insertInSchemaOrder,
  wordElement,
} from "./xml_utils.js"

const XML_SPACE_NS = "http://www.w3.org/XML/1998/namespace"

export interface TocPageRef {
  text: string
  pageNode: Element
}

export function makeStyledRun(
  d: Document,
  text: string,
  spec: {
    font_cn: string
    font_en: string
    size_pt: number
    bold?: boolean
    italic?: boolean
    underline?: boolean
    color_hex?: string
  },
) {
  const r = wordElement(d, "r")
  const rPr = wordElement(d, "rPr")
  rPr.appendChild(
    wordElement(d, "rFonts", {
      ascii: spec.font_en,
      hAnsi: spec.font_en,
      eastAsia: spec.font_cn,
      cs: spec.font_en,
    }),
  )
  if (spec.bold) rPr.appendChild(wordElement(d, "b", { val: "1" }))
  if (spec.italic) rPr.appendChild(wordElement(d, "i", { val: "1" }))
  if (spec.color_hex) rPr.appendChild(wordElement(d, "color", { val: spec.color_hex }))
  const halfPt = Math.round(spec.size_pt * 2)
  rPr.appendChild(wordElement(d, "sz", { val: halfPt }))
  rPr.appendChild(wordElement(d, "szCs", { val: halfPt }))
  if (spec.underline) rPr.appendChild(wordElement(d, "u", { val: "single" }))
  r.appendChild(rPr)

  for (const piece of text.split(/(\t|\n)/)) {
    if (piece === "\t") r.appendChild(wordElement(d, "tab"))
    else if (piece === "\n") r.appendChild(wordElement(d, "br"))
    else {
      const t = wordElement(d, "t")
      t.setAttributeNS(XML_SPACE_NS, "xml:space", "preserve")
      t.textContent = piece
      r.appendChild(t)
    }
  }
  return r
}

export function synthesizeParagraph(
  d: Document,
  text: string,
  roleSpec: FontRoleSpec,
  outlineLevel?: number,
  emphasis?: "first_sentence" | "underline_first_sentence",
) {
  const p = wordElement(d, "p")
  const pPr = wordElement(d, "pPr")
  pPr.appendChild(
    wordElement(d, "spacing", {
      before: outlineLevel !== undefined ? 160 : 0,
      after: outlineLevel !== undefined ? 120 : 0,
      line: roleSpec.line_twips ?? 360,
      lineRule: roleSpec.line_rule ?? "auto",
    }),
  )
  if (roleSpec.first_line_twips && outlineLevel === undefined) {
    pPr.appendChild(wordElement(d, "ind", { firstLine: roleSpec.first_line_twips }))
  }
  pPr.appendChild(wordElement(d, "jc", { val: roleSpec.alignment }))
  if (outlineLevel !== undefined) {
    pPr.appendChild(wordElement(d, "outlineLvl", { val: outlineLevel }))
  }
  p.appendChild(pPr)

  if (!emphasis) {
    p.appendChild(makeStyledRun(d, text, roleSpec))
    return p
  }
  const splitIdx = /^.*?(?:[。！？!?]|\.(?=\s|$))/.exec(text)?.[0].length ?? text.length
  const head = text.slice(0, splitIdx)
  const tail = text.slice(splitIdx)
  if (head) {
    p.appendChild(
      makeStyledRun(d, head, {
        ...roleSpec,
        bold: true,
        underline: emphasis === "underline_first_sentence",
      }),
    )
  }
  if (tail) {
    p.appendChild(makeStyledRun(d, tail, { ...roleSpec, bold: false, underline: false }))
  }
  return p
}

function makeCleanSectPr(
  d: Document,
  dna: StyleDNA,
  pageFmt?: "upperRoman" | "decimal",
): Element {
  const sectPr = wordElement(d, "sectPr")
  sectPr.appendChild(wordElement(d, "type", { val: "nextPage" }))
  sectPr.appendChild(
    wordElement(d, "pgSz", { w: dna.page_width_twips, h: dna.page_height_twips }),
  )
  sectPr.appendChild(wordElement(d, "pgMar", dna.margins_twips))
  if (pageFmt) {
    sectPr.appendChild(wordElement(d, "pgNumType", { fmt: pageFmt, start: 1 }))
  }
  return sectPr
}

function makeBorder(d: Document, edge: string, val: string, sz = 0) {
  return wordElement(
    d,
    edge,
    val === "nil" ? { val: "nil" } : { val, sz, space: 0, color: "000000" },
  )
}

function makeCoverFieldCells(
  d: Document,
  label: string,
  value: string,
  labelWidth: number,
  valWidth: number,
  dna: StyleDNA,
): [Element, Element] {
  const cleanLabel = label.replace(/[：:\s]+$/, "")
  const fieldPt = Math.max(12, Math.min(16, dna.body_style.size_pt + 2))
  const tcLabel = wordElement(d, "tc")
  const tcLabelPr = wordElement(d, "tcPr")
  tcLabelPr.appendChild(wordElement(d, "tcW", { w: labelWidth, type: "dxa" }))
  const nilBorders = wordElement(d, "tcBorders")
  for (const e of ["top", "left", "bottom", "right"]) {
    nilBorders.appendChild(makeBorder(d, e, "nil"))
  }
  tcLabelPr.appendChild(nilBorders)
  tcLabelPr.appendChild(wordElement(d, "vAlign", { val: "bottom" }))
  tcLabel.appendChild(tcLabelPr)

  const pLabel = wordElement(d, "p")
  const pLabelPr = wordElement(d, "pPr")
  pLabelPr.appendChild(wordElement(d, "spacing", { before: 40, after: 40 }))
  pLabelPr.appendChild(wordElement(d, "jc", { val: "distribute" }))
  pLabel.appendChild(pLabelPr)
  pLabel.appendChild(
    makeStyledRun(d, cleanLabel + "：", {
      font_cn: dna.body_style.font_cn,
      font_en: dna.body_style.font_en,
      size_pt: fieldPt,
      bold: true,
    }),
  )
  tcLabel.appendChild(pLabel)

  const tcVal = wordElement(d, "tc")
  const tcValPr = wordElement(d, "tcPr")
  tcValPr.appendChild(wordElement(d, "tcW", { w: valWidth, type: "dxa" }))
  const valBorders = wordElement(d, "tcBorders")
  valBorders.appendChild(makeBorder(d, "top", "nil"))
  valBorders.appendChild(makeBorder(d, "left", "nil"))
  valBorders.appendChild(makeBorder(d, "bottom", "single", 6))
  valBorders.appendChild(makeBorder(d, "right", "nil"))
  tcValPr.appendChild(valBorders)
  tcValPr.appendChild(wordElement(d, "vAlign", { val: "bottom" }))
  tcVal.appendChild(tcValPr)

  const pVal = wordElement(d, "p")
  const pValPr = wordElement(d, "pPr")
  pValPr.appendChild(wordElement(d, "spacing", { before: 40, after: 40 }))
  pValPr.appendChild(wordElement(d, "jc", { val: "center" }))
  pVal.appendChild(pValPr)
  pVal.appendChild(
    makeStyledRun(d, value || " ", {
      font_cn: dna.body_style.font_cn,
      font_en: dna.body_style.font_en,
      size_pt: fieldPt,
      bold: false,
    }),
  )
  tcVal.appendChild(pVal)
  return [tcLabel, tcVal]
}

export function buildCoverSectionNodes(
  d: Document,
  dna: StyleDNA,
  spec: CoverBuilderSpec | undefined,
  slotValues: Record<string, string>,
  fallbackTitle?: string,
): Element[] {
  const nodes: Element[] = []
  const banner = spec?.banner
  const subtitle = spec?.subtitle
  const docTitle = slotValues.title ?? fallbackTitle ?? ""

  const addCenteredLine = (text: string, pt: number, before: number, after: number) => {
    const p = wordElement(d, "p")
    const pPr = wordElement(d, "pPr")
    pPr.appendChild(wordElement(d, "spacing", { before, after, line: 360, lineRule: "auto" }))
    pPr.appendChild(wordElement(d, "jc", { val: "center" }))
    p.appendChild(pPr)
    p.appendChild(
      makeStyledRun(d, text, {
        font_cn: dna.title_style.font_cn,
        font_en: dna.title_style.font_en,
        size_pt: pt,
        bold: true,
      }),
    )
    nodes.push(p)
  }

  const baseTitlePt = Math.max(18, dna.title_style.size_pt)
  if (banner) addCenteredLine(banner, baseTitlePt, 600, 240)
  if (subtitle) addCenteredLine(subtitle, baseTitlePt + 2, banner ? 240 : 720, 360)
  if (docTitle) {
    const before = banner || subtitle ? 240 : 800
    addCenteredLine(docTitle, Math.max(16, baseTitlePt - 2), before, 720)
  }

  const derivedFields: CoverFieldDef[] = Object.keys(slotValues)
    .filter((k) => k !== "title")
    .map((k) => ({ name: k, label: k }))
  const fields = spec?.fields?.length ? spec.fields : derivedFields

  if (fields.length > 0) {
    const contentW = Math.max(
      4000,
      dna.page_width_twips - dna.margins_twips.left - dna.margins_twips.right,
    )
    const doubleCol = spec?.layout === "double_column" || fields.length > 8
    const totalW = Math.round(contentW * (doubleCol ? 0.9 : 0.75))

    const tbl = wordElement(d, "tbl")
    const tblPr = wordElement(d, "tblPr")
    tblPr.appendChild(wordElement(d, "tblW", { w: totalW, type: "dxa" }))
    tblPr.appendChild(wordElement(d, "jc", { val: "center" }))
    const tblBorders = wordElement(d, "tblBorders")
    for (const e of ["top", "left", "bottom", "right", "insideH", "insideV"]) {
      tblBorders.appendChild(makeBorder(d, e, "nil"))
    }
    tblPr.appendChild(tblBorders)
    tbl.appendChild(tblPr)

    const tblGrid = wordElement(d, "tblGrid")
    if (doubleCol) {
      const half = Math.floor(totalW / 2)
      const lw = Math.round(half * 0.36)
      const vw = half - lw
      for (const w of [lw, vw, lw, vw]) {
        tblGrid.appendChild(wordElement(d, "gridCol", { w }))
      }
      tbl.appendChild(tblGrid)
      for (let i = 0; i < fields.length; i += 2) {
        const tr = wordElement(d, "tr")
        const trPr = wordElement(d, "trPr")
        trPr.appendChild(wordElement(d, "trHeight", { val: 640, hRule: "atLeast" }))
        tr.appendChild(trPr)
        const f1 = fields[i]
        const [l1, v1] = makeCoverFieldCells(
          d,
          f1.label,
          slotValues[f1.name] ?? "",
          lw,
          vw,
          dna,
        )
        tr.appendChild(l1)
        tr.appendChild(v1)
        const f2 = fields[i + 1]
        if (f2) {
          const [l2, v2] = makeCoverFieldCells(
            d,
            f2.label,
            slotValues[f2.name] ?? "",
            lw,
            vw,
            dna,
          )
          tr.appendChild(l2)
          tr.appendChild(v2)
        } else {
          for (const w of [lw, vw]) {
            const emptyTc = wordElement(d, "tc")
            const pr = wordElement(d, "tcPr")
            pr.appendChild(wordElement(d, "tcW", { w, type: "dxa" }))
            emptyTc.appendChild(pr)
            emptyTc.appendChild(wordElement(d, "p"))
            tr.appendChild(emptyTc)
          }
        }
        tbl.appendChild(tr)
      }
    } else {
      const lw = Math.round(totalW * 0.3)
      const vw = totalW - lw
      tblGrid.appendChild(wordElement(d, "gridCol", { w: lw }))
      tblGrid.appendChild(wordElement(d, "gridCol", { w: vw }))
      tbl.appendChild(tblGrid)
      for (const f of fields) {
        const tr = wordElement(d, "tr")
        const trPr = wordElement(d, "trPr")
        trPr.appendChild(wordElement(d, "trHeight", { val: 640, hRule: "atLeast" }))
        tr.appendChild(trPr)
        const [tcL, tcV] = makeCoverFieldCells(
          d,
          f.label,
          slotValues[f.name] ?? "",
          lw,
          vw,
          dna,
        )
        tr.appendChild(tcL)
        tr.appendChild(tcV)
        tbl.appendChild(tr)
      }
    }
    nodes.push(tbl)
  }

  const pBreak = wordElement(d, "p")
  const pBreakPr = wordElement(d, "pPr")
  pBreakPr.appendChild(makeCleanSectPr(d, dna))
  pBreak.appendChild(pBreakPr)
  nodes.push(pBreak)
  return nodes
}

export function buildTocSectionNodes(
  d: Document,
  dna: StyleDNA,
  headings: { level: number; text: string }[],
  tocTitle = "目录",
): { nodes: Element[]; pageRefs: TocPageRef[] } {
  const contentW =
    dna.page_width_twips - dna.margins_twips.left - dna.margins_twips.right
  const sdt = wordElement(d, "sdt")
  const sdtPr = wordElement(d, "sdtPr")
  const obj = wordElement(d, "docPartObj")
  obj.appendChild(wordElement(d, "docPartGallery", { val: "Table of Contents" }))
  obj.appendChild(wordElement(d, "docPartUnique"))
  sdtPr.appendChild(obj)
  sdt.appendChild(sdtPr)

  const content = wordElement(d, "sdtContent")
  const titleP = wordElement(d, "p")
  const titlePr = wordElement(d, "pPr")
  titlePr.appendChild(wordElement(d, "spacing", { before: 240, after: 240 }))
  titlePr.appendChild(wordElement(d, "jc", { val: "center" }))
  titleP.appendChild(titlePr)
  titleP.appendChild(
    makeStyledRun(d, tocTitle, {
      font_cn: dna.heading_1_style.font_cn,
      font_en: dna.heading_1_style.font_en,
      size_pt: dna.heading_1_style.size_pt,
      bold: true,
    }),
  )
  content.appendChild(titleP)

  const pageRefs: TocPageRef[] = []
  for (const [idx, h] of headings.entries()) {
    const p = wordElement(d, "p")
    const pPr = wordElement(d, "pPr")
    const tabs = wordElement(d, "tabs")
    tabs.appendChild(wordElement(d, "tab", { val: "right", leader: "dot", pos: contentW }))
    pPr.appendChild(tabs)
    pPr.appendChild(wordElement(d, "spacing", { line: 360, lineRule: "auto" }))
    pPr.appendChild(wordElement(d, "ind", { left: (h.level - 1) * 320 }))
    p.appendChild(pPr)

    if (idx === 0) {
      const rBegin = p.appendChild(wordElement(d, "r"))
      rBegin.appendChild(wordElement(d, "fldChar", { fldCharType: "begin", dirty: "true" }))
      const rInstr = p.appendChild(wordElement(d, "r"))
      const it = wordElement(d, "instrText")
      it.setAttributeNS(XML_SPACE_NS, "xml:space", "preserve")
      it.textContent = ' TOC \\o "1-3" \\h \\z \\u '
      rInstr.appendChild(it)
      const rSep = p.appendChild(wordElement(d, "r"))
      rSep.appendChild(wordElement(d, "fldChar", { fldCharType: "separate" }))
    }

    const rEntry = makeStyledRun(d, `${h.text}\t`, {
      font_cn: dna.body_style.font_cn,
      font_en: dna.body_style.font_en,
      size_pt: dna.body_style.size_pt,
      bold: h.level === 1,
    })
    const pageNode = wordElement(d, "t")
    pageNode.textContent = "1"
    rEntry.appendChild(pageNode)
    p.appendChild(rEntry)
    pageRefs.push({ text: h.text, pageNode })

    if (idx === headings.length - 1) {
      const rEnd = p.appendChild(wordElement(d, "r"))
      rEnd.appendChild(wordElement(d, "fldChar", { fldCharType: "end" }))
    }
    content.appendChild(p)
  }
  sdt.appendChild(content)

  const pBreak = wordElement(d, "p")
  const pBreakPr = wordElement(d, "pPr")
  pBreakPr.appendChild(makeCleanSectPr(d, dna, "upperRoman"))
  pBreak.appendChild(pBreakPr)
  return { nodes: [sdt, pBreak], pageRefs }
}

export function refreshExistingToc(
  d: Document,
  tocSdts: Element[],
  headings: { level: number; text: string }[],
  contentWidthTwips: number,
): TocPageRef[] {
  const pageRefs: TocPageRef[] = []
  for (const sdt of tocSdts) {
    const content = children(sdt, "sdtContent")[0]
    if (!content) continue
    const paras = children(content, "p")

    const savedSectPrs = Array.from(content.getElementsByTagNameNS(W, "sectPr")).map(
      (s) => d.importNode(s, true) as Element,
    )

    const firstFldIdx = paras.findIndex((p) => p.getElementsByTagNameNS(W, "fldChar").length > 0)
    const preFieldParas = firstFldIdx >= 0 ? paras.slice(0, firstFldIdx) : paras
    const titlePara = preFieldParas.find(
      (p) =>
        !p.getElementsByTagNameNS(W, "hyperlink").length &&
        !p.getElementsByTagNameNS(W, "tab").length &&
        (p.textContent ?? "").trim().length > 0,
    )
    const samplePpr =
      paras
        .map((p) => children(p, "pPr")[0])
        .find((pr) => pr && children(pr, "tabs").length) ??
      (paras[1] && children(paras[1], "pPr")[0])

    for (const node of Array.from(content.childNodes)) {
      if (node !== titlePara) content.removeChild(node)
    }
    if (titlePara) {
      const tpPr = children(titlePara, "pPr")[0]
      if (tpPr) {
        for (const sp of children(tpPr, "sectPr")) tpPr.removeChild(sp)
      }
    }

    for (const [idx, h] of headings.entries()) {
      const p = wordElement(d, "p")
      const pr = samplePpr ? (d.importNode(samplePpr, true) as Element) : wordElement(d, "pPr")
      for (const sp of children(pr, "sectPr")) pr.removeChild(sp)
      if (!children(pr, "tabs").length) {
        const tabs = wordElement(d, "tabs")
        tabs.appendChild(
          wordElement(d, "tab", { val: "right", leader: "dot", pos: contentWidthTwips }),
        )
        insertInSchemaOrder(pr, tabs, PPR_ORDER)
      }
      const ind =
        children(pr, "ind")[0] ??
        (insertInSchemaOrder(pr, wordElement(d, "ind"), PPR_ORDER) as Element)
      ind.setAttributeNS(W, "w:left", String((h.level - 1) * 240))
      p.appendChild(pr)
      if (idx === 0) {
        const rBegin = p.appendChild(wordElement(d, "r"))
        rBegin.appendChild(wordElement(d, "fldChar", { fldCharType: "begin", dirty: "true" }))
        const rInstr = p.appendChild(wordElement(d, "r"))
        const it = wordElement(d, "instrText")
        it.setAttributeNS(XML_SPACE_NS, "xml:space", "preserve")
        it.textContent = ' TOC \\o "1-3" \\h \\z \\u '
        rInstr.appendChild(it)
        const rSep = p.appendChild(wordElement(d, "r"))
        rSep.appendChild(wordElement(d, "fldChar", { fldCharType: "separate" }))
      }
      const rText = p.appendChild(wordElement(d, "r"))
      const t = rText.appendChild(wordElement(d, "t"))
      t.textContent = h.text
      rText.appendChild(wordElement(d, "tab"))
      const tPg = wordElement(d, "t")
      tPg.textContent = "1"
      rText.appendChild(tPg)
      pageRefs.push({ text: h.text, pageNode: tPg })
      if (idx === headings.length - 1) {
        const rEnd = p.appendChild(wordElement(d, "r"))
        rEnd.appendChild(wordElement(d, "fldChar", { fldCharType: "end" }))
      }
      content.appendChild(p)
    }

    for (const sp of savedSectPrs) {
      const spPara = wordElement(d, "p")
      const spPpr = wordElement(d, "pPr")
      spPpr.appendChild(sp)
      spPara.appendChild(spPpr)
      content.appendChild(spPara)
    }
  }
  return pageRefs
}

export function buildThreeLineTable(
  d: Document,
  rows: string[][],
  containerWidthTwips: number,
  bodyStyle: FontRoleSpec,
): Element {
  const colCount = Math.max(1, ...rows.map((r) => r.length))
  const safeWidth = Math.max(2400, containerWidthTwips)
  const colW = Math.floor(safeWidth / colCount)

  const tbl = wordElement(d, "tbl")
  const tblPr = wordElement(d, "tblPr")
  tblPr.appendChild(wordElement(d, "tblW", { w: colW * colCount, type: "dxa" }))
  tblPr.appendChild(wordElement(d, "jc", { val: "center" }))
  const borders = wordElement(d, "tblBorders")
  borders.appendChild(makeBorder(d, "top", "single", 12))
  borders.appendChild(makeBorder(d, "left", "nil"))
  borders.appendChild(makeBorder(d, "bottom", "single", 12))
  borders.appendChild(makeBorder(d, "right", "nil"))
  borders.appendChild(makeBorder(d, "insideH", "nil"))
  borders.appendChild(makeBorder(d, "insideV", "nil"))
  tblPr.appendChild(borders)
  tbl.appendChild(tblPr)

  const tblGrid = wordElement(d, "tblGrid")
  for (let c = 0; c < colCount; c++) {
    tblGrid.appendChild(wordElement(d, "gridCol", { w: colW }))
  }
  tbl.appendChild(tblGrid)

  for (const [ri, rowVals] of rows.entries()) {
    const tr = wordElement(d, "tr")
    const trPr = wordElement(d, "trPr")
    trPr.appendChild(wordElement(d, "trHeight", { val: 420, hRule: "atLeast" }))
    if (ri === 0) trPr.appendChild(wordElement(d, "tblHeader"))
    tr.appendChild(trPr)

    for (let c = 0; c < colCount; c++) {
      const tc = wordElement(d, "tc")
      const tcPr = wordElement(d, "tcPr")
      tcPr.appendChild(wordElement(d, "tcW", { w: colW, type: "dxa" }))
      if (ri === 0) {
        const cb = wordElement(d, "tcBorders")
        cb.appendChild(makeBorder(d, "bottom", "single", 6))
        tcPr.appendChild(cb)
      }
      tcPr.appendChild(wordElement(d, "vAlign", { val: "center" }))
      tc.appendChild(tcPr)

      const p = wordElement(d, "p")
      const pPr = wordElement(d, "pPr")
      pPr.appendChild(
        wordElement(d, "spacing", { before: 40, after: 40, line: 280, lineRule: "auto" }),
      )
      pPr.appendChild(wordElement(d, "jc", { val: "center" }))
      p.appendChild(pPr)
      p.appendChild(
        makeStyledRun(d, rowVals[c] ?? "", {
          font_cn: bodyStyle.font_cn,
          font_en: bodyStyle.font_en,
          size_pt: Math.min(11, bodyStyle.size_pt),
          bold: ri === 0,
        }),
      )
      tc.appendChild(p)
      tr.appendChild(tc)
    }
    tbl.appendChild(tr)
  }
  return tbl
}

export function resetBodyPageNumberStart(bodySectPr: Element, d: Document) {
  let pgNum = children(bodySectPr, "pgNumType")[0]
  if (!pgNum) {
    pgNum = wordElement(d, "pgNumType")
    insertInSchemaOrder(bodySectPr, pgNum, SECTPR_ORDER)
  }
  pgNum.setAttributeNS(W, "w:fmt", "decimal")
  pgNum.setAttributeNS(W, "w:start", "1")
}

export function buildDefaultSeedDocx(): Uint8Array {
  const ooxmlPkg = "http://schemas.openxmlformats.org/package/2006"
  const ooxmlDoc = "http://schemas.openxmlformats.org/officeDocument/2006"
  const ooxmlWord = "application/vnd.openxmlformats-officedocument.wordprocessingml"
  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="${ooxmlPkg}/content-types">` +
    `<Default Extension="rels" ContentType="${ooxmlPkg}.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/word/document.xml" ContentType="${ooxmlWord}.document.main+xml"/>` +
    `<Override PartName="/word/styles.xml" ContentType="${ooxmlWord}.styles+xml"/>` +
    `</Types>`

  const rels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="${ooxmlPkg}/relationships">` +
    `<Relationship Id="rId1" Type="${ooxmlDoc}/relationships/officeDocument" ` +
    `Target="word/document.xml"/>` +
    `</Relationships>`

  const docRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="${ooxmlPkg}/relationships">` +
    `<Relationship Id="rId1" Type="${ooxmlDoc}/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`

  const styles =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:styles xmlns:w="${W}">` +
    `<w:docDefaults>` +
    `<w:rPrDefault><w:rPr>` +
    `<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="仿宋_GB2312"/>` +
    `<w:sz w:val="32"/><w:szCs w:val="32"/>` +
    `</w:rPr></w:rPrDefault>` +
    `</w:docDefaults>` +
    `</w:styles>`

  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W}"><w:body>` +
    `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="120" w:after="240"/></w:pPr>` +
    `<w:r><w:rPr><w:rFonts w:eastAsia="方正小标宋简体" w:ascii="Times New Roman"/>` +
    `<w:b w:val="1"/><w:sz w:val="44"/></w:rPr><w:t>示例文档标题</w:t></w:r></w:p>` +
    `<w:p><w:pPr><w:outlineLvl w:val="0"/><w:spacing w:before="160" w:after="120"/></w:pPr>` +
    `<w:r><w:rPr><w:rFonts w:eastAsia="黑体" w:ascii="Times New Roman"/>` +
    `<w:b w:val="1"/><w:sz w:val="32"/></w:rPr><w:t>一、一级标题</w:t></w:r></w:p>` +
    `<w:p><w:pPr><w:outlineLvl w:val="1"/><w:spacing w:before="120" w:after="80"/></w:pPr>` +
    `<w:r><w:rPr><w:rFonts w:eastAsia="楷体_GB2312" w:ascii="Times New Roman"/>` +
    `<w:b w:val="1"/><w:sz w:val="32"/></w:rPr><w:t>（一）二级标题</w:t></w:r></w:p>` +
    `<w:p><w:pPr><w:ind w:firstLine="640"/>` +
    `<w:spacing w:line="560" w:lineRule="exact"/><w:jc w:val="both"/></w:pPr>` +
    `<w:r><w:rPr><w:rFonts w:eastAsia="仿宋_GB2312" w:ascii="Times New Roman"/>` +
    `<w:sz w:val="32"/></w:rPr><w:t>标准正文示范段落。</w:t></w:r></w:p>` +
    `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>` +
    `<w:pgMar w:top="2098" w:bottom="1985" w:left="1588" w:right="1474" ` +
    `w:header="851" w:footer="992"/></w:sectPr>` +
    `</w:body></w:document>`

  return zipSync({
    "[Content_Types].xml": strToU8(contentTypes),
    "_rels/.rels": strToU8(rels),
    "word/_rels/document.xml.rels": strToU8(docRels),
    "word/styles.xml": strToU8(styles),
    "word/document.xml": strToU8(documentXml),
  })
}

import { XMLSerializer, type Element } from "@xmldom/xmldom"
import { MC_NS, W, children } from "./xml_utils.js"

const XML_SPACE_NS = "http://www.w3.org/XML/1998/namespace"
const serializer = new XMLSerializer()

export interface TextboxGroup {
  host: Element
  contents: Element[]
}

export interface ResolvedNode {
  kind: "block" | "cell" | "para" | "textbox"
  element: Element
  mirrors: Element[]
}

export interface BlankSpan {
  index: number
  kind: "underline" | "underscore" | "colon_space"
  runIndices: number[]
  keepPrefix: string
  keepSuffix: string
  currentText: string
  visualWidth: number
  donorRPr?: Element
}

export function visualCols(s: string) {
  let n = 0
  for (const ch of s) {
    if (ch === "\t") n += 8
    else n += ch.charCodeAt(0) > 255 ? 2 : 1
  }
  return n
}

function isSimpleTextRun(r: Element): boolean {
  if (r.namespaceURI !== W || r.localName !== "r") return false
  for (const node of Array.from(r.childNodes)) {
    if (node.nodeType !== 1) continue
    const el = node as Element
    if (el.namespaceURI !== W) return false
    if (el.localName === "rPr" || el.localName === "t" || el.localName === "tab") continue
    if (el.localName === "br" && el.getAttributeNS(W, "type") !== "page") continue
    return false
  }
  return true
}

function rPrSignature(r: Element): string {
  const rPr = children(r, "rPr")[0]
  return rPr ? serializer.serializeToString(rPr) : ""
}

function mergeAdjacentTextsInRun(r: Element) {
  let cur = r.firstChild
  while (cur) {
    const next = cur.nextSibling
    if (
      cur.nodeType === 1 &&
      next?.nodeType === 1 &&
      (cur as Element).namespaceURI === W &&
      (cur as Element).localName === "t" &&
      (next as Element).namespaceURI === W &&
      (next as Element).localName === "t"
    ) {
      const curEl = cur as Element
      curEl.textContent = (curEl.textContent ?? "") + (next.textContent ?? "")
      curEl.setAttributeNS(XML_SPACE_NS, "xml:space", "preserve")
      r.removeChild(next)
      continue
    }
    cur = next
  }
}

export function coalesceParagraphRuns(p: Element) {
  let cur = p.firstChild
  while (cur) {
    while (cur && cur.nodeType !== 1) cur = cur.nextSibling
    if (!cur) break
    let next = cur.nextSibling
    while (next && next.nodeType === 3 && !(next.textContent ?? "").trim()) {
      next = next.nextSibling
    }
    const curEl = cur as Element
    const nextEl = next?.nodeType === 1 ? (next as Element) : null
    if (
      nextEl &&
      isSimpleTextRun(curEl) &&
      isSimpleTextRun(nextEl) &&
      rPrSignature(curEl) === rPrSignature(nextEl)
    ) {
      for (const child of Array.from(nextEl.childNodes)) {
        if (child.nodeType === 1 && (child as Element).localName === "rPr") continue
        curEl.appendChild(child)
      }
      mergeAdjacentTextsInRun(curEl)
      p.removeChild(nextEl)
      continue
    }
    cur = cur.nextSibling
  }
}

export function coalesceRuns(root: Element) {
  for (const p of Array.from(root.getElementsByTagNameNS(W, "p"))) {
    coalesceParagraphRuns(p)
  }
}

export function bodyBlocks(root: Element): Element[] {
  const body = root.getElementsByTagNameNS(W, "body")[0]
  return children(body).filter((e) => e.localName === "p" || e.localName === "tbl")
}

export function isTocSdt(sdt: Element): boolean {
  for (let p = sdt.parentNode; p?.nodeType === 1; p = p.parentNode) {
    if ((p as Element).localName === "tbl") return false
  }
  const content = children(sdt, "sdtContent")[0]
  if (!content) return false
  for (const p of children(content, "p")) {
    const instr = Array.from(p.getElementsByTagNameNS(W, "instrText"))
      .map((x) => x.textContent ?? "")
      .join("")
    if (/\bTOC\b/.test(instr)) return true
  }
  return false
}

export function findTocSdts(root: Element): Element[] {
  return Array.from(root.getElementsByTagNameNS(W, "sdt")).filter(isTocSdt)
}

export function nonTocSdtParas(root: Element): Element[][] {
  const body = root.getElementsByTagNameNS(W, "body")[0]
  const topSdts = children(body, "sdt")
  const tocSet = new Set<Element>()
  for (const toc of findTocSdts(root)) {
    for (const p of Array.from(toc.getElementsByTagNameNS(W, "p"))) tocSet.add(p)
  }
  return topSdts.map((sdt) => {
    if (isTocSdt(sdt)) return []
    return Array.from(sdt.getElementsByTagNameNS(W, "p")).filter((p) => !tocSet.has(p))
  })
}

export function logicalTextboxes(block: Element): TextboxGroup[] {
  const groups: TextboxGroup[] = []
  const claimed = new Set<Element>()
  const altNodes = Array.from(block.getElementsByTagNameNS(MC_NS, "AlternateContent"))
  for (const alt of altNodes) {
    const txs = Array.from(alt.getElementsByTagNameNS(W, "txbxContent"))
    if (!txs.length) continue
    for (const tx of txs) claimed.add(tx)
    groups.push({ host: alt, contents: txs })
  }
  for (const tx of Array.from(block.getElementsByTagNameNS(W, "txbxContent"))) {
    if (claimed.has(tx)) continue
    let host: Element = tx
    for (let cur = tx.parentNode; cur && cur !== block; cur = cur.parentNode) {
      const el = cur as Element
      if (el.localName === "drawing" || el.localName === "pict") host = el
    }
    groups.push({ host, contents: [tx] })
  }
  return groups
}

export function resolveCoord(root: Element, coord: string): ResolvedNode | null {
  const sdtMatch = /^D(\d+)\.P(\d+)$/.exec(coord)
  if (sdtMatch) {
    const groups = nonTocSdtParas(root)
    const p = groups[Number(sdtMatch[1])]?.[Number(sdtMatch[2])]
    return p ? { kind: "para", element: p, mirrors: [] } : null
  }
  const bMatch = /^B(\d+)(?:\.(.+))?$/.exec(coord)
  if (!bMatch) return null
  const blocks = bodyBlocks(root)
  const block = blocks[Number(bMatch[1])]
  if (!block) return null
  const rest = bMatch[2]
  if (!rest) return { kind: "block", element: block, mirrors: [] }

  const cellMatch = /^R(\d+)\.C(\d+)(?:\.P(\d+))?$/.exec(rest)
  if (cellMatch) {
    if (block.localName !== "tbl") return null
    const row = children(block, "tr")[Number(cellMatch[1])]
    const tc = row && children(row, "tc")[Number(cellMatch[2])]
    if (!tc) return null
    if (cellMatch[3] === undefined) return { kind: "cell", element: tc, mirrors: [] }
    const p = children(tc, "p")[Number(cellMatch[3])]
    return p ? { kind: "para", element: p, mirrors: [] } : null
  }

  const txMatch = /^TX(\d+)(?:\.P(\d+))?$/.exec(rest)
  if (txMatch) {
    const group = logicalTextboxes(block)[Number(txMatch[1])]
    if (!group) return null
    if (txMatch[2] === undefined) {
      return { kind: "textbox", element: group.host, mirrors: group.contents }
    }
    const pIdx = Number(txMatch[2])
    const primary = children(group.contents[0], "p")[pIdx]
    if (!primary) return null
    const mirrors = group.contents
      .slice(1)
      .map((c) => children(c, "p")[pIdx])
      .filter((x): x is Element => Boolean(x))
    return { kind: "para", element: primary, mirrors }
  }
  return null
}

export function runPlainText(r: Element): string {
  if (
    r.getElementsByTagNameNS(W, "txbxContent").length > 0 &&
    children(r, "t").length === 0
  ) {
    return ""
  }
  let s = ""
  for (const node of Array.from(r.childNodes)) {
    if (node.nodeType !== 1) continue
    const el = node as Element
    if (el.namespaceURI !== W) continue
    if (el.localName === "t") s += el.textContent ?? ""
    else if (el.localName === "tab") s += "\t"
    else if (el.localName === "br" && el.getAttributeNS(W, "type") !== "page") s += "\n"
  }
  return s
}

export function paraPlainText(p: Element): string {
  return children(p, "r").map(runPlainText).join("")
}

function isRunUnderlined(r: Element): boolean {
  const rPr = children(r, "rPr")[0]
  const u = rPr && children(rPr, "u")[0]
  if (!u) return false
  const val = u.getAttributeNS(W, "val")
  return val !== "none" && val !== "0" && val !== "false"
}

function runColorHex(r: Element): string | undefined {
  const rPr = children(r, "rPr")[0]
  const c = rPr && children(rPr, "color")[0]?.getAttributeNS(W, "val")
  return c ? c.toUpperCase() : undefined
}

export function analyzeParagraphBlanks(p: Element): BlankSpan[] {
  const runs = children(p, "r")
  if (!runs.length) return []
  const spans: BlankSpan[] = []

  let i = 0
  while (i < runs.length) {
    const r = runs[i]
    const txt = runPlainText(r)
    if (!txt.length) {
      i++
      continue
    }

    // 1. Explicit <w:u> underlined run group
    if (isRunUnderlined(r)) {
      const group: number[] = []
      let raw = ""
      let donor: Element | undefined
      while (i < runs.length && isRunUnderlined(runs[i])) {
        const rt = runPlainText(runs[i])
        if (rt.length > 0) {
          group.push(i)
          raw += rt
          if (!donor && runColorHex(runs[i]) !== "FFFFFF") {
            donor = children(runs[i], "rPr")[0]
          }
        }
        i++
      }
      if (group.length) {
        const colonLead = /^[：:]/.exec(raw)?.[0] ?? ""
        const inner = raw.slice(colonLead.length)
        spans.push({
          index: spans.length,
          kind: "underline",
          runIndices: group,
          keepPrefix: colonLead,
          keepSuffix: "",
          currentText: inner.trim(),
          visualWidth: Math.max(4, visualCols(inner)),
          donorRPr: donor ?? children(runs[group[0]], "rPr")[0],
        })
      }
      continue
    }

    // 2. Literal underscore span (___ or ＿＿＿) inside run
    const underMatch = /^(.*?)([_＿]{2,})(.*)$/s.exec(txt)
    if (underMatch) {
      spans.push({
        index: spans.length,
        kind: "underscore",
        runIndices: [i],
        keepPrefix: underMatch[1],
        keepSuffix: underMatch[3],
        currentText: "",
        visualWidth: Math.max(4, visualCols(underMatch[2])),
        donorRPr: children(r, "rPr")[0],
      })
      i++
      continue
    }

    // 3. Colon followed by whitespace blank
    const cPos = txt.search(/[：:]/)
    if (cPos >= 0 && txt.slice(cPos + 1).trim().length === 0) {
      const group = [i]
      const keepPrefix = txt.slice(0, cPos + 1)
      let blankStr = txt.slice(cPos + 1)
      let next = i + 1
      while (
        next < runs.length &&
        !isRunUnderlined(runs[next]) &&
        runPlainText(runs[next]).trim() === ""
      ) {
        group.push(next)
        blankStr += runPlainText(runs[next])
        next++
      }
      if (blankStr.length >= 2 || next === runs.length) {
        spans.push({
          index: spans.length,
          kind: "colon_space",
          runIndices: group,
          keepPrefix,
          keepSuffix: "",
          currentText: "",
          visualWidth: Math.max(6, visualCols(blankStr)),
          donorRPr: children(r, "rPr")[0],
        })
        i = next
        continue
      }
    }

    i++
  }
  return spans
}

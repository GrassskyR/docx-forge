import { randomUUID } from "node:crypto"
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { Element } from "@xmldom/xmldom"
import { unzipSync } from "fflate"
import type { Skeleton } from "@docs-agent/shared"
import { toDocx } from "./doc_converter.js"
import { attr, child } from "./paragraph_format.js"
import { W, children, parseXml } from "./xml_utils.js"

export function bodyBlocks(root: Element) {
  const body = root.getElementsByTagNameNS(W, "body")[0]
  return children(body).filter((e) => e.localName === "p" || e.localName === "tbl")
}

function textOf(element: Element) {
  return Array.from(element.getElementsByTagNameNS(W, "t"))
    .map((t) => t.textContent)
    .join("")
    .trim()
}

function tableSummary(table: Element) {
  const rows = children(table, "tr")
  const columns = Math.max(0, ...rows.map((r) => children(r, "tc").length))
  const cells = Array.from(table.getElementsByTagNameNS(W, "tc")).map(textOf).filter(Boolean)
  return (rows.length + "行" + columns + "列 " + cells.slice(0, 3).join("|")).slice(0, 48)
}

function detectSectionRole(index: number, total: number, texts: string[], hasTocSdt: boolean) {
  const joined = texts.join("\n")
  if (hasTocSdt && texts.length <= 2) return "toc_preserved"
  if (/本页可以不打印|本页不打印|图片格式示例|表格格式示例|填写说明|撰写说明/.test(joined)) {
    return "instruction_guide_removable"
  }
  if (
    index === 0 &&
    total > 1 &&
    /学\s*号|学\s*生|姓\s*名|学\s*院|专\s*业|指导教师|报告|论文|申报书|合同编号|委托方/.test(joined)
  ) {
    return "cover"
  }
  return "body_or_content"
}

function buildSectionOutline(root: Element, blocks: Element[]) {
  if (!blocks.length) return []
  const body = root.getElementsByTagNameNS(W, "body")[0]
  const bodyKids = children(body)
  const tocBeforeBlock = new Set<number>()
  let bIdx = 0
  for (const node of bodyKids) {
    if (node.localName === "sdt" && /TOC|Table of Contents/.test(node.textContent ?? "")) {
      tocBeforeBlock.add(bIdx)
    }
    if (node.localName === "p" || node.localName === "tbl") bIdx++
  }
  const ranges: [number, number][] = []
  let start = 0
  for (const [i, block] of blocks.entries()) {
    if (block.localName === "p" && block.getElementsByTagNameNS(W, "sectPr").length) {
      ranges.push([start, i])
      start = i + 1
    }
  }
  if (start < blocks.length) ranges.push([start, blocks.length - 1])
  const selected =
    ranges.length <= 8 ? ranges : [...ranges.slice(0, 5), ...ranges.slice(-3)]
  return selected.map(([s, e], idx) => {
    const slice = blocks.slice(s, e + 1)
    const texts = slice
      .map((b) => (b.localName === "tbl" ? tableSummary(b) : textOf(b)))
      .filter(Boolean)
    const hasToc = Array.from({ length: e - s + 1 }, (_, k) => s + k).some((k) =>
      tocBeforeBlock.has(k),
    )
    const role_hint = detectSectionRole(idx, ranges.length, texts, hasToc)
    const nonEmpty = slice
      .map((b, offset) => ({
        i: s + offset,
        b,
        txt: b.localName === "tbl" ? tableSummary(b) : textOf(b),
      }))
      .filter((x) => x.txt)
    const limit = role_hint === "cover" ? 16 : 5
    const picks =
      nonEmpty.length <= limit
        ? nonEmpty
        : [...nonEmpty.slice(0, limit - 1), nonEmpty[nonEmpty.length - 1]]
    const samples = picks.map(({ i, b, txt }) => {
      const p = b.localName === "tbl" ? b.getElementsByTagNameNS(W, "p")[0] : b
      const style = attr(child(child(p, "pPr"), "pStyle")) ?? ""
      return { anchor: "B" + i, style: style.slice(0, 16), text: txt.slice(0, 28) }
    })
    if (hasToc && !samples.length) {
      samples.push({ anchor: "B" + s, style: "TOC", text: "[自动目录节]" })
    }
    return { index: idx, start: "B" + s, end: "B" + e, role_hint, samples }
  })
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
    const all = (tag: string) => Array.from(root.getElementsByTagNameNS(W, tag))
    const blocks = bodyBlocks(root)
    const skeleton: Skeleton = {
      paragraphs: all("p").filter((p) => p.textContent?.trim()).length,
      tables: all("tbl").length,
      sections: all("sectPr").length,
      media: Object.keys(files).filter((k) => /^word\/media\/[^/]+$/.test(k)).length,
      clusters: [],
      preserved: [],
      section_outline: buildSectionOutline(root, blocks),
    }
    if (skeleton.media) skeleton.preserved.push("嵌入图片")
    if (all("headerReference").length) skeleton.preserved.push("页眉")
    if (all("footerReference").length) skeleton.preserved.push("页脚")
    if (all("docGrid").length) skeleton.preserved.push("文档网格")
    if (all("pict").length || all("drawing").length) skeleton.preserved.push("图形")
    if (skeleton.sections > 1) skeleton.preserved.push("分节")
    while (
      skeleton.section_outline &&
      skeleton.section_outline.length > 2 &&
      JSON.stringify(skeleton).length > 2600
    ) {
      skeleton.section_outline.splice(1, 1)
    }
    const groups = new Map<string, Skeleton["clusters"][number]>()
    for (const [index, block] of blocks.entries()) {
      const table = block.localName === "tbl"
      const p: Element | undefined = table ? block.getElementsByTagNameNS(W, "p")[0] : block
      const text = table ? tableSummary(block) : textOf(block)
      if (!text) continue
      const pPr = child(p, "pPr")
      const rPr = child(child(p, "r"), "rPr")
      const style = attr(child(pPr, "pStyle")) ?? ""
      const font = attr(child(rPr, "rFonts"), "eastAsia") ?? ""
      const size = attr(child(rPr, "sz")) ?? ""
      const fingerprint = JSON.stringify([
        table,
        style,
        font,
        size,
        attr(child(pPr, "jc")),
        attr(child(rPr, "b")),
        attr(child(rPr, "color")),
        child(pPr, "numPr") !== undefined,
        table && block.getElementsByTagNameNS(W, "gridCol").length,
      ])
      const group = groups.get(fingerprint)
      if (group) group.count++
      else
        groups.set(fingerprint, {
          anchor: "B" + index,
          kind: table ? "table" : "paragraph",
          count: 1,
          example: table ? text : text.slice(0, 26),
          style: style.slice(0, 32),
          font: font.slice(0, 32),
          size: size.slice(0, 6),
        })
    }
    const candidates = [...groups.values()].sort((a, b) => b.count - a.count)
    const table = candidates.find((c) => c.kind === "table")
    for (const candidate of [...(table ? [table] : []), ...candidates.filter((c) => c !== table)]) {
      skeleton.clusters.push(candidate)
      if (JSON.stringify(skeleton).length > 5700) {
        skeleton.clusters.pop()
        break
      }
    }
    await writeFile(join(directory, "skeleton.json"), JSON.stringify(skeleton))
    return { inspect_id, skeleton }
  } catch (e) {
    await rm(directory, { recursive: true, force: true })
    throw e
  }
}

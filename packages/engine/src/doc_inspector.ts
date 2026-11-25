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
    }
    if (skeleton.media) skeleton.preserved.push("嵌入图片")
    if (all("headerReference").length) skeleton.preserved.push("页眉")
    if (all("footerReference").length) skeleton.preserved.push("页脚")
    if (all("docGrid").length) skeleton.preserved.push("文档网格")
    if (all("pict").length || all("drawing").length) skeleton.preserved.push("图形")
    if (skeleton.sections > 1) skeleton.preserved.push("分节")
    const groups = new Map<string, Skeleton["clusters"][number]>()
    for (const [index, block] of blocks.entries()) {
      const table = block.localName === "tbl"
      const p = table ? block.getElementsByTagNameNS(W, "p")[0] : block
      const text = Array.from(p.getElementsByTagNameNS(W, "t"))
        .map((t) => t.textContent)
        .join("")
        .trim()
      if (!text && !table) continue
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
          example: text.slice(0, 26),
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

import { execFile } from "node:child_process"
import { readFile } from "node:fs/promises"
import { promisify } from "node:util"
import { unzipSync } from "fflate"
import type { LayoutTelemetry } from "@docs-agent/shared"
import { convert } from "./doc_converter.js"
import { parseXml, W } from "./xml_utils.js"

const run = promisify(execFile)

export async function telemetry(path: string, directory: string): Promise<LayoutTelemetry> {
  const pdf = await convert(path, directory, "pdf")
  const [{ stdout: xml }, { stdout: info }] = await Promise.all([
    run("pdftohtml", ["-xml", "-i", "-stdout", pdf], { maxBuffer: 64 * 1024 * 1024 }),
    run("pdfinfo", [pdf], { env: { ...process.env, LC_ALL: "C" } }),
  ])
  const total_pages = Number(/^Pages:\s*(\d+)/m.exec(info)?.[1])
  const word = parseXml(unzipSync(await readFile(path))["word/document.xml"])
  const compact = (s: string) => s.replace(/\s/g, "")
  const tables = Array.from(word.getElementsByTagNameNS(W, "tbl")).map((table) =>
    Array.from(table.getElementsByTagNameNS(W, "tc"))
      .map((c) => compact(c.textContent ?? ""))
      .filter(Boolean),
  )
  const pdfXml = parseXml(Buffer.from(xml))
  const warnings: LayoutTelemetry["warnings"] = []
  const rows = Array.from(pdfXml.getElementsByTagName("page")).map((p) => {
    const height = Number(p.getAttribute("height")) || 1
    const width = Number(p.getAttribute("width")) || 1
    const texts = Array.from(p.getElementsByTagName("text"))
      .map((t) => ({
        top: Number(t.getAttribute("top")),
        left: Number(t.getAttribute("left")),
        width: Number(t.getAttribute("width")),
        height: Number(t.getAttribute("height")),
        text: t.textContent?.trim() ?? "",
      }))
      .filter((t) => t.text && !/^[—–-]?\s*(?:[IVXLCDM]+|\d+)\s*[—–-]?$/i.test(t.text))
    const lines: { top: number; bottom: number; left: number; right: number; text: string }[] = []
    for (const t of texts.sort((a, b) => a.top - b.top || a.left - b.left)) {
      const last = lines.at(-1)
      if (last && Math.abs(t.top - last.top) <= Math.min(4, t.height / 3)) {
        last.text += " " + t.text
        last.bottom = Math.max(t.top + t.height, last.bottom)
        last.left = Math.min(t.left, last.left)
        last.right = Math.max(t.left + t.width, last.right)
      } else {
        lines.push({
          top: t.top,
          bottom: t.top + t.height,
          left: t.left,
          right: t.left + t.width,
          text: t.text,
        })
      }
    }
    const story = compact(lines.map((l) => l.text).join(""))
    const matched = tables
      .map((cells, i) => {
        const longCells = cells.filter((c) => c.length > 2)
        if (!longCells.length) return -1
        const hits = longCells.filter((c) => story.includes(c)).length
        const minHits = Math.min(2, longCells.length)
        return hits >= minHits && (longCells.length === 1 ? longCells[0].length >= 8 : true)
          ? i
          : -1
      })
      .filter((i) => i >= 0)
    return { lines, matched, height, width }
  })
  if (total_pages !== rows.length) throw new Error("PDF 页数与 Poppler 解剖结果不一致")
  const pages = rows.map(({ lines, matched, height, width }, index) => {
    const number = index + 1
    const bottom_occupancy = Number(((lines.at(-1)?.bottom ?? 0) / height).toFixed(4))
    if (lines.length === 0) {
      warnings.push({
        code: "blank_page",
        page: number,
        message: "第 " + number + " 页无正文内容（空白页）",
      })
    } else if (number === total_pages && index > 0 && lines.length <= 3) {
      warnings.push({
        code: "tail_overflow",
        page: number,
        message: "末页仅有 " + lines.length + " 行",
      })
      if (lines.every((l) => l.right - l.left < width * 0.45)) {
        warnings.push({
          code: "orphan_signature",
          page: number,
          message: "短行尾款独立溢至末页",
        })
      }
    } else if (index > 0 && number < total_pages && lines.length <= 2 && bottom_occupancy < 0.28) {
      warnings.push({
        code: "tail_overflow",
        page: number,
        message: `第 ${number} 页分节尾部仅溢出 ${lines.length} 行`,
      })
    }
    if (index && matched.some((i) => rows[index - 1].matched.includes(i))) {
      warnings.push({ code: "split_table", page: number, message: "同一表格延续到下一页" })
    }
    const firstTxt = lines[0]?.text.slice(0, 36) ?? ""
    const lastTxt = lines.length > 1 ? lines.at(-1)!.text.slice(0, 36) : ""
    const excerpt = lastTxt ? `${firstTxt} ... ${lastTxt}` : firstTxt
    return {
      number,
      lines: lines.length,
      has_table: matched.length > 0,
      bottom_occupancy,
      excerpt,
    }
  })
  return { total_pages, pages, warnings }
}

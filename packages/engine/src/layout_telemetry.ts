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
    const height = Number(p.getAttribute("height"))
    const texts = Array.from(p.getElementsByTagName("text"))
      .map((t) => ({
        top: Number(t.getAttribute("top")),
        height: Number(t.getAttribute("height")),
        text: t.textContent?.trim() ?? "",
      }))
      .filter((t) => t.text && !/^[—–-]?\s*\d+\s*[—–-]?$/.test(t.text))
    const lines: { top: number; bottom: number; text: string }[] = []
    for (const t of texts.sort((a, b) => a.top - b.top)) {
      const last = lines.at(-1)
      if (last && Math.abs(t.top - last.top) <= Math.min(4, t.height / 3)) {
        last.text += t.text
        last.bottom = Math.max(t.top + t.height, last.bottom)
      } else lines.push({ top: t.top, bottom: t.top + t.height, text: t.text })
    }
    const story = compact(lines.map((l) => l.text).join(""))
    const matched = tables
      .map((cells, i) => (cells.some((c) => c.length > 2 && story.includes(c)) ? i : -1))
      .filter((i) => i >= 0)
    return { lines, matched, height }
  })
  if (total_pages !== rows.length) throw new Error("PDF 页数与 Poppler 解剖结果不一致")
  const pages = rows.map(({ lines, matched, height }, index) => {
    const number = index + 1
    if (number === total_pages && index > 0 && lines.length > 0 && lines.length <= 3) {
      warnings.push({
        code: "tail_overflow",
        page: number,
        message: "末页仅有 " + lines.length + " 行",
      })
      if (lines.some((l) => /\d{4}\s*年.*月.*日|办公室$|委员会$|有限公司$/.test(l.text))) {
        warnings.push({ code: "orphan_signature", page: number, message: "落款与正文分处两页" })
      }
    }
    if (index && matched.some((i) => rows[index - 1].matched.includes(i))) {
      warnings.push({ code: "split_table", page: number, message: "同一表格延续到下一页" })
    }
    return {
      number,
      lines: lines.length,
      has_table: matched.length > 0,
      bottom_occupancy: Number(((lines.at(-1)?.bottom ?? 0) / height).toFixed(4)),
    }
  })
  return { total_pages, pages, warnings }
}

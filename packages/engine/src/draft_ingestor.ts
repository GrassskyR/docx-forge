import { randomUUID } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { extname, join } from "node:path"
import { unzipSync } from "fflate"
import type { DraftIndex } from "@docs-agent/shared"
import { W, parseXml } from "./xml_utils.js"

export async function ingestDraft(data: string, input: { text?: string; file_path?: string }) {
  let text = input.text
  if (input.file_path) {
    const bytes = await readFile(input.file_path)
    if (extname(input.file_path).toLowerCase() === ".docx") {
      const doc = parseXml(unzipSync(bytes)["word/document.xml"])
      text = Array.from(doc.getElementsByTagNameNS(W, "p"))
        .map((p) =>
          Array.from(p.getElementsByTagNameNS(W, "*"))
            .flatMap((n) => {
              if (n.localName === "t") return [n.textContent ?? ""]
              if (n.localName === "tab") return ["\t"]
              if (n.localName === "br") return ["\n"]
              return []
            })
            .join(""),
        )
        .join("\n")
    } else text = bytes.toString("utf8")
  }
  if (text === undefined || text.length === 0) throw new Error("请输入草稿或上传文件")
  const paragraphs = text.split(/\r\n|\r|\n/)
  const draft_id = randomUUID()
  const folder = join(data, "drafts")
  await mkdir(folder, { recursive: true })
  await writeFile(join(folder, draft_id + ".json"), JSON.stringify(paragraphs))
  const samples = paragraphs.slice(0, 24).map((p, i) => ({ id: "P" + i, excerpt: p.slice(0, 32) }))
  const result: DraftIndex = {
    draft_id,
    count: paragraphs.length,
    characters: text.length,
    samples,
  }
  return result
}

export async function readDraft(data: string, id: string): Promise<string[]> {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("无效草稿编号")
  return JSON.parse(await readFile(join(data, "drafts", id + ".json"), "utf8"))
}

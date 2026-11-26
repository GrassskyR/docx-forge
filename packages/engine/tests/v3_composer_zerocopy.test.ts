import { test, expect } from "vitest"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { unzipSync } from "fflate"
import { XMLSerializer } from "@xmldom/xmldom"
import { execFileSync } from "node:child_process"
import {
  bodyBlocks,
  compose,
  convert,
  ingestDraft,
  inspectReference,
  parseXml,
  Store,
  TemplateStore,
  W,
} from "../src/index.js"

const TARGETS = [
  "real_01_cdsu_red_notice.docx",
  "v3_01_pku_master_thesis.docx",
  "v3_02_szu_master_thesis.docx",
  "v3_04_seu_national_rd_form.docx",
  "v3_08_shgov_coop_dev_contract.doc",
]

for (const file of TARGETS) {
  test("原件保留区、段落克隆与长文零改字 " + file, async () => {
    const data = await mkdtemp(join(tmpdir(), "docforge-compose-"))
    const db = new Store(join(data, "profiles.db"))
    try {
      const source = join("eval", file.startsWith("real") ? "real_docs" : "real_docs_v3", file)
      const { inspect_id, doc_map } = await inspectReference(source, data)
      const store = new TemplateStore(data, db)
      const original = unzipSync(await readFile(join(data, "inspections", inspect_id, "base.docx")))
      const root = parseXml(original["word/document.xml"]).documentElement!
      const blocks = bodyBlocks(root)
      const exampleIndex = blocks.findIndex(
        (e) =>
          e.localName === "p" &&
          e.textContent?.trim() &&
          ["pPr", "rPr"].every((tag) => e.getElementsByTagNameNS(W, tag).length) &&
          ["pict", "drawing", "sectPr"].every((tag) => !e.getElementsByTagNameNS(W, tag).length),
      )
      expect(exampleIndex).toBeGreaterThanOrEqual(0)
      const anchor = "B" + exampleIndex
      const asset = store.save(
        inspect_id,
        file,
        "test",
        {
          template_kind: "flowing",
          fields: [],
          content_slots: [{ name: "body", start: anchor, end: anchor }],
          prototypes: { heading_3: anchor, body: anchor },
          preserved: doc_map.preserved,
        },
        "首句加粗",
      )
      const text = "第一句。其余保持原样。\n" + "正文含有 原样空格，ABC 及标点。\n".repeat(180)
      const draft = await ingestDraft(data, { text })
      const result = await compose(data, asset, {
        mode: "exact_copy",
        draft_id: draft.draft_id,
        body_plan: [
          { prototype: "heading_3", range: "P0", emphasis: "first_sentence" },
          { prototype: "body", range: "P1-P" + (draft.count - 1) },
        ],
      })
      const output = unzipSync(await readFile(result.docx_path))
      for (const key of Object.keys(original).filter((k) => k !== "word/document.xml")) {
        expect(Buffer.from(output[key]).equals(Buffer.from(original[key])), key).toBe(true)
      }
      const parsed = parseXml(output["word/document.xml"])
      const allParas = Array.from(parsed.getElementsByTagNameNS(W, "p"))
      const inserted = result.body_indices.map((i) => allParas[i])
      expect(inserted.map((p) => p.textContent).join("\n")).toBe(text)
      const insertedSet = new Set(inserted)
      const composed = bodyBlocks(parsed.documentElement!)
      const serializer = new XMLSerializer()
      const staticBefore = blocks
        .filter((_, i) => i !== exampleIndex)
        .map((e) => serializer.serializeToString(e))
      const staticAfter = composed
        .filter((e) => !insertedSet.has(e))
        .map((e) => serializer.serializeToString(e))
      expect(staticAfter).toEqual(staticBefore)
      for (const tag of ["sectPr", "docGrid", "drawing", "pict"]) {
        expect(parsed.getElementsByTagNameNS(W, tag).length).toBe(
          root.getElementsByTagNameNS(W, tag).length,
        )
      }
      const runs = Array.from(inserted[0].getElementsByTagNameNS(W, "r"))
      expect(runs.map((r) => r.getElementsByTagNameNS(W, "b")[0].getAttributeNS(W, "val"))).toEqual([
        "1",
        "0",
      ])
      const pdf = await convert(result.docx_path, data, "pdf")
      execFileSync("pdftoppm", [
        "-f",
        "1",
        "-l",
        "1",
        "-singlefile",
        "-scale-to",
        "960",
        "-png",
        pdf,
        join(data, "p"),
      ])
      expect((await readFile(join(data, "p.png"))).subarray(0, 8).toString("hex")).toBe(
        "89504e470d0a1a0a",
      )
    } finally {
      db.db.close()
      await rm(data, { recursive: true, force: true })
    }
  }, 180_000)
}

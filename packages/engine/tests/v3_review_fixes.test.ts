import { test, expect } from "vitest"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { unzipSync, zipSync } from "fflate"
import { DOMParser } from "@xmldom/xmldom"
import { compose, inspectReference, Store, TemplateStore } from "../src/index.js"
import { children, parseXml, xmlBytes, W } from "../src/index.js"

const NS = 'xmlns:w="' + W + '"'
const prototype = `<w:p ${NS}><w:pPr><w:rPr><w:sz w:val="20"/></w:rPr></w:pPr>` +
  `<w:r><w:rPr><w:sz w:val="32"/></w:rPr><w:t>正文原型</w:t></w:r></w:p>`
const emptyTable = `<w:tbl ${NS}><w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid>` +
  `<w:tr><w:tc><w:tcPr/></w:tc></w:tr></w:tbl>`
const signTable = `<w:tbl ${NS}><w:tblGrid><w:gridCol/><w:gridCol/></w:tblGrid>` +
  `<w:tr><w:tc><w:p/></w:tc><w:tc><w:p><w:r><w:t>甲方签章</w:t></w:r></w:p></w:tc></w:tr>` +
  `<w:tr><w:tc><w:p><w:r><w:t>乙方签章</w:t></w:r></w:p></w:tc><w:tc><w:p/></w:tc></w:tr></w:tbl>`

test("异常表格不崩溃、表格示例带行列数，正文 Run 字号优先且网格按正文字号计算", async () => {
  const data = await mkdtemp(join(tmpdir(), "docforge-review-"))
  const db = new Store(join(data, "profiles.db"))
  try {
    const files = unzipSync(await readFile("eval/fixtures/01.docx"))
    const doc = parseXml(files["word/document.xml"])
    const body = doc.getElementsByTagNameNS(W, "body")[0]
    for (const xml of [signTable, emptyTable, prototype])
      body.insertBefore(doc.importNode(new DOMParser().parseFromString(xml, "application/xml")
        .documentElement!, true), body.firstChild)
    files["word/document.xml"] = xmlBytes(doc)
    const source = join(data, "source.docx")
    await writeFile(source, zipSync(files))

    const { inspect_id, skeleton } = await inspectReference(source, data)
    const examples = skeleton.clusters.filter((c) => c.kind === "table").map((c) => c.example)
    expect(examples).toContain("2行2列 甲方签章|乙方签章")

    const asset = new TemplateStore(data, db).save(inspect_id, "测试", "公文", {
      grid: { lines: 22, characters: 28 },
      slots: [{ name: "body", start: "B0", end: "B0" }],
      prototypes: { body: "B0" },
      preserved: [],
    }, "规则")
    const result = await compose(data, asset, { mode: "authored", body_plan: [{ prototype: "body", text: "新正文" }] })
    const output = parseXml(unzipSync(await readFile(result.docx_path))["word/document.xml"])
    const run = Array.from(output.getElementsByTagNameNS(W, "r"))
      .find((r) => r.textContent === "新正文")!
    expect(run.getElementsByTagNameNS(W, "sz")[0].getAttributeNS(W, "val")).toBe("32")

    const section = output.getElementsByTagNameNS(W, "sectPr")[0]
    const value = (tag: string, key: string) =>
      Number(children(section, tag)[0].getAttributeNS(W, key))
    const width = value("pgSz", "w") - value("pgMar", "left") - value("pgMar", "right")
    expect(value("docGrid", "charSpace")).toBe(Math.round((width / 560 - 16) * 4096))
  } finally {
    db.db.close()
    await rm(data, { recursive: true, force: true })
  }
}, 120_000)

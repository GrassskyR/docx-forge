import { afterEach, expect, test } from "vitest"
import { mkdtempSync, rmSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Store, toDocx, preview, extract, render, lint } from "../src/index.js"

const sample = {
  title: "关于开展档案归档检查的通知", recipient: "各部门：", red_header_org: "综合办公室",
  doc_number: "综办〔2026〕12号", signature: "综合办公室", date: "2026年11月24日",
  blocks: [
    { type: "heading_1" as const, text: "一、检查安排" },
    { type: "body" as const, text: "请各部门核对纸质与电子档案目录，整理归档清单并反馈检查结果。" },
    { type: "table" as const, rows: [["部门", "日期"], ["办公室", "周一"]] },
  ],
}

const directories: string[] = []
function temporary() {
  const dir = mkdtempSync(join(tmpdir(), "docforge-test-"))
  directories.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true })
})

test("重启后保留子预设、默认选择及父预设原值", () => {
  const file = join(temporary(), "profiles.db")
  const first = new Store(file)
  const parent = first.activeId
  const child = first.fork(parent, "子预设", { styles: { body: { font_size_pt: 14 } } })
  first.setActive(child.id)
  first.db.close()
  const second = new Store(file)
  try {
    expect(second.activeId).toBe(child.id)
    expect(second.get(child.id).styles.body.font_size_pt).toBe(14)
    expect(second.get(parent).styles.body.font_size_pt).toBe(16)
    expect(() => second.delete(child.id)).toThrow()
    second.setActive(parent)
    second.delete(child.id)
    expect(() => second.get(child.id)).toThrow()
  } finally {
    second.db.close()
  }
})

test("按魔数转换误命名的 Word 文档并生成可读取的 PNG", async () => {
  const manifest = JSON.parse(readFileSync("eval/real_docs/manifest.json", "utf8")) as {
    file: string
    magic_hex: string
  }[]
  const mislabeled = manifest.find(entry => entry.magic_hex.startsWith("D0CF") && entry.file.endsWith(".docx"))!
  const dir = temporary()
  const path = await toDocx(join("eval/real_docs", mislabeled.file), dir)
  expect(readFileSync(path).subarray(0, 2).toString()).toBe("PK")
  const pages = await preview(path, dir)
  expect(pages.length).toBeGreaterThan(0)
  expect(readFileSync(pages[0]).subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a")
}, 120_000)

for (let id = 1; id <= 20; id++) {
  const key = String(id).padStart(2, "0")
  const fixture = JSON.parse(readFileSync("eval/fixtures/" + key + ".json", "utf8"))
  test(fixture.file + " 全部提取字段与 V2 真值一致", async () => {
    const profile = await extract(join("eval/fixtures", fixture.file), key, temporary())
    for (const [path, value] of Object.entries(fixture.expected_assertions)) {
      const actual = path.split(".").reduce((obj, key) => obj[key], profile as any)
      if (path.startsWith("page.margin_")) {
        expect(Math.round(actual * 1440 / 25.4), path).toBe(Math.round(Number(value) * 1440 / 25.4))
      } else {
        expect(actual, path).toEqual(value)
      }
    }
    const output = await render(sample, profile, join(temporary(), "notice.docx"))
    const report = await lint(output, profile)
    expect(report.violations).toEqual([])
    expect(report.checked).toBeGreaterThan(100)
  }, 90_000)
}

import { merge, nationalProfile, parseFormat } from "../src/index.js"
import { FormatProfile } from "@docs-agent/shared"
import { Assert } from "typebox/value"

for (const line of readFileSync("eval/nl_instructions.jsonl", "utf8").trim().split("\n")) {
  const entry = JSON.parse(line)
  test("自然语言 " + entry.id, () => {
    const base = merge(nationalProfile(), entry.base_patch ?? {})
    Assert(FormatProfile, base)
    const { profile } = parseFormat(entry.instruction, entry.id, base)
    for (const [path, value] of Object.entries(entry.expected_assertions)) {
      expect(path.split(".").reduce((obj, key) => obj[key], profile as any), path).toEqual(value)
    }
  })
}

import { createHash } from "node:crypto"
import { unzipSync } from "fflate"
import { parseXml, W, children } from "../src/xml_utils.js"

const corpus = JSON.parse(readFileSync("eval/real_docs/manifest.json", "utf8"))
for (const entry of corpus) {
  test("真实公文全链路 " + entry.file, async () => {
    const dir = temporary()
    const path = join("eval/real_docs", entry.file)
    expect(createHash("sha256").update(readFileSync(path)).digest("hex")).toEqual(entry.sha256)
    const profile = await extract(path, entry.file, dir)
    const files = unzipSync(readFileSync(profile.base_template_path!))
    const doc = parseXml(files["word/document.xml"])
    expect(children(doc.getElementsByTagNameNS(W, "body")[0]).map(e => e.localName)).toEqual(["sectPr"])
    for (const [key, value] of Object.entries(entry.observed_facts)) {
      if (!key.startsWith("page.")) continue
      const actual = profile.page[key.slice(5) as keyof typeof profile.page]
      if (key.includes("margin_")) {
        expect(Math.round(Number(actual) * 1440 / 25.4)).toBe(Math.round(Number(value) * 1440 / 25.4))
      } else expect(actual).toEqual(value)
    }
    const pathOut = await render(sample, profile, join(dir, "notice.docx"))
    const report = await lint(pathOut, profile)
    expect(report.violations).toEqual([])
    const pages = await preview(pathOut, dir)
    expect(pages.length).toBeGreaterThan(0)
    expect(readFileSync(pages[0]).subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a")
  }, 120_000)
}

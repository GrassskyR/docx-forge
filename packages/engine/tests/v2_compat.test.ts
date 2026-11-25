import { afterEach, expect, test } from "vitest"
import { mkdtempSync, rmSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Store, toDocx, preview, extract } from "../src/index.js"

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
  }, 90_000)
}

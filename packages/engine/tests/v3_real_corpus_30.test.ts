import { test, expect } from "vitest"
import { createHash } from "node:crypto"
import { readFileSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { inspectReference } from "../src/index.js"

const CORPORA = [
  ["eval/real_docs", 16],
  ["eval/real_docs_v3", 14],
] as const

for (const [directory, count] of CORPORA) {
  const manifest = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8"))
  test(directory + " 锁定清单数量", () =>
    expect(new Set(manifest.map((e: { file: string }) => e.file)).size).toBe(count),
  )
  for (const entry of manifest) {
    test.concurrent(
      entry.file + " 哈希、结构地图与风格基因",
      async () => {
        const source = join(directory, entry.file)
        expect(createHash("sha256").update(readFileSync(source)).digest("hex")).toBe(entry.sha256)
        const dir = mkdtempSync(join(tmpdir(), "docforge-map-"))
        try {
          const { doc_map } = await inspectReference(source, dir)
          expect(doc_map.paragraphs + doc_map.tables).toBeGreaterThan(0)
          expect(doc_map.map_text.length).toBeGreaterThan(0)
          expect(doc_map.style_dna.body_style.font_cn.length).toBeGreaterThan(0)
        } finally {
          rmSync(dir, { recursive: true, force: true })
        }
      },
      120_000,
    )
  }
}

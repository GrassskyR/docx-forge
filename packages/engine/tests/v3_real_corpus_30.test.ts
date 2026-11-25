import { test, expect } from "vitest"
import { createHash } from "node:crypto"
import { readFileSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { inspectReference } from "../src/index.js"

for (const [directory, count] of [["eval/real_docs", 16], ["eval/real_docs_v3", 14]] as const) {
  const manifest = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8"))
  test(directory + " 锁定清单数量", () => expect(new Set(manifest.map((e: {file: string}) => e.file)).size).toBe(count))
  for (const entry of manifest) {
    test(entry.file + " 哈希、骨架、保留区", async () => {
      const source = join(directory, entry.file)
      expect(createHash("sha256").update(readFileSync(source)).digest("hex")).toBe(entry.sha256)
      const dir = mkdtempSync(join(tmpdir(), "docforge-skeleton-"))
      try {
        const { skeleton } = await inspectReference(source, dir)
        expect(skeleton.paragraphs).toBeGreaterThan(0)
        expect(skeleton.clusters.length).toBeGreaterThan(0)
        expect(JSON.stringify(skeleton).length).toBeLessThanOrEqual(6000)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }, 120_000)
  }
}

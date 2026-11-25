import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { promisify } from "node:util"
import { Assert } from "typebox/value"
import { VisionAudit, type LayoutTelemetry } from "@docs-agent/shared"

const run = promisify(execFile)
export function visionMode(): VisionAudit["mode"] {
  if (process.env.LLM_SUPPORTS_VISION === "true") return "native"
  if (process.env.VISION_MODEL && process.env.VISION_API_KEY && process.env.VISION_BASE_URL)
    return "sidecar"
  return "text_only"
}

export async function visualAudit(
  pdf: string,
  layout: LayoutTelemetry,
  passed: boolean,
  review: (images: { page: number; data: string }[]) => Promise<unknown>,
  enabled = true,
): Promise<VisionAudit> {
  const mode = enabled ? visionMode() : "text_only"
  const skipped = { mode, pages: [], issues: [] }
  if (mode === "text_only") return { ...skipped, status: "skipped_no_vision_model" }
  if (!passed || layout.warnings.length) return { ...skipped, status: "skipped_pending_layout" }
  const pages = [
    ...new Set([
      1,
      layout.total_pages,
      ...layout.pages.filter((p) => p.has_table).map((p) => p.number),
    ]),
  ].slice(0, 3)
  const temp = await mkdtemp(join(tmpdir(), "docforge-review-"))
  try {
    const images = []
    for (const page of pages) {
      const prefix = join(temp, "page-" + page)
      await run(
        "pdftoppm",
        [
          "-f",
          String(page),
          "-l",
          String(page),
          "-scale-to-x",
          "960",
          "-scale-to-y",
          "-1",
          "-singlefile",
          "-png",
          pdf,
          prefix,
        ],
        { timeout: 90_000 },
      )
      images.push({ page, data: (await readFile(prefix + ".png")).toString("base64") })
    }
    const issues = await review(images)
    const audit = {
      mode,
      pages,
      issues,
      status: Array.isArray(issues) && issues.length ? "issues" : "passed",
    }
    Assert(VisionAudit, audit)
    if (audit.issues.some((i) => !pages.includes(i.page)))
      throw new Error("视觉报告引用了未采样的页码")
    return audit
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
}

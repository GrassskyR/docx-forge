import type { Element } from "@xmldom/xmldom"
import { readFile } from "node:fs/promises"
import { unzipSync } from "fflate"
import type { LintReport } from "@docs-agent/shared"
import { bodyBlocks } from "./doc_inspector.js"
import { parseXml, W } from "./xml_utils.js"

export async function auditComposition(
  path: string,
  base: string,
  indices: number[],
  expected?: string[],
  removedSections = 0,
) {
  const files = unzipSync(await readFile(path))
  const original = unzipSync(await readFile(base))
  const xml = parseXml(files["word/document.xml"])
  const reference = parseXml(original["word/document.xml"])
  const blocks = bodyBlocks(xml.documentElement!)
  const violations: LintReport["violations"] = []
  let checked = 0
  function check(field: string, exp: unknown, actual: unknown) {
    checked++
    if (actual !== exp) violations.push({ location: "document", field, expected: exp, actual })
  }
  for (const [name, bytes] of Object.entries(original)) {
    if (/^word\/(media\/|header\d+\.xml|footer\d+\.xml|styles\.xml|numbering\.xml)/.test(name)) {
      check(name, true, Boolean(files[name] && Buffer.from(files[name]).equals(bytes)))
    }
  }
  check(
    "sections",
    reference.getElementsByTagNameNS(W, "sectPr").length - removedSections,
    xml.getElementsByTagNameNS(W, "sectPr").length,
  )
  if (expected) {
    check("paragraph_count", expected.length, indices.length)
    for (const [i, text] of expected.entries()) {
      const p = blocks[indices[i]]
      const actual =
        p &&
        Array.from(p.getElementsByTagNameNS(W, "*"))
          .map((e) =>
            e.localName === "t"
              ? e.textContent
              : e.localName === "tab" && (e.parentNode as Element | null)?.localName !== "tabs"
                ? "\t"
                : e.localName === "br"
                  ? "\n"
                  : "",
          )
          .join("")
      check("P" + i, text, actual)
    }
  }
  return {
    passed: !violations.length,
    checked,
    violations,
    score: 100 * (1 - violations.length / checked),
  }
}

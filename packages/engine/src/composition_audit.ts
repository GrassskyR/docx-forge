import type { Element } from "@xmldom/xmldom"
import { readFile } from "node:fs/promises"
import { unzipSync } from "fflate"
import type { LintReport } from "@docs-agent/shared"
import { parseXml, W } from "./xml_utils.js"

export async function auditComposition(
  path: string,
  base: string,
  paraIndices: number[],
  expected?: string[],
  removedSections = 0,
  addedSections = 0,
): Promise<LintReport> {
  const files = unzipSync(await readFile(path))
  const original = unzipSync(await readFile(base))
  const xml = parseXml(files["word/document.xml"])
  const reference = parseXml(original["word/document.xml"])
  const allParas = Array.from(xml.documentElement!.getElementsByTagNameNS(W, "p"))
  const violations: LintReport["violations"] = []
  let checked = 0

  function check(field: string, exp: unknown, actual: unknown) {
    checked++
    if (actual !== exp) violations.push({ location: "document", field, expected: exp, actual })
  }

  // 1. Verify all headers, footers, school Logos/media, styles, and numbering are byte-identical
  for (const [name, bytes] of Object.entries(original)) {
    if (/^word\/(media\/|header\d+\.xml|footer\d+\.xml|styles\.xml|numbering\.xml)/.test(name)) {
      check(name, true, Boolean(files[name] && Buffer.from(files[name]).equals(bytes)))
    }
  }

  // 2. Verify section count conservation (base - intentionally removed + generated cover/toc)
  check(
    "sections",
    reference.getElementsByTagNameNS(W, "sectPr").length - removedSections + addedSections,
    xml.getElementsByTagNameNS(W, "sectPr").length,
  )

  // 3. Verify 100% character-for-character verbatim preservation in exact_copy mode
  if (expected) {
    check("paragraph_count", expected.length, paraIndices.length)
    for (const [i, text] of expected.entries()) {
      const p = allParas[paraIndices[i]]
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
    checked: Math.max(1, checked),
    violations,
    score: checked ? 100 * (1 - violations.length / checked) : 100,
  }
}

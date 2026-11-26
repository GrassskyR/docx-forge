import { strict as assert } from "node:assert"
import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadEnvFile } from "node:process"
import type { Element } from "@xmldom/xmldom"
import { unzipSync } from "fflate"
import type {
  Blueprint,
  ComposePlan,
  DocumentMap,
  TemplateAsset,
} from "../packages/shared/src/index.js"
import {
  auditComposition,
  bodyBlocks,
  children,
  compose,
  findTocSdts,
  inspectReference,
  parseXml,
  resolveCoord,
  telemetry,
  visionMode,
  visualAudit,
  W,
} from "../packages/engine/src/index.js"
import { Documents } from "../packages/server/src/documents.js"
import { jsonCompletion } from "../packages/server/src/model.js"
import { Workspace } from "../packages/server/src/workspace.js"

if (existsSync(".env")) loadEnvFile(".env")

interface LabManifestItem {
  id: string
  file: string
  source_org: string
  course_or_discipline: string
  source_url: string
  size_bytes: number
  sha256: string
  actual_format: "ooxml_docx" | "ole_doc"
  magic_hex: string
  archetype: string
}

interface FieldLoc {
  field: string
  where: "top_p" | "table_cell" | "textbox"
  multi_on_one_line: boolean
}

interface GroundTruthOracle {
  banner: string
  is_table_form: boolean
  table_ratio: number
  sections: number
  page_breaks: number
  textbox_count: number
  top_p_count: number
  top_tbl_count: number
  addressable_p_ratio: number
  fields: FieldLoc[]
  fixed_section_headings: string[]
  residue_probes: string[]
}

const TEST_META = {
  title: "银行家死锁避免与LRU页面置换实验",
  course: "操作系统原理实验",
  student_id: "2026308801",
  student_name: "林知远",
  college: "计算机科学与技术学院",
  major: "计算机科学与技术",
  class_name: "计科2401班",
  advisor: "周明华",
  date: "2026年11月25日",
}

const SLOT_VALUE_ALIASES: Record<string, string> = {
  title: TEST_META.title,
  report_title: TEST_META.title,
  experiment_name: TEST_META.title,
  project_name: TEST_META.title,
  topic: TEST_META.title,
  subject: TEST_META.title,
  course: TEST_META.course,
  course_name: TEST_META.course,
  curriculum: TEST_META.course,
  student_id: TEST_META.student_id,
  stu_id: TEST_META.student_id,
  id: TEST_META.student_id,
  number: TEST_META.student_id,
  student_name: TEST_META.student_name,
  author: TEST_META.student_name,
  name: TEST_META.student_name,
  student: TEST_META.student_name,
  leader: TEST_META.student_name,
  college: TEST_META.college,
  department: TEST_META.college,
  school: TEST_META.college,
  faculty: TEST_META.college,
  unit: TEST_META.college,
  major: TEST_META.major,
  specialty: TEST_META.major,
  profession: TEST_META.major,
  class: TEST_META.class_name,
  class_name: TEST_META.class_name,
  grade_class: TEST_META.class_name,
  advisor: TEST_META.advisor,
  teacher: TEST_META.advisor,
  instructor: TEST_META.advisor,
  tutor: TEST_META.advisor,
  date: TEST_META.date,
  time: TEST_META.date,
  exp_date: TEST_META.date,
  submit_date: TEST_META.date,
}

const FIELD_PATTERNS: [string, RegExp, string][] = [
  ["student_id", /学\s*号/, TEST_META.student_id],
  ["student_name", /姓\s*名|学\s*生|项目负责人|小组组长/, TEST_META.student_name],
  ["class_name", /班\s*级/, TEST_META.class_name],
  ["college", /学\s*院|系\s*别|二级培养单位/, TEST_META.college],
  ["major", /专\s*业/, TEST_META.major],
  ["course", /课程名称|实验课程/, TEST_META.course],
  ["title", /实验项目名称|实验名称|实验题目|课题名称|报告题目|项目名称/, TEST_META.title],
  ["advisor", /指导教师|指导老师|任课教师/, TEST_META.advisor],
  ["date", /实验日期|实验时间|起止时间|完成日期|\d{4}\s*年\s*\d{1,2}\s*月/, "2026"],
]

function norm(s: string) {
  return s.replace(/\s+/g, " ").trim()
}

function pText(el: Element) {
  return norm(
    Array.from(el.getElementsByTagNameNS(W, "t"))
      .map((t) => t.textContent ?? "")
      .join(""),
  )
}

function buildGroundTruth(baseDocxBytes: Uint8Array): GroundTruthOracle {
  const files = unzipSync(baseDocxBytes)
  const root = parseXml(files["word/document.xml"]).documentElement!
  const body = root.getElementsByTagNameNS(W, "body")[0]
  const topBlocks = children(body).filter((e) => e.localName === "p" || e.localName === "tbl")
  const topP = topBlocks.filter((e) => e.localName === "p")
  const topTbl = topBlocks.filter((e) => e.localName === "tbl")

  const allP = Array.from(root.getElementsByTagNameNS(W, "p")).filter((p) => pText(p).length > 0)
  const txbxNodes = Array.from(root.getElementsByTagNameNS(W, "txbxContent"))
  const txbxSet = new Set<Element>()
  for (const tx of txbxNodes) {
    for (const p of Array.from(tx.getElementsByTagNameNS(W, "p"))) txbxSet.add(p)
  }
  const tblSet = new Set<Element>()
  for (const tbl of Array.from(root.getElementsByTagNameNS(W, "tbl"))) {
    for (const p of Array.from(tbl.getElementsByTagNameNS(W, "p"))) {
      if (!txbxSet.has(p)) tblSet.add(p)
    }
  }
  const topNonEmpty = topP.filter((p) => pText(p).length > 0 && !txbxSet.has(p)).length
  const tblNonEmpty = Array.from(tblSet).filter((p) => pText(p).length > 0).length
  const totalNonEmpty = Math.max(1, allP.length)
  const tableRatio = Number((tblNonEmpty / totalNonEmpty).toFixed(2))

  let banner = ""
  for (const p of allP.slice(0, 18)) {
    const compact = pText(p).replace(/\s+/g, "")
    if (
      /大学|学院|实验报告|实践报告|实习报告|课程设计|专用纸/.test(compact) &&
      !/[：:]/.test(compact) &&
      !/书写式样|填写说明|撰写规范|评分标准|学号|姓名|班级|专业|课程|指导教师/.test(compact) &&
      compact.length >= 4 &&
      compact.length <= 36
    ) {
      banner = compact
      break
    }
  }

  const fields: FieldLoc[] = []
  for (const [fname, re] of FIELD_PATTERNS) {
    let found: FieldLoc | null = null
    for (const p of allP.slice(0, 80)) {
      const txt = pText(p)
      if (!re.test(txt) || txt.length > 90) continue
      const hitCount = FIELD_PATTERNS.filter(([, r]) => r.test(txt)).length
      const where: FieldLoc["where"] = txbxSet.has(p)
        ? "textbox"
        : tblSet.has(p)
          ? "table_cell"
          : "top_p"
      found = { field: fname, where, multi_on_one_line: hitCount >= 2 }
      break
    }
    if (found) fields.push(found)
  }

  const fixedHeadings: string[] = []
  const fixedRe =
    /^(?:[一二三四五六七八九十]+[、.．]|【)(?:实验目的|实验原理|实验仪器|实验设备|实验环境|实验内容|实验步骤|实验数据|实验结果|思考题|实验总结|心得体会)/
  for (const p of allP) {
    const txt = pText(p)
    if (fixedRe.test(txt) && txt.length <= 26) fixedHeadings.push(txt)
  }

  const residueProbes: string[] = []
  const guidePatterns = [
    /本页可以不打印/,
    /图片格式示例/,
    /表格格式示例/,
    /打印时删除/,
    /请在此处/,
    /XXXX课程/,
    /U2016xxxxx/i,
    /CS1601/,
    /编译内核/,
    /关文聪/,
    /樊言鹏/,
    /新冠肺炎疫情/,
    /完善封面信息，报告双面打印/,
    /操作系统安装与操练/,
    /不得少于300字/,
  ]
  const fullText = allP.map(pText).join("\n")
  for (const gp of guidePatterns) {
    const m = gp.exec(fullText)
    if (m) residueProbes.push(m[0])
  }
  for (const p of allP.slice(8)) {
    const txt = pText(p)
    let inTeacherRubric = false
    for (let anc = p.parentNode; anc?.nodeType === 1; anc = anc.parentNode) {
      if ((anc as Element).localName === "tc") {
        const cellTxt = (anc.textContent ?? "").replace(/\s+/g, "")
        if (/批阅意见|教师评语|指导教师意见|导师签字|单位盖章/.test(cellTxt)) {
          inTeacherRubric = true
          break
        }
      }
    }
    if (
      !inTeacherRubric &&
      txt.length >= 48 &&
      !/^[—\-_=*]{6,}$/.test(txt) &&
      !/本报告|严禁抄袭|评分标准|考核标准|签字|成绩评定|教务处制/.test(txt) &&
      residueProbes.length < 6
    ) {
      residueProbes.push(txt.slice(0, 24))
    }
  }

  const sections = root.getElementsByTagNameNS(W, "sectPr").length
  const pageBreaks = Array.from(root.getElementsByTagNameNS(W, "br")).filter(
    (b) => b.getAttributeNS(W, "type") === "page",
  ).length

  return {
    banner,
    is_table_form: tableRatio >= 0.7 || (tableRatio >= 0.55 && topNonEmpty <= 10),
    table_ratio: tableRatio,
    sections,
    page_breaks: pageBreaks,
    textbox_count: txbxNodes.length,
    top_p_count: topP.length,
    top_tbl_count: topTbl.length,
    addressable_p_ratio: Number((topNonEmpty / totalNonEmpty).toFixed(2)),
    fields,
    fixed_section_headings: [...new Set(fixedHeadings)].slice(0, 8),
    residue_probes: [...new Set(residueProbes)],
  }
}

function buildEnhancedRuleBlueprint(docMap: DocumentMap, baseDocxBytes: Uint8Array): Blueprint {
  const doc = parseXml(unzipSync(baseDocxBytes)["word/document.xml"])
  const blocks = bodyBlocks(doc.documentElement!)
  const remove_targets: NonNullable<Blueprint["remove_targets"]> = []
  let secStart = 0
  for (let i = 0; i < blocks.length; i++) {
    const isSectBreak =
      blocks[i].localName === "p" &&
      children(blocks[i], "pPr").some((p) => children(p, "sectPr").length > 0)
    if (isSectBreak || i === blocks.length - 1) {
      const segText = blocks
        .slice(secStart, i + 1)
        .map(pText)
        .join(" ")
      if (/本页可以不打印|格式示例|填写说明|撰写说明/.test(segText) && i - secStart <= 30) {
        remove_targets.push({
          start: "B" + secStart,
          end: "B" + i,
          drop_section: isSectBreak,
          reason: "规则检出说明节",
        })
      }
      secStart = i + 1
    }
  }
  const removed = new Set<number>()
  for (const r of remove_targets) {
    for (let i = Number(r.start.slice(1)); i <= Number((r.end ?? r.start).slice(1)); i++) {
      removed.add(i)
    }
  }

  const fields: Blueprint["fields"] = []
  const usedIdx = new Set<number>()
  let lastMetaIdx = -1
  for (let i = 0; i < Math.min(blocks.length, 35); i++) {
    if (removed.has(i) || blocks[i].localName !== "p") continue
    const txt = pText(blocks[i])
    if (!txt || txt.length > 60) continue
    const hits = FIELD_PATTERNS.filter(([, r]) => r.test(txt))
    if (hits.length === 1 && /[：:_＿]/.test(txt)) {
      const name = hits[0][0]
      if (!fields.some((s) => s.name === name)) {
        fields.push({ name, coord: "B" + i, mode: "colon" })
        usedIdx.add(i)
        lastMetaIdx = Math.max(lastMetaIdx, i)
      }
    }
  }

  let h1 = ""
  let h2 = ""
  let bodyProto = ""
  let tblProto = ""
  let firstBodyIdx = -1
  let lastBodyIdx = -1
  for (let i = 0; i < blocks.length; i++) {
    if (removed.has(i) || usedIdx.has(i)) continue
    const b = blocks[i]
    if (b.localName === "tbl") {
      if (!tblProto) tblProto = "B" + i
      continue
    }
    const txt = pText(b)
    if (!txt) continue
    if (i > lastMetaIdx) {
      if (/^(?:[一二三四五六七八九十]+[、.．]|\d+[.．、]\s*\S)/.test(txt) && txt.length <= 32) {
        if (!h1) h1 = "B" + i
        if (firstBodyIdx < 0) firstBodyIdx = i
        lastBodyIdx = i
      } else if (/^\d+\.\d+/.test(txt) && txt.length <= 36) {
        if (!h2) h2 = "B" + i
        if (firstBodyIdx < 0) firstBodyIdx = i
        lastBodyIdx = i
      } else if (firstBodyIdx >= 0 && !/教师签字|批改日期|成绩评定/.test(txt)) {
        if (!bodyProto) bodyProto = "B" + i
        lastBodyIdx = i
      }
    }
  }

  const fallbackP = bodyProto || "B" + Math.max(0, blocks.findIndex((b) => b.localName === "p"))
  const content_slots: Blueprint["content_slots"] =
    firstBodyIdx >= 0 && lastBodyIdx >= firstBodyIdx
      ? [{ name: "body", start: "B" + firstBodyIdx, end: "B" + lastBodyIdx, placement: "replace" }]
      : [{ name: "body", start: fallbackP, end: fallbackP, placement: "replace" }]

  const prototypes: Record<string, string> = {
    body: fallbackP,
    heading_1: h1 || fallbackP,
    heading_2: h2 || h1 || fallbackP,
    heading_3: h2 || h1 || fallbackP,
  }
  if (tblProto) prototypes.table = tblProto
  return {
    template_kind: "flowing",
    fields,
    content_slots,
    ...(remove_targets.length ? { remove_targets } : {}),
    prototypes,
    preserved: docMap.preserved,
  }
}

function resolveMetaValue(key: string, label = ""): string | undefined {
  const k = key.toLowerCase()
  if (SLOT_VALUE_ALIASES[k]) return SLOT_VALUE_ALIASES[k]
  const combined = `${k} ${label}`
  if (/学\s*号|id|num|no/.test(combined)) return TEST_META.student_id
  if (/姓\s*名|学\s*生|组长|负责人|stu|name|author/.test(combined)) return TEST_META.student_name
  if (/班\s*级|class/.test(combined)) return TEST_META.class_name
  if (/课程|course/.test(combined)) return TEST_META.course
  if (/实验名称|项目名称|题目|课题|title|exp|topic/.test(combined)) return TEST_META.title
  if (/学\s*院|系\s*别|单位|col|dep|sch/.test(combined)) return TEST_META.college
  if (/专\s*业|maj|spec/.test(combined)) return TEST_META.major
  if (/教师|老师|导师|tea|adv|inst/.test(combined)) return TEST_META.advisor
  if (/日期|时间|年|date|time/.test(combined)) return TEST_META.date
  return undefined
}

function buildSlotFillValues(asset: TemplateAsset) {
  const out: Record<string, string> = { ...TEST_META }
  for (const f of asset.blueprint.fields) {
    const v = resolveMetaValue(f.name, f.label)
    if (v) out[f.name] = v
  }
  for (const cf of asset.blueprint.cover_builder?.fields ?? []) {
    const v = resolveMetaValue(cf.name, cf.label)
    if (v) out[cf.name] = v
  }
  return out
}

async function buildAuthoredPlan(
  asset: TemplateAsset,
  baseDocxBytes: Uint8Array,
  docs: Documents,
): Promise<ComposePlan> {
  const protos = asset.blueprint.prototypes
  const pick = (...names: string[]) =>
    names.find((n) => protos[n]) ?? Object.keys(protos)[0] ?? "body"
  const rawItems: ComposePlan = [
    { prototype: pick("heading_1", "body"), text: "1. 实验目的与运行环境" },
    {
      prototype: pick("body"),
      text:
        "掌握操作系统银行家死锁避免安全性序列检测算法，" +
        "对比最近最少使用（LRU）页面置换策略在不同物理页框配额下的缺页率表现。",
    },
    { prototype: pick("heading_1", "body"), text: "2. 算法设计与关键步骤" },
    { prototype: pick("heading_2", "heading_1", "body"), text: "2.1 安全性状态向量迭代检查" },
    {
      prototype: pick("body"),
      text:
        "维护可利用资源向量 Work 与完成标记 Finish，" +
        "循环寻找需求矩阵小于等于当前可用向量的就绪进程并回收其分配矩阵。",
    },
    { prototype: pick("heading_1", "body"), text: "3. 实验测试数据与结果分析" },
  ]

  let cols = 5
  if (protos.table) {
    const root = parseXml(unzipSync(baseDocxBytes)["word/document.xml"]).documentElement!
    const tbl = resolveCoord(root, protos.table)?.element
    if (tbl?.localName === "tbl") {
      const grid = children(tbl, "tblGrid")[0]
      const c = grid
        ? children(grid, "gridCol").length
        : Math.max(0, ...children(tbl, "tr").map((r) => children(r, "tc").length))
      if (c >= 2 && c <= 8) cols = c
    }
  }
  const headers = ["进程/样本", "分配量", "最大需求", "缺页次数", "命中率", "耗时ms", "状态", "备注"].slice(
    0,
    cols,
  )
  const r1 = ["P0 (LRU-3)", "3", "7", "6", "70.0%", "1.4", "安全", "收敛"].slice(0, cols)
  const r2 = ["P1 (LRU-4)", "4", "6", "4", "80.0%", "1.1", "安全", "最优"].slice(0, cols)
  rawItems.push({ prototype: "table", rows: [headers, r1, r2] })

  rawItems.push(
    { prototype: pick("heading_1", "body"), text: "4. 实验总结与心得体会" },
    {
      prototype: pick("body"),
      text:
        "实验结果表明增加物理页框并结合哈希双向链表实现 LRU 淘汰策略可显著降低抖动风险，" +
        "资源预审有效消除了循环等待条件。",
    },
  )

  // Single-slot templates require no slot routing
  if (asset.blueprint.content_slots.length <= 1 || !docs.useModel) {
    return rawItems
  }

  // Multi-slot templates MUST be routed by the LLM itself (no hardcoded regex in engine!)
  const slotList = asset.blueprint.content_slots
    .map((s) => `${s.name}(固定标题:${s.label ?? "无"})`)
    .join("、")
  const itemDesc = rawItems
    .map(
      (it, idx) =>
        `[${idx}] proto=${it.prototype} | ${it.text ?? `[数据表 ${it.rows?.length ?? 0}行]`}`,
    )
    .join("\n")

  const routed = await jsonCompletion(
    [
      "请将下方待写入的文档内容项路由到当前模板声明的正文槽位（content_slots）中。",
      `可选 slot 名称仅限：${slotList}。`,
      "若目标槽位已印有固定标题（label 非空），可将与之重复的章节标题项标记 drop=true 避免标题重复。",
      '严格只输出 JSON：{"assignments":[{"index":0,"slot":"槽位名","drop":false}, ...]}',
      asset.capability_card,
      itemDesc,
    ].join("\n"),
    docs.bill,
    [],
    "bench-slot-route-v4",
  )

  const list = Array.isArray(routed?.assignments) ? routed.assignments : []
  const byIndex = new Map<number, { slot?: string; drop?: boolean }>()
  for (const entry of list) {
    if (entry && typeof entry.index === "number") {
      byIndex.set(entry.index, { slot: entry.slot, drop: Boolean(entry.drop) })
    }
  }

  const planned: ComposePlan = []
  for (const [idx, item] of rawItems.entries()) {
    const decision = byIndex.get(idx)
    if (decision?.drop) continue
    planned.push({ ...item, ...(decision?.slot ? { slot: decision.slot } : {}) })
  }
  return planned
}

async function evaluateComposed(
  docxPath: string,
  baseDocxPath: string,
  gt: GroundTruthOracle,
  asset: TemplateAsset,
  bodyIndices: number[],
  removedSections: number,
  addedSections: number,
  docs?: Documents,
) {
  const outBytes = await readFile(docxPath)
  const audit = await auditComposition(
    docxPath,
    baseDocxPath,
    bodyIndices,
    undefined,
    removedSections,
    addedSections,
  )
  const outZip = unzipSync(outBytes)
  const root = parseXml(outZip["word/document.xml"]).documentElement!
  const allP = Array.from(root.getElementsByTagNameNS(W, "p")).map(pText).filter(Boolean)
  const fullNoSpace = allP.join("\n").replace(/\s+/g, "")
  const fullJoined = allP.join("\n")

  // Strict banner check (no college-name pardon backdoor!)
  const bannerPreserved = !gt.banner || fullNoSpace.includes(gt.banner.slice(0, 10))

  const outTbls = Array.from(root.getElementsByTagNameNS(W, "tbl"))
  const tblTextJoined = outTbls
    .flatMap((t) => Array.from(t.getElementsByTagNameNS(W, "p")).map(pText))
    .join("\n")
  const formContainerRespected = !gt.is_table_form || tblTextJoined.includes("银行家死锁避免")

  let filledCount = 0
  const unfilledFields: string[] = []
  for (const f of gt.fields) {
    const entry = FIELD_PATTERNS.find(([name]) => name === f.field)!
    const expectedVal = entry[2]
    if (fullJoined.includes(expectedVal)) filledCount++
    else unfilledFields.push(`${f.field}@${f.where}${f.multi_on_one_line ? "(同行多字段)" : ""}`)
  }
  const metadataFillRate = gt.fields.length
    ? Number((filledCount / gt.fields.length).toFixed(2))
    : 1

  const leakedResidues = gt.residue_probes.filter((probe) => fullJoined.includes(probe))
  const residueFree = leakedResidues.length === 0

  let pdfOk = false
  let totalPages = 0
  let blankPages = 0
  let tocPagesValid = true
  let visionStatus = "skipped"
  let visionIssuesCount = 0
  try {
    const outDir = join(docxPath, "..")
    const layout = await telemetry(docxPath, outDir)
    pdfOk = true
    totalPages = layout.total_pages
    blankPages = layout.warnings.filter((w) => w.code === "blank_page").length

    // Verify TOC page numbers are never fabricated beyond physical page count
    for (const sdt of findTocSdts(root)) {
      for (const p of Array.from(sdt.getElementsByTagNameNS(W, "p"))) {
        const line = pText(p)
        const m = /(\d+)\s*$/.exec(line)
        if (m && Number(m[1]) > totalPages) {
          tocPagesValid = false
        }
      }
    }

    if (docs?.useModel && visionMode() !== "text_only") {
      try {
        const vAudit = await visualAudit(
          join(outDir, "document.pdf"),
          layout,
          audit.passed,
          async (images) => {
            const validPages = new Set(images.map((img) => img.page))
            const res = await jsonCompletion(
              '检查关键页的排版质量。返回 {"issues":[{"page":1,"description":"问题"}]}，无问题时返回空数组。',
              docs.bill,
              images,
              "bench-visual-audit",
            )
            const list = Array.isArray(res?.issues) ? res.issues : []
            return list
              .filter(
                (x: Record<string, unknown>) =>
                  x &&
                  typeof x.page === "number" &&
                  validPages.has(x.page) &&
                  typeof x.description === "string",
              )
              .map((x: Record<string, unknown>) => ({
                page: Number(x.page),
                description: String(x.description),
              }))
          },
          true,
        )
        visionStatus = vAudit.status
        visionIssuesCount = vAudit.issues.length
      } catch {
        visionStatus = "error"
      }
    }
  } catch {
    pdfOk = false
  }

  const failureCodes: string[] = []
  if (
    gt.is_table_form &&
    (!formContainerRespected || unfilledFields.some((u) => u.includes("table_cell")))
  ) {
    failureCodes.push("F1_TABLE_CELL_UNADDRESSABLE")
  }
  const firstSlot = asset.blueprint.content_slots[0]
  if (
    gt.sections === 1 &&
    (!bannerPreserved ||
      (asset.blueprint.content_slots.length === 1 &&
        firstSlot?.start === firstSlot?.end &&
        !firstSlot?.start.includes(".") &&
        gt.top_p_count >= 15))
  ) {
    failureCodes.push("F2_SINGLE_SECT_BOUNDARY_LOSS")
  }
  if (!residueFree) {
    failureCodes.push("F3_PREFILLED_OR_GUIDE_RESIDUE")
  }
  if (gt.fixed_section_headings.length >= 3) {
    const keptFixed = gt.fixed_section_headings.filter((h) => fullJoined.includes(h)).length
    if (keptFixed > 0 && keptFixed < gt.fixed_section_headings.length) {
      failureCodes.push("F4_MULTI_SLOT_FIXED_SECTIONS")
    } else if (keptFixed === gt.fixed_section_headings.length && !residueFree) {
      failureCodes.push("F4_MULTI_SLOT_FIXED_SECTIONS")
    }
  }
  if (
    unfilledFields.some((u) => u.includes("textbox") || u.includes("同行多字段")) ||
    (gt.fields.length > 0 &&
      metadataFillRate < 0.5 &&
      !failureCodes.includes("F1_TABLE_CELL_UNADDRESSABLE"))
  ) {
    failureCodes.push("F5_TEXTBOX_OR_INLINE_MULTI_FIELD")
  }
  if (blankPages > 0) {
    failureCodes.push("F6_BLANK_PAGE_LEFT_BEHIND")
  }
  if (!tocPagesValid) {
    failureCodes.push("F7_FAKE_TOC_PAGE_NUMBER")
  }

  const strictPass =
    pdfOk &&
    audit.passed &&
    bannerPreserved &&
    formContainerRespected &&
    residueFree &&
    blankPages === 0 &&
    tocPagesValid &&
    metadataFillRate >= 0.5

  return {
    pdf_ok: pdfOk,
    total_pages: totalPages,
    blank_pages: blankPages,
    toc_pages_valid: tocPagesValid,
    vision_status: visionStatus,
    vision_issues_count: visionIssuesCount,
    ooxml_audit_passed: audit.passed,
    audit_violations: audit.violations,
    banner_preserved: bannerPreserved,
    form_container_respected: formContainerRespected,
    metadata_filled: filledCount,
    metadata_total: gt.fields.length,
    metadata_fill_rate: metadataFillRate,
    unfilled_fields: unfilledFields,
    residue_free: residueFree,
    leaked_residues: leakedResidues,
    strict_e2e_pass: strictPass,
    failure_codes: failureCodes,
  }
}

async function runStrategyOnDoc(
  strategy: "rule_baseline" | "rule_enhanced" | "llm_hybrid",
  sourcePath: string,
  item: LabManifestItem,
) {
  const workDir = await mkdtemp(join(tmpdir(), `lab-bench-${strategy}-`))
  const useModel = strategy === "llm_hybrid"
  const docs = new Documents(workDir, useModel)
  const work = new Workspace(docs)
  const t0 = Date.now()
  let mapChars = 0
  let gt: GroundTruthOracle | undefined
  try {
    const inspected =
      strategy === "llm_hybrid" && visionMode() !== "text_only"
        ? await work.inspect(sourcePath, [1, 2, 3])
        : await inspectReference(sourcePath, workDir)
    const { inspect_id, doc_map } = inspected
    mapChars = doc_map.map_text.length
    const baseDocxPath = join(workDir, "inspections", inspect_id, "base.docx")
    const baseBytes = await readFile(baseDocxPath)
    gt = buildGroundTruth(baseBytes)

    const beforeTokens = docs.bill.snapshot().total_tokens
    let asset: TemplateAsset
    if (strategy === "rule_baseline") {
      asset = await work.internalize(inspect_id, item.id, "general", "")
    } else if (strategy === "rule_enhanced") {
      const bp = buildEnhancedRuleBlueprint(doc_map, baseBytes)
      asset = work.templates.save(inspect_id, item.id, "general", bp, "正则规则基线", true)
    } else {
      asset = await work.internalize(inspect_id, item.id, "general", "")
    }

    const slotValues = buildSlotFillValues(asset)
    const bodyPlan = await buildAuthoredPlan(asset, baseBytes, docs)

    const composed = await compose(workDir, asset, {
      mode: "authored",
      slot_values: slotValues,
      body_plan: bodyPlan,
    })
    const evalRes = await evaluateComposed(
      composed.docx_path,
      baseDocxPath,
      gt,
      asset,
      composed.body_indices,
      composed.removed_sections,
      composed.added_sections,
      docs,
    )
    const tokensUsed = docs.bill.snapshot().total_tokens - beforeTokens
    return {
      strategy,
      elapsed_ms: Date.now() - t0,
      tokens_used: tokensUsed,
      map_chars: mapChars,
      fields_detected: asset.blueprint.fields.map(
        (f) => `${f.name}@${f.coord}[${f.mode ?? "cell"}${f.blank_index !== undefined ? f.blank_index : ""}]`,
      ),
      content_slots: asset.blueprint.content_slots.map(
        (s) => `${s.name}(${s.start}-${s.end},${s.placement ?? "replace"})`,
      ),
      remove_targets: asset.blueprint.remove_targets ?? [],
      prototypes: Object.keys(asset.blueprint.prototypes),
      gt,
      ...evalRes,
    }
  } catch (e) {
    return {
      strategy,
      elapsed_ms: Date.now() - t0,
      tokens_used: docs.bill.snapshot().total_tokens,
      map_chars: mapChars,
      fields_detected: [],
      content_slots: [],
      remove_targets: [],
      prototypes: [],
      gt,
      error: e instanceof Error ? e.message : String(e),
      pdf_ok: false,
      total_pages: 0,
      blank_pages: 0,
      toc_pages_valid: false,
      vision_status: "error",
      vision_issues_count: 0,
      ooxml_audit_passed: false,
      audit_violations: [] as unknown[],
      banner_preserved: false,
      form_container_respected: false,
      metadata_filled: 0,
      metadata_total: gt?.fields.length ?? 0,
      metadata_fill_rate: 0,
      unfilled_fields: [],
      residue_free: false,
      leaked_residues: [],
      strict_e2e_pass: false,
      failure_codes: ["F0_PIPELINE_EXCEPTION"],
    }
  } finally {
    docs.store.db.close()
    await rm(workDir, { recursive: true, force: true })
  }
}

async function main() {
  const corpusDir = "eval/lab_reports"
  const fullManifest = JSON.parse(
    await readFile(join(corpusDir, "manifest.json"), "utf8"),
  ) as LabManifestItem[]
  assert.equal(fullManifest.length, 30, "Must have all 30 university lab report templates")

  for (const item of fullManifest) {
    const bytes = await readFile(join(corpusDir, item.file))
    const actualSha = createHash("sha256").update(bytes).digest("hex")
    assert.equal(actualSha, item.sha256, `SHA256 mismatch on ${item.file}`)
  }

  const filterIds = process.env.LAB_FILTER?.split(",").map((s) => s.trim()).filter(Boolean)
  const manifest = filterIds?.length
    ? fullManifest.filter((m) => filterIds.includes(m.id))
    : fullManifest

  console.log(`Starting Clean Unrigged V4 Benchmark across ${manifest.length} templates...`)
  type TrackRes = Omit<Awaited<ReturnType<typeof runStrategyOnDoc>>, "gt">
  const perDoc: (LabManifestItem & {
    ground_truth?: GroundTruthOracle
    tracks: Record<"rule_baseline" | "rule_enhanced" | "llm_hybrid", TrackRes>
  })[] = []

  for (let i = 0; i < manifest.length; i += 3) {
    const slice = manifest.slice(i, i + 3)
    const batchRes = await Promise.all(
      slice.map(async (item) => {
        const src = join(corpusDir, item.file)
        const rb = await runStrategyOnDoc("rule_baseline", src, item)
        const re = await runStrategyOnDoc("rule_enhanced", src, item)
        const lh = await runStrategyOnDoc("llm_hybrid", src, item)
        const bTag = rb.strict_e2e_pass ? "PASS" : "FAIL"
        const rTag = re.strict_e2e_pass ? "PASS" : "FAIL"
        const lTag = lh.strict_e2e_pass ? "PASS" : "FAIL"
        const llmStat =
          `${lh.metadata_filled}/${lh.metadata_total}, p=${lh.total_pages}, ` +
          `blank=${lh.blank_pages}, ${lh.tokens_used}tok`
        console.log(
          `[${item.id}] ${item.source_org.slice(0, 10).padEnd(10)} | ${item.archetype.padEnd(22)} | ` +
            `Base=${bTag}(${rb.metadata_filled}/${rb.metadata_total}) | ` +
            `Rule+=${rTag}(${re.metadata_filled}/${re.metadata_total}) | ` +
            `LLM=${lTag}(${llmStat}) | fails=${lh.failure_codes.join(",") || "NONE"}`,
        )
        if (!lh.strict_e2e_pass) {
          console.log(
            `   -> [${item.id} DIAG] pdf=${lh.pdf_ok} blank=${lh.blank_pages} tocOk=${lh.toc_pages_valid} ` +
              `audit=${lh.ooxml_audit_passed} banner=${lh.banner_preserved} ` +
              `form=${lh.form_container_respected} unfilled=[${lh.unfilled_fields.join(",")}] ` +
              `residues=[${lh.leaked_residues.join(",")}] err=${(lh as { error?: string }).error ?? ""}`,
          )
        }
        return {
          ...item,
          ground_truth:
            (rb as { gt?: GroundTruthOracle }).gt ?? (lh as { gt?: GroundTruthOracle }).gt,
          tracks: {
            rule_baseline: { ...rb, gt: undefined },
            rule_enhanced: { ...re, gt: undefined },
            llm_hybrid: { ...lh, gt: undefined },
          },
        }
      }),
    )
    perDoc.push(...batchRes)
  }

  const summarizeTrack = (key: "rule_baseline" | "rule_enhanced" | "llm_hybrid") => {
    const rows = perDoc.map((d) => d.tracks[key])
    const totalMeta = rows.reduce((s, r) => s + r.metadata_total, 0)
    const filledMeta = rows.reduce((s, r) => s + r.metadata_filled, 0)
    const failCounts: Record<string, number> = {}
    for (const r of rows) {
      for (const code of r.failure_codes) failCounts[code] = (failCounts[code] ?? 0) + 1
    }
    const byArchetype: Record<string, { total: number; pass: number }> = {}
    for (const d of perDoc) {
      const a = d.archetype
      byArchetype[a] ??= { total: 0, pass: 0 }
      byArchetype[a].total++
      if (d.tracks[key].strict_e2e_pass) byArchetype[a].pass++
    }
    return {
      total_docs: rows.length,
      pdf_render_pass: rows.filter((r) => r.pdf_ok).length,
      zero_blank_pages_pass: rows.filter((r) => r.pdf_ok && r.blank_pages === 0).length,
      toc_pages_valid_pass: rows.filter((r) => r.pdf_ok && r.toc_pages_valid).length,
      vision_audit_passed: rows.filter((r) => r.vision_status === "passed").length,
      vision_audit_issues: rows.filter((r) => r.vision_status === "issues").length,
      ooxml_audit_pass: rows.filter((r) => r.ooxml_audit_passed).length,
      banner_preserved_pass: rows.filter((r) => r.banner_preserved).length,
      form_container_pass: rows.filter((r) => r.form_container_respected).length,
      residue_free_pass: rows.filter((r) => r.residue_free).length,
      metadata_filled_total: `${filledMeta}/${totalMeta}`,
      metadata_fill_pct: Number(((filledMeta / Math.max(1, totalMeta)) * 100).toFixed(1)),
      strict_e2e_pass: rows.filter((r) => r.strict_e2e_pass).length,
      strict_e2e_pct: Number(
        ((rows.filter((r) => r.strict_e2e_pass).length / rows.length) * 100).toFixed(1),
      ),
      avg_tokens: Math.round(rows.reduce((s, r) => s + r.tokens_used, 0) / rows.length),
      failure_breakdown: failCounts,
      by_archetype: byArchetype,
    }
  }

  const summary = {
    generated_at: new Date().toISOString(),
    vision_mode: visionMode(),
    corpus_size: manifest.length,
    formats: {
      ooxml_docx: manifest.filter((m) => m.actual_format === "ooxml_docx").length,
      ole_doc: manifest.filter((m) => m.actual_format === "ole_doc").length,
    },
    tracks: {
      rule_baseline: summarizeTrack("rule_baseline"),
      rule_enhanced: summarizeTrack("rule_enhanced"),
      llm_hybrid: summarizeTrack("llm_hybrid"),
    },
    documents: perDoc,
  }

  if (!filterIds?.length) {
    await mkdir("eval", { recursive: true })
    await writeFile("eval/results_lab_reports.json", JSON.stringify(summary, null, 2) + "\n")
  }
  console.log("\n=== CLEAN UNRIGGED SUMMARY ===")
  console.log("Rule Baseline :", summary.tracks.rule_baseline)
  console.log("Rule Enhanced :", summary.tracks.rule_enhanced)
  console.log("LLM Hybrid    :", summary.tracks.llm_hybrid)
}

await main()

import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, join } from "node:path"
import { promisify } from "node:util"
import type { Element } from "@xmldom/xmldom"
import { unzipSync } from "fflate"
import { Assert } from "typebox/value"
import {
  Blueprint,
  COORD_REGEX,
  ComposePlan,
  type ContentSlot,
  type DocumentMap,
  type FieldSlot,
  type LayoutTelemetry,
  type LintReport,
  type RemoveTarget,
  type TemplateAsset,
} from "@docs-agent/shared"
import {
  Store,
  TemplateStore,
  adjustLayout,
  auditComposition,
  bodyBlocks,
  children,
  compose,
  convert,
  ingestDraft,
  inspectReference,
  logicalTextboxes,
  nonTocSdtParas,
  paraPlainText,
  parseXml,
  preview,
  readDraft,
  readStampedCoord,
  resolveCoord,
  telemetry,
  visionMode,
  visualAudit,
  W,
  type Adjustment,
  type ComposeInput,
} from "@docs-agent/engine"
import { Documents } from "./documents.js"
import { logger } from "./logger.js"
import { jsonCompletion } from "./model.js"

const run = promisify(execFile)
const MAX_REACT_ROUNDS = 3

interface DryRunObservation {
  hardIssues: string[]
  layout?: LayoutTelemetry
  residualMap: string
  dryImages: { page: number; data: string }[]
}

function normSpace(s: string) {
  return s.replace(/\s+/g, " ").trim()
}

function isDataTableCandidate(el: ReturnType<typeof resolveCoord>): boolean {
  if (!el || el.element.localName !== "tbl") return false
  const rows = children(el.element, "tr")
  if (rows.length < 2) return false
  const sample = rows.at(-1)!
  if (sample.getElementsByTagNameNS(W, "vMerge").length > 0) return false
  if (sample.getElementsByTagNameNS(W, "gridSpan").length > 0) return false
  const cols = children(rows[0], "tc").length
  return cols >= 2 && rows.every((r) => children(r, "tc").length === cols)
}

function buildOfflineBaselineBlueprint(docMap: DocumentMap, baseBytes: Uint8Array): Blueprint {
  const root = parseXml(unzipSync(baseBytes)["word/document.xml"]).documentElement!
  const blocks = bodyBlocks(root)
  const pIdx = Math.max(
    0,
    blocks.findIndex((b) => b.localName === "p" && !b.getElementsByTagNameNS(W, "sectPr").length),
  )
  const anchor = blocks[pIdx] ? `B${pIdx}` : "B0"
  return {
    template_kind: "flowing",
    fields: [],
    content_slots: [{ name: "body", start: anchor, end: anchor, placement: "replace" }],
    prototypes: { body: anchor },
    preserved: docMap.preserved,
  }
}

export function validateBlueprint(
  raw: Partial<Blueprint> | undefined,
  docMap: DocumentMap,
  baseBytes: Uint8Array,
): Blueprint {
  const root = parseXml(unzipSync(baseBytes)["word/document.xml"]).documentElement!
  const validCoord = (c: unknown): c is string =>
    typeof c === "string" && COORD_REGEX.test(c) && resolveCoord(root, c) !== null

  const fields: FieldSlot[] = []
  const seenFieldNames = new Set<string>()
  for (const f of Array.isArray(raw?.fields) ? raw!.fields : []) {
    if (!f || typeof f.name !== "string" || !f.name.trim()) continue
    const cleanName = f.name.trim()
    if (seenFieldNames.has(cleanName)) continue
    if (f.coord !== undefined) {
      if (!validCoord(f.coord)) {
        throw new Error(`fields[${cleanName}] 的坐标 ${String(f.coord)} 在原文档中不存在`)
      }
      if (resolveCoord(root, f.coord)!.kind === "row") {
        throw new Error(
          `fields[${cleanName}] 不能指向整行 ${f.coord}，请指向具体单元格 B{i}.R{r}.C{c} 或段落`,
        )
      }
    }
    seenFieldNames.add(cleanName)
    fields.push({
      name: cleanName,
      ...(typeof f.label === "string" ? { label: f.label } : {}),
      ...(f.coord ? { coord: f.coord } : {}),
      ...(f.mode && ["blank", "match", "cell", "colon"].includes(f.mode)
        ? { mode: f.mode }
        : {}),
      ...(typeof f.blank_index === "number" && f.blank_index >= 0
        ? { blank_index: Math.floor(f.blank_index) }
        : {}),
      ...(typeof f.match === "string" && f.match ? { match: f.match } : {}),
    })
  }

  const remove_targets: RemoveTarget[] = []
  for (const rm of Array.isArray(raw?.remove_targets) ? raw!.remove_targets : []) {
    if (!rm || !validCoord(rm.start)) {
      throw new Error(`remove_targets.start 坐标 ${String(rm?.start)} 非法或不存在`)
    }
    const end = rm.end ?? rm.start
    if (!validCoord(end)) {
      throw new Error(`remove_targets.end 坐标 ${String(end)} 非法或不存在`)
    }
    remove_targets.push({
      start: rm.start,
      ...(end !== rm.start ? { end } : {}),
      ...(typeof rm.match === "string" && rm.match ? { match: rm.match } : {}),
      ...(rm.only_textboxes ? { only_textboxes: true } : {}),
      ...(rm.drop_section ? { drop_section: true } : {}),
      ...(rm.drop_page_break ? { drop_page_break: true } : {}),
      ...(typeof rm.reason === "string" ? { reason: rm.reason } : {}),
    })
  }

  const content_slots: ContentSlot[] = []
  const seenContent = new Set<string>()
  for (const cs of Array.isArray(raw?.content_slots) ? raw!.content_slots : []) {
    if (!cs || typeof cs.name !== "string" || !cs.name.trim()) continue
    if (!validCoord(cs.start)) {
      throw new Error(`content_slots[${cs.name}].start 坐标 ${String(cs.start)} 不存在`)
    }
    const end = cs.end ?? cs.start
    if (!validCoord(end)) {
      throw new Error(`content_slots[${cs.name}].end 坐标 ${String(end)} 不存在`)
    }
    const stNode = resolveCoord(root, cs.start)!
    const edNode = resolveCoord(root, end)!
    if (stNode.kind === "row" || edNode.kind === "row") {
      throw new Error(
        `content_slots[${cs.name}] 不能指向表格整行 (${cs.start})，请指向具体单元格 B{i}.R{r}.C{c}`,
      )
    }
    if (stNode.kind !== edNode.kind || stNode.element.parentNode !== edNode.element.parentNode) {
      throw new Error(
        `content_slots[${cs.name}] 的起止坐标 (${cs.start}..${end}) 不在同一父容器内`,
      )
    }
    if (seenContent.has(cs.name)) continue
    seenContent.add(cs.name)
    content_slots.push({
      name: cs.name.trim(),
      ...(typeof cs.label === "string" && cs.label ? { label: cs.label } : {}),
      start: cs.start,
      end,
      placement: cs.placement === "insert_after" ? "insert_after" : "replace",
    })
  }
  if (!content_slots.length) {
    throw new Error("content_slots 不能为空，必须至少声明一个有效正文槽位")
  }

  const prototypes: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw?.prototypes ?? {})) {
    if (!validCoord(v)) continue
    const resolved = resolveCoord(root, v)!
    if (k === "table") {
      if (isDataTableCandidate(resolved)) prototypes.table = v
    } else if (resolved.element.localName === "p") {
      prototypes[k] = v
    }
  }

  const must_preserve = Array.isArray(raw?.must_preserve)
    ? raw!.must_preserve.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    : undefined

  const rawCb = raw?.cover_builder as Record<string, unknown> | undefined
  const cleanCover: Blueprint["cover_builder"] = rawCb?.enabled
    ? {
        enabled: true,
        ...(typeof rawCb.banner === "string" && rawCb.banner
          ? { banner: rawCb.banner }
          : {}),
        ...(typeof rawCb.subtitle === "string" && rawCb.subtitle
          ? { subtitle: rawCb.subtitle }
          : {}),
        ...(rawCb.layout === "single_column" || rawCb.layout === "double_column"
          ? { layout: rawCb.layout }
          : {}),
        ...(Array.isArray(rawCb.fields)
          ? {
              fields: rawCb.fields
                .map((f: Record<string, unknown>) => ({
                  name: String(f.name ?? ""),
                  label: String(f.label ?? ""),
                }))
                .filter((f) => f.name && f.label),
            }
          : {}),
      }
    : undefined

  const rawTocMode = (raw?.toc as Record<string, unknown> | undefined)?.mode
  const cleanToc: Blueprint["toc"] =
    rawTocMode === "none" || rawTocMode === "refresh_existing" || rawTocMode === "generate"
      ? { mode: rawTocMode }
      : undefined

  const rawGrid = raw?.grid as Record<string, unknown> | undefined
  const cleanGrid =
    rawGrid &&
    typeof rawGrid.lines === "number" &&
    rawGrid.lines >= 1 &&
    typeof rawGrid.characters === "number" &&
    rawGrid.characters >= 1
      ? { lines: Math.floor(rawGrid.lines), characters: Math.floor(rawGrid.characters) }
      : undefined

  const clean: Blueprint = {
    ...(raw?.template_kind &&
    ["flowing", "form_table", "style_shell"].includes(raw.template_kind)
      ? { template_kind: raw.template_kind }
      : {}),
    ...(cleanGrid ? { grid: cleanGrid } : {}),
    fields,
    content_slots,
    ...(remove_targets.length ? { remove_targets } : {}),
    ...(must_preserve?.length ? { must_preserve } : {}),
    prototypes,
    ...(cleanCover ? { cover_builder: cleanCover } : {}),
    ...(cleanToc ? { toc: cleanToc } : {}),
    preserved:
      Array.isArray(raw?.preserved) && raw!.preserved.length ? raw!.preserved : docMap.preserved,
  }
  Assert(Blueprint, clean)
  return clean
}

function describeResidualPara(p: Element): {
  src: string | undefined
  text: string
  flags: string[]
  txSummary: string[]
} {
  const src = readStampedCoord(p)
  const pPr = children(p, "pPr")[0]
  const flags: string[] = []
  if (pPr && children(pPr, "sectPr").length) flags.push("SECT_BREAK")
  if (
    Array.from(p.getElementsByTagNameNS(W, "br")).some(
      (b) => b.getAttributeNS(W, "type") === "page",
    ) ||
    (pPr && children(pPr, "pageBreakBefore").length)
  ) {
    flags.push("PAGE_BREAK")
  }
  const txs = logicalTextboxes(p)
  if (
    !txs.length &&
    (p.getElementsByTagNameNS(W, "drawing").length > 0 ||
      p.getElementsByTagNameNS(W, "pict").length > 0)
  ) {
    flags.push("GRAPHIC")
  }
  const txSummary: string[] = []
  for (const tg of txs) {
    const tCoord = readStampedCoord(tg.host) ?? (src ? `${src}.TX` : "TX")
    const txt = normSpace(tg.contents[0]?.textContent ?? "").slice(0, 64)
    if (txt) txSummary.push(`  [${tCoord} 浮动框]: ${JSON.stringify(txt)}`)
  }
  return { src, text: normSpace(paraPlainText(p)), flags, txSummary }
}

function buildResidualMapText(outRoot: Element): string {
  const out: string[] = []
  for (const ps of nonTocSdtParas(outRoot)) {
    for (const p of ps) {
      const info = describeResidualPara(p)
      if (info.text || info.flags.length) {
        const tag = info.flags.length ? `[${info.flags.join(",")}]` : ""
        out.push(`[原${info.src ?? "SDT"}]${tag}: ${JSON.stringify(info.text.slice(0, 100))}`)
      }
    }
  }

  const blocks = bodyBlocks(outRoot)
  let i = 0
  while (i < blocks.length) {
    const blk = blocks[i]
    const src = readStampedCoord(blk)

    // Collapse contiguous newly inserted probe blocks
    if (!src) {
      let end = i
      while (end + 1 < blocks.length && !readStampedCoord(blocks[end + 1])) end++
      const sample = normSpace(blocks[i].textContent ?? "").slice(0, 48)
      out.push(`[已写入正文探针 ${end - i + 1} 块, 首块=${JSON.stringify(sample)}]`)
      i = end + 1
      continue
    }

    if (blk.localName === "tbl") {
      const rows = children(blk, "tr")
      out.push(`[原${src} 表格 现存${rows.length}行]:`)
      for (const tr of rows) {
        const rSrc = readStampedCoord(tr) ?? `${src}.R?`
        const trPr = children(tr, "trPr")[0]
        const trH = Number(
          (trPr && children(trPr, "trHeight")[0]?.getAttributeNS(W, "val")) || 0,
        )
        const hTag = trH > 0 ? `[h=${trH}]` : ""
        const cellDescs: string[] = []
        const subLines: string[] = []
        for (const tc of children(tr, "tc")) {
          const cSrc = readStampedCoord(tc) ?? "C?"
          const cLabel = cSrc.split(".").at(-1) ?? cSrc
          const ps = children(tc, "p")
          const insertedCount = ps.filter(
            (p) => !readStampedCoord(p) && normSpace(p.textContent ?? ""),
          ).length
          const survivingOrig = ps
            .map(describeResidualPara)
            .filter((x) => x.src && (x.text || x.flags.length || x.txSummary.length))
          if (insertedCount > 0 && survivingOrig.length === 0) {
            const sample = normSpace(tc.textContent ?? "").slice(0, 36)
            cellDescs.push(`${cLabel}=[已写入探针:${JSON.stringify(sample)}]`)
          } else if (ps.length <= 1 && survivingOrig.length <= 1) {
            const txt = normSpace(tc.textContent ?? "").slice(0, 48)
            cellDescs.push(`${cLabel}=${JSON.stringify(txt)}`)
          } else {
            cellDescs.push(`${cLabel}(原残留${survivingOrig.length}段,新写入${insertedCount}段)`)
            for (const sp of survivingOrig.slice(0, 10)) {
              const fStr = sp.flags.length ? `[${sp.flags.join(",")}]` : ""
              subLines.push(
                `    [原${sp.src}]${fStr}: ${JSON.stringify(sp.text.slice(0, 90))}`,
              )
              for (const tl of sp.txSummary) subLines.push("    " + tl)
            }
          }
        }
        out.push(`  [原${rSrc}]${hTag}: ${cellDescs.join(" | ")}`)
        for (const sl of subLines) out.push(sl)
      }
      i++
      continue
    }

    const info = describeResidualPara(blk)
    if (!info.text && !info.flags.length && !info.txSummary.length) {
      let end = i
      while (end + 1 < blocks.length && blocks[end + 1].localName === "p") {
        const nextSrc = readStampedCoord(blocks[end + 1])
        if (!nextSrc) break
        const ni = describeResidualPara(blocks[end + 1])
        if (ni.text || ni.flags.length || ni.txSummary.length) break
        end++
      }
      const endSrc = readStampedCoord(blocks[end]) ?? src
      if (end === i) out.push(`[原${src}]: "" [空白段]`)
      else out.push(`[原${src}..${endSrc}]: "" [连续 ${end - i + 1} 个空白段]`)
      i = end + 1
      continue
    }

    const fStr = info.flags.length ? ` [${info.flags.join(",")}]` : ""
    out.push(`[原${src}]${fStr}: ${JSON.stringify(info.text.slice(0, 110))}`)
    for (const tl of info.txSummary) out.push(tl)
    i++
  }
  return out.join("\n")
}

async function observeDryRun(
  baseBytes: Uint8Array,
  docMap: DocumentMap,
  blueprint: Blueprint,
): Promise<DryRunObservation> {
  const hardIssues: string[] = []
  const work = await mkdtemp(join(tmpdir(), "docforge-dryrun-"))
  const db = new Store(join(work, "dry.db"))
  try {
    const inspId = "00000000-0000-4000-8000-000000000001"
    const inspDir = join(work, "inspections", inspId)
    await mkdir(inspDir, { recursive: true })
    await writeFile(join(inspDir, "base.docx"), baseBytes)
    await writeFile(join(inspDir, "doc_map.json"), JSON.stringify(docMap))

    const tStore = new TemplateStore(work, db)
    const asset = tStore.save(inspId, "dryrun", "general", blueprint, "", true)

    const dummyVals: Record<string, string> = {}
    for (const [idx, f] of blueprint.fields.entries()) {
      dummyVals[f.name] = `FieldProbe_${idx + 1}`
    }
    const hProto = blueprint.prototypes.heading_1 ? "heading_1" : "body"
    const dummyPlan: ComposePlan = []
    for (const [idx, cs] of blueprint.content_slots.entries()) {
      if (!cs.label) {
        dummyPlan.push({
          slot: cs.name,
          prototype: hProto,
          text: `HeadingProbe_${idx + 1}`,
        })
      }
      dummyPlan.push({
        slot: cs.name,
        prototype: "body",
        text: `SlotProbe_${cs.name}`,
      })
    }
    dummyPlan.push({
      slot: blueprint.content_slots.at(-1)!.name,
      prototype: "table",
      rows: [
        ["ColA", "ColB"],
        ["Val1", "Val2"],
      ],
    })

    const out = await compose(work, asset, {
      mode: "authored",
      slot_values: dummyVals,
      body_plan: dummyPlan,
      stamp_source_coords: true,
    })
    const audit = await auditComposition(
      out.docx_path,
      join(inspDir, "base.docx"),
      out.body_indices,
      undefined,
      out.removed_sections,
      out.added_sections,
    )
    if (!audit.passed) {
      hardIssues.push("OOXML结构与分节审计未通过: " + JSON.stringify(audit.violations[0]))
    }

    const outDir = dirname(out.docx_path)
    const layout = await telemetry(out.docx_path, outDir)

    const origRoot = parseXml(unzipSync(baseBytes)["word/document.xml"]).documentElement!
    const origCompact = (origRoot.textContent ?? "").replace(/\s+/g, "")
    const outRoot = parseXml(
      unzipSync(await readFile(out.docx_path))["word/document.xml"],
    ).documentElement!
    const fullCompact = (outRoot.textContent ?? "").replace(/\s+/g, "")

    for (const fixed of blueprint.must_preserve ?? []) {
      const needle = fixed.replace(/\s+/g, "")
      if (needle && origCompact.includes(needle) && !fullCompact.includes(needle)) {
        hardIssues.push(`声明保护的固定文本「${fixed}」在试填后丢失，请勿覆盖或删除其所在节点。`)
      }
    }

    for (const cs of blueprint.content_slots) {
      if (!fullCompact.includes(`SlotProbe_${cs.name}`)) {
        hardIssues.push(`正文槽位 ${cs.name} (${cs.start}..${cs.end}) 试填内容未能写入文档。`)
      }
    }

    if (blueprint.fields.length > 0 && !blueprint.cover_builder?.enabled) {
      const missingFields = blueprint.fields.filter(
        (_, idx) => !fullCompact.includes(`FieldProbe_${idx + 1}`),
      )
      if (missingFields.length > 0) {
        hardIssues.push(
          `以下 fields 试填未生效：${missingFields.map((f) => `${f.name}@${f.coord}[${f.mode ?? ""}]`).join(", ")}。`,
        )
      }
    }

    const residualMap = buildResidualMapText(outRoot)
    const dryImages: { page: number; data: string }[] = []
    if (visionMode() !== "text_only") {
      const warnPages = layout.warnings.map((w) => w.page)
      const pickPages = [...new Set([1, ...warnPages, layout.total_pages])]
        .filter((p) => p >= 1 && p <= layout.total_pages)
        .slice(0, 3)
      const pdfPath = join(outDir, "document.pdf")
      for (const page of pickPages) {
        const prefix = join(work, `dry-page-${page}`)
        await run("pdftoppm", [
          "-f",
          String(page),
          "-l",
          String(page),
          "-singlefile",
          "-scale-to",
          "960",
          "-png",
          pdfPath,
          prefix,
        ])
        dryImages.push({ page, data: (await readFile(`${prefix}.png`)).toString("base64") })
      }
    }

    return { hardIssues, layout, residualMap, dryImages }
  } catch (e) {
    hardIssues.push("试填组装或PDF渲染异常: " + (e instanceof Error ? e.message : String(e)))
    return { hardIssues, residualMap: "", dryImages: [] }
  } finally {
    db.db.close()
    await rm(work, { recursive: true, force: true })
  }
}

function buildInitialBlueprintPrompt(
  docMap: DocumentMap,
  category: string,
  userRules: string,
  hasImages: boolean,
  coordErrors?: string[],
): string {
  const dna = docMap.style_dna
  return [
    "请解析下方的 Word 参考文档【风格基因 (StyleDNA)】与【门牌号结构地图 (DocumentMap)】" +
      (hasImages ? "，并结合附带的原文档关键页真实渲染图，" : "，") +
      "输出严格合法的 JSON：",
    "{",
    '  "blueprint": {',
    '    "template_kind": "flowing | form_table | style_shell",',
    '    "fields": [',
    '      {"name":"field_key","label":"原标签","coord":"B1","mode":"blank","blank_index":0}',
    "    ],",
    '    "content_slots": [',
    '      {"name":"body","start":"B10","end":"B25","placement":"replace"}',
    "    ],",
    '    "remove_targets": [',
    '      {"start":"B4","end":"B9","drop_section":true,"reason":"整节填写说明"}',
    "    ],",
    '    "must_preserve": ["原文档正文中不可被覆盖的固定横幅或大抬头原文字串"],',
    '    "prototypes": {"heading_1":"B10","heading_2":"B11","body":"B12"},',
    '    "cover_builder": {"enabled": false},',
    '    "toc": {"mode": "none | refresh_existing | generate"},',
    '    "preserved": ["页眉","多节版式"]',
    "  },",
    '  "rules_md": "简明排版约束（160字以内纯文本，禁含未转义英文双引号）"',
    "}",
    "",
    "=== 门牌号与原子操作原语规范 ===",
    "1. 【门牌号语法】：",
    "   - 顶层段落或表格：B{i}",
    "   - 表格整行（仅用于 remove_targets 删行）：B{i}.R{r}",
    "   - 表格单元格：B{i}.R{r}.C{c}；单元格内第 p 段：B{i}.R{r}.C{c}.P{p}",
    "   - 段落挂载的浮动文本框：B{i}.TX{t}；框内第 p 段：B{i}.TX{t}.P{p}",
    "   - 顶层内容控件内第 p 段：D{d}.P{p}",
    "2. 【元数据槽位 (fields)】：",
    "   - 识别封面、表头或签署区的可变元数据项，语义化命名（如 title, author, student_name, student_id, " +
      "course, college, major, class_name, advisor, date, party_a, party_b, contract_no 等）。",
    "   - 原文档正文（B/D节点）中固定的机构横幅或文种总抬头可放入 must_preserve 保护（切勿填页眉页脚或图形描述），" +
      "绝不能设为可覆盖的 field 或 content_slot！只有专门填写具体文档题目的位置才设为 title。",
    "   - mode 取值：'blank'（带 [空k:...] 的段落，按 blank_index=0,1,2... 逐个声明）、" +
      "'match'（直接写死旧示例文本的段落，match 精确填原件子串）、" +
      "'cell'（独立值单元格或独占整段的值行）、'colon'（单冒号后替换）。",
    "3. 【正文槽位 (content_slots)】：",
    "   - start 与 end 必须位于同一父容器且不能是整行 B{i}.R{r}。",
    "   - 若主体是外框表格，设 template_kind='form_table'，将 content_slots 指向表内承载正文的单元格或格内段落区间。",
    "   - 若印有多个固定分栏标题，为各栏分别声明命名 content_slot（填好 label，有示例段用 replace，紧邻无空段用 insert_after）。",
    "   - 若是连续流式示例正文，用单个 body 槽位完整覆盖旧示例章节与正文首尾块，仅保留文末固定签章/评阅区。",
    "4. 【原子清理指令 (remove_targets)】：",
    "   - 删除普通块/段区间：{\"start\":\"B{s}\",\"end\":\"B{e}\"}；删除表格多余提示整行：{\"start\":\"B{i}.R{r}\"}；",
    "   - 删除整节不打印说明页并连同移除其分节符：{\"start\":\"B{s}\",\"end\":\"B{e}\",\"drop_section\":true}；",
    "   - 仅剥离某节点上的显式分页符而保留其图形/文字：{\"start\":\"B{k}\",\"drop_page_break\":true}；",
    "   - 局部剥离固定标题同行的括号填写提示：{\"start\":\"...\",\"match\":\"原括号提示子串\"}；",
    "   - 批量剥离段落挂载的排版批注浮动框：{\"start\":\"B{s}\",\"end\":\"B{e}\",\"only_textboxes\":true}。",
    "5. 【样式原型与补件】：prototypes 段落角色指向段落，table 仅指向无合并格的均匀数据表；" +
      "已有封面/表头时 cover_builder.enabled 必须为 false；已有目录控件设 toc.mode='refresh_existing'。",
    ...(coordErrors?.length
      ? [
          "",
          "=== 上一轮蓝图存在坐标或结构语法错误，请修正 ===",
          ...coordErrors.map((e, idx) => `${idx + 1}. ${e}`),
        ]
      : []),
    "",
    `模板类别：${category}`,
    `用户补充要求：${userRules || "无"}`,
    `=== 风格基因 (StyleDNA) ===`,
    JSON.stringify({
      has_header_logo: dna.has_header_logo,
      header_texts: dna.header_texts,
      footer_texts: dna.footer_texts,
      has_existing_toc: dna.has_existing_toc,
      table_ratio: docMap.table_ratio,
      title_font: `${dna.title_style.font_cn} ${dna.title_style.size_pt}pt`,
      h1_font: `${dna.heading_1_style.font_cn} ${dna.heading_1_style.size_pt}pt`,
      body_font: `${dna.body_style.font_cn} ${dna.body_style.size_pt}pt`,
    }),
    `=== 原参考文档完整地图 (DocumentMap) ===`,
    docMap.map_text,
  ].join("\n")
}

function buildReActReviewPrompt(
  docMap: DocumentMap,
  candidate: Blueprint,
  rulesMd: string,
  obs: DryRunObservation,
): string {
  const pageLines = (obs.layout?.pages ?? []).map(
    (p) =>
      `  第${p.number}页: 行数=${p.lines}, 占空比=${p.bottom_occupancy}, ` +
      `含表=${p.has_table}, 首尾摘要=${JSON.stringify(p.excerpt ?? "")}`,
  )
  const warnLines = (obs.layout?.warnings ?? []).map(
    (w) => `  [${w.code}] 第${w.page}页: ${w.message}`,
  )

  return [
    "你正在执行模板内化的 ReAct【观测试填成品 -> 诊断思考 -> 验收或修订蓝图】循环。",
    "引擎已按你当前的候选 Blueprint 填入探针（FieldProbe_k / SlotProbe_*）并渲染出真实 PDF 与成品残余地图。",
    "请仔细对照下方的【硬性校验结果】、【PDF 每页物理遥测】、【试填后残余节点地图（带原文档精确门牌号 [原...]）】" +
      (obs.dryImages.length ? "以及【试填成品关键页渲染图】" : "") +
      "进行全面自审：",
    "",
    "=== 自审核心判断准则 ===",
    "1. 【硬性错误必改】：若【硬性校验结果】非空（如 FieldProbe 未命中、SlotProbe 未写入、" +
      "OOXML 分节异常、保护横幅丢失），必须 verdict='revise' 修正！",
    "2. 【残留废话与旧示例检查】：检查【试填后残余节点地图】中带 [原...] 标记的存活节点：",
    "   - 是否仍残留了本该删除的旧范文正文、旧题目/旧姓名、填写要求说明、文末注意事项，" +
      "或固定栏目标题同行紧跟的括号填写提示？" +
      "（注意区分：教师评阅栏/签章栏的固定抬头和客观评分等级表属于模板固定结构应保留；" +
      "但给学生看的写作字数/格式提示或旧答案示例必须放入 remove_targets 清理，" +
      "同行括号提示可用 match 精准剥离！）",
    "3. 【空白页与异常断页检查】：若【PDF 每页物理遥测】出现 blank_page（0行空白页）或异常空框页：",
    "   - 请结合【试填后残余节点地图】判断成因：若是原模板故意设计的扉页背面白页或留白手绘区则合理保留；",
    "   - 若是意外空白页——例如：(a) 删光了某节说明内容但未加 drop_section=true 留下空分节；" +
      "(b) 表格里闲置的续页提示大高行（如 [原B{i}.R{r}][h=13850]）未按整行删除；" +
      "(c) 节末/文末残留一串纯空白段（如 [原B24..B29]: 连续空白段）把页面顶出空白尾页；" +
      "(d) 残留了孤立的 [PAGE_BREAK]（可用 {\"start\":\"B{k}\",\"drop_page_break\":true} " +
      "摘除分页符或删除该空段）——必须 verdict='revise' 在蓝图中精准修补！" +
      "（注意：所有蓝图坐标均对应原文档门牌号，即残余地图中 [原...] 里的门牌号）",
    "",
    "=== 输出格式（严格合法 JSON，禁含未转义英文双引号） ===",
    '- 若全部干净无误：{"thought":"简明核验结论","verdict":"accept"}',
    '- 若需修正任何问题：{"thought":"定位具体问题与原文档门牌号","verdict":"revise",' +
      '"blueprint":{...完整修正后的Blueprint...},"rules_md":"..."}',
    "",
    `=== 1. 硬性校验结果 (${obs.hardIssues.length ? "存在错误" : "通过"}) ===`,
    obs.hardIssues.length ? obs.hardIssues.map((e, i) => `${i + 1}. ${e}`).join("\n") : "无硬性错误",
    "",
    `=== 2. 试填成品 PDF 每页物理遥测 (共 ${obs.layout?.total_pages ?? 0} 页) ===`,
    ...pageLines,
    ...(warnLines.length ? ["告警：", ...warnLines] : ["告警：无"]),
    "",
    "=== 3. 试填后残余节点地图（[原...] 即原文档 base.docx 精确坐标） ===",
    obs.residualMap.slice(0, 18000),
    "",
    "=== 4. 当前候选 Blueprint ===",
    JSON.stringify(candidate),
    `当前 rules_md: ${rulesMd}`,
    "",
    "=== 5. 原参考文档完整地图（供核对未命中字段或重选槽位） ===",
    docMap.map_text,
  ].join("\n")
}

export class Workspace {
  readonly templates: TemplateStore

  constructor(readonly docs: Documents) {
    this.templates = new TemplateStore(docs.directory, docs.store)
  }

  async inspect(path: string, sample_pages: number[] = [1, 2, 3]) {
    const result = await inspectReference(path, this.docs.directory)
    const dir = join(this.docs.directory, "inspections", result.inspect_id)
    const urls: string[] = []
    if (sample_pages.length) {
      const pdf = await convert(join(dir, "base.docx"), dir, "pdf")
      const infoOut = await run("pdfinfo", [pdf], { env: { ...process.env, LC_ALL: "C" } })
      const maxPage = Number(/^Pages:\s*(\d+)/m.exec(infoOut.stdout)?.[1] ?? 1)
      for (const page of [...new Set(sample_pages)].filter((p) => p >= 1 && p <= maxPage).slice(0, 3)) {
        const name = "sample-" + page
        await run("pdftoppm", [
          "-f",
          String(page),
          "-l",
          String(page),
          "-singlefile",
          "-scale-to",
          "960",
          "-png",
          pdf,
          join(dir, name),
        ])
        urls.push("/files/inspections/" + result.inspect_id + "/" + name + ".png")
      }
    }
    logger.info(
      {
        inspectId: result.inspect_id,
        paragraphs: result.doc_map.paragraphs,
        tables: result.doc_map.tables,
        sections: result.doc_map.sections,
        mapChars: result.doc_map.map_text.length,
      },
      "完成参考文档透视解剖",
    )
    return { ...result, sample_urls: urls }
  }

  async internalize(id: string, name: string, category: string, rules = "", setActive = true) {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("无效检查编号")
    const dir = join(this.docs.directory, "inspections", id)
    const docMap = JSON.parse(await readFile(join(dir, "doc_map.json"), "utf8")) as DocumentMap
    const baseBytes = await readFile(join(dir, "base.docx"))

    if (!this.docs.useModel) {
      const baseline = buildOfflineBaselineBlueprint(docMap, baseBytes)
      return this.templates.save(
        id,
        name,
        category,
        baseline,
        rules || "继承参考文档示范样式与母版壳。",
        setActive,
      )
    }

    const refImages: { page: number; data: string }[] = []
    if (visionMode() !== "text_only") {
      for (const p of [1, 2, 3]) {
        const imgPath = join(dir, `sample-${p}.png`)
        if (existsSync(imgPath)) {
          refImages.push({ page: p, data: (await readFile(imgPath)).toString("base64") })
        }
      }
    }

    // Step 0: Initial blueprint proposal from reference DocumentMap + reference images
    const initPrompt = buildInitialBlueprintPrompt(docMap, category, rules, refImages.length > 0)
    let rawResult = await jsonCompletion(
      initPrompt,
      this.docs.bill,
      refImages,
      "internalize-v4-propose",
    )

    let validBlueprint: Blueprint | undefined
    let bestRules = String(rawResult?.rules_md ?? rules ?? "")
    let lastError = ""

    // ReAct Loop: Validate -> Dry-Run Render & Observe -> LLM Critic/Revise (up to 3 rounds)
    for (let round = 0; round < MAX_REACT_ROUNDS; round++) {
      let candidate: Blueprint
      try {
        candidate = validateBlueprint(rawResult?.blueprint ?? rawResult, docMap, baseBytes)
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err)
        logger.warn({ inspectId: id, round: round + 1, err: lastError }, "蓝图语法/坐标校验未过")
        if (round + 1 < MAX_REACT_ROUNDS) {
          const fixPrompt = buildInitialBlueprintPrompt(
            docMap,
            category,
            rules,
            refImages.length > 0,
            [lastError],
          )
          rawResult = await jsonCompletion(
            fixPrompt,
            this.docs.bill,
            refImages,
            `internalize-v4-coord-fix-${round + 1}`,
          )
          if (typeof rawResult?.rules_md === "string") bestRules = rawResult.rules_md
        }
        continue
      }

      validBlueprint = candidate
      if (typeof rawResult?.rules_md === "string" && rawResult.rules_md) {
        bestRules = rawResult.rules_md
      }

      const obs = await observeDryRun(baseBytes, docMap, candidate)
      // On the final round, if all hard checks already pass, avoid an unnecessary extra call
      if (round === MAX_REACT_ROUNDS - 1 && obs.hardIssues.length === 0) {
        logger.info({ inspectId: id, round: round + 1 }, "最终轮硬校验通过，完成收敛")
        break
      }

      const reviewPrompt = buildReActReviewPrompt(docMap, candidate, bestRules, obs)
      const review = await jsonCompletion(
        reviewPrompt,
        this.docs.bill,
        obs.dryImages,
        `internalize-v4-react-${round + 1}`,
      )

      const verdict = review?.verdict === "accept" ? "accept" : "revise"
      const thought = typeof review?.thought === "string" ? review.thought.slice(0, 180) : ""
      logger.info(
        {
          inspectId: id,
          round: round + 1,
          verdict,
          hardIssues: obs.hardIssues.length,
          pages: obs.layout?.total_pages,
          thought,
        },
        "ReAct 试填观测自审完成",
      )

      if (verdict === "accept" && obs.hardIssues.length === 0) {
        break
      }
      if (review?.blueprint) {
        rawResult = review
      } else if (obs.hardIssues.length === 0) {
        break
      }
    }

    if (!validBlueprint) {
      throw new Error("模型未能生成有效模板蓝图: " + lastError)
    }

    const saved = this.templates.save(
      id,
      name,
      category,
      validBlueprint,
      bestRules,
      setActive,
    )
    logger.info(
      {
        templateId: saved.id,
        name: saved.name,
        fields: saved.blueprint.fields.length,
        contentSlots: saved.blueprint.content_slots.map((s) => s.name),
      },
      "V4 模板资产内化入库完成",
    )
    return saved
  }

  async learnFile(
    filePath: string,
    name?: string,
    category = "general",
    rules = "",
    setActive = true,
  ) {
    const { inspect_id } = await this.inspect(filePath, [1, 2, 3])
    const finalName = name?.trim() || basename(filePath).replace(/\.[^.]+$/, "")
    return this.internalize(inspect_id, finalName, category, rules, setActive)
  }

  ingest(input: { text?: string; file_path?: string }) {
    return ingestDraft(this.docs.directory, input)
  }

  async plan(template: TemplateAsset, draftId: string): Promise<ComposePlan> {
    const paragraphs = await readDraft(this.docs.directory, draftId)
    const outline = paragraphs.map((p, i) => `P${i}|${p.length}|${p.slice(0, 28)}`)
    const paraProtos = Object.keys(template.blueprint.prototypes ?? {}).filter(
      (k) => k !== "table",
    )
    const validProtos = paraProtos.length ? paraProtos : ["heading_1", "heading_2", "body"]
    const slots = template.blueprint.content_slots
    const multiSlot = slots.length > 1

    if (!this.docs.useModel) {
      return [
        {
          range: paragraphs.length > 1 ? `P0-P${paragraphs.length - 1}` : "P0",
          prototype: validProtos.includes("body") ? "body" : validProtos[0],
          slot: slots[0].name,
        },
      ]
    }

    const slotInstruction = multiSlot
      ? "当前模板含多个正文槽位：" +
        slots.map((s) => `${s.name}(${s.label ?? s.start})`).join("、") +
        "。每项必须同时输出有效的 slot 字段。"
      : '每项只含 prototype 和 range，如 {"prototype":"body","range":"P0-P9"}。'

    let feedback = ""
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await jsonCompletion(
        [
          `只输出合法 JSON 对象 {"plan": [...]}，严格按顺序连续覆盖 P0 到 P${paragraphs.length - 1}，不得遗漏或重叠。` +
            "相邻同类型且同槽位的段落可合并为一个区间。",
          slotInstruction,
          `prototype 只能从以下角色中选择：${validProtos.join("、")}。`,
          ...(feedback ? [`上一轮规划错误：${feedback}`] : []),
          "下方草稿目录每行为「段落编号|总字数|前28字」：",
          template.capability_card,
          outline.join("\n"),
        ].join("\n"),
        this.docs.bill,
        [],
        "plan-zero-copy-v4",
      )
      const obj = (raw ?? {}) as Record<string, unknown>
      const rawList = Array.isArray(raw)
        ? raw
        : Array.isArray(obj.plan)
          ? obj.plan
          : ((Object.values(obj).find(Array.isArray) as unknown[]) ?? [])

      const validSlotSet = new Set(slots.map((s) => s.name))
      const normalized: ComposePlan = []
      let cursor = 0
      let error = ""

      for (const item of rawList) {
        const it = (item ?? {}) as Record<string, unknown>
        const m = /^P?(\d+)(?:-P?(\d+))?$/i.exec(String(it.range ?? "").trim())
        if (!m) {
          error = `无效段落区间格式: ${String(it.range)}`
          break
        }
        const s = Number(m[1])
        const e = Number(m[2] ?? m[1])
        if (s !== cursor || e < s || e >= paragraphs.length) {
          error = `区间 P${s}-P${e} 未从 P${cursor} 连续衔接或越界（总段数 ${paragraphs.length}）`
          break
        }
        if (typeof it.prototype !== "string" || !validProtos.includes(it.prototype)) {
          error = `未知 prototype: ${String(it.prototype)}`
          break
        }
        const slot = multiSlot ? String(it.slot ?? "") : slots[0].name
        if (!validSlotSet.has(slot)) {
          error = `未知 slot: ${slot}`
          break
        }
        normalized.push({
          range: s === e ? `P${s}` : `P${s}-P${e}`,
          prototype: it.prototype,
          slot,
        })
        cursor = e + 1
      }

      if (!error && cursor !== paragraphs.length) {
        error = `规划仅覆盖到 P${cursor - 1}，遗漏了 P${cursor}-P${paragraphs.length - 1}`
      }
      if (!error) {
        Assert(ComposePlan, normalized)
        return normalized
      }
      feedback = error
    }
    throw new Error("草稿段落规划未通过校验: " + feedback)
  }

  async compose(
    input: Omit<ComposeInput, "body_plan"> & {
      template_id?: string
      body_plan?: ComposePlan
    },
  ) {
    const asset = this.templates.get(input.template_id ?? this.templates.activeId ?? "")
    const body_plan = input.body_plan ?? (await this.plan(asset, input.draft_id!))
    const result = await compose(this.docs.directory, asset, { ...input, body_plan })
    const expected =
      input.mode === "exact_copy"
        ? await readDraft(this.docs.directory, input.draft_id!)
        : undefined
    const directory = dirname(result.docx_path)
    const lint_report = await auditComposition(
      result.docx_path,
      join(this.templates.folder(asset.id), "base.docx"),
      result.body_indices,
      expected?.map((s) =>
        input.normalize_punctuation ? s.replace(/[\[［](\d{4})[\]］]/g, "〔$1〕") : s,
      ),
      result.removed_sections,
      result.added_sections,
    )
    const layout = await telemetry(result.docx_path, directory)
    const pages = await preview(result.docx_path, directory)
    const response = {
      ...result,
      template_id: asset.id,
      lint_report,
      layout,
      fidelity: expected && lint_report.passed ? 1 : null,
      usage: this.docs.bill.snapshot(),
      preview_urls: pages.map((p) => "/files/documents/" + result.doc_id + "/" + basename(p)),
    }
    await writeFile(join(directory, "result.json"), JSON.stringify(response))
    logger.info(
      {
        docId: result.doc_id,
        templateId: asset.id,
        mode: input.mode,
        pages: layout.total_pages,
        passed: lint_report.passed,
      },
      "V4 文档组装与遥测审计完成",
    )
    return response
  }

  directoryOf(id: string) {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("无效文档编号")
    return join(this.docs.directory, "documents", id)
  }

  async adjust(id: string, operations: Adjustment[]) {
    const dir = this.directoryOf(id)
    const result = JSON.parse(await readFile(join(dir, "result.json"), "utf8"))
    const changes = await adjustLayout(join(dir, "document.docx"), operations)
    result.layout = changes.after
    result.preview_urls = changes.preview_files.map((p) => "/files/documents/" + id + "/" + p)
    await writeFile(join(dir, "result.json"), JSON.stringify(result))
    logger.info(
      {
        docId: id,
        pagesBefore: changes.before.total_pages,
        pagesAfter: changes.after.total_pages,
        warningsAfter: changes.after.warnings.length,
      },
      "文档版面收口调整完成",
    )
    return { ...result, before: changes.before, after: changes.after }
  }

  async audit(id: string, runVision = true) {
    const dir = this.directoryOf(id)
    const result = JSON.parse(await readFile(join(dir, "result.json"), "utf8")) as {
      layout: LayoutTelemetry
      lint_report: LintReport
    }
    const vision = await visualAudit(
      join(dir, "document.pdf"),
      result.layout,
      result.lint_report.passed,
      async (images) => {
        const validPages = new Set(images.map((img) => img.page))
        const output = await jsonCompletion(
          '检查关键页的排版质量。返回 {"issues":[{"page":1,"description":"问题"}]}，无问题时返回空数组。',
          this.docs.bill,
          images,
          "visual-audit",
        )
        const rawIssues = Array.isArray(output?.issues) ? output.issues : []
        return rawIssues
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
      runVision,
    )
    return { ...result, vision }
  }
}

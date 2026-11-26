import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, join } from "node:path"
import { promisify } from "node:util"
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
  parseXml,
  preview,
  readDraft,
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
    if (f.coord !== undefined && !validCoord(f.coord)) {
      throw new Error(`fields[${cleanName}] 的坐标 ${String(f.coord)} 在文档中不存在`)
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

async function verifyBlueprintDryRun(
  baseBytes: Uint8Array,
  docMap: DocumentMap,
  blueprint: Blueprint,
): Promise<string[]> {
  const issues: string[] = []
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
      issues.push("OOXML结构审计未通过: " + JSON.stringify(audit.violations[0]))
    }

    const layout = await telemetry(out.docx_path, work)
    const blankWarnings = layout.warnings.filter((w) => w.code === "blank_page")
    if (blankWarnings.length > 0) {
      issues.push(
        `渲染后出现空白页 (${blankWarnings.map((w) => "第" + w.page + "页").join("、")})：` +
          "若删除了整节说明页，请确认 remove_targets 覆盖该节完整起止块并设置 drop_section=true。",
      )
    }

    const origRoot = parseXml(unzipSync(baseBytes)["word/document.xml"]).documentElement!
    const origCompact = (origRoot.textContent ?? "").replace(/\s+/g, "")
    const outRoot = parseXml(
      unzipSync(await readFile(out.docx_path))["word/document.xml"],
    ).documentElement!
    const fullCompact = (outRoot.textContent ?? "").replace(/\s+/g, "")

    for (const fixed of blueprint.must_preserve ?? []) {
      const needle = fixed.replace(/\s+/g, "")
      if (needle && origCompact.includes(needle) && !fullCompact.includes(needle)) {
        issues.push(`声明必须保留的固定文本「${fixed}」在试填后丢失，请勿将其所在节点覆盖或删除。`)
      }
    }

    for (const cs of blueprint.content_slots) {
      if (!fullCompact.includes(`SlotProbe_${cs.name}`)) {
        issues.push(`正文槽位 ${cs.name} (${cs.start}..${cs.end}) 试填内容未写入文档。`)
      }
    }

    if (blueprint.fields.length > 0 && !blueprint.cover_builder?.enabled) {
      const missingFields = blueprint.fields.filter(
        (_, idx) => !fullCompact.includes(`FieldProbe_${idx + 1}`),
      )
      if (missingFields.length > 0) {
        issues.push(
          `以下 fields 试填未生效：${missingFields.map((f) => `${f.name}@${f.coord}[${f.mode ?? ""}]`).join(", ")}。` +
            "请核对 coord、mode('blank'|'match'|'cell'|'colon')、blank_index 与 match 原词。",
        )
      }
    }
  } catch (e) {
    issues.push("蓝图校验或试填渲染失败: " + (e instanceof Error ? e.message : String(e)))
  } finally {
    db.db.close()
    await rm(work, { recursive: true, force: true })
  }
  return issues
}

function buildInternalizePrompt(
  docMap: DocumentMap,
  category: string,
  userRules: string,
  hasImages: boolean,
  feedbackErrors?: string[],
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
    '    "must_preserve": ["原文档不可覆盖的固定主横幅或机构抬头文本"],',
    '    "prototypes": {"heading_1":"B10","heading_2":"B11","body":"B12"},',
    '    "cover_builder": {"enabled": false},',
    '    "toc": {"mode": "none | refresh_existing | generate"},',
    '    "preserved": ["页眉","多节版式"]',
    "  },",
    '  "rules_md": "简明排版约束（160字以内纯文本，禁含未转义英文双引号）"',
    "}",
    "",
    "=== 门牌号与蓝图协议规范 ===",
    "1. 【门牌号语法】：",
    "   - 顶层段落或表格：B{i}",
    "   - 表格单元格：B{i}.R{r}.C{c}；单元格内第 p 段：B{i}.R{r}.C{c}.P{p}",
    "   - 段落内挂载的浮动文本框：B{i}.TX{t}；文本框内第 p 段：B{i}.TX{t}.P{p}",
    "   - 顶层内容控件内第 p 段：D{d}.P{p}",
    "2. 【元数据槽位 (fields)】：",
    "   - 识别封面、表头或签署区的可变元数据项，语义化命名（如 title, author, student_name, student_id, " +
      "course, college, major, class_name, advisor, date, party_a, party_b, contract_no 等）。",
    "   - 原文档正文（B/D节点）中固定的机构横幅或文种大抬头可将其原文字面子串放入 must_preserve 保护" +
      "（切勿填写页眉页脚文本或图形描述），绝不能设为可覆盖的 field 或 content_slot！只有专门填写具体文档题目的位置才设为 title。",
    "   - mode 取值规则：",
    "     * 'blank'：地图中标有 [空k:...] 的段落，每个空单独声明一个 field，blank_index 对应 k (0, 1, 2...)；",
    "     * 'match'：无 [空k]，而在段落中直接写死了示例文本或占位串，设 mode='match' 且 match 精确填原件子串；",
    "     * 'cell'：独立承载单个字段值的表格单元格（B{i}.R{r}.C{c}）或整段占一行的独立值段落；",
    "     * 'colon'：形如 '标签：旧值' 的单字段段落，替换冒号后内容。",
    "3. 【正文槽位 (content_slots)】：",
    "   - start 与 end 必须位于同一父容器（同为顶层 B{i}..B{j}，或同一单元格内 P{a}..P{b}，或单个单元格 B{i}.R{r}.C{c}）。",
    "   - 若文档主体是外框表格（正文填写在表格大单元格内），设 template_kind='form_table'，将 content_slots " +
      "指向表格内部承载正文的单元格或格内示例段落区间，切勿指向表外空段。",
    "   - 若文档印有多个需要保留的固定分栏标题，为各栏分别声明命名 content_slot（填好 label）：" +
      "若栏内有待替换的示例段则对示例段设 placement='replace'；若固定标题后紧邻下一栏无空段，对该标题设 placement='insert_after'。",
    "   - 若文档是连续流式示例正文，用单个 body 槽位（placement='replace'）完整覆盖所有旧示例章节与正文首尾块，" +
      "仅保留文末固定的签章/评阅区。",
    "4. 【清理目标 (remove_targets)】：",
    "   - 填写说明、示例提示语、预填评语等应放入 remove_targets。",
    "   - 若地图中某一独立物理分节（=== 第 k 节 B{s}..B{e} ===）整节均为不打印说明页，将完整区间 B{s}..B{e} 放入 " +
      "remove_targets 并显式设置 drop_section=true，以彻底移除该节避免残留空白页；普通段落删除不要设 drop_section。",
    "   - 若固定栏目标题同行带有仅需局部剥离的括号填写提示，使用 {\"start\":\"...\",\"match\":\"原提示子串\"} 局部删除。",
    "   - 若正文区段落挂载了大量排版批注浮动文本框，使用 {\"start\":\"B{s}\",\"end\":\"B{e}\",\"only_textboxes\":true} 批量剥离。",
    "5. 【样式原型与生成组件 (prototypes / cover_builder / toc)】：",
    "   - prototypes 的段落角色（heading_1, heading_2, heading_3, body）必须指向段落节点；" +
      "prototypes.table 仅当存在列宽均匀的普通数据表时填写，切勿指向带合并格的外框布局表。",
    "   - 仅当原文档完全没有封面/表头且确实需要新建独立封面时才设 cover_builder.enabled=true；已有封面或表头时必须为 false。",
    "   - 原文档含目录控件（已有目录TOC=true）设 toc.mode='refresh_existing'；需新建目录设 'generate'；无需目录设 'none'。",
    ...(feedbackErrors?.length
      ? [
          "",
          "=== 上一轮蓝图在验证与渲染自检中发现以下问题，请针对性修正 ===",
          ...feedbackErrors.map((e, i) => `${i + 1}. ${e}`),
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
    `=== 门牌号文档地图 (DocumentMap) ===`,
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

    const images: { page: number; data: string }[] = []
    if (visionMode() !== "text_only") {
      for (const p of [1, 2, 3]) {
        const imgPath = join(dir, `sample-${p}.png`)
        if (existsSync(imgPath)) {
          images.push({ page: p, data: (await readFile(imgPath)).toString("base64") })
        }
      }
    }

    let feedback: string[] | undefined
    let validBlueprint: Blueprint | undefined
    let bestRules = ""
    let lastError = ""

    for (let attempt = 0; attempt < 2; attempt++) {
      const prompt = buildInternalizePrompt(docMap, category, rules, images.length > 0, feedback)
      const result = await jsonCompletion(
        prompt,
        this.docs.bill,
        images,
        attempt === 0 ? "internalize-v4" : "internalize-v4-repair",
      )
      let candidate: Blueprint
      try {
        candidate = validateBlueprint(result?.blueprint ?? result, docMap, baseBytes)
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err)
        logger.warn({ inspectId: id, attempt: attempt + 1, err: lastError }, "蓝图结构校验未通过")
        feedback = [lastError]
        continue
      }

      validBlueprint = candidate
      bestRules = String(result?.rules_md ?? rules ?? "")

      const issues = await verifyBlueprintDryRun(baseBytes, docMap, candidate)
      if (issues.length === 0) {
        logger.info({ inspectId: id, attempt: attempt + 1 }, "模板试填转PDF自检通过")
        break
      }
      logger.warn(
        { inspectId: id, attempt: attempt + 1, issues },
        "模板试填自检发现问题，反馈模型修正",
      )
      feedback = issues
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

  private directory(id: string) {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("无效文档编号")
    return join(this.docs.directory, "documents", id)
  }

  async adjust(id: string, operations: Adjustment[]) {
    const dir = this.directory(id)
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
    const dir = this.directory(id)
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

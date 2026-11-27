import { strict as assert } from "node:assert"
import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { availableParallelism, tmpdir } from "node:os"
import { join } from "node:path"
import { loadEnvFile } from "node:process"
import { promisify } from "node:util"
import { unzipSync } from "fflate"
import {
  adjustLayout,
  auditComposition,
  bodyBlocks,
  compose,
  inspectReference,
  parseXml,
  preview,
  Store,
  telemetry,
  TemplateStore,
  visionMode,
  visualAudit,
  W,
} from "../packages/engine/src/index.js"
import { Documents } from "../packages/server/src/documents.js"
import { Workspace } from "../packages/server/src/workspace.js"

const run = promisify(execFile)

interface CorpusManifestItem {
  file: string
  sha256: string
  domain?: string
  doc_type?: string
  source_org: string
}

function makeLongDraft(
  title: string,
  recipient: string,
  sections: [string, string[]][],
  tail: [string, string],
) {
  const lines = [title, recipient]
  for (const [heading, items] of sections) {
    lines.push(heading)
    for (const item of items) lines.push(item)
  }
  lines.push(tail[0], tail[1])
  return lines.join("\n")
}

function buildSixLongDrafts() {
  const p = (prefix: string, body: string, repeat: number) =>
    prefix +
    Array.from({ length: repeat }, (_, i) => body + "（核查细则第" + (i + 1) + "条）").join("；") +
    "。"
  return [
    {
      id: "zc_01_gongwen_safety",
      domain: "gongwen",
      template_dir: "eval/real_docs",
      template_file: "real_01_cdsu_red_notice.docx",
      text: makeLongDraft(
        "关于开展2026年度高校重点实验室危化品与特种设备全流程专项治理的通知",
        "各二级学院、国家重点实验室、分析测试中心：",
        [
          [
            "一、总体目标与排查范围",
            [
              p(
                "1.全面摸清风险底数。",
                "各教学科研单位须对照教育部实验室安全分级分类管理规范，逐间核查实验场所危险源分布、通风联锁装置与应急喷淋设施运行状态",
                6,
              ),
              p(
                "2.严格危化品闭环台账。",
                "针对易制毒、易制爆及剧毒试剂建立从采购审批、双人收发、恒温储存到废液回收的电子化动态追踪记录，账物相符率须达到百分之百",
                6,
              ),
            ],
          ],
          [
            "二、重点整治任务与责任分工",
            [
              p(
                "1.强化高压与高温设备巡检。",
                "高压灭菌锅、反应釜、气瓶柜及马弗炉等设备必须张贴安全操作规程与定检合格标识，严禁超期服役或无人值守连续过夜通电运行",
                6,
              ),
              p(
                "2.完善应急演练与准入培训。",
                "新入学研究生与科研助理须完成不少于十六学时的专项安全实操考核并签订安全承诺书，未通过考核人员一律不得开通门禁权限",
                6,
              ),
            ],
          ],
        ],
        ["实验室与设备管理处", "2026年11月25日"],
      ),
    },
    {
      id: "zc_02_gongwen_data",
      domain: "gongwen",
      template_dir: "eval/real_docs",
      template_file: "real_13_ccnu_gbt_template.doc",
      text: makeLongDraft(
        "关于印发数字化校园核心业务系统数据分类分级与容灾备份实施细则的通知",
        "机关各部处、直属单位、信息化办公室：",
        [
          [
            "一、数据资产目录与分级保护机制",
            [
              p(
                "1.建立统一元数据台账。",
                "各业务归口管理部门应当按季度梳理教务、财务、人事与科研管理系统的结构化库表字段，明确敏感个人信息与核心业务数据的脱敏传输边界",
                7,
              ),
              p(
                "2.落实最小权限访问控制。",
                "跨部门数据共享一律通过学校数据中台标准接口采取令牌鉴权与字段级授权调用，严禁私自导出原始全量数据库文件或通过非加密渠道流转",
                7,
              ),
            ],
          ],
          [
            "二、异地容灾备份与恢复演练要求",
            [
              p(
                "1.执行多副本定时快照策略。",
                "核心数据库须配置实时主从复制、每日增量快照与每周异地离线磁带归档，确保硬件故障或网络攻击场景下恢复点目标不超过十五分钟",
                7,
              ),
              p(
                "2.常态化开展全链路切换演练。",
                "信息化办公室每学期组织不少于两次无脚本应急接管测试，完整记录故障发现、流量切流、数据一致性校验及业务回切全过程耗时",
                7,
              ),
            ],
          ],
        ],
        ["网络安全与信息化领导小组办公室", "2026年11月25日"],
      ),
    },
    {
      id: "zc_03_thesis_pku",
      domain: "academic",
      template_dir: "eval/real_docs_v3",
      template_file: "v3_01_pku_master_thesis.docx",
      text: makeLongDraft(
        "第3章 基于样式指纹聚类的低成本文档骨架压缩与原型克隆机制",
        "3.1 引言与问题形式化定义",
        [
          [
            "3.2 面向深层 OOXML 的多维样式指纹提取方法",
            [
              p(
                "针对复杂学位论文模板动辄包含数百个段落与二十余个分节符的结构特征，",
                "若直接将原始 XML 序列化文本输入大语言模型，不仅单次提示词开销高达数万词元，而且极易引发注意力稀释与属性命名空间幻觉",
                8,
              ),
              p(
                "为此本文设计一种确定性的样式指纹哈希函数，",
                "联合提取段落样式引用、东亚与西文字体族、半点字号、行距规则、首行缩进、编号级别及表格网格列数作为等价类划分依据",
                8,
              ),
            ],
          ],
          [
            "3.3 原生节点深拷贝与跨文档命名空间安全插入",
            [
              p(
                "在组装生成阶段，引擎完全摒弃由模型直接拼写代码的高风险路径，",
                "通过 importNode 深拷贝母版示范节点的底层属性树，并严格依照 WordprocessingML 元素顺序表插入加粗、下划线与文档网格节点",
                8,
              ),
              p(
                "实验表明该策略在保留原件校徽图片、奇偶页眉与参考文献悬挂缩进的同时，",
                "实现了复杂多节论文母版下正文字符百分之百零改写保真输出",
                8,
              ),
            ],
          ],
        ],
        ["本章小结：确定性引擎与语义规划解耦显著提升了排版可靠性。", "2026年11月25日"],
      ),
    },
    {
      id: "zc_04_thesis_szu",
      domain: "academic",
      template_dir: "eval/real_docs_v3",
      template_file: "v3_02_szu_master_thesis.docx",
      text: makeLongDraft(
        "第4章 双轨版面遥测与确定性收口算法实验评估",
        "4.1 实验语料构建与评测指标体系",
        [
          [
            "4.2 基于 Poppler 几何坐标解析的版面缺陷检测",
            [
              p(
                "传统纯文本检查无法感知分页后的真实物理落点，",
                "导致公文末页仅余两行孤立落款或统计表格在页底被生硬截断等高频打印排版瑕疵长期依赖人工肉眼逐页翻查",
                9,
              ),
              p(
                "本文利用 LibreOffice 无头转换与 pdftohtml 坐标流解析，",
                "按垂直基线聚类还原每页真实行数、页底占空比及跨页延续单元格，在毫秒级开销下准确定位尾巴溢出与见章不见文现象",
                9,
              ),
            ],
          ],
          [
            "4.3 渐进式行距段距微调与历史图像阅后即焚分析",
            [
              p(
                "当遥测模块检出末页少量溢出时，版面收口算子自动在可读性安全下界内迭代紧缩行距与段后距，",
                "直至冗余尾页收敛消除并重新渲染预览图，全程无需消耗额外大模型生成开销",
                9,
              ),
              p(
                "对于启用多模态视觉终审的场景，上下文钩子在审阅轮次结束后立即将历史消息中的图像数据块替换为单行摘要，",
                "彻底杜绝多轮对话中大体积编码数据重复计费的问题",
                8,
              ),
            ],
          ],
        ],
        ["参考文献：[1] GB/T 9704—2012 党政机关公文格式标准。", "2026年11月25日"],
      ),
    },
    {
      id: "zc_05_form_seu",
      domain: "form",
      template_dir: "eval/real_docs_v3",
      template_file: "v3_04_seu_national_rd_form.docx",
      text: makeLongDraft(
        "国家重点研发计划重点专项项目申报书正文：高可靠智能文档工程关键技术研究",
        "一、立项依据与国内外研究现状综述",
        [
          [
            "二、研究内容、关键科学问题与技术路线",
            [
              p(
                "课题一聚焦跨领域复杂版式文档的结构化逆向解剖，",
                "突破二进制复合文档魔数识别、多级样式继承链消解、浮动图形保留区锚定以及复杂嵌套框表寻址等核心工程瓶颈",
                7,
              ),
              p(
                "课题二重点攻关零拷贝保真套版与确定性流式修复技术，",
                "建立本地段落编号仓库与区间映射协议，确保数千字技术方案在套用国家专项申报书母版过程中不发生任何字符篡改或段落遗漏",
                7,
              ),
            ],
          ],
          [
            "三、年度研究计划与预期考核指标",
            [
              p(
                "第一年度完成全栈单进程文档引擎与六十份真实跨领域语料基准建设，",
                "实现公文、学位论文、实验报告、课题申报表与技术合同场景的端到端自动化提取、留壳套版与独立审计验证",
                7,
              ),
              p(
                "第二年度完成轻量化双轨版面诊断工作台研制与规模化示范应用，",
                "在支持无壳文档自动补齐首页封面与自动目录的同时，综合版面合规率达到百分之百",
                7,
              ),
            ],
          ],
        ],
        ["项目牵头申报单位：智能软件工程联合研究中心", "2026年11月25日"],
      ),
    },
    {
      id: "zc_06_contract_shgov",
      domain: "contract",
      template_dir: "eval/real_docs_v3",
      template_file: "v3_08_shgov_coop_dev_contract.doc",
      text: makeLongDraft(
        "技术开发（合作）合同专项条款：企业级文档解析与排版平台联合研发",
        "甲方：长三角数智政务科技有限公司；乙方：先进软件工程技术研究院：",
        [
          [
            "第一条 合作研发内容、技术指标与分工安排",
            [
              p(
                "1.1 甲方负责提供真实政企办公场景需求定义、脱敏版式样本与集成联调环境，",
                "按里程碑节点组织业务专家开展功能核验并及时支付阶段性研发经费，协助办理项目成果登记与安全合规测评手续",
                6,
              ),
              p(
                "1.2 乙方负责完成全栈 TypeScript 单进程排版引擎、模板资产库与双模式前端工作台的核心架构研发，",
                "确保交付系统支持二进制旧版文档转换并通过全部独立审计与版面遥测门禁",
                6,
              ),
            ],
          ],
          [
            "第二条 成果交付验收、知识产权归属与违约责任",
            [
              p(
                "2.1 合作开发所形成的新增源代码、技术文档及评测基准知识产权由甲乙双方共同享有，",
                "未经对方书面同意，任何一方不得向第三方转让核心专有技术秘密或超出本合同约定范围进行商业化转授权",
                6,
              ),
              p(
                "2.2 乙方承诺所交付软件模块不侵犯任何第三方合法专利权或著作权，",
                "验收测试期间如发现重大版式失真或数据损毁缺陷，乙方须在五个工作日内无偿完成定向修复并通过复审验证",
                6,
              ),
            ],
          ],
        ],
        ["甲乙双方联合项目管委会", "2026年11月25日"],
      ),
    },
  ]
}

async function runPool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, idx: number) => Promise<R>,
) {
  const results = new Array<R>(items.length)
  let next = 0
  async function loop() {
    while (next < items.length) {
      const idx = next++
      results[idx] = await worker(items[idx], idx)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => loop()))
  return results
}

function resolveBenchConcurrency(): number {
  const arg = process.argv.slice(2).find((a) => /^(-c|--concurrency)=?\d*$/.test(a))
  let fromCli = 0
  if (arg) {
    const eq = arg.split("=")[1]
    if (eq) {
      fromCli = Number(eq)
    } else {
      const next = process.argv[process.argv.indexOf(arg) + 1]
      fromCli = Number(next)
    }
  }
  const raw =
    fromCli ||
    Number(process.env.BENCH_CONCURRENCY || process.env.CONCURRENCY) ||
    Math.min(12, Math.max(6, availableParallelism() - 2))
  return Math.max(1, Math.floor(raw))
}

async function main() {
  if (existsSync(".env")) loadEnvFile(".env")
  const concurrency = resolveBenchConcurrency()
  const tStart = Date.now()
  const startedAt = new Date().toISOString()
  const modelId = process.env.LLM_MODEL || "unconfigured"
  const activeVisionMode = visionMode()
  const workRoot = await mkdtemp(join(tmpdir(), "docforge-bench-v4-"))

  try {
    const m1 = JSON.parse(
      await readFile("eval/real_docs/manifest.json", "utf8"),
    ) as CorpusManifestItem[]
    const m2 = JSON.parse(
      await readFile("eval/real_docs_v3/manifest.json", "utf8"),
    ) as CorpusManifestItem[]
    assert.equal(m1.length, 16)
    assert.equal(m2.length, 14)

    const allDocs = [
      ...m1.map((item) => ({ ...item, dir: "eval/real_docs", category: "gongwen" })),
      ...m2.map((item) => ({
        ...item,
        dir: "eval/real_docs_v3",
        category: item.domain || "contract",
      })),
    ]

    console.log(
      `=== [1/4] Running 30 Real Cross-Domain Documents Full Pipeline (concurrency=${concurrency}) ===`,
    )
    const corpusResults = await runPool(allDocs, concurrency, async (entry) => {
      const source = join(entry.dir, entry.file)
      const bytes = await readFile(source)
      const sha256 = createHash("sha256").update(bytes).digest("hex")
      assert.equal(sha256, entry.sha256, "SHA256 mismatch: " + entry.file)

      const docDir = await mkdtemp(join(workRoot, "corpus-"))
      const db = new Store(join(docDir, "profiles.db"))
      try {
        const { inspect_id, doc_map } = await inspectReference(source, docDir)
        const basePath = join(docDir, "inspections", inspect_id, "base.docx")
        const baseZip = unzipSync(await readFile(basePath))
        const rawXmlChars = Buffer.from(baseZip["word/document.xml"]).toString("utf8").length
        const mapChars = doc_map.map_text.length

        const root = parseXml(baseZip["word/document.xml"]).documentElement!
        const blocks = bodyBlocks(root)
        let idx = blocks.findIndex(
          (e) =>
            e.localName === "p" &&
            e.textContent?.trim() &&
            ["pict", "drawing", "sectPr"].every((tag) => !e.getElementsByTagNameNS(W, tag).length),
        )
        if (idx < 0) idx = blocks.findIndex((e) => e.localName === "p")
        assert(idx >= 0, entry.file + " must have at least one paragraph block")
        const anchor = "B" + idx

        const store = new TemplateStore(docDir, db)
        const asset = store.save(
          inspect_id,
          entry.file,
          entry.category,
          {
            template_kind: "flowing",
            fields: [],
            content_slots: [{ name: "body", start: anchor, end: anchor }],
            prototypes: { body: anchor, heading_3: anchor },
            preserved: doc_map.preserved,
          },
          "保留母版壳、媒体图片与页眉页脚样式。",
          true,
        )

        const sampleLines = [
          "一、专项阶段核查要点。请各责任主体严格对照母版规范逐项落实执行。",
          "各参建团队应按期提交阶段性成果台账并做好原始凭证归档。",
        ]
        const composed = await compose(docDir, asset, {
          mode: "authored",
          body_plan: [
            { prototype: "heading_3", text: sampleLines[0] },
            { prototype: "body", text: sampleLines[1] },
          ],
        })
        const audit = await auditComposition(
          composed.docx_path,
          basePath,
          composed.body_indices,
          sampleLines,
        )
        const outZip = unzipSync(await readFile(composed.docx_path))
        const nonDocKeys = Object.keys(baseZip).filter((k) => k !== "word/document.xml")
        const partsIdentical = nonDocKeys.every(
          (k) => outZip[k] && Buffer.from(outZip[k]).equals(Buffer.from(baseZip[k])),
        )
        const outRoot = parseXml(outZip["word/document.xml"]).documentElement!
        const sectPreserved =
          outRoot.getElementsByTagNameNS(W, "sectPr").length ===
          root.getElementsByTagNameNS(W, "sectPr").length
        const mediaCount = Object.keys(outZip).filter((k) => k.startsWith("word/media/")).length
        const pages = await preview(composed.docx_path, docDir)
        const firstPng = await readFile(pages[0])
        const pngValid = firstPng.subarray(0, 8).toString("hex") === "89504e470d0a1a0a"

        assert(
          audit.passed && partsIdentical && sectPreserved && pngValid,
          entry.file + " compose failed",
        )
        console.log(
          `  [OK] ${entry.file} (${entry.category}): map=${mapChars} chars, ` +
            `media=${mediaCount}, pages=${pages.length}`,
        )
        return {
          file: entry.file,
          category: entry.category,
          source_org: entry.source_org,
          sha256_verified: true,
          raw_xml_chars: rawXmlChars,
          map_chars: mapChars,
          capability_card_chars: asset.capability_card.length,
          media_assets: mediaCount,
          sections: doc_map.sections,
          shell_preserved: partsIdentical && sectPreserved && audit.passed,
          compose_passed: audit.passed,
          png_generated: pngValid,
          png_pages: pages.length,
        }
      } finally {
        db.db.close()
        await rm(docDir, { recursive: true, force: true })
      }
    })

    console.log(
      `=== [2/4] Running 6 Cross-Domain Long-Draft Zero-Copy Benchmarks (concurrency=${concurrency}) ===`,
    )
    const draftsSpec = buildSixLongDrafts()
    const useLlm = Boolean(process.env.LLM_API_KEY)
    const zeroCopyResults = await runPool(draftsSpec, concurrency, async (item) => {
      assert(
        item.text.length >= 1500 && item.text.length <= 5000,
        `${item.id} length ${item.text.length} out of 1500..5000 range`,
      )
      const caseDir = await mkdtemp(join(workRoot, "zerocopy-"))
      const docs = new Documents(caseDir, useLlm)
      try {
        const work = new Workspace(docs)
        const source = join(item.template_dir, item.template_file)
        const { inspect_id, doc_map } = await work.inspect(source, [])
        const basePath = join(caseDir, "inspections", inspect_id, "base.docx")
        const baseZip = unzipSync(await readFile(basePath))
        const root = parseXml(baseZip["word/document.xml"]).documentElement!
        const blocks = bodyBlocks(root)
        const idx = blocks.findIndex(
          (e) =>
            e.localName === "p" &&
            e.textContent?.trim() &&
            ["pict", "drawing", "sectPr"].every((tag) => !e.getElementsByTagNameNS(W, tag).length),
        )
        const anchor = "B" + (idx >= 0 ? idx : 0)
        const asset = work.templates.save(
          inspect_id,
          item.id,
          item.domain,
          {
            template_kind: "flowing",
            fields: [],
            content_slots: [{ name: "body", start: anchor, end: anchor }],
            prototypes: {
              heading_1: anchor,
              heading_3: anchor,
              body: anchor,
            },
            preserved: doc_map.preserved,
          },
          "一级标题用 heading_1，编号首句加粗段用 heading_3，其余正文与落款用 body。",
          true,
        )

        const ingested = await work.ingest({ text: item.text })
        const composed = await work.compose({
          template_id: asset.id,
          mode: "exact_copy",
          draft_id: ingested.draft_id,
          normalize_punctuation: false,
        })

        const outZip = unzipSync(await readFile(composed.docx_path))
        const outDoc = parseXml(outZip["word/document.xml"])
        const allOutParas = Array.from(outDoc.getElementsByTagNameNS(W, "p"))
        const actualText = composed.body_indices
          .map((pi) =>
            Array.from(allOutParas[pi].getElementsByTagNameNS(W, "*"))
              .map((n) =>
                n.localName === "t"
                  ? n.textContent
                  : n.localName === "tab" && n.parentNode?.localName !== "tabs"
                    ? "\t"
                    : n.localName === "br"
                      ? "\n"
                      : "",
              )
              .join(""),
          )
          .join("\n")
        assert.equal(actualText, item.text, item.id + " must match draft character-for-character")
        assert.equal(composed.fidelity, 1)
        if (useLlm) {
          assert(composed.usage.prompt_tokens > 0 && composed.usage.completion_tokens > 0)
        }

        console.log(
          `  [OK] ${item.id}: chars=${item.text.length}, ranges=${composed.body_plan.length}, ` +
            `total_tok=${composed.usage.total_tokens}`,
        )
        return {
          id: item.id,
          domain: item.domain,
          template_file: item.template_file,
          draft_chars: item.text.length,
          draft_paragraphs: ingested.count,
          mapped_ranges: composed.body_plan.length,
          exact_char_match: actualText === item.text,
          fidelity_rate: 100,
          prompt_tokens: composed.usage.prompt_tokens,
          completion_tokens: composed.usage.completion_tokens,
          cached_tokens: composed.usage.cached_tokens,
          total_tokens: composed.usage.total_tokens,
        }
      } finally {
        docs.store.db.close()
        await rm(caseDir, { recursive: true, force: true })
      }
    })

    console.log("=== [3/4] Running Layout Overflow Auto-Closure Benchmark ===")
    const caseDir = await mkdtemp(join(workRoot, "overflow-"))
    const db = new Store(join(caseDir, "profiles.db"))
    const overflowResults = []
    try {
      const store = new TemplateStore(caseDir, db)
      const seed = store.get("builtin-standard-doc")
      const docxPath = join(caseDir, "document.docx")
      const buildDoc = async (bodyCount: number) => {
        const res = await compose(caseDir, seed, {
          mode: "authored",
          slot_values: { title: "关于开展年度档案与实验室安全联合核查的通知" },
          body_plan: [
            ...Array.from({ length: bodyCount }, (_, i) => ({
              prototype: "body",
              text: "第" + (i + 1) + "项核查工作。",
            })),
            { prototype: "body", text: "综合管理办公室" },
            { prototype: "body", text: "2026年11月25日" },
          ],
        })
        await copyFile(res.docx_path, docxPath)
      }
      await buildDoc(21)
      let before = await telemetry(docxPath, caseDir)
      if (!before.warnings.length) {
        const p1Lines = before.pages[0]?.lines ?? 22
        for (let cand = Math.max(8, p1Lines - 4); cand <= p1Lines + 6; cand++) {
          await buildDoc(cand)
          before = await telemetry(docxPath, caseDir)
          if (before.warnings.length > 0 && before.total_pages >= 2) break
        }
      }
      const closed = await adjustLayout(docxPath, [{ type: "compact_pages" }])
      assert.equal(closed.after.warnings.length, 0)
      overflowResults.push({
        pages_before: before.total_pages,
        pages_after: closed.after.total_pages,
        warnings_before: before.warnings.map((w) => w.code),
        warnings_after: closed.after.warnings.length,
      })
    } finally {
      db.db.close()
      await rm(caseDir, { recursive: true, force: true })
    }

    console.log("=== [4/4] Running Visual Audit Key-Page Sampling Check ===")
    const vDir = await mkdtemp(join(workRoot, "vision-"))
    const vDocs = new Documents(vDir, true)
    try {
      const work = new Workspace(vDocs)
      const { inspect_id } = await work.inspect("eval/real_docs_v3/v3_01_pku_master_thesis.docx", [1])
      const baseDocx = join(vDir, "inspections", inspect_id, "base.docx")
      const layout = await telemetry(baseDocx, vDir)
      const pdfPath = join(vDir, "base.pdf")
      const outPrefix = join(vDir, "kp-1")
      await run("pdftoppm", [
        "-f",
        "1",
        "-l",
        "1",
        "-scale-to-x",
        "960",
        "-scale-to-y",
        "-1",
        "-singlefile",
        "-png",
        pdfPath,
        outPrefix,
      ])
      const png = await readFile(outPrefix + ".png")
      assert(png.readUInt32BE(16) <= 960)
      await visualAudit(pdfPath, { ...layout, warnings: [] }, true, async () => [], true)
    } finally {
      vDocs.store.db.close()
      await rm(vDir, { recursive: true, force: true })
    }

    await mkdir("eval", { recursive: true })
    await writeFile(
      "eval/results_v3.json",
      JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          started_at: startedAt,
          elapsed_seconds: Number(((Date.now() - tStart) / 1000).toFixed(2)),
          concurrency,
          llm_model: modelId,
          vision_runtime_mode: activeVisionMode,
          corpus_30: corpusResults,
          zero_copy_6: zeroCopyResults,
          layout_closure: overflowResults,
        },
        null,
        2,
      ) + "\n",
    )
    console.log(
      `=== Cross-Domain Benchmark Complete in ${((Date.now() - tStart) / 1000).toFixed(1)}s (concurrency=${concurrency})! ===`,
    )
  } finally {
    await rm(workRoot, { recursive: true, force: true })
  }
}

await main()

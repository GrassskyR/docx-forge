import { test, expect } from "vitest"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate"
import {
  auditComposition,
  children,
  compose,
  inspectReference,
  parseXml,
  preview,
  R_NS,
  Store,
  TemplateStore,
  W,
} from "../src/index.js"

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
)

test("无壳参考文档：100% 保留页眉校徽 Logo，自动生成同款字体封面、姓名学号下划线框、Word 原生自动目录与三线表", async () => {
  const dir = await mkdtemp(join(tmpdir(), "docforge-v4-missing-"))
  const db = new Store(join(dir, "profiles.db"))
  try {
    const pkgNs = "http://schemas.openxmlformats.org/package/2006"
    const docNs = "http://schemas.openxmlformats.org/officeDocument/2006"
    const wordMime = "application/vnd.openxmlformats-officedocument.wordprocessingml"
    const contentTypes =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="${pkgNs}/content-types">` +
      `<Default Extension="rels" ContentType="${pkgNs}.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Default Extension="png" ContentType="image/png"/>` +
      `<Override PartName="/word/document.xml" ContentType="${wordMime}.document.main+xml"/>` +
      `<Override PartName="/word/styles.xml" ContentType="${wordMime}.styles+xml"/>` +
      `<Override PartName="/word/header1.xml" ContentType="${wordMime}.header+xml"/>` +
      `</Types>`
    const rootRels =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="${pkgNs}/relationships">` +
      `<Relationship Id="rId1" Type="${docNs}/relationships/officeDocument" Target="word/document.xml"/>` +
      `</Relationships>`
    const docRels =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="${pkgNs}/relationships">` +
      `<Relationship Id="rId1" Type="${docNs}/relationships/styles" Target="styles.xml"/>` +
      `<Relationship Id="rIdHdr1" Type="${docNs}/relationships/header" Target="header1.xml"/>` +
      `</Relationships>`
    const hdrRels =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="${pkgNs}/relationships">` +
      `<Relationship Id="rIdLogo" Type="${docNs}/relationships/image" Target="media/school_logo.png"/>` +
      `</Relationships>`
    const headerXml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:hdr xmlns:w="${W}" xmlns:r="${R_NS}">` +
      `<w:p><w:r><w:t>哈尔滨工业大学实验报告专用页眉</w:t></w:r>` +
      `<w:r><w:drawing><a:blip xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
      `r:embed="rIdLogo"/></w:drawing></w:r></w:p></w:hdr>`
    const stylesXml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr>` +
      `<w:rFonts w:eastAsia="宋体" w:ascii="Times New Roman"/><w:sz w:val="24"/>` +
      `</w:rPr></w:rPrDefault></w:docDefaults></w:styles>`
    const docXml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W}" xmlns:r="${R_NS}"><w:body>` +
      `<w:p><w:pPr><w:outlineLvl w:val="0"/></w:pPr>` +
      `<w:r><w:rPr><w:rFonts w:eastAsia="黑体"/><w:b/><w:sz w:val="32"/></w:rPr>` +
      `<w:t>一、示例章节标题</w:t></w:r></w:p>` +
      `<w:p><w:pPr><w:ind w:firstLine="480"/></w:pPr>` +
      `<w:r><w:rPr><w:rFonts w:eastAsia="宋体"/><w:sz w:val="24"/></w:rPr>` +
      `<w:t>这里是一段没有任何封面和目录的裸正文参考样例。</w:t></w:r></w:p>` +
      `<w:sectPr><w:headerReference w:type="default" r:id="rIdHdr1"/>` +
      `<w:pgSz w:w="11906" w:h="16838"/>` +
      `<w:pgMar w:top="1440" w:bottom="1440" w:left="1800" w:right="1800"/></w:sectPr>` +
      `</w:body></w:document>`

    const refPath = join(dir, "bare_ref_with_logo_header.docx")
    await writeFile(
      refPath,
      zipSync({
        "[Content_Types].xml": strToU8(contentTypes),
        "_rels/.rels": strToU8(rootRels),
        "word/_rels/document.xml.rels": strToU8(docRels),
        "word/_rels/header1.xml.rels": strToU8(hdrRels),
        "word/header1.xml": strToU8(headerXml),
        "word/media/school_logo.png": new Uint8Array(TINY_PNG),
        "word/styles.xml": strToU8(stylesXml),
        "word/document.xml": strToU8(docXml),
      }),
    )

    const { inspect_id, doc_map } = await inspectReference(refPath, dir)
    expect(doc_map.style_dna.has_header_logo).toBe(true)
    expect(doc_map.style_dna.header_texts[0]).toContain("哈尔滨工业大学")
    expect(doc_map.style_dna.has_existing_toc).toBe(false)

    const store = new TemplateStore(dir, db)
    const asset = store.save(
      inspect_id,
      "裸正文带校徽页眉参考件",
      "thesis",
      {
        template_kind: "flowing",
        fields: [],
        content_slots: [{ name: "body", start: "B0", end: "B1", placement: "replace" }],
        prototypes: { heading_1: "B0", body: "B1" },
        cover_builder: {
          enabled: true,
          banner: "哈尔滨工业大学",
          subtitle: "课程实验报告",
          fields: [
            { name: "course", label: "课程名称" },
            { name: "student_name", label: "学生姓名" },
            { name: "student_id", label: "学号" },
            { name: "major", label: "专业班级" },
            { name: "advisor", label: "指导教师" },
            { name: "date", label: "实验日期" },
          ],
        },
        toc: { mode: "generate" },
        preserved: doc_map.preserved,
      },
      "保留校徽页眉，自动生成首页、姓名学号下划线框与自动目录。",
      true,
    )

    const out = await compose(dir, asset, {
      mode: "authored",
      slot_values: {
        title: "进程死锁检测与恢复机制实验",
        course: "操作系统内核实验",
        student_name: "林知远",
        student_id: "2026308801",
        major: "计算机2401班",
        advisor: "周明华",
        date: "2026年11月26日",
      },
      body_plan: [
        { prototype: "heading_1", text: "1. 实验目标与环境" },
        { prototype: "body", text: "验证资源分配图化简算法在多线程竞争场景下的准确性。" },
        {
          prototype: "table",
          rows: [
            ["样本组", "线程数", "平均耗时ms"],
            ["组A", "8", "1.25"],
            ["组B", "16", "2.40"],
          ],
        },
        { prototype: "heading_1", text: "2. 实验结论" },
        { prototype: "body", text: "周期性死锁检测开销可控且完全消除了永久阻塞。" },
      ],
    })

    const baseDocx = join(dir, "inspections", inspect_id, "base.docx")
    const audit = await auditComposition(
      out.docx_path,
      baseDocx,
      out.body_indices,
      [
        "1. 实验目标与环境",
        "验证资源分配图化简算法在多线程竞争场景下的准确性。",
        "2. 实验结论",
        "周期性死锁检测开销可控且完全消除了永久阻塞。",
      ],
      out.removed_sections,
      out.added_sections,
    )
    expect(audit.passed).toBe(true)

    const outZip = unzipSync(await readFile(out.docx_path))
    expect(Buffer.from(outZip["word/media/school_logo.png"])).toEqual(TINY_PNG)
    expect(strFromU8(outZip["word/header1.xml"])).toContain("rIdLogo")

    const outDoc = parseXml(outZip["word/document.xml"])
    const outXml = strFromU8(outZip["word/document.xml"])
    // 1. Cover section has NO headerReference (school logo header isolated to body pages)
    const allSectPrs = Array.from(outDoc.getElementsByTagNameNS(W, "sectPr"))
    expect(allSectPrs.length).toBe(3) // Cover + TOC + Body
    expect(children(allSectPrs[0], "headerReference").length).toBe(0)
    expect(children(allSectPrs[2], "headerReference").length).toBe(1)

    // 2. Cover has school banner, title, and bottom-bordered input underline cells
    expect(outXml).toContain("哈尔滨工业大学")
    expect(outXml).toContain("进程死锁检测与恢复机制实验")
    expect(outXml).toContain("林知远")
    expect(outXml).toContain("2026308801")
    const coverTable = outDoc.getElementsByTagNameNS(W, "tbl")[0]
    const bottomSingles = Array.from(coverTable.getElementsByTagNameNS(W, "bottom")).filter(
      (b) => b.getAttributeNS(W, "val") === "single",
    )
    expect(bottomSingles.length).toBe(6)

    // 3. Native Word TOC SDT exists with TOC \o "1-3" and populated headings
    expect(outXml).toContain('TOC \\o "1-3"')
    expect(outXml).toContain("1. 实验目标与环境")
    expect(outXml).toContain("2. 实验结论")

    // 4. Synthesized academic three-line table exists in body
    const dataTable = outDoc.getElementsByTagNameNS(W, "tbl")[1]
    expect(dataTable.textContent).toContain("平均耗时ms")

    // 5. LibreOffice renders multi-page PNGs cleanly
    const pages = await preview(out.docx_path, dir)
    expect(pages.length).toBeGreaterThanOrEqual(3)
  } finally {
    db.db.close()
    await rm(dir, { recursive: true, force: true })
  }
}, 60_000)

test("复杂框表手术：同行多空位宽度守恒填写、跨 Run 子串匹配替换、固定栏目多槽位插入与浮动批注框精准剥离", async () => {
  const dir = await mkdtemp(join(tmpdir(), "docforge-v4-form-"))
  const db = new Store(join(dir, "profiles.db"))
  try {
    const base = unzipSync(await readFile("eval/fixtures/01.docx"))
    const mcNs = "http://schemas.openxmlformats.org/markup-compatibility/2006"
    const docXml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W}" xmlns:mc="${mcNs}"><w:body>` +
      `<w:p><w:r><w:t>天津理工大学实验报告专用纸</w:t></w:r>` +
      `<mc:AlternateContent>` +
      `<mc:Choice Requires="wps"><w:drawing><w:txbxContent>` +
      `<w:p><w:r><w:t>请勿修改框线宽度（打印前删除此提示框）</w:t></w:r></w:p>` +
      `</w:txbxContent></w:drawing></mc:Choice>` +
      `<mc:Fallback><w:pict><w:textbox><w:txbxContent>` +
      `<w:p><w:r><w:t>请勿修改框线宽度（打印前删除此提示框）</w:t></w:r></w:p>` +
      `</w:txbxContent></w:textbox></w:pict></mc:Fallback>` +
      `</mc:AlternateContent></w:p>` +
      // B1: inline multi-blank header (3 underline blanks + 1 cross-run prefilled student ID)
      `<w:p>` +
      `<w:r><w:t>姓名</w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>        </w:t></w:r>` +
      `<w:r><w:t> 班级</w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>          </w:t></w:r>` +
      `<w:r><w:t> 学号：</w:t></w:r><w:r><w:t>U2016</w:t></w:r><w:r><w:t>12345</w:t></w:r>` +
      `</w:p>` +
      // B2: full-page form table with fixed headings inside cells
      `<w:tbl><w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="6500"/></w:tblGrid>` +
      `<w:tr><w:tc><w:p><w:r><w:t>课程名称</w:t></w:r></w:p></w:tc>` +
      `<w:tc><w:p><w:r><w:t>旧示例课程</w:t></w:r></w:p></w:tc></w:tr>` +
      `<w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr>` +
      `<w:p><w:r><w:b/><w:t>一、实验目的</w:t></w:r></w:p>` +
      `<w:p><w:r><w:t>（请在此处填写实验目的，打印时删除本行提示）</w:t></w:r></w:p>` +
      `</w:tc></w:tr>` +
      `<w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr>` +
      `<w:p><w:r><w:b/><w:t>二、实验步骤与数据记录</w:t></w:r></w:p>` +
      `</w:tc></w:tr></w:tbl>` +
      `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>` +
      `</w:body></w:document>`

    base["word/document.xml"] = strToU8(docXml)
    const tplPath = join(dir, "form_tpl.docx")
    await writeFile(tplPath, zipSync(base))

    const { inspect_id, doc_map } = await inspectReference(tplPath, dir)
    expect(doc_map.map_text).toContain("[空0:")
    expect(doc_map.map_text).toContain("[空1:")
    expect(doc_map.map_text).toContain("B0.TX0")

    const store = new TemplateStore(dir, db)
    const asset = store.save(
      inspect_id,
      "框表报告",
      "thesis",
      {
        template_kind: "form_table",
        fields: [
          { name: "student_name", coord: "B1", mode: "blank", blank_index: 0 },
          { name: "class_name", coord: "B1", mode: "blank", blank_index: 1 },
          { name: "student_id", coord: "B1", mode: "match", match: "U201612345" },
          { name: "course", coord: "B2.R0.C1", mode: "cell" },
        ],
        content_slots: [
          {
            name: "sec_purpose",
            label: "实验目的",
            start: "B2.R1.C0.P1",
            end: "B2.R1.C0.P1",
            placement: "replace",
          },
          {
            name: "sec_steps",
            label: "实验步骤与数据记录",
            start: "B2.R2.C0.P0",
            end: "B2.R2.C0.P0",
            placement: "insert_after",
          },
        ],
        remove_targets: [{ start: "B0.TX0", reason: "删除打印前提示文本框" }],
        prototypes: { body: "B2.R1.C0.P1" },
        preserved: doc_map.preserved,
      },
      "保留固定栏目标题与框线。",
      true,
    )

    const out = await compose(dir, asset, {
      mode: "authored",
      slot_values: {
        student_name: "林知远",
        class_name: "计科2401班",
        student_id: "2026308801",
        course: "计算机组成原理实验",
      },
      body_plan: [
        {
          slot: "sec_purpose",
          prototype: "body",
          text: "掌握算术逻辑单元 ALU 的组合逻辑设计与进位链优化方法。",
        },
        {
          slot: "sec_steps",
          prototype: "body",
          text: "完成四位先行进位加法器仿真波形测试。",
        },
        {
          slot: "sec_steps",
          prototype: "table",
          rows: [
            ["输入A", "输入B", "输出Sum"],
            ["0101", "0011", "1000"],
          ],
        },
      ],
    })

    const outXml = strFromU8(unzipSync(await readFile(out.docx_path))["word/document.xml"])
    expect(outXml).toContain("天津理工大学实验报告专用纸")
    expect(outXml).not.toContain("打印前删除此提示框")
    expect(outXml).toContain("林知远")
    expect(outXml).toContain("计科2401班")
    expect(outXml).toContain("2026308801")
    expect(outXml).not.toContain("U201612345")
    expect(outXml).toContain("计算机组成原理实验")
    expect(outXml).not.toContain("旧示例课程")
    expect(outXml).toContain("一、实验目的")
    expect(outXml).not.toContain("打印时删除本行提示")
    expect(outXml).toContain("二、实验步骤与数据记录")
    expect(outXml).toContain("先行进位加法器")
    expect(outXml).toContain("输出Sum")
  } finally {
    db.db.close()
    await rm(dir, { recursive: true, force: true })
  }
}, 45_000)

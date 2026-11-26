import { test, expect } from "vitest"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate"
import { DOMParser } from "@xmldom/xmldom"
import {
  adjustLayout,
  auditComposition,
  compose,
  inspectReference,
  parseXml,
  Store,
  TemplateStore,
  W,
  xmlBytes,
} from "../src/index.js"

const NS = 'xmlns:w="' + W + '"'

test("多节报告模板：识别说明节剔除、封面键值原位填槽、自动刷新 TOC 目录且保留页眉分节", async () => {
  const dir = await mkdtemp(join(tmpdir(), "docforge-report-"))
  const db = new Store(join(dir, "profiles.db"))
  try {
    const base = unzipSync(await readFile("eval/fixtures/01.docx"))
    const doc = parseXml(base["word/document.xml"])
    const body = doc.getElementsByTagNameNS(W, "body")[0]
    while (body.firstChild) body.removeChild(body.firstChild)

    const blocks = [
      `<w:p ${NS}><w:r><w:rPr><w:sz w:val="84"/></w:rPr><w:t>桂林理工大学</w:t></w:r></w:p>`,
      `<w:p ${NS}><w:r><w:rPr><w:sz w:val="72"/></w:rPr><w:t>银行家算法的实现</w:t></w:r></w:p>`,
      `<w:p ${NS}><w:r><w:t>学 生：</w:t></w:r>` +
        `<w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t> 张健 </w:t></w:r>` +
        `<w:r><w:rPr><w:color w:val="FFFFFF"/><w:u w:val="single"/></w:rPr><w:t>###</w:t></w:r></w:p>`,
      `<w:p ${NS}><w:pPr><w:sectPr/></w:pPr></w:p>`,
      `<w:p ${NS}><w:r><w:t>说明（本页可以不打印）</w:t></w:r></w:p>`,
      `<w:p ${NS}><w:r><w:t>图片格式示例：图1-1 图片名称</w:t></w:r></w:p>`,
      `<w:p ${NS}><w:pPr><w:sectPr/></w:pPr></w:p>`,
      `<w:sdt ${NS}><w:sdtContent>` +
        `<w:p><w:pPr><w:pStyle w:val="TOC"/></w:pPr><w:r><w:t>目录</w:t></w:r></w:p>` +
        `<w:p><w:pPr><w:pStyle w:val="TOC1"/></w:pPr>` +
        `<w:r><w:fldChar w:fldCharType="begin"/></w:r>` +
        `<w:r><w:instrText> TOC \\o "1-3" </w:instrText></w:r>` +
        `<w:r><w:fldChar w:fldCharType="separate"/></w:r>` +
        `<w:r><w:t>1.操作系统安装与操练</w:t></w:r>` +
        `<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>` +
        `</w:sdtContent></w:sdt>`,
      `<w:p ${NS}><w:pPr><w:sectPr/></w:pPr></w:p>`,
      `<w:p ${NS}><w:pPr><w:pStyle w:val="1"/><w:outlineLvl w:val="0"/></w:pPr>` +
        `<w:r><w:rPr><w:sz w:val="32"/></w:rPr><w:t>1.操作系统安装与操练</w:t></w:r></w:p>`,
      `<w:p ${NS}><w:pPr><w:ind w:firstLine="420"/></w:pPr>` +
        `<w:r><w:rPr><w:sz w:val="21"/></w:rPr><w:t>正文内容示例占位文字。</w:t></w:r></w:p>`,
      `<w:tbl ${NS}><w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/>` +
        `<w:gridCol w:w="2000"/><w:gridCol w:w="2000"/></w:tblGrid>` +
        `<w:tr><w:tc><w:p><w:r><w:t>进程</w:t></w:r></w:p></w:tc>` +
        `<w:tc><w:p><w:r><w:t>到达</w:t></w:r></w:p></w:tc>` +
        `<w:tc><w:p><w:r><w:t>服务</w:t></w:r></w:p></w:tc>` +
        `<w:tc><w:p><w:r><w:t>周转</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`,
      `<w:p ${NS}><w:r><w:t>4.心得体会（不得少于300字）</w:t></w:r></w:p>`,
      `<w:sectPr ${NS}><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>`,
    ]
    for (const xml of blocks) {
      const el = new DOMParser().parseFromString(xml, "application/xml").documentElement!
      body.appendChild(doc.importNode(el, true))
    }
    base["word/document.xml"] = xmlBytes(doc)
    base["word/header2.xml"] = strToU8(`<w:hdr ${NS}><w:p><w:r><w:t>实习报告</w:t></w:r></w:p></w:hdr>`)
    const tplPath = join(dir, "os_tpl.docx")
    await writeFile(tplPath, zipSync(base))

    const { inspect_id, skeleton } = await inspectReference(tplPath, dir)
    const roles = skeleton.section_outline?.map((s) => s.role_hint) ?? []
    expect(roles).toContain("cover")
    expect(roles).toContain("instruction_guide_removable")
    expect(roles).toContain("toc_preserved")

    const store = new TemplateStore(dir, db)
    const asset = store.save(
      inspect_id,
      "实验报告",
      "thesis",
      {
        slots: [
          { name: "title", start: "B1", end: "B1" },
          { name: "author", start: "B2", end: "B2" },
          { name: "body", start: "B8", end: "B11" },
        ],
        remove_ranges: [{ start: "B4", end: "B6", reason: "不打印说明页" }],
        prototypes: { heading_1: "B8", body: "B9", table: "B10" },
        preserved: skeleton.preserved,
      },
      "保留封面与页眉，移除说明节。",
      true,
    )
    expect(asset.capability_card).toContain("table(4列)")

    const out = await compose(dir, asset, {
      mode: "authored",
      slot_values: { title: "进程调度模拟实现", author: "学生：李明轩" },
      body_plan: [
        { prototype: "heading_1", text: "1. 进程调度实验设计" },
        { prototype: "body", text: "采用多级反馈队列实现内核调度模拟。" },
      ],
    })
    const audit = await auditComposition(
      out.docx_path,
      join(dir, "inspections", inspect_id, "base.docx"),
      out.body_indices,
      ["1. 进程调度实验设计", "采用多级反馈队列实现内核调度模拟。"],
      out.removed_sections,
    )
    expect(audit.passed).toBe(true)

    const outZip = unzipSync(await readFile(out.docx_path))
    const outXml = strFromU8(outZip["word/document.xml"])
    expect(outXml).toContain("桂林理工大学")
    expect(outXml).toContain("进程调度模拟实现")
    expect(outXml).toContain("李明轩")
    expect(outXml).not.toContain("张健")
    expect(outXml).not.toContain("###")
    expect(outXml).not.toContain("本页可以不打印")
    expect(outXml).not.toContain("图片格式示例")
    expect(outXml).not.toContain("操作系统安装与操练")
    expect(outXml).not.toContain("不得少于300字")
    expect(outXml).toContain("1. 进程调度实验设计")
    expect(strFromU8(outZip["word/header2.xml"])).toContain("实习报告")

    await adjustLayout(out.docx_path, [{ type: "line_spacing_delta", delta: -3 }])
    const adjustedDoc = parseXml(unzipSync(await readFile(out.docx_path))["word/document.xml"])
    const firstCoverP = adjustedDoc.getElementsByTagNameNS(W, "p")[0]
    expect(firstCoverP.getElementsByTagNameNS(W, "spacing").length).toBe(0)
  } finally {
    db.db.close()
    await rm(dir, { recursive: true, force: true })
  }
}, 30_000)

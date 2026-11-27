import { once } from "node:events"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate"
import { expect, test } from "vitest"
import {
  BUILTIN_TEMPLATE_ID,
  W,
  auditComposition,
  children,
  inspectReference,
  parseXml,
} from "@docs-agent/engine"
import { createApp } from "../src/app.js"
import { Documents } from "../src/documents.js"
import { createTools } from "../src/tools.js"
import { Workspace } from "../src/workspace.js"

test("模板透视与微调工具链：识别隐藏下划线/加粗脏原型、就地修复样式与页边距、内置模板自动派生及异常回滚", async () => {
  const dir = await mkdtemp(join(tmpdir(), "docforge-tpl-tune-"))
  const docs = new Documents(dir, false)
  const work = new Workspace(docs)
  try {
    const base = unzipSync(await readFile("eval/fixtures/01.docx"))
    const docXml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W}"><w:body>` +
      `<w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:pPr>` +
      `<w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>华南现代工业学院</w:t></w:r></w:p>` +
      `<w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:b/><w:sz w:val="44"/></w:rPr></w:pPr>` +
      `<w:r><w:rPr><w:b/><w:sz w:val="44"/></w:rPr><w:t>课 程 实 训 报 告</w:t></w:r></w:p>` +
      `<w:p><w:pPr><w:rPr><w:b/><w:sz w:val="24"/><w:u w:val="thick"/></w:rPr></w:pPr>` +
      `<w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>班级</w:t></w:r>` +
      `<w:r><w:rPr><w:b/><w:sz w:val="24"/><w:u w:val="thick"/></w:rPr><w:t xml:space="preserve">  计科2401  </w:t></w:r>` +
      `<w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>姓名</w:t></w:r>` +
      `<w:r><w:rPr><w:b/><w:sz w:val="24"/><w:u w:val="thick"/></w:rPr><w:t xml:space="preserve">  李知行  </w:t></w:r></w:p>` +
      // B3..B6: empty paragraphs carrying leaked bold + thick underline from B2
      `<w:p><w:pPr><w:rPr><w:b/><w:sz w:val="24"/><w:u w:val="thick"/></w:rPr></w:pPr>` +
      `<w:r><w:rPr><w:b/><w:sz w:val="24"/><w:u w:val="thick"/></w:rPr></w:r></w:p>` +
      `<w:p><w:pPr><w:rPr><w:b/><w:sz w:val="24"/><w:u w:val="thick"/></w:rPr></w:pPr>` +
      `<w:r><w:rPr><w:b/><w:sz w:val="24"/><w:u w:val="thick"/></w:rPr></w:r></w:p>` +
      `<w:p><w:pPr><w:rPr><w:b/><w:sz w:val="24"/><w:u w:val="thick"/></w:rPr></w:pPr>` +
      `<w:r><w:rPr><w:b/><w:sz w:val="24"/><w:u w:val="thick"/></w:rPr></w:r></w:p>` +
      `<w:p><w:pPr><w:rPr><w:b/><w:sz w:val="24"/><w:u w:val="thick"/></w:rPr></w:pPr>` +
      `<w:r><w:rPr><w:b/><w:sz w:val="24"/><w:u w:val="thick"/></w:rPr></w:r></w:p>` +
      // B7: red naming instruction
      `<w:p><w:r><w:rPr><w:color w:val="FF0000"/><w:sz w:val="28"/></w:rPr>` +
      `<w:t>注意：电子版命名格式为学号加姓名。</w:t></w:r></w:p>` +
      `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>` +
      `<w:pgMar w:top="1134" w:bottom="0" w:left="851" w:right="851" w:header="0" w:footer="0"/></w:sectPr>` +
      `</w:body></w:document>`
    base["word/document.xml"] = strToU8(docXml)
    const dirtyTplPath = join(dir, "dirty_report.docx")
    await writeFile(dirtyTplPath, zipSync(base))

    const { inspect_id } = await inspectReference(dirtyTplPath, dir)
    const saved = work.templates.save(
      inspect_id,
      "标准实训报告模板",
      "thesis",
      {
        template_kind: "flowing",
        fields: [
          { name: "class_name", label: "班级", coord: "B2", mode: "blank", blank_index: 0 },
          { name: "student_name", label: "姓名", coord: "B2", mode: "blank", blank_index: 1 },
        ],
        content_slots: [{ name: "body", start: "B3", end: "B6", placement: "replace" }],
        remove_targets: [{ start: "B7", reason: "红色命名说明" }],
        must_preserve: ["华南现代工业学院", "课 程 实 训 报 告"],
        prototypes: { body: "B3" },
        preserved: ["页边距与页面尺寸"],
      },
      "顶部抬头固定，正文自B3起。",
      true,
    )

    let activeTplId = saved.id
    const updatedEvents: { id: string; forked: boolean }[] = []
    const tools = createTools(work, {
      vision: false,
      getTemplateId: () => activeTplId,
      setTemplateId: (id) => {
        activeTplId = id
      },
      onTemplateUpdated: (asset, forked) => {
        if (forked) activeTplId = asset.id
        updatedEvents.push({ id: asset.id, forked })
      },
    })
    const manageTool = tools.find((t) => t.name === "manage_templates")!
    const updateTool = tools.find((t) => t.name === "update_template")!

    // 1. Inspect exposes exact bold=true & underline="thick" on empty prototype B3
    const inspectedRes = (await manageTool.execute("t1", { action: "inspect" })) as {
      details: Record<string, any>
    }
    expect(inspectedRes.details.prototype_styles.body).toMatchObject({
      coord: "B3",
      text: "",
      bold: true,
      underline: "thick",
    })

    // 2. Reject invalid edits that destroy must_preserve banner or reference bad coordinates
    await expect(
      updateTool.execute("t-bad-coord", {
        format_paragraphs: [{ start: "B999", style: { bold: false } }],
      }),
    ).rejects.toThrow("B999")
    await expect(
      updateTool.execute("t-bad-preserve", {
        blueprint: {
          remove_targets: [{ start: "B0", reason: "误删受保护抬头" }, { start: "B7" }],
        },
      }),
    ).rejects.toThrow("华南现代工业学院")

    // 3. Fine-tune custom template in-place: strip thick underline & bold on body, add heading_1 prototype, fix bottom margin
    const editedRes = (await updateTool.execute("t2", {
      page_setup: {
        margins_twips: { bottom: 1440, left: 1440, right: 1440 },
      },
      format_paragraphs: [
        {
          start: "B3",
          style: {
            font_cn: "黑体",
            font_en: "Times New Roman",
            size_pt: 15,
            bold: true,
            underline: "none",
            alignment: "center",
            first_line_twips: 0,
            outline_lvl: 0,
            text: "一、章节标题示例",
          },
        },
        {
          start: "B4",
          end: "B6",
          style: {
            font_cn: "宋体",
            font_en: "Times New Roman",
            size_pt: 12,
            bold: false,
            underline: "none",
            alignment: "both",
            line_twips: 360,
            line_rule: "auto",
            first_line_twips: 480,
            text: "标准正文示范段落。",
          },
        },
      ],
      blueprint: {
        prototypes: {
          heading_1: "B3",
          body: "B4",
        },
      },
      rules_md: "一级标题用 heading_1（黑体15pt居中），正文用 body（宋体12pt无下划线首行缩进2字符）。",
    })) as { details: Record<string, any> }

    expect(editedRes.details.forked).toBe(false)
    expect(editedRes.details.template.id).toBe(saved.id)
    expect(updatedEvents).toEqual([{ id: saved.id, forked: false }])
    expect(editedRes.details.template.capability_card).toContain("heading_1")
    expect(editedRes.details.template.capability_card).toContain("正文 宋体/Times New Roman 12pt")
    expect(editedRes.details.template.sample_urls.length).toBeGreaterThan(0)

    // 4. Compose with repaired template -> header blanks keep thick underline, body & headings are clean!
    const composed = await work.compose({
      template_id: saved.id,
      mode: "authored",
      slot_values: { class_name: "智能2502班", student_name: "陈思远" },
      body_plan: [
        { prototype: "heading_1", slot: "body", text: "一、系统总体架构" },
        { prototype: "body", slot: "body", text: "采用模块化流水线完成图像几何变换与特征提取。" },
        {
          prototype: "table",
          slot: "body",
          rows: [
            ["指标", "数值"],
            ["准确率", "99.2%"],
          ],
        },
      ],
    })
    const lint = await auditComposition(
      composed.docx_path,
      join(work.templates.folder(saved.id), "base.docx"),
      composed.body_indices,
      ["一、系统总体架构", "采用模块化流水线完成图像几何变换与特征提取。"],
      composed.removed_sections,
      composed.added_sections,
    )
    expect(lint.passed).toBe(true)

    const outDoc = parseXml(unzipSync(await readFile(composed.docx_path))["word/document.xml"])
    const allParas = Array.from(outDoc.getElementsByTagNameNS(W, "p"))
    const headerBlankP = allParas.find((p) => p.textContent?.includes("智能2502班"))!
    const headerUnderlines = Array.from(headerBlankP.getElementsByTagNameNS(W, "u")).map((u) =>
      u.getAttributeNS(W, "val"),
    )
    expect(headerUnderlines).toContain("thick")

    const h1P = allParas.find((p) => p.textContent === "一、系统总体架构")!
    expect(children(children(h1P, "pPr")[0], "jc")[0].getAttributeNS(W, "val")).toBe("center")
    expect(children(children(h1P, "pPr")[0], "outlineLvl")[0].getAttributeNS(W, "val")).toBe("0")
    const h1Rpr = children(children(h1P, "r")[0], "rPr")[0]
    expect(children(h1Rpr, "u")[0].getAttributeNS(W, "val")).toBe("none")
    expect(children(h1Rpr, "sz")[0].getAttributeNS(W, "val")).toBe("30")

    const bodyP = allParas.find((p) =>
      p.textContent?.includes("采用模块化流水线完成图像几何变换与特征提取"),
    )!
    expect(children(children(bodyP, "pPr")[0], "ind")[0].getAttributeNS(W, "firstLine")).toBe(
      "480",
    )
    const bodyRpr = children(children(bodyP, "r")[0], "rPr")[0]
    expect(children(bodyRpr, "u")[0].getAttributeNS(W, "val")).toBe("none")
    expect(children(bodyRpr, "b")[0].getAttributeNS(W, "val")).toBe("0")

    const sectPr = outDoc.getElementsByTagNameNS(W, "sectPr")[0]
    expect(children(sectPr, "pgMar")[0].getAttributeNS(W, "bottom")).toBe("1440")

    // 5. Editing builtin-standard-doc automatically forks a new template & supports insert_paragraphs
    activeTplId = BUILTIN_TEMPLATE_ID
    const forkedBuiltin = (await updateTool.execute("t3", {
      name: "定制学术报告格式",
      category: "thesis",
      insert_paragraphs: [
        {
          position: "end",
          text: "参考文献条目示例",
          style: {
            font_cn: "宋体",
            font_en: "Times New Roman",
            size_pt: 10.5,
            bold: false,
            underline: "none",
            alignment: "both",
            first_line_twips: 0,
          },
        },
      ],
      blueprint: {
        prototypes: {
          title: "B0",
          heading_1: "B1",
          heading_2: "B2",
          body: "B3",
          reference_item: "B4",
        },
        remove_targets: [{ start: "B4", reason: "仅作参考文献样式原型段" }],
      },
    })) as { details: Record<string, any> }

    expect(forkedBuiltin.details.forked).toBe(true)
    expect(forkedBuiltin.details.template.id).not.toBe(BUILTIN_TEMPLATE_ID)
    expect(forkedBuiltin.details.template.parent_id).toBe(BUILTIN_TEMPLATE_ID)
    expect(activeTplId).toBe(forkedBuiltin.details.template.id)
    expect(work.templates.get(BUILTIN_TEMPLATE_ID).name).toBe("通用标准文档格式")
  } finally {
    docs.store.db.close()
    await rm(dir, { recursive: true, force: true })
  }
}, 90_000)

test("HTTP REST 模板透视 GET /api/templates/:id/inspect 与深度微调 PATCH /api/templates/:id", async () => {
  const dir = await mkdtemp(join(tmpdir(), "docforge-tpl-http-"))
  const server = createApp(dir, false)
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const origin = "http://127.0.0.1:" + (server.address() as AddressInfo).port
  try {
    const inspRes = await fetch(origin + "/api/templates/" + BUILTIN_TEMPLATE_ID + "/inspect")
    expect(inspRes.status).toBe(200)
    const inspJson = await inspRes.json()
    expect(inspJson.template.builtin).toBe(true)
    expect(inspJson.prototype_styles.body).toMatchObject({ coord: "B3", size_pt: 16 })

    const patchRes = await fetch(origin + "/api/templates/" + BUILTIN_TEMPLATE_ID, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "HTTP派生紧凑格式",
        format_paragraphs: [{ start: "B3", style: { size_pt: 12, bold: false, underline: "none" } }],
      }),
    })
    expect(patchRes.status).toBe(200)
    const patched = await patchRes.json()
    expect(patched.id).not.toBe(BUILTIN_TEMPLATE_ID)
    expect(patched.name).toBe("HTTP派生紧凑格式")
    expect(patched.style_dna.body_style.size_pt).toBe(12)
  } finally {
    server.close()
    await once(server, "close")
    await rm(dir, { recursive: true, force: true })
  }
}, 60_000)

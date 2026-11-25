import { randomUUID } from "node:crypto"
import { FormatProfile, type Role, type StyleSpec } from "@docs-agent/shared"
import { Assert } from "typebox/value"
import { fontSizes, nationalProfile } from "./defaults.js"
import { merge } from "./store.js"

const labels: Record<string, Role> = {
  标题: "title", 大标题: "title", 正文: "body", 主送: "recipient", 落款: "signature", 日期: "date",
}
for (const [i, digit] of [..."一二三"].entries()) {
  for (const term of ["第" + digit + "层小标题", "第" + digit + "层", digit + "级标题"]) {
    labels[term] = ("heading_" + (i + 1)) as Role
  }
}
const alignments = {
  居中: "center", 放中间: "center", 居左: "left", 靠左: "left", 左对齐: "left",
  居右: "right", 靠右: "right", 右对齐: "right", 两端对齐: "justify",
} as const
const fonts = [
  "方正小标宋简体", "方正公文小标宋", "方正小标宋_GBK", "方正大标宋_GBK", "方正仿宋_GBK",
  "方正黑体_GBK", "方正楷体_GBK", "华文中宋", "思源宋体", "仿宋_GB2312", "楷体_GB2312",
  "微软雅黑", "仿宋", "楷体", "黑体", "宋体",
]
const western = ["Times New Roman", "Liberation Serif", "Arial", "Calibri", "Cambria"]
const digits = "零一二三四五六七八九"
const amount = "([0-9]+(?:\\.[0-9]+)?|[零一二两三四五六七八九十点]+)"
const up = "增加|增大|增宽|加大|加宽|提高|调大|上调|放大|多|加"
const down = "减少|减小|减窄|缩小|缩窄|缩减|降低|调小|下调|少|减"
function numeric(raw: string) {
  if (!Number.isNaN(Number(raw))) return Number(raw)
  const [whole, fraction] = raw.replaceAll("两", "二").split("点")
  const [tens, units] = whole.split("十")
  const integer = units === undefined ? digits.indexOf(whole) :
    (tens ? digits.indexOf(tens) : 1) * 10 + (units ? digits.indexOf(units) : 0)
  return integer + (fraction ? Number("0." + [...fraction].map(c => digits.indexOf(c)).join("")) : 0)
}

function negative(text: string, index: number) {
  const clause = text.slice(0, index).split(/[，,。；;、]|改[为用成]|换[成为用]/).at(-1) ?? ""
  return /(?:不要|不用|不使用|不采用|别|取消|关闭|去掉|去除|非|不)\s*(?:使用|采用|用|设成|设为|显示|保留|是|\s)*$/.test(clause)
}

function lastTerm<T extends string>(text: string, terms: T[]) {
  const pattern = new RegExp(terms.slice().sort((a, b) => b.length - a.length).join("|"), "gi")
  const hits = [...text.matchAll(pattern)].filter(m => !negative(text, m.index!))
  const term = hits.at(-1)?.[0].toLowerCase()
  return terms.find(candidate => candidate.toLowerCase() === term)
}

function measurement(text: string, subject: string, units: string) {
  const prefix = "(?:在原来?的?基础上|比原来|再)?\\s*"
  const pattern = subject + "\\s*" + prefix + "(?:(" + up + "|" + down + ")|为固定值|设为|固定值|为|调到|固定)?"
  const match = new RegExp(pattern + "\\s*" + amount + "\\s*(" + units + ")", "i").exec(text)
  if (!match || negative(text, match.index)) return
  const sign = match[1] && new RegExp("^(" + down + ")$").test(match[1]) ? -1 : 1
  return { relative: Boolean(match[1]), value: numeric(match[2]) * sign, unit: match[3].toLowerCase() }
}

function stylePatch(text: string, original: StyleSpec) {
  const patch: Partial<StyleSpec> = {}
  const cn = lastTerm(text, fonts)
  const en = lastTerm(text, western)
  if (cn) patch.font_cn = cn
  if (en) patch.font_en = en
  const size = lastTerm(text, Object.keys(fontSizes) as (keyof typeof fontSizes)[])
  if (size) patch.font_size_pt = fontSizes[size]
  const points = measurement(text, "(?:字号|字体大小|^)", "磅|pt")
  if (points) patch.font_size_pt = points.value + (points.relative ? original.font_size_pt : 0)
  const line = measurement(text, "(?:行距|固定值|每一行固定占)", "磅|pt|倍")
  const multiple = new RegExp(amount + "\\s*倍行距").exec(text)
  if (line) {
    const mode = line.unit === "倍" ? "multiple" : "exact"
    if (!line.relative || mode === original.line_spacing_rule) {
      patch.line_spacing_rule = mode
      patch.line_spacing_value = line.value + (line.relative ? original.line_spacing_value : 0)
    }
  } else if (multiple && !negative(text, multiple.index)) {
    patch.line_spacing_rule = "multiple"
    patch.line_spacing_value = numeric(multiple[1])
  }
  const indent = new RegExp("(?:缩进|开头空)\\s*" + amount + "\\s*个?(?:字|字符)").exec(text)
  if (/(?:不要|取消|无|不)(?:首行)?缩进|顶格/.test(text)) patch.first_line_indent_chars = 0
  else if (indent) patch.first_line_indent_chars = numeric(indent[1])
  const alignment = lastTerm(text, Object.keys(alignments) as (keyof typeof alignments)[])
  if (alignment) patch.alignment = alignments[alignment]
  for (const [field, pattern] of [["bold", /加粗|粗体/g], ["italic", /斜体|倾斜/g]] as const) {
    const hit = [...text.matchAll(pattern)].at(-1)
    if (hit) patch[field] = !negative(text, hit.index!)
  }
  const color = /(?:颜色|色号)\s*#?([0-9a-f]{6})/i.exec(text)
  if (color && !negative(text, color.index)) patch.color_hex = color[1].toUpperCase()
  return patch
}

function fields(value: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix + key
    return child && typeof child === "object" ? fields(child as Record<string, unknown>, path + ".") : [path]
  })
}

export function parseFormat(instruction: string, name: string, base = nationalProfile(), modelPatch = {}) {
  const pattern = Object.keys(labels).sort((a, b) => b.length - a.length).join("|")
  const pieces = instruction.split(new RegExp("(" + pattern + ")"))
  const styles: Partial<Record<Role, Partial<StyleSpec>>> = {}
  for (let i = 1; i < pieces.length; i += 2) {
    const role = labels[pieces[i]]
    styles[role] = { ...styles[role], ...stylePatch(pieces[i + 1], base.styles[role]) }
  }
  const page: Partial<FormatProfile["page"]> = {}
  const sides = { 上: "top", 下: "bottom", 左: "left", 右: "right" } as const
  for (const [label, side] of Object.entries(sides)) {
    const pair = ["top", "bottom"].includes(side) ? "上下" : "左右"
    const m = measurement(instruction, "(?:" + label + "(?:页边距|边距)|" + pair + "各留)", "毫米|mm|厘米|cm")
    if (m) {
      const key = `margin_${side}_mm` as const
      page[key] = m.value * (["cm", "厘米"].includes(m.unit) ? 10 : 1) + (m.relative ? base.page[key] : 0)
    }
  }
  if (/(?:不显示|不要|取消|关闭|隐藏|不加)页码/.test(instruction)) page.show_page_number = false
  else if (/(?:显示|添加|保留|开启)页码/.test(instruction)) page.show_page_number = true
  const red_header: Partial<FormatProfile["red_header"]> = {}
  if (/(?:不要|关闭|取消|无|不使用|不加)红头/.test(instruction)) red_header.enabled = false
  else if (/(?:开启|启用|使用|要|加|保留)红头|红头要开/.test(instruction)) red_header.enabled = true
  if (Object.keys(modelPatch).some(key => !["styles", "page", "red_header"].includes(key))) {
    throw new Error("模型返回非法格式补丁")
  }
  const patch = merge({ styles, page, red_header }, modelPatch)
  const profile = { ...merge(base, patch), id: randomUUID(), name, parent_id: base.id,
    source_type: "nl_parsed", description: instruction }
  Assert(FormatProfile, profile)
  const explicit_fields = fields(patch).sort()
  const all = fields({ styles: profile.styles, page: profile.page, red_header: profile.red_header })
  return { profile, explicit_fields, defaulted_fields: all.filter(k => !explicit_fields.includes(k)).sort() }
}

import { roles, type FormatProfile, type Role, type StyleSpec } from "@docs-agent/shared"

export const fontSizes = {
  初号: 42, 小初: 36, 一号: 26, 小一: 24, 二号: 22, 小二: 18,
  三号: 16, 小三: 15, 四号: 14, 小四: 12, 五号: 10.5, 小五: 9,
}

export function nationalProfile(): FormatProfile {
  const style: StyleSpec = {
    font_cn: "仿宋_GB2312", font_en: "Times New Roman", font_size_pt: 16,
    bold: false, italic: false, color_hex: "000000", alignment: "justify",
    line_spacing_rule: "exact", line_spacing_value: 28, first_line_indent_chars: 2,
    space_before_pt: 0, space_after_pt: 0,
  }
  const styles = Object.fromEntries(roles.map(role => [role, { ...style }])) as Record<Role, StyleSpec>
  Object.assign(styles.title, {
    font_cn: "方正小标宋简体", font_size_pt: 22, alignment: "center", first_line_indent_chars: 0,
  })
  styles.heading_1.font_cn = "黑体"
  styles.heading_2.font_cn = "楷体_GB2312"
  for (const role of ["recipient", "signature", "date"] as const) {
    styles[role].first_line_indent_chars = 0
    styles[role].alignment = role === "recipient" ? "left" : "right"
  }
  return {
    id: "gbt-9704-2012", name: "GB/T 9704-2012 国标公文", source_type: "builtin",
    parent_id: null, base_template_path: null, description: "", styles,
    page: {
      size: "A4", margin_top_mm: 37, margin_bottom_mm: 35, margin_left_mm: 28,
      margin_right_mm: 26, show_page_number: true,
    },
    red_header: {
      enabled: false, org_name: null, font_cn: "方正小标宋简体", font_size_pt: 36,
      color_hex: "FF0000", has_red_line: true, doc_number_font_cn: "仿宋_GB2312", doc_number_size_pt: 16,
    },
  }
}

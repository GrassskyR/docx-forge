# V2 实测报告

运行时间 2026-11-24T11:10:17.492816+00:00，模型 `deepseek/deepseek-v4.1-flash`。

以最终审计器复核产物的时间为 2026-11-24T11:49:48.353482+00:00。
| 评测项 | 实测 |
|---|---:|
| 合成格式提取字段 | 2088/2088 （100.00%） |
| 合成范本重渲染独立审计 | 20/20 |
| 真实公文提取、母版剥离、独立审计与 PNG | 16/16 |
| NL 金标准字段 | 233/233（100.00%） |
| 系统修复前金标准审计 | 30/30 |
| 系统修复后金标准审计 | 30/30 |
| Baseline 总通过率（含请求失败） | 6/30 （20.00%） |
| Baseline 有效响应通过率 | 6/22 （27.27%） |
| Baseline 脚本错误率（有效响应内） | 2/22 （9.09%） |

Baseline 最终网络失败 8 条，其他无有效响应 0 条。
NL 最终网络失败 0 条。
修复注入文档通过数由 0/10 增加到 10/10。

## 真实公文

| 文档 | 审计项 | PNG 页数 |
|---|---:|---:|
| real_01_cdsu_red_notice.docx | 146 | 1 |
| real_02_cdsu_preprinted_notice.docx | 129 | 1 |
| real_03_qust_red_minutes.docx | 146 | 1 |
| real_04_cuc_red_minutes.docx | 146 | 1 |
| real_05_nepu_red_minutes.docx | 146 | 1 |
| real_06_zjxz_general_atleast.docx | 129 | 1 |
| real_07_zjxz_speech.docx | 129 | 1 |
| real_08_aiit_table_minutes.docx | 129 | 1 |
| real_09_ahjzu_table_minutes.docx | 129 | 1 |
| real_10_zjxz_red_letter.doc | 146 | 1 |
| real_11_zjxz_party_red_letter.doc | 146 | 1 |
| real_12_zjxz_agenda.doc | 129 | 1 |
| real_13_ccnu_gbt_template.doc | 129 | 1 |
| real_14_nankai_notice.doc | 129 | 1 |
| real_15_zju_security_rules.doc | 129 | 1 |
| real_16_aiit_misnamed_ole.docx | 129 | 1 |

## 单轮故障注入实测

| 样本 | 违规前 → 后 | 独立审计得分前 → 后 |
|---|---:|---:|
| 01 | 17 → 0 | 86.82% → 100.00% |
| 02 | 17 → 0 | 86.82% → 100.00% |
| 03 | 17 → 0 | 86.82% → 100.00% |
| 04 | 17 → 0 | 86.82% → 100.00% |
| 05 | 17 → 0 | 86.82% → 100.00% |
| 06 | 17 → 0 | 86.82% → 100.00% |
| 07 | 17 → 0 | 86.82% → 100.00% |
| 08 | 17 → 0 | 86.82% → 100.00% |
| 09 | 17 → 0 | 86.82% → 100.00% |
| 10 | 17 → 0 | 86.82% → 100.00% |

## Baseline 有效响应逐字段违规

- `alignment` 7 次
- `color_hex` 2 次
- `first_line_indent_chars` 7 次
- `first_line_indent_twips` 6 次
- `font_cs` 6 次
- `font_eastAsia` 4 次
- `font_size_cs_pt` 3 次
- `font_size_pt` 3 次
- `line_spacing_rule` 2 次
- `line_spacing_value` 17 次
- `page.margin_bottom_mm` 1 次
- `page.margin_left_mm` 1 次
- `page.margin_right_mm` 1 次
- `page.margin_top_mm` 1 次
- `red_header.enabled` 10 次
- `red_header.has_red_line` 10 次
- `space_after_pt` 3 次
- `space_before_pt` 1 次

## 评测口径

- 合成及真实轨均从磁盘提取，页边距按整数 twips 比对。真实原件先核对清单 SHA256。
- 两组使用相同正文 AST 和目标格式审计。Baseline 获得完整目标预设，系统从指令与父预设解析。
- 两类模型请求的每次超时均为 180 秒，暂时性请求失败最多重试 3 次，退避为 1、2、4 秒。
- 有效响应口径保留脚本执行失败与格式不合规。脚本在独立目录、隔离文件系统与网络中执行。
- 系统修复依据自身预设的独立审计结果定向修改 OOXML。目标预设用于评分。
- 本报告使用本次运行的样本和模型响应。样本内结果用于衡量本任务覆盖的排版。
- 逐项断言、请求尝试、审计差异与产物目录详见 `results.json`。

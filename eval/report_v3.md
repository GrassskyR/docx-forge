# V3 跨领域与低成本双维实测报告

- 运行时间：`2026-11-25T10:54:23.601Z`
- 主模型：`cmd/deepseek/deepseek-v4.1-flash`
- 视觉终审运行模式：`text_only`（无视觉模型时自动降级为纯文本遥测 + OOXML 审计）

## 核心指标总览

| 评测维度 | 样本规模 | 实测结果 | 关键统计 |
|---|---:|---:|---|
| 锁定真实语料 SHA256 完整性 | 30 份（16 公文 + 14 跨领域） | 30/30（100.00%） | 零篡改通过 |
| 骨架压缩长度门禁（≤ 6,000 字符） | 30 份 | 30/30（100.00%） | 均值 1707 字符，峰值 5699 字符，平均压缩比 1.77% |
| 原件留壳保真与组装渲染 + PNG 生成 | 30 份 | 30/30（100.00%） | `word/media`、页眉页脚、分节与样式表 30/30 原样存活 |
| 跨领域长文零拷贝保真套版（1,500~5,000 字） | 6 份 | 6/6（逐字保真率 100.00%） | 真实 LLM 单文档均值：输入 390 + 输出 1499 = **1889 tokens** |
| 真实版面溢出 / 孤立落款自动收口 | 6 份 | 6/6（警报归零率 100.00%） | 收口前警报共 10 项 → 收口后 0 项，全部减页收敛 |
| 双轨视觉终审与关键页采样（≤ 960px） | 6 份 | 模式 `text_only`（6/6 零报错闭环） | 最多采样 3 页（首/末/表页），最大宽度 960px |

## 一、30 份真实跨领域文档全链路实测（16 公文 + 4 论文/规范 + 3 申报表 + 7 合同）

| 文档 | 领域 | 原 XML 字数 | 骨架字数 | 压缩比 | 能力卡字数 | 媒体数 | 分节数 | 留壳保真 | PNG 页数 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `real_01_cdsu_red_notice.docx` | gongwen | 45774 | 1017 | 2.22% | 100 | 0 | 2 | PASS | 5 |
| `real_02_cdsu_preprinted_notice.docx` | gongwen | 40021 | 999 | 2.50% | 104 | 0 | 2 | PASS | 5 |
| `real_03_qust_red_minutes.docx` | gongwen | 38905 | 662 | 1.70% | 95 | 0 | 1 | PASS | 3 |
| `real_04_cuc_red_minutes.docx` | gongwen | 109233 | 2014 | 1.84% | 94 | 0 | 1 | PASS | 4 |
| `real_05_nepu_red_minutes.docx` | gongwen | 60220 | 1163 | 1.93% | 98 | 0 | 1 | PASS | 4 |
| `real_06_zjxz_general_atleast.docx` | gongwen | 54952 | 791 | 1.44% | 99 | 0 | 2 | PASS | 4 |
| `real_07_zjxz_speech.docx` | gongwen | 15090 | 535 | 3.55% | 90 | 0 | 1 | PASS | 2 |
| `real_08_aiit_table_minutes.docx` | gongwen | 47466 | 536 | 1.13% | 94 | 0 | 1 | PASS | 2 |
| `real_09_ahjzu_table_minutes.docx` | gongwen | 12229 | 390 | 3.19% | 95 | 0 | 1 | PASS | 2 |
| `real_10_zjxz_red_letter.doc` | gongwen | 16282 | 793 | 4.87% | 93 | 0 | 1 | PASS | 2 |
| `real_11_zjxz_party_red_letter.doc` | gongwen | 16750 | 800 | 4.78% | 99 | 0 | 1 | PASS | 2 |
| `real_12_zjxz_agenda.doc` | gongwen | 14753 | 763 | 5.17% | 86 | 0 | 1 | PASS | 2 |
| `real_13_ccnu_gbt_template.doc` | gongwen | 29890 | 446 | 1.49% | 101 | 0 | 2 | PASS | 3 |
| `real_14_nankai_notice.doc` | gongwen | 35946 | 1142 | 3.18% | 91 | 0 | 1 | PASS | 4 |
| `real_15_zju_security_rules.doc` | gongwen | 477314 | 2608 | 0.55% | 102 | 0 | 3 | PASS | 17 |
| `real_16_aiit_misnamed_ole.docx` | gongwen | 30858 | 444 | 1.44% | 93 | 0 | 1 | PASS | 1 |
| `v3_01_pku_master_thesis.docx` | academic | 293922 | 3780 | 1.29% | 109 | 3 | 14 | PASS | 26 |
| `v3_02_szu_master_thesis.docx` | academic | 1047843 | 5671 | 0.54% | 109 | 8 | 17 | PASS | 25 |
| `v3_03_szu_phd_thesis.docx` | academic | 1048222 | 5699 | 0.54% | 106 | 8 | 17 | PASS | 24 |
| `v3_04_seu_national_rd_form.docx` | form | 947225 | 5493 | 0.58% | 100 | 0 | 22 | PASS | 35 |
| `v3_05_zjgsu_soft_sci_form.docx` | form | 175140 | 1393 | 0.80% | 96 | 0 | 3 | PASS | 15 |
| `v3_06_njnu_major_grant_form.doc` | form | 534271 | 1801 | 0.34% | 97 | 0 | 25 | PASS | 29 |
| `v3_07_fudan_gbt9704_spec.doc` | academic | 256330 | 1655 | 0.65% | 103 | 12 | 1 | PASS | 25 |
| `v3_08_shgov_coop_dev_contract.doc` | contract | 332040 | 1439 | 0.43% | 103 | 0 | 2 | PASS | 11 |
| `v3_09_shgov_entrust_dev_contract.doc` | contract | 333480 | 1478 | 0.44% | 106 | 0 | 2 | PASS | 10 |
| `v3_10_sjtu_tech_dev_contract.doc` | contract | 212240 | 1467 | 0.69% | 102 | 0 | 1 | PASS | 11 |
| `v3_11_scut_entrust_contract.doc` | contract | 406345 | 2334 | 0.57% | 98 | 0 | 1 | PASS | 11 |
| `v3_12_cumt_tech_service_contract.doc` | contract | 234508 | 1209 | 0.52% | 106 | 0 | 2 | PASS | 7 |
| `v3_13_ustc_joint_apply_agreement.doc` | contract | 30840 | 596 | 1.93% | 100 | 0 | 1 | PASS | 2 |
| `v3_14_ustc_coop_agreement.doc` | contract | 78500 | 2097 | 2.67% | 99 | 0 | 1 | PASS | 6 |

## 二、6 份跨领域长草稿零拷贝保真套版与单文档 Token 账单

| 样本 ID | 领域 | 绑定真实模板 | 草稿字数 | 段落数 | 区间数 | 逐字保真率 | Prompt | Completion | Total |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| `zc_01_gongwen_safety` | gongwen | `real_01_cdsu_red_notice.docx` | 1780 | 10 | 9 | 100.00% | 384 | 2085 | 2469 |
| `zc_02_gongwen_data` | gongwen | `real_13_ccnu_gbt_template.doc` | 2123 | 10 | 9 | 100.00% | 377 | 4307 | 4684 |
| `zc_03_thesis_pku` | academic | `v3_01_pku_master_thesis.docx` | 2394 | 10 | 7 | 100.00% | 407 | 109 | 516 |
| `zc_04_thesis_szu` | academic | `v3_02_szu_master_thesis.docx` | 2049 | 10 | 6 | 100.00% | 408 | 84 | 492 |
| `zc_05_form_seu` | form | `v3_04_seu_national_rd_form.docx` | 1955 | 10 | 6 | 100.00% | 384 | 90 | 474 |
| `zc_06_contract_shgov` | contract | `v3_08_shgov_coop_dev_contract.doc` | 1677 | 10 | 4 | 100.00% | 381 | 2318 | 2699 |

## 三、6 份真实版面溢出与孤立落款自动收口实测

| 样本 ID | 格式来源 | 页数变化 | 收口前末页行数 | 收口前警报 | 收口后警报数 |
|---|---|---:|---:|---|---:|
| `ov_01_gbt9704` | GB/T 9704 国标预设 | 2 → 1 | 2 行 | `tail_overflow, orphan_signature` | 0 |
| `ov_02_cdsu_notice` | 成都体院通知预设 | 3 → 2 | 1 行 | `tail_overflow` | 0 |
| `ov_03_zjxz_general` | 浙师行知通用公文预设 | 2 → 1 | 2 行 | `tail_overflow, orphan_signature` | 0 |
| `ov_04_zjxz_speech` | 浙师行知讲话稿预设 | 2 → 1 | 2 行 | `tail_overflow, orphan_signature` | 0 |
| `ov_05_ccnu_gbt` | 华中师大国标公文预设 | 2 → 1 | 2 行 | `tail_overflow, orphan_signature` | 0 |
| `ov_06_nankai_notice` | 南开大学业务通知预设 | 2 → 1 | 1 行 | `tail_overflow` | 0 |

## 四、双轨视觉终审与关键页采样统计

| 模板文件 | 总页数 | 含表页数 | 采样关键页 | 采样张数 | 最大宽度 | 运行模式 / 状态 |
|---|---:|---:|---|---:|---:|---|
| `real_01_cdsu_red_notice.docx` | 5 | 1 | `[1, 5]` | 2 | 960px | `text_only` / `skipped_no_vision_model` |
| `v3_01_pku_master_thesis.docx` | 26 | 3 | `[1, 26, 3]` | 3 | 960px | `text_only` / `skipped_no_vision_model` |
| `v3_02_szu_master_thesis.docx` | 25 | 14 | `[1, 25, 3]` | 3 | 960px | `text_only` / `skipped_no_vision_model` |
| `v3_04_seu_national_rd_form.docx` | 34 | 29 | `[1, 34, 2]` | 3 | 960px | `text_only` / `skipped_no_vision_model` |
| `v3_08_shgov_coop_dev_contract.doc` | 11 | 0 | `[1, 11]` | 2 | 960px | `text_only` / `skipped_no_vision_model` |
| `v3_10_sjtu_tech_dev_contract.doc` | 10 | 4 | `[1, 10, 5]` | 3 | 960px | `text_only` / `skipped_no_vision_model` |

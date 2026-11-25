# 任务目标（V3 全栈 TypeScript Monorepo 架构升级 + 通用低成本文档格式 Agent + 极简瑞士风新前端 + 30 份跨领域真实语料验收）

在 `/home/missi/project/docs-agent` 现有 V2 验收资产的基础上，**彻底重构并统一技术栈为「全栈 TypeScript Monorepo（单运行时、单进程、单端口）」**，完整保持 **V2 既有公文能力与全部 9+2 HTTP 接口契约 100% 向下兼容**，全面演进升级为 **「基于 Pi-Agent 的低成本通用文档格式 Agent（V3）」**，并按锁定视觉规范彻底重构前端工作台。

## 核心演进目标

1. **架构彻底去混血：从 Python + TS 双服务升级为全栈 TypeScript Monorepo**：
   - 消灭 V2 中「FastAPI (`:8000`) + Pi-Agent (`:8787`) 双进程、三套重复 Schema、本机 HTTP 绕圈、两套 LLM 客户端与双运行时依赖」的割裂痛点；
   - 基于 **npm workspaces** 构建统一的 TypeScript Monorepo（`packages/shared` + `packages/engine` + `packages/server` + `packages/web`），前后端、Agent 工具与文档引擎共享同一份 TypeBox 单一真源 Schema；
   - **单进程单端口统一服务**（默认 `PORT=8000`，同时兼容 `ENGINE_PORT` 环境变量）：Pi-Agent 工具直接**进程内函数调用**文档引擎，前端通过同源接口访问 `/api/*`、`/chat`（SSE）、`/sessions*`、`/files/*` 与 `/` 静态工作台，零 CORS、零 `.venv`、运行期零 Python 依赖；
   - 存储与 LLM 统一收口：使用 Node 内置 **`node:sqlite` (`DatabaseSync`)** 统一持久化预设与模板索引；统一通过 `@mariozechner/pi-ai`（或单一 OpenAI 兼容封装）发起对话、NL 解析与可选视觉终审请求，实现**全局精确的实时 Token 与成本账单**。
2. **跳出“仅限 8 种公文角色”的局限，通吃三大高频真实文档场景**：
   - **带图片红头/五角星/版记的公文**（保留原件图片红头、VML 矢量红线、联合发文版头表、文末版记、`22行×28字` 文档网格、三级标题同行首句加粗）；
   - **学术论文 / 调研报告**（保留封面页、校徽图片、多节奇偶页眉页脚、多级编号、三线表、图表题注、参考文献悬挂缩进）；
   - **合同协议 / 项目申报表格**（保留甲乙方信息框、编号条款、重点句加粗/下划线、复杂嵌套填报表格与签章区防拆页）。
3. **专为便宜开源模型（如 DeepSeek）+ 可选廉价视觉模型设计的极低 Token 架构**：
   - 给定一份**真实范例 `.doc/.docx`** + **自然语言约束** → 经**骨架压缩器**（≤ 2,500 tokens）由 Agent 一次性内化为「原件无损壳 `base.docx` + 槽位与样式原型清单 `blueprint.json` + 可读规则书 `SKILL.md`」存入模板资产库；
   - 日常复用时，Pi-Agent `transformContext` 钩子仅注入 **≤ 600 tokens（≤ 1,500 字符）的精简模板能力卡**，并实现**历史视觉图片阅后即焚**；
   - 支持 **「零拷贝保真套版」**（按段落 ID 区间映射，万字长文仅需几百输出 token，**正文一字不改**）与 **「Agent 对话起草/改稿」** 双模式；
   - 支持 **「文本版面遥测（Poppler PDF 解析）+ 按需关键页视觉终审」双轨质量闭环**，无视觉模型时自动优雅降级。
4. **彻底重做高颜值专业前端（锁定风格：B · 极简瑞士 · 渐进式披露双模式）**：
   - 采用 **Vue 3 + Vite + TypeScript + Tailwind CSS（可配 Lucide 图标）** 在 `packages/web/` 构建现代化文档排版工作台，编译产物输出至 `packages/web/dist/`，由 `packages/server` 在 `/` 统一托管静态访问，确保 `./start.sh` 一键启动后访问 `http://localhost:8000` 即开即用，且 `GET /` 返回 200；
   - **默认打开为“极简普通模式”**（安静两栏：顶栏选格式、左边写/贴文章、右边超大 A4 预览与下载，零工程术语干扰）；**右上角提供「调试模式」开关**，开启后才完整展示模板能力卡、段落 ID 映射、Pi-Agent 工具轨迹、Token 账单、会话分支与 OOXML/Poppler/视觉诊断面板。

---

## ⚠️ 零容忍硬红线（违反任意一条即视为验收失败）

1. **全部继承 V2 业务与质量硬红线（一条不得松动）**：
   - 严禁臆造 `@mariozechner/pi-agent-core` / `@mariozechner/pi-ai` API（保持 `^0.73.1` 与 `overrides: { "basic-ftp": "6.2.6" }`），全 workspace `npm run typecheck` 必须 0 错误；
   - 严禁跳过真实 `.doc` 支持（魔数嗅探 `D0CF11E0A1B11AE1` 走 `soffice --headless --convert-to docx`，拒绝非 Word ZIP 或损坏压缩包）；
   - 严禁主流程用 LLM 生成 Word/OOXML 渲染代码，所有文档生成、留壳克隆、修复与版面收口必须为确定性 TS 引擎代码；
   - 严禁敷衍中文字体与对齐缩进：显式 `w:rFonts` 四属性（`ascii`、`hAnsi`、`eastAsia`、`cs`）、两端对齐严格写 `both`、首行缩进双写 `firstLineChars` + `firstLine`；
   - 严禁 Linter 作弊与放宽断言；
   - 严禁引入重型与原生编译坑依赖：
     - **运行期严禁依赖 Python / `.venv` / Docker / Redis / PostgreSQL / 重型 ORM（Prisma/TypeORM 等）**；
     - **严禁使用 C++ 原生编译 XML/图形插件**（如 `libxmljs2`、`node-canvas`），OOXML 操作统一使用纯 JS/TS 生态（`fflate` 或 `jszip` + `@xmldom/xmldom` + `xpath`）；
     - 数据库优先使用 Node 22+/26 原生内置 `node:sqlite`（`DatabaseSync`，本机 Node v26.3.0 已实测可用，零原生编译依赖）；
     - HTTP 服务使用极轻方案（推荐 `hono` + `@hono/node-server` 或原生 `node:http`）；
     - PDF 版面分析与图片转换一律使用本机已装的 Poppler 工具链（`pdftohtml` / `pdftotext` / `pdfinfo` / `pdftoppm`）与 `soffice`；
     - 前端必须能独立完成本地 `npm run build` 打包且**严禁依赖外网运行期 CDN**。
   - **OOXML Schema 顺序与命名空间安全硬约束**：必须在 `packages/engine/src/xml_utils.ts` 中维护 WordprocessingML Schema 元素顺序表（`PPR_ORDER`、`RPR_ORDER`、`SECTPR_ORDER` 等）与 `insertInSchemaOrder` 工具，禁止用字符串正则拼凑或破坏 XML 命名空间声明；跨文档克隆节点必须规范使用 `importNode(node, true)`。
   - 严禁“代码高尔夫 / 伪压缩”写法：所有 `.ts` / `.vue` 源码必须模块化、正常分行缩进、无分号多语句堆砌、单行 ≤ 110 字符（长提示词/测试句/Tailwind 类名除外）；升级并运行 `npm run stylecheck`（`scripts/check_style.ts`），纳入全部 `packages/*/src/**/*.{ts,vue}` 与 `eval/*.ts` 源码，退出码 0；
   - 严禁伪造任何评测数字、Token 统计或视觉验收结果；
   - 严禁跳步：必须严格按 `V3-M0 → V3-M1 → V3-M2 → V3-M3 → V3-M4 → V3-M5` 顺序推进，每关门禁退出码 0 并打卡写入 `PROGRESS.md`。
2. **【V3 硬红线 A】严禁篡改两套锁定真实语料库与既有 V2 评测资产**：
   - `eval/real_docs/`（16 份真实高校公文与 `manifest.json`）与 `eval/real_docs_v3/`（14 份真实公开硕士/博士论文模板、国家重点研发计划申报书、重大专项申报书与政府/高校技术合同协议，含 `manifest.json`）均已锁定 SHA256。
   - 保留 `eval/fixtures/`、`eval/nl_instructions.jsonl`、`eval/report.md`、`eval/results.json`、`design/swiss_workbench_reference.html` 与 `.env` 不篡改。
   - **严禁修改、替换、删除 30 份锁定语料中的任何原文件或篡改 `manifest.json`！** 最终门禁逐文件校验 30/30 SHA256。
3. **【V3 硬红线 B】上下文与 Token 预算强门禁（防止把原 XML / 长文 / 历史大图塞爆模型）**：
   - `doc_inspector.ts` 对任意 30 份真实文档（哪怕是 787 段、22 表格的 `v3_04_seu_national_rd_form.docx` 或 361 段、17 节的 `v3_02_szu_master_thesis.docx`）输出的骨架摘要文本长度必须 **≤ 6,000 字符**（通过样式指纹聚类去重实现），严禁把整份文档全文或原始 XML 扔给模型；
   - Pi-Agent `transformContext` 每轮注入的当前模板能力卡必须 **≤ 1,500 字符**；
   - Pi-Agent `transformContext` 必须实现 **“历史视觉图片阅后即焚”**：一旦模型审阅完工具返回的图片并给出回复，下一轮调用前必须自动将历史消息中的图片块替换为 1 行简短文字摘要，**严禁图片 base64 留在多轮对话历史中重复计费**（必须有专项单测硬断言历史消息中不再残留旧图片块）。
4. **【V3 硬红线 C】原件无损留壳与原生 XML 原型克隆（禁止退回 V2 清空重写）**：
   - 使用留壳模板资产组装新文档时，必须真实保留原件母版中的静态保留区：`word/media/*` 嵌入图片（如校徽、图片红头）、保留区 VML/Drawing 图形（如五角星红线）、封面区、文末版记区、原件页眉页脚与文档网格 `w:docGrid`；
   - 新插入的正文段落、标题、行内加粗段、表格（含三线表、明细表行）、参考文献必须通过**深拷贝原件示范节点的原生 `pPr` / `rPr` / `tblPr` / `tcPr` / `numPr`** 生成，而不是丢弃原件样式回退到写死的公文样式；
   - 测试中必须对带图片与多节页眉的真实模板（`v3_01_pku_master_thesis.docx`、`v3_02_szu_master_thesis.docx`、`real_01_cdsu_red_notice.docx`、`v3_04_seu_national_rd_form.docx`、`v3_08_shgov_coop_dev_contract.doc`）做 ZIP/XML 硬断言：证明**原 `word/media/` 图片资产与保留区结构在新产物中真实存活**！
5. **【V3 硬红线 D】零拷贝保真套版必须 100% 零改字**：
   - 保真套版模式中，草稿段落由引擎编号为 `P0..Pn` 存本地，模型只返回区间/ID 到槽位与原型的映射 JSON（如 `{"range": "P3-P12", "prototype": "body"}`）；
   - 渲染产出 `.docx` 的正文内容与原草稿文本的逐字匹配率必须 **= 100.00%**（除显式勾选的公文标点规范化项外，严禁遗漏、截断或改写任何一字）。
6. **【V3 硬红线 E】文本版面遥测 + 按需视觉双轨必须真接入且支持 3 模式**：
   - 文本版面遥测必须用本机 `pdftohtml -xml` + `pdfinfo`（或 `pdftotext`）真实解析 LibreOffice 输出的 PDF，准确输出每页行数、页底占空比、总页数、孤立落款（见章不见文）、末页 1~3 行溢出与跨页表格警报；
   - 视觉终审必须支持 `.env` 三种配置：① `LLM_SUPPORTS_VISION=true`（单模型原生多模态）；② 配置 `VISION_MODEL` / `VISION_API_KEY` / `VISION_BASE_URL`（便宜视觉侧车，主模型继续用 DeepSeek）；③ 未配置时自动优雅降级为纯文本遥测 + OOXML 审计，零报错；
   - 视觉终审仅在 OOXML 审计与文本遥测通过后触发，仅采样关键页（首页 + 末页 + 含复杂表格页，最多 3 页，缩放宽 ≤ 960px），最多 2 轮，输出结构化 JSON 问题清单。

---

## 一、全栈 TypeScript Monorepo 目录与模块锁定

在完成 V3-M0 迁移回归后，项目统一收口为单一 Node/TypeScript Monorepo（使用根目录 `package.json` 的 npm workspaces，包名前缀 `@docs-agent/*`）：

```text
/home/missi/project/docs-agent/
├── package.json                       # npm workspaces: ["packages/*"]，统一脚本: typecheck / test / build / start / stylecheck
├── tsconfig.base.json                 # 公共严格 TS 编译配置
├── start.sh                           # 单进程一键启动脚本（仅需 Node + soffice + Poppler；默认 PORT=8000，兼容 ENGINE_PORT）
├── scripts/
│   └── check_style.ts                 # 源码风格门禁（检查 packages/*/src/**/*.{ts,vue}、scripts/*.ts、eval/*.ts 与 4 份 Skills）
├── packages/
│   ├── shared/                        # @docs-agent/shared — 单一真源 Schema (TypeBox) 与跨端类型
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── v2_schemas.ts          # V2 兼容: FormatProfile / StyleSpec / DocContentAST / LintReport / Violation
│   │       └── v3_schemas.ts          # V3 新增: Skeleton / Blueprint / TemplateAsset / DraftIndex / ComposePlan / LayoutTelemetry / VisionAudit / SSEEvent
│   ├── engine/                        # @docs-agent/engine — 纯 TS 确定性文档引擎（OOXML + SQLite + Poppler/LibreOffice）
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── xml_utils.ts           # ZIP(fflate/jszip) + @xmldom/xmldom + xpath + Schema 顺序插入表 (PPR/RPR/SECTPR) + importNode 封装
│   │   │   ├── doc_converter.ts       # 魔数嗅探 (.doc D0CF11E0A1B11AE1 → soffice 转 .docx) + PDF/PNG 转换
│   │   │   ├── defaults.ts            # GB/T 9704 国标默认预设与 12 种中文字号表
│   │   │   ├── store.ts               # node:sqlite (DatabaseSync) 统一管理 V2 profiles + V3 template_assets 索引
│   │   │   ├── ooxml_extractor.ts     # V2 兼容：OOXML 继承提取 + 空白母版剥离
│   │   │   ├── nl_parser.ts           # V2 兼容：LLM 解析 + 字面规则补全 + Schema 校验
│   │   │   ├── renderer.ts            # V2 兼容：DocContentAST + FormatProfile 确定性渲染
│   │   │   ├── linter.ts              # V2 兼容：独立解压 OOXML 逐项审计
│   │   │   ├── repair.ts              # V2 兼容：按审计路径定向修复磁盘 DOCX（原子写回）
│   │   │   ├── doc_inspector.ts       # V3：任意 .doc/.docx 样式指纹聚类与骨架压缩器 (≤ 6,000 chars)
│   │   │   ├── template_store.ts      # V3：通用模板资产库 (data/template_assets/<id>/{base.docx, blueprint.json, SKILL.md}) + 能力卡生成
│   │   │   ├── draft_ingestor.ts      # V3：草稿摄入器 (纯文本/Markdown/乱格式.docx → 编号段落 P0..Pn + 摘要)
│   │   │   ├── composer.ts            # V3：原件留壳填槽 + 原生 XML 原型克隆 + 行内混排(三级标题首句加粗等) + 零拷贝组装 + docGrid
│   │   │   ├── layout_telemetry.ts    # V3：Poppler PDF 解析器 (pdftohtml -xml + pdfinfo → 行数/占空比/孤立落款/尾巴溢出/跨页表格)
│   │   │   ├── layout_adjuster.ts     # V3：确定性版面收口手术器 (行距微调/段距微调/字符紧缩/表格列宽/强制同页)
│   │   │   └── visual_auditor.ts      # V3：关键页 PNG 压缩采样 (≤ 960px) + 可选廉价视觉模型终审 (原生/侧车/优雅降级)
│   │   └── tests/
│   │       ├── v2_compat.test.ts      # V2 全量兼容回归（20 合成范本 + 16 真实公文 + NL 规则 + 渲染/审计/故障注入修复 + SQLite）
│   │       ├── v3_inspector_store.test.ts
│   │       ├── v3_composer_zerocopy.test.ts
│   │       ├── v3_layout_vision.test.ts
│   │       └── v3_real_corpus_30.test.ts  # 覆盖 eval/real_docs (16) + eval/real_docs_v3 (14) 全部 30 份真实文档
│   ├── server/                        # @docs-agent/server — 单进程统一服务端（Pi-Agent + HTTP API + SSE + 静态托管）
│   │   ├── package.json
│   │   ├── skills/                    # 迁入并保留 V2 四种文种 Skill (notice/request/minutes/letter.md，每份 ≥ 40 行)
│   │   ├── src/
│   │   │   ├── app.ts                 # 统一 HTTP 应用（V2 9+2 路由 + V3 路由 + /chat SSE + /sessions* + /files/* + 托管 packages/web/dist）
│   │   │   ├── agent.ts               # Pi-Agent 装配（@mariozechner/pi-agent-core & pi-ai），所有工具进程内直调 @docs-agent/engine
│   │   │   ├── tools_v2.ts            # V2 6 个工具兼容实现
│   │   │   ├── tools_v3.ts            # V3 7 个通用文档手术工具
│   │   │   ├── skills.ts              # 按需加载文种 Skill 与模板 SKILL.md
│   │   │   ├── context_hook.ts        # ≤ 1,500 chars 模板能力卡注入 + 历史视觉图片阅后即焚 + 旧工具输出折叠 + 统一 Token 计量
│   │   │   ├── session_tree.ts        # 持久化树状会话分叉（data/sessions.json，含分支对话条数与绑定模板/预设）
│   │   │   └── main.ts                # 服务启动入口（读取根目录 .env，默认监听 127.0.0.1:8000）
│   │   └── tests/
│   │       ├── api_v2_v3.test.ts      # 单进程全接口集成测试（V2 9+2 + V3 全路由 + 会话分叉）
│   │       ├── context_hook.test.ts   # 专项硬断言：能力卡长度限制 + 历史图片阅后即焚 + Token 计量
│   │       └── e2e_verify_v3.ts       # V3 端到端验收（公文/论文/合同三类真实模板 + 零拷贝保真 + 自动压页收口 + 真实 LLM）
│   └── web/                           # @docs-agent/web — Vue 3 + Vite + TypeScript + Tailwind CSS 前端工作台
│       ├── package.json
│       ├── vite.config.ts             # 构建输出至 packages/web/dist；dev proxy 指向 :8000
│       ├── index.html
│       └── src/
│           ├── main.ts
│           ├── App.vue                # 按「B · 极简瑞士」视觉规范构建的渐进式披露双模式工作台
│           └── components/            # 顶栏格式选择器浮层、导入弹窗、套版/对话区、A4 点阵纸张舞台、调试侧栏与双轨诊断抽屉
└── eval/
    ├── real_docs/                     # 已锁定：16 份真实公文 + manifest.json (严禁篡改)
    ├── real_docs_v3/                  # 已锁定：14 份真实论文/申报书/合同 + manifest.json (严禁篡改)
    ├── fixtures/                      # 已锁定：20 份 V2 合成范本 + 真值 JSON
    ├── run_benchmark_v3.ts            # 跨领域 30 份真实文档 + 零拷贝长文套版 + 版面溢出收口 + 单文档 Token 统计评测
    ├── results_v3.json                # 真实评测原始结果
    └── report_v3.md                   # 真实评测报告
```

> **旧代码迁移与清理策略**：在 **V3-M0** 迁移阶段可参考原 `engine/` 与 `agent/` 实现细节确保 100% 行为对齐；待 **V3-M5** 全部门禁与 30 份真实语料评测绿灯后，彻底清理旧双服务目录（旧 `engine/`、旧 `agent/`、旧单文件 `web/index.html` 与不再需要的 `eval/check_style.py`），确保仓库交付形态干净唯一、运行期零 Python 依赖（保留 `eval/` 锁定语料与 V2 历史评测报告 `eval/report.md`、`eval/results.json`）。

---

## 二、全新前端设计规范（锁定风格：B · 极简瑞士 · 现代效率风）

彻底重做前端工程为 **`packages/web/`（Vue 3 + Vite + TypeScript + Tailwind CSS）**，直接复用 `@docs-agent/shared` 类型，构建产物输出至 `packages/web/dist/` 由 `packages/server` 在 `/` 与 `/assets` 统一托管（同源单端口，零 CORS，无需配置独立 Agent 端口），并确保 `GET /` 始终返回 200 且离线内网不依赖外部运行时 CDN。

> **视觉与交互高保真参考稿（必须严格对标）**：仓库中已提供完整可交互参考页面 **`design/swiss_workbench_reference.html`**。在实现 Vue 3 组件时，必须严格对齐该参考稿的**默认极简两栏普通模式 + 右上角一键切换调试模式（渐进式披露）**的布局、色板、留白、字号层级、格式下拉浮层、导入弹窗、按需浮现的人话建议条、点阵 A4 纸张舞台及调试态诊断抽屉，**严禁在普通模式下堆满工程术语或降级成简陋原始表单**（生产构建中需将样式通过本地 Tailwind/CSS 打包进 `packages/web/dist/`，不得保留参考稿中的外部 `gstatic` CDN 脚本）。

### 1. 锁定视觉设计系统（Linear / Notion 极简瑞士风）
- **核心色板（CSS 变量定义在 `:root`）**：
  - 页面底色 `--bg: #F8FAFC`
  - 顶栏与主卡片 `--surface: #FFFFFF`
  - 调试侧栏 `--sidebar: #F4F6F9`
  - 右侧 A4 预览画布 `--canvas: #EEF2F6`（配 20px 淡灰点阵背景）
  - 细线边框 `--border: #E2E8F0`
  - 主文字 `--text: #0F172A`、辅助文字 `--muted: #64748B`
  - 主强调色 `--accent: #2563EB`（浅高亮 `--accent-soft: #EFF6FF`）
  - 语义状态色：通过 `--ok: #059669` / `#ECFDF5`；警告 `--warn: #D97706` / `#FFFBEB`；错误 `--danger: #DC2626` / `#FEF2F2`
- **排版与空间质感**：
  - 系统无衬线字体栈 + 数字/Token/页码使用等宽 `font-variant-numeric: tabular-nums`；
  - 卡片统一 `10px` 圆角、`1px solid var(--border)` 细腻描边、A4 预览纸张采用纯白 `#FFFFFF` + 真实纸张投影；
  - 拒绝老土深青大色块标题栏、拒绝原始丑陋浏览器默认表单堆叠、拒绝普通模式出现工程黑话。

### 2. 锁定“普通模式（默认） + 调试模式（开关）”渐进式信息架构
#### A. 普通模式（默认关闭「调试模式」—— 极简安静两栏）
面向真实日常用户，页面上**只保留“一个格式、一篇文章、一个预览与下载”**：
1. **顶部极简栏（高 54px）**：
   - 左侧：品牌标（`DocForge`）+ **格式选择器胶囊**（如 `格式：学校红头下行文模板 [公文] ▾`）。点击弹出清爽浮层（按 公文/论文/合同 筛选、一键切换格式、或点击 `+ 导入新范例` 打开导入弹窗），选完即收起，**不常驻占屏左侧栏**；
   - 右侧：仅保留一个低调的 **`调试模式` 开关**（默认关闭）。
2. **左栏（约 44% · 专注文章）**：
   - 顶部简洁二选一切换：**「原文字套格式」**（默认，副提示“仅排格式，不改原文一字”）与 **「让 AI 写 / 改」**；
   - 「原文字套格式」态：一个大而干净的正文编辑框 + 右上角 `导入草稿 .docx / .txt` 入口；底部一个标点规范化勾选项 + 唯一主按钮 **`套用格式`**；
   - 「让 AI 写 / 改」态：清爽人话对话气泡（**隐藏工具轨迹与 JSON**）+ 底部圆角输入框与发送按钮。
3. **右栏（约 56% · 专注 A4 预览与下载）**：
   - 顶部极简一行：左侧一句人话状态（如 `● 共 2 页 · 格式已排好，可直接打印`），右侧页码切换 `1 / 2` + 唯一主按钮 **`下载 Word`**；
   - **按需浮现的温柔建议条**：平时不显示任何多余微调按钮；仅当后台检出真实版面问题（如第 3 页多出 2 行孤立落款）时，在预览顶栏下方浮现一条浅琥珀建议条（`第 3 页仅多出 2 行落款，可能影响打印美观` + **`[ 一键压进 2 页 ]`**），用户点完收口后自动消失；
   - 中央点阵画布展示大号清晰 A4 纸张预览，**无底部诊断抽屉、无 Token/OOXML/Poppler 噪音**。

#### B. 调试模式（打开右上角「调试模式」开关 —— 完整工程师工作台）
一键开启后，无刷新平滑展开全部 V3 硬核工程信息（供开发者调试与验收使用）：
1. **顶栏展开**：会话版本分支选择器（显示分支名与对话条数）+ `+ 分叉` 按钮 + **实时 Token 与成本账单** + **双轨模式切换开关（文本+视觉 / 纯文本降级）**；
2. **左侧滑出调试侧栏（268px）**：完整模板资产卡片列表（槽位数/原型数）+ 底部「上下文能力卡预览（含 token 数与保留壳清单）」；
3. **中栏展开**：套版模式显示「零拷贝段落 ID 区间映射表（`P0 → slot:title`、保真率与输出 token）」；对话模式显示可折叠「Pi-Agent 工具执行与双轨检查轨迹」；底部显示快捷版面手术调试胶囊条；
4. **右栏展开**：缩放控件（88% / 100% / 112%）、`OOXML 100%` / `Poppler 遥测` / `视觉终审` 三枚技术状态徽章，以及底部三标签「双轨诊断抽屉」（版面遥测进度条 / OOXML 审计 / 视觉终审与历史图片阅后即焚状态）。

### 3. 响应式与无报错
窄屏自动堆叠不溢出版面；浏览器 console 零报错，所有按钮真实绑定同源后端 API，严禁假按钮/死数据。

---

## 三、单进程统一接口契约与 Pi-Agent 7 工具契约

### 1. 统一 HTTP / SSE 接口（单进程监听 `PORT`，默认 `8000`）
- **V2 既有 9+2 接口 100% 向下兼容**：
  - `GET /health`（返回 `service`、`sqlite`、`libreoffice`、`pdftoppm`、`llm_configured`、`vision_mode`）
  - `GET /api/profiles`、`GET /api/profiles/:id`、`POST /api/profiles/extract`、`POST /api/profiles/from-nl`、`POST /api/profiles/:id/fork`、`PUT /api/profiles/active`、`DELETE /api/profiles/:id`
  - `POST /api/documents/render`、`POST /api/documents/repair`、`POST /api/documents/lint`
  - `GET /files/*`（静态提供 `data/` 生成产物与 PNG 预览）
  - `GET /`（托管 `packages/web/dist/index.html` 与 `/assets/*`）
- **Pi-Agent 会话与流式对话接口（合并入同一端口，不再单独监听 8787）**：
  - `POST /chat`（SSE 推送：文本增量、工具进度胶囊、产物事件、Token 用量事件、双轨遥测与视觉事件、完成/错误事件）
  - `GET /sessions`、`POST /sessions/fork`、`POST /sessions/switch`（返回分支列表、当前节点、对话条数及绑定模板/预设）
- **V3 新增通用文档与模板接口**：
  - `POST /api/v3/templates/inspect` — 上传 `.doc/.docx`，返回骨架压缩 JSON（≤ 6,000 chars）+ 关键页采样 PNG；
  - `POST /api/v3/templates` — 保存内化后的模板资产包（`base.docx` + `blueprint.json` + `SKILL.md`），返回模板资产详情与精简能力卡；
  - `GET /api/v3/templates` / `GET /api/v3/templates/:id` / `PUT /api/v3/templates/active` / `POST /api/v3/templates/:id/fork` / `DELETE /api/v3/templates/:id` — 模板库全生命周期管理（兼容返回 V2 预设供平滑过渡）；
  - `POST /api/v3/drafts/ingest` — 接收粘贴文本/Markdown 或上传草稿 `.docx`，拆解为编号段落 `P0..Pn` 落盘，返回紧凑段落索引摘要；
  - `POST /api/v3/documents/compose` — 接收 `{template_id?, mode: "exact_copy"|"authored", draft_id?, slot_values, body_plan, normalize_punctuation?}`，执行留壳填槽 + 原型克隆 + 零拷贝组装，自动跑 OOXML 审计 + Poppler 文本版面遥测 + PNG 生成；
  - `POST /api/v3/documents/:doc_id/adjust-layout` — 确定性执行版面手术（`compact_pages` / `prevent_orphan_signature` / `line_spacing_delta` / `space_after_delta` / `table_col_widths`），返回调整前后遥测对比与新 PNG；
  - `POST /api/v3/documents/:doc_id/visual-audit` — 采样关键页（首页/末页/表格页，宽 ≤ 960px）调用已配置的视觉模型（或返回 `status: "skipped_no_vision_model"` 优雅降级）。

### 2. Pi-Agent V3 7 个通用工具（`packages/server/src/tools_v3.ts`，进程内直调 `@docs-agent/engine`）
1. `inspect_reference_doc(file_path, sample_pages?)`
2. `save_template_asset(inspect_id, name, category, blueprint, rules_md, set_active?)`
3. `manage_templates(action: "list"|"get"|"set_active"|"fork"|"delete", ...)`
4. `ingest_draft(text?, file_path?)`
5. `compose_document(template_id?, mode, draft_id?, slot_values?, body_plan, normalize_punctuation?)`
6. `adjust_layout(doc_id, operations)`
7. `audit_and_inspect(doc_id, run_vision?)`

（同时保留 V2 既有 6 个工具在 `tools_v2.ts` 中供兼容模式/回归验证使用，所有工具共享 `@docs-agent/shared` 的 TypeBox Schema，严禁再写跨端口 localhost HTTP 客户端。）

---

## 四、串行里程碑与硬门禁（每关退出码 0 并打卡写入 `PROGRESS.md`）

### V3-M0：全栈 TypeScript Monorepo 基座 + V2 引擎与单进程接口 100% 平替回归
- 搭建根目录 `package.json`（npm workspaces）、`tsconfig.base.json`、`scripts/check_style.ts` 与四个 workspace 包（`shared`、`engine`、`server`、`web` 骨架）；
- 用纯 TS 实现 `packages/engine` 的 V2 全部能力：`xml_utils.ts`（含 OOXML Schema 顺序插入表）、`doc_converter.ts`、`defaults.ts`、`store.ts`（基于 `node:sqlite`）、`ooxml_extractor.ts`、`nl_parser.ts`、`renderer.ts`、`linter.ts`、`repair.ts`；
- 实现 `packages/server` 单进程统一服务（合并原 FastAPI 9+2 路由与 Pi-Agent `/chat` `/sessions*`，工具进程内直调 `engine`）；迁入 4 份文种 `skills/*.md`；
- **V3-M0 硬门禁**：
  1. `npm run typecheck` 全 workspace 0 错误；
  2. `packages/engine/tests/v2_compat.test.ts` 与 `packages/server/tests/api_v2_v3.test.ts` 100% PASS，硬验证：
     - `eval/fixtures/` 20 份合成范本提取字段准确率 = **100%**，重渲染独立审计 **20/20 PASS**；
     - `eval/real_docs/` 16 份真实公文（含 `.doc` 与误命名 OLE）全部提取、空白母版剥离、重渲染、独立审计与 PNG 生成 **16/16 PASS**；
     - NL 规则解析（覆盖中文字号表与父预设继承）、故障注入定向修复（违规归零）、`node:sqlite` 重启持久化、V2 9+2 接口与 `/sessions` 单端口契约全部 PASS。

### V3-M1：通用骨架压缩器 + 模板资产库（30 份真实跨领域文档全吃通）
- 实现 `packages/engine/src/doc_inspector.ts` 与 `packages/engine/src/template_store.ts`；
- 编写 `packages/engine/tests/v3_inspector_store.test.ts` 与 `packages/engine/tests/v3_real_corpus_30.test.ts` 的解剖阶段。
- **V3-M1 硬门禁**：
  1. 校验 `eval/real_docs/manifest.json`（16 份）+ `eval/real_docs_v3/manifest.json`（14 份）共 **30/30 SHA256 完整无篡改**；
  2. 30/30 真实 `.doc/.docx` 全部零崩溃完成骨架解剖，且 **30/30 输出骨架字符数均 ≤ 6,000 字符**；
  3. 模板资产库入库（`base.docx` + `blueprint.json` + `SKILL.md`）、切换默认、fork、重启持久化与精简能力卡（≤ 1,500 字符）测试 100% PASS。

### V3-M2：原件留壳填槽 + 原生 XML 原型克隆 + 零拷贝保真套版
- 实现 `packages/engine/src/composer.ts` 与 `packages/engine/src/draft_ingestor.ts`：
  - 支持静态保留区不动、槽位原位替换、段落与表格原生 XML 节点深拷贝克隆（规范使用 `importNode` 与 Schema 顺序插入）、行内混排（三级标题首句加粗 + 合同重点句加粗下划线）、`w:docGrid` 22×28 网格写入、公文标点可选规范化（如 `〔〕`）；
  - 支持从纯文本 / Markdown / 乱格式 `.docx` 摄入草稿并按 ID 零拷贝搬运。
- **V3-M2 硬门禁**：
  1. `npx vitest run packages/engine/tests/v3_composer_zerocopy.test.ts` 100% PASS；
  2. 对带图片/多节页眉/表格的 5 类代表性真实模板（`real_01_cdsu_red_notice.docx`、`v3_01_pku_master_thesis.docx`、`v3_02_szu_master_thesis.docx`、`v3_04_seu_national_rd_form.docx`、`v3_08_shgov_coop_dev_contract.doc`）完成真实留壳套版，硬断言：**原 `word/media/` 图片资产与保留区结构在新产物中真实存活**，且 LibreOffice 成功转 PDF/PNG；
  3. 长文（≥ 3,000 字）零拷贝保真套版硬断言：**渲染产物正文与原草稿字符保真率 = 100.00%**，且行内首句加粗在 XML 中验证为双 Run（首句 `w:b=1`，后文 `w:b=0`）。

### V3-M3：文本版面遥测 + 确定性版面收口 + 按需视觉终审 + Pi-Agent V3 闭环
- 实现 `packages/engine/src/layout_telemetry.ts`（Poppler `pdftohtml -xml` + `pdfinfo`）、`layout_adjuster.ts`、`visual_auditor.ts`；
- 实现 `packages/server/src/tools_v3.ts`，完善 `context_hook.ts`（≤ 1,500 字符能力卡 + **历史图片阅后即焚** + 统一 Token 统计）与 `app.ts`（V3 路由 + SSE 完整事件流）；
- 编写 `packages/engine/tests/v3_layout_vision.test.ts`、`packages/server/tests/context_hook.test.ts` 与 `packages/server/tests/e2e_verify_v3.ts`。
- **V3-M3 硬门禁**：
  1. `v3_layout_vision.test.ts` 100% PASS，真实覆盖：① 构造一份末页溢出 2 行且落款孤立掉页的真实 `.docx` → Poppler 遥测准确检出 `tail_overflow` 与 `orphan_signature` → 调用 `adjust_layout` 自动压回整页 → 再次遥测 `warnings=[]`、总页数减 1；② 视觉终审在有/无 `VISION_MODEL` 下的结构化解析与优雅降级；
  2. `npm run typecheck` 0 错误；
  3. `context_hook.test.ts` 专项硬断言：`transformContext` 在图片审阅轮之后彻底清除历史消息中的 base64 图片块并保留 1 行文本摘要，且能力卡长度 ≤ 1,500 字符；
  4. 启动单进程服务跑通 `e2e_verify_v3.ts`（确定性全流程 + 真实 DeepSeek LLM 端到端验证：覆盖公文/论文/合同三类真实模板、零拷贝套版、版面收口与清理临时数据）全部 PASS。

### V3-M4：极简瑞士风新前端彻底重做（`packages/web`：Vue 3 + Vite + TS · 普通/调试双模式）+ 真实浏览器视觉验收
- 严格对标 `design/swiss_workbench_reference.html` 与本文第二节「B · 极简瑞士 · 渐进式披露双模式」规范，在 `packages/web/` 采用 Vue 3 + Vite + TypeScript + Tailwind CSS 组件化构建，构建产物输出至 `packages/web/dist/` 由 `packages/server` 在 `/` 托管，接入全部 V3 同源接口（并兼容 V2 预设与接口）；
- **V3-M4 硬门禁**：
  1. `npm run build`（含 `packages/web` 打包与 TypeScript 类型检查）退出码 0，无任何编译错误或未打包的外网运行期 CDN；服务 `GET /` 返回 200 并正确加载静态资源；`npm run stylecheck` 退出码 0；
  2. 实际启动单进程服务，使用无头浏览器（Chromium）打开 `http://localhost:8000` 工作台，实测：**零 console/pageerror 报错**；默认进入极简两栏普通模式（不出现 Token/OOXML/Poppler/能力卡等调试噪音），顶栏格式选择器、导入范例弹窗、原文字套格式与 AI 对话切换、按需浮现的「一键压进整页」建议条、A4 预览翻页与下载全部正常；开启右上角「调试模式」后，模板能力卡、零拷贝段落 ID 映射、实时 Token 账单、会话分支切换（恢复历史与对话条数）及底部三标签诊断抽屉全部正常展示与交互；
  3. 分别截取桌面端（`1440×900`）**普通模式**（`data/visual-check-v3/ui-normal.png`）与**调试模式**（`data/visual-check-v3/ui-debug.png`）两张真实运行截图并**亲自读图核验视觉品质**，确认普通模式极简克制、调试模式清晰有序，均达到参考稿水准，核验结论写入 `PROGRESS.md`。

### V3-M5：跨领域 + Token 成本双维 Benchmark、旧 Python 遗产清理与零回归交付
- 编写并运行 `eval/run_benchmark_v3.ts`（`npx tsx eval/run_benchmark_v3.ts`），生成真实 `eval/results_v3.json` 与 `eval/report_v3.md`，涵盖 4 组实测：
  1. **30 份真实跨领域文档全链路评测**（16 公文 + 4 论文/规范 + 3 申报表 + 7 合同）：骨架压缩率与字符数、原件留壳保真率（`word/media` 与保留区存活率）、组装渲染成功率、PNG 生成率；
  2. **零拷贝保真套版评测（6 份跨领域长草稿，每份 1,500~5,000 字）**：正文逐字保真率（必须 100%）、真实 LLM 单文档 Token 消耗（prompt_tokens + completion_tokens 实测均值）；
  3. **真实版面溢出自动收口评测（6 份真实溢出/孤立落款样本）**：收口前警报数 → 收口后警报归零率与页数收敛实测；
  4. **双轨视觉终审评测**：记录真实运行模式（原生多模态 / 侧车视觉 / 纯文本优雅降级）及关键页采样统计。
- 彻底清理旧双服务代码目录（原 Python `engine/`、原独立 `agent/`、原单文件 `web/index.html`），更新 `start.sh` 为单进程纯 Node 启动脚本（支持 `PORT` 与向后兼容 `ENGINE_PORT`，启动前检测端口冲突与 `packages/web/dist` 构建状态，零 Python 依赖）；保留 `eval/` 锁定语料、测试夹具与 V2 历史评测报告不动。
- **V3-M5 硬门禁**：
  1. 全量测试 `npm test` **100% PASS（V2 全量兼容回归 + V3 全部单元测试、30 份真实语料测试、API 集成测试与上下文钩子测试零失败）**；
  2. `npm run typecheck`、`npm run build`、`npm run stylecheck` 全部 0 错误；
  3. 30/30 真实语料（`eval/real_docs/` 16 份 + `eval/real_docs_v3/` 14 份）SHA256 完整性校验全部 PASS；
  4. 数据库 `data/profiles.db` / `data/template_assets/` 与 `data/sessions.json` 处于干净交付状态（无残留测试垃圾）；
  5. 更新 `README.md`（补充全栈 TS Monorepo 单进程架构图、`npm install && npm run build && ./start.sh` 极简启动说明、三类文档使用指南、极简瑞士工作台截图、双轨视觉配置说明与 V3 实测指标及单文档 Token 账单）与 `PROGRESS.md`，实测 `./start.sh`（及 `PORT=18000 ./start.sh`）单进程健康启动且运行期零 Python 依赖。

=== GOAL PROMPT V3 结束 ===

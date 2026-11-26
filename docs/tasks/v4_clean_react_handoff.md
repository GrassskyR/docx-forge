# DocForge V4 交接文档（Handoff for Next Agent）

- **当前分支**：`feature/v4-docforge`
- **基线状态**：`npm run typecheck` 通过、`npm run stylecheck` 通过、`npm run build` 已产物化、全量单测 **10 个测试套件 / 47 项用例 100% 通过**。
- **核心基准成绩（30 份高校真实实验报告 `.doc/.docx` 盲测，零特判 / 原生多模态 ReAct）**：
  - 端到端严格全项通过率（`strict_e2e_pass`）：**`21 / 30 (70.0%)`**（对照组 `rule_baseline` 为 `0 / 30`，`rule_enhanced` 为 `4 / 30`）
  - 渲染 PDF 零空白页率：**`27 / 29 (93.1%)`**
  - 独立 OOXML 分节/媒体守恒审计 & 目录真实页码校验：**`29 / 29 (100.0%)`**
  - 顶部横幅保留率 & 全页大框表保真率：**`28 / 29 (96.6%)`**

---

## 一、绝对不可逾越的架构红线（最高优先级）

接手开发的 Agent **严禁为了刷高评测分数而触碰以下任何一条红线**：

1. **严禁往确定性引擎或服务端塞入任何领域词表或特判规则**
   - `packages/engine`、`packages/server`、`packages/shared` 中禁止出现任何针对特定文种（如“大学/实验报告/目的/原理/步骤/总结/批阅/签字”）的正则匹配、打分公式（如猜最大单元格）或按字数估算行高的魔法常数。
   - 可随时用以下命令自检（输出必须保持 **0 行**）：
     ```bash
     grep -rnE "大学|实验|关文聪|天大|深大|电子科大|桂林|宜春|目的|器材|原理|步骤|总结|批阅|签字" packages/engine/src packages/server/src packages/shared/src
     ```
2. **严禁在生产 Prompt 中泄露任何评测集样本信息**
   - 提示词只能描述抽象的 OOXML 门牌号语法与通用排版协议，绝不允许举例任何评测集中的机构名、人名、学号、原句或具体坐标。
3. **`composer.ts` 必须保持 100% 纯原子执行（零越界猜测）**
   - 引擎只忠实执行 `Blueprint` 与 `ComposeInput` 显式声明的坐标手术；蓝图未点名的段落、空白行、分页符、行高、空分节一律不许暗自修改或清扫（避免误伤专著“扉页空白背页”、表单“手绘留白大框”或标书末页“纯扫描公章图”）。
4. **严禁静默吞错兜底**
   - 当大模型输出的坐标不存在、槽位为空或区间不连续时，`validateBlueprint` 与 `plan` 必须直接抛错进入 ReAct / 重试修正循环，绝不允许用默认段落 `B1` 或默认槽位静默掩盖错误。
5. **遵守仓库 [AGENTS.md](../../AGENTS.md) 规范**
   - 不要写过度防御的推测性分支；不要把测试日志或阶段总结塞进 `README.md`；源码单行长度不超过 `110` 字符且禁止同一行堆叠多条语句（提交前必跑 `npm run stylecheck`）。

---

## 二、近期关键 Git 提交演进记录

- `e6f742d`：铲除早期 V4 分支中全部硬编码中文路由、Prompt 真题泄露、假目录页码公式（`Math.ceil((idx+1)/3)`）、无脑抹颜色与评测豁免后门；落地同样式相邻 `<w:r>` 预合并 `coalesceRuns`、真实 PDF 目录页码回填 `syncRealTocPages` 与原生多模态支持。
- `5fa62ff`：移除 `composer.ts` 中越界清扫未声明节点的 `sanitizePostComposePagination`，恢复引擎 100% 纯原子执行语义。
- `1a28bb3`：新增 `B{i}.R{r}` 表格整行删除（自动提升纵向合并 `vMerge="restart"`）与 `drop_page_break` 两个纯原子手术原语；在 `workspace.ts` 落地携带原文档精确门牌号 `[原...]` 的多模态 ReAct 试填观测自审闭环，并打通 Agent 工具层关键页 PNG 视觉反馈。

---

## 三、现行核心架构与代码地图

### 1. 共享协议层（`packages/shared/src/schemas.ts`）
- **统一门牌号语法 `COORD_REGEX`**：
  - 顶层块：`B{i}`
  - 表格整行（专供 `remove_targets` 删行）：`B{i}.R{r}`
  - 表格单元格及格内段落：`B{i}.R{r}.C{c}`、`B{i}.R{r}.C{c}.P{p}`
  - 浮动文本框（兼容 `mc:AlternateContent` 主备双分支镜像同步）及框内段落：`B{i}.TX{t}`、`B{i}.TX{t}.P{p}`
  - 顶层非目录内容控件段落：`D{d}.P{p}`
- **`RemoveTarget` 原子指令集**：`start`、`end`、`match`（局部剥离子串）、`only_textboxes`（批量剥离浮动批注框）、`drop_section`（显式连同 `<w:sectPr>` 一并移除整节）、`drop_page_break`（仅剥离 `<w:br w:type="page"/>` 与 `<w:pageBreakBefore/>`，保留同段图形与文字）。

### 2. 确定性 OOXML 引擎层（`packages/engine/src/`）
- `dom_locator.ts`：
  - `coalesceRuns` / `coalesceParagraphRuns`：合并相邻同 `<w:rPr>` 的纯文本碎 Run；
  - `analyzeParagraphBlanks`：单遍统一识别 `<w:u>` 格式下划线、字面下划线 `___` 与冒号空白填空；
  - `stampSourceCoords` / `readStampedCoord`：试填时注入标准 XML 注释 `<!--@src:...-->`（对 Word / LibreOffice 100% 透明），保证删改后仍能精确追踪每个存活节点在 `base.docx` 中的原始门牌号。
- `doc_inspector.ts`：生成客观 `StyleDNA`（仅基于 OOXML 级联样式与字号，无中文正则猜测）与显式划分物理分节边界（`=== 第 k 节 B{s}..B{e} ===`）的 `DocumentMap`。
- `composer.ts`：纯原子组装器；当存在原生或新建 TOC 时，调用 `syncRealTocPages` 通过渲染 PDF + Poppler 反查标题真实所在页码回填 `<w:t>` 缓存值。
- `builders.ts`：无壳文档可选封面、原生可更新 TOC 控件与学术三线表构建器。
- `layout_telemetry.ts` & `layout_adjuster.ts`：Poppler 每页几何遥测（含行数、占空比、`excerpt` 首尾摘要、`blank_page` / `tail_overflow` / `orphan_signature` / `split_table`）及支持按 `section` 指定分节收口的版面微调器。

### 3. 服务端与多模态 ReAct 编排层（`packages/server/src/`）
- `workspace.ts`：
  - `internalize()`：先由原文档地图 + 前 1~3 页渲染图生成初始蓝图，随后进入最多 **3 轮 ReAct 循环**（`observeDryRun` 生成硬校验账本 + PDF 每页遥测 + 带 `[原...]` 坐标的残余节点地图 + 试填成品关键页 PNG -> `buildReActReviewPrompt` 由大模型输出 `{ thought, verdict: "accept" | "revise", blueprint }`）。
- `tools.ts` & `context_hook.ts`：
  - `compose_document`（有告警时）与 `refine_and_audit` 直接将成品关键页 PNG 作为 `ImageContent` 返回给 Pi-Agent，配合 `clearReviewedImages` 在下一轮自动清理已审阅历史图片。
- `model.ts`：统一模型调用入口（支持 `.env` 中 `LLM_SUPPORTS_VISION=true` 原生多模态或 `VISION_*` 侧车模式，含网络瞬断 `EOF/reset` 单次重试）。

---

## 四、当前未通过的 9 份样本真实根因与后续纯泛化演进方向

逐篇详情见 [eval/results_lab_reports.json](../../eval/results_lab_reports.json) 与 [eval/report_lab_reports.md](../../eval/report_lab_reports.md)：

| 失败类型 | 涉及样本 | 真实根因诊断 | 符合架构原则的纯泛化优化方向 |
|---|---|---|---|
| **模型空响应 / JSON 截断 (`F0`)** | `lab_27`（偶发，单跑可过） | 网关在开启思考或长输出时偶发返回空文本 `rawText === ""` | 在 `model.ts` 中启用结构化 `response_format: { type: "json_object" }`，并对空响应 `rawText === ""` 增加 1 次重试 |
| **局部说明/旧题干残留 (`F3`)** | `lab_09, 17, 18, 20, 25` | ① 固定标题同行括号提示未剥净（`lab_09`）；② 思考题旧题干或框底实验规则与固定评阅栏混淆（`lab_17, 18, 20, 25`） | ① 优化 ReAct 自审时的残余地图展示（如对超过 24 字的非标题存活原件文本高亮标出供模型逐条确认去留，而非塞入固定词表）；② 在评测与真实对话中区分“模板固有考题/评分表”与“旧填写答案” |
| **空白页残留 (`F6`)** | `lab_20, 22` | `lab_20` 正文槽选到了大框表外导致原空框留白；`lab_22` 封底自带独立无字装饰图形页（Poppler 计 0 行字） | ① 在 `telemetry` 中识别含大幅图片/图形的页面（不误报为无内容 `blank_page`）；② 在生成链路接入 Agent 组装后 `refine_and_audit` 版面收口闭环 |
| **单节顶部横幅连带替换 (`F2`)** | `lab_12` | 791 段长单节文档中模型将 `content_slots` 起点设得过靠前，覆盖了顶部横幅 | 在初始蓝图与 ReAct 自审中强化首页渲染图与顶部 `[原B0..B5]` 节点的视觉对齐核验 |
| **封面无对应字段探针偏差 (`F5`)** | `lab_11` | 原件封面本身未印制“学号”栏（旧学号出现在旧正文第 8 段分工表内），评测真值探针在前 80 段扫到了旧正文里的“学号”字样 | 校准 `eval/run_lab_report_benchmark.ts` 中真值探针 `buildGroundTruth` 的封面/表头范围判定，避免把旧范文正文里的词误判为封面必填槽 |

---

## 五、常用开发、测试与启动命令

> **环境提示**：当前机器 Node 位于 `/home/missi/.nvm/versions/node/v26.3.0/bin`（若非交互式 Shell 未加载 nvm，请先将其与 `$PWD/node_modules/.bin` 加入 `PATH`）。`.env` 已配置好 `LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL` 与 `LLM_SUPPORTS_VISION=true`。

```bash
export PATH="/home/missi/.nvm/versions/node/v26.3.0/bin:$PWD/node_modules/.bin:$PATH"

npm run typecheck                        # 全仓 TypeScript 类型检查
npm run stylecheck                       # 行宽 (<=110) 与单行语句规范检查
npm test                                 # 运行全量 10 套件 / 47 项单测与集成测试
npm run build                            # 类型检查 + 打包前端工作台至 packages/web/dist
./start.sh                               # 启动单端口服务 (默认 http://localhost:8000)

# 评测命令（支持 LAB_FILTER=lab_01,lab_15 按需单测抽检）
tsx eval/run_lab_report_benchmark.ts
```

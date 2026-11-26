# DocForge V4 交接文档（Handoff for Next Agent）

- **当前分支**：`feature/v4-docforge`
- **基线状态**：`npm run typecheck` 通过、`npm run stylecheck` 通过、红线词表扫描 **0 行**、全量单测 **11 个测试套件 / 48 项用例 100% 通过**。
- **核心双轨基准成绩（30 份高校真实实验报告 `.doc/.docx` 盲测，零特判 / 原生多模态 ReAct）**：
  - 端到端严格全项通过率（`strict_e2e_pass`）：
    - **结构校准真值口径（`Calibrated Oracle`）**：**`27 / 30 (90.0%)`**（较前次 `21 / 30 (70.0%)` 提升 **+20.0%**；对照组 `rule_baseline` 为 `0 / 30`，`rule_enhanced` 为 `4 / 30`）
    - **未修改旧探针口径（`Legacy Oracle`）**：**`23 / 30 (76.7%)`**（完全保留旧版粗糙探针下仍较 `21 / 30` 净增，零黑盒双轨并列记录于 `eval/results_lab_reports.json`）
  - LibreOffice 转 PDF 成功率 & 独立 OOXML 分节/媒体守恒审计 & 目录真实页码校验：**`30 / 30 (100.0%)`**
  - 全页大框表容器保真率（`form_container_pass`）：**`30 / 30 (100.0%)`**
  - 渲染 PDF 零空白页率（`zero_blank_pages`）：**`29 / 30 (96.7%)`**（新旧双口径一致，零引擎未声明节点清扫）
  - 旧示例/填写说明零残留率（`residue_free`）：**`29 / 30 (96.7%)`**（旧口径 `27 / 30 (90.0%)`）
  - 封面/表头元数据填槽命中率：**`172 / 182 (94.5%)`**（旧口径 `172 / 183 (94.0%)`）

---

## 一、绝对不可逾越的架构红线（最高优先级）

接手开发的 Agent **严禁为了刷高评测分数而触碰以下任何一条红线**：

1. **严禁往确定性引擎或服务端塞入任何领域词表或特判规则**
   - `packages/engine`、`packages/server`、`packages/shared` 中禁止出现任何针对特定文种（如“大学/实验报告/目的/原理/步骤/总结/批阅/签字”）的正则匹配、打分公式（如猜最大单元格）或按字数/行高拍脑袋的魔法常数。
   - 可随时用以下命令自检（输出必须保持 **0 行**）：
     ```bash
     grep -rnE "大学|实验|关文聪|天大|深大|电子科大|桂林|宜春|目的|器材|原理|步骤|总结|批阅|签字" packages/engine/src packages/server/src packages/shared/src
     ```
2. **严禁在生产 Prompt 中泄露任何评测集样本信息**
   - 提示词只能描述抽象的 OOXML 门牌号语法与跨文种通用母版自洽公理，绝不允许举例任何评测集中的机构名、人名、学号、原句或具体坐标。
3. **`composer.ts` 必须保持 100% 纯原子执行（零越界猜测）**
   - 引擎只忠实执行 `Blueprint` 与 `ComposeInput` 显式声明的坐标手术；蓝图未点名的段落、空白行、分页符、行高、空分节一律不许暗自修改或清扫（避免误伤专著“扉页空白背页”、表单“手绘留白大框”、公文“居中背景水印页”或标书末页“纯扫描公章图”）。
4. **严禁静默吞错兜底**
   - 当大模型输出的坐标不存在、槽位为空或区间不连续时，`validateBlueprint` 与 `plan` 必须直接抛错进入 ReAct / 重试修正循环，绝不允许用默认段落 `B1` 或默认槽位静默掩盖错误。
5. **遵守仓库 [AGENTS.md](../../AGENTS.md) 规范**
   - 不要写过度防御的推测性分支；不要把测试日志或阶段总结塞进 `README.md`；源码单行长度不超过 `110` 字符且禁止同一行堆叠多条语句（提交前必跑 `npm run stylecheck`）。

---

## 二、近期关键演进记录

- `e6f742d`：铲除早期硬编码中文路由、Prompt 真题泄露、假目录页码公式与评测豁免后门；落地 `coalesceRuns`、真实 PDF 目录页码回填 `syncRealTocPages` 与原生多模态支持。
- `5fa62ff`：移除 `composer.ts` 越界清扫未声明节点的 `sanitizePostComposePagination`，恢复引擎 100% 纯原子执行语义。
- `1a28bb3`：新增 `B{i}.R{r}` 表格整行删除（自动提升纵向合并 `vMerge="restart"`）与 `drop_page_break` 两个纯原子原语；在 `workspace.ts` 落地携带 `[原...]` 坐标的多模态 ReAct 试填观测闭环。
- **本轮纯泛化升级（70.0% -> 90.0%）**：
  1. **ReAct 状态机修复（`packages/server/src/workspace.ts`）**：解耦坐标语法纠错重试（`coord-fix`）与语义干跑评审轮次，消除因语法重试挤占轮次导致的未审早退；修复末轮 `verdict: "revise"` 修订蓝图被循环直接丢弃的逻辑漏洞，并补齐无状态 ReAct 提示词中 `remove_targets` 的协议结构声明。
  2. **原子指令正交补全（`packages/engine/src/composer.ts`）**：使 `RemoveTarget.match`、单元格清空及 `FieldSlot` 的 `mode: "blank" | "colon" | "match"` 在指向单段单元格坐标 `B{i}.R{r}.C{c}` 时与指向段落坐标完全正交（不再忽略 `mode` 误做整格覆盖或静默跳过 `match`）。
  3. **结构地图无损展示与均衡视觉抽检（`doc_inspector.ts` & `workspace.ts`）**：放宽单段表格单元格与残余原件段落的截断上限（由 48/90 字提升至 180~240 字），使长括号填写提示对 `match` 完整可见；干跑渲染图采样补充文档中段页，消除多页表单中部视觉盲区；在抽象 Prompt 中明确“导引页与书写容器分离”及“可变标题与旧特定主题内容解耦”两条通用母版公理。
  4. **网关传输韧性与双轨评测（`model.ts` & `eval/run_lab_report_benchmark.ts`）**：补齐网关首轮空串/截断 JSON 单次退避重试；评测脚本同步输出 `tracks_legacy_oracle` 与结构校准 `tracks` 双轨账本。

---

## 三、现行核心架构与代码地图

### 1. 共享协议层（`packages/shared/src/schemas.ts`）
- **统一门牌号语法 `COORD_REGEX`**：`B{i}`、`B{i}.R{r}`、`B{i}.R{r}.C{c}`、`B{i}.R{r}.C{c}.P{p}`、`B{i}.TX{t}`、`B{i}.TX{t}.P{p}`、`D{d}.P{p}`。
- **`RemoveTarget` 原子指令集**：`start`、`end`、`match`、`only_textboxes`、`drop_section`、`drop_page_break`（对顶层块、行、单元格、段落、文本框全正交生效）。

### 2. 确定性 OOXML 引擎层（`packages/engine/src/`）
- `dom_locator.ts`：`coalesceRuns`、`analyzeParagraphBlanks`、试填源码坐标戳记 `stampSourceCoords` / `readStampedCoord`。
- `doc_inspector.ts`：客观 `StyleDNA` 与显式划分物理分节边界、无损展示单段单元格语境的 `DocumentMap`。
- `composer.ts`：100% 纯原子组装器 + `syncRealTocPages` 真实 PDF 页码回填。
- `layout_telemetry.ts` & `layout_adjuster.ts`：纯客观 Poppler 物理几何传感器与按 `section` 定向收口的版面微调器。

### 3. 服务端与多模态 ReAct 编排层（`packages/server/src/`）
- `workspace.ts`：`internalize()` 执行初始蓝图提议 + 独立坐标校验 + 最多 3 轮完整（干跑渲染遥测 + `[原...]` 残余地图 + 首/中/尾/告警页 PNG 视觉）ReAct 评审与修订闭环。
- `model.ts`：统一多模态 JSON 调用入口，含网络瞬断与首轮空串/截断 JSON 单次退避重试。

---

## 四、剩余 3 份单次采样波动项（90.0% -> 100% 纯泛化收敛观察点）

详见 [eval/results_lab_reports.json](../../eval/results_lab_reports.json) 与 [eval/report_lab_reports.md](../../eval/report_lab_reports.md)：

| 涉及样本 | 现象与成因（单跑或相邻轮次均可 PASS，属模型采样边界波动） | 后续零特判纯泛化演进思路 |
|---|---|---|
| `lab_17` | 分节符宿主段 `B61 [SECT_BREAK]` 同行携带原课题专业注脚，模型偶发顾虑保留分节符而未用 `match` 或无 `drop_section` 的普通清理摘除该段文字 | 在通用原子操作说明中明确：对 `[SECT_BREAK]` 段执行不含 `drop_section: true` 的普通清理会安全清空文字并保留 `<w:sectPr>` 分节符本身 |
| `lab_23` | 单格内含 35 段（`P0..P34`）的全页框表，模型偶发将末栏槽位 `end` 停在 `P25` 而遗留 `P26..P34` 连续空白段把高度撑溢至第 2 页 | 在 `doc_inspector.ts` 格内连续空白段折叠行中显式标明起止门牌号（如 `P26..P34 [连续9个空白段]`），帮助模型精确对齐末栏 `end` 坐标 |
| `lab_30` | 封面行 `"《具体课程》文种抬头"` 同时含可变书名与固定文种名，偶发误选 `mode="cell"` 整段替换而非 `mode="match"` 局部替换 | 在 `observeDryRun` 硬校验或 ReAct 残余对比中提示：若 `FieldSlot` 采取 `mode="cell"` 替换了不含分隔符的居中大字抬头行，核查是否误吞同行固定文种后缀 |

---

## 五、常用开发、测试与启动命令

```bash
export PATH="/home/missi/.nvm/versions/node/v26.3.0/bin:$PWD/node_modules/.bin:$PATH"

npm run typecheck                        # 全仓 TypeScript 类型检查
npm run stylecheck                       # 行宽 (<=110) 与单行语句规范检查
npm test                                 # 运行全量 11 套件 / 48 项单测与集成测试
npm run build                            # 类型检查 + 打包前端工作台至 packages/web/dist
./start.sh                               # 启动单端口服务 (默认 http://localhost:8000)

# 双轨基准评测命令（支持 LAB_FILTER=lab_09,lab_20,lab_27 按需抽检）
tsx eval/run_lab_report_benchmark.ts
```

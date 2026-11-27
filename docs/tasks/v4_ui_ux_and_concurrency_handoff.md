# DocForge V4 交接文档 · UI/UX 全链路重构与高并发评测（Handoff for Next Agent）

- **当前分支**：`feat/v4-ui-ux-overhaul`（自 `feature/v4-docforge` `dca6859` 切出并已完成提交）
- **基线状态**：`npm run typecheck` 通过、`npm run stylecheck` 通过、前端生产打包 `packages/web/dist` 已同步、架构红线词表扫描 **0 行**、全量测试 **11 个测试套件 / 48 项用例 100% 通过**。
- **核心基准与高并发提速成绩（本机 16 核 + 真实多模态 `deepseek-v4.1-flash` 盲测）**：
  - **全仓单测与集成测试（`BENCH_CONCURRENCY=16 npm test`）**：总耗时由 `34.4s` 降至 **`22.0s`**（其中 30 文档解剖套件 `v3_real_corpus_30.test.ts` 由 `32.8s` 降至 **`10.9s`**，提速 **3.0×**）。
  - **跨领域 30 文档 + 6 长文真实模型零拷贝评测（`npx tsx eval/run_benchmark_v3.ts -c 16`）**：全程 **`58.7s`** 跑完，30 份母版留壳率 **100%**，6 篇长文零拷贝逐字保真率 **100%**。
  - **30 所高校真实实验报告三轨盲测（`npx tsx eval/run_lab_report_benchmark.ts -c 16`）**：总耗时由原 15~20 分钟降至 **`282.0s`（4.7 分钟）**，端到端严格通过率：
    - **结构校准真值口径（`Calibrated Oracle`）**：**`28 / 30 (93.3%)`**（较上轮 `27 / 30 (90.0%)` 再提升 **+3.3%**；`Legacy Oracle` 口径为 **`25 / 30 (83.3%)`**，较上轮 `23 / 30` 净增 2 例）。

---

## 一、绝对不可逾越的架构红线（继承自 V4 核心准则）

接手开发的 Agent **严禁触碰以下任何一条红线**：

1. **严禁往确定性引擎、服务端或共享契约塞入任何领域词表或特判规则**
   - 提交前必须执行以下扫描且输出保持 **0 行**：
     ```bash
     grep -rnE "大学|实验|关文聪|天大|深大|电子科大|桂林|宜春|目的|器材|原理|步骤|总结|批阅|签字" packages/engine/src packages/server/src packages/shared/src
     ```
2. **严禁在生产 Prompt 中泄露任何评测样本信息**；`composer.ts` 保持 **100% 纯原子执行**（只执行 `Blueprint` 与 `ComposeInput` 显式声明的槽位与移除目标，不暗自清扫未声明节点）；坐标与区间校验失败必须抛错触发重试或 ReAct，严禁静默吞错兜底。
3. **遵守仓库 [AGENTS.md](../../AGENTS.md) 规范**
   - 避免推测性防御编程；`README.md` 仅维护外部路由/环境变量契约，严禁写入任务日志；源码非 `class=` 行宽 `<= 110` 字符且禁止同行多语句（必跑 `npm run stylecheck`）。

---

## 二、本轮完成的核心重构清单（去历史兼容包袱）

### 1. 文档任务级 SQLite 多会话与统一 `/api/*` 契约
- **统一存储（废除 `data/sessions.json` 与 `session_tree.ts`）**：
  - 在 [packages/engine/src/store.ts](../../packages/engine/src/store.ts) 新增 `sessions` 表；
  - 新增 [packages/server/src/session_store.ts](../../packages/server/src/session_store.ts)，每个会话作为独立「文档任务」持久化 `{ template_id, draft_text, slot_values, generate_cover, generate_toc, normalize_punct, current_doc, preview_stale, auto_named, events, messages }`。
- **消除全局 `active_template` 脑裂**：
  - 每个会话自持 `template_id`（新建默认 `builtin-standard-doc`）；删除任意自定义模板时，关联会话自动回退至 `builtin-standard-doc`；
  - 新建会话默认名 `未命名文档`，填入标题槽位、输入正文首行或完成首轮生成后自动提取干净标题命名（手动改名后锁定 `auto_named = false`）。
- **就地换格式闭环**：顶栏切换格式仅更新当前会话 `template_id`，非空会话自动向时间线追加 `已将当前文档排版格式切换为「…」` 分隔事件，并将已有产物标为 `preview_stale = true`。
- **统一 `/api/*` 路由表**（移除了旧 `/api/v3/*` 转发及顶层 `/chat`、`/sessions`）：
  - 会话：`GET /api/sessions`、`POST /api/sessions`、`PUT /api/sessions/active`、`POST /api/sessions/:id/fork`、`PATCH /api/sessions/:id`、`DELETE /api/sessions/:id`
  - 对话流：`POST /api/chat`（SSE，按 `session_id` 加锁、监听 `res.on("close")` 断连即调 `agent.abort()`）
  - 一站式套版流：`POST /api/documents/compose-stream`（SSE，服务端单次串联入库、规划、组装、遥测、可选视觉核查与会话落库）
  - 模板管理与异步导入流：`POST /api/templates/import`（SSE，先推样张再推多轮自检进度，断连即停并清理临时目录）、`GET /api/templates/:id/samples`（懒生成并缓存真实样张 PNG）、`PATCH /api/templates/:id`（改名/改分类）、`DELETE /api/templates/:id`

### 2. 双栏底稿双向同步与未填槽位默认干净擦除
- **「原文字套格式」⇄「让 AI 写 / 改」共享同一底稿**：
  - 正向：[packages/server/src/context_hook.ts](../../packages/server/src/context_hook.ts) 将当前会话的 `doc_id`、已填 `slot_values`、补件开关及 `draft_text` 全文追加至置顶能力卡下方，AI 可直接对左侧手写草稿执行润色、填槽或版面收口；
  - 反向：[packages/server/src/chat.ts](../../packages/server/src/chat.ts) 在 `compose_document` 完成后通过 `workspace_sync` 事件将 `body_texts` 与 `resolved_slots` 实时回填至会话草稿与槽位。
- **未填槽位默认擦除防脏数据残留**：
  - [packages/engine/src/composer.ts](../../packages/engine/src/composer.ts) 对 `blueprint.fields` 中未提供或留空的槽位默认执行干净擦除（带 `<w:u>` 下划线的 `match` 与 `blank` 自动填充等视觉宽度空格保留手写下划线；`cell` 清空旧文本保留格属性；`colon` 保留冒号前缀清除旧值）；
  - [packages/engine/src/template_store.ts](../../packages/engine/src/template_store.ts) 自动提取原件槽位示例值填入 `field.sample`，前端渲染 `例：XXX（留空则置空）`。

### 3. 新版前端工作台与多视口响应式（`packages/web/src/`）
- **[TopBar.vue](../../packages/web/src/components/TopBar.vue)**：文档会话下拉器（行内改名 + 行内二次确认删除）+ 独立 `+ 新建文档` 按钮 + 格式选择器（分类筛选 + 行内改名/改分类/复制/二次确认删除）+ 右上角非阻塞后台导入进度胶囊；调试顶栏去除 `Pino 日志` 伪按钮外观。
- **[ContentColumn.vue](../../packages/web/src/components/ContentColumn.vue) & [ChatThread.vue](../../packages/web/src/components/ChatThread.vue)**：冷启动空白正文框（附「填入示例正文」按钮）；清洗规范化槽位标签；普通模式下展示紧凑白话阶段进度卡 + 实时秒表读秒（完成后自动折叠为单行摘要）+ `■ 停止` 即时中断按钮；按模板特征动态展示「自动生成独立封面 / 自动生成目录」开关。
- **[PreviewStage.vue](../../packages/web/src/components/PreviewStage.vue)**：移除失真截断的伪红头 HTML 模拟页，未生成成品前展示真实模板原件样张并严格禁用 `下载 Word`；将容器宽度级缩放（`88% / 100% / 112%`，无 CSS `scale` 裁切）与「版面微调 ▾」下拉菜单下放至普通模式；顶栏与聊天卡片统一按 `<提取的文档标题>.docx` 导出。
- **[ImportModal.vue](../../packages/web/src/components/ImportModal.vue)**：移除硬编码默认名称，选入文件后自动去后缀填名并智能匹配分类，支持点击遮罩与 `Esc` 关闭，提交即转入顶栏后台胶囊导入。
- **[App.vue](../../packages/web/src/App.vue) & [DebugSidebar.vue](../../packages/web/src/components/DebugSidebar.vue)**：`< 1024px` 自动切换为顶部分段「编辑与 AI 对话 / 预览」单视图（消除三重嵌套滚动条）；`< 1280px` 调试栏自动收起为左侧浮层抽屉，消除工具栏挤压与按钮裁切。

### 4. 可配置高并发测试与评测管线
- 新增 [vitest.config.ts](../../vitest.config.ts)，并升级 [v3_real_corpus_30.test.ts](../../packages/engine/tests/v3_real_corpus_30.test.ts)、[v3_composer_zerocopy.test.ts](../../packages/engine/tests/v3_composer_zerocopy.test.ts)、[eval/run_benchmark_v3.ts](../../eval/run_benchmark_v3.ts)、[eval/run_lab_report_benchmark.ts](../../eval/run_lab_report_benchmark.ts)：
  - 支持 `-c N` / `--concurrency=N` 与环境变量 `BENCH_CONCURRENCY`（默认 `min(12, CPU核数 - 2)`）；
  - 用无阻塞抢占式工作池 `runPool` 替代原有的 `for (i += 3)` 分批栅栏，并使规则基线轨道与大模型网络 I/O 并行重叠执行。

---

## 三、待办与后续演进建议（Next Steps）

1. **实机预览与合并主干**：
   - 启动 `./start.sh` 在浏览器走查确认视觉细节，验收无误后可将 `feat/v4-ui-ux-overhaul` 合并回 `feature/v4-docforge`。
2. **实验报告盲测剩余 2 例采样波动观察点（`28/30` -> `30/30`）**：
   - `lab_09`（`F0_PIPELINE_EXCEPTION`）：高并发下网关偶发返回空串（`模型未返回合法 JSON: `），可在 [packages/server/src/model.ts](../../packages/server/src/model.ts) 将空响应纳入与 `429/502/503` 相同的退避重试分支（例如从 2 次尝试放宽至带指数抖动的 3 次尝试）。
   - `lab_22`（`F6_BLANK_PAGE_LEFT_BEHIND`）：单次采样中模型漏删尾部空白段导致多出空白页，可通过 `LAB_FILTER=lab_22 npx tsx eval/run_lab_report_benchmark.ts` 定向复现观察残余地图表达。
3. **会话关联产物磁盘回收（可选）**：
   - 当前删除会话仅移除 SQLite `sessions` 记录，后续可在 `DELETE /api/sessions/:id` 时顺带回收不再被任何会话引用的 `data/documents/<doc_id>` 本地渲染目录。

---

## 四、常用命令速查

```bash
latest_node="$(ls -1 "$HOME/.nvm/versions/node" | tail -n 1)"
export PATH="$HOME/.nvm/versions/node/$latest_node/bin:$PWD/node_modules/.bin:$PATH"

npm run typecheck                                # 全仓 TypeScript 严格类型检查
npm run stylecheck                               # 行宽 (<=110) 与单语句规范检查
BENCH_CONCURRENCY=16 npm test                    # 16 并发运行全量 11 套件 / 48 项测试 (~22s)
npm run build                                    # 类型检查 + 打包前端至 packages/web/dist
./start.sh                                       # 启动单进程工作台 (默认 http://localhost:8000)

# 高并发基准评测（支持 -c N 或 BENCH_CONCURRENCY=N，以及 LAB_FILTER=lab_09,lab_22 单点抽检）
npx tsx eval/run_benchmark_v3.ts -c 16
npx tsx eval/run_lab_report_benchmark.ts -c 16
```

# DocForge 交接文档 · 方案 A：多对话会话侧边栏与上下文隔离（Handoff for Next Agent）

- **当前基线**：`main` 分支 `697405f`（已发布 `v4.0.2`，远程 `origin` 为 `git@github.com:GrassskyR/docx-forge.git`，工作区干净，无遗留特性分支）
- **交互原型参考**：[design/session_sidebar_prototype.html](../../design/session_sidebar_prototype.html)（用户已确认认可该方案 A 交互原型）
- **建议分支**：从 `main` 拉取 `feat/session-sidebar-ux` 进行开发

---

## 一、背景与要解决的核心痛点

底层 SQLite（[packages/server/src/session_store.ts](../../packages/server/src/session_store.ts)）已实现多会话隔离（`draft_text`、`slot_values`、`template_id`、`current_doc`、`events`、`messages` 均按 session 独立存储），但现有前端交互存在 4 个明显心智错位，导致用户换文章/换模板时频繁遇到“AI 还在延续上一篇对话”的上下文污染问题：

1. **会话列表过于隐蔽**：目前仅藏在顶栏左上角「`文档 ▾`」下拉菜单中（[TopBar.vue](../../packages/web/src/components/TopBar.vue)），在「让 AI 写 / 改」面板内看不到会话列表，也没有「清空对话 / 新对话」入口。
2. **导入新草稿或清空正文不隔离上下文**：[workbench.ts](../../packages/web/src/workbench.ts) 的 `uploadDraft()` / 清空正文仅覆盖 `draft_text`，原会话里的 `messages`、旧 `slot_values` 与 `current_doc` 全部残留。
3. **切换模板时旧对话继续留在上下文**：`selectFormat()` 仅修改当前会话 `template_id` 并插入一条系统事件，用户准备用新模板写新文章时极易被旧对话污染。
4. **缺少“保留底稿、仅重置 AI 记忆”的能力**：同一篇文章聊偏或上下文过长时，无法只清空聊天记录而保留左侧底稿与模板。

---

## 二、方案 A 详细需求与技术拆解

### 1. 后端小改动（`packages/server`）

- **新增清空当前会话聊天记忆接口**：`POST /api/sessions/:id/clear-chat`（或在 `PATCH /api/sessions/:id` 支持 `clear_chat: true`）
  - 位置：[packages/server/src/session_store.ts](../../packages/server/src/session_store.ts)、[packages/server/src/chat.ts](../../packages/server/src/chat.ts)
  - 行为：
    - 若目标会话正在生成中（`busySessions.has(targetId)`），返回 `409`（提示先停止生成）；
    - 将该会话的 `messages = []`、`events = []` 落库，**保留** `draft_text`、`slot_values`、`template_id`、`current_doc` 等底稿与模板状态；
    - 返回标准 `SessionsPayload`（`{ sessions, active_session_id, active }`）。
- **单测覆盖**：在 [packages/server/tests/api_v2_v3.test.ts](../../packages/server/tests/api_v2_v3.test.ts) 中补充 `clear-chat` 契约测试（验证清空 `messages`/`events` 且 `draft_text`/`slot_values`/`template_id` 完好保留，且 `message_count` 归零）。

### 2. 新增左侧可折叠「会话列表侧边栏」（`packages/web`）

- **新增组件**：`packages/web/src/components/SessionSidebar.vue`
  - **布局与响应式**：
    - 桌面宽屏（`>= 1024px`）：最左侧常驻宽度 `248px`，支持平滑折叠/展开（折叠状态持久化到 `localStorage`，如 `docforge.sidebarOpen`）；
    - 窄屏（`< 1024px`）：点击顶栏侧边栏图标以左侧抽屉浮层弹出，选中会话或点遮罩自动收起；
    - 注意协调调试模式的 [DebugSidebar.vue](../../packages/web/src/components/DebugSidebar.vue) 宽度，避免中栏被过度挤压（例如中栏在三栏全展开时弹性收缩，保证预览区有足够视野）。
  - **功能清单**：
    - 顶部醒目 **`+ 新建对话 / 文档`** 主按钮（展示 `Ctrl+N` / `⌘N` 提示，点击按当前模板新建空白隔离会话）；
    - 顶部轻量搜索框：按会话标题或绑定模板名称实时过滤；
    - 分组列表：按 `updated_at` 分为「**今天**」与「**更早**」（倒序排列）；
    - 每条会话卡片展示：标题、绑定模板标签（`template_name`）、对话条数（`message_count`）、状态摘要（`N页成品` / `含草稿` / `空白`）与相对更新时间；
    - 悬停行内操作：**改名**（Enter 保存 / Esc 取消）与**二次确认删除**；
    - 底部轻量状态栏：`共 N 个独立会话 · 独立上下文隔离`。
- **顶栏精简（[TopBar.vue](../../packages/web/src/components/TopBar.vue)）**：
  - 最左侧新增**侧边栏折叠/展开按钮**（取代原隐藏较深的会话下拉入口，保留当前激活会话标题与页数/草稿状态徽章）；
  - 保留格式模板选择器、后台导入进度胶囊、设置按钮、调试开关。

### 3. 聊天区内置快捷操作（[ContentColumn.vue](../../packages/web/src/components/ContentColumn.vue)）

- 在「让 AI 写 / 改」模式下，顶部模式切换栏右侧直接展示两个高频按钮：
  - **`清空对话`**（`disabled` 当无消息或正在生成中）：调用 `clear-chat`，保留左侧草稿、槽位与模板，仅清空 AI 对话历史并 toast 反馈；
  - **`+ 新对话`**：直接创建一条全新空白隔离会话；
  - 在 `让 AI 写 / 改` Tab 上展示当前会话对话数小徽章（如 `4`），直观提示上下文是否为空。

### 4. 防上下文污染护栏（3 个核心触发点）

1. **导入新草稿防污染弹窗**（触发点：`ContentColumn` 的「导入草稿 .docx/.txt」按钮 + `App.vue` 拖拽 `.docx/.txt/.md` 作为草稿）：
   - 当当前会话**已有聊天记录或已有草稿/成品**时，弹出轻量确认弹窗（风格对齐 [ImportModal.vue](../../packages/web/src/components/ImportModal.vue) 与原型中的 `#importGuardModal`），提供 3 个选项：
     - **新建独立对话导入（推荐）**：先 `createSession({ template_id: curTemplateId })`，再写入新草稿正文，原文章与旧对话完好保留在左侧会话栏；
     - **覆盖当前草稿，并清空旧对话**：调用 `clear-chat` + 更新 `draft_text`（同时重置旧 `slot_values` 为空）；
     - **仅覆盖正文，保留当前对话**：适合导入同一篇文章的修订版继续聊。
   - 若当前会话本身为空（无草稿且无对话），则**不弹窗**直接导入，避免多余打扰。
2. **已有对话时切换模板的防污染提示条**：
   - 在 [workbench.ts](../../packages/web/src/workbench.ts) 的 `selectFormat()` 中，若切换模板时当前会话已有聊天记录，标记 `state.templateSwitchGuard = true`（切换会话、清空对话或发新消息时自动重置）；
   - 在聊天区顶部渲染温和提示条：`已切换为「XXX」· 若准备写新文章，建议开新对话避免旧上下文干扰`，提供 **`用新模板开新对话`**、**`仅清空旧对话`**、**`✕`** 三个按钮。
3. **清空正文时的联动提示条**：
   - 用户点击「清空正文」且当前会话存在聊天记录时，展示单行提示：`已清空正文，当前会话仍有历史 AI 对话，是否同步清空上下文？` 附带 **`同步清空对话`** / **`保留`** 按钮。

### 5. 快捷键支持（Web + 桌面一致）
- 在 `App.vue` 监听 `Cmd/Ctrl + N` 快捷键（非输入冲突场景下）新建空白会话（桌面端原生菜单 [packages/desktop/src/menu.ts](../../packages/desktop/src/menu.ts) 已绑定 `CmdOrCtrl+N` 派发 `new-session`，注意避免重复触发两次新建！）。

---

## 三、关键文件清单与架构约束

### 预计涉及文件
- 后端：
  - [packages/server/src/session_store.ts](../../packages/server/src/session_store.ts)（新增 `clearChat(id)` 方法）
  - [packages/server/src/chat.ts](../../packages/server/src/chat.ts)（新增 `POST /api/sessions/:id/clear-chat` 路由）
  - [packages/server/tests/api_v2_v3.test.ts](../../packages/server/tests/api_v2_v3.test.ts)（补充 `clear-chat` 测试）
- 前端：
  - `packages/web/src/components/SessionSidebar.vue`（新增）
  - [packages/web/src/api.ts](../../packages/web/src/api.ts)（新增 `clearSessionChat(id)`）
  - [packages/web/src/workbench.ts](../../packages/web/src/workbench.ts)（新增 `clearCurrentChat`、带防污染模式的 `importDraftWithMode`、`sidebarOpen` 持久化、`templateSwitchGuard` / `draftClearedNotice` 状态）
  - [packages/web/src/components/TopBar.vue](../../packages/web/src/components/TopBar.vue)（改为侧边栏折叠按钮 + 当前标题展示）
  - [packages/web/src/components/ContentColumn.vue](../../packages/web/src/components/ContentColumn.vue)（聊天区「清空对话 / + 新对话」、防污染横幅、清空正文提示）
  - [packages/web/src/App.vue](../../packages/web/src/App.vue)（接入 `SessionSidebar`、导入草稿防污染弹窗、响应式抽屉）

### 必须遵守的仓库规则
1. **严格遵守 [AGENTS.md](../../AGENTS.md)**：
   - 不写冗余防御代码与过度抽象；
   - **不修改 `README.md`**（除非新增了外部 API 路由需要更新路由列表，且严禁写任务日志）；
   - 保持 `packages/*/src/**/*.{ts,vue}` 非 `class=` 行宽 `<= 110` 字符、单行单语句（必须过 `npm run stylecheck`）。
2. **禁止破坏 `package-lock.json` 的多平台可选依赖**：
   - 本任务不需要新增任何 npm 依赖，不要随意在 Linux/WSL 下跑 `npm install` 破坏 Windows 的 `@tailwindcss/oxide-win32-*` 与 `@koromix/koffi-win32-*` 锁项。
3. **Electron 桌面端构建门禁**：
   - `packages/desktop/scripts/bundle.ts` 含 Tailwind CSS 门禁检查，必须执行 `npm run build:desktop` 确认前端 CSS 与桌面 bundle 均正常通过。

---

## 四、验收清单（完成后必跑）

```bash
latest_node="$(ls -1 "$HOME/.nvm/versions/node" | tail -n 1)"
export PATH="$HOME/.nvm/versions/node/$latest_node/bin:$PATH"

npm run typecheck         # TypeScript 严格类型检查
npm run stylecheck        # 行宽 <=110 与单语句检查
npm run build:desktop     # 构建 packages/web/dist + packages/desktop/dist（含 Tailwind CSS 门禁）
npm test                  # 全量测试（13+ 套件全部通过）
```

### 手工/行为验收点
1. 桌面宽屏默认展示左侧会话侧边栏，点击顶栏按钮可折叠/展开并记住状态；
2. 点击不同会话时，左侧草稿、槽位、对话历史、绑定模板、右侧预览完整切换且互不串台；
3. 在「让 AI 写 / 改」点「清空对话」，仅清空聊天记录并保留左侧草稿与模板；点「+ 新对话」立即新建干净空白会话；
4. 在非空会话中导入新草稿（按钮或拖拽）时弹出防污染三选一弹窗，选「新建独立对话导入」后旧会话保留、新会话干净载入；
5. 在有对话记录的会话中切换模板，聊天区出现温和防污染提示条，可一键开新对话或清旧对话；
6. 桌面端 `Cmd/Ctrl+N` 不会触发两次新建会话。

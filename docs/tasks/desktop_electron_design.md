# DocForge 跨平台桌面端（Electron）设计方案

- **分支**：`feat/desktop-electron`（基于 `main` `2fc0019`）
- **目标平台**：Windows / macOS / Linux（本分支完成完整代码实现、Linux 本地运行与打包实测，以及 Win/macOS/Linux 三端 `electron-builder` 配置与 GitHub Actions CI 工作流）
- **核心原则**：
  - 100% 保持现有 Web 模式（`./start.sh` / `npm start`）及全部 50 个单测/集成测试零回归；
  - 复用现有纯 TypeScript 单进程架构与 Node 22 内置 `node:sqlite`，不引入原生 C++ SQLite 编译依赖；
  - 遵循 `AGENTS.md`，避免过度抽象与防御性冗余代码。

---

## 1. 总体架构

```mermaid
flowchart TB
    subgraph Electron["packages/desktop (Electron 35+ · 内置 Node 22+)"]
        Main["主进程 Main\n· 单实例锁 & 窗口状态持久化\n· 菜单 / 原生对话框 / shell.openPath\n· safeStorage 密钥加解密\n· 启动本地 HTTP 服务 (127.0.0.1:0)"]
        Preload["Preload Bridge\nwindow.docforgeDesktop\n(contextIsolation: true)"]
        Renderer["BrowserWindow\n加载 packages/web (Vue 3 SPA)"]
        Main <-->|IPC| Preload
        Preload <--> Renderer
    end

    subgraph Core["复用现有 Monorepo 核心包"]
        Server["packages/server\ncreateApp({ dataDir, distDir, authToken, secretCipher })"]
        Engine["packages/engine\nOOXML 引擎 + 统一工具链 toolchain.ts"]
        DB[("userData/docforge.db\nSQLite (settings / templates / sessions)")]
        Server --> Engine
        Server --> DB
    end

    Main -->|进程内直接调用| Server
    Renderer -->|HTTP / SSE (自动注入本地 Token)| Server

    subgraph Renderers["跨平台文档渲染与 PDF 工具链"]
        WinCOM["Windows: Word / WPS COM\n(PowerShell 串行队列)"]
        LO["macOS / Linux / Win 兜底:\nLibreOffice (soffice)"]
        Poppler["Poppler (pdftoppm / pdftohtml / pdfinfo)\n打包时内置于 extraResources/poppler"]
    end

    Engine --> WinCOM
    Engine --> LO
    Engine --> Poppler
```

### 1.1 为什么主进程直跑 `createApp()` + 本地随机端口
- **零重写成本**：Electron 35+ 内置 Node 22.14+，原生包含 `node:sqlite`（[store.ts](../../packages/engine/src/store.ts) 无需修改），主进程可直接运行打包后的服务端代码。
- **SSE 与静态流无损兼容**：前端 [api.ts](../../packages/web/src/api.ts) 的 `/api/chat`、`/api/templates/import`、`/api/documents/compose-stream` 三个 SSE 流及 `/files/*` 高清预览图完全无需改写为 IPC。
- **端口冲突与本地安全**：
  - 绑定 `127.0.0.1:0`，由操作系统动态分配空闲端口；
  - 主进程启动时生成 32 字节随机 `authToken`，通过 `session.defaultSession.webRequest.onBeforeSendHeaders` 自动给发往 `http://127.0.0.1:<port>/*` 的所有请求（包括 `fetch`、SSE、`<img>`、下载）注入 `X-DocForge-Token` 请求头；
  - `createApp()` 在传入 `authToken` 时校验该请求头，防止本机其他浏览器页面越权访问本地文档或触发 LLM 调用。Web 模式（`./start.sh`）不传 `authToken`，行为与现有一致。

---

## 2. 跨平台工具链设计（Word/WPS COM + LibreOffice + 内置 Poppler）

当前代码在 6 处分散调用外部命令：
- `soffice`：[doc_converter.ts](../../packages/engine/src/doc_converter.ts)
- `pdftoppm` / `pdftohtml` / `pdfinfo`：[doc_converter.ts](../../packages/engine/src/doc_converter.ts)、[layout_telemetry.ts](../../packages/engine/src/layout_telemetry.ts)、[composer.ts](../../packages/engine/src/composer.ts)、[template_store.ts](../../packages/engine/src/template_store.ts)、[visual_auditor.ts](../../packages/engine/src/visual_auditor.ts)、[workspace.ts](../../packages/server/src/workspace.ts)
- `PATH.split(":")`：[app.ts](../../packages/server/src/app.ts)（POSIX 写死，Windows 下失效）

### 2.1 新增统一工具链模块 `packages/engine/src/toolchain.ts`

将所有外部二进制解析、探测与执行收敛到单模块：

1. **二进制解析顺序**：
   - **Poppler（`pdftoppm`、`pdftohtml`、`pdfinfo`）**：
     1. 显式配置目录（`toolchainConfig.popplerDir` / `DOCFORGE_POPPLER_DIR`，Electron 打包后自动设为 `join(process.resourcesPath, "poppler", "bin")`）；
     2. 系统 `PATH`（按 `path.delimiter` 切分，Windows 自动匹配 `.exe`）；
     3. 常见平台路径兜底（macOS `/opt/homebrew/bin`、`/usr/local/bin`）。
   - **LibreOffice（`soffice`）**：
     1. 用户设置页指定的自定义路径（`toolchainConfig.sofficePath`）；
     2. 便携同级目录探测（仅便携模式：`<portableDir>/LibreOffice/program/soffice.exe`、`<portableDir>/LibreOfficePortable/App/libreoffice/program/soffice.exe`）；
     3. 系统 `PATH`；
     4. 常见安装路径自动扫描：
        - Windows：`C:\Program Files\LibreOffice\program\soffice.exe`、`C:\Program Files (x86)\LibreOffice\program\soffice.exe`
        - macOS：`/Applications/LibreOffice.app/Contents/MacOS/soffice`
        - Linux：`/usr/bin/soffice`、`/usr/local/bin/soffice`、`/snap/bin/libreoffice`
2. **统一子进程选项**：
   - 所有 `execFile` 封装统一附带 `windowsHide: true`，消除 Windows 下调用命令行工具时的黑框闪烁；
   - `pdfinfo` 等继续注入 `LC_ALL: "C"`；
   - 打包后的 macOS/Linux 内置 Poppler 若带有私有动态库目录（`poppler/lib`），执行时自动在子进程环境追加 `LD_LIBRARY_PATH`（Linux）或依赖 `@loader_path` RPATH（macOS）。

### 2.2 Windows 优先 Word / WPS COM 渲染后端

在 `packages/engine/src/doc_converter.ts` 中将 `convert(source, directory, extension)` 拆分为可切换的后端策略，支持用户配置 `renderer: "auto" | "word_com" | "wps_com" | "libreoffice"`：

- **`auto` 模式优先级**：
  - **Windows**：探测 Word COM (`Word.Application`) → 探测 WPS COM (`KWPS.Application` / `Kwps.Application`) → 探测 LibreOffice (`soffice`)；
  - **macOS / Linux**：直接使用 LibreOffice (`soffice`)。
- **Windows COM 实现要点（通过 PowerShell 脚本 + `execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", ...], { windowsHide: true })`）**：
  - **串行互斥队列**：同一时间仅允许一个 Word/WPS COM 转换任务执行（用轻量 Promise 队列串行化），避免并发启动多个 `WINWORD.EXE` 相互锁死模板或弹窗；
  - **静默与防残留**：
    - 设置 `Visible = $false`、`DisplayAlerts = 0`、`ReadOnly = $true`、`ConfirmConversions = $false`；
    - `.doc -> .docx` 调用 `SaveAs2($outPath, 16)`（`wdFormatXMLDocument`）；
    - `.docx -> .pdf` 调用 `ExportAsFixedFormat($outPath, 17)`（`wdExportFormatPDF`）；
    - `try / finally` 中强制关闭文档（`Close($false)`）、退出实例（`Quit()`）并释放 COM 对象；
  - **自动降级**：若 `auto` 模式下 COM 转换因权限/未激活/版本差异失败，且本机存在 `soffice`，自动回退到 LibreOffice 并记录警告日志。
- **环境探测缓存**：
  - 启动及修改设置时探测一次 COM ProgID 注册表（`HKCR\Word.Application`、`HKCR\KWPS.Application`、`HKCR\Kwps.Application`），无需每次转换都起 PowerShell 探测。

### 2.3 Poppler 随包内置与获取脚本（不提交二进制进 Git）

- 新增构建准备脚本 `scripts/prepare_poppler.ts`（并将 `packages/desktop/resources/poppler/` 加入 `.gitignore`）：
  - **Windows**：从官方 `oschwartz10612/poppler-windows` Release 下载预编译 zip，仅提取 `pdftoppm.exe`、`pdftohtml.exe`、`pdfinfo.exe` 及同目录必需 `.dll` 到 `packages/desktop/resources/poppler/win/bin/`；
  - **Linux**：从当前构建环境复制 `pdftoppm`、`pdftohtml`、`pdfinfo` 及其非 glibc 核心共享库（`libpoppler*` 等，通过 `ldd` 筛选）并生成 wrapper 或用 `patchelf --set-rpath '$ORIGIN/../lib'`，输出至 `packages/desktop/resources/poppler/linux/`；
  - **macOS**：在 macOS 构建机（如 GitHub Actions `macos-latest`）从 Homebrew `poppler` 复制三个二进制与依赖 `.dylib`，并用 `install_name_tool` 修正为 `@loader_path/../lib`，输出至 `packages/desktop/resources/poppler/mac/`。
- `electron-builder` 按平台通过 `extraResources` 将对应目录打入 `resources/poppler`。
- **本地开发零负担**：未运行 `prepare_poppler.ts` 时，开发模式下自动回退到系统 `PATH` 中的 Poppler。

---

## 3. 数据目录解耦、配置中心与密钥加密

### 3.1 只读安装目录解耦

打包后的应用目录（Windows `Program Files`、macOS `.app`、Linux `AppImage`）不可写，需改造 3 处硬编码路径：

| 当前文件 | 现有写死行为 | 改造方式 |
|---|---|---|
| [packages/server/src/logger.ts](../../packages/server/src/logger.ts) | 模块加载时写死 `join(root, "data/logs")` | 提供 `initLogger(logDir)`（未调用时默认回退 `join(root, "data/logs")`），桌面端传入 `join(userData, "logs")` |
| [packages/server/src/app.ts](../../packages/server/src/app.ts) | `directory = join(root, "data")`，`dist = join(root, "packages/web/dist")` | 扩展 `createApp(options)` 支持传入 `dataDir`、`distDir`、`authToken`、`secretCipher`、`desktop` 标识（兼容旧位置参数签名，不破坏现有测试） |
| [packages/server/src/main.ts](../../packages/server/src/main.ts) | 仅读根目录 `.env` 与固定端口 `8000` | 保留 Web CLI 行为不变，同时支持 `DOCFORGE_DATA_DIR` 环境变量 |

- **桌面端数据目录（区分安装版 / 便携版 / 开发模式）**：
  - **便携模式（Portable）**：满足以下任一条件即自动启用便携数据目录 `<baseDir>/DocForge-Data`：
    1. Windows `electron-builder` 便携单文件（`portable.exe`）运行时自动注入的 `process.env.PORTABLE_EXECUTABLE_DIR`；
    2. Linux `AppImage` 同目录或解压版可执行文件同目录存在 `portable.txt` 标记文件（或已存在 `DocForge-Data/` 目录）；
    3. 显式设置环境变量 `DOCFORGE_PORTABLE=1`。
    - 在 `app.whenReady()` 与 `app.requestSingleInstanceLock()` **之前**调用 `app.setPath("userData", portableDataDir)`，使数据库 `docforge.db`、模板、日志、`window-state.json` 及单实例锁全部随身隔离（若所在目录只读不可写，自动降级回系统标准 `userData` 目录）。
  - **标准安装版**：Electron 默认 `app.getPath("userData")`（Linux `~/.config/DocForge`、macOS `~/Library/Application Support/DocForge`、Windows `%APPDATA%\DocForge`）；
  - **开发运行（`npm run dev:desktop`）**：默认使用仓库根目录 `./data`（可通过 `DOCFORGE_DATA_DIR` 覆盖），方便复用本地已有模板和 `.env`。

### 3.2 应用内设置持久化与运行时热更新

1. **新增 `packages/server/src/config_store.ts`**：
   - 复用 SQLite 已有 `settings` 表（key = `app_config`），存储结构化配置：
     ```ts
     export interface AppConfig {
       llm_base_url: string
       llm_api_key: string
       llm_model: string
       llm_supports_vision: boolean
       llm_input_usd_per_million: number | null
       llm_output_usd_per_million: number | null
       vision_base_url: string
       vision_api_key: string
       vision_model: string
       renderer_mode: "auto" | "word_com" | "wps_com" | "libreoffice"
       soffice_path: string
     }
     ```
   - **初始化优先级**：SQLite `app_config` 中已保存的非空字段 > 环境变量 / `.env` 默认值。
   - **密钥加密**：桌面端注入 `SecretCipher`（封装 Electron `safeStorage.encryptString` / `decryptString`），写入 SQLite 前对 `llm_api_key`、`vision_api_key` 加 `enc:` 前缀加密保存；Web 模式或系统未提供密钥环时保持明文兼容。
     - **便携版跨机器换机容错**：由于 `safeStorage`（Windows DPAPI / macOS Keychain）绑定当前机器用户，便携版目录拷贝到另一台电脑打开时若 `decryptString` 失败，不崩溃，直接视作未配置并提示重新填写 API Key（确保 U 盘遗失时密钥不会明文泄露）。
   - **热生效**：保存配置后立即同步更新运行时配置对象与 `toolchain` 配置：
     - 将 [documents.ts](../../packages/server/src/documents.ts) 中的 `readonly useModel` 改为动态 getter（实时判断当前是否存在有效 `llm_api_key` 与 `llm_model`）；
     - [model.ts](../../packages/server/src/model.ts)、[agent.ts](../../packages/server/src/agent.ts)、[visual_auditor.ts](../../packages/engine/src/visual_auditor.ts) 统一读取实时配置，填完 Key 立即生效无需重启。
2. **新增 HTTP 接口**：
   - `GET /api/settings`：返回脱敏后的配置（API Key 仅返回是否已配置 + 末尾 4 位掩码，不回传明文）、当前环境探测状态（`word_com` / `wps_com` / `libreoffice` / `poppler` 来源与路径、`active_renderer`、`data_dir`、`is_desktop`）；
   - `PUT /api/settings`：校验并保存配置（空字符串的 Key 字段表示“保持原密钥不变”，支持单独清空开关），立即刷新工具链探测并返回最新状态与健康信息；
   - `GET /health`：扩展返回 `renderer_ready`、`active_renderer`、`word_com`、`wps_com`、`poppler_source`、`data_dir` 等字段，同时保留原有 `libreoffice` / `pdftoppm` / `llm_configured` 字段向后兼容。

---

## 4. 桌面原生体验与前端交互改动

保持 `packages/web` 在纯浏览器与 Electron 两种环境下**同一套代码自适应运行**（通过检测 `window.docforgeDesktop` 启用原生增强能力）。

### 4.1 Preload API 契约（`window.docforgeDesktop`）

```ts
export interface DocForgeDesktopBridge {
  readonly isDesktop: true
  readonly platform: NodeJS.Platform
  saveDocxAs(docUrl: string, suggestedName: string): Promise<{ canceled: boolean; filePath?: string }>
  openDocInApp(docUrl: string, suggestedName: string): Promise<{ filePath: string }>
  revealDocInFolder(docUrl: string, suggestedName: string): Promise<{ filePath: string }>
  openDataDir(): Promise<void>
  pickExecutable(title: string): Promise<string | null>
  openExternal(url: string): Promise<void>
}
```

### 4.2 前端 UI 增强点（最小侵入）

1. **顶栏新增「设置」按钮与 `SettingsModal.vue`**（[TopBar.vue](../../packages/web/src/components/TopBar.vue)）：
   - 分两个清晰分区：
     - **模型与视觉配置**：主模型 Base URL / API Key / Model / 支持视觉开关、侧车视觉模型配置、Token 单价（可选）；
     - **文档渲染与本地环境**：实时展示各引擎状态徽章（Word COM / WPS COM / LibreOffice / Poppler）、渲染引擎优先级选择、自定义 `soffice` 路径（桌面端带「浏览…」按钮）、数据存储目录 + 「打开数据目录」按钮。
2. **环境自检与首次启动引导条**（[App.vue](../../packages/web/src/App.vue)）：
   - 启动调用 `/health` 后：
     - 若缺少任何可用渲染引擎（Win 既无 Word/WPS 也无 LibreOffice，或 macOS/Linux 无 LibreOffice）：顶部展示醒目提示条，提供「下载 LibreOffice」外链与「前往设置指定路径」按钮；
     - 若未配置大模型 API Key：顶部展示轻量提示条（不影响离线套版，但提示 AI 对话与模板智能解析需要配置 Key），一键打开设置弹窗。
3. **预览区原生导出联动**（[PreviewStage.vue](../../packages/web/src/components/PreviewStage.vue)）：
   - **Web 模式**：维持现有 `<a download>` 浏览器下载；
   - **Electron 桌面模式**：
     - 「下载 Word」改为调用 `saveDocxAs` 弹出原生「另存为」对话框，保存成功后给出轻提示并附带「打开文件 / 打开所在文件夹」快捷操作；
     - 旁边新增轻量操作按钮：**「用本机 Word/WPS 打开」**（`shell.openPath` 直接唤起系统关联的 Word/WPS 打开该 `.docx`）与**「打开所在文件夹」**（`shell.showItemInFolder`）。
4. **窗口级文件拖拽导入**：
   - 在工作台任意区域拖入 `.doc` / `.docx` 文件时，展示柔和的拖拽浮层，支持松手直接选择「作为新模板导入」或「导入为当前草稿」。
5. **桌面窗口基础体验（主进程）**：
   - **单实例锁**：`app.requestSingleInstanceLock()`，重复启动时唤醒并聚焦已有主窗口，防止多实例并发写入 `docforge.db`；
   - **窗口状态持久化**：在 `userData/window-state.json` 记住窗口宽高、坐标与最大化状态（多显示器拔出后自动校正回可见屏幕范围）；
   - **中文化原生菜单**：文件（新建文档、打开设置、打开数据目录、退出）、编辑（撤销/重做/剪切/复制/粘贴/全选）、视图（缩放、重载、开发者工具）、窗口与帮助。

---

## 5. Monorepo 结构、构建打包与 CI 设计

### 5.1 新增目录结构

```text
packages/desktop/
├── package.json                 # @docs-agent/desktop（electron, esbuild, electron-builder）
├── tsconfig.json
├── electron-builder.yml         # Win (NSIS .exe + Portable .exe + .zip), macOS (.dmg arm64+x64), Linux (.AppImage + .deb)
├── build/
│   ├── icon.svg                 # DocForge 矢量源图标
│   ├── icon.png                 # 512x512 Linux 图标
│   ├── icon.ico                 # Windows 图标（构建脚本生成）
│   └── icon.icns                # macOS 图标（构建/CI 生成）
├── src/
│   ├── main.ts                  # 主进程入口：单实例、窗口管理、本地服务启动、Token 注入、IPC
│   ├── preload.ts               # contextBridge 暴露 window.docforgeDesktop
│   ├── menu.ts                  # 中文化原生应用菜单
│   ├── window_state.ts          # 窗口尺寸/位置持久化与越界修正
│   └── secret_cipher.ts         # Electron safeStorage 封装
└── scripts/
    └── bundle.ts                # 使用 esbuild 预打包 main.mjs / preload.cjs / server.mjs

scripts/
└── prepare_poppler.ts           # 按目标平台准备 extraResources/poppler（不入 Git）

.github/workflows/
└── release-desktop.yml          # 三端矩阵自动构建（ubuntu-latest / macos-latest / windows-latest）
```

### 5.2 根目录新增 NPM Scripts（[package.json](../../package.json)）

```json
{
  "dev:desktop": "npm run dev -w @docs-agent/desktop",
  "build:desktop": "npm run build && npm run build -w @docs-agent/desktop",
  "pack:desktop": "npm run build:desktop && npm run pack -w @docs-agent/desktop",
  "dist:desktop": "npm run build:desktop && npm run dist -w @docs-agent/desktop"
}
```

### 5.3 打包产物配置（`electron-builder.yml`）
- **应用标识**：`appId: com.docforge.desktop`，`productName: DocForge`
- **Windows**：
  - `nsis`（标准安装版 `DocForge-Setup-<version>.exe`，支持自定义安装路径、创建桌面与开始菜单快捷方式、卸载清理，x64）；
  - `portable`（绿色免安装单文件 `DocForge-Portable-<version>.exe`，x64，数据自动保存在同级 `DocForge-Data/` 目录，免管理员权限、适合 U 盘/教室机房/单位电脑直接使用）；
  - `zip`（绿色免解压启动目录压缩包 `DocForge-Portable-<version>-win-x64.zip`，解压即用且启动速度比单文件自解压更快，内置 `portable.txt` 标记）。
- **macOS**：`dmg`（`arm64` + `x64`）
- **Linux**：`AppImage`（天然便携单文件，支持同目录放 `portable.txt` 启用便携数据目录）+ `deb`（x64，`category: Office`）
- **文件打包策略**：
  - `packages/desktop/dist/**`（esbuild 预打包后的主进程、Preload、后端 bundle）
  - `packages/web/dist/**`（Vite 打包后的前端静态资源）
  - `extraResources`：`resources/poppler/${os}` → `poppler`
  - 不打包源码、`eval/`、`docs/`、测试文件及 `tsx` 等开发依赖，控制基础安装包体积在 **~130–160 MB**（含内置 Poppler）。

---

## 6. 实施步骤与验收标准

### 实施阶段
1. **阶段 1 — 引擎与服务端跨平台改造**：
   - 新增 `packages/engine/src/toolchain.ts`（统一二进制解析、Windows 路径扫描、Poppler 目录优先、`windowsHide: true`）；
   - 重构 `doc_converter.ts` 加入 Windows Word/WPS COM PowerShell 串行后端 + LibreOffice 自动降级，并迁移全部 6 处外部命令调用；
   - 新增 `packages/server/src/config_store.ts`，改造 `logger.ts`、`documents.ts`、`app.ts`、`model.ts`、`agent.ts` 支持自定义目录、动态配置热更新、密钥加解密与本地 `authToken` 校验；
   - 新增工具链与配置管理单元测试，确保全量测试持续通过。
2. **阶段 2 — 前端设置中心与原生交互适配**：
   - 新增 `SettingsModal.vue`，接入 `TopBar.vue` 与 `App.vue` 启动环境体检横幅；
   - 更新 `PreviewStage.vue` 与 `workbench.ts` 支持桌面端原生「另存为」、一键「用本机 Word/WPS 打开」、「在文件夹中显示」及窗口级文件拖拽导入。
3. **阶段 3 — Electron 桌面壳与三端打包管线**：
   - 搭建 `packages/desktop`（Electron 35+、esbuild 打包脚本、主进程/Preload/菜单/窗口状态/safeStorage、应用图标）；
   - 编写 `scripts/prepare_poppler.ts`、`electron-builder.yml` 与 `.github/workflows/release-desktop.yml`。
4. **阶段 4 — 全面验证**：
   - `npm run typecheck`、`npm run stylecheck`、`npm run build`、`npm test` 全绿；
   - 在当前 Linux 环境实际执行 `prepare_poppler` + `npm run dist:desktop`，启动打包产物验证：标准模式与便携模式（`portable.txt` / `DOCFORGE_PORTABLE=1`）的数据目录隔离、单实例锁、设置持久化与热生效、模板导入、生成预览、原生导出与「打开文件/文件夹」、关闭进程无残留；
   - 验证 `./start.sh` 纯 Web 模式完全正常无回归。

### 暂不纳入本分支（留作后续迭代）
- 操作系统级 `.doc` / `.docx` 双击文件关联；
- 系统托盘常驻；
- `electron-updater` 在线自动更新与 macOS Notarization / Windows EV 代码签名证书配置；
- All-in-One 内置裁剪版 LibreOffice 离线大包。

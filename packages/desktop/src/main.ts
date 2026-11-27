import { randomBytes } from "node:crypto"
import { existsSync } from "node:fs"
import { copyFile, mkdir } from "node:fs/promises"
import type { Server } from "node:http"
import type { AddressInfo } from "node:net"
import { basename, dirname, join, relative, resolve, sep } from "node:path"
import { loadEnvFile } from "node:process"
import { fileURLToPath } from "node:url"
import { app, BrowserWindow, dialog, ipcMain, session, shell } from "electron"
import { configureToolchain } from "@docs-agent/engine"
import { createApp, initLogger, initObservability, logger } from "@docs-agent/server"
import { setupAppMenu } from "./menu.js"
import { initPortablePaths } from "./portable.js"
import { createElectronCipher } from "./secret_cipher.js"
import { loadWindowBounds, trackWindowBounds } from "./window_state.js"

const portable = initPortablePaths()

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
  process.exit(0)
}

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, "../../..")

function resolvePaths() {
  if (app.isPackaged) {
    const appPath = app.getAppPath()
    return {
      dataDir: process.env.DOCFORGE_DATA_DIR?.trim() || portable.userDataDir,
      distDir: join(appPath, "web-dist"),
      popplerDir: join(process.resourcesPath, "poppler"),
      iconPath: join(process.resourcesPath, "icon.png"),
    }
  }
  const envFile = join(repoRoot, ".env")
  if (existsSync(envFile)) loadEnvFile(envFile)
  return {
    dataDir:
      process.env.DOCFORGE_DATA_DIR?.trim() ||
      (portable.isPortable ? portable.userDataDir : join(repoRoot, "data")),
    distDir: join(repoRoot, "packages/web/dist"),
    popplerDir: process.env.DOCFORGE_POPPLER_DIR?.trim() || "",
    iconPath: join(repoRoot, "packages/desktop/build/icon.png"),
  }
}

function sanitizeFileName(raw: string): string {
  const clean = basename(raw || "document.docx")
    .replace(/[\\/:*?"<>|\r\n]+/g, " ")
    .trim()
  if (!clean) return "document.docx"
  return clean.toLowerCase().endsWith(".docx") ? clean : clean + ".docx"
}

function resolveDocSource(dataDir: string, docUrl: string): string {
  const pathname = decodeURIComponent(new URL(docUrl, "http://127.0.0.1").pathname)
  if (!pathname.startsWith("/files/")) {
    throw new Error("无效的文档路径")
  }
  const full = resolve(join(dataDir, pathname.slice(7)))
  const rel = relative(resolve(dataDir), full)
  if (rel === ".." || rel.startsWith(".." + sep)) {
    throw new Error("文件路径超出数据目录")
  }
  if (!existsSync(full)) {
    throw new Error("生成的文档文件不存在，请重新生成")
  }
  return full
}

async function prepareNamedExport(dataDir: string, docUrl: string, suggestedName: string) {
  const source = resolveDocSource(dataDir, docUrl)
  const exportsDir = join(dataDir, "exports")
  await mkdir(exportsDir, { recursive: true })
  const target = join(exportsDir, sanitizeFileName(suggestedName))
  await copyFile(source, target)
  return target
}

let mainWin: BrowserWindow | null = null
let httpServer: Server | null = null

app.on("second-instance", () => {
  if (!mainWin) return
  if (mainWin.isMinimized()) mainWin.restore()
  mainWin.focus()
})

app.on("before-quit", () => {
  if (httpServer) {
    httpServer.close()
    httpServer = null
  }
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})

async function boot() {
  const paths = resolvePaths()
  initLogger(join(paths.dataDir, "logs"))
  initObservability()

  configureToolchain({
    ...(paths.popplerDir && existsSync(paths.popplerDir) ? { popplerDir: paths.popplerDir } : {}),
    ...(portable.portableDir ? { portableDir: portable.portableDir } : {}),
  })

  const authToken = randomBytes(32).toString("hex")
  const server = createApp({
    dataDir: paths.dataDir,
    distDir: paths.distDir,
    authToken,
    secretCipher: createElectronCipher(),
    isDesktop: true,
    isPortable: portable.isPortable,
  })
  httpServer = server

  await new Promise<void>((res, rej) => {
    server.once("error", rej)
    server.listen(0, "127.0.0.1", () => res())
  })
  const port = (server.address() as AddressInfo).port
  const baseUrl = `http://127.0.0.1:${port}`
  logger.info(
    { url: baseUrl, dataDir: paths.dataDir, portable: portable.isPortable },
    "DocForge 桌面端本地服务已启动",
  )

  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: [baseUrl + "/*"] },
    (details, callback) => {
      details.requestHeaders["X-DocForge-Token"] = authToken
      callback({ requestHeaders: details.requestHeaders })
    },
  )

  registerIpc(paths.dataDir)
  createWindow(baseUrl, paths.dataDir, paths.iconPath)

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(baseUrl, paths.dataDir, paths.iconPath)
    }
  })
}

function registerIpc(dataDir: string) {
  ipcMain.handle("docforge:save-docx-as", async (_ev, docUrl: string, suggestedName: string) => {
    const source = resolveDocSource(dataDir, docUrl)
    const defaultPath = join(app.getPath("documents"), sanitizeFileName(suggestedName))
    const picked = await dialog.showSaveDialog({
      title: "保存 Word 文档",
      defaultPath,
      filters: [{ name: "Word 文档", extensions: ["docx"] }],
    })
    if (picked.canceled || !picked.filePath) return { canceled: true }
    await copyFile(source, picked.filePath)
    return { canceled: false, filePath: picked.filePath }
  })

  ipcMain.handle("docforge:open-doc-in-app", async (_ev, docUrl: string, suggestedName: string) => {
    const target = await prepareNamedExport(dataDir, docUrl, suggestedName)
    const errMsg = await shell.openPath(target)
    if (errMsg) throw new Error(errMsg)
    return { filePath: target }
  })

  ipcMain.handle(
    "docforge:reveal-doc-in-folder",
    async (_ev, docUrl: string, suggestedName: string) => {
      const target = await prepareNamedExport(dataDir, docUrl, suggestedName)
      shell.showItemInFolder(target)
      return { filePath: target }
    },
  )

  ipcMain.handle("docforge:open-data-dir", async () => {
    await shell.openPath(dataDir)
  })

  ipcMain.handle("docforge:pick-executable", async (_ev, title: string) => {
    const filters =
      process.platform === "win32"
        ? [{ name: "可执行文件", extensions: ["exe", "com"] }]
        : undefined
    const res = await dialog.showOpenDialog({
      title: title || "选择可执行文件",
      properties: ["openFile"],
      filters,
    })
    return res.canceled ? null : (res.filePaths[0] ?? null)
  })

  ipcMain.handle("docforge:open-external", async (_ev, url: string) => {
    const parsed = new URL(url)
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("仅允许打开 HTTP/HTTPS 链接")
    }
    await shell.openExternal(parsed.toString())
  })
}

function createWindow(baseUrl: string, dataDir: string, iconPath: string) {
  const bounds = loadWindowBounds(portable.userDataDir)
  const win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    minWidth: 960,
    minHeight: 640,
    title: "DocForge · Word 模板套版与 AI 排版工作台",
    icon: existsSync(iconPath) ? iconPath : undefined,
    show: false,
    backgroundColor: "#F8FAFC",
    webPreferences: {
      preload: join(here, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [
        portable.isPortable ? "--docforge-portable=1" : "--docforge-portable=0",
      ],
    },
  })
  mainWin = win
  if (bounds.maximized) win.maximize()
  trackWindowBounds(win, portable.userDataDir)
  setupAppMenu(win, dataDir)

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: "deny" }
  })

  win.once("ready-to-show", () => {
    win.show()
  })
  win.on("closed", () => {
    if (mainWin === win) mainWin = null
  })
  void win.loadURL(baseUrl)
}

app.whenReady().then(boot).catch((err) => {
  logger.error({ err }, "DocForge 桌面端启动失败")
  dialog.showErrorBox(
    "DocForge 启动失败",
    err instanceof Error ? err.message : String(err),
  )
  app.quit()
})

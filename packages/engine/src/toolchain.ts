import { execFile } from "node:child_process"
import { accessSync, constants, existsSync } from "node:fs"
import { homedir } from "node:os"
import { delimiter, dirname, join, resolve } from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export type RendererMode = "auto" | "word_com" | "wps_com" | "libreoffice"
export type ActiveRenderer = "word_com" | "wps_com" | "libreoffice" | "none"
export type PopplerTool = "pdftoppm" | "pdftohtml" | "pdfinfo"

export interface ToolchainConfig {
  rendererMode: RendererMode
  sofficePath: string
  popplerDir: string
  portableDir: string
}

export interface ToolchainStatus {
  platform: NodeJS.Platform
  renderer_mode: RendererMode
  active_renderer: ActiveRenderer
  renderer_ready: boolean
  word_com: boolean
  wps_com: boolean
  libreoffice: boolean
  libreoffice_path: string | null
  pdftoppm: boolean
  pdftohtml: boolean
  pdfinfo: boolean
  poppler_source: "bundled" | "system" | "missing"
  poppler_dir: string | null
}

const config: ToolchainConfig = {
  rendererMode: "auto",
  sofficePath: process.env.DOCFORGE_SOFFICE_PATH?.trim() || "",
  popplerDir: process.env.DOCFORGE_POPPLER_DIR?.trim() || "",
  portableDir: process.env.DOCFORGE_PORTABLE_DIR?.trim() || "",
}

let cachedStatus: ToolchainStatus | null = null

export function configureToolchain(patch: Partial<ToolchainConfig>) {
  if (patch.rendererMode !== undefined) config.rendererMode = patch.rendererMode
  if (patch.sofficePath !== undefined) config.sofficePath = patch.sofficePath.trim()
  if (patch.popplerDir !== undefined) config.popplerDir = patch.popplerDir.trim()
  if (patch.portableDir !== undefined) config.portableDir = patch.portableDir.trim()
  cachedStatus = null
}

export function getToolchainConfig(): ToolchainConfig {
  return { ...config }
}

function isExecutable(file: string): boolean {
  if (!file || !existsSync(file)) return false
  if (process.platform === "win32") return true
  try {
    accessSync(file, constants.X_OK)
    return true
  } catch {
    return false
  }
}

function winNames(name: string): string[] {
  if (process.platform !== "win32") return [name]
  if (/\.(exe|com|bat|cmd)$/i.test(name)) return [name]
  return [name + ".exe", name + ".com", name]
}

function findInDirs(dirs: string[], name: string): string | null {
  const candidates = winNames(name)
  for (const dir of dirs) {
    if (!dir) continue
    for (const file of candidates) {
      const full = join(dir, file)
      if (isExecutable(full)) return full
    }
  }
  return null
}

function pathDirs(): string[] {
  return (process.env.PATH ?? "").split(delimiter).filter(Boolean)
}

export function resolvePopplerBin(
  name: PopplerTool,
): { path: string; source: "bundled" | "system" } | null {
  const bundledRoot = config.popplerDir || process.env.DOCFORGE_POPPLER_DIR?.trim() || ""
  if (bundledRoot) {
    const found = findInDirs([join(bundledRoot, "bin"), bundledRoot], name)
    if (found) return { path: found, source: "bundled" }
  }
  const extra =
    process.platform === "darwin"
      ? ["/opt/homebrew/bin", "/usr/local/bin"]
      : process.platform === "linux"
        ? ["/usr/bin", "/usr/local/bin"]
        : []
  const sys = findInDirs([...pathDirs(), ...extra], name)
  if (sys) return { path: sys, source: "system" }
  return null
}

export function resolveSofficeBin(): string | null {
  const custom = config.sofficePath || process.env.DOCFORGE_SOFFICE_PATH?.trim() || ""
  if (custom) {
    if (isExecutable(custom)) return resolve(custom)
    const inDir = findInDirs([custom, join(custom, "program")], "soffice")
    if (inDir) return inDir
  }

  const portable = config.portableDir || process.env.DOCFORGE_PORTABLE_DIR?.trim() || ""
  if (portable) {
    const portableDirs = [
      join(portable, "LibreOffice", "program"),
      join(portable, "LibreOfficePortable", "App", "libreoffice", "program"),
    ]
    const found = findInDirs(portableDirs, "soffice")
    if (found) return found
  }

  const fromPath = findInDirs(pathDirs(), "soffice")
  if (fromPath) return fromPath

  if (process.platform === "win32") {
    const pf = process.env.ProgramFiles || "C:\\Program Files"
    const pf86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)"
    return findInDirs(
      [join(pf, "LibreOffice", "program"), join(pf86, "LibreOffice", "program")],
      "soffice",
    )
  }
  if (process.platform === "darwin") {
    const macCandidates = [
      "/Applications/LibreOffice.app/Contents/MacOS/soffice",
      join(homedir(), "Applications/LibreOffice.app/Contents/MacOS/soffice"),
    ]
    return macCandidates.find((p) => isExecutable(p)) ?? null
  }
  const linuxCandidates = [
    "/usr/bin/soffice",
    "/usr/local/bin/soffice",
    "/snap/bin/libreoffice",
  ]
  return linuxCandidates.find((p) => isExecutable(p)) ?? null
}

async function hasWindowsProgId(progId: string): Promise<boolean> {
  if (process.platform !== "win32") return false
  try {
    await execFileAsync("reg.exe", ["query", "HKCR\\" + progId], {
      timeout: 5_000,
      windowsHide: true,
    })
    return true
  } catch {
    return false
  }
}

export async function resolveWpsProgId(): Promise<string | null> {
  if (process.platform !== "win32") return null
  for (const progId of ["KWPS.Application", "Kwps.Application"]) {
    if (await hasWindowsProgId(progId)) return progId
  }
  return null
}

function pickActiveRenderer(
  mode: RendererMode,
  word: boolean,
  wps: boolean,
  lo: boolean,
): ActiveRenderer {
  if (mode === "word_com") return word ? "word_com" : "none"
  if (mode === "wps_com") return wps ? "wps_com" : "none"
  if (mode === "libreoffice") return lo ? "libreoffice" : "none"
  if (process.platform === "win32") {
    if (word) return "word_com"
    if (wps) return "wps_com"
    if (lo) return "libreoffice"
    return "none"
  }
  return lo ? "libreoffice" : "none"
}

export async function probeToolchain(force = false): Promise<ToolchainStatus> {
  if (cachedStatus && !force) return cachedStatus
  const [wordCom, wpsProgId] =
    process.platform === "win32"
      ? await Promise.all([hasWindowsProgId("Word.Application"), resolveWpsProgId()])
      : [false, null]
  const wpsCom = Boolean(wpsProgId)
  const sofficePath = resolveSofficeBin()
  const libreoffice = Boolean(sofficePath)
  const pdftoppm = resolvePopplerBin("pdftoppm")
  const pdftohtml = resolvePopplerBin("pdftohtml")
  const pdfinfo = resolvePopplerBin("pdfinfo")
  const active = pickActiveRenderer(config.rendererMode, wordCom, wpsCom, libreoffice)
  const popplerReady = Boolean(pdftoppm && pdftohtml && pdfinfo)
  const popplerSource = !popplerReady
    ? "missing"
    : pdftoppm?.source === "bundled"
      ? "bundled"
      : "system"

  cachedStatus = {
    platform: process.platform,
    renderer_mode: config.rendererMode,
    active_renderer: active,
    renderer_ready: active !== "none",
    word_com: wordCom,
    wps_com: wpsCom,
    libreoffice,
    libreoffice_path: sofficePath,
    pdftoppm: Boolean(pdftoppm),
    pdftohtml: Boolean(pdftohtml),
    pdfinfo: Boolean(pdfinfo),
    poppler_source: popplerSource,
    poppler_dir: pdftoppm ? dirname(pdftoppm.path) : null,
  }
  return cachedStatus
}

export async function execPoppler(
  name: PopplerTool,
  args: string[],
  opts?: { timeout?: number; maxBuffer?: number; env?: NodeJS.ProcessEnv },
) {
  const resolved = resolvePopplerBin(name)
  if (!resolved) {
    throw new Error(`未找到 Poppler 工具 ${name}，请安装 poppler-utils 或检查内置工具目录`)
  }
  const env: NodeJS.ProcessEnv = { ...process.env, ...opts?.env }
  if (name === "pdfinfo" && !env.LC_ALL) env.LC_ALL = "C"
  if (resolved.source === "bundled" && process.platform === "linux") {
    const libDir = resolve(dirname(resolved.path), "..", "lib")
    if (existsSync(libDir)) {
      env.LD_LIBRARY_PATH = env.LD_LIBRARY_PATH
        ? `${libDir}:${env.LD_LIBRARY_PATH}`
        : libDir
    }
  }
  return execFileAsync(resolved.path, args, {
    timeout: opts?.timeout ?? 90_000,
    maxBuffer: opts?.maxBuffer,
    env,
    windowsHide: true,
  })
}

export async function execSoffice(args: string[], opts?: { timeout?: number }) {
  const bin = resolveSofficeBin()
  if (!bin) {
    throw new Error("未找到 LibreOffice (soffice)，请在设置中指定路径或安装 LibreOffice")
  }
  return execFileAsync(bin, args, {
    timeout: opts?.timeout ?? 90_000,
    windowsHide: true,
  })
}

import { accessSync, constants, existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { app } from "electron"

export interface PortableContext {
  isPortable: boolean
  portableDir: string | null
  userDataDir: string
}

function isDirWritable(dir: string): boolean {
  try {
    mkdirSync(dir, { recursive: true })
    accessSync(dir, constants.W_OK)
    const probe = join(dir, ".write-probe-" + process.pid)
    writeFileSync(probe, "")
    unlinkSync(probe)
    return true
  } catch {
    return false
  }
}

function detectPortableBaseDir(): string | null {
  const winPortable = process.env.PORTABLE_EXECUTABLE_DIR?.trim()
  if (winPortable) return winPortable

  const appImage = process.env.APPIMAGE?.trim()
  if (appImage) {
    const dir = dirname(appImage)
    if (
      existsSync(join(dir, "portable.txt")) ||
      existsSync(join(dir, "DocForge-Data")) ||
      process.env.DOCFORGE_PORTABLE === "1"
    ) {
      return dir
    }
  }

  if (app.isPackaged) {
    const exeDir = dirname(process.execPath)
    if (
      existsSync(join(exeDir, "portable.txt")) ||
      existsSync(join(exeDir, "DocForge-Data")) ||
      process.env.DOCFORGE_PORTABLE === "1"
    ) {
      return exeDir
    }
  } else if (process.env.DOCFORGE_PORTABLE === "1") {
    return process.cwd()
  }

  return null
}

/**
 * Must be called BEFORE app.requestSingleInstanceLock() and app.whenReady()
 * so portable instances use an isolated userData directory & single-instance lock.
 */
export function initPortablePaths(): PortableContext {
  const baseDir = detectPortableBaseDir()
  if (baseDir) {
    const candidate = join(baseDir, "DocForge-Data")
    if (isDirWritable(candidate)) {
      app.setPath("userData", candidate)
      return { isPortable: true, portableDir: baseDir, userDataDir: candidate }
    }
  }
  return {
    isPortable: false,
    portableDir: null,
    userDataDir: app.getPath("userData"),
  }
}

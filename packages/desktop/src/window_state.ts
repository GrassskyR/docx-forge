import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { screen, type BrowserWindow } from "electron"

interface SavedBounds {
  x?: number
  y?: number
  width: number
  height: number
  maximized: boolean
}

const DEFAULT_BOUNDS: SavedBounds = {
  width: 1400,
  height: 900,
  maximized: false,
}

function isVisibleOnAnyDisplay(b: SavedBounds): boolean {
  if (b.x === undefined || b.y === undefined) return false
  return screen.getAllDisplays().some((d) => {
    const a = d.workArea
    const overlapX = Math.min(b.x! + b.width, a.x + a.width) - Math.max(b.x!, a.x)
    const overlapY = Math.min(b.y! + b.height, a.y + a.height) - Math.max(b.y!, a.y)
    return overlapX >= 120 && overlapY >= 80
  })
}

export function loadWindowBounds(userDataDir: string): SavedBounds {
  const file = join(userDataDir, "window-state.json")
  if (!existsSync(file)) return { ...DEFAULT_BOUNDS }
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<SavedBounds>
    const bounds: SavedBounds = {
      x: typeof parsed.x === "number" ? parsed.x : undefined,
      y: typeof parsed.y === "number" ? parsed.y : undefined,
      width:
        typeof parsed.width === "number" && parsed.width >= 840
          ? parsed.width
          : DEFAULT_BOUNDS.width,
      height:
        typeof parsed.height === "number" && parsed.height >= 600
          ? parsed.height
          : DEFAULT_BOUNDS.height,
      maximized: Boolean(parsed.maximized),
    }
    if (!isVisibleOnAnyDisplay(bounds)) {
      delete bounds.x
      delete bounds.y
    }
    return bounds
  } catch {
    return { ...DEFAULT_BOUNDS }
  }
}

export function trackWindowBounds(win: BrowserWindow, userDataDir: string) {
  const file = join(userDataDir, "window-state.json")
  let timer: ReturnType<typeof setTimeout> | undefined

  const save = () => {
    if (win.isDestroyed()) return
    const maximized = win.isMaximized()
    const rect = maximized ? win.getNormalBounds() : win.getBounds()
    const payload: SavedBounds = {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      maximized,
    }
    try {
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, JSON.stringify(payload, null, 2))
    } catch {
      // Non-fatal persistence failure
    }
  }

  const schedule = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(save, 300)
  }

  win.on("resize", schedule)
  win.on("move", schedule)
  win.on("maximize", schedule)
  win.on("unmaximize", schedule)
  win.on("close", save)
}

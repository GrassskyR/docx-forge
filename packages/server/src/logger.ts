import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import pino, { type Logger } from "pino"
import pretty from "pino-pretty"

function defaultLogDir() {
  if (process.env.DOCFORGE_LOG_DIR?.trim()) return process.env.DOCFORGE_LOG_DIR.trim()
  if (process.env.DOCFORGE_DATA_DIR?.trim()) {
    return join(process.env.DOCFORGE_DATA_DIR.trim(), "logs")
  }
  const root = fileURLToPath(new URL("../../../", import.meta.url))
  return join(root, "data/logs")
}

function buildLogger(logDir: string): Logger {
  const isTest = Boolean(process.env.VITEST)
  const streams: pino.StreamEntry[] = [
    {
      level: isTest ? "error" : "info",
      stream: pretty({
        colorize: true,
        translateTime: "SYS:HH:MM:ss.l",
        ignore: "pid,hostname",
      }),
    },
  ]
  try {
    mkdirSync(logDir, { recursive: true })
    streams.push({
      level: "info",
      stream: pino.destination({
        dest: join(logDir, "server.log"),
        mkdir: true,
        sync: false,
      }),
    })
  } catch {
    // Fallback to console-only logging if directory is read-only before initLogger()
  }
  return pino({ level: process.env.LOG_LEVEL || "info" }, pino.multistream(streams))
}

let activeLogger: Logger | null = null

export function initLogger(logDir: string) {
  activeLogger = buildLogger(logDir)
}

function getLogger(): Logger {
  if (!activeLogger) activeLogger = buildLogger(defaultLogDir())
  return activeLogger
}

export const logger: Logger = new Proxy({} as Logger, {
  get(_target, prop) {
    const inst = getLogger()
    const val = Reflect.get(inst, prop, inst)
    return typeof val === "function" ? val.bind(inst) : val
  },
})

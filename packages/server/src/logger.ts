import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import pino from "pino"
import pretty from "pino-pretty"

const root = fileURLToPath(new URL("../../../", import.meta.url))
const logDir = join(root, "data/logs")
mkdirSync(logDir, { recursive: true })

const isTest = Boolean(process.env.VITEST)
const consoleStream = pretty({
  colorize: true,
  translateTime: "SYS:HH:MM:ss.l",
  ignore: "pid,hostname",
})
const fileStream = pino.destination({
  dest: join(logDir, "server.log"),
  mkdir: true,
  sync: false,
})

export const logger = pino(
  { level: process.env.LOG_LEVEL || "info" },
  pino.multistream([
    { level: isTest ? "error" : "info", stream: consoleStream },
    { level: "info", stream: fileStream },
  ]),
)

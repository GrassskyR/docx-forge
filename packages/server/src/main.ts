import { existsSync } from "node:fs"
import { join } from "node:path"
import { loadEnvFile } from "node:process"
import { createApp, root } from "./app.js"
import { initLogger, logger } from "./logger.js"
import { initObservability } from "./observability.js"

const env = join(root, ".env")
if (existsSync(env)) loadEnvFile(env)
const dataDir = process.env.DOCFORGE_DATA_DIR?.trim() || join(root, "data")
initLogger(join(dataDir, "logs"))
initObservability()
const port = Number(process.env.PORT || process.env.ENGINE_PORT || 8000)
createApp({ dataDir }).listen(port, "127.0.0.1", () => {
  logger.info({ url: "http://127.0.0.1:" + port }, "DocForge 单进程服务已启动")
})

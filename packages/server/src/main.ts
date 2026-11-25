import { existsSync } from "node:fs"
import { join } from "node:path"
import { loadEnvFile } from "node:process"
import { createApp, root } from "./app.js"

const env = join(root, ".env")
if (existsSync(env)) loadEnvFile(env)
const port = Number(process.env.PORT || process.env.ENGINE_PORT || 8000)
createApp().listen(port, "127.0.0.1", () => console.log("DocForge http://127.0.0.1:" + port))

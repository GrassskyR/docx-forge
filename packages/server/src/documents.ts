import { join, relative, resolve, sep } from "node:path"
import { realpath } from "node:fs/promises"
import { Store } from "@docs-agent/engine"
import { Billing } from "./billing.js"
import { ConfigStore, type SecretCipher } from "./config_store.js"

export class HttpError extends Error {
  constructor(
    public status: number,
    public detail: unknown,
  ) {
    super(typeof detail === "string" ? detail : JSON.stringify(detail))
  }
}

export async function dataFile(root: string, path: string) {
  const check = (base: string, file: string) => {
    const part = relative(base, file)
    if (part === ".." || part.startsWith(".." + sep)) {
      throw new HttpError(403, "文件不在数据目录")
    }
    return file
  }
  const target = check(resolve(root), resolve(path))
  const [realRoot, realTarget] = await Promise.all([realpath(resolve(root)), realpath(target)])
  return check(realRoot, realTarget)
}

export class Documents {
  readonly bill = new Billing()
  readonly store: Store
  readonly config: ConfigStore
  private readonly modelOverride?: boolean

  constructor(
    readonly directory: string,
    useModel?: boolean,
    opts?: { secretCipher?: SecretCipher; syncToolchain?: boolean },
  ) {
    this.store = new Store(join(directory, "docforge.db"))
    this.config = new ConfigStore(this.store, opts?.secretCipher, opts?.syncToolchain ?? true)
    this.modelOverride = useModel
  }

  get useModel(): boolean {
    if (this.modelOverride === false) return false
    const cfg = this.config.current()
    return Boolean(cfg.llm_api_key)
  }
}

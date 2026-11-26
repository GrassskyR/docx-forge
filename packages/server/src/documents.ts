import { join, relative, resolve, sep } from "node:path"
import { realpath } from "node:fs/promises"
import { Store } from "@docs-agent/engine"
import { Billing } from "./billing.js"

export class HttpError extends Error {
  constructor(
    public status: number,
    public detail: unknown,
  ) {
    super(typeof detail === "string" ? detail : JSON.stringify(detail))
  }
}

export async function dataFile(root: string, path: string) {
  const inside = (file: string) => {
    const part = relative(resolve(root), file)
    if (part === ".." || part.startsWith(".." + sep)) {
      throw new HttpError(403, "文件不在数据目录")
    }
    return file
  }
  return inside(await realpath(inside(resolve(path))))
}

export class Documents {
  readonly bill = new Billing()
  readonly store: Store

  constructor(
    readonly directory: string,
    readonly useModel = Boolean(process.env.LLM_API_KEY),
  ) {
    this.store = new Store(join(directory, "docforge.db"))
  }
}

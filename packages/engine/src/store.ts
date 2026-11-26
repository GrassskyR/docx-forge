import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { DatabaseSync } from "node:sqlite"

export class Store {
  readonly db: DatabaseSync

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true })
    this.db = new DatabaseSync(path)
    this.db.exec("CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL)")
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS template_assets(id TEXT PRIMARY KEY,payload TEXT NOT NULL)",
    )
  }
}

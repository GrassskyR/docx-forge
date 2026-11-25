import { randomUUID } from "node:crypto"
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { FormatProfile } from "@docs-agent/shared"
import { Assert } from "typebox/value"
import { nationalProfile } from "./defaults.js"

export function merge(
  base: Record<string, unknown>, patch: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries([...Object.entries(base), ...Object.entries(patch).map(([key, value]) => {
    const previous = base[key]
    if (previous && typeof previous === "object" && value && typeof value === "object") {
      return [key, merge(previous as Record<string, unknown>, value as Record<string, unknown>)]
    }
    return [key, value]
  })])
}

export class Store {
  readonly db: DatabaseSync

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true })
    this.db = new DatabaseSync(path)
    this.db.exec("CREATE TABLE IF NOT EXISTS profiles(id TEXT PRIMARY KEY,payload TEXT NOT NULL)")
    this.db.exec("CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL)")
    const profile = nationalProfile()
    this.db.prepare("INSERT OR IGNORE INTO profiles VALUES(?,?)").run(profile.id, JSON.stringify(profile))
    this.db.prepare("INSERT OR IGNORE INTO settings VALUES('active',?)").run(profile.id)
  }

  get activeId() {
    const row = this.db.prepare("SELECT value FROM settings WHERE key='active'").get()!
    return String(row.value)
  }

  get(id: string): FormatProfile {
    const row = this.db.prepare("SELECT payload FROM profiles WHERE id=?").get(id)
    if (!row) throw new Error("预设不存在")
    return JSON.parse(String(row.payload))
  }

  list(): FormatProfile[] {
    return this.db.prepare("SELECT payload FROM profiles ORDER BY rowid").all()
      .map(row => JSON.parse(String(row.payload)))
  }

  save(profile: FormatProfile) {
    Assert(FormatProfile, profile)
    this.db.prepare("INSERT OR REPLACE INTO profiles VALUES(?,?)").run(profile.id, JSON.stringify(profile))
    return profile
  }

  setActive(id: string) {
    this.get(id)
    this.db.prepare("UPDATE settings SET value=? WHERE key='active'").run(id)
  }

  fork(id: string, name: string, patch: Record<string, unknown>) {
    const profile = {
      ...merge(this.get(id), patch),
      id: randomUUID(), name, parent_id: id, source_type: "inherited",
    }
    Assert(FormatProfile, profile)
    return this.save(profile)
  }

  delete(id: string) {
    if ([this.activeId, nationalProfile().id].includes(id)) throw new Error("不能删除当前或内置预设")
    this.get(id)
    this.db.prepare("DELETE FROM profiles WHERE id=?").run(id)
  }
}

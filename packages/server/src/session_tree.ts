import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs"
import { dirname } from "node:path"
import { randomUUID } from "node:crypto"
import type { AgentMessage } from "@mariozechner/pi-agent-core"
export interface SessionNode {
  id: string
  parent_id: string | null
  name: string
  profile_id: string | null
  messages: AgentMessage[]
}
export class SessionTree {
  nodes: Record<string, SessionNode>
  current: string
  constructor(private path: string) {
    try {
      const d = JSON.parse(readFileSync(path, "utf8"))
      this.nodes = d.nodes
      this.current = d.current
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e
      this.nodes = {
        root: { id: "root", parent_id: null, name: "初始版本", profile_id: null, messages: [] },
      }
      this.current = "root"
      this.save()
    }
  }
  get node() {
    return this.nodes[this.current]
  }
  save() {
    mkdirSync(dirname(this.path), { recursive: true })
    writeFileSync(this.path + ".tmp", JSON.stringify({ nodes: this.nodes, current: this.current }))
    renameSync(this.path + ".tmp", this.path)
  }
  checkpoint(messages: AgentMessage[], profile_id: string) {
    this.node.messages = structuredClone(messages)
    this.node.profile_id = profile_id
    this.save()
  }
  fork(name: string, profile_id?: string) {
    const id = randomUUID()
    this.nodes[id] = {
      ...structuredClone(this.node),
      id,
      parent_id: this.current,
      name,
      profile_id: profile_id || this.node.profile_id,
    }
    this.current = id
    this.save()
    return this.node
  }
  switch(id: string) {
    if (!this.nodes[id]) throw Error("分支不存在")
    this.current = id
    this.save()
    return this.node
  }
}

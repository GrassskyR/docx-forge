import { readFile } from "node:fs/promises"
const types = ["notice", "request", "minutes", "letter"] as const
export async function loadSkill(type: string) {
  if (!types.includes(type as (typeof types)[number])) throw Error("未知文种")
  return readFile(new URL(`../skills/${type}.md`, import.meta.url), "utf8")
}

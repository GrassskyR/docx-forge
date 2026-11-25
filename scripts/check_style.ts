import { globSync, readFileSync } from "node:fs"

const errors: string[] = []
const sources = globSync(["packages/*/src/**/*.{ts,vue}", "scripts/*.ts", "eval/*.ts"])
for (const path of sources) {
  const lines = readFileSync(path, "utf8").split("\n")
  let script = path.endsWith(".ts")
  for (const [index, line] of lines.entries()) {
    if (line.includes("<script")) script = true
    if (line.includes("</script>")) script = false
    if (Array.from(line).length > 110 && !/class=["']/.test(line)) {
      errors.push(path + ":" + (index + 1) + " exceeds 110 characters")
    }
    const code = line.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, "")
    if (script && /;\s*\S/.test(code) && !/\bfor\s*\(/.test(code)) {
      errors.push(path + ":" + (index + 1) + " packs statements")
    }
  }
}
for (const name of ["notice", "request", "minutes", "letter"]) {
  const path = "packages/server/skills/" + name + ".md"
  if (readFileSync(path, "utf8").trimEnd().split("\n").length < 40) errors.push(path + " < 40 lines")
}
if (errors.length) {
  console.error(errors.join("\n"))
  process.exitCode = 1
}

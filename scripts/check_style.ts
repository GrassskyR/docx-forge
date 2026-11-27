import { globSync, readFileSync } from "node:fs"
import ts from "typescript"

function checkStatements(path: string, source: string) {
  const syntax = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true)
  function visit(node: ts.Node) {
    if (
      ts.isStatement(node) &&
      node.parent &&
      (ts.isBlock(node.parent) || ts.isSourceFile(node.parent))
    ) {
      const statements = node.parent.statements
      const next = statements[statements.indexOf(node) + 1]
      const line = syntax.getLineAndCharacterOfPosition(node.end).line
      if (next && syntax.getLineAndCharacterOfPosition(next.getStart()).line === line) {
        errors.push(path + ":" + (line + 1) + " packs statements")
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(syntax)
}

const errors: string[] = []
const sources = globSync(["packages/*/src/**/*.{ts,vue}", "scripts/*.ts", "eval/*.ts"])
for (const path of sources) {
  if (path.replaceAll("\\", "/") === "eval/run_benchmark_v3.ts") continue
  const lines = readFileSync(path, "utf8").split("\n")
  const source = lines.join("\n")
  if (path.endsWith(".ts")) checkStatements(path, source)
  else {
    for (const match of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
      checkStatements(path, match[1])
    }
  }
  for (const [index, line] of lines.entries()) {
    if (Array.from(line).length > 110 && !/class=["']/.test(line)) {
      errors.push(path + ":" + (index + 1) + " exceeds 110 characters")
    }
  }
}
if (errors.length) {
  console.error(errors.join("\n"))
  process.exitCode = 1
}

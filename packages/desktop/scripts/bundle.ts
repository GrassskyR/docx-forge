import { mkdirSync, rmSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"

const here = dirname(fileURLToPath(import.meta.url))
const pkgDir = resolve(here, "..")
const distDir = join(pkgDir, "dist")

rmSync(distDir, { recursive: true, force: true })
mkdirSync(distDir, { recursive: true })

const esmBanner = [
  "import { createRequire as __dfCreateRequire } from 'node:module';",
  "const require = __dfCreateRequire(import.meta.url);",
].join("\n")

await Promise.all([
  build({
    entryPoints: [join(pkgDir, "src/main.ts")],
    outfile: join(distDir, "main.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    external: ["electron"],
    minify: true,
    sourcemap: false,
    banner: { js: esmBanner },
  }),
  build({
    entryPoints: [join(pkgDir, "src/preload.ts")],
    outfile: join(distDir, "preload.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    external: ["electron"],
    minify: true,
    sourcemap: false,
  }),
])

console.log("Bundled @docs-agent/desktop ->", distDir)

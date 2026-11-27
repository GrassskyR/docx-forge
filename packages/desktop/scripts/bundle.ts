import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"

const here = dirname(fileURLToPath(import.meta.url))
const pkgDir = resolve(here, "..")
const repoRoot = resolve(pkgDir, "../..")
const distDir = join(pkgDir, "dist")

function verifyWebCssBundle() {
  const assetsDir = join(repoRoot, "packages/web/dist/assets")
  if (!existsSync(assetsDir)) return
  const cssFiles = readdirSync(assetsDir).filter((f) => f.endsWith(".css"))
  if (!cssFiles.length) {
    throw new Error("packages/web/dist/assets 中未找到 CSS 样式产物")
  }
  const combined = cssFiles.map((f) => readFileSync(join(assetsDir, f), "utf8")).join("\n")
  if (!combined.includes(".flex") || !combined.includes(".w-4")) {
    throw new Error(
      "前端 CSS 产物缺失 Tailwind 工具类（请检查 @tailwindcss/oxide 原生平台依赖是否完整安装）",
    )
  }
}

function stageWindowsKoffiAddon() {
  const req = createRequire(import.meta.url)
  const outRoot = join(pkgDir, "resources/koffi")
  rmSync(outRoot, { recursive: true, force: true })
  let staged = 0
  for (const arch of ["x64", "arm64"]) {
    const spec = `@koromix/koffi-win32-${arch}/win32_${arch}/koffi.node`
    try {
      const src = req.resolve(spec)
      const dstDir = join(outRoot, `win32_${arch}`)
      mkdirSync(dstDir, { recursive: true })
      copyFileSync(src, join(dstDir, "koffi.node"))
      staged++
    } catch {
      // Optional dependency only present on matching OS unless installed with --force
    }
  }
  if (process.platform === "win32" && staged === 0) {
    throw new Error("未找到 Windows koffi.node 预编译模块，无法打包原生 COM 支持")
  }
}

verifyWebCssBundle()
stageWindowsKoffiAddon()

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

import { execFileSync } from "node:child_process"
import { chmodSync, copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { unzipSync } from "fflate"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const TOOLS = ["pdftoppm", "pdftohtml", "pdfinfo"] as const

type TargetOs = "linux" | "win" | "mac"

function parseTargetOs(): TargetOs {
  const arg = process.argv.find((a) => a.startsWith("--platform="))?.split("=")[1]
  if (arg === "linux" || arg === "win" || arg === "mac") return arg
  if (process.platform === "win32") return "win"
  if (process.platform === "darwin") return "mac"
  return "linux"
}

const LINUX_SKIP_PREFIXES = [
  "linux-vdso",
  "ld-linux",
  "libc.so",
  "libm.so",
  "libdl.so",
  "librt.so",
  "libpthread.so",
  "libresolv.so",
  "libgcc_s.so",
  "libstdc++.so",
]

function prepareLinux(destRoot: string) {
  const binDir = join(destRoot, "bin")
  const libDir = join(destRoot, "lib")
  rmSync(destRoot, { recursive: true, force: true })
  mkdirSync(binDir, { recursive: true })
  mkdirSync(libDir, { recursive: true })

  const libs = new Map<string, string>()
  for (const tool of TOOLS) {
    const src = execFileSync("which", [tool], { encoding: "utf8" }).trim()
    if (!src || !existsSync(src)) {
      throw new Error(`未在当前 Linux 环境找到 ${tool}，请先安装 poppler-utils`)
    }
    const dst = join(binDir, tool)
    copyFileSync(src, dst)
    chmodSync(dst, 0o755)
    const lddOut = execFileSync("ldd", [src], { encoding: "utf8" })
    for (const line of lddOut.split("\n")) {
      const m = /^\s*(\S+)\s+=>\s+(\/\S+)/.exec(line)
      if (!m) continue
      const [, soname, fullPath] = m
      if (LINUX_SKIP_PREFIXES.some((p) => soname.startsWith(p))) continue
      if (existsSync(fullPath)) libs.set(soname, fullPath)
    }
  }
  for (const [soname, fullPath] of libs.entries()) {
    copyFileSync(fullPath, join(libDir, soname))
  }
  console.log(`Prepared Linux Poppler: ${TOOLS.length} bins, ${libs.size} libs -> ${destRoot}`)
}

async function prepareWindows(destRoot: string) {
  const binDir = join(destRoot, "bin")
  rmSync(destRoot, { recursive: true, force: true })
  mkdirSync(binDir, { recursive: true })

  const relRes = await fetch(
    "https://api.github.com/repos/oschwartz10612/poppler-windows/releases/latest",
    { headers: { "User-Agent": "DocForge-Builder" } },
  )
  if (!relRes.ok) {
    throw new Error("获取 poppler-windows Release 列表失败: " + relRes.status)
  }
  const rel = (await relRes.json()) as {
    assets?: { name: string; browser_download_url: string }[]
  }
  const zipAsset = rel.assets?.find((a) => a.name.endsWith(".zip"))
  if (!zipAsset) throw new Error("未找到 poppler-windows zip 下载包")

  console.log("Downloading", zipAsset.name)
  const zipRes = await fetch(zipAsset.browser_download_url, {
    headers: { "User-Agent": "DocForge-Builder" },
  })
  if (!zipRes.ok) throw new Error("下载 poppler-windows 失败: " + zipRes.status)
  const bytes = new Uint8Array(await zipRes.arrayBuffer())
  const files = unzipSync(bytes)
  const wantedTools = new Set(TOOLS.map((t) => t + ".exe"))
  let copied = 0
  for (const [entryName, content] of Object.entries(files)) {
    const lower = entryName.toLowerCase()
    if (!lower.includes("/library/bin/")) continue
    const file = basename(entryName)
    if (!wantedTools.has(file.toLowerCase()) && !file.toLowerCase().endsWith(".dll")) {
      continue
    }
    writeFileSync(join(binDir, file), content)
    copied++
  }
  for (const tool of TOOLS) {
    if (!existsSync(join(binDir, tool + ".exe"))) {
      throw new Error("Windows Poppler 包内缺少 " + tool + ".exe")
    }
  }
  console.log(`Prepared Windows Poppler: ${copied} files -> ${binDir}`)
}

function collectMacDylibs(binPath: string, libDir: string, seen: Set<string>) {
  const out = execFileSync("otool", ["-L", binPath], { encoding: "utf8" })
  const deps: string[] = []
  for (const line of out.split("\n").slice(1)) {
    const m = /^\s*(\/\S+)\s+\(/.exec(line)
    if (!m) continue
    const dep = m[1]
    if (dep.startsWith("/usr/lib/") || dep.startsWith("/System/Library/")) continue
    deps.push(dep)
  }
  for (const dep of deps) {
    const name = basename(dep)
    const dst = join(libDir, name)
    if (!seen.has(name) && existsSync(dep)) {
      seen.add(name)
      copyFileSync(dep, dst)
      chmodSync(dst, 0o755)
      execFileSync("install_name_tool", ["-id", "@loader_path/" + name, dst])
      collectMacDylibs(dst, libDir, seen)
    }
    const prefix = binPath.startsWith(libDir) ? "@loader_path/" : "@loader_path/../lib/"
    execFileSync("install_name_tool", ["-change", dep, prefix + name, binPath])
  }
}

function prepareMac(destRoot: string) {
  const binDir = join(destRoot, "bin")
  const libDir = join(destRoot, "lib")
  rmSync(destRoot, { recursive: true, force: true })
  mkdirSync(binDir, { recursive: true })
  mkdirSync(libDir, { recursive: true })

  const prefix = execFileSync("brew", ["--prefix", "poppler"], { encoding: "utf8" }).trim()
  const seen = new Set<string>()
  for (const tool of TOOLS) {
    const src = join(prefix, "bin", tool)
    if (!existsSync(src)) throw new Error("未在 Homebrew poppler 中找到 " + tool)
    const dst = join(binDir, tool)
    copyFileSync(src, dst)
    chmodSync(dst, 0o755)
    collectMacDylibs(dst, libDir, seen)
  }
  console.log(`Prepared macOS Poppler: ${TOOLS.length} bins, ${seen.size} dylibs -> ${destRoot}`)
}

const target = parseTargetOs()
const dest = join(root, "packages/desktop/resources/poppler", target)

if (target === "linux") prepareLinux(dest)
else if (target === "win") await prepareWindows(dest)
else prepareMac(dest)

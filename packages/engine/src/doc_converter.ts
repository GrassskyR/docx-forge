import { execFile } from "node:child_process"
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join, parse, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { promisify } from "node:util"
import { unzipSync } from "fflate"
import {
  execPoppler,
  execSoffice,
  probeToolchain,
  resolveWpsProgId,
  type ActiveRenderer,
} from "./toolchain.js"

const execFileAsync = promisify(execFile)
const ole = Buffer.from("D0CF11E0A1B11AE1", "hex")

let comQueue: Promise<void> = Promise.resolve()

function enqueueCom<T>(task: () => Promise<T>): Promise<T> {
  const result = comQueue.then(task, task)
  comQueue = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

const WIN_COM_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  "$src = $env:DOCFORGE_COM_SRC",
  "$dst = $env:DOCFORGE_COM_DST",
  "$ext = $env:DOCFORGE_COM_EXT",
  "$progId = $env:DOCFORGE_COM_PROGID",
  "$app = $null",
  "$doc = $null",
  "try {",
  "  $app = New-Object -ComObject $progId",
  "  $app.Visible = $false",
  "  try { $app.DisplayAlerts = 0 } catch {}",
  "  $doc = $app.Documents.Open($src, $false, $true, $false)",
  "  if ($ext -eq 'pdf') {",
  "    try { $doc.ExportAsFixedFormat($dst, 17) } catch { $doc.SaveAs2($dst, 17) }",
  "  } else {",
  "    $doc.SaveAs2($dst, 16)",
  "  }",
  "} finally {",
  "  if ($doc -ne $null) {",
  "    try { $doc.Close($false) } catch {}",
  "    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($doc)",
  "  }",
  "  if ($app -ne $null) {",
  "    try { $app.Quit() } catch {}",
  "    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($app)",
  "  }",
  "  [GC]::Collect()",
  "  [GC]::WaitForPendingFinalizers()",
  "}",
].join("\n")

async function convertWithCom(
  kind: "word_com" | "wps_com",
  source: string,
  directory: string,
  extension: "docx" | "pdf",
) {
  const progId =
    kind === "word_com" ? "Word.Application" : (await resolveWpsProgId()) || "KWPS.Application"
  const result = join(resolve(directory), parse(source).name + "." + extension)
  await enqueueCom(async () => {
    await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", WIN_COM_SCRIPT],
      {
        timeout: 90_000,
        windowsHide: true,
        env: {
          ...process.env,
          DOCFORGE_COM_SRC: resolve(source),
          DOCFORGE_COM_DST: result,
          DOCFORGE_COM_EXT: extension,
          DOCFORGE_COM_PROGID: progId,
        },
      },
    )
  })
  await stat(result)
  return result
}

async function convertWithLibreOffice(
  source: string,
  directory: string,
  extension: "docx" | "pdf",
) {
  const profile = await mkdtemp(join(tmpdir(), "docforge-lo-"))
  try {
    await execSoffice([
      "-env:UserInstallation=" + pathToFileURL(profile).href,
      "--headless",
      "--convert-to",
      extension,
      "--outdir",
      resolve(directory),
      resolve(source),
    ])
    const result = join(directory, parse(source).name + "." + extension)
    await stat(result)
    return result
  } finally {
    await rm(profile, { recursive: true, force: true })
  }
}

function buildRendererChain(status: Awaited<ReturnType<typeof probeToolchain>>): ActiveRenderer[] {
  if (status.renderer_mode === "libreoffice") {
    return status.libreoffice ? ["libreoffice"] : []
  }
  if (status.renderer_mode === "word_com") {
    return status.word_com ? ["word_com"] : []
  }
  if (status.renderer_mode === "wps_com") {
    return status.wps_com ? ["wps_com"] : []
  }
  const chain: ActiveRenderer[] = []
  if (process.platform === "win32") {
    if (status.word_com) chain.push("word_com")
    if (status.wps_com) chain.push("wps_com")
  }
  if (status.libreoffice) chain.push("libreoffice")
  return chain
}

export async function convert(source: string, directory: string, extension: "docx" | "pdf") {
  await mkdir(directory, { recursive: true })
  const status = await probeToolchain()
  const chain = buildRendererChain(status)
  if (!chain.length) {
    const hint =
      process.platform === "win32"
        ? "未检测到可用文档渲染引擎（Microsoft Word / WPS / LibreOffice），请在设置中配置"
        : "未检测到 LibreOffice (soffice)，请先安装并在设置中配置路径"
    throw new Error(hint)
  }
  let lastErr: unknown
  for (const backend of chain) {
    try {
      if (backend === "libreoffice") {
        return await convertWithLibreOffice(source, directory, extension)
      }
      if (backend === "word_com" || backend === "wps_com") {
        return await convertWithCom(backend, source, directory, extension)
      }
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

export async function toDocx(source: string, directory: string) {
  const bytes = await readFile(source)
  if (bytes.subarray(0, 8).equals(ole)) {
    const staging = await mkdtemp(join(tmpdir(), "docforge-doc-"))
    try {
      const legacy = join(staging, parse(source).name + ".doc")
      await copyFile(source, legacy)
      return await convert(legacy, directory, "docx")
    } finally {
      await rm(staging, { recursive: true, force: true })
    }
  }
  const files = unzipSync(bytes, { filter: (entry) => entry.name === "word/document.xml" })
  if (!files["word/document.xml"]?.length) throw new Error("需要包含 word/document.xml 的 Word 文件")
  return source
}

export async function preview(source: string, directory: string) {
  const pdf = await convert(source, directory, "pdf")
  const staging = await mkdtemp(join(directory, ".preview-"))
  try {
    await execPoppler("pdftoppm", ["-scale-to", "1200", "-png", pdf, join(staging, "page")])
    const names = (await readdir(staging)).sort((a, b) =>
      a.localeCompare(b, "en", { numeric: true }),
    )
    const paths = names.map((name) => join(directory, basename(name)))
    await Promise.all(names.map((name, index) => copyFile(join(staging, name), paths[index])))
    return paths
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

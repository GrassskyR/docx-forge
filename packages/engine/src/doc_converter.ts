import { execFile } from "node:child_process"
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join, parse, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { promisify } from "node:util"
import { unzipSync } from "fflate"

const run = promisify(execFile)
const ole = Buffer.from("D0CF11E0A1B11AE1", "hex")

export async function convert(source: string, directory: string, extension: "docx" | "pdf") {
  await mkdir(directory, { recursive: true })
  const profile = await mkdtemp(join(tmpdir(), "docforge-lo-"))
  try {
    await run("soffice", [
      "-env:UserInstallation=" + pathToFileURL(profile).href,
      "--headless", "--convert-to", extension, "--outdir", resolve(directory), resolve(source),
    ], { timeout: 90_000 })
    const result = join(directory, parse(source).name + "." + extension)
    await stat(result)
    return result
  } finally {
    await rm(profile, { recursive: true, force: true })
  }
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
  const files = unzipSync(bytes, { filter: entry => entry.name === "word/document.xml" })
  if (!files["word/document.xml"]?.length) throw new Error("需要包含 word/document.xml 的 Word 文件")
  return source
}

export async function preview(source: string, directory: string) {
  const pdf = await convert(source, directory, "pdf")
  const staging = await mkdtemp(join(directory, ".preview-"))
  try {
    await run("pdftoppm", ["-scale-to", "1200", "-png", pdf, join(staging, "page")], { timeout: 90_000 })
    const names = (await readdir(staging)).sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
    const paths = names.map(name => join(directory, basename(name)))
    await Promise.all(names.map((name, index) => copyFile(join(staging, name), paths[index])))
    return paths
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

import { chmodSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs"
import { mkdtemp, rm } from "node:fs/promises"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { unzipSync } from "fflate"
import { afterEach, describe, expect, it } from "vitest"
import {
  Store,
  configureToolchain,
  convert,
  convertViaWinCom,
  hasWinProgId,
  preview,
  probeToolchain,
  resolvePopplerBin,
  resolveSofficeBin,
  toDocx,
} from "@docs-agent/engine"
import { createApp, root } from "../src/app.js"
import { ConfigStore, type SecretCipher } from "../src/config_store.js"
import { dataFile } from "../src/documents.js"

const tempDirs: string[] = []

afterEach(async () => {
  configureToolchain({
    rendererMode: "auto",
    sofficePath: "",
    popplerDir: "",
    portableDir: "",
  })
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true })
  }
})

describe("Cross-platform toolchain & ConfigStore", () => {
  it("resolves bundled Poppler and portable LibreOffice before system PATH", async () => {
    const work = await mkdtemp(join(tmpdir(), "docforge-tc-"))
    tempDirs.push(work)
    const popplerBin = join(work, "poppler", "bin")
    const portableLo = join(work, "portable", "LibreOffice", "program")
    mkdirSync(popplerBin, { recursive: true })
    mkdirSync(portableLo, { recursive: true })
    for (const tool of ["pdftoppm", "pdftohtml", "pdfinfo"]) {
      const f = join(popplerBin, tool)
      writeFileSync(f, "#!/bin/sh\nexit 0\n")
      chmodSync(f, 0o755)
    }
    const soffice = join(portableLo, "soffice")
    writeFileSync(soffice, "#!/bin/sh\nexit 0\n")
    chmodSync(soffice, 0o755)

    configureToolchain({
      popplerDir: join(work, "poppler"),
      portableDir: join(work, "portable"),
    })
    const pop = resolvePopplerBin("pdftoppm")
    expect(pop?.source).toBe("bundled")
    expect(pop?.path).toBe(join(popplerBin, "pdftoppm"))
    expect(resolveSofficeBin()).toBe(soffice)

    const status = await probeToolchain(true)
    expect(status.poppler_source).toBe("bundled")
    expect(status.libreoffice_path).toBe(soffice)
  })

  it("encrypts secrets at rest and degrades gracefully on cross-machine decrypt error", async () => {
    const work = await mkdtemp(join(tmpdir(), "docforge-cfg-"))
    tempDirs.push(work)
    const dbPath = join(work, "docforge.db")
    const cipherA: SecretCipher = {
      encrypt: (p) => "enc:" + Buffer.from(p).toString("base64"),
      decrypt: (s) => {
        if (!s.startsWith("enc:")) return s
        return Buffer.from(s.slice(4), "base64").toString("utf8")
      },
    }
    const storeA = new Store(dbPath)
    const cfgA = new ConfigStore(storeA, cipherA, false)
    const view = cfgA.update({
      llm_base_url: "https://api.deepseek.com/v1",
      llm_api_key: "sk-secret-12345678",
      llm_model: "deepseek-chat",
      llm_supports_vision: true,
    })
    expect(view.llm_api_key_configured).toBe(true)
    expect(view.llm_api_key_hint).toBe("sk-••••5678")
    const rawRow = storeA.db
      .prepare("SELECT value FROM settings WHERE key='app_config'")
      .get() as { value: string }
    expect(rawRow.value).not.toContain("sk-secret-12345678")
    expect(rawRow.value).toContain("enc:")
    storeA.db.close()

    const cipherBroken: SecretCipher = {
      encrypt: (p) => p,
      decrypt: () => {
        throw new Error("DPAPI key bound to another machine")
      },
    }
    const storeB = new Store(dbPath)
    const cfgB = new ConfigStore(storeB, cipherBroken, false)
    expect(cfgB.current().llm_api_key).toBe("")
    expect(cfgB.current().llm_model).toBe("deepseek-chat")
    storeB.db.close()
  })

  it("enforces local authToken and supports /api/settings GET/PUT hot-update", async () => {
    const work = await mkdtemp(join(tmpdir(), "docforge-srv-"))
    tempDirs.push(work)
    const token = "test-desktop-secret-token"
    const server = createApp({
      dataDir: work,
      authToken: token,
      isDesktop: true,
      isPortable: true,
      syncToolchain: false,
    })
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r))
    const base = "http://127.0.0.1:" + (server.address() as AddressInfo).port
    try {
      const denied = await fetch(base + "/health")
      expect(denied.status).toBe(403)

      const headers = { "x-docforge-token": token, "content-type": "application/json" }
      const healthRes = await fetch(base + "/health", { headers })
      expect(healthRes.status).toBe(200)
      const health = (await healthRes.json()) as Record<string, unknown>
      expect(health.is_desktop).toBe(true)
      expect(health.is_portable).toBe(true)

      const putRes = await fetch(base + "/api/settings", {
        method: "PUT",
        headers,
        body: JSON.stringify({
          llm_base_url: "https://example.invalid/v1",
          llm_api_key: "sk-live-abcdef12",
          llm_model: "demo-model",
          llm_supports_vision: false,
        }),
      })
      expect(putRes.status).toBe(200)
      const updated = (await putRes.json()) as {
        config: { llm_api_key_configured: boolean; llm_api_key_hint: string }
        health: { llm_configured: boolean }
      }
      expect(updated.config.llm_api_key_configured).toBe(true)
      expect(updated.config.llm_api_key_hint).toBe("sk-••••ef12")
      expect(updated.health.llm_configured).toBe(true)
    } finally {
      await new Promise<void>((r) => server.close(() => r()))
    }
  })

  it("serves static assets when distDir is a symlinked/aliased root and blocks traversal", async () => {
    const work = await mkdtemp(join(tmpdir(), "docforge-df-"))
    tempDirs.push(work)
    const realDist = join(work, "real-web-dist")
    const aliasDist = join(work, "alias-web-dist")
    mkdirSync(join(realDist, "assets"), { recursive: true })
    writeFileSync(join(realDist, "index.html"), "<!doctype html><title>ok</title>")
    writeFileSync(join(realDist, "assets", "app.css"), ".w-4{width:1rem}.flex{display:flex}")
    symlinkSync(realDist, aliasDist, "junction")

    const resolvedCss = await dataFile(aliasDist, join(aliasDist, "assets", "app.css"))
    expect(readFileSync(resolvedCss, "utf8")).toContain(".w-4")
    await expect(dataFile(aliasDist, join(aliasDist, "..", "outside.txt"))).rejects.toThrow()
  })

  it("eliminates hidden shell/PowerShell/reg.exe calls in toolchain and COM converter", () => {
    const tcSrc = readFileSync(resolve(root, "packages/engine/src/toolchain.ts"), "utf8")
    const convSrc = readFileSync(resolve(root, "packages/engine/src/doc_converter.ts"), "utf8")
    expect(tcSrc).not.toMatch(/reg\.exe|powershell|cmd\.exe/i)
    expect(convSrc).not.toMatch(/powershell|cmd\.exe|wscript|cscript|child_process/i)
  })

  it.runIf(process.platform === "win32" && (hasWinProgId("Word.Application") || hasWinProgId("KWPS.Application")))(
    "renders .docx -> .pdf, .doc -> .docx, and PNG previews via real Windows Office COM",
    async () => {
      const work = await mkdtemp(join(tmpdir(), "docforge-wincom-"))
      tempDirs.push(work)
      const bundledPoppler = resolve(root, "packages/desktop/resources/poppler/win")
      const mode = hasWinProgId("Word.Application") ? "word_com" : "wps_com"
      configureToolchain({
        rendererMode: mode,
        ...(existsSync(bundledPoppler) ? { popplerDir: bundledPoppler } : {}),
      })

      const status = await probeToolchain(true)
      expect(status.active_renderer).toBe(mode)
      expect(status.renderer_ready).toBe(true)

      const sampleDocx = resolve(root, "eval/artifacts/casual-01/output.docx")
      const pdfOutDir = join(work, "pdf-out")
      const pdfPath = await convert(sampleDocx, pdfOutDir, "pdf")
      const pdfBytes = readFileSync(pdfPath)
      expect(pdfBytes.subarray(0, 5).toString("ascii")).toBe("%PDF-")
      expect(pdfBytes.length).toBeGreaterThan(1024)

      // Verify legacy .doc -> .docx conversion via real Office COM
      const progId = mode === "word_com" ? "Word.Application" : "KWPS.Application"
      const legacyDoc = join(work, "legacy_sample.doc")
      await convertViaWinCom(progId, sampleDocx, legacyDoc, "doc")
      const convertedDocx = await toDocx(legacyDoc, join(work, "docx-out"))
      const zipEntries = unzipSync(readFileSync(convertedDocx))
      expect(zipEntries["word/document.xml"]?.length).toBeGreaterThan(0)

      if (resolvePopplerBin("pdftoppm")) {
        const pngs = await preview(sampleDocx, join(work, "preview-out"))
        expect(pngs.length).toBeGreaterThanOrEqual(1)
        const pngHeader = readFileSync(pngs[0]).subarray(0, 4)
        expect(pngHeader.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(true)

        // Full desktop HTTP/SSE compose & sample rendering pipeline via real Office COM
        const token = "win-com-e2e-token"
        const distDir = resolve(root, "packages/web/dist")
        const server = createApp({
          dataDir: join(work, "desktop-data"),
          distDir,
          authToken: token,
          isDesktop: true,
          syncToolchain: false,
        })
        await new Promise<void>((r) => server.listen(0, "127.0.0.1", r))
        const base = "http://127.0.0.1:" + (server.address() as AddressInfo).port
        const headers = { "x-docforge-token": token, "content-type": "application/json" }
        try {
          if (existsSync(join(distDir, "index.html"))) {
            const html = await (await fetch(base + "/")).text()
            const cssHref = /href="(\/assets\/[^"]+\.css)"/.exec(html)?.[1]
            expect(cssHref).toBeTruthy()
            const cssRes = await fetch(base + cssHref!)
            expect(cssRes.status).toBe(200)
            const cssText = await cssRes.text()
            expect(cssText).toContain(".flex")
            expect(cssText).toContain(".w-4")
          }

          const samplesRes = await fetch(base + "/api/templates/builtin-standard-doc/samples", {
            headers,
          })
          expect(samplesRes.status).toBe(200)
          const samples = (await samplesRes.json()) as { sample_urls: string[] }
          expect(samples.sample_urls.length).toBeGreaterThanOrEqual(1)

          const composeRes = await fetch(base + "/api/documents/compose-stream", {
            method: "POST",
            headers,
            body: JSON.stringify({
              template_id: "builtin-standard-doc",
              draft_text: "关于桌面版真实Office接口验证的通知\n一、说明\n全程零Shell调用完成排版与高清预览。",
              run_vision: false,
            }),
          })
          expect(composeRes.status).toBe(200)
          const sseText = await composeRes.text()
          const doneEvt = sseText
            .split("\n")
            .filter((l) => l.startsWith("data: "))
            .map((l) => JSON.parse(l.slice(6)) as { type: string; result?: { preview_urls: string[] } })
            .find((e) => e.type === "done")
          expect(doneEvt?.result?.preview_urls.length).toBeGreaterThanOrEqual(1)
          const firstPng = await fetch(base + doneEvt!.result!.preview_urls[0], { headers })
          expect(firstPng.status).toBe(200)
          expect((await firstPng.arrayBuffer()).byteLength).toBeGreaterThan(1024)
        } finally {
          await new Promise<void>((r) => server.close(() => r()))
        }
      }
    },
    120_000,
  )
})

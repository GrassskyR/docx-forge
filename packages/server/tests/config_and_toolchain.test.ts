import { chmodSync, mkdirSync, writeFileSync } from "node:fs"
import { mkdtemp, rm } from "node:fs/promises"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  Store,
  configureToolchain,
  probeToolchain,
  resolvePopplerBin,
  resolveSofficeBin,
} from "@docs-agent/engine"
import { createApp } from "../src/app.js"
import { ConfigStore, type SecretCipher } from "../src/config_store.js"

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
})

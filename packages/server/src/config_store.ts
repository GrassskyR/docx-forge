import {
  configureToolchain,
  type RendererMode,
  type Store,
  type VisionEnv,
} from "@docs-agent/engine"

export interface SecretCipher {
  encrypt(plain: string): string
  decrypt(stored: string): string
}

export interface AppConfig extends VisionEnv {
  llm_base_url: string
  llm_api_key: string
  llm_model: string
  llm_supports_vision: boolean
  llm_input_usd_per_million: number | null
  llm_output_usd_per_million: number | null
  vision_base_url: string
  vision_api_key: string
  vision_model: string
  renderer_mode: RendererMode
  soffice_path: string
}

export interface AppConfigPatch {
  llm_base_url?: string
  llm_api_key?: string
  clear_llm_api_key?: boolean
  llm_model?: string
  llm_supports_vision?: boolean
  llm_input_usd_per_million?: number | null
  llm_output_usd_per_million?: number | null
  vision_base_url?: string
  vision_api_key?: string
  clear_vision_api_key?: boolean
  vision_model?: string
  renderer_mode?: RendererMode
  soffice_path?: string
}

export interface PublicAppConfig {
  llm_base_url: string
  llm_api_key_configured: boolean
  llm_api_key_hint: string
  llm_model: string
  llm_supports_vision: boolean
  llm_input_usd_per_million: number | null
  llm_output_usd_per_million: number | null
  vision_base_url: string
  vision_api_key_configured: boolean
  vision_api_key_hint: string
  vision_model: string
  renderer_mode: RendererMode
  soffice_path: string
}

const SETTINGS_KEY = "app_config"
const VALID_RENDERERS = new Set<RendererMode>(["auto", "word_com", "wps_com", "libreoffice"])

function numOrNull(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function maskSecret(key: string): string {
  const s = key.trim()
  if (!s) return ""
  if (s.length <= 6) return "••••"
  return s.slice(0, 3) + "••••" + s.slice(-4)
}

function envDefaults(): AppConfig {
  return {
    llm_base_url: (process.env.LLM_BASE_URL || "https://api.openai.com/v1").trim(),
    llm_api_key: (process.env.LLM_API_KEY || "").trim(),
    llm_model: (process.env.LLM_MODEL || "").trim(),
    llm_supports_vision: process.env.LLM_SUPPORTS_VISION === "true",
    llm_input_usd_per_million: numOrNull(process.env.LLM_INPUT_USD_PER_MILLION),
    llm_output_usd_per_million: numOrNull(process.env.LLM_OUTPUT_USD_PER_MILLION),
    vision_base_url: (process.env.VISION_BASE_URL || "").trim(),
    vision_api_key: (process.env.VISION_API_KEY || "").trim(),
    vision_model: (process.env.VISION_MODEL || "").trim(),
    renderer_mode: "auto",
    soffice_path: (process.env.DOCFORGE_SOFFICE_PATH || "").trim(),
  }
}

export class ConfigStore {
  private cached: AppConfig
  private hasStoredRow = false

  constructor(
    private readonly store: Store,
    private readonly cipher?: SecretCipher,
    private readonly syncToolchain = true,
  ) {
    this.cached = this.load()
    if (this.hasStoredRow && this.syncToolchain) {
      this.applyToolchain()
    }
  }

  private decryptSecret(raw: unknown, fallback: string): string {
    if (typeof raw !== "string" || !raw) return fallback
    if (!this.cipher) return raw
    try {
      return this.cipher.decrypt(raw).trim()
    } catch {
      return ""
    }
  }

  private encryptSecret(plain: string): string {
    if (!plain) return ""
    return this.cipher ? this.cipher.encrypt(plain) : plain
  }

  private load(): AppConfig {
    const base = envDefaults()
    const row = this.store.db
      .prepare("SELECT value FROM settings WHERE key=?")
      .get(SETTINGS_KEY) as { value: string } | undefined
    if (!row) return base
    this.hasStoredRow = true
    const saved = JSON.parse(row.value) as Record<string, unknown>
    const mode = VALID_RENDERERS.has(saved.renderer_mode as RendererMode)
      ? (saved.renderer_mode as RendererMode)
      : base.renderer_mode
    return {
      llm_base_url:
        typeof saved.llm_base_url === "string" && saved.llm_base_url.trim()
          ? saved.llm_base_url.trim()
          : base.llm_base_url,
      llm_api_key:
        saved.llm_api_key !== undefined
          ? this.decryptSecret(saved.llm_api_key, "")
          : base.llm_api_key,
      llm_model:
        typeof saved.llm_model === "string" ? saved.llm_model.trim() : base.llm_model,
      llm_supports_vision:
        typeof saved.llm_supports_vision === "boolean"
          ? saved.llm_supports_vision
          : base.llm_supports_vision,
      llm_input_usd_per_million:
        saved.llm_input_usd_per_million !== undefined
          ? numOrNull(saved.llm_input_usd_per_million)
          : base.llm_input_usd_per_million,
      llm_output_usd_per_million:
        saved.llm_output_usd_per_million !== undefined
          ? numOrNull(saved.llm_output_usd_per_million)
          : base.llm_output_usd_per_million,
      vision_base_url:
        typeof saved.vision_base_url === "string"
          ? saved.vision_base_url.trim()
          : base.vision_base_url,
      vision_api_key:
        saved.vision_api_key !== undefined
          ? this.decryptSecret(saved.vision_api_key, "")
          : base.vision_api_key,
      vision_model:
        typeof saved.vision_model === "string" ? saved.vision_model.trim() : base.vision_model,
      renderer_mode: mode,
      soffice_path:
        typeof saved.soffice_path === "string" ? saved.soffice_path.trim() : base.soffice_path,
    }
  }

  private applyToolchain() {
    configureToolchain({
      rendererMode: this.cached.renderer_mode,
      sofficePath: this.cached.soffice_path,
    })
  }

  current(): AppConfig {
    return this.hasStoredRow ? { ...this.cached } : envDefaults()
  }

  publicView(): PublicAppConfig {
    const cfg = this.current()
    return {
      llm_base_url: cfg.llm_base_url,
      llm_api_key_configured: Boolean(cfg.llm_api_key),
      llm_api_key_hint: maskSecret(cfg.llm_api_key),
      llm_model: cfg.llm_model,
      llm_supports_vision: cfg.llm_supports_vision,
      llm_input_usd_per_million: cfg.llm_input_usd_per_million,
      llm_output_usd_per_million: cfg.llm_output_usd_per_million,
      vision_base_url: cfg.vision_base_url,
      vision_api_key_configured: Boolean(cfg.vision_api_key),
      vision_api_key_hint: maskSecret(cfg.vision_api_key),
      vision_model: cfg.vision_model,
      renderer_mode: cfg.renderer_mode,
      soffice_path: cfg.soffice_path,
    }
  }

  update(patch: AppConfigPatch): PublicAppConfig {
    const cur = this.current()
    const next: AppConfig = {
      llm_base_url:
        patch.llm_base_url !== undefined
          ? patch.llm_base_url.trim() || "https://api.openai.com/v1"
          : cur.llm_base_url,
      llm_api_key: patch.clear_llm_api_key
        ? ""
        : patch.llm_api_key !== undefined && patch.llm_api_key.trim() !== ""
          ? patch.llm_api_key.trim()
          : cur.llm_api_key,
      llm_model: patch.llm_model !== undefined ? patch.llm_model.trim() : cur.llm_model,
      llm_supports_vision:
        patch.llm_supports_vision !== undefined
          ? Boolean(patch.llm_supports_vision)
          : cur.llm_supports_vision,
      llm_input_usd_per_million:
        patch.llm_input_usd_per_million !== undefined
          ? numOrNull(patch.llm_input_usd_per_million)
          : cur.llm_input_usd_per_million,
      llm_output_usd_per_million:
        patch.llm_output_usd_per_million !== undefined
          ? numOrNull(patch.llm_output_usd_per_million)
          : cur.llm_output_usd_per_million,
      vision_base_url:
        patch.vision_base_url !== undefined
          ? patch.vision_base_url.trim()
          : cur.vision_base_url,
      vision_api_key: patch.clear_vision_api_key
        ? ""
        : patch.vision_api_key !== undefined && patch.vision_api_key.trim() !== ""
          ? patch.vision_api_key.trim()
          : cur.vision_api_key,
      vision_model:
        patch.vision_model !== undefined ? patch.vision_model.trim() : cur.vision_model,
      renderer_mode:
        patch.renderer_mode !== undefined && VALID_RENDERERS.has(patch.renderer_mode)
          ? patch.renderer_mode
          : cur.renderer_mode,
      soffice_path:
        patch.soffice_path !== undefined ? patch.soffice_path.trim() : cur.soffice_path,
    }
    const serialized = {
      ...next,
      llm_api_key: this.encryptSecret(next.llm_api_key),
      vision_api_key: this.encryptSecret(next.vision_api_key),
    }
    this.store.db
      .prepare("INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)")
      .run(SETTINGS_KEY, JSON.stringify(serialized))
    this.cached = next
    this.hasStoredRow = true
    if (this.syncToolchain) this.applyToolchain()
    return this.publicView()
  }
}

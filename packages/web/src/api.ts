import type { TemplateAsset, VisionAudit } from "@docs-agent/shared"
import type {
  DocumentResult,
  DraftIngestResponse,
  HealthInfo,
  SessionsPayload,
  TemplatesResponse,
} from "./types.js"

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers =
    init?.body instanceof FormData
      ? init.headers
      : { "Content-Type": "application/json", ...init?.headers }
  const res = await fetch(path, { ...init, headers })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail = data?.detail ?? data?.error ?? "请求失败 (" + res.status + ")"
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail))
  }
  return data as T
}

export async function readSseStream(
  path: string,
  init: RequestInit,
  onEvent: (ev: Record<string, any>) => void,
) {
  const headers =
    init.body instanceof FormData
      ? init.headers
      : { "Content-Type": "application/json", ...init.headers }
  const res = await fetch(path, { ...init, headers })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.detail ?? err?.error ?? "请求失败 (" + res.status + ")")
  }
  const reader = res.body?.getReader()
  if (!reader) return
  const decoder = new TextDecoder()
  let buffer = ""
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split("\n\n")
    buffer = parts.pop() ?? ""
    for (const part of parts) {
      for (const line of part.split("\n")) {
        if (line.startsWith("data: ")) {
          onEvent(JSON.parse(line.slice(6)))
        }
      }
    }
  }
}

export function fetchHealth() {
  return request<HealthInfo>("/health")
}

export function fetchTemplates() {
  return request<TemplatesResponse>("/api/templates")
}

export function fetchTemplateSamples(id: string) {
  return request<{ sample_urls: string[] }>(
    "/api/templates/" + encodeURIComponent(id) + "/samples",
  )
}

export function updateTemplate(id: string, patch: { name?: string; category?: string }) {
  return request<TemplateAsset>("/api/templates/" + encodeURIComponent(id), {
    method: "PATCH",
    body: JSON.stringify(patch),
  })
}

export function forkTemplateAsset(id: string, name: string) {
  return request<TemplateAsset>("/api/templates/" + encodeURIComponent(id) + "/fork", {
    method: "POST",
    body: JSON.stringify({ name }),
  })
}

export function deleteTemplate(id: string) {
  return request<{ deleted: string }>("/api/templates/" + encodeURIComponent(id), {
    method: "DELETE",
  })
}

export function streamImportTemplate(
  file: File,
  name: string,
  category: string,
  rulesMd: string,
  signal: AbortSignal,
  onEvent: (ev: Record<string, any>) => void,
) {
  const form = new FormData()
  form.set("file", file, file.name)
  if (name) form.set("name", name)
  if (category) form.set("category", category)
  if (rulesMd) form.set("rules_md", rulesMd)
  return readSseStream("/api/templates/import", { method: "POST", body: form, signal }, onEvent)
}

export function ingestDraftFile(file: File) {
  const form = new FormData()
  form.set("file", file, file.name)
  return request<DraftIngestResponse>("/api/drafts/ingest", { method: "POST", body: form })
}

export function streamComposeDocument(
  payload: {
    session_id: string
    template_id?: string
    draft_text: string
    slot_values?: Record<string, string>
    normalize_punctuation?: boolean
    generate_cover?: boolean
    generate_toc?: boolean
    run_vision?: boolean
  },
  signal: AbortSignal,
  onEvent: (ev: Record<string, any>) => void,
) {
  return readSseStream(
    "/api/documents/compose-stream",
    {
      method: "POST",
      body: JSON.stringify(payload),
      signal,
    },
    onEvent,
  )
}

export function adjustDocumentLayout(
  docId: string,
  operations: {
    type:
      | "compact_pages"
      | "prevent_orphan_signature"
      | "line_spacing_delta"
      | "space_after_delta"
    delta?: number
  }[],
  sessionId?: string,
) {
  return request<DocumentResult>(
    "/api/documents/" + encodeURIComponent(docId) + "/adjust-layout",
    {
      method: "POST",
      body: JSON.stringify({ operations, session_id: sessionId }),
    },
  )
}

export function visualAuditDocument(docId: string, runVision = true, sessionId?: string) {
  return request<{ vision: VisionAudit }>(
    "/api/documents/" + encodeURIComponent(docId) + "/visual-audit",
    {
      method: "POST",
      body: JSON.stringify({ run_vision: runVision, session_id: sessionId }),
    },
  )
}

export function fetchSessions() {
  return request<SessionsPayload>("/api/sessions")
}

export function createSession(opts?: { name?: string; template_id?: string | null }) {
  return request<SessionsPayload>("/api/sessions", {
    method: "POST",
    body: JSON.stringify(opts ?? {}),
  })
}

export function switchActiveSession(sessionId: string) {
  return request<SessionsPayload>("/api/sessions/active", {
    method: "PUT",
    body: JSON.stringify({ session_id: sessionId }),
  })
}

export function forkSession(id: string, name?: string, templateId?: string | null) {
  return request<SessionsPayload>("/api/sessions/" + encodeURIComponent(id) + "/fork", {
    method: "POST",
    body: JSON.stringify({ name, template_id: templateId }),
  })
}

export function patchSession(
  id: string,
  patch: {
    name?: string
    template_id?: string
    draft_text?: string
    slot_values?: Record<string, string>
    generate_cover?: boolean
    generate_toc?: boolean
    normalize_punct?: boolean
    preview_stale?: boolean
  },
) {
  return request<SessionsPayload>("/api/sessions/" + encodeURIComponent(id), {
    method: "PATCH",
    body: JSON.stringify(patch),
  })
}

export function deleteSession(id: string) {
  return request<SessionsPayload>("/api/sessions/" + encodeURIComponent(id), {
    method: "DELETE",
  })
}

export function streamChat(
  payload: { session_id: string; prompt: string; vision_enabled: boolean },
  signal: AbortSignal,
  onEvent: (ev: Record<string, any>) => void,
) {
  return readSseStream(
    "/api/chat",
    {
      method: "POST",
      body: JSON.stringify(payload),
      signal,
    },
    onEvent,
  )
}

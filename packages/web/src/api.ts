import type { ComposePlan, TemplateAsset, VisionAudit } from "@docs-agent/shared"
import type {
  DocumentResult,
  DraftIngestResponse,
  HealthInfo,
  InspectResponse,
  SessionsResponse,
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

export function fetchHealth() {
  return request<HealthInfo>("/health")
}

export function fetchTemplates() {
  return request<TemplatesResponse>("/api/templates")
}

export function setActiveTemplate(templateId: string | null) {
  return request<{ active_template_id: string | null }>("/api/templates/active", {
    method: "PUT",
    body: JSON.stringify({ template_id: templateId }),
  })
}

export async function inspectDocFile(file: File) {
  const form = new FormData()
  form.set("file", file, file.name)
  return request<InspectResponse>("/api/templates/inspect", { method: "POST", body: form })
}

export function saveTemplateFromInspect(
  inspectId: string,
  name: string,
  category: string,
  rulesMd: string,
) {
  return request<TemplateAsset>("/api/templates", {
    method: "POST",
    body: JSON.stringify({
      inspect_id: inspectId,
      name,
      category,
      rules_md: rulesMd,
      set_active: true,
    }),
  })
}

export function forkTemplateAsset(id: string, name: string) {
  return request<TemplateAsset>("/api/templates/" + encodeURIComponent(id) + "/fork", {
    method: "POST",
    body: JSON.stringify({ name }),
  })
}

export function ingestDraftText(text: string) {
  return request<DraftIngestResponse>("/api/drafts/ingest", {
    method: "POST",
    body: JSON.stringify({ text }),
  })
}

export function ingestDraftFile(file: File) {
  const form = new FormData()
  form.set("file", file, file.name)
  return request<DraftIngestResponse>("/api/drafts/ingest", { method: "POST", body: form })
}

export function composeDocument(payload: {
  template_id?: string
  mode: "exact_copy" | "authored"
  draft_id?: string
  slot_values?: Record<string, string>
  body_plan?: ComposePlan
  normalize_punctuation?: boolean
  generate_cover?: boolean
  generate_toc?: boolean
}) {
  return request<DocumentResult>("/api/documents/compose", {
    method: "POST",
    body: JSON.stringify(payload),
  })
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
) {
  return request<DocumentResult>(
    "/api/documents/" + encodeURIComponent(docId) + "/adjust-layout",
    {
      method: "POST",
      body: JSON.stringify({ operations }),
    },
  )
}

export function visualAuditDocument(docId: string, runVision = true) {
  return request<{ vision: VisionAudit }>(
    "/api/documents/" + encodeURIComponent(docId) + "/visual-audit",
    {
      method: "POST",
      body: JSON.stringify({ run_vision: runVision }),
    },
  )
}

export function fetchSessions() {
  return request<SessionsResponse>("/sessions")
}

export function forkSessionBranch(name: string, templateId?: string | null) {
  return request<{ id: string }>("/sessions/fork", {
    method: "POST",
    body: JSON.stringify({ name, template_id: templateId }),
  })
}

export function switchSessionBranch(id: string) {
  return request<{ id: string }>("/sessions/switch", {
    method: "POST",
    body: JSON.stringify({ id }),
  })
}

export async function streamChat(
  prompt: string,
  visionEnabled: boolean,
  onEvent: (ev: Record<string, any>) => void,
) {
  const res = await fetch("/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, vision_enabled: visionEnabled }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error ?? err?.detail ?? "对话请求失败 (" + res.status + ")")
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

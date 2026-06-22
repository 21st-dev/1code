import type { AppAgent } from "../db"

export type AppAgentDTO = {
  id: string
  name: string
  description: string
  prompt: string
  tools: string[]
  disallowedTools: string[]
  source: "app"
  path: string
  createdAt: string | null
  updatedAt: string | null
}

export function normalizeAppAgentName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

export function parseToolList(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((tool): tool is string => typeof tool === "string")
  } catch {
    return []
  }
}

export function serializeToolList(values?: string[]) {
  const normalized = Array.from(
    new Set((values ?? []).map((value) => value.trim()).filter(Boolean)),
  )
  return normalized.length > 0 ? JSON.stringify(normalized) : null
}

export function toAppAgentDTO(row: AppAgent): AppAgentDTO {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    prompt: row.prompt,
    tools: parseToolList(row.tools),
    disallowedTools: parseToolList(row.disallowedTools),
    source: "app",
    path: "Locus Agents",
    createdAt: row.createdAt?.toISOString() ?? null,
    updatedAt: row.updatedAt?.toISOString() ?? null,
  }
}

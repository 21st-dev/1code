import path from "path"
import {
  AGENT_ENGINE_IDS,
  DEFAULT_AGENT_ENGINE_ID,
  type AgentEngineId,
  type AgentPermissionMode,
} from "../agent-runtime/types"
import { getAgentRuntimeManifest } from "../agent-runtime/manifests"
import type { MobileGatewaySessionSummary } from "./facade"

export interface MobileGatewaySessionRow {
  chatId: string
  chatName?: string | null
  chatWorktreePath?: string | null
  projectName?: string | null
  projectPath: string
  subChatId: string
  subChatName?: string | null
  engine?: string | null
  modelId?: string | null
  mode?: string | null
  runtimeMetadata?: string | null
  streamId?: string | null
  engineSessionId?: string | null
  sessionId?: string | null
  updatedAt?: Date | number | string | null
}

const permissionModes = new Set<AgentPermissionMode>([
  "plan",
  "agent",
  "bypass",
  "read-only",
  "ask-approval",
  "full-access",
  "custom",
])

export function createMobileGatewaySessionSource(
  readRows: () => readonly MobileGatewaySessionRow[],
): () => MobileGatewaySessionSummary[] {
  return () => mapMobileGatewaySessionRows(readRows())
}

export function mapMobileGatewaySessionRows(
  rows: readonly MobileGatewaySessionRow[],
): MobileGatewaySessionSummary[] {
  return rows.map((row) => {
    const engineId = normalizeEngineId(row.engine)
    const manifest = getAgentRuntimeManifest(engineId)
    const projectPath = row.chatWorktreePath || row.projectPath
    const nativeSessionId =
      row.engineSessionId ?? (engineId === "claude-code" ? row.sessionId : null)

    return {
      chatId: row.chatId,
      subChatId: row.subChatId,
      title: cleanString(row.subChatName) ?? cleanString(row.chatName) ?? "Untitled chat",
      projectLabel:
        cleanString(row.projectName) ??
        cleanString(path.basename(row.projectPath)) ??
        "Workspace",
      projectPath,
      detail: nativeSessionId ? "Native session linked" : "Ready to start",
      engineId,
      modelId: cleanString(row.modelId) ?? manifest.defaultModelId ?? null,
      nativeSessionId,
      permissionMode: resolvePermissionMode(row),
      status: row.streamId ? "running" : "idle",
      updatedAt: toIsoString(row.updatedAt),
      pendingApprovals: 0,
      unreadEvents: 0,
    }
  })
}

function normalizeEngineId(value: string | null | undefined): AgentEngineId {
  return AGENT_ENGINE_IDS.includes(value as AgentEngineId)
    ? value as AgentEngineId
    : DEFAULT_AGENT_ENGINE_ID
}

function resolvePermissionMode(row: MobileGatewaySessionRow): AgentPermissionMode {
  const metadata = parseMetadata(row.runtimeMetadata)
  if (isPermissionMode(metadata.permissionMode)) {
    return metadata.permissionMode
  }
  return isPermissionMode(row.mode) ? row.mode : "agent"
}

function isPermissionMode(value: unknown): value is AgentPermissionMode {
  return typeof value === "string" && permissionModes.has(value as AgentPermissionMode)
}

function parseMetadata(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

function cleanString(value: string | null | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function toIsoString(value: Date | number | string | null | undefined): string {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === "number") {
    const millis = value < 10_000_000_000 ? value * 1000 : value
    return new Date(millis).toISOString()
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString()
  }
  return new Date(0).toISOString()
}

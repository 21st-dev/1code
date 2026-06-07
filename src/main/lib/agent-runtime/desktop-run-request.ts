import type { AgentRuntimeId } from "../../../shared/agent-runtime-capabilities"
import type { AgentJobMode } from "../../../shared/agent-jobs"
import type { DesktopPermissionPolicy } from "./permission-policy"
import type { DesktopRunPreflightResult } from "./preflight"
import type { RunEvent } from "./runtime-events"

export type DesktopRunIdentity = {
  runId: string
  streamId?: string | null
  jobId?: string | null
  attempt?: number | null
}

export type DesktopRunContext = {
  runtimeId: AgentRuntimeId
  mode: AgentJobMode
  projectId: string
  chatId: string
  subChatId: string
  cwd: string
}

export type DesktopRunProviderBinding = {
  model?: string | null
  modelSource?: string | null
  providerProfileId?: string | null
  gatewayEndpoint?: string | null
  authMode?: "app-managed" | "provider-profile" | "runtime-managed" | null
  diagnostics?: Array<{
    id: string
    status: "ready" | "blocked" | "skipped"
    message?: string
  }>
}

export type DesktopRunMcpReadiness = {
  status: "ready" | "blocked" | "skipped"
  serverNames: string[]
  blockers: Array<{
    serverName?: string
    reason: string
  }>
}

export type DesktopRunAttachmentRef = {
  kind: "image" | "long-text"
  attachmentId?: string
  localRef?: string
  mediaType?: string
  filename?: string
  byteLength?: number
}

export type DesktopTraceObserver = {
  emit(event: RunEvent): void
}

export type DesktopRunRequest = {
  identity: DesktopRunIdentity
  context: DesktopRunContext
  prompt: string
  permissionPolicy: DesktopPermissionPolicy
  providerBinding: DesktopRunProviderBinding
  mcp: DesktopRunMcpReadiness
  attachments: DesktopRunAttachmentRef[]
  trace: DesktopTraceObserver
  signal: AbortSignal
  session: {
    resumeSessionId?: string | null
    parentSessionId?: string | null
  }
}

export type DesktopRunResult = {
  status: "succeeded" | "failed" | "canceled" | "interrupted"
  sessionId?: string | null
  usage?: {
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
  }
  error?: {
    message: string
    code?: string
  }
}

export function createDesktopRunMcpReadiness(input: {
  status: DesktopRunMcpReadiness["status"]
  serverNames?: string[]
  blockers?: DesktopRunMcpReadiness["blockers"]
}): DesktopRunMcpReadiness {
  return {
    status: input.status,
    serverNames: [...(input.serverNames ?? [])].sort(),
    blockers: input.blockers ?? [],
  }
}

export function withDesktopRunMcpReadiness(
  request: DesktopRunRequest,
  mcp: DesktopRunMcpReadiness,
): DesktopRunRequest {
  return {
    ...request,
    mcp,
  }
}

export function withDesktopRunAttempt(
  request: DesktopRunRequest,
  attempt: number,
): DesktopRunRequest {
  return {
    ...request,
    identity: {
      ...request.identity,
      attempt,
    },
  }
}

export function createDesktopRunContextFromPreflight(
  runtimeId: AgentRuntimeId,
  mode: AgentJobMode,
  preflight: DesktopRunPreflightResult,
): DesktopRunContext {
  return {
    runtimeId,
    mode,
    projectId: preflight.project.id,
    chatId: preflight.chat.id,
    subChatId: preflight.subChat.id,
    cwd: preflight.cwd,
  }
}

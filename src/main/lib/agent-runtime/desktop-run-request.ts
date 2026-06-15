import {
  getAgentRunRequiredCapabilityIds,
  type AgentRuntimeCapabilityId,
  type AgentRuntimeId,
} from "../../../shared/agent-runtime-capabilities"
import type { AgentJobMode } from "../../../shared/agent-jobs"
import type { DesktopPermissionPolicy } from "./permission-policy"
import type { DesktopRunPreflightResult } from "./preflight"
import type { RunEvent } from "./runtime-events"
import type {
  AgentRuntimeProviderAuthMode,
  AgentRuntimeProviderDiagnostic,
  AgentRuntimeProviderReference,
  AgentRuntimeRunContextBase,
  AgentRuntimeRunIdentityBase,
  AgentRuntimeRunRequestBase,
  AgentRuntimeRunResultBase,
  AgentRuntimeTraceObserver,
} from "./run-contract"

export type DesktopRunIdentity = AgentRuntimeRunIdentityBase & {
  runId: string
  streamId?: string | null
  jobId?: string | null
  attempt?: number | null
}

export type DesktopRunContext = AgentRuntimeRunContextBase & {
  runtimeId: AgentRuntimeId
  mode: AgentJobMode
  source: "desktop"
  projectId: string
  chatId: string
  subChatId: string
  cwd: string
}

export type DesktopRunProviderBinding = Omit<
  AgentRuntimeProviderReference,
  "authMode" | "diagnostics"
> & {
  model?: string | null
  modelSource?: string | null
  providerProfileId?: string | null
  gatewayEndpoint?: string | null
  authMode?: Exclude<AgentRuntimeProviderAuthMode, "none"> | null
  diagnostics?: AgentRuntimeProviderDiagnostic[]
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

export type DesktopTraceObserver = AgentRuntimeTraceObserver<RunEvent>

export type DesktopRunRequest = AgentRuntimeRunRequestBase<
  DesktopRunIdentity,
  DesktopRunContext,
  DesktopPermissionPolicy,
  DesktopRunProviderBinding
> & {
  mcp: DesktopRunMcpReadiness
  attachments: DesktopRunAttachmentRef[]
  trace: DesktopTraceObserver
  session: {
    resumeSessionId?: string | null
    parentSessionId?: string | null
  }
}

export type DesktopRunResult = AgentRuntimeRunResultBase<
  "succeeded" | "failed" | "canceled" | "interrupted"
> & {
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

export function getDesktopRunRequestedCapabilities(
  permissionPolicy: DesktopPermissionPolicy,
): AgentRuntimeCapabilityId[] {
  return getAgentRunRequiredCapabilityIds({
    mode: permissionPolicy.mode,
    hasScopeContract: permissionPolicy.guarded,
  })
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
    source: "desktop",
    executionProfile: "interactive",
    projectId: preflight.project.id,
    chatId: preflight.chat.id,
    subChatId: preflight.subChat.id,
    cwd: preflight.cwd,
  }
}

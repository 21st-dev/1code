import type {
  AgentJobMode,
  AgentJobSource,
  AgentJobStatus,
} from "../../../shared/agent-jobs"
import type {
  AgentRuntimeCapabilityId,
  AgentRuntimeId,
} from "../../../shared/agent-runtime-capabilities"

export type AgentRuntimeRunIdentityBase = {
  runId?: string | null
  streamId?: string | null
  jobId?: string | null
  attempt?: number | null
}

export type AgentRuntimeExecutionProfile =
  | "batch"
  | "interactive"
  | "policy-grant"

export type AgentRuntimeRunContextBase = {
  runtimeId: AgentRuntimeId
  mode: AgentJobMode
  cwd: string
  source: AgentJobSource
  executionProfile?: AgentRuntimeExecutionProfile
}

export type AgentRuntimeProviderAuthMode =
  | "app-managed"
  | "provider-profile"
  | "runtime-managed"
  | "none"

export type AgentRuntimeProviderDiagnostic = {
  id: string
  status: "ready" | "blocked" | "skipped"
  message?: string
}

export type AgentRuntimeProviderReference = {
  model?: string | null
  modelSource?: string | null
  providerProfileId?: string | null
  gatewayEndpoint?: string | null
  authMode?: AgentRuntimeProviderAuthMode | null
  diagnostics?: AgentRuntimeProviderDiagnostic[]
}

export type AgentRuntimePermissionPolicyKind =
  | "desktop"
  | "headless-batch"
  | "interactive-user"
  | "policy-grant"
  | "fail-closed"

export type AgentRuntimePermissionPolicySummary = {
  kind: AgentRuntimePermissionPolicyKind
  interaction: "visible-user" | "none"
  enforcement: string
  diagnostics: string[]
  grantedScopes?: string[]
  blockedRequirements?: string[]
  failClosedReasons?: string[]
}

export type AgentRuntimeRunRequestBase<
  Identity extends AgentRuntimeRunIdentityBase,
  Context extends AgentRuntimeRunContextBase,
  PermissionPolicy,
  ProviderBinding extends AgentRuntimeProviderReference | null,
> = {
  identity: Identity
  context: Context
  prompt: string
  signal: AbortSignal
  requestedCapabilities: AgentRuntimeCapabilityId[]
  permissionPolicy: PermissionPolicy
  providerBinding: ProviderBinding
}

export type AgentRuntimeTraceObserver<Event = unknown> = {
  emit(event: Event): void
}

export type AgentRuntimePersistedObserver<
  EventType extends string = string,
  EventRecord = unknown,
  HeartbeatRecord = unknown,
> = {
  appendEvent(type: EventType, payload?: unknown): EventRecord
  heartbeat(): HeartbeatRecord
  isCancelRequested(): boolean
}

export type AgentRuntimeRunObserver<Event = unknown> =
  | AgentRuntimeTraceObserver<Event>
  | AgentRuntimePersistedObserver

export type AgentRuntimeRunResultBase<
  Status extends Exclude<AgentJobStatus, "queued" | "running"> =
    Exclude<AgentJobStatus, "queued" | "running">,
> = {
  status?: Status
  exitCode?: number | null
  errorCode?: string | null
  errorMessage?: string | null
  result?: unknown
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

import type { AgentJob, AgentJobEvent } from "../db/schema"
import type {
  AgentJobEventType,
  AgentJobMode,
  AgentJobSource,
  AgentJobStatus,
} from "../../../shared/agent-jobs"
import {
  getAgentRunRequiredCapabilityIds,
  type AgentRuntimeId,
} from "../../../shared/agent-runtime-capabilities"
import type {
  AgentRuntimePermissionPolicySummary,
  AgentRuntimePersistedObserver,
  AgentRuntimeProviderReference,
  AgentRuntimeRunContextBase,
  AgentRuntimeRunIdentityBase,
  AgentRuntimeRunRequestBase,
  AgentRuntimeRunResultBase,
} from "../agent-runtime/run-contract"

export type AgentRuntimeObserver = AgentRuntimePersistedObserver<
  AgentJobEventType,
  AgentJobEvent,
  AgentJob
>

export type AgentRuntimeRunIdentity = AgentRuntimeRunIdentityBase & {
  jobId: string
  attempt?: number | null
}

export type AgentRuntimeRunContext = AgentRuntimeRunContextBase & {
  runtimeId: AgentRuntimeId
  mode: AgentJobMode
  source: AgentJobSource
  projectId?: string | null
  chatId?: string | null
  subChatId?: string | null
  apiConsumerId?: string | null
  apiConsumerRunId?: string | null
  artifactBaseDir?: string | null
  artifactManifestPath?: string | null
}

export type AgentRuntimeRunRequest = AgentRuntimeRunRequestBase<
  AgentRuntimeRunIdentity,
  AgentRuntimeRunContext,
  AgentRuntimePermissionPolicySummary,
  AgentRuntimeProviderReference | null
> & {
  jobId: string
  runtime: AgentRuntimeId
  cwd: string
  mode: AgentJobMode
  source: AgentJobSource
}

export type AgentRuntimeRunResult = AgentRuntimeRunResultBase<
  Exclude<AgentJobStatus, "queued" | "running">
> & {
  status?: Exclude<AgentJobStatus, "queued" | "running">
  exitCode?: number | null
  errorCode?: string | null
  errorMessage?: string | null
  result?: unknown
}

export type CreateAgentRuntimeRunRequestInput = {
  jobId: string
  runtime: AgentRuntimeId
  cwd: string
  mode: AgentJobMode
  source: AgentJobSource
  prompt: string
  signal: AbortSignal
  attempt?: number | null
  projectId?: string | null
  chatId?: string | null
  subChatId?: string | null
  apiConsumerId?: string | null
  apiConsumerRunId?: string | null
  artifactBaseDir?: string | null
  artifactManifestPath?: string | null
}

export function createHeadlessBatchPermissionSummary(input: {
  source: AgentJobSource
}): AgentRuntimePermissionPolicySummary {
  return {
    kind: "headless-batch",
    interaction: "none",
    enforcement: "batch-adapter-capability-gate",
    diagnostics: [
      `${input.source} jobs use the existing batch adapter capability gate; interactive approvals are unavailable.`,
    ],
  }
}

function optionalContext(
  input: CreateAgentRuntimeRunRequestInput,
): Partial<AgentRuntimeRunContext> {
  return {
    ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    ...(input.chatId !== undefined ? { chatId: input.chatId } : {}),
    ...(input.subChatId !== undefined ? { subChatId: input.subChatId } : {}),
    ...(input.apiConsumerId !== undefined
      ? { apiConsumerId: input.apiConsumerId }
      : {}),
    ...(input.apiConsumerRunId !== undefined
      ? { apiConsumerRunId: input.apiConsumerRunId }
      : {}),
    ...(input.artifactBaseDir !== undefined
      ? { artifactBaseDir: input.artifactBaseDir }
      : {}),
    ...(input.artifactManifestPath !== undefined
      ? { artifactManifestPath: input.artifactManifestPath }
      : {}),
  }
}

export function createAgentRuntimeRunRequest(
  input: CreateAgentRuntimeRunRequestInput,
): AgentRuntimeRunRequest {
  return {
    identity: {
      jobId: input.jobId,
      attempt: input.attempt,
    },
    context: {
      runtimeId: input.runtime,
      mode: input.mode,
      cwd: input.cwd,
      source: input.source,
      ...optionalContext(input),
    },
    jobId: input.jobId,
    runtime: input.runtime,
    cwd: input.cwd,
    mode: input.mode,
    source: input.source,
    prompt: input.prompt,
    signal: input.signal,
    requestedCapabilities: getAgentRunRequiredCapabilityIds({
      mode: input.mode,
      hasScopeContract: false,
    }),
    permissionPolicy: createHeadlessBatchPermissionSummary({
      source: input.source,
    }),
    providerBinding: null,
  }
}

export type AgentTaskRunner = (
  request: AgentRuntimeRunRequest,
  observer: AgentRuntimeObserver,
) => Promise<AgentRuntimeRunResult>

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
  AgentRuntimeExecutionProfile,
  AgentRuntimePersistedObserver,
  AgentRuntimeProviderReference,
  AgentRuntimeRunContextBase,
  AgentRuntimeRunIdentityBase,
  AgentRuntimeRunRequestBase,
  AgentRuntimeRunResultBase,
} from "../agent-runtime/run-contract"
import {
  resolveNonDesktopPermissionPolicy,
  type NonDesktopInteractiveRequirement,
  type NonDesktopPolicyGrant,
} from "../agent-runtime/permission-policy"

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
  executionProfile: AgentRuntimeExecutionProfile
  hasScopeContract?: boolean
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
  executionProfile?: AgentRuntimeExecutionProfile
  prompt: string
  signal: AbortSignal
  attempt?: number | null
  hasScopeContract?: boolean
  projectId?: string | null
  chatId?: string | null
  subChatId?: string | null
  apiConsumerId?: string | null
  apiConsumerRunId?: string | null
  artifactBaseDir?: string | null
  artifactManifestPath?: string | null
  hasVisibleUserInteractionChannel?: boolean
  interactiveRequirements?: NonDesktopInteractiveRequirement[]
  policyGrant?: NonDesktopPolicyGrant | null
}

export function createHeadlessBatchPermissionSummary(input: {
  source: AgentJobSource
  mode?: AgentJobMode
}): AgentRuntimePermissionPolicySummary {
  return resolveNonDesktopPermissionPolicy({
    source: input.source,
    mode: input.mode ?? "agent",
  })
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
    ...(input.hasScopeContract !== undefined
      ? { hasScopeContract: input.hasScopeContract }
      : {}),
  }
}

export function createAgentRuntimeRunRequest(
  input: CreateAgentRuntimeRunRequestInput,
): AgentRuntimeRunRequest {
  const executionProfile = input.executionProfile ?? "batch"
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
      executionProfile,
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
      hasScopeContract: input.hasScopeContract ?? false,
    }),
    permissionPolicy: resolveNonDesktopPermissionPolicy({
      source: input.source,
      mode: input.mode,
      executionProfile,
      hasVisibleUserInteractionChannel:
        input.hasVisibleUserInteractionChannel,
      interactiveRequirements: input.interactiveRequirements,
      policyGrant: input.policyGrant,
    }),
    providerBinding: null,
  }
}

export type AgentTaskRunner = (
  request: AgentRuntimeRunRequest,
  observer: AgentRuntimeObserver,
) => Promise<AgentRuntimeRunResult>

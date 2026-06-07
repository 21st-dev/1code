import type { AgentJobMode } from "../../../shared/agent-jobs"
import type { DesktopPermissionPolicy } from "../agent-runtime/permission-policy"
import {
  appendRunEventsToAgentJob,
  createDesktopStreamEventMapper,
  type DesktopStreamEventMapper,
} from "../agent-runtime/stream-event-mapper"
import type { DesktopRunRequest } from "../agent-runtime/desktop-run-request"
import type { RunEvent } from "../agent-runtime/runtime-events"
import {
  createAndRegisterDesktopChatAgentJob,
  completeDesktopChatAgentJobSafely,
  requestCancelDesktopChatAgentJobSafely,
  type DesktopAgentJobHandle,
} from "../desktop-agent-jobs"
import type { AgentJobDatabase } from "../headless/job-store"
import {
  createClaudeDesktopRunRequestFromRuntimeStartup,
  type CreateClaudeDesktopRunRequestFromRuntimeStartupInput,
} from "./desktop-run-request"

export type CreateClaudeAgentSdkDesktopJobDependencies = {
  createAndRegisterDesktopChatAgentJob:
    typeof createAndRegisterDesktopChatAgentJob
  completeDesktopChatAgentJobSafely: typeof completeDesktopChatAgentJobSafely
  requestCancelDesktopChatAgentJobSafely:
    typeof requestCancelDesktopChatAgentJobSafely
  createDesktopStreamEventMapper: typeof createDesktopStreamEventMapper
  appendRunEventsToAgentJob: typeof appendRunEventsToAgentJob
}

export type CreateClaudeAgentSdkDesktopJobInput = {
  db: AgentJobDatabase
  mode: AgentJobMode
  chatId: string
  subChatId: string
  cwd: string
  prompt: string
  runId: string
  cancel: () => void
  permissionPolicy?: DesktopPermissionPolicy | null
  dependencies?: Partial<CreateClaudeAgentSdkDesktopJobDependencies>
}

export type ClaudeAgentSdkDesktopJobSetup = {
  handle: DesktopAgentJobHandle
  jobId: string
  streamEventMapper: DesktopStreamEventMapper
}

export type CreateClaudeAgentSdkDesktopRunStartupInput =
  CreateClaudeAgentSdkDesktopJobInput &
    Omit<
      CreateClaudeDesktopRunRequestFromRuntimeStartupInput,
      "jobId" | "runId" | "mode" | "prompt" | "emitTrace"
    > & {
      emitTrace?: (event: RunEvent) => void
      createDesktopRunRequest?: typeof createClaudeDesktopRunRequestFromRuntimeStartup
    }

export type ClaudeAgentSdkDesktopRunStartup = {
  desktopJob: ClaudeAgentSdkDesktopJobSetup
  desktopRunRequest: DesktopRunRequest
  resumeSessionId?: string | null
}

export type CompleteClaudeAgentSdkDesktopJobAfterRunInput = {
  db: AgentJobDatabase
  jobId: string | null
  chatId: string
  subChatId: string
  abortSignal: AbortSignal
  reachedNaturalFinish: boolean
  sawError: boolean
  dependencies?: Partial<CreateClaudeAgentSdkDesktopJobDependencies>
}

export type RequestCancelClaudeAgentSdkDesktopJobInput = {
  db: AgentJobDatabase
  jobId: string | null
  reachedNaturalFinish: boolean
  sawError: boolean
  dependencies?: Partial<CreateClaudeAgentSdkDesktopJobDependencies>
}

const defaultDependencies: CreateClaudeAgentSdkDesktopJobDependencies = {
  appendRunEventsToAgentJob,
  completeDesktopChatAgentJobSafely,
  createAndRegisterDesktopChatAgentJob,
  createDesktopStreamEventMapper,
  requestCancelDesktopChatAgentJobSafely,
}

function withDefaultDependencies(
  dependencies:
    | Partial<CreateClaudeAgentSdkDesktopJobDependencies>
    | undefined,
): CreateClaudeAgentSdkDesktopJobDependencies {
  return { ...defaultDependencies, ...dependencies }
}

export function createClaudeAgentSdkDesktopJob(
  input: CreateClaudeAgentSdkDesktopJobInput,
): ClaudeAgentSdkDesktopJobSetup {
  const dependencies = withDefaultDependencies(input.dependencies)
  const jobInput: Parameters<typeof createAndRegisterDesktopChatAgentJob>[1] = {
    runtime: "claude-code",
    mode: input.mode,
    chatId: input.chatId,
    subChatId: input.subChatId,
    cwd: input.cwd,
    prompt: input.prompt,
    runId: input.runId,
    cancel: input.cancel,
  }
  if (input.permissionPolicy) {
    jobInput.permissionPolicy = input.permissionPolicy
  }
  const handle = dependencies.createAndRegisterDesktopChatAgentJob(
    input.db,
    jobInput,
  )
  const jobId = handle.job.id

  return {
    handle,
    jobId,
    streamEventMapper: dependencies.createDesktopStreamEventMapper({
      runtimeId: "claude-code",
      runId: input.runId,
      jobId,
    }),
  }
}

export function createClaudeAgentSdkDesktopRunTraceEmitter(input: {
  db: AgentJobDatabase
  dependencies?: Partial<CreateClaudeAgentSdkDesktopJobDependencies>
}): (event: RunEvent) => void {
  const dependencies = withDefaultDependencies(input.dependencies)
  return (event) => {
    dependencies.appendRunEventsToAgentJob(input.db, [event])
  }
}

export function completeClaudeAgentSdkDesktopJobAfterRun(
  input: CompleteClaudeAgentSdkDesktopJobAfterRunInput,
): void {
  if (!input.jobId) return

  const dependencies = withDefaultDependencies(input.dependencies)
  dependencies.completeDesktopChatAgentJobSafely(input.db, {
    jobId: input.jobId,
    runtime: "claude-code",
    aborted: input.abortSignal.aborted,
    reachedNaturalFinish: input.reachedNaturalFinish,
    sawError: input.sawError,
    result: {
      runtime: "claude-code",
      subChatId: input.subChatId,
      chatId: input.chatId,
    },
  })
}

export function requestCancelClaudeAgentSdkDesktopJob(
  input: RequestCancelClaudeAgentSdkDesktopJobInput,
): void {
  const dependencies = withDefaultDependencies(input.dependencies)
  dependencies.requestCancelDesktopChatAgentJobSafely(input.db, {
    jobId: input.jobId,
    sawError: input.sawError,
    reachedNaturalFinish: input.reachedNaturalFinish,
    requestedBy: "desktop-chat",
  })
}

export function createClaudeAgentSdkDesktopRunStartup({
  createDesktopRunRequest = createClaudeDesktopRunRequestFromRuntimeStartup,
  ...input
}: CreateClaudeAgentSdkDesktopRunStartupInput): ClaudeAgentSdkDesktopRunStartup {
  const desktopJob = createClaudeAgentSdkDesktopJob(input)
  const emitTrace =
    input.emitTrace ??
    createClaudeAgentSdkDesktopRunTraceEmitter({
      db: input.db,
      dependencies: input.dependencies,
    })
  const desktopRunRequest = createDesktopRunRequest({
    runId: input.runId,
    streamId: input.streamId,
    jobId: desktopJob.jobId,
    mode: input.mode,
    preflight: input.preflight,
    prompt: input.prompt,
    permissionPolicy: input.permissionPolicy,
    customConfig: input.customConfig,
    requestedModel: input.requestedModel,
    modelSource: input.modelSource,
    selectedProviderProfileId: input.selectedProviderProfileId,
    images: input.images,
    longTextAttachments: input.longTextAttachments,
    signal: input.signal,
    requestedSessionId: input.requestedSessionId,
    existingSessionId: input.existingSessionId,
    emitTrace,
  })

  return {
    desktopJob,
    desktopRunRequest,
    resumeSessionId: desktopRunRequest.session.resumeSessionId,
  }
}

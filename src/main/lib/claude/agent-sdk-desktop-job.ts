import type { AgentJobMode } from "../../../shared/agent-jobs"
import {
  createDesktopStreamEventMapper,
  type DesktopStreamEventMapper,
} from "../agent-runtime/stream-event-mapper"
import type { DesktopRunRequest } from "../agent-runtime/desktop-run-request"
import {
  createAndRegisterDesktopChatAgentJob,
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
  createDesktopStreamEventMapper: typeof createDesktopStreamEventMapper
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
      "jobId" | "runId" | "mode" | "prompt"
    > & {
      createDesktopRunRequest?: typeof createClaudeDesktopRunRequestFromRuntimeStartup
    }

export type ClaudeAgentSdkDesktopRunStartup = {
  desktopJob: ClaudeAgentSdkDesktopJobSetup
  desktopRunRequest: DesktopRunRequest
  resumeSessionId?: string | null
}

const defaultDependencies: CreateClaudeAgentSdkDesktopJobDependencies = {
  createAndRegisterDesktopChatAgentJob,
  createDesktopStreamEventMapper,
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
  const handle = dependencies.createAndRegisterDesktopChatAgentJob(input.db, {
    runtime: "claude-code",
    mode: input.mode,
    chatId: input.chatId,
    subChatId: input.subChatId,
    cwd: input.cwd,
    prompt: input.prompt,
    runId: input.runId,
    cancel: input.cancel,
  })
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

export function createClaudeAgentSdkDesktopRunStartup({
  createDesktopRunRequest = createClaudeDesktopRunRequestFromRuntimeStartup,
  ...input
}: CreateClaudeAgentSdkDesktopRunStartupInput): ClaudeAgentSdkDesktopRunStartup {
  const desktopJob = createClaudeAgentSdkDesktopJob(input)
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
    emitTrace: input.emitTrace,
  })

  return {
    desktopJob,
    desktopRunRequest,
    resumeSessionId: desktopRunRequest.session.resumeSessionId,
  }
}

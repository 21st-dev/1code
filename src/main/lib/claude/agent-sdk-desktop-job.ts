import type { AgentJobMode } from "../../../shared/agent-jobs"
import {
  createDesktopStreamEventMapper,
  type DesktopStreamEventMapper,
} from "../agent-runtime/stream-event-mapper"
import {
  createAndRegisterDesktopChatAgentJob,
  type DesktopAgentJobHandle,
} from "../desktop-agent-jobs"
import type { AgentJobDatabase } from "../headless/job-store"

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

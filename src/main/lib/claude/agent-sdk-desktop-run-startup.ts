import type { AgentJobMode } from "../../../shared/agent-jobs"
import type { DesktopPermissionPolicy } from "../agent-runtime/permission-policy"
import type { DesktopRunRequest } from "../agent-runtime/desktop-run-request"
import type { DesktopRunPreflightResult } from "../agent-runtime/preflight"
import type { AgentJobDatabase } from "../headless/job-store"
import {
  prepareClaudeAgentSdkProviderStartupForDesktopRun,
  type ClaudeAgentSdkProviderStartup,
  type ClaudeAgentSdkConnectionMethod,
} from "./agent-sdk-provider-startup"
import {
  createClaudeAgentSdkDesktopRunStartup,
  type ClaudeAgentSdkDesktopRunStartup,
} from "./agent-sdk-desktop-job"
import type { ClaudeAgentSdkDesktopRunState } from "./agent-sdk-desktop-run-state"
import {
  prepareClaudeAgentSdkRuntimeStartupForDesktopRun,
  type PreparedClaudeAgentSdkRuntimeStartupContext,
} from "./agent-sdk-runtime-startup"
import type { ImageAttachment, LongTextAttachment } from "./chat-input-schema"

export type PrepareClaudeAgentSdkDesktopRunStartupDependencies = {
  prepareProviderStartup: typeof prepareClaudeAgentSdkProviderStartupForDesktopRun
  createDesktopRunStartup: typeof createClaudeAgentSdkDesktopRunStartup
  prepareRuntimeStartup: typeof prepareClaudeAgentSdkRuntimeStartupForDesktopRun
}

export type PrepareClaudeAgentSdkDesktopRunStartupInput = {
  db: AgentJobDatabase
  mode: AgentJobMode
  chatId: string
  subChatId: string
  cwd: string
  prompt: string
  runId: string
  cancel: () => void
  streamId: string
  preflight: DesktopRunPreflightResult
  permissionPolicy: DesktopPermissionPolicy
  requestedModel?: string | null
  modelSource?: string | null
  offlineModeEnabled?: boolean
  enableTasks?: boolean
  images?: ImageAttachment[]
  longTextAttachments?: LongTextAttachment[]
  signal: AbortSignal
  requestedSessionId?: string | null
  existingSessionId?: string | null
  emitPreflightBlocker: Parameters<
    typeof prepareClaudeAgentSdkProviderStartupForDesktopRun
  >[0]["emitPreflightBlocker"]
  desktopRunState: Pick<ClaudeAgentSdkDesktopRunState, "setDesktopJob">
  dependencies?: Partial<PrepareClaudeAgentSdkDesktopRunStartupDependencies>
}

export type PreparedClaudeAgentSdkDesktopRunStartup = {
  desktopRunRequest: DesktopRunRequest
  resumeSessionId?: string | null
  providerStartup: ClaudeAgentSdkProviderStartup
  connectionMethod: ClaudeAgentSdkConnectionMethod
  runtimeStartup: PreparedClaudeAgentSdkRuntimeStartupContext
  isolatedConfigReady: boolean
}

export type PrepareClaudeAgentSdkDesktopRunStartupResult =
  | ({ ok: true } & PreparedClaudeAgentSdkDesktopRunStartup)
  | {
      ok: false
      reason: "provider-startup-blocked"
    }

const defaultDependencies: PrepareClaudeAgentSdkDesktopRunStartupDependencies =
  {
    createDesktopRunStartup: createClaudeAgentSdkDesktopRunStartup,
    prepareProviderStartup: prepareClaudeAgentSdkProviderStartupForDesktopRun,
    prepareRuntimeStartup: prepareClaudeAgentSdkRuntimeStartupForDesktopRun,
  }

function withDefaultDependencies(
  dependencies:
    | Partial<PrepareClaudeAgentSdkDesktopRunStartupDependencies>
    | undefined,
): PrepareClaudeAgentSdkDesktopRunStartupDependencies {
  return { ...defaultDependencies, ...dependencies }
}

export async function prepareClaudeAgentSdkDesktopRunStartup(
  input: PrepareClaudeAgentSdkDesktopRunStartupInput,
): Promise<PrepareClaudeAgentSdkDesktopRunStartupResult> {
  const dependencies = withDefaultDependencies(input.dependencies)
  const providerStartup = await dependencies.prepareProviderStartup({
    modelSource: input.modelSource,
    offlineModeEnabled: input.offlineModeEnabled ?? false,
    emitPreflightBlocker: input.emitPreflightBlocker,
  })
  if (!providerStartup.ok) {
    return {
      ok: false,
      reason: "provider-startup-blocked",
    }
  }

  const {
    selectedProviderProfileId,
    claudeCodeToken,
    finalCustomConfig,
    isUsingOllama,
  } = providerStartup.startup
  const desktopRunStartup: ClaudeAgentSdkDesktopRunStartup =
    dependencies.createDesktopRunStartup({
      db: input.db,
      mode: input.mode,
      chatId: input.chatId,
      subChatId: input.subChatId,
      cwd: input.cwd,
      prompt: input.prompt,
      runId: input.runId,
      cancel: input.cancel,
      streamId: input.streamId,
      preflight: input.preflight,
      permissionPolicy: input.permissionPolicy,
      customConfig: finalCustomConfig,
      requestedModel: input.requestedModel,
      modelSource: input.modelSource,
      selectedProviderProfileId,
      images: input.images,
      longTextAttachments: input.longTextAttachments,
      signal: input.signal,
      requestedSessionId: input.requestedSessionId,
      existingSessionId: input.existingSessionId,
    })
  input.desktopRunState.setDesktopJob({
    jobId: desktopRunStartup.desktopJob.jobId,
    streamEventMapper: desktopRunStartup.desktopJob.streamEventMapper,
  })

  const runtimeStartup = await dependencies.prepareRuntimeStartup({
    chatId: input.chatId,
    subChatId: input.subChatId,
    isUsingOllama,
    customConfig: finalCustomConfig,
    requestedModel: input.requestedModel,
    enableTasks: input.enableTasks ?? true,
    claudeCodeToken,
    logPrefix: `[${input.subChatId}] `,
  })

  return {
    ok: true,
    desktopRunRequest: desktopRunStartup.desktopRunRequest,
    resumeSessionId: desktopRunStartup.resumeSessionId,
    providerStartup: providerStartup.startup,
    connectionMethod: providerStartup.connectionMethod,
    runtimeStartup: runtimeStartup.runtimeStartup,
    isolatedConfigReady: runtimeStartup.isolatedConfigReady,
  }
}

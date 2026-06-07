import type { ValidatedAgentScopeContract } from "../agent-guard"
import type { AgentJobDatabase } from "../headless/job-store"
import type { UIMessageChunk } from "./types"
import type { ClaudeAgentSdkStreamConsumerMutableState } from "./agent-sdk-stream-consumer"
import type { ClaudeAgentSdkDesktopRunState } from "./agent-sdk-desktop-run-state"
import {
  finalizeClaudeAgentSdkUnexpectedErrorWithStreamState,
} from "./agent-sdk-run-finalization"
import {
  finalizeClaudeAgentSdkDesktopRunAfterLifecycle,
} from "./agent-sdk-desktop-run-cleanup"

export type SuperviseClaudeAgentSdkDesktopRunDependencies = {
  finalizeUnexpectedErrorWithStreamState:
    typeof finalizeClaudeAgentSdkUnexpectedErrorWithStreamState
  finalizeAfterLifecycle: typeof finalizeClaudeAgentSdkDesktopRunAfterLifecycle
}

export type SuperviseClaudeAgentSdkDesktopRunInput = {
  run: () => Promise<void>
  chatId: string
  subChatId: string
  abortController: AbortController
  getGuardedContract: () => ValidatedAgentScopeContract | null
  getDb: () => AgentJobDatabase
  desktopRunState: Pick<
    ClaudeAgentSdkDesktopRunState,
    "getDb" | "getJobId" | "reachedNaturalFinish" | "sawError"
  >
  streamState: Pick<ClaudeAgentSdkStreamConsumerMutableState, "chunkCount">
  subId: string
  streamStart: number
  emitError: (error: unknown, context: string) => void
  emit: (chunk: UIMessageChunk) => unknown
  complete: () => void
  dependencies?: Partial<SuperviseClaudeAgentSdkDesktopRunDependencies>
}

const defaultDependencies: SuperviseClaudeAgentSdkDesktopRunDependencies = {
  finalizeAfterLifecycle: finalizeClaudeAgentSdkDesktopRunAfterLifecycle,
  finalizeUnexpectedErrorWithStreamState:
    finalizeClaudeAgentSdkUnexpectedErrorWithStreamState,
}

function withDefaultDependencies(
  dependencies:
    | Partial<SuperviseClaudeAgentSdkDesktopRunDependencies>
    | undefined,
): SuperviseClaudeAgentSdkDesktopRunDependencies {
  return { ...defaultDependencies, ...dependencies }
}

export async function superviseClaudeAgentSdkDesktopRun(
  input: SuperviseClaudeAgentSdkDesktopRunInput,
): Promise<void> {
  const dependencies = withDefaultDependencies(input.dependencies)

  try {
    await input.run()
  } catch (error) {
    dependencies.finalizeUnexpectedErrorWithStreamState({
      error,
      state: input.streamState,
      subId: input.subId,
      streamStart: input.streamStart,
      emitError: input.emitError,
      emit: input.emit,
      complete: input.complete,
    })
  } finally {
    dependencies.finalizeAfterLifecycle({
      chatId: input.chatId,
      subChatId: input.subChatId,
      abortController: input.abortController,
      guardedContract: input.getGuardedContract(),
      getDb: input.getDb,
      desktopRunState: input.desktopRunState,
    })
  }
}

import type { DesktopRunResult } from "../agent-runtime/desktop-run-request"
import {
  runClaudeAgentSdkDesktopAdapterWithPreparedRuntimeQuery,
  type RunClaudeAgentSdkDesktopAdapterWithPreparedRuntimeQueryInput,
} from "./agent-sdk-adapter-runner"
import { completeClaudeAgentSdkRunAfterAdapterWithStreamState } from "./agent-sdk-run-finalization"

export type RunClaudeAgentSdkDesktopRuntimeLifecycleInput =
  RunClaudeAgentSdkDesktopAdapterWithPreparedRuntimeQueryInput & {
    desktopJobSawError: boolean
    streamStart: number
    nowMs?: () => number
  }

export type RunClaudeAgentSdkDesktopRuntimeLifecycleResult =
  | {
      status: "failed"
      phase: "adapter" | "finalization"
      error?: DesktopRunResult["error"]
    }
  | {
      status: "completed"
      reachedNaturalFinish: boolean
    }

export async function runClaudeAgentSdkDesktopRuntimeLifecycle(
  input: RunClaudeAgentSdkDesktopRuntimeLifecycleInput,
): Promise<RunClaudeAgentSdkDesktopRuntimeLifecycleResult> {
  const adapterResult =
    await runClaudeAgentSdkDesktopAdapterWithPreparedRuntimeQuery(input)
  if (adapterResult.status === "failed") {
    return {
      status: "failed",
      phase: "adapter",
      error: adapterResult.error,
    }
  }

  const finalization =
    await completeClaudeAgentSdkRunAfterAdapterWithStreamState({
      db: input.db,
      chatId: input.chatId,
      subChatId: input.subChatId,
      messagesToSave: input.messagesToSave,
      parts: input.parts,
      state: input.streamState,
      historyEnabled: input.historyEnabled,
      cwd: input.cwd,
      aborted: input.abortSignal.aborted,
      desktopJobSawError: input.desktopJobSawError,
      guardedContract: input.guardedContract,
      guardedPreRunStatus: input.guardedPreRunStatus,
      guardEvents: input.guardEvents,
      guardedRunStartedAt: input.guardedRunStartedAt,
      subId: input.subId,
      streamStart: input.streamStart,
      emitError: input.emitError,
      emit: input.emit,
      complete: input.complete,
      getContract: input.getContract,
      deleteContract: input.deleteContract,
      log: input.log,
      nowMs: input.nowMs,
    })
  if (finalization.status === "failed") {
    return {
      status: "failed",
      phase: "finalization",
    }
  }

  return {
    status: "completed",
    reachedNaturalFinish: finalization.reachedNaturalFinish,
  }
}

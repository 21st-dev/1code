import type { DesktopRunResult } from "../agent-runtime/desktop-run-request"
import {
  runClaudeAgentSdkDesktopAdapterWithPreparedRuntimeQuery,
  type RunClaudeAgentSdkDesktopAdapterWithPreparedRuntimeQueryInput,
} from "./agent-sdk-adapter-runner"
import { completeClaudeAgentSdkRunAfterAdapterWithStreamState } from "./agent-sdk-run-finalization"
import {
  prepareClaudeAgentSdkDesktopRuntimeQuery,
  type PrepareClaudeAgentSdkDesktopRuntimeQueryInput,
} from "./agent-sdk-runtime-query"

export type RunClaudeAgentSdkDesktopRuntimeLifecycleInput =
  Omit<
    RunClaudeAgentSdkDesktopAdapterWithPreparedRuntimeQueryInput,
    "runtimeQuery"
  > & {
    runtimeQuery: PrepareClaudeAgentSdkDesktopRuntimeQueryInput
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
  const {
    runtimeQuery: runtimeQueryInput,
    desktopJobSawError,
    streamStart,
    nowMs,
    ...adapterInput
  } = input
  const runtimeQuery =
    await prepareClaudeAgentSdkDesktopRuntimeQuery(runtimeQueryInput)
  const adapterResult =
    await runClaudeAgentSdkDesktopAdapterWithPreparedRuntimeQuery({
      ...adapterInput,
      runtimeQuery,
    })
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
      desktopJobSawError,
      guardedContract: input.guardedContract,
      guardedPreRunStatus: input.guardedPreRunStatus,
      guardEvents: input.guardEvents,
      guardedRunStartedAt: input.guardedRunStartedAt,
      subId: input.subId,
      streamStart,
      emitError: input.emitError,
      emit: input.emit,
      complete: input.complete,
      getContract: input.getContract,
      deleteContract: input.deleteContract,
      log: input.log,
      nowMs,
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

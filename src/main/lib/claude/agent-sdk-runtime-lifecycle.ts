import type { DesktopRunResult } from "../agent-runtime/desktop-run-request"
import type { AgentGuardEvent } from "../../../shared/agent-scope-contracts"
import {
  deleteActiveGuardedContract,
  getActiveGuardedContract,
} from "../agent-guard"
import {
  runClaudeAgentSdkDesktopAdapterWithPreparedRuntimeQuery,
  type RunClaudeAgentSdkDesktopAdapterWithPreparedRuntimeQueryInput,
} from "./agent-sdk-adapter-runner"
import { completeClaudeAgentSdkRunAfterAdapterWithStreamState } from "./agent-sdk-run-finalization"
import {
  prepareClaudeAgentSdkDesktopRuntimeQuery,
  type PrepareClaudeAgentSdkDesktopRuntimeQueryInput,
} from "./agent-sdk-runtime-query"
import {
  createClaudeAgentSdkRuntimeStreamSetup,
  type ClaudeAgentSdkRuntimeStreamSetup,
} from "./agent-sdk-runtime-state"

export type RunClaudeAgentSdkDesktopRuntimeLifecycleInput =
  Omit<
    RunClaudeAgentSdkDesktopAdapterWithPreparedRuntimeQueryInput,
    | "runtimeQuery"
    | "getContract"
    | "deleteContract"
    | "guardEvents"
    | "guardedRunStartedAt"
    | "transform"
    | "parts"
    | "stderrLines"
    | "model"
    | "baseUrl"
    | "prompt"
    | "cwd"
    | "abortSignal"
    | "chatId"
    | "subChatId"
    | "mode"
  > & {
    runtimeQuery: PrepareClaudeAgentSdkDesktopRuntimeQueryInput
    getContract?: RunClaudeAgentSdkDesktopAdapterWithPreparedRuntimeQueryInput[
      "getContract"
    ]
    deleteContract?: RunClaudeAgentSdkDesktopAdapterWithPreparedRuntimeQueryInput[
      "deleteContract"
    ]
    guardEvents?: AgentGuardEvent[]
    guardedRunStartedAt?: string
    runtimeStreamSetup?: ClaudeAgentSdkRuntimeStreamSetup
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
    getContract = getActiveGuardedContract,
    deleteContract = deleteActiveGuardedContract,
    guardEvents,
    guardedRunStartedAt = new Date().toISOString(),
    runtimeStreamSetup,
    ...adapterInput
  } = input
  const { request } = input
  const requestContext = request.context
  const streamSetup =
    runtimeStreamSetup ??
    createClaudeAgentSdkRuntimeStreamSetup({
      historyEnabled: input.historyEnabled,
      isUsingOllama: input.isUsingOllama,
      guardedContract: input.guardedContract,
    })
  input.streamState.metadata = streamSetup.metadata
  const parts = runtimeQueryInput.parts ?? streamSetup.parts
  const stderrLines = runtimeQueryInput.stderrLines ?? streamSetup.stderrLines

  const runtimeQuery =
    await prepareClaudeAgentSdkDesktopRuntimeQuery({
      ...runtimeQueryInput,
      guardEvents: runtimeQueryInput.guardEvents ?? guardEvents,
      parts,
      stderrLines,
    })
  const adapterResult =
    await runClaudeAgentSdkDesktopAdapterWithPreparedRuntimeQuery({
      ...adapterInput,
      request,
      getContract,
      deleteContract,
      runtimeQuery,
      guardEvents: runtimeQuery.guardEvents,
      guardedRunStartedAt,
      model: input.customConfig?.model,
      baseUrl: input.customConfig?.baseUrl,
      prompt: request.prompt,
      cwd: requestContext.cwd,
      abortSignal: request.signal,
      chatId: requestContext.chatId,
      subChatId: requestContext.subChatId,
      mode: requestContext.mode,
      transform: streamSetup.transform,
      parts,
      stderrLines,
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
      chatId: requestContext.chatId,
      subChatId: requestContext.subChatId,
      messagesToSave: input.messagesToSave,
      parts,
      state: input.streamState,
      historyEnabled: input.historyEnabled,
      cwd: requestContext.cwd,
      aborted: request.signal.aborted,
      desktopJobSawError,
      guardedContract: input.guardedContract,
      guardedPreRunStatus: input.guardedPreRunStatus,
      guardEvents: runtimeQuery.guardEvents,
      guardedRunStartedAt,
      subId: input.subId,
      streamStart,
      emitError: input.emitError,
      emit: input.emit,
      complete: input.complete,
      getContract,
      deleteContract,
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

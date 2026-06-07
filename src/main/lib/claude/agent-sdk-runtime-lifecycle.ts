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
import {
  prepareClaudeAgentSdkRuntimePromptForDesktopRun,
  type PrepareClaudeAgentSdkRuntimePromptForDesktopRunInput,
} from "./agent-sdk-prompt"
import {
  prepareClaudeAgentSdkRuntimeStartupDiagnostics,
  type PrepareClaudeAgentSdkRuntimeStartupDiagnosticsInput,
} from "./agent-sdk-runtime-startup"

export type RunClaudeAgentSdkDesktopRuntimeLifecyclePromptInput = Omit<
  PrepareClaudeAgentSdkRuntimePromptForDesktopRunInput,
  "prompt" | "emitError" | "emit" | "complete"
> & {
  prompt?: string
  prepareRuntimePrompt?: typeof prepareClaudeAgentSdkRuntimePromptForDesktopRun
}

export type RunClaudeAgentSdkDesktopRuntimeLifecycleStartupDiagnosticsInput =
  Omit<
    PrepareClaudeAgentSdkRuntimeStartupDiagnosticsInput,
    "isUsingOllama" | "customConfig" | "cwd"
  > & {
    prepareRuntimeStartupDiagnostics?: typeof prepareClaudeAgentSdkRuntimeStartupDiagnostics
  }

export type RunClaudeAgentSdkDesktopRuntimeLifecycleQueryInput = Omit<
  PrepareClaudeAgentSdkDesktopRuntimeQueryInput,
  "prompt" | "isUsingOllama" | "guardedContract" | "emit"
> &
  Partial<
    Pick<
      PrepareClaudeAgentSdkDesktopRuntimeQueryInput,
      "prompt" | "isUsingOllama" | "guardedContract" | "emit"
    >
  >

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
    | "resolvedModel"
  > & {
    runtimeQuery: RunClaudeAgentSdkDesktopRuntimeLifecycleQueryInput
    getContract?: RunClaudeAgentSdkDesktopAdapterWithPreparedRuntimeQueryInput[
      "getContract"
    ]
    deleteContract?: RunClaudeAgentSdkDesktopAdapterWithPreparedRuntimeQueryInput[
      "deleteContract"
    ]
    guardEvents?: AgentGuardEvent[]
    guardedRunStartedAt?: string
    runtimeStreamSetup?: ClaudeAgentSdkRuntimeStreamSetup
    runtimePrompt?: RunClaudeAgentSdkDesktopRuntimeLifecyclePromptInput
    runtimeStartupDiagnostics?: RunClaudeAgentSdkDesktopRuntimeLifecycleStartupDiagnosticsInput
    desktopJobSawError: boolean
    streamStart: number
    nowMs?: () => number
  }

export type RunClaudeAgentSdkDesktopRuntimeLifecycleResult =
  | {
      status: "failed"
      phase: "prompt" | "adapter" | "finalization"
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

  if (input.runtimeStartupDiagnostics) {
    const {
      prepareRuntimeStartupDiagnostics =
        prepareClaudeAgentSdkRuntimeStartupDiagnostics,
      ...diagnosticsInput
    } = input.runtimeStartupDiagnostics
    await prepareRuntimeStartupDiagnostics({
      ...diagnosticsInput,
      isUsingOllama: input.isUsingOllama,
      customConfig: input.customConfig,
      cwd: requestContext.cwd,
    })
  }

  const {
    prepareRuntimePrompt = prepareClaudeAgentSdkRuntimePromptForDesktopRun,
    prompt: runtimePromptText = request.prompt,
    ...runtimePromptInput
  } = input.runtimePrompt ?? { images: [] }

  let prompt = runtimeQueryInput.prompt
  if (!prompt) {
    const promptResult = await prepareRuntimePrompt({
      ...runtimePromptInput,
      prompt: runtimePromptText,
      emitError: input.emitError,
      emit: input.emit,
      complete: input.complete,
    })
    if (!promptResult.ok) {
      return {
        status: "failed",
        phase: "prompt",
        error: { message: promptResult.reason },
      }
    }
    prompt = promptResult.prompt
  }

  const runtimeQuery =
    await prepareClaudeAgentSdkDesktopRuntimeQuery({
      ...runtimeQueryInput,
      prompt,
      isUsingOllama: runtimeQueryInput.isUsingOllama ?? input.isUsingOllama,
      guardedContract:
        runtimeQueryInput.guardedContract ?? input.guardedContract,
      emit: runtimeQueryInput.emit ?? input.emit,
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
      resolvedModel: runtimeQueryInput.resolvedModel,
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

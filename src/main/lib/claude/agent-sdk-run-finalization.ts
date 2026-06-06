import { flushClaudeAgentSdkTextAccumulator } from "./agent-sdk-chunk-processor"
import {
  finalizeClaudeAgentSdkGuardMetadata,
  type FinalizeClaudeAgentSdkGuardMetadataInput,
} from "./agent-sdk-guard-metadata"
import { persistClaudeAgentSdkAssistantResponse } from "./agent-sdk-message-persistence"
import type { ClaudeAgentSdkStreamConsumerMutableState } from "./agent-sdk-stream-consumer"
import type { UIMessageChunk } from "./types"

export type CompleteClaudeAgentSdkRunAfterAdapterInput = {
  db: any
  chatId: string
  subChatId: string
  messagesToSave: any[]
  parts: Array<Record<string, any>>
  metadata: any
  currentText: string
  historyEnabled: boolean
  cwd: string
  messageCount: number
  aborted: boolean
  desktopJobSawError: boolean
  guardedContract: FinalizeClaudeAgentSdkGuardMetadataInput["guardedContract"]
  guardedPreRunStatus: FinalizeClaudeAgentSdkGuardMetadataInput["guardedPreRunStatus"]
  guardEvents: FinalizeClaudeAgentSdkGuardMetadataInput["guardEvents"]
  guardedRunStartedAt: string
  subId: string
  chunkCount: number
  lastChunkType: string
  pendingFinishChunk: UIMessageChunk | null
  streamStart: number
  emitError: (error: unknown, context: string) => void
  emit: (chunk: UIMessageChunk) => void
  complete: () => void
  getContract: FinalizeClaudeAgentSdkGuardMetadataInput["getContract"]
  deleteContract: FinalizeClaudeAgentSdkGuardMetadataInput["deleteContract"]
  log?: (...args: any[]) => void
  nowMs?: () => number
}

export type CompleteClaudeAgentSdkRunAfterAdapterResult = {
  status: "completed" | "failed"
  currentText: string
  metadata: any
  reachedNaturalFinish: boolean
}

export type CompleteClaudeAgentSdkRunAfterAdapterWithStreamStateInput = Omit<
  CompleteClaudeAgentSdkRunAfterAdapterInput,
  | "metadata"
  | "currentText"
  | "messageCount"
  | "chunkCount"
  | "lastChunkType"
  | "pendingFinishChunk"
> & {
  state: ClaudeAgentSdkStreamConsumerMutableState
}

export type FinalizeClaudeAgentSdkUnexpectedErrorInput = {
  error: unknown
  subId: string
  chunkCount: number
  streamStart: number
  emitError: (error: unknown, context: string) => void
  emit: (chunk: UIMessageChunk) => unknown
  complete: () => void
  log?: (...args: any[]) => void
  nowMs?: () => number
}

export type FinalizeClaudeAgentSdkUnexpectedErrorWithStreamStateInput = Omit<
  FinalizeClaudeAgentSdkUnexpectedErrorInput,
  "chunkCount"
> & {
  state: Pick<ClaudeAgentSdkStreamConsumerMutableState, "chunkCount">
}

export function finalizeClaudeAgentSdkUnexpectedError({
  error,
  subId,
  chunkCount,
  streamStart,
  emitError,
  emit,
  complete,
  log = console.log,
  nowMs = Date.now,
}: FinalizeClaudeAgentSdkUnexpectedErrorInput): void {
  const duration = ((nowMs() - streamStart) / 1000).toFixed(1)
  log(
    `[SD] M:END sub=${subId} reason=unexpected_error n=${chunkCount} t=${duration}s`,
  )
  emitError(error, "Unexpected error")
  emit({ type: "finish" })
  complete()
}

export function finalizeClaudeAgentSdkUnexpectedErrorWithStreamState({
  state,
  ...input
}: FinalizeClaudeAgentSdkUnexpectedErrorWithStreamStateInput): void {
  finalizeClaudeAgentSdkUnexpectedError({
    ...input,
    chunkCount: state.chunkCount,
  })
}

export async function completeClaudeAgentSdkRunAfterAdapter({
  db,
  chatId,
  subChatId,
  messagesToSave,
  parts,
  metadata,
  currentText,
  historyEnabled,
  cwd,
  messageCount,
  aborted,
  desktopJobSawError,
  guardedContract,
  guardedPreRunStatus,
  guardEvents,
  guardedRunStartedAt,
  subId,
  chunkCount,
  lastChunkType,
  pendingFinishChunk,
  streamStart,
  emitError,
  emit,
  complete,
  getContract,
  deleteContract,
  log = console.log,
  nowMs = Date.now,
}: CompleteClaudeAgentSdkRunAfterAdapterInput): Promise<CompleteClaudeAgentSdkRunAfterAdapterResult> {
  if (messageCount === 0 && !aborted) {
    emitError(
      new Error("No response received from Claude"),
      "Empty response",
    )
    log(`[SD] M:END sub=${subId} reason=no_response n=${chunkCount}`)
    emit({ type: "finish" })
    complete()
    return {
      status: "failed",
      currentText,
      metadata,
      reachedNaturalFinish: false,
    }
  }

  log(`[SD] M:SAVE sub=${subId} aborted=${aborted} parts=${parts.length}`)

  const flushedCurrentText = flushClaudeAgentSdkTextAccumulator({
    currentText,
    parts,
  })

  const finalizedMetadata = await finalizeClaudeAgentSdkGuardMetadata({
    currentMetadata: metadata,
    guardedContract,
    guardedPreRunStatus,
    runtimeCwd: cwd,
    guardEvents,
    startedAt: guardedRunStartedAt,
    options: {
      stopped: aborted,
    },
    emit,
    getContract,
    deleteContract,
  })

  await persistClaudeAgentSdkAssistantResponse({
    db,
    chatId,
    subChatId,
    messagesToSave,
    parts,
    metadata: finalizedMetadata,
    historyEnabled,
    cwd,
  })

  const duration = ((nowMs() - streamStart) / 1000).toFixed(1)
  log(
    `[SD] M:END sub=${subId} reason=ok n=${chunkCount} last=${lastChunkType} t=${duration}s`,
  )
  const reachedNaturalFinish = !aborted && !desktopJobSawError
  emit(pendingFinishChunk ?? { type: "finish" })
  complete()

  return {
    status: "completed",
    currentText: flushedCurrentText,
    metadata: finalizedMetadata,
    reachedNaturalFinish,
  }
}

export async function completeClaudeAgentSdkRunAfterAdapterWithStreamState({
  state,
  ...input
}: CompleteClaudeAgentSdkRunAfterAdapterWithStreamStateInput): Promise<CompleteClaudeAgentSdkRunAfterAdapterResult> {
  const finalization = await completeClaudeAgentSdkRunAfterAdapter({
    ...input,
    metadata: state.metadata,
    currentText: state.currentText,
    messageCount: state.messageCount,
    chunkCount: state.chunkCount,
    lastChunkType: state.lastChunkType,
    pendingFinishChunk: state.pendingFinishChunk,
  })
  state.currentText = finalization.currentText
  state.metadata = finalization.metadata
  return finalization
}

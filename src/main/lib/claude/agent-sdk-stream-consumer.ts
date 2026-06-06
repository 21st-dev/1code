import type { FinalizeClaudeAgentSdkGuardMetadataInput } from "./agent-sdk-guard-metadata"
import {
  createClaudeAgentSdkEmbeddedErrorContext,
  handleClaudeAgentSdkEmbeddedErrorMessage,
} from "./agent-sdk-embedded-error-finalization"
import { finalizeClaudeAgentSdkStreamError } from "./agent-sdk-stream-error-finalization"
import {
  completeClaudeAgentSdkStreamIteration,
  startClaudeAgentSdkStreamIteration,
} from "./agent-sdk-stream-lifecycle"
import { recordClaudeAgentSdkIncomingMessage } from "./agent-sdk-stream-message"
import {
  createClaudeAgentSdkStreamProcessingState,
  processClaudeAgentSdkStreamMessage,
  syncClaudeAgentSdkStreamProcessingState,
} from "./agent-sdk-stream-processor"
import {
  shouldStopClaudeAgentSdkStreamForAbort,
  shouldStopClaudeAgentSdkStreamForClosedObserver,
} from "./agent-sdk-stream-control"
import type { ClaudeAgentSdkStreamConsumer } from "./agent-sdk-adapter"
import type { ClaudeAgentSdkPolicyRetryState } from "./agent-sdk-policy-retry"
import type { ClaudeAgentSdkTransformer } from "./agent-sdk-transformed-chunks"
import type { UIMessageChunk } from "./types"

export type ClaudeAgentSdkStreamConsumerStateAccess = {
  getMetadata: () => any
  setMetadata: (metadata: any) => void
  getCurrentSessionId: () => string | null
  setCurrentSessionId: (currentSessionId: string | null) => void
  getCurrentText: () => string
  setCurrentText: (currentText: string) => void
  getPendingFinishChunk: () => UIMessageChunk | null
  setPendingFinishChunk: (pendingFinishChunk: UIMessageChunk | null) => void
  getChunkCount: () => number
  setChunkCount: (chunkCount: number) => void
  getLastChunkType: () => string
  setLastChunkType: (lastChunkType: string) => void
  getMessageCount: () => number
  setMessageCount: (messageCount: number) => void
}

export type CreateClaudeAgentSdkStreamConsumerInput = {
  isUsingOllama: boolean
  model?: string | null
  baseUrl?: string | null
  prompt: string
  cwd: string
  abortSignal: AbortSignal
  isObservableActive: () => boolean
  chatId: string
  subChatId: string
  policyRetry: ClaudeAgentSdkPolicyRetryState
  customConfig?: { model?: string | null; baseUrl?: string | null } | null
  hasExistingApiConfig: boolean
  mode: string
  resolvedModel?: string | null
  oauthToken?: string | null
  mcpServers?: Record<string, unknown> | null
  transform: ClaudeAgentSdkTransformer
  parts: Array<Record<string, any>>
  historyEnabled: boolean
  subId: string
  stderrLines: string[]
  db: any
  messagesToSave: any[]
  guardedContract: FinalizeClaudeAgentSdkGuardMetadataInput["guardedContract"]
  guardedPreRunStatus: FinalizeClaudeAgentSdkGuardMetadataInput["guardedPreRunStatus"]
  guardEvents: FinalizeClaudeAgentSdkGuardMetadataInput["guardEvents"]
  guardedRunStartedAt: string
  emit: (chunk: UIMessageChunk) => boolean
  complete: () => void
  getContract: FinalizeClaudeAgentSdkGuardMetadataInput["getContract"]
  deleteContract: FinalizeClaudeAgentSdkGuardMetadataInput["deleteContract"]
  state: ClaudeAgentSdkStreamConsumerStateAccess
}

export function createClaudeAgentSdkStreamConsumer({
  isUsingOllama,
  model,
  baseUrl,
  prompt,
  cwd,
  abortSignal,
  isObservableActive,
  chatId,
  subChatId,
  policyRetry,
  customConfig,
  hasExistingApiConfig,
  mode,
  resolvedModel,
  oauthToken,
  mcpServers,
  transform,
  parts,
  historyEnabled,
  subId,
  stderrLines,
  db,
  messagesToSave,
  guardedContract,
  guardedPreRunStatus,
  guardEvents,
  guardedRunStartedAt,
  emit,
  complete,
  getContract,
  deleteContract,
  state,
}: CreateClaudeAgentSdkStreamConsumerInput): ClaudeAgentSdkStreamConsumer {
  return async ({ stream }) => {
    const streamIteration = startClaudeAgentSdkStreamIteration({
      isUsingOllama,
      model,
      baseUrl,
      prompt,
      cwd,
    })
    let streamProcessing = createClaudeAgentSdkStreamProcessingState({
      metadata: state.getMetadata(),
      currentSessionId: state.getCurrentSessionId(),
      currentText: state.getCurrentText(),
      pendingFinishChunk: state.getPendingFinishChunk(),
      chunkCount: state.getChunkCount(),
      lastChunkType: state.getLastChunkType(),
    })

    try {
      for await (const msg of stream) {
        if (
          shouldStopClaudeAgentSdkStreamForAbort({
            signal: abortSignal,
            isUsingOllama,
          })
        ) {
          break
        }

        state.setMessageCount(
          recordClaudeAgentSdkIncomingMessage({
            chatId,
            state: streamIteration,
            message: msg,
            isUsingOllama,
          }).messageCount,
        )

        const embeddedError = handleClaudeAgentSdkEmbeddedErrorMessage({
          message: msg,
          policyRetry,
          ...createClaudeAgentSdkEmbeddedErrorContext({
            customConfig,
            hasExistingApiConfig,
            aborted: abortSignal.aborted,
            subChatId,
            chatId,
            cwd,
            mode,
            isUsingOllama,
            model: resolvedModel,
            oauthToken,
            mcpServers,
          }),
          subId,
          chunkCount: state.getChunkCount(),
          emit,
          complete,
        })
        if (embeddedError.status === "retry") {
          break
        }
        if (embeddedError.status === "failed") {
          return {
            status: "failed" as const,
            error: embeddedError.error,
          }
        }

        streamProcessing = processClaudeAgentSdkStreamMessage({
          message: msg,
          transform,
          state: streamProcessing,
          parts,
          historyEnabled,
          aborted: abortSignal.aborted,
          mode,
          subId,
          subChatId,
          emit,
        })
        syncClaudeAgentSdkStreamProcessingState(streamProcessing, {
          setMetadata: state.setMetadata,
          setCurrentSessionId: state.setCurrentSessionId,
          setCurrentText: state.setCurrentText,
          setPendingFinishChunk: state.setPendingFinishChunk,
          setChunkCount: state.setChunkCount,
          setLastChunkType: state.setLastChunkType,
        })
        if (
          streamProcessing.emitClosed ||
          shouldStopClaudeAgentSdkStreamForClosedObserver({
            isActive: isObservableActive(),
            subId,
          })
        ) {
          break
        }
      }

      state.setMessageCount(
        completeClaudeAgentSdkStreamIteration({
          state: streamIteration,
          isUsingOllama,
          chunkCount: state.getChunkCount(),
          model,
        }).messageCount,
      )
    } catch (streamError) {
      const streamFailure = await finalizeClaudeAgentSdkStreamError({
        streamError,
        stderrLines,
        isUsingOllama,
        messageCount: state.getMessageCount(),
        db,
        chatId,
        subChatId,
        messagesToSave,
        parts,
        metadata: state.getMetadata(),
        currentText: state.getCurrentText(),
        historyEnabled,
        cwd,
        mode,
        aborted: abortSignal.aborted,
        guardedContract,
        guardedPreRunStatus,
        guardEvents,
        guardedRunStartedAt,
        subId,
        chunkCount: state.getChunkCount(),
        lastChunkType: state.getLastChunkType(),
        emit,
        complete,
        getContract,
        deleteContract,
      })
      state.setCurrentText(streamFailure.currentText)
      state.setMetadata(streamFailure.metadata)
      return {
        status: "failed" as const,
        error: streamFailure.error,
      }
    }

    return {
      status: "succeeded" as const,
      sessionId: state.getMetadata().sessionId,
    }
  }
}

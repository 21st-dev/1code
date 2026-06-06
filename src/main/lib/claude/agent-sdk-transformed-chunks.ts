import {
  processClaudeAgentSdkUiChunk,
  type ClaudeAgentSdkChunkProcessorState,
  type ClaudeAgentSdkFileChangeNotification,
} from "./agent-sdk-chunk-processor"
import { notifyClaudeAgentSdkFileChanged } from "./agent-sdk-file-change-notification"
import type { UIMessageChunk } from "./types"

export type ClaudeAgentSdkTransformer = (
  message: any,
) => Iterable<UIMessageChunk>

export type ClaudeAgentSdkTransformedChunkState =
  ClaudeAgentSdkChunkProcessorState & {
    chunkCount: number
    lastChunkType: string
  }

export type ProcessClaudeAgentSdkTransformedChunksInput = {
  message: any
  transform: ClaudeAgentSdkTransformer
  state: ClaudeAgentSdkTransformedChunkState
  parts: Array<Record<string, any>>
  mode: string
  subId: string
  subChatId: string
  emit: (chunk: UIMessageChunk) => boolean
  notifyFileChanged?: (event: ClaudeAgentSdkFileChangeNotification) => void
}

export type ProcessClaudeAgentSdkTransformedChunksResult =
  ClaudeAgentSdkTransformedChunkState & {
    emitClosed: boolean
  }

export function processClaudeAgentSdkTransformedChunks({
  message,
  transform,
  state,
  parts,
  mode,
  subId,
  subChatId,
  emit,
  notifyFileChanged = notifyClaudeAgentSdkFileChanged,
}: ProcessClaudeAgentSdkTransformedChunksInput): ProcessClaudeAgentSdkTransformedChunksResult {
  let metadata = state.metadata
  let currentText = state.currentText
  let pendingFinishChunk = state.pendingFinishChunk
  let exitPlanModeToolCallId = state.exitPlanModeToolCallId
  let chunkCount = state.chunkCount
  let lastChunkType = state.lastChunkType

  for (const chunk of transform(message)) {
    chunkCount++
    lastChunkType = chunk.type

    const processedChunk = processClaudeAgentSdkUiChunk({
      chunk,
      state: {
        metadata,
        currentText,
        pendingFinishChunk,
        exitPlanModeToolCallId,
      },
      parts,
      mode,
      subId,
      subChatId,
      chunkCount,
      emit,
      notifyFileChanged,
    })
    metadata = processedChunk.metadata
    currentText = processedChunk.currentText
    pendingFinishChunk = processedChunk.pendingFinishChunk
    exitPlanModeToolCallId = processedChunk.exitPlanModeToolCallId

    if (processedChunk.emitClosed) {
      return {
        metadata,
        currentText,
        pendingFinishChunk,
        exitPlanModeToolCallId,
        chunkCount,
        lastChunkType,
        emitClosed: true,
      }
    }
  }

  return {
    metadata,
    currentText,
    pendingFinishChunk,
    exitPlanModeToolCallId,
    chunkCount,
    lastChunkType,
    emitClosed: false,
  }
}

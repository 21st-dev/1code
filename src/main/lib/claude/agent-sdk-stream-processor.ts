import {
  trackClaudeAgentSdkMessageMetadata,
  type ClaudeAgentSdkMessageMetadataState,
} from "./agent-sdk-message-metadata"
import {
  processClaudeAgentSdkTransformedChunks,
  type ClaudeAgentSdkTransformer,
  type ClaudeAgentSdkTransformedChunkState,
} from "./agent-sdk-transformed-chunks"

export type ClaudeAgentSdkStreamProcessingState =
  ClaudeAgentSdkMessageMetadataState &
    ClaudeAgentSdkTransformedChunkState & {
      emitClosed: boolean
    }

export function createClaudeAgentSdkStreamProcessingState(input: {
  metadata: ClaudeAgentSdkStreamProcessingState["metadata"]
  currentSessionId: string | null
  currentText: string
  pendingFinishChunk: ClaudeAgentSdkStreamProcessingState["pendingFinishChunk"]
  chunkCount: number
  lastChunkType: string
  lastAssistantUuid?: string | null
  exitPlanModeToolCallId?: string | null
}): ClaudeAgentSdkStreamProcessingState {
  return {
    metadata: input.metadata,
    currentSessionId: input.currentSessionId,
    currentText: input.currentText,
    pendingFinishChunk: input.pendingFinishChunk,
    chunkCount: input.chunkCount,
    lastChunkType: input.lastChunkType,
    lastAssistantUuid: input.lastAssistantUuid ?? null,
    exitPlanModeToolCallId: input.exitPlanModeToolCallId ?? null,
    emitClosed: false,
  }
}

export function processClaudeAgentSdkStreamMessage(input: {
  message: any
  transform: ClaudeAgentSdkTransformer
  state: ClaudeAgentSdkStreamProcessingState
  parts: Array<Record<string, any>>
  historyEnabled: boolean
  aborted: boolean
  mode: string
  subId: string
  subChatId: string
  emit: Parameters<typeof processClaudeAgentSdkTransformedChunks>[0]["emit"]
}): ClaudeAgentSdkStreamProcessingState {
  const metadataState = trackClaudeAgentSdkMessageMetadata({
    message: input.message,
    state: {
      metadata: input.state.metadata,
      currentSessionId: input.state.currentSessionId,
      lastAssistantUuid: input.state.lastAssistantUuid,
    },
    historyEnabled: input.historyEnabled,
    aborted: input.aborted,
  })

  const chunkState = processClaudeAgentSdkTransformedChunks({
    message: input.message,
    transform: input.transform,
    state: {
      metadata: metadataState.metadata,
      currentText: input.state.currentText,
      pendingFinishChunk: input.state.pendingFinishChunk,
      exitPlanModeToolCallId: input.state.exitPlanModeToolCallId,
      chunkCount: input.state.chunkCount,
      lastChunkType: input.state.lastChunkType,
    },
    parts: input.parts,
    mode: input.mode,
    subId: input.subId,
    subChatId: input.subChatId,
    emit: input.emit,
  })

  return {
    ...chunkState,
    currentSessionId: metadataState.currentSessionId,
    lastAssistantUuid: metadataState.lastAssistantUuid,
  }
}

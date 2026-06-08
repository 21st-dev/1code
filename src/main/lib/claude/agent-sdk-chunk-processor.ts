import type { MessageMetadata, UIMessageChunk } from "./types"

export type ClaudeAgentSdkChunkProcessorState = {
  metadata: MessageMetadata
  currentText: string
  pendingFinishChunk: UIMessageChunk | null
  exitPlanModeToolCallId: string | null
}

export type ClaudeAgentSdkChunkProcessorResult =
  ClaudeAgentSdkChunkProcessorState & {
    emitClosed: boolean
  }

export type ClaudeAgentSdkFileChangeNotification = {
  filePath: string
  type: string
  subChatId: string
}

export function flushClaudeAgentSdkTextAccumulator(input: {
  currentText: string
  parts: Array<Record<string, any>>
}): string {
  if (!input.currentText.trim()) return input.currentText
  input.parts.push({ type: "text", text: input.currentText })
  return ""
}

export function processClaudeAgentSdkUiChunk(input: {
  chunk: UIMessageChunk
  state: ClaudeAgentSdkChunkProcessorState
  parts: Array<Record<string, any>>
  mode: string
  subId: string
  subChatId: string
  chunkCount: number
  emit: (chunk: UIMessageChunk) => boolean
  notifyFileChanged: (event: ClaudeAgentSdkFileChangeNotification) => void
}): ClaudeAgentSdkChunkProcessorResult {
  const { chunk, state, parts } = input
  let metadata = state.metadata
  let currentText = state.currentText
  let pendingFinishChunk = state.pendingFinishChunk
  let exitPlanModeToolCallId = state.exitPlanModeToolCallId

  if (chunk.type === "message-metadata" && metadata.sdkMessageUuid) {
    chunk.messageMetadata = {
      ...chunk.messageMetadata,
      sdkMessageUuid: metadata.sdkMessageUuid,
    }
  }

  if (chunk.type === "finish") {
    return {
      metadata,
      currentText,
      pendingFinishChunk: chunk,
      exitPlanModeToolCallId,
      emitClosed: false,
    }
  }

  if (!input.emit(chunk)) {
    console.log(
      `[SD] M:EMIT_CLOSED sub=${input.subId} type=${chunk.type} n=${input.chunkCount}`,
    )
    return {
      metadata,
      currentText,
      pendingFinishChunk,
      exitPlanModeToolCallId,
      emitClosed: true,
    }
  }

  switch (chunk.type) {
    case "text-delta":
      currentText += chunk.delta
      break
    case "text-end":
      currentText = flushClaudeAgentSdkTextAccumulator({
        currentText,
        parts,
      })
      break
    case "tool-input-available":
      console.log(
        `[SD] M:TOOL_CALL sub=${input.subId} toolName="${chunk.toolName}" mode=${input.mode} callId=${chunk.toolCallId}`,
      )

      if (input.mode === "plan" && chunk.toolName === "ExitPlanMode") {
        console.log(
          `[SD] M:PLAN_TOOL_DETECTED sub=${input.subId} callId=${chunk.toolCallId}`,
        )
        exitPlanModeToolCallId = chunk.toolCallId
      }

      parts.push({
        type: `tool-${chunk.toolName}`,
        toolCallId: chunk.toolCallId,
        toolName: chunk.toolName,
        input: chunk.input,
        state: "call",
        startedAt: Date.now(),
      })
      break
    case "tool-output-available": {
      const toolPart = parts.find(
        (part) =>
          part.type?.startsWith("tool-") &&
          part.toolCallId === chunk.toolCallId,
      )
      if (toolPart) {
        toolPart.result = chunk.output
        toolPart.output = chunk.output
        toolPart.state = "result"

        if (toolPart.type === "tool-Write" || toolPart.type === "tool-Edit") {
          const filePath = toolPart.input?.file_path
          if (filePath) {
            input.notifyFileChanged({
              filePath,
              type: toolPart.type,
              subChatId: input.subChatId,
            })
          }
        }
      }
      break
    }
    case "tool-output-error": {
      const toolPart = parts.find(
        (part) =>
          part.type?.startsWith("tool-") &&
          part.toolCallId === chunk.toolCallId,
      )
      if (toolPart) {
        toolPart.errorText = chunk.errorText
        toolPart.error = chunk.errorText
        toolPart.state = "output-error"
      }
      break
    }
    case "message-metadata":
      metadata = { ...metadata, ...chunk.messageMetadata }
      break
  }

  return {
    metadata,
    currentText,
    pendingFinishChunk,
    exitPlanModeToolCallId,
    emitClosed: false,
  }
}

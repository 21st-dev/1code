import { describe, expect, test } from "bun:test"
import {
  createClaudeAgentSdkStreamProcessingState,
  processClaudeAgentSdkStreamMessage,
} from "../src/main/lib/claude/agent-sdk-stream-processor"
import type { UIMessageChunk } from "../src/main/lib/claude/types"

type StreamProcessingState = ReturnType<
  typeof createClaudeAgentSdkStreamProcessingState
>

function baseState(
  overrides: Partial<StreamProcessingState> = {},
): StreamProcessingState {
  return {
    ...createClaudeAgentSdkStreamProcessingState({
      metadata: {},
      currentSessionId: null,
      currentText: "",
      pendingFinishChunk: null,
      chunkCount: 0,
      lastChunkType: "",
    }),
    ...overrides,
  }
}

function processMessage(input: {
  message: any
  chunks: UIMessageChunk[]
  state?: StreamProcessingState
  historyEnabled?: boolean
  aborted?: boolean
  parts?: Array<Record<string, any>>
  emit?: (chunk: UIMessageChunk) => boolean
}) {
  const emitted: UIMessageChunk[] = []
  const parts = input.parts ?? []
  const state = processClaudeAgentSdkStreamMessage({
    message: input.message,
    transform: () => input.chunks,
    state: input.state ?? baseState(),
    parts,
    historyEnabled: input.historyEnabled ?? true,
    aborted: input.aborted ?? false,
    mode: "plan",
    subId: "sub-1",
    subChatId: "sub-chat-1",
    emit:
      input.emit ??
      ((chunk) => {
        emitted.push(chunk)
        return true
      }),
  })

  return { emitted, parts, state }
}

describe("Claude Agent SDK stream processor", () => {
  test("tracks SDK metadata and transformed chunks in one state owner", () => {
    const first = processMessage({
      message: {
        type: "assistant",
        uuid: "assistant-1",
        session_id: "session-1",
      },
      chunks: [
        { type: "text-delta", id: "text-1", delta: "hello" },
        { type: "text-end", id: "text-1" },
      ],
    })

    expect(first.parts).toEqual([{ type: "text", text: "hello" }])
    expect(first.state).toMatchObject({
      metadata: { sessionId: "session-1" },
      currentSessionId: "session-1",
      lastAssistantUuid: "assistant-1",
      chunkCount: 2,
      lastChunkType: "text-end",
      emitClosed: false,
    })

    const second = processMessage({
      message: { type: "result" },
      chunks: [{ type: "message-metadata", messageMetadata: {} }],
      state: first.state,
      parts: first.parts,
    })

    expect(second.emitted).toEqual([
      {
        type: "message-metadata",
        messageMetadata: { sdkMessageUuid: "assistant-1" },
      },
    ])
    expect(second.state.metadata).toEqual({
      sessionId: "session-1",
      sdkMessageUuid: "assistant-1",
    })
  })

  test("keeps plan tool state inside the processor", () => {
    const { emitted, state } = processMessage({
      message: { type: "assistant" },
      chunks: [
        {
          type: "tool-input-available",
          toolCallId: "tool-1",
          toolName: "ExitPlanMode",
          input: { plan: "ok" },
        },
      ],
    })

    expect(emitted).toEqual([
      {
        type: "tool-input-available",
        toolCallId: "tool-1",
        toolName: "ExitPlanMode",
        input: { plan: "ok" },
      },
    ])
    expect(state.exitPlanModeToolCallId).toBe("tool-1")
    expect(state.emitClosed).toBe(false)
    expect(state.chunkCount).toBe(1)
  })

  test("reports emission closure from transformed chunk processing", () => {
    const emitted: UIMessageChunk[] = []
    const { state } = processMessage({
      message: { type: "assistant" },
      chunks: [{ type: "text-delta", id: "text-1", delta: "hello" }],
      emit: (chunk) => {
        emitted.push(chunk)
        return false
      },
    })

    expect(emitted).toEqual([
      { type: "text-delta", id: "text-1", delta: "hello" },
    ])
    expect(state.emitClosed).toBe(true)
    expect(state.chunkCount).toBe(1)
  })
})

import { describe, expect, test } from "bun:test"
import {
  flushClaudeAgentSdkTextAccumulator,
  processClaudeAgentSdkUiChunk,
  type ClaudeAgentSdkChunkProcessorState,
} from "../src/main/lib/claude/agent-sdk-chunk-processor"
import type { UIMessageChunk } from "../src/main/lib/claude/types"

function baseState(
  overrides: Partial<ClaudeAgentSdkChunkProcessorState> = {},
): ClaudeAgentSdkChunkProcessorState {
  return {
    metadata: {},
    currentText: "",
    pendingFinishChunk: null,
    exitPlanModeToolCallId: null,
    ...overrides,
  }
}

function processChunk(input: {
  chunk: UIMessageChunk
  state?: ClaudeAgentSdkChunkProcessorState
  parts?: Array<Record<string, any>>
  emitted?: UIMessageChunk[]
  notifications?: any[]
  mode?: string
}) {
  const emitted = input.emitted ?? []
  const notifications = input.notifications ?? []
  return processClaudeAgentSdkUiChunk({
    chunk: input.chunk,
    state: input.state ?? baseState(),
    parts: input.parts ?? [],
    mode: input.mode ?? "agent",
    subId: "sub-tail",
    subChatId: "sub-1",
    chunkCount: emitted.length + 1,
    emit: (chunk) => {
      emitted.push(chunk)
      return true
    },
    notifyFileChanged: (event) => {
      notifications.push(event)
    },
  })
}

describe("Claude Agent SDK chunk processor", () => {
  test("flushes accumulated text only when it contains non-whitespace content", () => {
    const parts: Array<Record<string, any>> = []

    expect(
      flushClaudeAgentSdkTextAccumulator({
        currentText: "   ",
        parts,
      }),
    ).toBe("   ")
    expect(parts).toEqual([])

    expect(
      flushClaudeAgentSdkTextAccumulator({
        currentText: "hello",
        parts,
      }),
    ).toBe("")
    expect(parts).toEqual([{ type: "text", text: "hello" }])
  })

  test("defers finish chunks until route persistence can complete", () => {
    const emitted: UIMessageChunk[] = []
    const finishChunk: UIMessageChunk = { type: "finish" }

    const result = processChunk({
      chunk: finishChunk,
      emitted,
    })

    expect(emitted).toEqual([])
    expect(result.pendingFinishChunk).toBe(finishChunk)
    expect(result.emitClosed).toBe(false)
  })

  test("injects SDK UUID into metadata chunks before emitting and merging", () => {
    const emitted: UIMessageChunk[] = []

    const result = processChunk({
      chunk: {
        type: "message-metadata",
        messageMetadata: { sessionId: "session-1" },
      },
      state: baseState({
        metadata: { sdkMessageUuid: "uuid-1" },
      }),
      emitted,
    })

    expect(emitted).toEqual([
      {
        type: "message-metadata",
        messageMetadata: {
          sessionId: "session-1",
          sdkMessageUuid: "uuid-1",
        },
      },
    ])
    expect(result.metadata).toEqual({
      sessionId: "session-1",
      sdkMessageUuid: "uuid-1",
    })
  })

  test("accumulates text and records plan ExitPlanMode tool calls", () => {
    const parts: Array<Record<string, any>> = []
    const emitted: UIMessageChunk[] = []

    const afterText = processChunk({
      chunk: { type: "text-delta", id: "text-1", delta: "hello" },
      parts,
      emitted,
    })
    const afterTextEnd = processChunk({
      chunk: { type: "text-end", id: "text-1" },
      state: afterText,
      parts,
      emitted,
    })
    const afterTool = processChunk({
      chunk: {
        type: "tool-input-available",
        toolCallId: "tool-1",
        toolName: "ExitPlanMode",
        input: { plan: "ok" },
      },
      state: afterTextEnd,
      parts,
      emitted,
      mode: "plan",
    })

    expect(parts).toMatchObject([
      { type: "text", text: "hello" },
      {
        type: "tool-ExitPlanMode",
        toolCallId: "tool-1",
        toolName: "ExitPlanMode",
        input: { plan: "ok" },
        state: "call",
      },
    ])
    expect(afterTool.exitPlanModeToolCallId).toBe("tool-1")
  })

  test("updates tool results and notifies file changes for write-like tools", () => {
    const notifications: any[] = []
    const parts: Array<Record<string, any>> = [
      {
        type: "tool-Write",
        toolCallId: "tool-1",
        input: { file_path: "src/app.ts" },
        state: "call",
      },
    ]

    processChunk({
      chunk: {
        type: "tool-output-available",
        toolCallId: "tool-1",
        output: "wrote file",
      },
      parts,
      notifications,
    })

    expect(parts[0]).toMatchObject({
      state: "result",
      result: "wrote file",
      output: "wrote file",
    })
    expect(notifications).toEqual([
      {
        filePath: "src/app.ts",
        type: "tool-Write",
        subChatId: "sub-1",
      },
    ])
  })

  test("stops before accumulating when the stream observer is closed", () => {
    const emitted: UIMessageChunk[] = []
    const parts: Array<Record<string, any>> = []
    const result = processClaudeAgentSdkUiChunk({
      chunk: { type: "text-delta", id: "text-1", delta: "ignored" },
      state: baseState(),
      parts,
      mode: "agent",
      subId: "sub-tail",
      subChatId: "sub-1",
      chunkCount: 1,
      emit: (chunk) => {
        emitted.push(chunk)
        return false
      },
      notifyFileChanged: () => {},
    })

    expect(result.emitClosed).toBe(true)
    expect(result.currentText).toBe("")
    expect(parts).toEqual([])
  })
})

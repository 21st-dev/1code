import { describe, expect, test } from "bun:test"
import { processClaudeAgentSdkTransformedChunks } from "../src/main/lib/claude/agent-sdk-transformed-chunks"
import type { UIMessageChunk } from "../src/main/lib/claude/types"

type TransformedChunkState =
  Parameters<typeof processClaudeAgentSdkTransformedChunks>[0]["state"]

function baseState(
  overrides: Partial<TransformedChunkState> = {},
): TransformedChunkState {
  return {
    metadata: {},
    currentText: "",
    pendingFinishChunk: null,
    exitPlanModeToolCallId: null,
    chunkCount: 0,
    lastChunkType: "",
    ...overrides,
  }
}

function processChunks(input: {
  chunks: UIMessageChunk[]
  state?: TransformedChunkState
  parts?: Array<Record<string, any>>
  emit?: (chunk: UIMessageChunk) => boolean
  notifications?: unknown[]
}) {
  const notifications = input.notifications ?? []
  const emitted: UIMessageChunk[] = []
  return {
    emitted,
    result: processClaudeAgentSdkTransformedChunks({
      message: { type: "assistant" },
      transform: () => input.chunks,
      state: input.state ?? baseState(),
      parts: input.parts ?? [],
      mode: "agent",
      subId: "sub-1",
      subChatId: "sub-chat-1",
      emit:
        input.emit ??
        ((chunk) => {
          emitted.push(chunk)
          return true
        }),
      notifyFileChanged: (event) => {
        notifications.push(event)
      },
    }),
  }
}

describe("Claude Agent SDK transformed chunks", () => {
  test("processes transformed text chunks and returns updated counters", () => {
    const parts: Array<Record<string, any>> = []
    const { emitted, result } = processChunks({
      chunks: [
        { type: "text-delta", id: "text-1", delta: "hello" },
        { type: "text-end", id: "text-1" },
      ],
      parts,
    })

    expect(emitted).toEqual([
      { type: "text-delta", id: "text-1", delta: "hello" },
      { type: "text-end", id: "text-1" },
    ])
    expect(parts).toEqual([{ type: "text", text: "hello" }])
    expect(result).toMatchObject({
      chunkCount: 2,
      lastChunkType: "text-end",
      currentText: "",
      emitClosed: false,
    })
  })

  test("defers finish chunks and preserves prior state", () => {
    const finishChunk: UIMessageChunk = { type: "finish" }
    const { emitted, result } = processChunks({
      chunks: [finishChunk],
      state: baseState({ chunkCount: 7, lastChunkType: "text-delta" }),
    })

    expect(emitted).toEqual([])
    expect(result.pendingFinishChunk).toBe(finishChunk)
    expect(result.chunkCount).toBe(8)
    expect(result.lastChunkType).toBe("finish")
    expect(result.emitClosed).toBe(false)
  })

  test("stops processing when renderer emission closes", () => {
    const emitted: UIMessageChunk[] = []
    const { result } = processChunks({
      chunks: [
        { type: "text-delta", id: "text-1", delta: "hello" },
        { type: "text-delta", id: "text-1", delta: "ignored" },
      ],
      emit: (chunk) => {
        emitted.push(chunk)
        return false
      },
    })

    expect(emitted).toEqual([
      { type: "text-delta", id: "text-1", delta: "hello" },
    ])
    expect(result).toMatchObject({
      chunkCount: 1,
      lastChunkType: "text-delta",
      currentText: "",
      emitClosed: true,
    })
  })
})

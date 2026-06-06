import { afterEach, describe, expect, mock, test } from "bun:test"
import {
  completeClaudeAgentSdkStreamIteration,
  createClaudeAgentSdkStreamIterationState,
  recordClaudeAgentSdkStreamMessage,
} from "../src/main/lib/claude/agent-sdk-stream-lifecycle"

const originalConsoleLog = console.log
const originalConsoleError = console.error
const originalConsoleWarn = console.warn

function flattenedCalls(fn: unknown): string[] {
  return ((fn as { mock: { calls: unknown[][] } }).mock.calls ?? [])
    .flat()
    .map((item) => String(item))
}

describe("Claude Agent SDK stream lifecycle", () => {
  afterEach(() => {
    console.log = originalConsoleLog
    console.error = originalConsoleError
    console.warn = originalConsoleWarn
  })

  test("records message count, Ollama message logs, first latency, and slow startup warning", () => {
    console.log = mock(() => {}) as typeof console.log
    const warn = mock(() => {})
    const state = createClaudeAgentSdkStreamIterationState(1000)
    const message = {
      type: "stream_event",
      subtype: "content",
      event: {
        type: "content_block_delta",
        delta: { type: "text_delta" },
      },
    }

    expect(
      recordClaudeAgentSdkStreamMessage({
        state,
        message,
        isUsingOllama: true,
        now: () => 7501,
        warn,
      }),
    ).toEqual({
      messageCount: 1,
      timeToFirstMessageMs: 6501,
    })
    expect(
      recordClaudeAgentSdkStreamMessage({
        state,
        message: { type: "assistant" },
        isUsingOllama: true,
        now: () => 9000,
        warn,
      }),
    ).toEqual({ messageCount: 2 })

    const logCalls = flattenedCalls(console.log)
    expect(logCalls).toContain("[Ollama] ===== MESSAGE #1 =====")
    expect(logCalls).toContain("[Ollama] Event: content_block_delta")
    expect(logCalls).toContain("[Ollama] Time to first message: 6501ms")
    expect(logCalls).toContain("[Ollama] ===== MESSAGE #2 =====")
    expect(flattenedCalls(warn)).toContain(
      "[claude] SDK initialization took 6.5s (MCP servers loading?)",
    )
  })

  test("completes an Ollama stream and warns on single-message output", () => {
    console.log = mock(() => {}) as typeof console.log
    console.warn = mock(() => {}) as typeof console.warn
    const state = createClaudeAgentSdkStreamIterationState(2000)

    recordClaudeAgentSdkStreamMessage({
      state,
      message: { type: "assistant" },
      isUsingOllama: false,
      now: () => 2010,
    })

    expect(
      completeClaudeAgentSdkStreamIteration({
        state,
        isUsingOllama: true,
        chunkCount: 3,
        now: () => 2450,
      }),
    ).toEqual({ messageCount: 1, durationMs: 450 })

    const logCalls = flattenedCalls(console.log)
    expect(logCalls).toContain("[Ollama] ===== STREAM COMPLETED =====")
    expect(logCalls).toContain("[Ollama] Total messages: 1")
    expect(logCalls).toContain("[Ollama] Duration: 450ms")
    expect(logCalls).toContain("[Ollama] Chunks emitted: 3")
    expect(flattenedCalls(console.warn)).toContain(
      "[Ollama] Only received 1 message (likely just init). No actual content generated.",
    )
  })

  test("reports empty stream failures and Ollama diagnosis", () => {
    console.log = mock(() => {}) as typeof console.log
    console.error = mock(() => {}) as typeof console.error
    const state = createClaudeAgentSdkStreamIterationState(3000)

    expect(
      completeClaudeAgentSdkStreamIteration({
        state,
        isUsingOllama: true,
        chunkCount: 0,
        model: "qwen",
        now: () => 3300,
      }),
    ).toEqual({ messageCount: 0, durationMs: 300 })

    const errorCalls = flattenedCalls(console.error)
    expect(errorCalls).toContain(
      "[claude] Stream yielded no messages - model not responding",
    )
    expect(errorCalls).toContain("[Ollama] ===== DIAGNOSIS =====")
    expect(errorCalls).toContain(
      "[Ollama] Problem: Stream completed but NO messages received from SDK",
    )
    expect(errorCalls.join("\n")).toContain('"model":"qwen"')
  })
})

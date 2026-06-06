import { afterEach, describe, expect, mock, test } from "bun:test"
import {
  logClaudeOllamaEmptyStreamDiagnosis,
  logClaudeOllamaFirstMessageLatency,
  logClaudeOllamaMessage,
  logClaudeOllamaSingleMessageWarning,
  logClaudeOllamaStreamComplete,
  logClaudeOllamaStreamError,
  logClaudeOllamaStreamStart,
} from "../src/main/lib/claude/agent-sdk-ollama-diagnostics"

const originalConsoleLog = console.log
const originalConsoleError = console.error
const originalConsoleWarn = console.warn

function flattenedCalls(fn: unknown): string[] {
  return ((fn as { mock: { calls: unknown[][] } }).mock.calls ?? [])
    .flat()
    .map((item) => String(item))
}

describe("Claude Agent SDK Ollama diagnostics", () => {
  afterEach(() => {
    console.log = originalConsoleLog
    console.error = originalConsoleError
    console.warn = originalConsoleWarn
  })

  test("logs stream start, message preview, first latency, and completion", () => {
    console.log = mock(() => {}) as typeof console.log

    logClaudeOllamaStreamStart({
      model: "llama3",
      baseUrl: "http://localhost:11434",
      prompt: "hello world",
      cwd: "/repo",
    })
    logClaudeOllamaMessage({
      messageCount: 2,
      message: {
        type: "stream_event",
        subtype: "content",
        event: { type: "content_block_delta", delta: { type: "text_delta" } },
        message: { content: [{ type: "text", text: "hello" }] },
      },
    })
    logClaudeOllamaFirstMessageLatency(42)
    logClaudeOllamaStreamComplete({
      messageCount: 2,
      durationMs: 123,
      chunkCount: 4,
    })

    const calls = flattenedCalls(console.log)
    expect(calls).toContain("[Ollama] ===== STARTING STREAM ITERATION =====")
    expect(calls).toContain("[Ollama] Model: llama3")
    expect(calls).toContain("[Ollama] ===== MESSAGE #2 =====")
    expect(calls).toContain("[Ollama] Event: content_block_delta")
    expect(calls).toContain("[Ollama] Time to first message: 42ms")
    expect(calls).toContain("[Ollama] Chunks emitted: 4")
  })

  test("logs empty stream diagnosis, single-message warning, and stream error", () => {
    console.error = mock(() => {}) as typeof console.error
    console.warn = mock(() => {}) as typeof console.warn

    logClaudeOllamaEmptyStreamDiagnosis("llama3")
    logClaudeOllamaSingleMessageWarning()
    logClaudeOllamaStreamError({
      error: new Error("fetch failed"),
      messageCount: 1,
      stderrOutput: "stderr details",
    })

    const errorCalls = flattenedCalls(console.error)
    const warnCalls = flattenedCalls(console.warn)
    expect(errorCalls).toContain("[Ollama] ===== DIAGNOSIS =====")
    expect(errorCalls).toContain(
      "[Ollama] Problem: Stream completed but NO messages received from SDK",
    )
    expect(errorCalls).toContain("[Ollama] ===== STREAM ERROR =====")
    expect(errorCalls).toContain("[Ollama] Claude binary stderr:")
    expect(errorCalls).toContain("stderr details")
    expect(warnCalls).toContain(
      "[Ollama] Only received 1 message (likely just init). No actual content generated.",
    )
  })
})

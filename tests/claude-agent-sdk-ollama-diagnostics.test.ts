import { afterEach, describe, expect, mock, test } from "bun:test"
import {
  logClaudeOllamaEmptyStreamDiagnosis,
  logClaudeOllamaFirstMessageLatency,
  logClaudeOllamaMessage,
  logClaudeOllamaSdkConfiguration,
  logClaudeOllamaSingleMessageWarning,
  logClaudeOllamaStreamComplete,
  logClaudeOllamaStreamError,
  logClaudeOllamaStreamStart,
  probeClaudeOllamaConnectivity,
} from "../src/main/lib/claude/agent-sdk-ollama-diagnostics"

const originalConsoleLog = console.log
const originalConsoleError = console.error
const originalConsoleWarn = console.warn

function flattenedCalls(fn: unknown): string[] {
  return ((fn as { mock: { calls: unknown[][] } }).mock.calls ?? [])
    .flat()
    .map((item) => String(item))
}

function captureLogger() {
  const calls: any[][] = []
  return {
    calls,
    logger: {
      log: (...args: any[]) => calls.push(["log", ...args]),
      error: (...args: any[]) => calls.push(["error", ...args]),
    },
  }
}

function flattenedCapturedCalls(calls: any[][]): string[] {
  return calls.flat().map((item) => String(item))
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

  test("logs Ollama SDK configuration and session settings", () => {
    console.log = mock(() => {}) as typeof console.log

    logClaudeOllamaSdkConfiguration({
      model: "qwen",
      baseUrl: "http://127.0.0.1:11434",
      cwd: "/repo",
      configDir: "/tmp/claude",
      hasAuthToken: true,
      resumeSessionId: "session-1",
    })

    const calls = (console.log as unknown as { mock: { calls: any[][] } }).mock
      .calls
    expect(calls[0]).toEqual([
      "[Ollama Debug] SDK Configuration:",
      {
        model: "qwen",
        baseUrl: "http://127.0.0.1:11434",
        cwd: "/repo",
        configDir: "/tmp/claude",
        hasAuthToken: true,
      },
    ])
    expect(calls[1]).toEqual([
      "[Ollama Debug] Session settings:",
      {
        resumeSessionId: "session-1",
        mode: "resume",
        note: "Resuming existing session to maintain chat history",
      },
    ])
  })

  test("probes Ollama connectivity and reports model availability", async () => {
    const { calls, logger } = captureLogger()
    const fetched: Array<{ url: string; hasSignal: boolean }> = []

    await probeClaudeOllamaConnectivity({
      baseUrl: "http://127.0.0.1:11434",
      model: "qwen",
      timeoutMs: 10,
      fetchImpl: (async (url, init) => {
        fetched.push({ url, hasSignal: Boolean(init?.signal) })
        return {
          ok: true,
          status: 200,
          json: async () => ({ models: [{ name: "qwen" }] }),
        }
      }) as any,
      logger,
    })

    expect(fetched).toEqual([
      { url: "http://127.0.0.1:11434/api/tags", hasSignal: true },
    ])
    const flatCalls = flattenedCapturedCalls(calls)
    expect(flatCalls).toContain("[Ollama Debug] Testing Ollama connectivity...")
    expect(flatCalls).toContain('[Ollama Debug] ✓ Model "qwen" is available')
  })

  test("probes Ollama connectivity and reports missing models or failures", async () => {
    const missing = captureLogger()
    await probeClaudeOllamaConnectivity({
      baseUrl: "http://127.0.0.1:11434",
      model: "missing-model",
      fetchImpl: (async () => ({
        ok: true,
        status: 200,
        json: async () => ({ models: [{ name: "qwen" }] }),
      })) as any,
      logger: missing.logger,
    })
    expect(flattenedCapturedCalls(missing.calls)).toContain(
      '[Ollama Debug] WARNING: Model "missing-model" not found in Ollama!',
    )

    const failed = captureLogger()
    await probeClaudeOllamaConnectivity({
      baseUrl: "http://127.0.0.1:11434",
      model: "qwen",
      fetchImpl: (async () => ({
        ok: false,
        status: 503,
        json: async () => ({}),
      })) as any,
      logger: failed.logger,
    })
    expect(JSON.stringify(failed.calls)).toContain("Ollama returned error")
    expect(JSON.stringify(failed.calls)).toContain("503")
  })
})

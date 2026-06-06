import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import {
  shouldStopClaudeAgentSdkStreamForAbort,
  shouldStopClaudeAgentSdkStreamForClosedObserver,
} from "../src/main/lib/claude/agent-sdk-stream-control"

let originalConsoleLog: typeof console.log

beforeEach(() => {
  originalConsoleLog = console.log
  console.log = mock(() => {}) as typeof console.log
})

afterEach(() => {
  console.log = originalConsoleLog
})

describe("Claude Agent SDK stream control", () => {
  test("stops on aborted signals and logs Ollama aborts", () => {
    const controller = new AbortController()
    expect(
      shouldStopClaudeAgentSdkStreamForAbort({
        signal: controller.signal,
        isUsingOllama: true,
      }),
    ).toBe(false)

    controller.abort()
    expect(
      shouldStopClaudeAgentSdkStreamForAbort({
        signal: controller.signal,
        isUsingOllama: true,
      }),
    ).toBe(true)
    expect(console.log).toHaveBeenCalledWith("[Ollama] Stream aborted by user")
  })

  test("stops when the observer has closed", () => {
    const log = mock(() => {})

    expect(
      shouldStopClaudeAgentSdkStreamForClosedObserver({
        isActive: true,
        subId: "sub-1",
        log,
      }),
    ).toBe(false)
    expect(log).not.toHaveBeenCalled()

    expect(
      shouldStopClaudeAgentSdkStreamForClosedObserver({
        isActive: false,
        subId: "sub-1",
        log,
      }),
    ).toBe(true)
    expect(log).toHaveBeenCalledWith(
      "[SD] M:OBSERVER_CLOSED_STREAM sub=sub-1",
    )
  })
})

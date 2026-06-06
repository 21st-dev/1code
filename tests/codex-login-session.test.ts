import { beforeEach, describe, expect, test } from "bun:test"
import type { ChildProcess } from "node:child_process"
import {
  cancelCodexLoginSession,
  clearCodexLoginSessions,
  createCodexLoginSession,
  getActiveCodexLoginSession,
  getCodexLoginSession,
  toCodexLoginSessionResponse,
} from "../src/main/lib/codex/login-session"

type FakeChildProcess = ChildProcess & {
  lastSignal: NodeJS.Signals | null
}

function fakeChildProcess(): FakeChildProcess {
  return {
    killed: false,
    lastSignal: null,
    kill(signal?: NodeJS.Signals | number) {
      this.killed = true
      this.lastSignal = typeof signal === "string" ? signal : null
      return true
    },
  } as FakeChildProcess
}

describe("Codex login session", () => {
  beforeEach(() => {
    clearCodexLoginSessions()
  })

  test("stores the active session and maps renderer-safe responses", () => {
    const child = fakeChildProcess()
    const session = createCodexLoginSession({
      id: "login-session-1",
      process: child,
    })
    session.output = "Open this URL"
    session.url = "https://example.com/login"

    expect(getCodexLoginSession("login-session-1")).toBe(session)
    expect(getActiveCodexLoginSession()).toBe(session)
    expect(toCodexLoginSessionResponse(session)).toEqual({
      sessionId: "login-session-1",
      state: "running",
      url: "https://example.com/login",
      output: "Open this URL",
      error: null,
      exitCode: null,
    })
  })

  test("cancels running sessions fail-closed", () => {
    const child = fakeChildProcess()
    const session = createCodexLoginSession({
      id: "login-session-2",
      process: child,
    })

    expect(cancelCodexLoginSession("missing-session")).toEqual({
      success: true,
      found: false,
    })

    const result = cancelCodexLoginSession("login-session-2")

    expect(result).toEqual({
      success: true,
      found: true,
      session: {
        sessionId: "login-session-2",
        state: "cancelled",
        url: null,
        output: "",
        error: null,
        exitCode: null,
      },
    })
    expect(session.state).toBe("cancelled")
    expect(child.killed).toBe(true)
    expect(child.lastSignal).toBe("SIGTERM")
    expect(getActiveCodexLoginSession()).toBeNull()
  })
})

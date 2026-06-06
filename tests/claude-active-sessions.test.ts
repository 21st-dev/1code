import { afterEach, describe, expect, test } from "bun:test"
import {
  abortAllClaudeSessions,
  clearClaudeActiveSessionsForTest,
  deleteActiveClaudeSession,
  deleteActiveClaudeSessionIfController,
  getActiveClaudeSession,
  hasActiveClaudeSession,
  hasActiveClaudeSessions,
  setActiveClaudeSession,
  startActiveClaudeSessionForDesktopRun,
} from "../src/main/lib/claude/active-sessions"

describe("Claude active session owner", () => {
  afterEach(() => {
    clearClaudeActiveSessionsForTest()
  })

  test("tracks active sessions by sub-chat and run id", () => {
    const controller = new AbortController()

    setActiveClaudeSession("sub-1", {
      controller,
      runId: "run-1",
    })

    expect(hasActiveClaudeSession("sub-1")).toBe(true)
    expect(hasActiveClaudeSessions()).toBe(true)
    expect(getActiveClaudeSession("sub-1")).toEqual({
      controller,
      runId: "run-1",
    })
    expect(deleteActiveClaudeSession("sub-1")).toBe(true)
    expect(hasActiveClaudeSessions()).toBe(false)
  })

  test("deletes a session only when cleanup owns its controller", () => {
    const original = new AbortController()
    const replacement = new AbortController()

    setActiveClaudeSession("sub-1", {
      controller: replacement,
      runId: "run-2",
    })

    expect(deleteActiveClaudeSessionIfController("sub-1", original)).toBe(
      false,
    )
    expect(getActiveClaudeSession("sub-1")?.runId).toBe("run-2")
    expect(deleteActiveClaudeSessionIfController("sub-1", replacement)).toBe(
      true,
    )
    expect(hasActiveClaudeSession("sub-1")).toBe(false)
  })

  test("starts desktop sessions with stable stream and run identity", () => {
    const controller = new AbortController()

    const startup = startActiveClaudeSessionForDesktopRun({
      subChatId: "sub-1",
      requestedRunId: "run-requested",
      createId: () => "stream-1",
      createAbortController: () => controller,
    })

    expect(startup).toEqual({
      controller,
      streamId: "stream-1",
      runId: "run-requested",
      previousSessionAborted: false,
    })
    expect(getActiveClaudeSession("sub-1")).toEqual({
      controller,
      runId: "run-requested",
    })
  })

  test("starts desktop sessions by aborting older sessions and falling back to stream id", () => {
    const original = new AbortController()
    const replacement = new AbortController()
    setActiveClaudeSession("sub-1", {
      controller: original,
      runId: "run-old",
    })

    const startup = startActiveClaudeSessionForDesktopRun({
      subChatId: "sub-1",
      createId: () => "stream-new",
      createAbortController: () => replacement,
    })

    expect(original.signal.aborted).toBe(true)
    expect(startup.previousSessionAborted).toBe(true)
    expect(startup.streamId).toBe("stream-new")
    expect(startup.runId).toBe("stream-new")
    expect(getActiveClaudeSession("sub-1")).toEqual({
      controller: replacement,
      runId: "stream-new",
    })
  })

  test("aborts and clears all sessions", () => {
    const controller = new AbortController()
    setActiveClaudeSession("sub-1", {
      controller,
      runId: "run-1",
    })

    abortAllClaudeSessions()

    expect(controller.signal.aborted).toBe(true)
    expect(hasActiveClaudeSessions()).toBe(false)
  })
})

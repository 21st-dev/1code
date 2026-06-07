import { afterEach, describe, expect, test } from "bun:test"
import type { DesktopRunPreflightBlocker } from "../src/main/lib/agent-runtime/preflight"
import {
  clearClaudeActiveSessionsForTest,
  getActiveClaudeSession,
} from "../src/main/lib/claude/active-sessions"
import { createClaudeAgentSdkDesktopRunEnvelope } from "../src/main/lib/claude/agent-sdk-desktop-run-envelope"
import type { UIMessageChunk } from "../src/main/lib/claude/types"

describe("Claude Agent SDK desktop run envelope", () => {
  afterEach(() => {
    clearClaudeActiveSessionsForTest()
  })

  test("starts the active session and wires safe renderer emission", () => {
    const emitted: UIMessageChunk[] = []
    const completed: string[] = []
    const logs: unknown[][] = []

    const envelope = createClaudeAgentSdkDesktopRunEnvelope({
      subChatId: "sub-chat-12345678",
      requestedRunId: "run-1",
      cwd: "/repo",
      mode: "agent",
      createId: () => "stream-1",
      nowMs: () => 1000,
      log: (...args) => logs.push(args),
      emitNext: (chunk) => emitted.push(chunk),
      emitComplete: () => {
        completed.push("complete")
      },
    })

    expect(envelope.streamId).toBe("stream-1")
    expect(envelope.activeRunId).toBe("run-1")
    expect(envelope.subId).toBe("12345678")
    expect(envelope.streamStart).toBe(1000)
    expect(getActiveClaudeSession("sub-chat-12345678")).toMatchObject({
      runId: "run-1",
    })
    expect(logs).toEqual([
      ["[SD] M:START sub=12345678 stream=stream-1 mode=agent"],
    ])

    expect(
      envelope.emit({
        type: "runtime-status",
        ok: false,
        blocker: {
          component: "provider-profile",
          message: "failed with api_key=sk-supersecretvalue123456",
        },
      } as UIMessageChunk),
    ).toBe(true)

    expect(envelope.desktopRunState.sawError()).toBe(true)
    expect(emitted[0]).toMatchObject({
      type: "runtime-status",
      blocker: {
        message: "failed with api_key=<redacted>",
      },
    })
    expect(completed).toEqual([])
  })

  test("emits preflight blockers through the runtime error handler", () => {
    const emitted: UIMessageChunk[] = []
    const completed: string[] = []
    const envelope = createClaudeAgentSdkDesktopRunEnvelope({
      subChatId: "sub-chat-1",
      cwd: "/repo",
      mode: "plan",
      createId: () => "stream-2",
      log: () => {},
      emitNext: (chunk) => emitted.push(chunk),
      emitComplete: () => {
        completed.push("complete")
      },
    })
    const blocker: DesktopRunPreflightBlocker = {
      id: "provider-profile",
      status: "blocked",
      message: "Provider unavailable",
    }

    envelope.emitPreflightBlocker(blocker)

    expect(emitted[0]).toMatchObject({
      type: "error",
      errorText: "Desktop run preflight blocked: Provider unavailable",
    })
    expect(emitted[1]).toEqual({ type: "finish" } as UIMessageChunk)
    expect(completed).toEqual(["complete"])
  })

  test("safe complete ignores already-closed transports", () => {
    const envelope = createClaudeAgentSdkDesktopRunEnvelope({
      subChatId: "sub-chat-1",
      cwd: "/repo",
      mode: "agent",
      createId: () => "stream-3",
      log: () => {},
      emitNext: () => {},
      emitComplete: () => {
        throw new Error("closed")
      },
    })

    expect(() => envelope.complete()).not.toThrow()
  })
})

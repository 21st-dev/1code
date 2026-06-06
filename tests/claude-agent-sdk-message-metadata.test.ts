import { afterEach, describe, expect, mock, test } from "bun:test"
import {
  trackClaudeAgentSdkMessageMetadata,
  type ClaudeAgentSdkMessageMetadataState,
} from "../src/main/lib/claude/agent-sdk-message-metadata"

const originalConsoleLog = console.log

function baseState(
  overrides: Partial<ClaudeAgentSdkMessageMetadataState> = {},
): ClaudeAgentSdkMessageMetadataState {
  return {
    metadata: {},
    currentSessionId: null,
    lastAssistantUuid: null,
    ...overrides,
  }
}

describe("Claude Agent SDK message metadata tracker", () => {
  afterEach(() => {
    console.log = originalConsoleLog
  })

  test("tracks session id from any SDK message", () => {
    const result = trackClaudeAgentSdkMessageMetadata({
      message: { type: "assistant", session_id: "session-1" },
      state: baseState(),
      historyEnabled: true,
      aborted: false,
    })

    expect(result.metadata).toEqual({ sessionId: "session-1" })
    expect(result.currentSessionId).toBe("session-1")
  })

  test("tracks assistant UUID and assigns it on result when history is enabled", () => {
    const assistant = trackClaudeAgentSdkMessageMetadata({
      message: { type: "assistant", uuid: "uuid-1" },
      state: baseState(),
      historyEnabled: true,
      aborted: false,
    })
    const result = trackClaudeAgentSdkMessageMetadata({
      message: { type: "result" },
      state: assistant,
      historyEnabled: true,
      aborted: false,
    })

    expect(assistant.lastAssistantUuid).toBe("uuid-1")
    expect(result.metadata).toEqual({ sdkMessageUuid: "uuid-1" })
  })

  test("does not assign SDK UUID when history is disabled or the run is aborted", () => {
    expect(
      trackClaudeAgentSdkMessageMetadata({
        message: { type: "result" },
        state: baseState({ lastAssistantUuid: "uuid-1" }),
        historyEnabled: false,
        aborted: false,
      }).metadata,
    ).toEqual({})

    expect(
      trackClaudeAgentSdkMessageMetadata({
        message: { type: "result" },
        state: baseState({ lastAssistantUuid: "uuid-1" }),
        historyEnabled: true,
        aborted: true,
      }).metadata,
    ).toEqual({})
  })

  test("logs system messages with runtime diagnostic fields", () => {
    console.log = mock(() => {}) as typeof console.log

    trackClaudeAgentSdkMessageMetadata({
      message: {
        type: "system",
        subtype: "init",
        cwd: "/repo",
        mcp_servers: ["github"],
        tools: ["Read"],
        plugins: ["plugin-a"],
        permissionMode: "bypassPermissions",
      },
      state: baseState(),
      historyEnabled: true,
      aborted: false,
    })

    const calls = (console.log as unknown as { mock: { calls: unknown[][] } })
      .mock.calls
    expect(calls[0][0]).toBe("[SD] SYSTEM message: subtype=init")
    expect(String(calls[0][1])).toContain('"cwd": "/repo"')
    expect(String(calls[0][1])).toContain('"permissionMode": "bypassPermissions"')
  })
})

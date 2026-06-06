import { describe, expect, mock, test } from "bun:test"
import { createClaudeAgentSdkStreamIterationState } from "../src/main/lib/claude/agent-sdk-stream-lifecycle"
import { recordClaudeAgentSdkIncomingMessage } from "../src/main/lib/claude/agent-sdk-stream-message"

describe("Claude Agent SDK stream message", () => {
  test("records stream message count and raw logs the SDK message", () => {
    const state = createClaudeAgentSdkStreamIterationState(1000)
    const rawMessages: Array<{ chatId: string; message: unknown }> = []
    const message = { type: "assistant", session_id: "session-1" }
    const warn = mock(() => {})

    expect(
      recordClaudeAgentSdkIncomingMessage({
        chatId: "chat-1",
        message,
        state,
        isUsingOllama: false,
        now: () => 1200,
        warn,
        logRawMessage: (chatId, loggedMessage) => {
          rawMessages.push({ chatId, message: loggedMessage })
        },
      }),
    ).toEqual({
      messageCount: 1,
      timeToFirstMessageMs: 200,
    })

    expect(state.messageCount).toBe(1)
    expect(rawMessages).toEqual([{ chatId: "chat-1", message }])
    expect(warn).not.toHaveBeenCalled()
  })
})

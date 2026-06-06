import { describe, expect, test } from "bun:test"
import {
  prepareClaudeAgentSdkAssistantPersistence,
  shouldCreateClaudeAgentSdkRollbackStash,
} from "../src/main/lib/claude/agent-sdk-message-persistence"

describe("Claude Agent SDK message persistence", () => {
  test("creates assistant message and appended persisted messages", () => {
    const userMessage = { id: "user-1", role: "user", parts: [] }
    const parts = [{ type: "text", text: "hello" }]
    const metadata = {
      sessionId: "session-1",
      sdkMessageUuid: "sdk-message-1",
    }

    const persistence = prepareClaudeAgentSdkAssistantPersistence({
      messagesToSave: [userMessage],
      parts,
      metadata,
      createId: () => "assistant-1",
      now: () => new Date("2026-06-01T00:00:00.000Z"),
    })

    expect(persistence).toEqual({
      assistantMessage: {
        id: "assistant-1",
        role: "assistant",
        createdAt: "2026-06-01T00:00:00.000Z",
        parts,
        metadata,
      },
      messages: [
        userMessage,
        {
          id: "assistant-1",
          role: "assistant",
          createdAt: "2026-06-01T00:00:00.000Z",
          parts,
          metadata,
        },
      ],
      sessionId: "session-1",
    })
  })

  test("returns existing messages and session when there are no assistant parts", () => {
    const messagesToSave = [{ id: "user-1", role: "user" }]

    expect(
      prepareClaudeAgentSdkAssistantPersistence({
        messagesToSave,
        parts: [],
        metadata: { sessionId: "session-1" },
        createId: () => {
          throw new Error("id should not be created")
        },
      }),
    ).toEqual({
      assistantMessage: null,
      messages: messagesToSave,
      sessionId: "session-1",
    })
  })

  test("requires history, sdk message UUID, and cwd before rollback stash", () => {
    expect(
      shouldCreateClaudeAgentSdkRollbackStash({
        historyEnabled: true,
        metadata: { sdkMessageUuid: "sdk-message-1" },
        cwd: "/repo",
      }),
    ).toBe(true)
    expect(
      shouldCreateClaudeAgentSdkRollbackStash({
        historyEnabled: false,
        metadata: { sdkMessageUuid: "sdk-message-1" },
        cwd: "/repo",
      }),
    ).toBe(false)
    expect(
      shouldCreateClaudeAgentSdkRollbackStash({
        historyEnabled: true,
        metadata: {},
        cwd: "/repo",
      }),
    ).toBe(false)
    expect(
      shouldCreateClaudeAgentSdkRollbackStash({
        historyEnabled: true,
        metadata: { sdkMessageUuid: "sdk-message-1" },
        cwd: null,
      }),
    ).toBe(false)
  })
})

import { describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { chats, projects, subChats } from "../src/main/lib/db/schema"
import {
  persistClaudeAgentSdkAssistantResponse,
  prepareClaudeAgentSdkAssistantPersistence,
  shouldCreateClaudeAgentSdkRollbackStash,
} from "../src/main/lib/claude/agent-sdk-message-persistence"
import { createAgentJobTestDb } from "./helpers/agent-job-test-db"

function seedChat(db: ReturnType<typeof createAgentJobTestDb>) {
  db.insert(projects)
    .values({
      id: "project-1",
      name: "Project",
      path: "/repo",
    })
    .run()
  db.insert(chats)
    .values({
      id: "chat-1",
      projectId: "project-1",
      worktreePath: "/repo",
      updatedAt: new Date("2026-05-31T00:00:00.000Z"),
    })
    .run()
  db.insert(subChats)
    .values({
      id: "sub-1",
      chatId: "chat-1",
      sessionId: "old-session",
      streamId: "stream-1",
      messages: JSON.stringify([{ id: "existing", role: "user" }]),
      updatedAt: new Date("2026-05-31T00:00:00.000Z"),
    })
    .run()
}

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

  test("persists assistant messages, clears stream state, touches chat, and creates rollback stash", async () => {
    const db = createAgentJobTestDb()
    seedChat(db)
    const stashes: Array<{ cwd: string; uuid: string }> = []

    const result = await persistClaudeAgentSdkAssistantResponse({
      db,
      chatId: "chat-1",
      subChatId: "sub-1",
      messagesToSave: [{ id: "user-1", role: "user" }],
      parts: [{ type: "text", text: "hello" }],
      metadata: {
        sessionId: "session-1",
        sdkMessageUuid: "sdk-message-1",
      },
      historyEnabled: true,
      cwd: "/repo",
      createId: () => "assistant-1",
      now: () => new Date("2026-06-01T00:00:00.000Z"),
      createRollbackStashFn: async (cwd, uuid) => {
        stashes.push({ cwd, uuid })
      },
    })

    expect(result.rollbackStashCreated).toBe(true)
    expect(stashes).toEqual([{ cwd: "/repo", uuid: "sdk-message-1" }])

    const subChat = db
      .select()
      .from(subChats)
      .where(eq(subChats.id, "sub-1"))
      .get()
    expect(subChat?.sessionId).toBe("session-1")
    expect(subChat?.streamId).toBeNull()
    expect(JSON.parse(subChat?.messages ?? "[]")).toEqual([
      { id: "user-1", role: "user" },
      {
        id: "assistant-1",
        role: "assistant",
        createdAt: "2026-06-01T00:00:00.000Z",
        parts: [{ type: "text", text: "hello" }],
        metadata: {
          sessionId: "session-1",
          sdkMessageUuid: "sdk-message-1",
        },
      },
    ])
    expect(
      db.select().from(chats).where(eq(chats.id, "chat-1")).get()?.updatedAt,
    ).toEqual(new Date("2026-06-01T00:00:00.000Z"))
  })

  test("clears final empty response streams but preserves stream state for empty error saves", async () => {
    const finalDb = createAgentJobTestDb()
    seedChat(finalDb)

    await persistClaudeAgentSdkAssistantResponse({
      db: finalDb,
      chatId: "chat-1",
      subChatId: "sub-1",
      messagesToSave: [{ id: "user-1", role: "user" }],
      parts: [],
      metadata: { sessionId: "session-1" },
      historyEnabled: false,
      cwd: "/repo",
      now: () => new Date("2026-06-01T00:00:00.000Z"),
    })
    expect(
      finalDb.select().from(subChats).where(eq(subChats.id, "sub-1")).get(),
    ).toMatchObject({
      sessionId: "session-1",
      streamId: null,
    })

    const errorDb = createAgentJobTestDb()
    seedChat(errorDb)
    await persistClaudeAgentSdkAssistantResponse({
      db: errorDb,
      chatId: "chat-1",
      subChatId: "sub-1",
      messagesToSave: [{ id: "user-1", role: "user" }],
      parts: [],
      metadata: { sessionId: "session-1" },
      historyEnabled: false,
      cwd: "/repo",
      clearStreamWhenEmpty: false,
      touchChatWhenEmpty: false,
      now: () => new Date("2026-06-01T00:00:00.000Z"),
    })
    expect(
      errorDb.select().from(subChats).where(eq(subChats.id, "sub-1")).get(),
    ).toMatchObject({
      sessionId: "old-session",
      streamId: "stream-1",
    })
  })
})

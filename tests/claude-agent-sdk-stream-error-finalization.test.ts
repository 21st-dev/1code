import { describe, expect, mock, test } from "bun:test"
import { eq } from "drizzle-orm"
import { chats, projects, subChats } from "../src/main/lib/db/schema"
import { finalizeClaudeAgentSdkStreamError } from "../src/main/lib/claude/agent-sdk-stream-error-finalization"
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

function baseInput(db: ReturnType<typeof createAgentJobTestDb>) {
  return {
    streamError: new Error("process exited with code 1"),
    stderrLines: ["stderr detail"],
    isUsingOllama: false,
    messageCount: 2,
    db,
    chatId: "chat-1",
    subChatId: "sub-1",
    messagesToSave: [{ id: "user-1", role: "user" }],
    parts: [] as Array<Record<string, any>>,
    metadata: { sessionId: "session-1" },
    currentText: "partial answer",
    historyEnabled: false,
    cwd: "/repo",
    mode: "agent",
    aborted: false,
    guardedContract: null,
    guardedPreRunStatus: null,
    guardEvents: [],
    guardedRunStartedAt: "2026-06-01T00:00:00.000Z",
    subId: "sub-1",
    chunkCount: 5,
    lastChunkType: "text-delta",
    emit: mock(() => {}),
    complete: mock(() => {}),
    getContract: () => null,
    deleteContract: () => undefined,
    log: mock(() => {}),
  }
}

describe("Claude Agent SDK stream error finalization", () => {
  test("emits stream diagnostics and persists partial assistant output", async () => {
    const db = createAgentJobTestDb()
    seedChat(db)
    const input = baseInput(db)

    await expect(finalizeClaudeAgentSdkStreamError(input)).resolves.toMatchObject({
      status: "failed",
      currentText: "",
      metadata: { sessionId: "session-1" },
      error: {
        message: "Claude Code process crashed",
        code: "PROCESS_CRASH",
      },
    })

    expect(input.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        errorText:
          "Claude Code process crashed: process exited with code 1\n\nProcess output:\nstderr detail",
        debugInfo: expect.objectContaining({
          category: "PROCESS_CRASH",
          cwd: "/repo",
          mode: "agent",
          stderr: "stderr detail",
        }),
      }),
    )
    expect(input.emit).toHaveBeenCalledWith({ type: "finish" })
    expect(input.complete).toHaveBeenCalledTimes(1)
    expect(input.log).toHaveBeenCalledWith(
      "[SD] M:CATCH_SAVE sub=sub-1 aborted=false parts=0",
    )
    expect(input.log).toHaveBeenCalledWith(
      "[SD] M:END sub=sub-1 reason=stream_error cat=PROCESS_CRASH n=5 last=text-delta",
    )

    const subChat = db
      .select()
      .from(subChats)
      .where(eq(subChats.id, "sub-1"))
      .get()
    expect(subChat?.streamId).toBeNull()
    expect(subChat?.sessionId).toBe("session-1")
    const messages = JSON.parse(subChat?.messages ?? "[]")
    expect(messages[1]).toMatchObject({
      role: "assistant",
      parts: [{ type: "text", text: "partial answer" }],
      metadata: { sessionId: "session-1" },
    })
  })

  test("clears expired session ids before preserving empty error stream state", async () => {
    const db = createAgentJobTestDb()
    seedChat(db)
    const input = {
      ...baseInput(db),
      streamError: new Error("stream ended"),
      stderrLines: ["No conversation found with session ID session-1"],
      parts: [],
      currentText: "",
    }

    await expect(finalizeClaudeAgentSdkStreamError(input)).resolves.toMatchObject({
      status: "failed",
      error: {
        message: "Previous session expired. Please try again.",
        code: "SESSION_EXPIRED",
      },
    })

    expect(input.log).toHaveBeenCalledWith(
      "[claude] Session not found - clearing invalid sessionId from database",
    )
    expect(
      db.select().from(subChats).where(eq(subChats.id, "sub-1")).get(),
    ).toMatchObject({
      sessionId: null,
      streamId: "stream-1",
    })
  })
})

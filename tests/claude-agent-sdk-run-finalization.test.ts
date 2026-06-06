import { describe, expect, mock, test } from "bun:test"
import { eq } from "drizzle-orm"
import { chats, projects, subChats } from "../src/main/lib/db/schema"
import { completeClaudeAgentSdkRunAfterAdapter } from "../src/main/lib/claude/agent-sdk-run-finalization"
import type { UIMessageChunk } from "../src/main/lib/claude/types"
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
    db,
    chatId: "chat-1",
    subChatId: "sub-1",
    messagesToSave: [{ id: "user-1", role: "user" }],
    parts: [] as Array<Record<string, any>>,
    metadata: { sessionId: "session-1" },
    currentText: "",
    historyEnabled: false,
    cwd: "/repo",
    messageCount: 1,
    aborted: false,
    desktopJobSawError: false,
    guardedContract: null,
    guardedPreRunStatus: null,
    guardEvents: [],
    guardedRunStartedAt: "2026-06-01T00:00:00.000Z",
    subId: "sub-1",
    chunkCount: 2,
    lastChunkType: "text-end",
    pendingFinishChunk: null as UIMessageChunk | null,
    streamStart: 1000,
    emitError: mock(() => {}),
    emit: mock(() => {}),
    complete: mock(() => {}),
    getContract: () => null,
    deleteContract: () => undefined,
    log: mock(() => {}),
    nowMs: () => 3500,
  }
}

describe("Claude Agent SDK run finalization", () => {
  test("handles empty responses before persistence", async () => {
    const db = createAgentJobTestDb()
    seedChat(db)
    const input = {
      ...baseInput(db),
      messageCount: 0,
      chunkCount: 0,
    }

    await expect(
      completeClaudeAgentSdkRunAfterAdapter(input),
    ).resolves.toMatchObject({
      status: "failed",
      reachedNaturalFinish: false,
    })

    expect(input.emitError).toHaveBeenCalledTimes(1)
    expect(input.emitError.mock.calls[0][1]).toBe("Empty response")
    expect(input.emit).toHaveBeenCalledWith({ type: "finish" })
    expect(input.complete).toHaveBeenCalledTimes(1)
    expect(input.log).toHaveBeenCalledWith(
      "[SD] M:END sub=sub-1 reason=no_response n=0",
    )
    expect(
      db.select().from(subChats).where(eq(subChats.id, "sub-1")).get(),
    ).toMatchObject({
      streamId: "stream-1",
      sessionId: "old-session",
    })
  })

  test("flushes, persists, and emits the delayed finish chunk after success", async () => {
    const db = createAgentJobTestDb()
    seedChat(db)
    const pendingFinish: UIMessageChunk = {
      type: "finish",
      messageMetadata: { sessionId: "session-1" },
    }
    const input = {
      ...baseInput(db),
      currentText: "final text",
      pendingFinishChunk: pendingFinish,
    }

    await expect(
      completeClaudeAgentSdkRunAfterAdapter(input),
    ).resolves.toMatchObject({
      status: "completed",
      currentText: "",
      metadata: { sessionId: "session-1" },
      reachedNaturalFinish: true,
    })

    const subChat = db
      .select()
      .from(subChats)
      .where(eq(subChats.id, "sub-1"))
      .get()
    expect(subChat?.streamId).toBeNull()
    expect(subChat?.sessionId).toBe("session-1")
    const messages = JSON.parse(subChat?.messages ?? "[]")
    expect(messages).toHaveLength(2)
    expect(messages[1]).toMatchObject({
      role: "assistant",
      parts: [{ type: "text", text: "final text" }],
      metadata: { sessionId: "session-1" },
    })
    expect(input.emit).toHaveBeenCalledWith(pendingFinish)
    expect(input.complete).toHaveBeenCalledTimes(1)
    expect(input.log).toHaveBeenCalledWith(
      "[SD] M:END sub=sub-1 reason=ok n=2 last=text-end t=2.5s",
    )
  })
})

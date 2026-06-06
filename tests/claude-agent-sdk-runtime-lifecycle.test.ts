import { describe, expect, mock, test } from "bun:test"
import { eq } from "drizzle-orm"
import type { DesktopRunRequest } from "../src/main/lib/agent-runtime/desktop-run-request"
import { resolveDesktopPermissionPolicy } from "../src/main/lib/agent-runtime/permission-policy"
import { runClaudeAgentSdkDesktopRuntimeLifecycle } from "../src/main/lib/claude/agent-sdk-runtime-lifecycle"
import { createClaudeAgentSdkStreamConsumerMutableState } from "../src/main/lib/claude/agent-sdk-stream-consumer"
import type { UIMessageChunk } from "../src/main/lib/claude/types"
import { chats, projects, subChats } from "../src/main/lib/db/schema"
import { createAgentJobTestDb } from "./helpers/agent-job-test-db"

function createRequest(signal = new AbortController().signal): DesktopRunRequest {
  return {
    identity: { runId: "run-1", jobId: "job-1" },
    context: {
      runtimeId: "claude-code",
      mode: "agent",
      projectId: "project-1",
      chatId: "chat-1",
      subChatId: "sub-1",
      cwd: "/repo",
    },
    prompt: "hello",
    permissionPolicy: resolveDesktopPermissionPolicy({
      runtimeId: "claude-code",
      mode: "agent",
    }),
    providerBinding: {},
    mcp: { status: "skipped", serverNames: [], blockers: [] },
    attachments: [],
    trace: { emit: () => {} },
    signal,
    session: {},
  }
}

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

async function* createEmptyStream() {}

async function* createClaudeAssistantStream() {
  yield {
    type: "assistant",
    uuid: "assistant-1",
    session_id: "session-1",
    message: {
      content: [{ type: "text", text: "hello" }],
    },
  }
}

function createLifecycleInput(
  db: ReturnType<typeof createAgentJobTestDb>,
  input: {
    query?: (params: any) => AsyncIterable<unknown>
    signal?: AbortSignal
    streamState?: ReturnType<typeof createClaudeAgentSdkStreamConsumerMutableState>
  } = {},
) {
  const signal = input.signal ?? new AbortController().signal
  const request = createRequest(signal)
  const emit = mock((chunk: UIMessageChunk) => true)

  return {
    query: (input.query ?? (() => createClaudeAssistantStream())) as any,
    request,
    runtimeQuery: {
      request,
      prompt: "hello",
      existingMessages: [],
      rawMcpServers: undefined,
      env: {},
      isUsingOllama: false,
      permissionPolicy: request.permissionPolicy,
      guardedContract: null,
      emit,
      subChatId: "sub-1",
      pendingToolApprovals: new Map(),
      shouldForkResume: false,
      forkResumeAtUuid: null,
      resumeAtUuid: null,
      resolvedModel: "claude-sonnet",
      maxThinkingTokens: null,
      projectPath: "/repo",
      cwd: "/repo",
      ensureTokensFresh: async (servers) => servers,
      readAgentsMd: async () => null,
      getClaudeBinaryPath: () => "/owned/claude",
    },
    streamState:
      input.streamState ?? createClaudeAgentSdkStreamConsumerMutableState(),
    isUsingOllama: false,
    isObservableActive: () => true,
    customConfig: null,
    hasExistingApiConfig: false,
    resolvedModel: "claude-sonnet",
    oauthToken: null,
    historyEnabled: true,
    db,
    messagesToSave: [{ id: "user-1", role: "user" }],
    guardedContract: null,
    guardedPreRunStatus: null,
    subId: "sub-1",
    emitError: mock(() => {}),
    emit,
    complete: mock(() => {}),
    log: mock(() => {}),
    error: mock(() => {}),
    desktopJobSawError: false,
    streamStart: 1000,
    nowMs: () => 3500,
  }
}

describe("Claude Agent SDK runtime lifecycle", () => {
  test("reports adapter failures before run finalization", async () => {
    const db = createAgentJobTestDb()
    const input = createLifecycleInput(db, {
      query: () => {
        throw new Error("query failed")
      },
    })

    await expect(
      runClaudeAgentSdkDesktopRuntimeLifecycle(input),
    ).resolves.toMatchObject({
      status: "failed",
      phase: "adapter",
      error: { message: "SDK query error" },
    })

    expect(input.emitError).toHaveBeenCalledTimes(1)
    expect(input.emitError.mock.calls[0][1]).toBe("Failed to start Claude query")
    expect(input.complete).toHaveBeenCalledTimes(1)
  })

  test("reports finalization failures after an empty successful stream", async () => {
    const db = createAgentJobTestDb()
    seedChat(db)
    const input = createLifecycleInput(db, {
      query: () => createEmptyStream(),
    })

    await expect(
      runClaudeAgentSdkDesktopRuntimeLifecycle(input),
    ).resolves.toMatchObject({
      status: "failed",
      phase: "finalization",
    })

    expect(input.emitError).toHaveBeenCalledTimes(1)
    expect(input.emitError.mock.calls[0][1]).toBe("Empty response")
    expect(input.complete).toHaveBeenCalledTimes(1)
  })

  test("runs the adapter and finalizes a successful desktop runtime turn", async () => {
    const db = createAgentJobTestDb()
    seedChat(db)
    const input = createLifecycleInput(db)

    await expect(
      runClaudeAgentSdkDesktopRuntimeLifecycle(input),
    ).resolves.toEqual({
      status: "completed",
      reachedNaturalFinish: true,
    })

    const subChat = db
      .select()
      .from(subChats)
      .where(eq(subChats.id, "sub-1"))
      .get()
    expect(subChat?.streamId).toBeNull()
    expect(subChat?.sessionId).toBe("session-1")
    expect(JSON.parse(subChat?.messages ?? "[]")).toHaveLength(2)
    expect(input.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "text-delta",
        delta: "hello",
      }),
    )
    expect(input.emit).toHaveBeenCalledWith({ type: "finish" })
    expect(input.complete).toHaveBeenCalledTimes(1)
  })
})

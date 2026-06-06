import { describe, expect, test } from "bun:test"
import { chats, projects, subChats } from "../src/main/lib/db/schema"
import {
  completeDesktopAgentJobSafely,
  createAndStartDesktopAgentJob,
  registerActiveDesktopAgentJob,
  requestCancelDesktopAgentJob,
  unregisterActiveDesktopAgentJob,
} from "../src/main/lib/desktop-agent-jobs"
import { getAgentJob, listAgentJobEvents } from "../src/main/lib/headless/job-store"
import { createAgentJobTestDb } from "./helpers/agent-job-test-db"

function seedChat(db: ReturnType<typeof createAgentJobTestDb>) {
  db.insert(projects)
    .values({
      id: "project-1",
      name: "Project",
      path: "/tmp/project",
    })
    .run()
  db.insert(chats)
    .values({
      id: "chat-1",
      projectId: "project-1",
      worktreePath: "/tmp/project-worktree",
    })
    .run()
  db.insert(subChats)
    .values({
      id: "sub-chat-1",
      chatId: "chat-1",
    })
    .run()
}

describe("desktop agent jobs", () => {
  test("creates a linked running desktop job without duplicating the full prompt", () => {
    const db = createAgentJobTestDb()
    seedChat(db)

    const prompt = "Please inspect the repo and do not edit files."
    const { job, workerId, cwd } = createAndStartDesktopAgentJob(db, {
      runtime: "codex",
      mode: "plan",
      chatId: "chat-1",
      subChatId: "sub-chat-1",
      cwd: "/tmp/project-worktree",
      prompt,
      runId: "run-1",
    })

    const persisted = getAgentJob(db, job.id)
    expect(persisted?.source).toBe("desktop")
    expect(persisted?.status).toBe("running")
    expect(persisted?.runtime).toBe("codex")
    expect(persisted?.projectId).toBe("project-1")
    expect(persisted?.chatId).toBe("chat-1")
    expect(persisted?.subChatId).toBe("sub-chat-1")
    expect(persisted?.cwd).toBe("/tmp/project-worktree")
    expect(cwd).toBe("/tmp/project-worktree")
    expect(workerId).toBe("desktop:codex:run-1")
    expect(persisted?.inputJson).not.toContain(prompt)
    expect(JSON.parse(persisted?.inputJson || "{}")).toMatchObject({
      kind: "desktop-chat",
      chatId: "chat-1",
      subChatId: "sub-chat-1",
      projectId: "project-1",
      runId: "run-1",
      promptLength: prompt.length,
    })

    const events = listAgentJobEvents(db, job.id)
    expect(events.map((event) => event.type)).toEqual([
      "job_created",
      "job_started",
      "status",
    ])
  })

  test("rejects renderer-supplied cwd and sub-chat mismatches", () => {
    const db = createAgentJobTestDb()
    seedChat(db)
    db.insert(chats)
      .values({
        id: "other-chat",
        projectId: "project-1",
        worktreePath: "/tmp/project-worktree",
      })
      .run()

    expect(() =>
      createAndStartDesktopAgentJob(db, {
        runtime: "claude-code",
        mode: "agent",
        chatId: "chat-1",
        subChatId: "sub-chat-1",
        cwd: "/tmp/other",
        prompt: "Run elsewhere",
      }),
    ).toThrow("Desktop job cwd mismatch")

    expect(() =>
      createAndStartDesktopAgentJob(db, {
        runtime: "claude-code",
        mode: "agent",
        chatId: "other-chat",
        subChatId: "sub-chat-1",
        cwd: "/tmp/project-worktree",
        prompt: "Wrong chat",
      }),
    ).toThrow("does not belong to chat")
  })

  test("routes cancellation through the active desktop job registration", () => {
    const db = createAgentJobTestDb()
    seedChat(db)
    const { job } = createAndStartDesktopAgentJob(db, {
      runtime: "claude-code",
      mode: "agent",
      chatId: "chat-1",
      subChatId: "sub-chat-1",
      cwd: "/tmp/project-worktree",
      prompt: "Run",
      runId: "stream-1",
    })
    let cancelCount = 0
    registerActiveDesktopAgentJob({
      jobId: job.id,
      runtime: "claude-code",
      subChatId: "sub-chat-1",
      runId: "stream-1",
      db,
      workerId: "desktop:claude-code:stream-1",
      cancel: () => {
        cancelCount += 1
      },
    })

    const result = requestCancelDesktopAgentJob(db, job.id, "desktop")
    expect(result.activeCancelDelivered).toBe(true)
    expect(result.job.cancelRequestedBy).toBe("desktop")
    expect(cancelCount).toBe(1)
    expect(
      listAgentJobEvents(db, job.id).map((event) => ({
        type: event.type,
        payload: JSON.parse(event.payloadJson || "{}"),
      })),
    ).toContainEqual({
      type: "status",
      payload: { status: "cancel_requested", requestedBy: "desktop" },
    })

    unregisterActiveDesktopAgentJob(job.id)
  })

  test("refreshes heartbeat while a desktop job is active", async () => {
    const db = createAgentJobTestDb()
    seedChat(db)
    const { job, workerId } = createAndStartDesktopAgentJob(db, {
      runtime: "codex",
      mode: "plan",
      chatId: "chat-1",
      subChatId: "sub-chat-1",
      cwd: "/tmp/project-worktree",
      prompt: "Long running inspect",
      runId: "run-heartbeat",
    })
    const initialHeartbeat = getAgentJob(db, job.id)?.heartbeatAt?.getTime() ?? 0

    registerActiveDesktopAgentJob({
      jobId: job.id,
      runtime: "codex",
      subChatId: "sub-chat-1",
      runId: "run-heartbeat",
      db,
      workerId,
      heartbeatIntervalMs: 5,
      cancel: () => {},
    })

    await new Promise((resolve) => setTimeout(resolve, 30))
    const refreshedHeartbeat = getAgentJob(db, job.id)?.heartbeatAt?.getTime() ?? 0
    unregisterActiveDesktopAgentJob(job.id)

    expect(refreshedHeartbeat).toBeGreaterThanOrEqual(initialHeartbeat)
  })

  test("completes running desktop jobs safely and ignores terminal jobs", () => {
    const db = createAgentJobTestDb()
    seedChat(db)
    const { job } = createAndStartDesktopAgentJob(db, {
      runtime: "codex",
      mode: "plan",
      chatId: "chat-1",
      subChatId: "sub-chat-1",
      cwd: "/tmp/project-worktree",
      prompt: "Inspect",
      runId: "run-1",
    })

    const completed = completeDesktopAgentJobSafely(db, {
      jobId: job.id,
      status: "succeeded",
      exitCode: 0,
    })
    expect(completed?.status).toBe("succeeded")
    expect(listAgentJobEvents(db, job.id).at(-1)).toMatchObject({
      type: "completed",
    })

    const ignored = completeDesktopAgentJobSafely(db, {
      jobId: job.id,
      status: "failed",
      exitCode: 1,
    })
    expect(ignored?.status).toBe("succeeded")
  })
})

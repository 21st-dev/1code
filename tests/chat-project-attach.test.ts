import { describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { attachProjectToChat } from "../src/main/lib/chat-project-attach"
import { agentJobs, chats, projects, subChats } from "../src/main/lib/db/schema"
import type { CreateProjectChatWorktree } from "../src/main/lib/project-chat-worktree"
import { createAgentJobTestDb } from "./helpers/agent-job-test-db"

function seedProject(db: ReturnType<typeof createAgentJobTestDb>) {
  db.insert(projects)
    .values({
      id: "project-1",
      name: "My Project",
      path: "/tmp/project",
    })
    .run()
}

function seedQuickChat(db: ReturnType<typeof createAgentJobTestDb>) {
  db.insert(chats)
    .values({
      id: "quick-chat-1",
      name: "Quick chat",
      projectId: null,
    })
    .run()
  db.insert(subChats)
    .values({
      id: "quick-sub-chat-1",
      chatId: "quick-chat-1",
      sessionId: "folderless-session",
      mode: "agent",
      messages: JSON.stringify([{ id: "msg-1", role: "user" }]),
    })
    .run()
}

describe("attachProjectToChat", () => {
  test("rejects non-quick chats", async () => {
    const db = createAgentJobTestDb()
    seedProject(db)
    db.insert(chats)
      .values({
        id: "project-chat-1",
        projectId: "project-1",
        worktreePath: "/tmp/project",
      })
      .run()

    await expect(
      attachProjectToChat(db, {
        chatId: "project-chat-1",
        projectId: "project-1",
        useWorktree: false,
        targetMode: "agent",
      }),
    ).rejects.toThrow("Only folderless quick chats")
  })

  test("rejects active streams before attaching", async () => {
    const db = createAgentJobTestDb()
    seedProject(db)
    seedQuickChat(db)
    db.update(subChats)
      .set({ streamId: "stream-1" })
      .where(eq(subChats.id, "quick-sub-chat-1"))
      .run()

    await expect(
      attachProjectToChat(db, {
        chatId: "quick-chat-1",
        projectId: "project-1",
        useWorktree: false,
        targetMode: "agent",
      }),
    ).rejects.toThrow("stream is active")
  })

  test("rejects active jobs before attaching", async () => {
    const db = createAgentJobTestDb()
    seedProject(db)
    seedQuickChat(db)
    db.insert(agentJobs)
      .values({
        id: "job-1",
        source: "desktop",
        runtime: "claude-code",
        status: "running",
        mode: "agent",
        cwd: "/tmp/folderless",
        chatId: "quick-chat-1",
      })
      .run()

    await expect(
      attachProjectToChat(db, {
        chatId: "quick-chat-1",
        projectId: "project-1",
        useWorktree: false,
        targetMode: "agent",
      }),
    ).rejects.toThrow("job is active")
  })

  test("attaches with a fresh worktree session and preserves history", async () => {
    const db = createAgentJobTestDb()
    seedProject(db)
    seedQuickChat(db)
    const calls: Parameters<CreateProjectChatWorktree>[] = []
    const createWorktreeForChat: CreateProjectChatWorktree = async (
      ...args
    ) => {
      calls.push(args)
      return {
        success: true,
        worktreePath: "/tmp/project-worktree",
        branch: "locus-worktree",
        baseBranch: "main",
      }
    }

    const attached = await attachProjectToChat(db, {
      chatId: "quick-chat-1",
      projectId: "project-1",
      useWorktree: true,
      baseBranch: "main",
      branchType: "local",
      targetMode: "plan",
      createWorktreeForChat,
    })

    expect(calls).toHaveLength(1)
    expect(calls[0]?.slice(0, 5)).toEqual([
      "/tmp/project",
      "my-project",
      "quick-chat-1",
      "main",
      "local",
    ])
    expect(attached).toMatchObject({
      id: "quick-chat-1",
      projectId: "project-1",
      worktreePath: "/tmp/project-worktree",
      branch: "locus-worktree",
      baseBranch: "main",
    })
    expect(attached.subChats).toHaveLength(1)
    expect(attached.subChats[0]?.mode).toBe("plan")
    expect(attached.subChats[0]?.sessionId).toBeNull()
    expect(attached.subChats[0]?.messages).toContain("msg-1")
  })

  test("attaches local mode without creating a worktree", async () => {
    const db = createAgentJobTestDb()
    seedProject(db)
    seedQuickChat(db)
    let createCalled = false

    const attached = await attachProjectToChat(db, {
      chatId: "quick-chat-1",
      projectId: "project-1",
      useWorktree: false,
      targetMode: "agent",
      createWorktreeForChat: async () => {
        createCalled = true
        return { success: true, worktreePath: "/tmp/should-not-run" }
      },
    })

    expect(createCalled).toBe(false)
    expect(attached.worktreePath).toBe("/tmp/project")
    expect(attached.branch).toBeNull()
    expect(attached.projectId).toBe("project-1")
  })
})

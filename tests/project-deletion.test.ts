import { describe, expect, test } from "bun:test"
import { chats, projects, subChats } from "../src/main/lib/db/schema"
import { createAgentJob } from "../src/main/lib/headless/job-store"
import {
  deleteProjectWithCleanup,
  getProjectDeletionPreview,
  ProjectDeletionError,
} from "../src/main/lib/projects/deletion"
import { createAgentJobTestDb } from "./helpers/agent-job-test-db"

function seedProject(db: ReturnType<typeof createAgentJobTestDb>) {
  return db
    .insert(projects)
    .values({
      id: "project-1",
      name: "Project",
      path: "/tmp/project",
    })
    .returning()
    .get()
}

function seedChats(db: ReturnType<typeof createAgentJobTestDb>) {
  db.insert(chats)
    .values([
      {
        id: "chat-worktree",
        projectId: "project-1",
        name: "Worktree chat",
        worktreePath: "/tmp/project-worktree",
        branch: "locus/chat-worktree",
      },
      {
        id: "chat-local",
        projectId: "project-1",
        name: "Local chat",
        worktreePath: "/tmp/project",
        branch: null,
      },
    ])
    .run()

  db.insert(subChats)
    .values([
      {
        id: "sub-1",
        chatId: "chat-worktree",
        messages: "[]",
        mode: "agent",
      },
      {
        id: "sub-2",
        chatId: "chat-worktree",
        messages: "[]",
        mode: "plan",
      },
      {
        id: "sub-3",
        chatId: "chat-local",
        messages: "[]",
        mode: "agent",
      },
    ])
    .run()
}

describe("project deletion", () => {
  test("previews destructive project deletion counts", () => {
    const db = createAgentJobTestDb()
    seedProject(db)
    seedChats(db)

    expect(getProjectDeletionPreview(db, "project-1")).toMatchObject({
      chatCount: 2,
      subChatCount: 3,
      worktreeCount: 1,
      activeJobs: [],
      project: {
        id: "project-1",
      },
    })
  })

  test("cleans worktree workspaces before deleting project records", async () => {
    const db = createAgentJobTestDb()
    seedProject(db)
    seedChats(db)
    const removedWorktrees: Array<[string, string]> = []
    const killedWorkspaces: string[] = []

    const result = await deleteProjectWithCleanup({
      db,
      projectId: "project-1",
      cleanupDeps: {
        removeWorktree: async (projectPath, worktreePath) => {
          removedWorktrees.push([projectPath, worktreePath])
          return { success: true }
        },
        killByWorkspaceId: async (workspaceId) => {
          killedWorkspaces.push(workspaceId)
          return { killed: 1, failed: 0 }
        },
        invalidateStatus: () => {},
        invalidateParsedDiff: () => {},
      },
    })

    expect(result).toMatchObject({
      chatCount: 2,
      subChatCount: 3,
      worktreeCount: 1,
      deletedProject: {
        id: "project-1",
      },
    })
    expect(removedWorktrees).toEqual([
      ["/tmp/project", "/tmp/project-worktree"],
    ])
    expect(killedWorkspaces).toEqual(["chat-worktree"])
    expect(db.select().from(projects).all()).toHaveLength(0)
    expect(db.select().from(chats).all()).toHaveLength(0)
    expect(db.select().from(subChats).all()).toHaveLength(0)
  })

  test("requires removed projects for project-history deletion when requested", async () => {
    const db = createAgentJobTestDb()
    seedProject(db)
    seedChats(db)

    await expect(
      deleteProjectWithCleanup({
        db,
        projectId: "project-1",
        requireRemoved: true,
      }),
    ).rejects.toMatchObject({
      code: "project_not_removed",
    })

    db.update(projects)
      .set({ removedAt: new Date("2026-06-22T00:00:00Z") })
      .run()

    await deleteProjectWithCleanup({
      db,
      projectId: "project-1",
      requireRemoved: true,
      cleanupDeps: {
        removeWorktree: async () => ({ success: true }),
        killByWorkspaceId: async () => ({ killed: 0, failed: 0 }),
        invalidateStatus: () => {},
        invalidateParsedDiff: () => {},
      },
    })

    expect(db.select().from(projects).all()).toHaveLength(0)
    expect(db.select().from(chats).all()).toHaveLength(0)
  })

  test("does not delete database rows when cleanup fails", async () => {
    const db = createAgentJobTestDb()
    seedProject(db)
    seedChats(db)

    await expect(
      deleteProjectWithCleanup({
        db,
        projectId: "project-1",
        cleanupDeps: {
          removeWorktree: async () => ({
            success: false,
            error: "dirty worktree",
          }),
          killByWorkspaceId: async () => ({ killed: 1, failed: 0 }),
          invalidateStatus: () => {},
          invalidateParsedDiff: () => {},
        },
      }),
    ).rejects.toMatchObject({
      code: "cleanup_failed",
    })
    expect(db.select().from(projects).all()).toHaveLength(1)
    expect(db.select().from(chats).all()).toHaveLength(2)
    expect(db.select().from(subChats).all()).toHaveLength(3)
  })

  test("refuses deletion while project has active jobs", async () => {
    const db = createAgentJobTestDb()
    seedProject(db)
    seedChats(db)
    createAgentJob(db, {
      id: "job-1",
      source: "api",
      runtime: "codex",
      mode: "plan",
      cwd: "/tmp/project",
      prompt: "Queued work",
      projectId: "project-1",
    })

    await expect(
      deleteProjectWithCleanup({
        db,
        projectId: "project-1",
        cleanupDeps: {
          removeWorktree: async () => {
            throw new Error("cleanup should not run")
          },
        },
      }),
    ).rejects.toBeInstanceOf(ProjectDeletionError)
    await expect(
      deleteProjectWithCleanup({
        db,
        projectId: "project-1",
        cleanupDeps: {
          removeWorktree: async () => {
            throw new Error("cleanup should not run")
          },
        },
      }),
    ).rejects.toMatchObject({
      code: "project_has_active_jobs",
    })
    expect(db.select().from(projects).all()).toHaveLength(1)
    expect(db.select().from(chats).all()).toHaveLength(2)
  })
})

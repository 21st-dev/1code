import { describe, expect, test } from "bun:test"
import { verifyDesktopRunPreflight } from "../src/main/lib/agent-runtime/preflight"
import { chats, projects, subChats } from "../src/main/lib/db/schema"
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

describe("desktop runtime preflight", () => {
  test("returns verified desktop context", () => {
    const db = createAgentJobTestDb()
    seedChat(db)

    const result = verifyDesktopRunPreflight(db, {
      chatId: "chat-1",
      subChatId: "sub-chat-1",
      cwd: "/tmp/project-worktree",
    })

    expect(result.project.id).toBe("project-1")
    expect(result.chat.id).toBe("chat-1")
    expect(result.subChat.id).toBe("sub-chat-1")
    expect(result.cwd).toBe("/tmp/project-worktree")
  })

  test("rejects mismatched cwd and sub-chat ownership", () => {
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
      verifyDesktopRunPreflight(db, {
        chatId: "chat-1",
        subChatId: "sub-chat-1",
        cwd: "/tmp/other",
      }),
    ).toThrow("Desktop job cwd mismatch")

    expect(() =>
      verifyDesktopRunPreflight(db, {
        chatId: "other-chat",
        subChatId: "sub-chat-1",
        cwd: "/tmp/project-worktree",
      }),
    ).toThrow("does not belong to chat")
  })
})

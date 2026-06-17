import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { getProjectBackedFileStats } from "../src/main/lib/chat-file-stats"
import { agentJobs, chats, projects, subChats } from "../src/main/lib/db/schema"
import { listAgentJobs } from "../src/main/lib/headless/job-store"
import { createAgentJobTestDb } from "./helpers/agent-job-test-db"

function seedProject(db: ReturnType<typeof createAgentJobTestDb>) {
  db.insert(projects)
    .values({
      id: "project-1",
      name: "Project",
      path: "/tmp/project",
    })
    .run()
}

function fileWriteMessage(content: string) {
  return JSON.stringify([
    {
      role: "assistant",
      parts: [
        {
          type: "tool-Write",
          input: {
            file_path: "src/example.ts",
            content,
          },
        },
      ],
    },
  ])
}

describe("quick chat repo-surface filtering", () => {
  test("agent job listing can exclude folderless jobs for repo surfaces", () => {
    const db = createAgentJobTestDb()
    seedProject(db)
    db.insert(agentJobs)
      .values([
        {
          id: "project-job",
          source: "desktop",
          runtime: "claude-code",
          status: "running",
          mode: "agent",
          cwd: "/tmp/project",
          projectId: "project-1",
          createdAt: new Date("2026-01-01T00:00:00Z"),
        },
        {
          id: "folderless-job",
          source: "desktop",
          runtime: "claude-code",
          status: "running",
          mode: "agent",
          cwd: "/tmp/locus/quick-chat",
          projectId: null,
          createdAt: new Date("2026-01-02T00:00:00Z"),
        },
      ])
      .run()

    expect(
      listAgentJobs(db, { source: "desktop", projectOnly: true }).map(
        (job) => job.id,
      ),
    ).toEqual(["project-job"])
    expect(
      listAgentJobs(db, { source: "desktop", projectOnly: false }).map(
        (job) => job.id,
      ),
    ).toEqual(["folderless-job", "project-job"])
  })

  test("agentJobs.list defaults to project-only and keeps explicit folderless opt-in", () => {
    const source = readFileSync(
      "src/main/lib/trpc/routers/agent-jobs.ts",
      "utf8",
    )

    expect(source).toContain("includeFolderless: z.boolean().default(false)")
    expect(source).toContain("projectOnly: input?.includeFolderless !== true")
  })

  test("workbench task list has an explicit project-backed guard", () => {
    const source = readFileSync(
      "src/main/lib/trpc/routers/agent-workbench.ts",
      "utf8",
    )

    expect(source).toContain("isNotNull(chats.projectId)")
  })

  test("file stats ignore folderless quick chats by sub-chat id and chat id", () => {
    const db = createAgentJobTestDb()
    seedProject(db)
    db.insert(chats)
      .values([
        {
          id: "project-chat",
          name: "Project chat",
          projectId: "project-1",
        },
        {
          id: "quick-chat",
          name: "Quick chat",
          projectId: null,
        },
      ])
      .run()
    db.insert(subChats)
      .values([
        {
          id: "project-sub-chat",
          chatId: "project-chat",
          messages: fileWriteMessage("one\ntwo"),
        },
        {
          id: "quick-sub-chat",
          chatId: "quick-chat",
          messages: fileWriteMessage("ignored"),
        },
      ])
      .run()

    expect(
      getProjectBackedFileStats(db, {
        openSubChatIds: ["project-sub-chat", "quick-sub-chat"],
      }),
    ).toEqual([
      {
        chatId: "project-chat",
        additions: 2,
        deletions: 0,
        fileCount: 1,
      },
    ])
    expect(
      getProjectBackedFileStats(db, {
        chatIds: ["project-chat", "quick-chat"],
      }),
    ).toEqual([
      {
        chatId: "project-chat",
        additions: 2,
        deletions: 0,
        fileCount: 1,
      },
    ])
  })
})

import { and, desc, eq, inArray, isNull } from "drizzle-orm"
import simpleGit from "simple-git"
import { z } from "zod"
import {
  chats,
  getDatabase,
  projects,
  subChats,
} from "../../db"
import { assertRegisteredWorktree } from "../../git/security"
import {
  classifyAgentWorkbenchStatus,
  matchesAgentWorkbenchFilter,
  summarizeLatestSubChat,
  type AgentWorkbenchDiffSummary,
  type AgentWorkbenchFilter,
} from "../../agent-workbench/status"
import { publicProcedure, router } from "../index"

const workbenchFilterSchema = z.enum([
  "all",
  "running",
  "needs-review",
  "prs",
  "blocked",
  "clean",
]) satisfies z.ZodType<AgentWorkbenchFilter>

const listTasksInputSchema = z
  .object({
    projectId: z.string().optional(),
    filter: workbenchFilterSchema.optional(),
    runningSubChatIds: z.array(z.string()).optional(),
    blockedSubChatIds: z.array(z.string()).optional(),
    includeArchived: z.boolean().optional(),
  })
  .optional()

type ChatRow = typeof chats.$inferSelect & {
  projectName: string
  projectPath: string
  gitProvider: string | null
  gitOwner: string | null
  gitRepo: string | null
}

type SubChatRow = Pick<
  typeof subChats.$inferSelect,
  "id" | "name" | "chatId" | "sessionId" | "streamId" | "mode" | "messages" | "updatedAt"
>

async function getDiffSummary(
  worktreePath: string | null,
): Promise<AgentWorkbenchDiffSummary> {
  if (!worktreePath) {
    return { fileCount: 0, additions: null, deletions: null }
  }

  try {
    assertRegisteredWorktree(worktreePath)
    const git = simpleGit(worktreePath)
    const status = await git.status()
    const fileCount = status.files.length

    if (fileCount === 0) {
      return { fileCount: 0, additions: 0, deletions: 0 }
    }

    let additions = 0
    let deletions = 0
    try {
      const [unstagedNumstat, stagedNumstat] = await Promise.all([
        git.diff(["--numstat"]),
        git.diff(["--cached", "--numstat"]),
      ])
      const numstat = [unstagedNumstat, stagedNumstat].filter(Boolean).join("\n")
      for (const line of numstat.split("\n")) {
        const [added, removed] = line.trim().split(/\s+/)
        const addedCount = Number.parseInt(added ?? "", 10)
        const removedCount = Number.parseInt(removed ?? "", 10)
        if (Number.isFinite(addedCount)) additions += addedCount
        if (Number.isFinite(removedCount)) deletions += removedCount
      }
    } catch {
      return { fileCount, additions: null, deletions: null }
    }

    return { fileCount, additions, deletions }
  } catch (error) {
    return {
      fileCount: 0,
      additions: null,
      deletions: null,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function chooseLatestSubChat(rows: SubChatRow[]): SubChatRow | null {
  if (rows.length === 0) return null

  return rows
    .slice()
    .sort((left, right) => {
      const leftTime = left.updatedAt?.getTime() ?? 0
      const rightTime = right.updatedAt?.getTime() ?? 0
      return rightTime - leftTime
    })[0]!
}

export const agentWorkbenchRouter = router({
  listTasks: publicProcedure.input(listTasksInputSchema).query(async ({ input }) => {
    const db = getDatabase()
    const filter = input?.filter ?? "all"
    const includeArchived = input?.includeArchived === true
    const runningSubChatIds = new Set(input?.runningSubChatIds ?? [])
    const blockedSubChatIds = new Set(input?.blockedSubChatIds ?? [])

    const whereClauses = [
      input?.projectId ? eq(chats.projectId, input.projectId) : undefined,
      includeArchived ? undefined : isNull(chats.archivedAt),
    ].filter(Boolean)
    const whereClause =
      whereClauses.length === 0
        ? undefined
        : whereClauses.length === 1
          ? whereClauses[0]
          : and(...whereClauses)

    const chatRows = db
      .select({
        id: chats.id,
        name: chats.name,
        projectId: chats.projectId,
        createdAt: chats.createdAt,
        updatedAt: chats.updatedAt,
        archivedAt: chats.archivedAt,
        worktreePath: chats.worktreePath,
        branch: chats.branch,
        baseBranch: chats.baseBranch,
        prUrl: chats.prUrl,
        prNumber: chats.prNumber,
        projectName: projects.name,
        projectPath: projects.path,
        gitProvider: projects.gitProvider,
        gitOwner: projects.gitOwner,
        gitRepo: projects.gitRepo,
      })
      .from(chats)
      .innerJoin(projects, eq(chats.projectId, projects.id))
      .where(whereClause)
      .orderBy(desc(chats.updatedAt))
      .all() as ChatRow[]

    const chatIds = chatRows.map((chat) => chat.id)
    const subChatRows =
      chatIds.length > 0
        ? (db
            .select({
              id: subChats.id,
              name: subChats.name,
              chatId: subChats.chatId,
              sessionId: subChats.sessionId,
              streamId: subChats.streamId,
              mode: subChats.mode,
              messages: subChats.messages,
              updatedAt: subChats.updatedAt,
            })
            .from(subChats)
            .where(inArray(subChats.chatId, chatIds))
            .all() as SubChatRow[])
        : []

    const subChatsByChat = new Map<string, SubChatRow[]>()
    for (const row of subChatRows) {
      const existing = subChatsByChat.get(row.chatId) ?? []
      existing.push(row)
      subChatsByChat.set(row.chatId, existing)
    }

    const tasks = await Promise.all(
      chatRows.map(async (chat) => {
        const latestRawSubChat = chooseLatestSubChat(subChatsByChat.get(chat.id) ?? [])
        const latestSubChat = latestRawSubChat
          ? summarizeLatestSubChat(latestRawSubChat)
          : null
        const diff = await getDiffSummary(chat.worktreePath)
        const hasActiveStream =
          !!latestSubChat?.streamId ||
          (latestSubChat ? runningSubChatIds.has(latestSubChat.id) : false)
        const isClientBlocked =
          latestSubChat ? blockedSubChatIds.has(latestSubChat.id) : false
        const status = classifyAgentWorkbenchStatus({
          archived: !!chat.archivedAt,
          worktreePath: chat.worktreePath,
          hasActiveStream,
          hasPendingUserQuestion:
            latestSubChat?.pendingUserQuestion === true || isClientBlocked,
          hasPendingPlanApproval: latestSubChat?.pendingPlanApproval === true,
          runtimeError: diff.error || latestSubChat?.errorText || null,
          guardedRunStatus: latestSubChat?.guardedRunStatus,
          diff,
          prUrl: chat.prUrl,
          prNumber: chat.prNumber,
        })

        return {
          id: chat.id,
          title: chat.name || "Untitled Chat",
          project: {
            id: chat.projectId,
            name: chat.projectName,
            path: chat.projectPath,
            gitProvider: chat.gitProvider,
            gitOwner: chat.gitOwner,
            gitRepo: chat.gitRepo,
          },
          worktreePath: chat.worktreePath,
          branch: chat.branch,
          baseBranch: chat.baseBranch,
          localDirectoryMode: !chat.branch,
          latestSubChat,
          diff,
          pr: chat.prUrl || chat.prNumber
            ? {
                url: chat.prUrl,
                number: chat.prNumber,
              }
            : null,
          status: status.status,
          statusReason: status.reason,
          updatedAt: chat.updatedAt,
          archivedAt: chat.archivedAt,
          actions: {
            canOpen: true,
            canContinue: latestSubChat !== null,
            canReviewDiff: !!chat.worktreePath && diff.fileCount > 0,
            canOpenPr: !!chat.prUrl,
            canCreatePr: !!chat.worktreePath && !chat.prUrl,
          },
        }
      }),
    )

    const counts = {
      all: tasks.length,
      running: tasks.filter((task) => task.status === "running").length,
      needsReview: tasks.filter((task) => task.status === "needs-review").length,
      prs: tasks.filter((task) => task.status === "has-pr").length,
      blocked: tasks.filter((task) => task.status === "blocked").length,
      clean: tasks.filter((task) => task.status === "clean").length,
    }

    return {
      tasks: tasks.filter((task) => matchesAgentWorkbenchFilter(task.status, filter)),
      counts,
      loadedAt: new Date(),
    }
  }),
})

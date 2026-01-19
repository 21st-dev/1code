import { z } from "zod"
import { router, publicProcedure } from "../index"
import { getDatabase, chats, subChats, projects } from "../../db"
import { eq, desc, isNull, isNotNull, inArray, and } from "drizzle-orm"
import {
  createWorktreeForChat,
  removeWorktree,
  getWorktreeDiff,
  fetchGitHubPRStatus,
} from "../../git"
import { execWithShellEnv } from "../../git/shell-env"
import simpleGit from "simple-git"
import { getAuthManager, getBaseUrl } from "../../../index"
import {
  trackWorkspaceCreated,
  trackWorkspaceArchived,
  trackWorkspaceDeleted,
  trackPRCreated,
} from "../../analytics"
import { terminalManager } from "../../terminal/manager"

// Fallback to truncated user message if AI generation fails
function getFallbackName(userMessage: string): string {
  const trimmed = userMessage.trim()
  if (trimmed.length <= 25) {
    return trimmed || "New Chat"
  }
  return trimmed.substring(0, 25) + "..."
}

export const chatsRouter = router({
  /**
   * List all non-archived chats (optionally filter by project)
   */
  list: publicProcedure
    .input(z.object({ projectId: z.string().optional() }))
    .query(({ input }) => {
      const db = getDatabase()
      const conditions = [isNull(chats.archivedAt)]
      if (input.projectId) {
        conditions.push(eq(chats.projectId, input.projectId))
      }
      return db
        .select()
        .from(chats)
        .where(and(...conditions))
        .orderBy(desc(chats.updatedAt))
        .all()
    }),

  /**
   * List archived chats (optionally filter by project)
   */
  listArchived: publicProcedure
    .input(z.object({ projectId: z.string().optional() }))
    .query(({ input }) => {
      const db = getDatabase()
      const conditions = [isNotNull(chats.archivedAt)]
      if (input.projectId) {
        conditions.push(eq(chats.projectId, input.projectId))
      }
      return db
        .select()
        .from(chats)
        .where(and(...conditions))
        .orderBy(desc(chats.archivedAt))
        .all()
    }),

  /**
   * Get a single chat with all sub-chats
   */
  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) => {
      const db = getDatabase()
      const chat = db.select().from(chats).where(eq(chats.id, input.id)).get()
      if (!chat) return null

      const chatSubChats = db
        .select()
        .from(subChats)
        .where(eq(subChats.chatId, input.id))
        .orderBy(subChats.createdAt)
        .all()

      const project = db
        .select()
        .from(projects)
        .where(eq(projects.id, chat.projectId))
        .get()

      return { ...chat, subChats: chatSubChats, project }
    }),

  /**
   * Create a new chat with optional git worktree
   */
  create: publicProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string().optional(),
        initialMessage: z.string().optional(),
        initialMessageParts: z
          .array(
            z.union([
              z.object({ type: z.literal("text"), text: z.string() }),
              z.object({
                type: z.literal("data-image"),
                data: z.object({
                  url: z.string(),
                  mediaType: z.string().optional(),
                  filename: z.string().optional(),
                  base64Data: z.string().optional(),
                }),
              }),
            ]),
          )
          .optional(),
        baseBranch: z.string().optional(), // Branch to base the worktree off
        useWorktree: z.boolean().default(true), // If false, work directly in project dir
        mode: z.enum(["plan", "agent"]).default("agent"),
      }),
    )
    .mutation(async ({ input }) => {
      console.log("[chats.create] called with:", input)
      const db = getDatabase()

      // Get project path
      const project = db
        .select()
        .from(projects)
        .where(eq(projects.id, input.projectId))
        .get()
      console.log("[chats.create] found project:", project)
      if (!project) throw new Error("Project not found")

      // Create chat (fast path)
      const chat = db
        .insert(chats)
        .values({ name: input.name, projectId: input.projectId })
        .returning()
        .get()
      console.log("[chats.create] created chat:", chat)

      // Create initial sub-chat with user message (AI SDK format)
      // If initialMessageParts is provided, use it; otherwise fallback to text-only message
      let initialMessages = "[]"

      if (input.initialMessageParts && input.initialMessageParts.length > 0) {
        initialMessages = JSON.stringify([
          {
            id: `msg-${Date.now()}`,
            role: "user",
            parts: input.initialMessageParts,
          },
        ])
      } else if (input.initialMessage) {
        initialMessages = JSON.stringify([
          {
            id: `msg-${Date.now()}`,
            role: "user",
            parts: [{ type: "text", text: input.initialMessage }],
          },
        ])
      }

      const subChat = db
        .insert(subChats)
        .values({
          chatId: chat.id,
          mode: input.mode,
          messages: initialMessages,
        })
        .returning()
        .get()
      console.log("[chats.create] created subChat:", subChat)

      // Worktree creation result (will be set if useWorktree is true)
      let worktreeResult: {
        worktreePath?: string
        branch?: string
        baseBranch?: string
      } = {}

      // Only create worktree if useWorktree is true
      if (input.useWorktree) {
        console.log(
          "[chats.create] creating worktree with baseBranch:",
          input.baseBranch,
        )
        const result = await createWorktreeForChat(
          project.path,
          project.id,
          chat.id,
          input.baseBranch,
        )
        console.log("[chats.create] worktree result:", result)

        if (result.success && result.worktreePath) {
          db.update(chats)
            .set({
              worktreePath: result.worktreePath,
              branch: result.branch,
              baseBranch: result.baseBranch,
            })
            .where(eq(chats.id, chat.id))
            .run()
          worktreeResult = {
            worktreePath: result.worktreePath,
            branch: result.branch,
            baseBranch: result.baseBranch,
          }
        } else {
          console.warn(`[Worktree] Failed: ${result.error}`)
          // Fallback to project path
          db.update(chats)
            .set({ worktreePath: project.path })
            .where(eq(chats.id, chat.id))
            .run()
          worktreeResult = { worktreePath: project.path }
        }
      } else {
        // Local mode: use project path directly, no branch info
        console.log("[chats.create] local mode - using project path directly")
        db.update(chats)
          .set({ worktreePath: project.path })
          .where(eq(chats.id, chat.id))
          .run()
        worktreeResult = { worktreePath: project.path }
      }

      const response = {
        ...chat,
        worktreePath: worktreeResult.worktreePath || project.path,
        branch: worktreeResult.branch,
        baseBranch: worktreeResult.baseBranch,
        subChats: [subChat],
      }

      // Track workspace created
      trackWorkspaceCreated({
        id: chat.id,
        projectId: input.projectId,
        useWorktree: input.useWorktree,
      })

      console.log("[chats.create] returning:", response)
      return response
    }),

  /**
   * Rename a chat
   */
  rename: publicProcedure
    .input(z.object({ id: z.string(), name: z.string().min(1) }))
    .mutation(({ input }) => {
      const db = getDatabase()
      return db
        .update(chats)
        .set({ name: input.name, updatedAt: new Date() })
        .where(eq(chats.id, input.id))
        .returning()
        .get()
    }),

  /**
   * Archive a chat (also kills any terminal processes in the workspace)
   * Optionally deletes the worktree to free disk space
   */
  archive: publicProcedure
    .input(
      z.object({
        id: z.string(),
        deleteWorktree: z.boolean().default(false),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDatabase()

      // Get chat to check for worktree (before archiving)
      const chat = db
        .select()
        .from(chats)
        .where(eq(chats.id, input.id))
        .get()

      // Archive immediately (optimistic)
      const result = db
        .update(chats)
        .set({ archivedAt: new Date() })
        .where(eq(chats.id, input.id))
        .returning()
        .get()

      // Track workspace archived
      trackWorkspaceArchived(input.id)

      // Kill terminal processes in background (don't await)
      terminalManager.killByWorkspaceId(input.id).then((killResult) => {
        if (killResult.killed > 0) {
          console.log(
            `[chats.archive] Killed ${killResult.killed} terminal session(s) for workspace ${input.id}`,
          )
        }
      }).catch((error) => {
        console.error(`[chats.archive] Error killing processes:`, error)
      })

      // Optionally delete worktree in background (don't await)
      if (input.deleteWorktree && chat?.worktreePath && chat?.branch) {
        const project = db
          .select()
          .from(projects)
          .where(eq(projects.id, chat.projectId))
          .get()

        if (project) {
          removeWorktree(project.path, chat.worktreePath).then((worktreeResult) => {
            if (worktreeResult.success) {
              console.log(
                `[chats.archive] Deleted worktree for workspace ${input.id}`,
              )
              // Clear worktreePath since it's deleted (keep branch for reference)
              db.update(chats)
                .set({ worktreePath: null })
                .where(eq(chats.id, input.id))
                .run()
            } else {
              console.warn(
                `[chats.archive] Failed to delete worktree: ${worktreeResult.error}`,
              )
            }
          }).catch((error) => {
            console.error(`[chats.archive] Error removing worktree:`, error)
          })
        }
      }

      return result
    }),

  /**
   * Restore an archived chat
   */
  restore: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => {
      const db = getDatabase()
      return db
        .update(chats)
        .set({ archivedAt: null })
        .where(eq(chats.id, input.id))
        .returning()
        .get()
    }),

  /**
   * Archive multiple chats at once (also kills terminal processes in each workspace)
   */
  archiveBatch: publicProcedure
    .input(z.object({ chatIds: z.array(z.string()) }))
    .mutation(({ input }) => {
      const db = getDatabase()
      if (input.chatIds.length === 0) return []

      // Archive immediately (optimistic)
      const result = db
        .update(chats)
        .set({ archivedAt: new Date() })
        .where(inArray(chats.id, input.chatIds))
        .returning()
        .all()

      // Kill terminal processes for all workspaces in background (don't await)
      Promise.all(
        input.chatIds.map((id) => terminalManager.killByWorkspaceId(id)),
      ).then((killResults) => {
        const totalKilled = killResults.reduce((sum, r) => sum + r.killed, 0)
        if (totalKilled > 0) {
          console.log(
            `[chats.archiveBatch] Killed ${totalKilled} terminal session(s) for ${input.chatIds.length} workspace(s)`,
          )
        }
      }).catch((error) => {
        console.error(`[chats.archiveBatch] Error killing processes:`, error)
      })

      return result
    }),

  /**
   * Delete a chat permanently (with worktree cleanup)
   */
  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const db = getDatabase()

      // Get chat before deletion
      const chat = db.select().from(chats).where(eq(chats.id, input.id)).get()

      // Cleanup worktree if it was created (has branch = was a real worktree, not just project path)
      if (chat?.worktreePath && chat?.branch) {
        const project = db
          .select()
          .from(projects)
          .where(eq(projects.id, chat.projectId))
          .get()
        if (project) {
          const result = await removeWorktree(project.path, chat.worktreePath)
          if (!result.success) {
            console.warn(`[Worktree] Cleanup failed: ${result.error}`)
          }
        }
      }

      // Track workspace deleted
      trackWorkspaceDeleted(input.id)

      return db.delete(chats).where(eq(chats.id, input.id)).returning().get()
    }),

  // ============ Sub-chat procedures ============

  /**
   * Get a single sub-chat
   */
  getSubChat: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) => {
      const db = getDatabase()
      const subChat = db
        .select()
        .from(subChats)
        .where(eq(subChats.id, input.id))
        .get()

      if (!subChat) return null

      const chat = db
        .select()
        .from(chats)
        .where(eq(chats.id, subChat.chatId))
        .get()

      const project = chat
        ? db
            .select()
            .from(projects)
            .where(eq(projects.id, chat.projectId))
            .get()
        : null

      return { ...subChat, chat: chat ? { ...chat, project } : null }
    }),

  /**
   * Create a new sub-chat
   */
  createSubChat: publicProcedure
    .input(
      z.object({
        chatId: z.string(),
        name: z.string().optional(),
        mode: z.enum(["plan", "agent"]).default("agent"),
      }),
    )
    .mutation(({ input }) => {
      const db = getDatabase()
      return db
        .insert(subChats)
        .values({
          chatId: input.chatId,
          name: input.name,
          mode: input.mode,
          messages: "[]",
        })
        .returning()
        .get()
    }),

  /**
   * Update sub-chat messages
   */
  updateSubChatMessages: publicProcedure
    .input(z.object({ id: z.string(), messages: z.string() }))
    .mutation(({ input }) => {
      const db = getDatabase()
      return db
        .update(subChats)
        .set({ messages: input.messages, updatedAt: new Date() })
        .where(eq(subChats.id, input.id))
        .returning()
        .get()
    }),

  /**
   * Update sub-chat session ID (for Claude resume)
   */
  updateSubChatSession: publicProcedure
    .input(z.object({ id: z.string(), sessionId: z.string().nullable() }))
    .mutation(({ input }) => {
      const db = getDatabase()
      return db
        .update(subChats)
        .set({ sessionId: input.sessionId })
        .where(eq(subChats.id, input.id))
        .returning()
        .get()
    }),

  /**
   * Update sub-chat mode
   */
  updateSubChatMode: publicProcedure
    .input(z.object({ id: z.string(), mode: z.enum(["plan", "agent"]) }))
    .mutation(({ input }) => {
      const db = getDatabase()
      return db
        .update(subChats)
        .set({ mode: input.mode })
        .where(eq(subChats.id, input.id))
        .returning()
        .get()
    }),

  /**
   * Rename a sub-chat
   */
  renameSubChat: publicProcedure
    .input(z.object({ id: z.string(), name: z.string().min(1) }))
    .mutation(({ input }) => {
      const db = getDatabase()
      return db
        .update(subChats)
        .set({ name: input.name })
        .where(eq(subChats.id, input.id))
        .returning()
        .get()
    }),

  /**
   * Delete a sub-chat
   */
  deleteSubChat: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => {
      const db = getDatabase()
      return db
        .delete(subChats)
        .where(eq(subChats.id, input.id))
        .returning()
        .get()
    }),

  /**
   * Get git diff for a chat's worktree
   */
  getDiff: publicProcedure
    .input(z.object({ chatId: z.string() }))
    .query(async ({ input }) => {
      const db = getDatabase()
      const chat = db
        .select()
        .from(chats)
        .where(eq(chats.id, input.chatId))
        .get()

      if (!chat?.worktreePath) {
        return { diff: null, error: "No worktree path" }
      }

      const result = await getWorktreeDiff(
        chat.worktreePath,
        chat.baseBranch ?? undefined,
      )

      if (!result.success) {
        return { diff: null, error: result.error }
      }

      return { diff: result.diff || "" }
    }),

  /**
   * Generate a name for a sub-chat using AI (calls web API)
   * Always uses production API since it's a lightweight call
   */
  generateSubChatName: publicProcedure
    .input(z.object({ userMessage: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const authManager = getAuthManager()
        const token = await authManager.getValidToken()
        // Always use production API for name generation
        const apiUrl = "https://21st.dev"

        console.log(
          "[generateSubChatName] Calling API with token:",
          token ? "present" : "missing",
        )
        console.log(
          "[generateSubChatName] URL:",
          `${apiUrl}/api/agents/sub-chat/generate-name`,
        )

        const response = await fetch(
          `${apiUrl}/api/agents/sub-chat/generate-name`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token && { "X-Desktop-Token": token }),
            },
            body: JSON.stringify({ userMessage: input.userMessage }),
          },
        )

        console.log("[generateSubChatName] Response status:", response.status)

        if (!response.ok) {
          const errorText = await response.text()
          console.error(
            "[generateSubChatName] API error:",
            response.status,
            errorText,
          )
          return { name: getFallbackName(input.userMessage) }
        }

        const data = await response.json()
        console.log("[generateSubChatName] Generated name:", data.name)
        return { name: data.name || getFallbackName(input.userMessage) }
      } catch (error) {
        console.error("[generateSubChatName] Error:", error)
        return { name: getFallbackName(input.userMessage) }
      }
    }),

  // ============ PR-related procedures ============

  /**
   * Get PR context for message generation (branch info, uncommitted changes, etc.)
   */
  getPrContext: publicProcedure
    .input(z.object({ chatId: z.string() }))
    .query(async ({ input }) => {
      const db = getDatabase()
      const chat = db
        .select()
        .from(chats)
        .where(eq(chats.id, input.chatId))
        .get()

      if (!chat?.worktreePath) {
        return null
      }

      try {
        const git = simpleGit(chat.worktreePath)
        const status = await git.status()

        // Check if upstream exists
        let hasUpstream = false
        try {
          const tracking = await git.raw([
            "rev-parse",
            "--abbrev-ref",
            "@{upstream}",
          ])
          hasUpstream = !!tracking.trim()
        } catch {
          hasUpstream = false
        }

        return {
          branch: chat.branch || status.current || "unknown",
          baseBranch: chat.baseBranch || "main",
          uncommittedCount: status.files.length,
          hasUpstream,
        }
      } catch (error) {
        console.error("[getPrContext] Error:", error)
        return null
      }
    }),

  /**
   * Update PR info after Claude creates a PR
   */
  updatePrInfo: publicProcedure
    .input(
      z.object({
        chatId: z.string(),
        prUrl: z.string(),
        prNumber: z.number(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDatabase()
      const result = db
        .update(chats)
        .set({
          prUrl: input.prUrl,
          prNumber: input.prNumber,
          updatedAt: new Date(),
        })
        .where(eq(chats.id, input.chatId))
        .returning()
        .get()

      // Track PR created
      trackPRCreated({
        workspaceId: input.chatId,
        prNumber: input.prNumber,
      })

      return result
    }),

  /**
   * Get PR status from GitHub (via gh CLI)
   */
  getPrStatus: publicProcedure
    .input(z.object({ chatId: z.string() }))
    .query(async ({ input }) => {
      const db = getDatabase()
      const chat = db
        .select()
        .from(chats)
        .where(eq(chats.id, input.chatId))
        .get()

      if (!chat?.worktreePath) {
        return null
      }

      return await fetchGitHubPRStatus(chat.worktreePath)
    }),

  /**
   * Merge PR via gh CLI
   */
  mergePr: publicProcedure
    .input(
      z.object({
        chatId: z.string(),
        method: z.enum(["merge", "squash", "rebase"]).default("squash"),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDatabase()
      const chat = db
        .select()
        .from(chats)
        .where(eq(chats.id, input.chatId))
        .get()

      if (!chat?.worktreePath || !chat?.prNumber) {
        throw new Error("No PR to merge")
      }

      try {
        await execWithShellEnv(
          "gh",
          [
            "pr",
            "merge",
            String(chat.prNumber),
            `--${input.method}`,
            "--delete-branch",
          ],
          { cwd: chat.worktreePath },
        )
        return { success: true }
      } catch (error) {
        console.error("[mergePr] Error:", error)
        throw new Error(
          error instanceof Error ? error.message : "Failed to merge PR",
        )
      }
    }),

  /**
   * Get file change stats for all workspaces
   * Parses messages from all sub-chats and aggregates Edit/Write tool calls
   * If openSubChatIds provided, only count stats from those sub-chats
   */
  getFileStats: publicProcedure
    .input(z.object({ openSubChatIds: z.array(z.string()).optional() }).optional())
    .query(({ input }) => {
    const db = getDatabase()
    const openSubChatIdsSet = input?.openSubChatIds ? new Set(input.openSubChatIds) : null

    // Get all non-archived chats with their sub-chats
    const allChats = db
      .select({
        chatId: chats.id,
        subChatId: subChats.id,
        messages: subChats.messages,
      })
      .from(chats)
      .leftJoin(subChats, eq(subChats.chatId, chats.id))
      .where(isNull(chats.archivedAt))
      .all()
      // Filter by open sub-chats if provided
      .filter(row => !openSubChatIdsSet || !row.subChatId || openSubChatIdsSet.has(row.subChatId))

    // Aggregate stats per workspace (chatId)
    const statsMap = new Map<
      string,
      { additions: number; deletions: number; fileCount: number }
    >()

    for (const row of allChats) {
      if (!row.messages || !row.chatId) continue

      try {
        const messages = JSON.parse(row.messages) as Array<{
          role: string
          parts?: Array<{
            type: string
            input?: {
              file_path?: string
              old_string?: string
              new_string?: string
              content?: string
            }
          }>
        }>

        // Track file states for this sub-chat
        const fileStates = new Map<
          string,
          { originalContent: string | null; currentContent: string }
        >()

        for (const msg of messages) {
          if (msg.role !== "assistant") continue
          for (const part of msg.parts || []) {
            if (part.type === "tool-Edit" || part.type === "tool-Write") {
              const filePath = part.input?.file_path
              if (!filePath) continue
              // Skip session files
              if (
                filePath.includes("claude-sessions") ||
                filePath.includes("Application Support")
              )
                continue

              const oldString = part.input?.old_string || ""
              const newString =
                part.input?.new_string || part.input?.content || ""

              const existing = fileStates.get(filePath)
              if (existing) {
                existing.currentContent = newString
              } else {
                fileStates.set(filePath, {
                  originalContent: part.type === "tool-Write" ? null : oldString,
                  currentContent: newString,
                })
              }
            }
          }
        }

        // Calculate stats for this sub-chat and add to workspace total
        let subChatAdditions = 0
        let subChatDeletions = 0
        let subChatFileCount = 0

        for (const [, state] of fileStates) {
          const original = state.originalContent || ""
          if (original === state.currentContent) continue

          const oldLines = original ? original.split("\n").length : 0
          const newLines = state.currentContent
            ? state.currentContent.split("\n").length
            : 0

          if (!original) {
            // New file
            subChatAdditions += newLines
          } else {
            subChatAdditions += newLines
            subChatDeletions += oldLines
          }
          subChatFileCount += 1
        }

        // Add to workspace total
        const existing = statsMap.get(row.chatId) || {
          additions: 0,
          deletions: 0,
          fileCount: 0,
        }
        existing.additions += subChatAdditions
        existing.deletions += subChatDeletions
        existing.fileCount += subChatFileCount
        statsMap.set(row.chatId, existing)
      } catch {
        // Skip invalid JSON
      }
    }

    // Convert to array for easier consumption
    return Array.from(statsMap.entries()).map(([chatId, stats]) => ({
      chatId,
      ...stats,
    }))
  }),

  /**
   * Get sub-chats with pending plan approvals
   * Parses messages to find ExitPlanMode tool calls without subsequent "Implement plan" user message
   * Logic must match active-chat.tsx hasUnapprovedPlan
   * If openSubChatIds provided, only check those sub-chats
   */
  getPendingPlanApprovals: publicProcedure
    .input(z.object({ openSubChatIds: z.array(z.string()).optional() }).optional())
    .query(({ input }) => {
    const db = getDatabase()
    const openSubChatIdsSet = input?.openSubChatIds ? new Set(input.openSubChatIds) : null

    // Get all non-archived chats with their sub-chats
    const allSubChats = db
      .select({
        chatId: chats.id,
        subChatId: subChats.id,
        messages: subChats.messages,
      })
      .from(chats)
      .leftJoin(subChats, eq(subChats.chatId, chats.id))
      .where(isNull(chats.archivedAt))
      .all()
      // Filter by open sub-chats if provided
      .filter(row => !openSubChatIdsSet || !row.subChatId || openSubChatIdsSet.has(row.subChatId))

    const pendingApprovals: Array<{ subChatId: string; chatId: string }> = []

    for (const row of allSubChats) {
      if (!row.messages || !row.subChatId || !row.chatId) continue

      try {
        const messages = JSON.parse(row.messages) as Array<{
          role: string
          content?: string
          parts?: Array<{
            type: string
            text?: string
          }>
        }>

        // Traverse messages from end to find unapproved ExitPlanMode
        // Logic matches active-chat.tsx hasUnapprovedPlan
        let hasUnapprovedPlan = false

        for (let i = messages.length - 1; i >= 0; i--) {
          const msg = messages[i]
          if (!msg) continue

          // If user message says "Implement plan" (exact match), plan is already approved
          if (msg.role === "user") {
            const textPart = msg.parts?.find((p) => p.type === "text")
            const text = textPart?.text || ""
            if (text.trim().toLowerCase() === "implement plan") {
              break // Plan was approved, stop searching
            }
          }

          // If assistant message with ExitPlanMode, we found an unapproved plan
          if (msg.role === "assistant" && msg.parts) {
            const exitPlanPart = msg.parts.find((p) => p.type === "tool-ExitPlanMode")
            if (exitPlanPart) {
              hasUnapprovedPlan = true
              break
            }
          }
        }

        if (hasUnapprovedPlan) {
          pendingApprovals.push({
            subChatId: row.subChatId,
            chatId: row.chatId,
          })
        }
      } catch {
        // Skip invalid JSON
      }
    }

    return pendingApprovals
  }),

  /**
   * Get worktree status for archive dialog
   * Returns whether workspace has a worktree and uncommitted changes count
   */
  getWorktreeStatus: publicProcedure
    .input(z.object({ chatId: z.string() }))
    .query(async ({ input }) => {
      const db = getDatabase()
      const chat = db
        .select()
        .from(chats)
        .where(eq(chats.id, input.chatId))
        .get()

      // No worktree if no branch (local mode)
      if (!chat?.worktreePath || !chat?.branch) {
        return { hasWorktree: false, uncommittedCount: 0 }
      }

      try {
        const git = simpleGit(chat.worktreePath)
        const status = await git.status()

        return {
          hasWorktree: true,
          uncommittedCount: status.files.length,
        }
      } catch (error) {
        // Worktree path doesn't exist or git error
        console.warn("[getWorktreeStatus] Error checking worktree:", error)
        return { hasWorktree: false, uncommittedCount: 0 }
      }
    }),

  /**
   * Export a chat conversation to various formats.
   * Useful for sharing, backup, or importing into other tools.
   */
  exportChat: publicProcedure
    .input(
      z.object({
        chatId: z.string(),
        format: z.enum(["json", "markdown", "text"]).default("markdown"),
        includeMetadata: z.boolean().default(false),
      }),
    )
    .query(async ({ input }) => {
      const db = getDatabase()
      const chat = db
        .select()
        .from(chats)
        .where(eq(chats.id, input.chatId))
        .get()

      if (!chat) {
        throw new Error("Chat not found")
      }

      const project = db
        .select()
        .from(projects)
        .where(eq(projects.id, chat.projectId))
        .get()

      const chatSubChats = db
        .select()
        .from(subChats)
        .where(eq(subChats.chatId, input.chatId))
        .orderBy(subChats.createdAt)
        .all()

      // parse messages from all sub-chats
      const allMessages: Array<{
        subChatId: string
        subChatName: string | null
        messages: Array<{
          id: string
          role: string
          parts: Array<{ type: string; text?: string; [key: string]: any }>
          metadata?: any
        }>
      }> = []

      for (const subChat of chatSubChats) {
        try {
          const messages = JSON.parse(subChat.messages || "[]")
          allMessages.push({
            subChatId: subChat.id,
            subChatName: subChat.name,
            messages,
          })
        } catch {
          // skip invalid json
        }
      }

      if (input.format === "json") {
        return {
          format: "json" as const,
          content: JSON.stringify(
            {
              exportedAt: new Date().toISOString(),
              chat: {
                id: chat.id,
                name: chat.name,
                createdAt: chat.createdAt,
                branch: chat.branch,
                baseBranch: chat.baseBranch,
                prUrl: chat.prUrl,
              },
              project: project
                ? {
                    id: project.id,
                    name: project.name,
                    path: project.path,
                  }
                : null,
              conversations: allMessages,
            },
            null,
            2,
          ),
          filename: `${chat.name || "chat"}-${chat.id.slice(0, 8)}.json`,
        }
      }

      if (input.format === "text") {
        // plain text format
        let text = `# ${chat.name || "Untitled Chat"}\n`
        text += `exported: ${new Date().toISOString()}\n`
        if (project) {
          text += `project: ${project.name}\n`
        }
        text += `\n---\n\n`

        for (const subChatData of allMessages) {
          if (subChatData.subChatName) {
            text += `## ${subChatData.subChatName}\n\n`
          }

          for (const msg of subChatData.messages) {
            const role = msg.role === "user" ? "You" : "Assistant"
            text += `${role}:\n`

            for (const part of msg.parts || []) {
              if (part.type === "text" && part.text) {
                text += `${part.text}\n`
              } else if (part.type?.startsWith("tool-") && part.toolName) {
                text += `[used ${part.toolName} tool]\n`
              }
            }
            text += "\n"
          }
        }

        return {
          format: "text" as const,
          content: text,
          filename: `${chat.name || "chat"}-${chat.id.slice(0, 8)}.txt`,
        }
      }

      // markdown format (default)
      let markdown = `# ${chat.name || "Untitled Chat"}\n\n`
      markdown += `**Exported:** ${new Date().toISOString()}\n\n`
      if (project) {
        markdown += `**Project:** ${project.name}\n\n`
      }
      if (chat.branch) {
        markdown += `**Branch:** \`${chat.branch}\`\n\n`
      }
      if (chat.prUrl) {
        markdown += `**PR:** [${chat.prUrl}](${chat.prUrl})\n\n`
      }
      markdown += `---\n\n`

      for (const subChatData of allMessages) {
        if (subChatData.subChatName) {
          markdown += `## ${subChatData.subChatName}\n\n`
        }

        for (const msg of subChatData.messages) {
          const role = msg.role === "user" ? "**You**" : "**Assistant**"
          markdown += `### ${role}\n\n`

          for (const part of msg.parts || []) {
            if (part.type === "text" && part.text) {
              markdown += `${part.text}\n\n`
            } else if (part.type?.startsWith("tool-") && part.toolName) {
              const toolName = part.toolName
              if (toolName === "Bash" && part.input?.command) {
                markdown += `\`\`\`bash\n${part.input.command}\n\`\`\`\n\n`
              } else if (
                (toolName === "Edit" || toolName === "Write") &&
                part.input?.file_path
              ) {
                markdown += `> Modified: \`${part.input.file_path}\`\n\n`
              } else if (toolName === "Read" && part.input?.file_path) {
                markdown += `> Read: \`${part.input.file_path}\`\n\n`
              } else {
                markdown += `> *Used ${toolName} tool*\n\n`
              }
            }
          }
        }
      }

      return {
        format: "markdown" as const,
        content: markdown,
        filename: `${chat.name || "chat"}-${chat.id.slice(0, 8)}.md`,
      }
    }),

  /**
   * Get basic stats for a chat (message count, tool usage, etc.)
   * Useful for showing chat summary in sidebar or export dialogs.
   */
  getChatStats: publicProcedure
    .input(z.object({ chatId: z.string() }))
    .query(({ input }) => {
      const db = getDatabase()
      const chatSubChats = db
        .select()
        .from(subChats)
        .where(eq(subChats.chatId, input.chatId))
        .all()

      let messageCount = 0
      let userMessageCount = 0
      let assistantMessageCount = 0
      let toolCalls = 0
      const toolUsage: Record<string, number> = {}
      let totalInputTokens = 0
      let totalOutputTokens = 0

      for (const subChat of chatSubChats) {
        try {
          const messages = JSON.parse(subChat.messages || "[]") as Array<{
            role: string
            parts?: Array<{ type: string; toolName?: string }>
            metadata?: { usage?: { inputTokens?: number; outputTokens?: number } }
          }>

          for (const msg of messages) {
            messageCount++
            if (msg.role === "user") {
              userMessageCount++
            } else if (msg.role === "assistant") {
              assistantMessageCount++

              // count tool calls
              for (const part of msg.parts || []) {
                if (part.type?.startsWith("tool-") && part.toolName) {
                  toolCalls++
                  toolUsage[part.toolName] = (toolUsage[part.toolName] || 0) + 1
                }
              }

              // aggregate token usage
              if (msg.metadata?.usage) {
                totalInputTokens += msg.metadata.usage.inputTokens || 0
                totalOutputTokens += msg.metadata.usage.outputTokens || 0
              }
            }
          }
        } catch {
          // skip invalid json
        }
      }

      return {
        messageCount,
        userMessageCount,
        assistantMessageCount,
        toolCalls,
        toolUsage,
        totalInputTokens,
        totalOutputTokens,
        subChatCount: chatSubChats.length,
      }
    }),
})

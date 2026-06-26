import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm"
import { z } from "zod"
import {
  agentChatProviders,
  buildAgentChatMessageMetadata,
} from "../../../../shared/agent-chat-provider"
import { agentUserMessagePartSchema } from "../../../../shared/chat-message"
import {
  trackWorkspaceArchived,
  trackWorkspaceCreated,
  trackWorkspaceDeleted,
} from "../../analytics"
import { attachProjectToChat } from "../../chat-project-attach"
import { cleanupChatWorkspaceForDelete } from "../../chats/workspace-cleanup"
import { chats, getDatabase, projects, subChats } from "../../db"
import { removeWorktree } from "../../git"
import { gitCache } from "../../git/cache"
import { resolveProjectChatWorktree } from "../../project-chat-worktree"
import { terminalManager } from "../../terminal/manager"
import { publicProcedure } from "../index"
import {
  sendWorktreeSetupApprovalRequired,
  sendWorktreeSetupFailure,
} from "./chats-helpers"

export const chatCrudProcedures = {
  /**
   * List all non-archived chats (optionally filter by project)
   */
  list: publicProcedure
    .input(z.object({ projectId: z.string().nullable().optional() }))
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
    .input(z.object({ projectId: z.string().nullable().optional() }))
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

      const project = chat.projectId
        ? db
            .select()
            .from(projects)
            .where(eq(projects.id, chat.projectId))
            .get()
        : null

      return { ...chat, subChats: chatSubChats, project }
    }),

  /**
   * Create a new chat with optional git worktree
   */
  create: publicProcedure
    .input(
      z.object({
        projectId: z.string().nullable().optional(),
        name: z.string().optional(),
        model: z.string().optional(),
        provider: z.enum(agentChatProviders).optional(),
        modelSource: z.string().optional(),
        providerProfileId: z.string().nullable().optional(),
        initialMessage: z.string().optional(),
        initialMessageParts: z.array(agentUserMessagePartSchema).optional(),
        baseBranch: z.string().optional(), // Branch to base the worktree off
        branchType: z.enum(["local", "remote"]).optional(), // Whether baseBranch is local or remote
        useWorktree: z.boolean().default(true), // If false, work directly in project dir
        mode: z.enum(["plan", "agent"]).default("agent"),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      console.log("[chats.create] called with:", input)
      const db = getDatabase()
      const requestingWindowId = ctx.getWindow?.()?.id ?? null

      // Get project path when creating a project-backed workspace.
      const project = input.projectId
        ? db
            .select()
            .from(projects)
            .where(eq(projects.id, input.projectId))
            .get()
        : null
      console.log("[chats.create] found project:", project)
      if (input.projectId && !project) throw new Error("Project not found")

      // Create chat (fast path)
      const chat = db
        .insert(chats)
        .values({
          name: input.name,
          projectId: input.projectId ?? null,
        })
        .returning()
        .get()
      console.log("[chats.create] created chat:", chat)

      // Create initial sub-chat with user message (AI SDK format)
      // If initialMessageParts is provided, use it; otherwise fallback to text-only message
      let initialMessages = "[]"
      const initialMetadata = buildAgentChatMessageMetadata({
        model: input.model,
        provider: input.provider,
        modelSource: input.modelSource,
        providerProfileId: input.providerProfileId,
      })

      if (input.initialMessageParts && input.initialMessageParts.length > 0) {
        initialMessages = JSON.stringify([
          {
            id: `msg-${Date.now()}`,
            role: "user",
            createdAt: new Date().toISOString(),
            parts: input.initialMessageParts,
            ...(initialMetadata ? { metadata: initialMetadata } : {}),
          },
        ])
      } else if (input.initialMessage) {
        initialMessages = JSON.stringify([
          {
            id: `msg-${Date.now()}`,
            role: "user",
            createdAt: new Date().toISOString(),
            parts: [{ type: "text", text: input.initialMessage }],
            ...(initialMetadata ? { metadata: initialMetadata } : {}),
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

      // Only create worktree if this is a project-backed workspace.
      let worktreeResult: {
        worktreePath?: string
        branch?: string
        baseBranch?: string
      } = {}
      if (!project) {
        console.log("[chats.create] folderless quick chat - no worktree")
      } else {
        if (input.useWorktree) {
          console.log(
            "[chats.create] creating worktree with baseBranch:",
            input.baseBranch,
            "type:",
            input.branchType,
          )
        } else {
          console.log("[chats.create] local mode - using project path directly")
        }
        worktreeResult = await resolveProjectChatWorktree({
          chatId: chat.id,
          project,
          useWorktree: input.useWorktree,
          baseBranch: input.baseBranch,
          branchType: input.branchType,
          onWorktreeFailure: (payload) =>
            sendWorktreeSetupFailure(requestingWindowId, payload),
          onWorktreeSetupApprovalRequired: (request) =>
            sendWorktreeSetupApprovalRequired(requestingWindowId, request),
        })
        console.log("[chats.create] worktree result:", worktreeResult)
        db.update(chats).set(worktreeResult).where(eq(chats.id, chat.id)).run()
      }

      const response = {
        ...chat,
        projectId: input.projectId ?? null,
        worktreePath: worktreeResult.worktreePath || project?.path || null,
        branch: worktreeResult.branch,
        baseBranch: worktreeResult.baseBranch,
        subChats: [subChat],
      }

      // Track workspace created
      trackWorkspaceCreated({
        id: chat.id,
        projectId: input.projectId ?? null,
        useWorktree: Boolean(project && input.useWorktree),
      })

      console.log("[chats.create] returning:", response)
      return response
    }),

  /**
   * Attach a folderless quick chat to a project in place.
   */
  attachProject: publicProcedure
    .input(
      z.object({
        chatId: z.string(),
        projectId: z.string(),
        useWorktree: z.boolean().default(true),
        baseBranch: z.string().optional(),
        branchType: z.enum(["local", "remote"]).optional(),
        targetMode: z.enum(["plan", "agent"]).default("agent"),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDatabase()
      const requestingWindowId = ctx.getWindow?.()?.id ?? null

      return attachProjectToChat(db, {
        chatId: input.chatId,
        projectId: input.projectId,
        useWorktree: input.useWorktree,
        baseBranch: input.baseBranch,
        branchType: input.branchType,
        targetMode: input.targetMode,
        onWorktreeFailure: (payload) =>
          sendWorktreeSetupFailure(requestingWindowId, payload),
        onWorktreeSetupApprovalRequired: (request) =>
          sendWorktreeSetupApprovalRequired(requestingWindowId, request),
      })
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
      const chat = db.select().from(chats).where(eq(chats.id, input.id)).get()

      // Archive immediately (optimistic)
      const result = db
        .update(chats)
        .set({ archivedAt: new Date() })
        .where(eq(chats.id, input.id))
        .returning()
        .get()

      // Track workspace archived
      trackWorkspaceArchived(input.id)

      // Kill terminal processes only for worktree-mode workspaces.
      // Local-mode terminals are shared across workspaces on the same project path,
      // so they should not be killed when a single workspace is archived.
      const isLocalMode = !chat?.branch
      if (!isLocalMode) {
        terminalManager
          .killByWorkspaceId(input.id)
          .then((killResult) => {
            if (killResult.killed > 0) {
              console.log(
                `[chats.archive] Killed ${killResult.killed} terminal session(s) for workspace ${input.id}`,
              )
            }
          })
          .catch((error) => {
            console.error(`[chats.archive] Error killing processes:`, error)
          })
      }

      // Optionally delete worktree in background (don't await)
      if (
        input.deleteWorktree &&
        chat?.worktreePath &&
        chat?.branch &&
        chat.projectId
      ) {
        const project = db
          .select()
          .from(projects)
          .where(eq(projects.id, chat.projectId))
          .get()

        if (project) {
          removeWorktree(project.path, chat.worktreePath)
            .then((worktreeResult) => {
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
            })
            .catch((error) => {
              console.error(`[chats.archive] Error removing worktree:`, error)
            })
        }
      }

      // Invalidate git cache for this worktree
      if (chat?.worktreePath) {
        gitCache.invalidateStatus(chat.worktreePath)
        gitCache.invalidateParsedDiff(chat.worktreePath)
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

      // Identify worktree-mode workspaces before archiving (for terminal cleanup)
      const worktreeChats = db
        .select({ id: chats.id, branch: chats.branch })
        .from(chats)
        .where(inArray(chats.id, input.chatIds))
        .all()
        .filter((c) => c.branch != null)

      // Archive immediately (optimistic)
      const result = db
        .update(chats)
        .set({ archivedAt: new Date() })
        .where(inArray(chats.id, input.chatIds))
        .returning()
        .all()

      // Kill terminal processes only for worktree-mode workspaces.
      // Local-mode terminals are shared and should not be killed.

      if (worktreeChats.length > 0) {
        Promise.all(
          worktreeChats.map((c) => terminalManager.killByWorkspaceId(c.id)),
        )
          .then((killResults) => {
            const totalKilled = killResults.reduce(
              (sum, r) => sum + r.killed,
              0,
            )
            if (totalKilled > 0) {
              console.log(
                `[chats.archiveBatch] Killed ${totalKilled} terminal session(s) for ${worktreeChats.length} worktree workspace(s)`,
              )
            }
          })
          .catch((error) => {
            console.error(
              `[chats.archiveBatch] Error killing processes:`,
              error,
            )
          })
      }

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
      const project = chat?.projectId
        ? db
            .select()
            .from(projects)
            .where(eq(projects.id, chat.projectId))
            .get()
        : null
      const cleanup = await cleanupChatWorkspaceForDelete(chat, project)
      if (!cleanup.success) {
        console.warn(
          `[chats.delete] Workspace cleanup had ${cleanup.errors.length} error(s): ${cleanup.errors.join("; ")}`,
        )
      }

      // Track workspace deleted
      trackWorkspaceDeleted(input.id)

      return db.delete(chats).where(eq(chats.id, input.id)).returning().get()
    }),

  // ============ Sub-chat procedures ============

  /**
   * Get a single sub-chat
   */
}

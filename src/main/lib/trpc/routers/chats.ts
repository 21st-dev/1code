import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm"
import { BrowserWindow } from "electron"
import * as fs from "fs/promises"
import * as path from "path"
import simpleGit from "simple-git"
import { z } from "zod"
import { getAuthManager } from "../../../index"
import {
  trackPRCreated,
  trackWorkspaceArchived,
  trackWorkspaceCreated,
  trackWorkspaceDeleted,
} from "../../analytics"
import { chats, getDatabase, projects, subChats } from "../../db"
import { computeFileStatsFromMessages } from "../../file-stats"
import {
  createWorktreeForChat,
  getWorktreeDiff,
  removeWorktree,
  sanitizeProjectName,
} from "../../git"
import {
  fetchPRStatus,
  fetchPRComments,
  invalidatePRCache,
  mergePR,
  updatePRTitle,
} from "../../git/providers"
import type { WorktreeSetupResult } from "../../git/worktree-config"
import { computeContentHash, gitCache } from "../../git/cache"
import { splitUnifiedDiffByFile } from "../../git/diff-parser"
import { applyRollbackStash } from "../../git/stash"
import { checkInternetConnection, checkOllamaStatus } from "../../ollama"
import { terminalManager } from "../../terminal/manager"
import { publicProcedure, router } from "../index"
import { abortClaudeSessionsForSubChats } from "./claude"

type WorktreeSetupFailurePayload = {
  kind: "create-failed" | "setup-failed"
  message: string
  projectId: string
}

function sendWorktreeSetupFailure(
  windowId: number | null,
  payload: WorktreeSetupFailurePayload,
): void {
  const targets: BrowserWindow[] = []

  if (windowId !== null) {
    const window = BrowserWindow.fromId(windowId)
    if (window && !window.isDestroyed()) {
      targets.push(window)
    }
  }

  if (targets.length === 0) {
    targets.push(...BrowserWindow.getAllWindows())
  }

  for (const window of targets) {
    if (window.isDestroyed()) continue
    window.webContents.send("worktree:setup-failed", payload)
  }
}

// Fallback to truncated user message if AI generation fails
function getFallbackName(userMessage: string): string {
  const trimmed = userMessage.trim()
  if (trimmed.length <= 25) {
    return trimmed || "New Chat"
  }
  return trimmed.substring(0, 25) + "..."
}

/**
 * Generate text using local Ollama model
 * Used for chat title generation in offline mode
 * @param userMessage - The user message to generate a title for
 * @param model - Optional model to use (if not provided, uses recommended model)
 */
async function generateChatNameWithOllama(
  userMessage: string,
  model?: string | null
): Promise<string | null> {
  try {
    const ollamaStatus = await checkOllamaStatus()
    if (!ollamaStatus.available) {
      return null
    }

    // Use provided model, or recommended, or first available
    const modelToUse = model || ollamaStatus.recommendedModel || ollamaStatus.models[0]
    if (!modelToUse) {
      console.error("[Ollama] No model available")
      return null
    }

    const prompt = `Generate a very short (2-5 words) title for a coding chat that starts with this message. The title MUST be in the same language as the user's message. Only output the title, nothing else. No quotes, no explanations.

User message: "${userMessage.slice(0, 500)}"

Title:`

    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelToUse,
        prompt,
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 50,
        },
      }),
    })

    if (!response.ok) {
      console.error("[Ollama] Generate chat name failed:", response.status)
      return null
    }

    const data = await response.json()
    const result = data.response?.trim()
    if (result) {
      // Clean up the result - remove quotes, trim, limit length
      const cleaned = result
        .replace(/^["']|["']$/g, "")
        .replace(/^title:\s*/i, "")
        .trim()
        .slice(0, 50)
      if (cleaned.length > 0) {
        return cleaned
      }
    }
    return null
  } catch (error) {
    console.error("[Ollama] Generate chat name error:", error)
    return null
  }
}

/**
 * Generate commit message using local Ollama model
 * Used for commit message generation in offline mode
 * @param diff - The diff text
 * @param fileCount - Number of files changed
 * @param additions - Lines added
 * @param deletions - Lines deleted
 * @param model - Optional model to use (if not provided, uses recommended model)
 */
async function generateCommitMessageWithOllama(
  diff: string,
  fileCount: number,
  additions: number,
  deletions: number,
  model?: string | null
): Promise<string | null> {
  try {
    const ollamaStatus = await checkOllamaStatus()
    if (!ollamaStatus.available) {
      return null
    }

    // Use provided model, or recommended, or first available
    const modelToUse = model || ollamaStatus.recommendedModel || ollamaStatus.models[0]
    if (!modelToUse) {
      console.error("[Ollama] No model available")
      return null
    }

    const prompt = `Generate a conventional commit message for these changes. Use format: type: short description

Types: feat (new feature), fix (bug fix), docs, style, refactor, test, chore

Changes: ${fileCount} files, +${additions}/-${deletions} lines

Diff (truncated):
${diff.slice(0, 3000)}

Commit message:`

    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelToUse,
        prompt,
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 50,
        },
      }),
    })

    if (!response.ok) {
      console.error("[Ollama] Generate commit message failed:", response.status)
      return null
    }

    const data = await response.json()
    const result = data.response?.trim()
    if (result) {
      // Clean up - get just the first line
      const firstLine = result.split("\n")[0]?.trim()
      if (firstLine && firstLine.length > 0 && firstLine.length < 100) {
        return firstLine
      }
    }
    return null
  } catch (error) {
    console.error("[Ollama] Generate commit message error:", error)
    return null
  }
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
        model: z.string().optional(),
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
              // Hidden file content - sent to agent but not displayed in UI
              z.object({
                type: z.literal("file-content"),
                filePath: z.string(),
                content: z.string(),
              }),
            ]),
          )
          .optional(),
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
        .values({
          name: input.name,
          projectId: input.projectId,
        })
        .returning()
        .get()
      console.log("[chats.create] created chat:", chat)

      // Create initial sub-chat with user message (AI SDK format)
      // If initialMessageParts is provided, use it; otherwise fallback to text-only message
      let initialMessages = "[]"
      const initialMetadata = input.model ? { model: input.model } : undefined

      if (input.initialMessageParts && input.initialMessageParts.length > 0) {
        initialMessages = JSON.stringify([
          {
            id: `msg-${Date.now()}`,
            role: "user",
            parts: input.initialMessageParts,
            ...(initialMetadata ? { metadata: initialMetadata } : {}),
          },
        ])
      } else if (input.initialMessage) {
        initialMessages = JSON.stringify([
          {
            id: `msg-${Date.now()}`,
            role: "user",
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
          "type:",
          input.branchType,
        )
        const result = await createWorktreeForChat(
          project.path,
          sanitizeProjectName(project.name),
          chat.id,
          input.baseBranch,
          input.branchType,
          {
            onSetupComplete: (setupResult: WorktreeSetupResult) => {
              if (setupResult.success) return
              const message =
                setupResult.errors[0] ||
                "Worktree setup failed. Check your setup commands."
              sendWorktreeSetupFailure(requestingWindowId, {
                kind: "setup-failed",
                message,
                projectId: project.id,
              })
            },
          },
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
          sendWorktreeSetupFailure(requestingWindowId, {
            kind: "create-failed",
            message: result.error || "Worktree creation failed.",
            projectId: project.id,
          })
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

      // Kill terminal processes only for worktree-mode workspaces.
      // Local-mode terminals are shared across workspaces on the same project path,
      // so they should not be killed when a single workspace is archived.
      const isLocalMode = !chat?.branch
      if (!isLocalMode) {
        terminalManager.killByWorkspaceId(input.id).then((killResult) => {
          if (killResult.killed > 0) {
            console.log(
              `[chats.archive] Killed ${killResult.killed} terminal session(s) for workspace ${input.id}`,
            )
          }
        }).catch((error) => {
          console.error(`[chats.archive] Error killing processes:`, error)
        })
      }

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
        ).then((killResults) => {
          const totalKilled = killResults.reduce((sum, r) => sum + r.killed, 0)
          if (totalKilled > 0) {
            console.log(
              `[chats.archiveBatch] Killed ${totalKilled} terminal session(s) for ${worktreeChats.length} worktree workspace(s)`,
            )
          }
        }).catch((error) => {
          console.error(`[chats.archiveBatch] Error killing processes:`, error)
        })
      }

      return result
    }),

  /**
   * Delete a chat permanently. Worktree directory is preserved by default;
   * callers must pass `deleteWorktree: true` to remove it. This matches the
   * archive flow and ensures worktrees are never deleted without explicit opt-in.
   */
  delete: publicProcedure
    .input(
      z.object({
        id: z.string(),
        deleteWorktree: z.boolean().default(false),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDatabase()

      // Get chat before deletion
      const chat = db.select().from(chats).where(eq(chats.id, input.id)).get()

      // Abort any active Claude sessions for this chat's sub-chats before cascade delete
      const subChatIds = db
        .select({ id: subChats.id })
        .from(subChats)
        .where(eq(subChats.chatId, input.id))
        .all()
        .map((row) => row.id)
      if (subChatIds.length > 0) {
        abortClaudeSessionsForSubChats(subChatIds)
      }

      // Only delete worktree if the caller explicitly opted in.
      if (input.deleteWorktree && chat?.worktreePath && chat?.branch) {
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

      // Kill terminal processes for worktree-mode workspaces.
      // Local-mode terminals are shared and should not be killed on delete.
      if (chat?.branch) {
        terminalManager.killByWorkspaceId(input.id).catch((error) => {
          console.error(`[chats.delete] Error killing processes:`, error)
        })
      }

      // Track workspace deleted
      trackWorkspaceDeleted(input.id)

      // Invalidate git cache for this worktree
      if (chat?.worktreePath) {
        gitCache.invalidateStatus(chat.worktreePath)
        gitCache.invalidateParsedDiff(chat.worktreePath)
      }

      return db.delete(chats).where(eq(chats.id, input.id)).returning().get()
    }),

  /**
   * Delete all archived chats permanently (and their worktrees).
   */
  deleteAllArchived: publicProcedure
    .input(z.object({}).default({}))
    .mutation(async () => {
      const db = getDatabase()

      const archived = db
        .select({
          id: chats.id,
          branch: chats.branch,
          worktreePath: chats.worktreePath,
          projectId: chats.projectId,
        })
        .from(chats)
        .where(isNotNull(chats.archivedAt))
        .all()

      if (archived.length === 0) return []

      const archivedIds = archived.map((c) => c.id)

      const subChatIds = db
        .select({ id: subChats.id })
        .from(subChats)
        .where(inArray(subChats.chatId, archivedIds))
        .all()
        .map((row) => row.id)
      if (subChatIds.length > 0) {
        abortClaudeSessionsForSubChats(subChatIds)
      }

      const worktreeChats = archived.filter(
        (c) => c.branch != null && c.worktreePath != null,
      )

      if (worktreeChats.length > 0) {
        const projectIds = Array.from(
          new Set(worktreeChats.map((c) => c.projectId)),
        )
        const projectRows = db
          .select()
          .from(projects)
          .where(inArray(projects.id, projectIds))
          .all()
        const projectPathById = new Map(
          projectRows.map((p) => [p.id, p.path]),
        )

        Promise.allSettled(
          worktreeChats.map((c) => {
            const projectPath = projectPathById.get(c.projectId)
            if (!projectPath || !c.worktreePath) {
              return Promise.resolve({ success: false, error: "missing-project" })
            }
            return removeWorktree(projectPath, c.worktreePath)
          }),
        )
          .then((results) => {
            const failures = results.filter(
              (r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.success),
            ).length
            if (failures > 0) {
              console.warn(
                `[chats.deleteAllArchived] ${failures}/${worktreeChats.length} worktree removals failed`,
              )
            } else {
              console.log(
                `[chats.deleteAllArchived] Removed ${worktreeChats.length} worktree(s)`,
              )
            }
          })
          .catch((error) => {
            console.error(`[chats.deleteAllArchived] Worktree removal error:`, error)
          })

        Promise.allSettled(
          worktreeChats.map((c) => terminalManager.killByWorkspaceId(c.id)),
        )
          .then((results) => {
            const totalKilled = results.reduce((sum, r) => {
              if (r.status === "fulfilled") return sum + r.value.killed
              return sum
            }, 0)
            if (totalKilled > 0) {
              console.log(
                `[chats.deleteAllArchived] Killed ${totalKilled} terminal session(s)`,
              )
            }
          })
          .catch((error) => {
            console.error(`[chats.deleteAllArchived] Terminal cleanup error:`, error)
          })
      }

      for (const c of archived) {
        trackWorkspaceDeleted(c.id)
        if (c.worktreePath) {
          gitCache.invalidateStatus(c.worktreePath)
          gitCache.invalidateParsedDiff(c.worktreePath)
        }
      }

      return db
        .delete(chats)
        .where(inArray(chats.id, archivedIds))
        .returning()
        .all()
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
   *
   * Accepts an optional client-provided `id` so the renderer can do optimistic UI
   * (insert the row in the store synchronously, then fire-and-forget the create).
   */
  createSubChat: publicProcedure
    .input(
      z.object({
        id: z.string().optional(),
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
          ...(input.id ? { id: input.id } : {}),
          chatId: input.chatId,
          name: input.name,
          mode: input.mode,
          messages: "[]",
        })
        .returning()
        .get()
    }),

  /**
   * Fork a sub-chat from a specific message, preserving SDK session context.
   * Creates a new sub-chat with messages up to the target message,
   * copies the .jsonl session file, and marks it for forkSession resume.
   */
  forkSubChat: publicProcedure
    .input(
      z.object({
        subChatId: z.string(),
        messageId: z.string(),
        messageIndex: z.number().int().nonnegative().optional(),
        name: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDatabase()

      // 1. Get the source sub-chat
      const sourceSubChat = db
        .select()
        .from(subChats)
        .where(eq(subChats.id, input.subChatId))
        .get()
      if (!sourceSubChat) throw new Error("Source sub-chat not found")

      // 2. Parse messages and find the cutoff point
      const allMessages = JSON.parse(sourceSubChat.messages || "[]")
      let cutoffIndex = allMessages.findIndex(
        (m: any) => m.id === input.messageId,
      )
      // Fallback: AI SDK generates its own message IDs on the client which differ
      // from the server-generated UUIDs stored in the DB. Use the message index
      // (passed from the client) as a fallback when the ID doesn't match.
      if (cutoffIndex === -1 && input.messageIndex !== undefined && input.messageIndex < allMessages.length) {
        cutoffIndex = input.messageIndex
      }
      if (cutoffIndex === -1) throw new Error("Message not found")

      // 3. Slice messages up to and including the target
      const messagesToFork = allMessages.slice(0, cutoffIndex + 1)

      // 4. Find sdkMessageUuid of last assistant message (for resumeSessionAt)
      const lastAssistant = [...messagesToFork]
        .reverse()
        .find((m: any) => m.role === "assistant")
      const forkAtSdkUuid = lastAssistant?.metadata?.sdkMessageUuid || null

      // 5. Generate new IDs for all messages + set shouldForkResume on last assistant
      const forkedMessages = messagesToFork.map((msg: any, i: number) => ({
        ...msg,
        id: `fork-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
        metadata: {
          ...msg.metadata,
          shouldResume: undefined,
          ...(msg === lastAssistant &&
            forkAtSdkUuid && {
              shouldForkResume: true,
            }),
        },
      }))

      // 6. Generate fork name: [N] originalName
      let forkName = input.name
      if (!forkName) {
        // Strip existing [N] prefix from source name to get base name
        const sourceName = sourceSubChat.name || "Chat"
        const baseName = sourceName.replace(/^\[\d+\]\s*/, "")

        // Find highest [N] among all sibling sub-chats
        const siblings = db
          .select({ name: subChats.name })
          .from(subChats)
          .where(eq(subChats.chatId, sourceSubChat.chatId))
          .all()

        let maxN = 0
        for (const s of siblings) {
          const match = s.name?.match(/^\[(\d+)\]/)
          if (match) {
            maxN = Math.max(maxN, parseInt(match[1], 10))
          }
        }

        forkName = `[${maxN + 1}] ${baseName}`
      }

      // 7. Insert new sub-chat with sessionId from original (needed for resume)
      const newSubChat = db
        .insert(subChats)
        .values({
          chatId: sourceSubChat.chatId,
          name: forkName,
          mode: sourceSubChat.mode,
          messages: JSON.stringify(forkedMessages),
          sessionId: sourceSubChat.sessionId,
        })
        .returning()
        .get()

      // 8. Copy .jsonl session files to the new isolated config dir
      if (sourceSubChat.sessionId) {
        try {
          const { app } = await import("electron")
          const userDataPath = app.getPath("userData")
          const sourceDir = path.join(
            userDataPath,
            "claude-sessions",
            input.subChatId,
            "projects",
          )
          const targetDir = path.join(
            userDataPath,
            "claude-sessions",
            newSubChat.id,
            "projects",
          )

          const sourceDirExists = await fs
            .stat(sourceDir)
            .then(() => true)
            .catch(() => false)

          if (sourceDirExists) {
            await fs.cp(sourceDir, targetDir, { recursive: true })
          }
        } catch (err) {
          console.warn("[forkSubChat] Failed to copy session files:", err)
          // Clear shouldForkResume since there's no .jsonl to fork from
          for (const m of forkedMessages) {
            if (m.metadata?.shouldForkResume) {
              delete m.metadata.shouldForkResume
            }
          }
          {
            const forkedJson = JSON.stringify(forkedMessages)
            db.update(subChats)
              .set({ messages: forkedJson, ...computeFileStatsFromMessages(forkedJson) })
              .where(eq(subChats.id, newSubChat.id))
              .run()
          }
        }
      }

      console.log("[forkSubChat] Created", { id: newSubChat.id, name: forkName, messages: forkedMessages.length })

      return {
        subChat: newSubChat,
        messageCount: forkedMessages.length,
        forkAtSdkUuid,
      }
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
        .set({
          messages: input.messages,
          ...computeFileStatsFromMessages(input.messages),
          updatedAt: new Date(),
        })
        .where(eq(subChats.id, input.id))
        .returning()
        .get()
    }),

  /**
   * Rollback to a specific message by sdkMessageUuid
   * Handles both git state rollback and message truncation
   * Git rollback is done first - if it fails, the whole operation aborts
   */
  rollbackToMessage: publicProcedure
    .input(
      z.object({
        subChatId: z.string(),
        sdkMessageUuid: z.string(),
      }),
    )
    .mutation(async ({ input }): Promise<
      | { success: false; error: string }
      | { success: true; messages: any[] }
    > => {
      const db = getDatabase()

      // 1. Get the sub-chat and its messages
      const subChat = db
        .select()
        .from(subChats)
        .where(eq(subChats.id, input.subChatId))
        .get()
      if (!subChat) {
        return { success: false, error: "Sub-chat not found" }
      }

      // 2. Parse messages and find the target message by sdkMessageUuid
      const messages = JSON.parse(subChat.messages || "[]")
      const targetIndex = messages.findIndex(
        (m: any) => m.metadata?.sdkMessageUuid === input.sdkMessageUuid,
      )

      if (targetIndex === -1) {
        return { success: false, error: "Message not found" }
      }

      // 3. Get the parent chat for worktreePath
      const chat = db
        .select()
        .from(chats)
        .where(eq(chats.id, subChat.chatId))
        .get()

      // 4. Rollback git state first - if this fails, abort the whole operation
      if (chat?.worktreePath) {
        const res = await applyRollbackStash(chat.worktreePath, input.sdkMessageUuid)
        if (!res.success) {
          return { success: false, error: `Git rollback failed: ${res.error}` }
        }
        // If checkpoint wasn't found, we still fail because we can't safely rollback
        // without reverting the git state to match the message history
        if (!res.checkpointFound) {
          return { success: false, error: "Checkpoint not found - cannot rollback git state" }
        }
      }

      // 5. Truncate messages to include up to and including the target message
      let truncatedMessages = messages.slice(0, targetIndex + 1)

      // 5.5. Clear any old shouldResume flags, then set on the target message
      truncatedMessages = truncatedMessages.map((m: any, i: number) => {
        const { shouldResume, ...restMeta } = m.metadata || {}
        return {
          ...m,
          metadata: {
            ...restMeta,
            ...(i === truncatedMessages.length - 1 && { shouldResume: true }),
          },
        }
      })

      // 6. Update the sub-chat with truncated messages
      {
        const truncatedJson = JSON.stringify(truncatedMessages)
        db.update(subChats)
          .set({
            messages: truncatedJson,
            ...computeFileStatsFromMessages(truncatedJson),
            updatedAt: new Date(),
          })
          .where(eq(subChats.id, input.subChatId))
          .returning()
          .get()
      }

      return {
        success: true,
        messages: truncatedMessages,
      }
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
      abortClaudeSessionsForSubChats([input.id])
      return db
        .delete(subChats)
        .where(eq(subChats.id, input.id))
        .returning()
        .get()
    }),

  /**
   * Delete a sub-chat only if it has no messages.
   * Used for auto-cleanup when a tab is closed without ever being used.
   * Idempotent — returns null if the sub-chat doesn't exist or has messages.
   */
  deleteSubChatIfEmpty: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => {
      const db = getDatabase()
      return db
        .delete(subChats)
        .where(and(eq(subChats.id, input.id), eq(subChats.messages, "[]")))
        .returning()
        .get() ?? null
    }),

  /**
   * Bulk-delete any sub-chats from the given id list that have no messages.
   * Used on window/app close to sweep up sub-chats created in the session
   * that the user never sent a message in.
   */
  deleteEmptySubChatsByIds: publicProcedure
    .input(z.object({ ids: z.array(z.string()) }))
    .mutation(({ input }) => {
      if (input.ids.length === 0) return { deleted: 0 }
      const db = getDatabase()
      const result = db
        .delete(subChats)
        .where(and(inArray(subChats.id, input.ids), eq(subChats.messages, "[]")))
        .returning()
        .all()
      return { deleted: result.length }
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
   * Get parsed diff with prefetched file contents
   * This endpoint does all diff parsing on the server side to avoid blocking UI
   * Uses GitCache for instant responses when diff hasn't changed
   */
  getParsedDiff: publicProcedure
    .input(z.object({ chatId: z.string() }))
    .query(async ({ input }) => {
      const db = getDatabase()
      const chat = db
        .select()
        .from(chats)
        .where(eq(chats.id, input.chatId))
        .get()

      if (!chat?.worktreePath) {
        return {
          files: [],
          totalAdditions: 0,
          totalDeletions: 0,
          fileContents: {},
          error: "No worktree path",
        }
      }

      // 1. Get raw diff (only uncommitted changes - don't show branch diff after commit)
      const result = await getWorktreeDiff(
        chat.worktreePath,
        chat.baseBranch ?? undefined,
        { onlyUncommitted: true },
      )

      if (!result.success) {
        return {
          files: [],
          totalAdditions: 0,
          totalDeletions: 0,
          fileContents: {},
          error: result.error,
        }
      }

      // 2. Check cache using diff hash
      const diffHash = computeContentHash(result.diff || "")
      type ParsedDiffResponse = {
        files: ReturnType<typeof splitUnifiedDiffByFile>
        totalAdditions: number
        totalDeletions: number
        fileContents: Record<string, string>
      }
      const cached = gitCache.getParsedDiff<ParsedDiffResponse>(chat.worktreePath, diffHash)
      if (cached) {
        return cached
      }

      // 3. Parse diff into files
      const files = splitUnifiedDiffByFile(result.diff || "")

      // 4. Calculate totals
      const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0)
      const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0)

      // 5. Prefetch file contents (first 20 files, non-deleted, non-binary)
      const MAX_PREFETCH = 20
      const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB

      const filesToFetch = files
        .filter((f) => !f.isBinary && !f.isDeletedFile)
        .slice(0, MAX_PREFETCH)
        .map((f) => ({
          key: f.key,
          filePath: f.newPath !== "/dev/null" ? f.newPath : f.oldPath,
        }))
        .filter((f) => f.filePath && f.filePath !== "/dev/null")

      const fileContents: Record<string, string> = {}

      // Read files in parallel
      await Promise.all(
        filesToFetch.map(async ({ key, filePath }) => {
          try {
            const fullPath = path.join(chat.worktreePath!, filePath)

            // Check file size first
            const stats = await fs.stat(fullPath)
            if (stats.size > MAX_FILE_SIZE) {
              return // Skip large files
            }

            const content = await fs.readFile(fullPath, "utf-8")

            // Quick binary check (NUL bytes in first 8KB)
            const checkLength = Math.min(content.length, 8192)
            for (let i = 0; i < checkLength; i++) {
              if (content.charCodeAt(i) === 0) {
                return // Skip binary files
              }
            }

            fileContents[key] = content
          } catch {
            // File might not exist or be unreadable - skip
          }
        }),
      )

      const response: ParsedDiffResponse = {
        files,
        totalAdditions,
        totalDeletions,
        fileContents,
      }

      // 6. Store in cache
      gitCache.setParsedDiff(chat.worktreePath, diffHash, response)
      return response
    }),

  /**
   * Generate a commit message using AI based on the diff
   * @param chatId - The chat ID to get worktree path from
   * @param filePaths - Optional list of file paths to generate message for (if not provided, uses all changed files)
   * @param ollamaModel - Optional Ollama model for offline generation
   */
  generateCommitMessage: publicProcedure
    .input(z.object({
      chatId: z.string(),
      filePaths: z.array(z.string()).optional(),
      ollamaModel: z.string().nullish(), // Optional model for offline mode
    }))
    .mutation(async ({ input }) => {
      const db = getDatabase()
      const chat = db
        .select()
        .from(chats)
        .where(eq(chats.id, input.chatId))
        .get()

      if (!chat?.worktreePath) {
        throw new Error("No worktree path")
      }

      // Get the diff to understand what changed
      const result = await getWorktreeDiff(
        chat.worktreePath,
        chat.baseBranch ?? undefined,
      )

      if (!result.success || !result.diff) {
        throw new Error("Failed to get diff")
      }

      // Parse diff to get file list
      let files = splitUnifiedDiffByFile(result.diff)

      // Filter to only selected files if filePaths provided
      if (input.filePaths && input.filePaths.length > 0) {
        const selectedPaths = new Set(input.filePaths)
        files = files.filter((f) => {
          const filePath = f.newPath !== "/dev/null" ? f.newPath : f.oldPath
          // Match by exact path or by path suffix (handle different path formats)
          return selectedPaths.has(filePath) ||
            [...selectedPaths].some(sp => filePath.endsWith(sp) || sp.endsWith(filePath))
        })
        console.log(`[generateCommitMessage] Filtered ${files.length} files from ${input.filePaths.length} selected paths`)
      }

      if (files.length === 0) {
        throw new Error("No changes to commit")
      }

      // Build filtered diff text for API (only selected files)
      const filteredDiff = files.map(f => f.diffText).join('\n')
      const additions = files.reduce((sum, f) => sum + f.additions, 0)
      const deletions = files.reduce((sum, f) => sum + f.deletions, 0)

      // Check internet first - if offline, use Ollama
      const hasInternet = await checkInternetConnection()

      if (!hasInternet) {
        console.log("[generateCommitMessage] Offline - trying Ollama...")
        const ollamaMessage = await generateCommitMessageWithOllama(
          filteredDiff,
          files.length,
          additions,
          deletions,
          input.ollamaModel
        )
        if (ollamaMessage) {
          console.log("[generateCommitMessage] Generated via Ollama:", ollamaMessage)
          return { message: ollamaMessage }
        }
        console.log("[generateCommitMessage] Ollama failed, using heuristic fallback")
        // Fall through to heuristic fallback below
      } else {
        // Online - call web API to generate commit message
        let apiError: string | null = null
        try {
          const authManager = getAuthManager()
          const token = await authManager.getValidToken()
          // Use localhost in dev, production otherwise
          const apiUrl = process.env.NODE_ENV === "development" ? "http://localhost:3000" : "https://21st.dev"

          if (!token) {
            apiError = "No auth token available"
          } else {
            const response = await fetch(
              `${apiUrl}/api/agents/generate-commit-message`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-Desktop-Token": token,
                },
                body: JSON.stringify({
                  diff: filteredDiff.slice(0, 10000), // Limit diff size, use filtered diff
                  fileCount: files.length,
                  additions,
                  deletions,
                }),
              },
            )

            if (response.ok) {
              const data = await response.json()
              if (data.message) {
                return { message: data.message }
              }
              apiError = "API returned ok but no message in response"
            } else {
              apiError = `API returned ${response.status}`
            }
          }
        } catch (error) {
          apiError = `API call failed: ${error instanceof Error ? error.message : String(error)}`
        }

        if (apiError) {
          console.log("[generateCommitMessage] API error:", apiError)
        }
      }

      // Fallback: Generate commit message with conventional commits style
      const fileNames = files.map((f) => {
        const filePath = f.newPath !== "/dev/null" ? f.newPath : f.oldPath
        // Note: Git diff paths always use forward slashes
        return path.posix.basename(filePath) || filePath
      })

      // Detect commit type from file changes
      const hasNewFiles = files.some((f) => f.oldPath === "/dev/null")
      const hasDeletedFiles = files.some((f) => f.newPath === "/dev/null")
      const hasOnlyDeletions = files.every((f) => f.additions === 0 && f.deletions > 0)

      // Detect type from file paths
      const allPaths = files.map((f) => f.newPath !== "/dev/null" ? f.newPath : f.oldPath)
      const hasTestFiles = allPaths.some((p) => p.includes("test") || p.includes("spec"))
      const hasDocFiles = allPaths.some((p) => p.endsWith(".md") || p.includes("doc"))
      const hasConfigFiles = allPaths.some((p) =>
        p.includes("config") ||
        p.endsWith(".json") ||
        p.endsWith(".yaml") ||
        p.endsWith(".yml") ||
        p.endsWith(".toml")
      )

      // Determine commit type prefix
      let prefix = "chore"
      if (hasNewFiles && !hasDeletedFiles) {
        prefix = "feat"
      } else if (hasOnlyDeletions) {
        prefix = "chore"
      } else if (hasTestFiles && !hasDocFiles && !hasConfigFiles) {
        prefix = "test"
      } else if (hasDocFiles && !hasTestFiles && !hasConfigFiles) {
        prefix = "docs"
      } else if (allPaths.some((p) => p.includes("fix") || p.includes("bug"))) {
        prefix = "fix"
      } else if (files.length > 0 && files.every((f) => f.additions > 0 || f.deletions > 0)) {
        // Default to fix for modifications (most common case)
        prefix = "fix"
      }

      const uniqueFileNames = [...new Set(fileNames)]
      let message: string

      if (uniqueFileNames.length === 1) {
        message = `${prefix}: update ${uniqueFileNames[0]}`
      } else if (uniqueFileNames.length <= 3) {
        message = `${prefix}: update ${uniqueFileNames.join(", ")}`
      } else {
        message = `${prefix}: update ${uniqueFileNames.length} files`
      }

      console.log("[generateCommitMessage] Generated fallback message:", message)
      return { message }
    }),

  /**
   * Generate a name for a sub-chat using AI
   * Uses Ollama when offline, otherwise calls web API
   */
  generateSubChatName: publicProcedure
    .input(z.object({
      userMessage: z.string(),
      ollamaModel: z.string().nullish(), // Optional model for offline mode
    }))
    .mutation(async ({ input }) => {
      try {
        // Check internet first - if offline, use Ollama
        const hasInternet = await checkInternetConnection()

        if (!hasInternet) {
          console.log("[generateSubChatName] Offline - trying Ollama...")
          const ollamaName = await generateChatNameWithOllama(input.userMessage, input.ollamaModel)
          if (ollamaName) {
            console.log("[generateSubChatName] Generated name via Ollama:", ollamaName)
            return { name: ollamaName }
          }
          console.log("[generateSubChatName] Ollama failed, using fallback")
          return { name: getFallbackName(input.userMessage) }
        }

        // Online - use web API
        const authManager = getAuthManager()
        const token = await authManager.getValidToken()
        const apiUrl = "https://21st.dev"

        console.log(
          "[generateSubChatName] Online - calling API with token:",
          token ? "present" : "missing",
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

      const project = db
        .select()
        .from(projects)
        .where(eq(projects.id, chat.projectId))
        .get()

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

        // Provider info for agent prompt generation. Null/undefined for
        // unsupported providers keeps the renderer on the GitHub default.
        const provider =
          project?.gitProvider === "github" || project?.gitProvider === "azure"
            ? project.gitProvider
            : null
        const azure =
          provider === "azure" &&
          project?.gitOwner &&
          project?.gitProject &&
          project?.gitRepo
            ? {
                organization: project.gitOwner,
                project: project.gitProject,
                repository: project.gitRepo,
              }
            : undefined

        return {
          branch: chat.branch || status.current || "unknown",
          baseBranch: chat.baseBranch || "main",
          uncommittedCount: status.files.length,
          hasUpstream,
          provider,
          azure,
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
   * Get PR status from GitHub (via gh CLI).
   *
   * Back-fills `chat.prNumber` and `chat.prUrl` when the live fetch detects a
   * PR — this keeps the sidebar workspace card (which reads from the DB) in
   * sync without requiring callers to write those columns manually.
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

      const status = await fetchPRStatus(chat.worktreePath)

      // Back-fill DB so the sidebar badge can render from cached fields
      const pr = status?.pr
      const nextNumber = pr?.number ?? null
      const nextUrl = pr?.url ?? null
      if (nextNumber !== chat.prNumber || nextUrl !== chat.prUrl) {
        try {
          db.update(chats)
            .set({ prNumber: nextNumber, prUrl: nextUrl })
            .where(eq(chats.id, input.chatId))
            .run()
        } catch (err) {
          console.error("[getPrStatus] Failed to back-fill PR fields:", err)
        }
      }

      return status
    }),

  /**
   * Merge PR via gh CLI
   * First checks if PR is mergeable, returns helpful error if conflicts exist
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

      // Check PR mergeability before attempting merge (provider-agnostic)
      const prStatus = await fetchPRStatus(chat.worktreePath)
      if (prStatus?.pr?.mergeable === "CONFLICTING") {
        throw new Error(
          "MERGE_CONFLICT: This PR has merge conflicts with the base branch. " +
          "Please sync your branch with the latest changes from main to resolve conflicts."
        )
      }

      try {
        return await mergePR({
          worktreePath: chat.worktreePath,
          prNumber: chat.prNumber,
          method: input.method,
        })
      } catch (error) {
        console.error("[mergePr] Error:", error)
        const errorMsg =
          error instanceof Error ? error.message : "Failed to merge PR"

        // Normalize non-prefixed conflict messages to the MERGE_CONFLICT: contract
        // so the renderer surfaces the "Sync with Main" action.
        if (
          !errorMsg.startsWith("MERGE_CONFLICT:") &&
          (errorMsg.includes("not mergeable") ||
            errorMsg.includes("merge conflict") ||
            errorMsg.includes("cannot be cleanly created") ||
            errorMsg.includes("CONFLICTING"))
        ) {
          throw new Error(
            "MERGE_CONFLICT: This PR has merge conflicts with the base branch. " +
              "Please sync your branch with the latest changes from main to resolve conflicts."
          )
        }

        throw new Error(errorMsg)
      }
    }),

  /**
   * Fetch issue + review comments for the current branch's PR.
   */
  getPrComments: publicProcedure
    .input(z.object({ chatId: z.string() }))
    .query(async ({ input }) => {
      const db = getDatabase()
      const chat = db
        .select()
        .from(chats)
        .where(eq(chats.id, input.chatId))
        .get()

      if (!chat?.worktreePath) return []
      return await fetchPRComments(chat.worktreePath)
    }),

  /**
   * Rename a PR title via `gh pr edit`.
   *
   * Caller passes the PR number explicitly so that switching branches
   * between opening the dialog and saving can't rename the wrong PR.
   * Falls back to the current-branch PR when `prNumber` is omitted.
   */
  updatePrTitle: publicProcedure
    .input(
      z.object({
        chatId: z.string(),
        title: z.string().trim().min(1).max(256),
        prNumber: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDatabase()
      const chat = db
        .select()
        .from(chats)
        .where(eq(chats.id, input.chatId))
        .get()

      if (!chat?.worktreePath) {
        throw new Error("No worktree path for this chat")
      }

      try {
        const result = await updatePRTitle({
          worktreePath: chat.worktreePath,
          title: input.title,
          prNumber: input.prNumber,
        })
        invalidatePRCache(chat.worktreePath)
        return result
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Failed to update PR title"
        console.error("[updatePrTitle] Error:", error)
        if (errorMsg.includes("no pull requests found")) {
          throw new Error("No pull request exists for the current branch")
        }
        throw new Error(errorMsg)
      }
    }),

  /**
   * Get file change stats for workspaces.
   *
   * Reads from cached columns on `sub_chats` (kept in sync by every messages-write path).
   * Supports two modes:
   * - openSubChatIds: query specific sub-chats (used by main sidebar)
   * - chatIds: query all sub-chats for given chats (used by archive popover)
   */
  getFileStats: publicProcedure
    .input(z.object({
      openSubChatIds: z.array(z.string()).optional(),
      chatIds: z.array(z.string()).optional(),
    }))
    .query(({ input }) => {
    const db = getDatabase()

    // Early return if nothing to check
    if ((!input.openSubChatIds || input.openSubChatIds.length === 0) &&
        (!input.chatIds || input.chatIds.length === 0)) {
      return []
    }

    const whereClause = input.chatIds && input.chatIds.length > 0
      ? inArray(subChats.chatId, input.chatIds)
      : inArray(subChats.id, input.openSubChatIds!)

    const rows = db
      .select({
        chatId: subChats.chatId,
        additions: sql<number>`COALESCE(SUM(${subChats.fileStatsAdditions}), 0)`,
        deletions: sql<number>`COALESCE(SUM(${subChats.fileStatsDeletions}), 0)`,
        fileCount: sql<number>`COALESCE(SUM(${subChats.fileStatsFileCount}), 0)`,
      })
      .from(subChats)
      .where(whereClause)
      .groupBy(subChats.chatId)
      .all()

    return rows
      .filter((r) => r.chatId !== null && r.fileCount > 0)
      .map((r) => ({
        chatId: r.chatId as string,
        additions: Number(r.additions),
        deletions: Number(r.deletions),
        fileCount: Number(r.fileCount),
      }))
  }),

  /**
   * Get sub-chats with pending plan approvals
   * Uses mode field as source of truth: mode="plan" + completed ExitPlanMode = pending approval
   * Logic must match active-chat.tsx hasUnapprovedPlan
   * REQUIRES openSubChatIds to avoid loading all sub-chats (performance optimization)
   */
  getPendingPlanApprovals: publicProcedure
    .input(z.object({ openSubChatIds: z.array(z.string()) }))
    .query(({ input }) => {
    const db = getDatabase()

    // Early return if no sub-chats to check
    if (input.openSubChatIds.length === 0) {
      return []
    }

    // Query only the specified sub-chats, including mode for filtering
    const allSubChats = db
      .select({
        chatId: subChats.chatId,
        subChatId: subChats.id,
        mode: subChats.mode,
        messages: subChats.messages,
      })
      .from(subChats)
      .where(inArray(subChats.id, input.openSubChatIds))
      .all()

    const pendingApprovals: Array<{ subChatId: string; chatId: string }> = []

    for (const row of allSubChats) {
      if (!row.subChatId || !row.chatId) continue

      // If mode is "agent", plan is already approved - skip
      if (row.mode === "agent") continue

      // Only check for ExitPlanMode in plan mode sub-chats
      if (!row.messages) continue

      try {
        const messages = JSON.parse(row.messages) as Array<{
          role: string
          content?: string
          parts?: Array<{
            type: string
            text?: string
            output?: unknown
          }>
        }>

        // Check if there's a completed ExitPlanMode in messages
        const hasCompletedExitPlanMode = (): boolean => {
          for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i]
            if (!msg) continue

            // If assistant message with completed ExitPlanMode, we found an unapproved plan
            if (msg.role === "assistant" && msg.parts) {
              const exitPlanPart = msg.parts.find(
                (p) => p.type === "tool-ExitPlanMode"
              )
              // Check if ExitPlanMode is completed (has output, even if empty)
              if (exitPlanPart && exitPlanPart.output !== undefined) {
                return true
              }
            }
          }
          return false
        }

        if (hasCompletedExitPlanMode()) {
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
   * Supports exporting entire workspace or a single sub-chat.
   * Useful for sharing, backup, or importing into other tools.
   */
  exportChat: publicProcedure
    .input(
      z.object({
        chatId: z.string(),
        subChatId: z.string().optional(), // If provided, export only this sub-chat
        format: z.enum(["json", "markdown", "text"]).default("markdown"),
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

      // Query sub-chats: either a specific one or all for the chat
      let chatSubChats
      if (input.subChatId) {
        // Export single sub-chat
        const singleSubChat = db
          .select()
          .from(subChats)
          .where(and(
            eq(subChats.id, input.subChatId),
            eq(subChats.chatId, input.chatId) // Ensure sub-chat belongs to this chat
          ))
          .get()

        if (!singleSubChat) {
          throw new Error("Sub-chat not found")
        }
        chatSubChats = [singleSubChat]
      } else {
        // Export all sub-chats
        chatSubChats = db
          .select()
          .from(subChats)
          .where(eq(subChats.chatId, input.chatId))
          .orderBy(subChats.createdAt)
          .all()
      }

      // parse messages from sub-chats
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

      // Sanitize filename - remove characters that are invalid on Windows/macOS/Linux
      const sanitizeFilename = (name: string): string => {
        return name
          .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_") // Invalid chars
          .replace(/\s+/g, "_") // Replace spaces with underscores
          .replace(/_+/g, "_") // Collapse multiple underscores
          .replace(/^_|_$/g, "") // Trim underscores from ends
          .slice(0, 100) // Limit length
          || "chat" // Fallback if empty
      }

      // Use sub-chat name if exporting single sub-chat, otherwise use chat name
      const exportName = input.subChatId && chatSubChats[0]?.name
        ? `${chat.name || "chat"}-${chatSubChats[0].name}`
        : (chat.name || "chat")
      const safeFilename = sanitizeFilename(exportName)

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
          filename: `${safeFilename}-${chat.id.slice(0, 8)}.json`,
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
          filename: `${safeFilename}-${chat.id.slice(0, 8)}.txt`,
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
        filename: `${safeFilename}-${chat.id.slice(0, 8)}.md`,
      }
    }),

  /**
   * Get basic stats for a chat (message count, tool usage, etc.)
   * Supports both full chat stats and individual sub-chat stats.
   * Useful for showing chat summary in sidebar or export dialogs.
   */
  getChatStats: publicProcedure
    .input(z.object({
      chatId: z.string(),
      subChatId: z.string().optional(), // If provided, return stats for only this sub-chat
    }))
    .query(({ input }) => {
      const db = getDatabase()

      let chatSubChats
      if (input.subChatId) {
        // Get stats for a single sub-chat
        const singleSubChat = db
          .select()
          .from(subChats)
          .where(and(
            eq(subChats.id, input.subChatId),
            eq(subChats.chatId, input.chatId)
          ))
          .get()

        chatSubChats = singleSubChat ? [singleSubChat] : []
      } else {
        // Get stats for all sub-chats
        chatSubChats = db
          .select()
          .from(subChats)
          .where(eq(subChats.chatId, input.chatId))
          .all()
      }

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

import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm"
import { BrowserWindow } from "electron"
import * as fs from "fs/promises"
import * as path from "path"
import simpleGit from "simple-git"
import { z } from "zod"
import { buildAgentRuntimeCapabilityDiagnostic } from "../../../../shared/agent-runtime-capabilities"
import {
  agentChatProviders,
  buildAgentChatMessageMetadata,
} from "../../../../shared/agent-chat-provider"
import {
  trackPRCreated,
  trackWorkspaceArchived,
  trackWorkspaceCreated,
  trackWorkspaceDeleted,
} from "../../analytics"
import { chats, getDatabase, projects, subChats } from "../../db"
import {
  createWorktreeForChat,
  fetchGitHubPRStatus,
  getWorktreeDiff,
  removeWorktree,
  sanitizeProjectName,
} from "../../git"
import type { WorktreeSetupResult } from "../../git/worktree-config"
import { computeContentHash, gitCache } from "../../git/cache"
import { splitUnifiedDiffByFile } from "../../git/diff-parser"
import { execWithShellEnv } from "../../git/shell-env"
import { applyRollbackStash } from "../../git/stash"
import { assertOfficialCloudAllowed } from "../../local-only"
import { checkOllamaStatus } from "../../ollama"
import { terminalManager } from "../../terminal/manager"
import { publicProcedure, router } from "../index"
import {
  getActiveLocalApiProviderConfig,
  type LocalApiProviderPurpose,
} from "./local-api-provider-config"
import { getProviderDefaultRuntimeConfig } from "../../provider-profiles/storage"
import {
  buildCommitFileSummary,
  buildCommitMessagePrompt,
  cleanGeneratedCommitMessage,
} from "./commit-message-utils"

import {
  getCodexRollbackUnsupportedMessage,
  hasCodexBackedMessages,
} from "./chats-helpers"

export const subChatProcedures = {
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

      const project = chat?.projectId
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
      if (hasCodexBackedMessages(messagesToFork)) {
        throw new Error(
          getCodexRollbackUnsupportedMessage(),
        )
      }

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
          db.update(subChats)
            .set({ messages: JSON.stringify(forkedMessages) })
            .where(eq(subChats.id, newSubChat.id))
            .run()
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
        .set({ messages: input.messages, updatedAt: new Date() })
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
      if (hasCodexBackedMessages(messages)) {
        return {
          success: false,
          error: getCodexRollbackUnsupportedMessage(),
        }
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
      db.update(subChats)
        .set({
          messages: JSON.stringify(truncatedMessages),
          updatedAt: new Date(),
        })
        .where(eq(subChats.id, input.subChatId))
        .returning()
        .get()

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
      return db
        .delete(subChats)
        .where(eq(subChats.id, input.id))
        .returning()
        .get()
    }),

  /**
   * Get git diff for a chat's worktree
   */
}

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
  ContextUsageSummary,
  addUsageTotals,
  emptyUsageTotals,
  getContextUsage,
  getMessageTimestampMs,
  getUsageAmounts,
  readObject,
} from "./chats-helpers"

export const inspectProcedures = {
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

    // Query sub-chats based on input mode
    let allChats: Array<{ chatId: string | null; subChatId: string; messages: string | null }>

    if (input.chatIds && input.chatIds.length > 0) {
      // Archive mode: query all sub-chats for given chat IDs
      // Pre-filter with LIKE to skip sub-chats without file edits (avoids loading/parsing large JSON)
      allChats = db
        .select({
          chatId: subChats.chatId,
          subChatId: subChats.id,
          messages: subChats.messages,
        })
        .from(subChats)
        .where(
          and(
            inArray(subChats.chatId, input.chatIds),
            sql`(${subChats.messages} LIKE '%tool-Edit%' OR ${subChats.messages} LIKE '%tool-Write%')`
          )
        )
        .all()
    } else {
      // Main sidebar mode: query specific sub-chats
      allChats = db
        .select({
          chatId: subChats.chatId,
          subChatId: subChats.id,
          messages: subChats.messages,
        })
        .from(subChats)
        .where(inArray(subChats.id, input.openSubChatIds!))
        .all()
    }

    // Aggregate stats per workspace (chatId)
    const statsMap = new Map<
      string,
      { additions: number; deletions: number; fileCount: number }
    >()

    for (const row of allChats) {
      if (!row.messages || !row.chatId) continue
      const chatId = row.chatId // TypeScript narrowing

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
        const existing = statsMap.get(chatId) || {
          additions: 0,
          deletions: 0,
          fileCount: 0,
        }
        existing.additions += subChatAdditions
        existing.deletions += subChatDeletions
        existing.fileCount += subChatFileCount
        statsMap.set(chatId, existing)
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

      const project = chat.projectId
        ? db
            .select()
            .from(projects)
            .where(eq(projects.id, chat.projectId))
            .get()
        : null

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
   * Get locally observed token usage for the sidebar Usage popover.
   * This is based only on message metadata stored in the local SQLite DB.
   */
  getUsageSummary: publicProcedure
    .input(
      z
        .object({
          chatId: z.string().nullable().optional(),
          subChatId: z.string().nullable().optional(),
        })
        .optional(),
    )
    .query(({ input }) => {
      const db = getDatabase()
      const activeChatId = input?.chatId ?? null
      const activeSubChatId = input?.subChatId ?? null
      const currentConversation = emptyUsageTotals()
      const currentWorkspace = emptyUsageTotals()
      const today = emptyUsageTotals()
      const last7Days = emptyUsageTotals()
      const now = Date.now()
      const startOfToday = new Date()
      startOfToday.setHours(0, 0, 0, 0)
      const todayStartMs = startOfToday.getTime()
      const sevenDaysAgoMs = now - 7 * 24 * 60 * 60 * 1000
      let context: ContextUsageSummary | null = null

      const rows = db
        .select({
          id: subChats.id,
          chatId: subChats.chatId,
          messages: subChats.messages,
          updatedAt: subChats.updatedAt,
        })
        .from(subChats)
        .all()

      for (const row of rows) {
        let messages: unknown
        try {
          messages = JSON.parse(row.messages || "[]")
        } catch {
          continue
        }

        if (!Array.isArray(messages)) continue

        if (row.id === activeSubChatId && !context) {
          for (let i = messages.length - 1; i >= 0; i--) {
            const candidate = readObject(messages[i])
            const candidateContext = getContextUsage(candidate)
            if (candidateContext) {
              context = candidateContext
              break
            }
          }
        }

        for (const rawMessage of messages) {
          const message = readObject(rawMessage)
          const usage = getUsageAmounts(message)
          if (!usage) continue

          const timestampMs = getMessageTimestampMs(message, row.updatedAt)

          if (activeSubChatId && row.id === activeSubChatId) {
            addUsageTotals(currentConversation, usage)
          }
          if (activeChatId && row.chatId === activeChatId) {
            addUsageTotals(currentWorkspace, usage)
          }
          if (timestampMs >= todayStartMs) {
            addUsageTotals(today, usage)
          }
          if (timestampMs >= sevenDaysAgoMs) {
            addUsageTotals(last7Days, usage)
          }
        }
      }

      return {
        currentConversation,
        currentWorkspace,
        today,
        last7Days,
        context,
        generatedAt: new Date(now).toISOString(),
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
}

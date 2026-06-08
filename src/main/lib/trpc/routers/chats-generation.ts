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
  COMMIT_MESSAGE_PROVIDER_TIMEOUT_MS,
  ChatCompletionLocalApiProviderPurpose,
  ChatCompletionRequestBody,
  ContextUsageSummary,
  LocalChatCompletionProviderConfig,
  PROVIDER_ERROR_DETAIL_MAX_LENGTH,
  UsageAmounts,
  UsageTotals,
  WorktreeSetupFailurePayload,
  addUsageTotals,
  buildChatCompletionUrl,
  buildUtilityChatCompletionBody,
  buildUtilityProviderHeaders,
  cleanGeneratedChatName,
  emptyUsageTotals,
  generateChatNameWithConfiguredProvider,
  generateChatNameWithOllama,
  generateCommitMessageWithConfiguredProvider,
  generateCommitMessageWithOllama,
  getCodexRollbackUnsupportedMessage,
  getContextUsage,
  getFallbackName,
  getLocalChatCompletionProviderConfig,
  getMessageTimestampMs,
  getUsageAmounts,
  hasCodexBackedMessages,
  isCodexBackedMessage,
  isDeepSeekChatCompletionProvider,
  logProviderRequestFailure,
  readNumber,
  readObject,
  sendWorktreeSetupFailure,
} from "./chats-helpers"

export const generationProcedures = {
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
      const fileSummary = buildCommitFileSummary(files)
      const additions = files.reduce((sum, f) => sum + f.additions, 0)
      const deletions = files.reduce((sum, f) => sum + f.deletions, 0)

      console.log("[generateCommitMessage] Trying configured commit provider...")
      const configuredMessage = await generateCommitMessageWithConfiguredProvider(
        filteredDiff,
        fileSummary,
        files.length,
        additions,
        deletions,
      )
      if (configuredMessage) {
        console.log("[generateCommitMessage] Generated via configured provider")
        return { message: configuredMessage }
      }

      console.log("[generateCommitMessage] Trying local Ollama...")
      const ollamaMessage = await generateCommitMessageWithOllama(
        filteredDiff,
        fileSummary,
        files.length,
        additions,
        deletions,
        input.ollamaModel,
      )
      if (ollamaMessage) {
        console.log("[generateCommitMessage] Generated via Ollama:", ollamaMessage)
        return { message: ollamaMessage }
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
   * Uses local Ollama first, then an explicitly configured provider, then fallback.
   */
  generateSubChatName: publicProcedure
    .input(z.object({
      userMessage: z.string(),
      ollamaModel: z.string().nullish(), // Optional model for local title generation
    }))
    .mutation(async ({ input }) => {
      try {
        console.log("[generateSubChatName] Trying local Ollama...")
        const ollamaName = await generateChatNameWithOllama(
          input.userMessage,
          input.ollamaModel,
        )
        if (ollamaName) {
          console.log("[generateSubChatName] Generated name via Ollama:", ollamaName)
          return { name: ollamaName }
        }

        console.log("[generateSubChatName] Trying configured title provider...")
        const configuredName = await generateChatNameWithConfiguredProvider(
          input.userMessage,
        )
        if (configuredName) {
          console.log("[generateSubChatName] Generated name via configured provider")
          return { name: configuredName }
        }

        console.log("[generateSubChatName] Title providers unavailable, using fallback")
        return { name: getFallbackName(input.userMessage) }
      } catch (error) {
        console.error("[generateSubChatName] Error:", error)
        return { name: getFallbackName(input.userMessage) }
      }
    }),

  // ============ PR-related procedures ============

  /**
   * Get PR context for message generation (branch info, uncommitted changes, etc.)
   */
}

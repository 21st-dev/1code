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

export const diffProcedures = {
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
}

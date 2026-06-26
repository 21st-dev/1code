import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm"
import { BrowserWindow } from "electron"
import * as fs from "fs/promises"
import * as path from "path"
import simpleGit from "simple-git"
import { z } from "zod"
import {
  agentChatProviders,
  buildAgentChatMessageMetadata,
} from "../../../../shared/agent-chat-provider"
import { buildAgentRuntimeCapabilityDiagnostic } from "../../../../shared/agent-runtime-capabilities"
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
import { computeContentHash, gitCache } from "../../git/cache"
import { splitUnifiedDiffByFile } from "../../git/diff-parser"
import { execWithShellEnv } from "../../git/shell-env"
import { applyRollbackStash } from "../../git/stash"
import type { WorktreeSetupResult } from "../../git/worktree-config"
import { assertOfficialCloudAllowed } from "../../local-only"
import { checkOllamaStatus } from "../../ollama"
import { getProviderDefaultRuntimeConfig } from "../../provider-profiles/storage"
import { terminalManager } from "../../terminal/manager"
import { publicProcedure, router } from "../index"
import {
  buildCommitFileSummary,
  buildCommitMessagePrompt,
  cleanGeneratedCommitMessage,
} from "./commit-message-utils"
import {
  getActiveLocalApiProviderConfig,
  type LocalApiProviderPurpose,
} from "./local-api-provider-config"

export type WorktreeSetupFailurePayload = {
  kind: "create-failed" | "create-timeout" | "setup-failed"
  message: string
  projectId: string
  fallback?: {
    mode: "project-directory"
    path: string
  }
}

export type WorktreeSetupApprovalRequiredPayload = {
  chatId: string
  projectId: string
  worktreePath: string
  source: string
  configPath: string
  commandHash: string
  commands: string[]
}

export function isCodexBackedMessage(message: unknown): boolean {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as any).metadata?.provider === "codex"
  )
}

export function hasCodexBackedMessages(messages: unknown[]): boolean {
  return messages.some(isCodexBackedMessage)
}

export function getCodexRollbackUnsupportedMessage(): string {
  const diagnostic = buildAgentRuntimeCapabilityDiagnostic({
    runtime: "codex",
    capabilityId: "rollback",
  })
  return diagnostic.hint
    ? `${diagnostic.message} ${diagnostic.hint}`
    : diagnostic.message
}

export function sendWorktreeSetupFailure(
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

export function sendWorktreeSetupApprovalRequired(
  windowId: number | null,
  payload: WorktreeSetupApprovalRequiredPayload,
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
    window.webContents.send("worktree:setup-approval-required", payload)
  }
}

// Fallback to truncated user message if AI generation fails
export function getFallbackName(userMessage: string): string {
  const trimmed = userMessage.trim()
  if (trimmed.length <= 25) {
    return trimmed || "New Chat"
  }
  return trimmed.substring(0, 25) + "..."
}

export type LocalChatCompletionProviderConfig = {
  apiKey: string | null
  apiUrl: string
  model: string
  authMode?: "bearer" | "x-api-key" | "none"
}

export const COMMIT_MESSAGE_PROVIDER_TIMEOUT_MS = 15_000
export const PROVIDER_ERROR_DETAIL_MAX_LENGTH = 500

export type ChatCompletionRequestBody = {
  model: string
  messages: Array<{
    role: "system" | "user"
    content: string
  }>
  temperature: number
  max_tokens: number
  thinking?: {
    type: "disabled"
  }
}

export function cleanGeneratedChatName(value: unknown): string | null {
  if (typeof value !== "string") return null

  const cleaned = value
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^title:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 50)

  return cleaned.length > 0 ? cleaned : null
}

export function buildChatCompletionUrl(baseUrl: string): string {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "")
  if (/\/chat\/completions$/i.test(normalizedBaseUrl)) {
    return normalizedBaseUrl
  }

  return `${normalizedBaseUrl}/chat/completions`
}

export type ChatCompletionLocalApiProviderPurpose = Extract<
  LocalApiProviderPurpose,
  "sub_chat_title" | "commit_message"
>

export function getLocalChatCompletionProviderConfig(
  purpose: ChatCompletionLocalApiProviderPurpose,
): LocalChatCompletionProviderConfig | null {
  const profile = getProviderDefaultRuntimeConfig(purpose)
  if (profile && profile.protocol === "openai-chat") {
    return {
      apiKey: profile.token,
      apiUrl: buildChatCompletionUrl(profile.baseUrl),
      model: profile.modelOverride || profile.defaultModel,
      authMode: profile.authMode,
    }
  }

  const config = getActiveLocalApiProviderConfig(purpose)
  if (!config) return null

  return {
    apiKey: config.token,
    apiUrl: buildChatCompletionUrl(config.baseUrl),
    model: config.model,
    authMode: "bearer",
  }
}

export function buildUtilityProviderHeaders(
  config: LocalChatCompletionProviderConfig,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  if (config.authMode === "x-api-key" && config.apiKey) {
    headers["x-api-key"] = config.apiKey
  } else if (config.authMode !== "none" && config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`
  }
  return headers
}

export function isDeepSeekChatCompletionProvider(
  config: LocalChatCompletionProviderConfig,
): boolean {
  const apiUrl = config.apiUrl.toLowerCase()

  return apiUrl.includes("api.deepseek.com")
}

export function buildUtilityChatCompletionBody(
  config: LocalChatCompletionProviderConfig,
  body: Omit<ChatCompletionRequestBody, "thinking">,
): ChatCompletionRequestBody {
  if (!isDeepSeekChatCompletionProvider(config)) {
    return body
  }

  return {
    ...body,
    // DeepSeek V4 enables thinking by default. Utility calls need short plain
    // content, not a reasoning stream that can consume the whole token budget.
    thinking: { type: "disabled" },
  }
}

export type UsageTotals = {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  estimatedCostUsd: number
  messageCount: number
}

export type ContextUsageSummary = {
  usedTokens: number
  windowTokens: number
  remainingTokens: number
  percentUsed: number
  model: string | null
}

export type UsageAmounts = {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  estimatedCostUsd: number
}

export function emptyUsageTotals(): UsageTotals {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    messageCount: 0,
  }
}

export function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

export function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export function getMessageTimestampMs(
  message: Record<string, unknown>,
  fallbackDate: Date | null,
): number {
  const metadata = readObject(message.metadata)
  const candidates = [
    message.createdAt,
    metadata.createdAt,
    metadata.timestamp,
    metadata.completedAt,
  ]

  for (const candidate of candidates) {
    if (candidate instanceof Date) return candidate.getTime()
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate < 1_000_000_000_000 ? candidate * 1000 : candidate
    }
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      const parsed = Date.parse(candidate)
      if (!Number.isNaN(parsed)) return parsed
    }
  }

  return fallbackDate?.getTime() ?? 0
}

export function getUsageAmounts(
  message: Record<string, unknown>,
): UsageAmounts | null {
  const metadata = readObject(message.metadata)
  const nestedUsage = readObject(metadata.usage)

  const inputTokens =
    readNumber(metadata.inputTokens) ?? readNumber(nestedUsage.inputTokens) ?? 0
  const outputTokens =
    readNumber(metadata.outputTokens) ??
    readNumber(nestedUsage.outputTokens) ??
    0
  const totalTokens =
    readNumber(metadata.totalTokens) ??
    readNumber(nestedUsage.totalTokens) ??
    inputTokens + outputTokens
  const estimatedCostUsd =
    readNumber(metadata.totalCostUsd) ??
    readNumber(nestedUsage.totalCostUsd) ??
    0

  if (
    inputTokens <= 0 &&
    outputTokens <= 0 &&
    totalTokens <= 0 &&
    estimatedCostUsd <= 0
  ) {
    return null
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedCostUsd,
  }
}

export function addUsageTotals(target: UsageTotals, usage: UsageAmounts): void {
  target.inputTokens += usage.inputTokens
  target.outputTokens += usage.outputTokens
  target.totalTokens += usage.totalTokens
  target.estimatedCostUsd += usage.estimatedCostUsd
  target.messageCount += 1
}

export function getContextUsage(
  message: Record<string, unknown>,
): ContextUsageSummary | null {
  const metadata = readObject(message.metadata)
  const windowTokens =
    readNumber(metadata.modelContextWindow) ??
    readNumber(metadata.contextWindow)

  if (!windowTokens || windowTokens <= 0) {
    return null
  }

  const model = typeof metadata.model === "string" ? metadata.model : null
  const normalizedModel = model?.toLowerCase() ?? ""
  const isCodexModel =
    normalizedModel.includes("codex") || normalizedModel.startsWith("gpt-")
  const inputTokens = readNumber(metadata.inputTokens) ?? 0
  const outputTokens = readNumber(metadata.outputTokens) ?? 0
  const totalTokens = readNumber(metadata.totalTokens)
  const cacheReadInputTokens = readNumber(metadata.cacheReadInputTokens) ?? 0
  const cacheCreationInputTokens =
    readNumber(metadata.cacheCreationInputTokens) ?? 0

  const usedTokens = Math.max(
    0,
    isCodexModel && totalTokens !== null
      ? totalTokens - outputTokens
      : inputTokens + cacheReadInputTokens + cacheCreationInputTokens,
  )
  const percentUsed = Math.min(100, (usedTokens / windowTokens) * 100)

  return {
    usedTokens,
    windowTokens,
    remainingTokens: Math.max(0, windowTokens - usedTokens),
    percentUsed,
    model,
  }
}

export async function logProviderRequestFailure(
  label: string,
  response: Response,
): Promise<void> {
  let detail = ""
  try {
    detail = await response.text()
  } catch {
    // Ignore body read failures; the status code is still useful.
  }

  console.error(
    `[${label}] Provider request failed:`,
    response.status,
    detail.slice(0, PROVIDER_ERROR_DETAIL_MAX_LENGTH),
  )
}

/**
 * Generate chat title using the Settings-configured OpenAI-compatible provider.
 * This is only used after local Ollama has been tried.
 */
export async function generateChatNameWithConfiguredProvider(
  userMessage: string,
): Promise<string | null> {
  const config = getLocalChatCompletionProviderConfig("sub_chat_title")
  if (!config) {
    return null
  }

  try {
    assertOfficialCloudAllowed(
      "generate chat title with configured provider",
      config.apiUrl,
    )
    const response = await fetch(config.apiUrl, {
      method: "POST",
      headers: buildUtilityProviderHeaders(config),
      body: JSON.stringify(
        buildUtilityChatCompletionBody(config, {
          model: config.model,
          messages: [
            {
              role: "system",
              content:
                "Generate a very short 2-5 word coding chat title in the same language as the user. Return only the title.",
            },
            {
              role: "user",
              content: userMessage.slice(0, 500),
            },
          ],
          temperature: 0.3,
          max_tokens: 80,
        }),
      ),
    })

    if (!response.ok) {
      await logProviderRequestFailure("ChatTitle", response)
      return null
    }

    const data = await response.json()
    return cleanGeneratedChatName(data?.choices?.[0]?.message?.content)
  } catch (error) {
    console.error("[ChatTitle] Provider request error:", error)
    return null
  }
}

export async function generateCommitMessageWithConfiguredProvider(
  diff: string,
  fileSummary: string,
  fileCount: number,
  additions: number,
  deletions: number,
): Promise<string | null> {
  const config = getLocalChatCompletionProviderConfig("commit_message")
  if (!config) {
    return null
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(
    () => controller.abort(),
    COMMIT_MESSAGE_PROVIDER_TIMEOUT_MS,
  )

  try {
    assertOfficialCloudAllowed(
      "generate commit message with configured provider",
      config.apiUrl,
    )
    const response = await fetch(config.apiUrl, {
      method: "POST",
      signal: controller.signal,
      headers: buildUtilityProviderHeaders(config),
      body: JSON.stringify(
        buildUtilityChatCompletionBody(config, {
          model: config.model,
          messages: [
            {
              role: "system",
              content:
                "You write concise Conventional Commit subject lines from code diffs. Return only the subject line.",
            },
            {
              role: "user",
              content: buildCommitMessagePrompt(
                diff,
                fileSummary,
                fileCount,
                additions,
                deletions,
                10_000,
              ),
            },
          ],
          temperature: 0.2,
          max_tokens: 80,
        }),
      ),
    })

    if (!response.ok) {
      await logProviderRequestFailure("CommitMessage", response)
      return null
    }

    const data = await response.json()
    return cleanGeneratedCommitMessage(data?.choices?.[0]?.message?.content)
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.error("[CommitMessage] Provider request timed out")
    } else {
      console.error("[CommitMessage] Provider request error:", error)
    }
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Generate text using local Ollama model
 * Used for chat title generation in offline mode
 * @param userMessage - The user message to generate a title for
 * @param model - Optional model to use (if not provided, uses recommended model)
 */
export async function generateChatNameWithOllama(
  userMessage: string,
  model?: string | null,
): Promise<string | null> {
  try {
    const ollamaStatus = await checkOllamaStatus()
    if (!ollamaStatus.available) {
      return null
    }

    // Use provided model, or recommended, or first available
    const modelToUse =
      model || ollamaStatus.recommendedModel || ollamaStatus.models[0]
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
      return cleanGeneratedChatName(result)
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
export async function generateCommitMessageWithOllama(
  diff: string,
  fileSummary: string,
  fileCount: number,
  additions: number,
  deletions: number,
  model?: string | null,
): Promise<string | null> {
  try {
    const ollamaStatus = await checkOllamaStatus()
    if (!ollamaStatus.available) {
      return null
    }

    // Use provided model, or recommended, or first available
    const modelToUse =
      model || ollamaStatus.recommendedModel || ollamaStatus.models[0]
    if (!modelToUse) {
      console.error("[Ollama] No model available")
      return null
    }

    const prompt = buildCommitMessagePrompt(
      diff,
      fileSummary,
      fileCount,
      additions,
      deletions,
      3_000,
    )

    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelToUse,
        prompt,
        stream: false,
        options: {
          temperature: 0.2,
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
      return cleanGeneratedCommitMessage(result)
    }
    return null
  } catch (error) {
    console.error("[Ollama] Generate commit message error:", error)
    return null
  }
}

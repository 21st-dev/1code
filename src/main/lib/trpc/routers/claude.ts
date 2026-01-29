import { observable } from "@trpc/server/observable"
import { eq } from "drizzle-orm"
import { app, BrowserWindow, safeStorage } from "electron"
import * as fs from "fs/promises"
import * as os from "os"
import path from "path"
import { z } from "zod"
import { setConnectionMethod } from "../../analytics"
import {
  buildClaudeEnv,
  checkOfflineFallback,
  createTransformer,
  getBundledClaudeBinaryPath,
  logClaudeEnv,
  logRawClaudeMessage,
  type UIMessageChunk,
} from "../../claude"
import { getProjectMcpServers, GLOBAL_MCP_PATH, readClaudeConfig, resolveProjectPathFromWorktree, type McpServerConfig } from "../../claude-config"
import { chats, claudeCodeCredentials, getDatabase, subChats } from "../../db"
import { createRollbackStash } from "../../git/stash"
import { ensureMcpTokensFresh, fetchMcpTools, fetchMcpToolsStdio, getMcpAuthStatus, startMcpOAuth } from "../../mcp-auth"
import { fetchOAuthMetadata, getMcpBaseUrl } from "../../oauth"
import { publicProcedure, router } from "../index"
import { buildAgentsOption } from "./agent-utils"

/**
 * Parse @[agent:name], @[skill:name], and @[tool:name] mentions from prompt text
 * Returns the cleaned prompt and lists of mentioned agents/skills/tools
 *
 * File mention formats:
 * - @[file:local:relative/path] - file inside project (relative path)
 * - @[file:external:/absolute/path] - file outside project (absolute path)
 * - @[file:owner/repo:path] - legacy web format (repo:path)
 * - @[folder:local:path] or @[folder:external:path] - folder mentions
 */
function parseMentions(prompt: string): {
  cleanedPrompt: string
  agentMentions: string[]
  skillMentions: string[]
  fileMentions: string[]
  folderMentions: string[]
  toolMentions: string[]
} {
  const agentMentions: string[] = []
  const skillMentions: string[] = []
  const fileMentions: string[] = []
  const folderMentions: string[] = []
  const toolMentions: string[] = []

  // Match @[prefix:name] pattern
  const mentionRegex = /@\[(file|folder|skill|agent|tool):([^\]]+)\]/g
  let match

  while ((match = mentionRegex.exec(prompt)) !== null) {
    const [, type, name] = match
    switch (type) {
      case "agent":
        agentMentions.push(name)
        break
      case "skill":
        skillMentions.push(name)
        break
      case "file":
        fileMentions.push(name)
        break
      case "folder":
        folderMentions.push(name)
        break
      case "tool":
        // Validate tool name format: only alphanumeric, underscore, hyphen allowed
        // This prevents prompt injection via malicious tool names
        if (/^[a-zA-Z0-9_-]+$/.test(name)) {
          toolMentions.push(name)
        }
        break
    }
  }

  // Clean agent/skill/tool mentions from prompt (they will be added as context or hints)
  // Keep file/folder mentions as they are useful context
  let cleanedPrompt = prompt
    .replace(/@\[agent:[^\]]+\]/g, "")
    .replace(/@\[skill:[^\]]+\]/g, "")
    .replace(/@\[tool:[^\]]+\]/g, "")
    .trim()

  // Transform file mentions to readable paths for the agent
  // @[file:local:path] -> path (relative to project)
  // @[file:external:/abs/path] -> /abs/path (absolute)
  cleanedPrompt = cleanedPrompt
    .replace(/@\[file:local:([^\]]+)\]/g, "$1")
    .replace(/@\[file:external:([^\]]+)\]/g, "$1")
    .replace(/@\[folder:local:([^\]]+)\]/g, "$1")
    .replace(/@\[folder:external:([^\]]+)\]/g, "$1")

  // Add tool usage hints if tools were mentioned
  // Tool names are already validated to contain only safe characters
  if (toolMentions.length > 0) {
    const toolHints = toolMentions
      .map((t) => `Use the ${t} tool for this request.`)
      .join(" ")
    cleanedPrompt = `${toolHints}\n\n${cleanedPrompt}`
  }

  return { cleanedPrompt, agentMentions, skillMentions, fileMentions, folderMentions, toolMentions }
}

/**
 * Decrypt token using Electron's safeStorage
 */
function decryptToken(encrypted: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    return Buffer.from(encrypted, "base64").toString("utf-8")
  }
  const buffer = Buffer.from(encrypted, "base64")
  return safeStorage.decryptString(buffer)
}

/**
 * Get Claude Code OAuth token from local SQLite
 * Returns null if not connected
 */
function getClaudeCodeToken(): string | null {
  try {
    const db = getDatabase()
    const cred = db
      .select()
      .from(claudeCodeCredentials)
      .where(eq(claudeCodeCredentials.id, "default"))
      .get()

    if (!cred?.oauthToken) {
      console.log("[claude] No Claude Code credentials found")
      return null
    }

    return decryptToken(cred.oauthToken)
  } catch (error) {
    console.error("[claude] Error getting Claude Code token:", error)
    return null
  }
}

// Dynamic import for ESM module - CACHED to avoid re-importing on every message
let cachedClaudeQuery: typeof import("@anthropic-ai/claude-agent-sdk").query | null = null
const getClaudeQuery = async () => {
  if (cachedClaudeQuery) {
    return cachedClaudeQuery
  }
  const sdk = await import("@anthropic-ai/claude-agent-sdk")
  cachedClaudeQuery = sdk.query
  return cachedClaudeQuery
}

// Active sessions for cancellation (onAbort handles stash + abort + restore)
// Active sessions for cancellation
const activeSessions = new Map<string, AbortController>()

// In-memory cache of working MCP server names (resets on app restart)
// Key: "scope::serverName" where scope is "__global__" or projectPath
// Value: true if working (has tools), false if failed
export const workingMcpServers = new Map<string, boolean>()

// Helper to build scoped cache key
const GLOBAL_SCOPE = "__global__"
function mcpCacheKey(scope: string | null, serverName: string): string {
  return `${scope ?? GLOBAL_SCOPE}::${serverName}`
}

// Cache for symlinks (track which subChatIds have already set up symlinks)
const symlinksCreated = new Set<string>()

// Cache for MCP config (avoid re-reading ~/.claude.json on every message)
const mcpConfigCache = new Map<string, {
  config: Record<string, any> | undefined
  mtime: number
}>()

const pendingToolApprovals = new Map<
  string,
  {
    subChatId: string
    resolve: (decision: {
      approved: boolean
      message?: string
      updatedInput?: unknown
    }) => void
  }
>()

const PLAN_MODE_BLOCKED_TOOLS = new Set([
  "Bash",
  "NotebookEdit",
])

const clearPendingApprovals = (message: string, subChatId?: string) => {
  for (const [toolUseId, pending] of pendingToolApprovals) {
    if (subChatId && pending.subChatId !== subChatId) continue
    pending.resolve({ approved: false, message })
    pendingToolApprovals.delete(toolUseId)
  }
}

// Image attachment schema
const imageAttachmentSchema = z.object({
  base64Data: z.string(),
  mediaType: z.string(), // e.g. "image/png", "image/jpeg"
  filename: z.string().optional(),
})

export type ImageAttachment = z.infer<typeof imageAttachmentSchema>

/**
 * Clear all performance caches (for testing/debugging)
 */
export function clearClaudeCaches() {
  cachedClaudeQuery = null
  symlinksCreated.clear()
  mcpConfigCache.clear()
  console.log("[claude] All caches cleared")
}

/**
 * Determine server status based on config
 * - If authType is "none" -> "connected" (no auth required)
 * - If has Authorization header -> "connected" (OAuth completed, SDK can use it)
 * - If has _oauth but no headers -> "needs-auth" (legacy config, needs re-auth to migrate)
 * - If HTTP server (has URL) with explicit authType -> "needs-auth"
 * - HTTP server without authType -> "connected" (assume public)
 * - Local stdio server -> "connected"
 */
function getServerStatusFromConfig(serverConfig: McpServerConfig): string {
  const headers = serverConfig.headers as Record<string, string> | undefined
  const { _oauth: oauth, authType } = serverConfig

  // If authType is explicitly "none", no auth required
  if (authType === "none") {
    return "connected"
  }

  // If has Authorization header, it's ready for SDK to use
  if (headers?.Authorization) {
    return "connected"
  }

  // If has _oauth but no headers, this is a legacy config that needs re-auth
  // (old format that SDK can't use)
  if (oauth?.accessToken && !headers?.Authorization) {
    return "needs-auth"
  }

  // If HTTP server with explicit authType (oauth/bearer), needs auth
  if (serverConfig.url && (["oauth", "bearer"].includes(authType ?? ""))) {
    return "needs-auth"
  }

  // HTTP server without authType - assume no auth required (public endpoint)
  // Local stdio server - also connected
  return "connected"
}

const MCP_FETCH_TIMEOUT_MS = 10_000

/**
 * Fetch tools from an MCP server (HTTP or stdio transport)
 * Times out after 10 seconds to prevent slow MCPs from blocking the cache update
 */
async function fetchToolsForServer(serverConfig: McpServerConfig): Promise<string[]> {
  const timeoutPromise = new Promise<string[]>((_, reject) =>
    setTimeout(() => reject(new Error('Timeout')), MCP_FETCH_TIMEOUT_MS)
  )

  const fetchPromise = (async () => {
    // HTTP transport
    if (serverConfig.url) {
      const headers = serverConfig.headers as Record<string, string> | undefined
      try {
        return await fetchMcpTools(serverConfig.url, headers)
      } catch {
        return []
      }
    }

    // Stdio transport
    const command = (serverConfig as any).command as string | undefined
    if (command) {
      try {
        return await fetchMcpToolsStdio({
          command,
          args: (serverConfig as any).args,
          env: (serverConfig as any).env,
        })
      } catch {
        return []
      }
    }

    return []
  })()

  try {
    return await Promise.race([fetchPromise, timeoutPromise])
  } catch {
    return []
  }
}

/**
 * Handler for getAllMcpConfig - exported so it can be called on app startup
 */
export async function getAllMcpConfigHandler() {
  try {
    const totalStart = Date.now()

    // Clear cache before repopulating
    workingMcpServers.clear()

    const config = await readClaudeConfig()

    const convertServers = async (servers: Record<string, McpServerConfig> | undefined, scope: string | null) => {
      if (!servers) return []

      const results = await Promise.all(
        Object.entries(servers).map(async ([name, serverConfig]) => {
          const configObj = serverConfig as Record<string, unknown>
          let status = getServerStatusFromConfig(serverConfig)
          const headers = serverConfig.headers as Record<string, string> | undefined

          let tools: string[] = []
          let needsAuth = false

          try {
            tools = await fetchToolsForServer(serverConfig)
          } catch (error) {
            console.error(`[MCP] Failed to fetch tools for ${name}:`, error)
          }

          const cacheKey = mcpCacheKey(scope, name)
          if (tools.length > 0) {
            status = "connected"
            workingMcpServers.set(cacheKey, true)
          } else {
            workingMcpServers.set(cacheKey, false)
            if (serverConfig.url) {
              try {
                const baseUrl = getMcpBaseUrl(serverConfig.url)
                const metadata = await fetchOAuthMetadata(baseUrl)
                needsAuth = !!metadata && !!metadata.authorization_endpoint
              } catch {
                // If probe fails, assume no auth needed
              }
            } else if (serverConfig.authType === "oauth" || serverConfig.authType === "bearer") {
              needsAuth = true
            }

            if (needsAuth && !headers?.Authorization) {
              status = "needs-auth"
            }
          }

          return { name, status, tools, needsAuth, config: configObj }
        })
      )

      return results
    }

    // Build list of all groups to process with timing
    const groupTasks: Array<{
      groupName: string
      projectPath: string | null
      promise: Promise<{
        mcpServers: Array<{ name: string; status: string; tools: string[]; needsAuth: boolean; config: Record<string, unknown> }>
        duration: number
      }>
    }> = []

    // Global MCPs
    if (config.mcpServers) {
      groupTasks.push({
        groupName: "Global",
        projectPath: null,
        promise: (async () => {
          const start = Date.now()
          const freshServers = await ensureMcpTokensFresh(config.mcpServers!, GLOBAL_MCP_PATH)
          const mcpServers = await convertServers(freshServers, null) // null = global scope
          return { mcpServers, duration: Date.now() - start }
        })()
      })
    } else {
      groupTasks.push({
        groupName: "Global",
        projectPath: null,
        promise: Promise.resolve({ mcpServers: [], duration: 0 })
      })
    }

    // Project MCPs
    if (config.projects) {
      for (const [projectPath, projectConfig] of Object.entries(config.projects)) {
        if (projectConfig.mcpServers && Object.keys(projectConfig.mcpServers).length > 0) {
          const groupName = path.basename(projectPath) || projectPath
          groupTasks.push({
            groupName,
            projectPath,
            promise: (async () => {
              const start = Date.now()
              const freshServers = await ensureMcpTokensFresh(projectConfig.mcpServers!, projectPath)
              const mcpServers = await convertServers(freshServers, projectPath) // projectPath = scope
              return { mcpServers, duration: Date.now() - start }
            })()
          })
        }
      }
    }

    // Process all groups in parallel
    const results = await Promise.all(groupTasks.map(t => t.promise))

    // Build groups with timing info
    const groupsWithTiming = groupTasks.map((task, i) => ({
      groupName: task.groupName,
      projectPath: task.projectPath,
      mcpServers: results[i].mcpServers,
      duration: results[i].duration
    }))

    // Log performance (sorted by duration DESC)
    const totalDuration = Date.now() - totalStart
    const workingCount = [...workingMcpServers.values()].filter(v => v).length
    const sortedByDuration = [...groupsWithTiming].sort((a, b) => b.duration - a.duration)

    console.log(`[MCP] Cache updated in ${totalDuration}ms. Working: ${workingCount}/${workingMcpServers.size}`)
    for (const g of sortedByDuration) {
      if (g.mcpServers.length > 0) {
        console.log(`[MCP]   ${g.groupName}: ${g.duration}ms (${g.mcpServers.length} servers)`)
      }
    }

    // Return groups without timing info
    const groups = groupsWithTiming.map(({ groupName, projectPath, mcpServers }) => ({
      groupName,
      projectPath,
      mcpServers
    }))

    return { groups }
  } catch (error) {
    console.error("[getAllMcpConfig] Error:", error)
    return { groups: [], error: String(error) }
  }
}

export const claudeRouter = router({
  /**
   * Stream chat with Claude - single subscription handles everything
   */
  chat: publicProcedure
    .input(
      z.object({
        subChatId: z.string(),
        chatId: z.string(),
        prompt: z.string(),
        cwd: z.string(),
        projectPath: z.string().optional(), // Original project path for MCP config lookup
        mode: z.enum(["plan", "agent"]).default("agent"),
        sessionId: z.string().optional(),
        model: z.string().optional(),
        customConfig: z
          .object({
            model: z.string().min(1),
            token: z.string().min(1),
            baseUrl: z.string().min(1),
          })
          .optional(),
        maxThinkingTokens: z.number().optional(), // Enable extended thinking
        images: z.array(imageAttachmentSchema).optional(), // Image attachments
        historyEnabled: z.boolean().optional(),
        offlineModeEnabled: z.boolean().optional(), // Whether offline mode (Ollama) is enabled in settings
        enableTasks: z.boolean().optional(), // Enable task management tools (TodoWrite, Task agents)
      }),
    )
    .subscription(({ input }) => {
      return observable<UIMessageChunk>((emit) => {
        // Abort any existing session for this subChatId before starting a new one
        // This prevents race conditions if two messages are sent in quick succession
        const existingController = activeSessions.get(input.subChatId)
        if (existingController) {
          existingController.abort()
        }

        const abortController = new AbortController()
        const streamId = crypto.randomUUID()
        activeSessions.set(input.subChatId, abortController)

        // Stream debug logging
        const subId = input.subChatId.slice(-8) // Short ID for logs
        const streamStart = Date.now()
        let chunkCount = 0
        let lastChunkType = ""
        // Shared sessionId for cleanup to save on abort
        let currentSessionId: string | null = null
        console.log(`[SD] M:START sub=${subId} stream=${streamId.slice(-8)} mode=${input.mode}`)

        // Track if observable is still active (not unsubscribed)
        let isObservableActive = true

        // Helper to safely emit (no-op if already unsubscribed)
        const safeEmit = (chunk: UIMessageChunk) => {
          if (!isObservableActive) return false
          try {
            emit.next(chunk)
            return true
          } catch {
            isObservableActive = false
            return false
          }
        }

        // Helper to safely complete (no-op if already closed)
        const safeComplete = () => {
          try {
            emit.complete()
          } catch {
            // Already completed or closed
          }
        }

        // Helper to emit error to frontend
        const emitError = (error: unknown, context: string) => {
          const errorMessage =
            error instanceof Error ? error.message : String(error)
          const errorStack = error instanceof Error ? error.stack : undefined

          console.error(`[claude] ${context}:`, errorMessage)
          if (errorStack) console.error("[claude] Stack:", errorStack)

          // Send detailed error to frontend (safely)
          safeEmit({
            type: "error",
            errorText: `${context}: ${errorMessage}`,
            // Include extra debug info
            ...(process.env.NODE_ENV !== "production" && {
              debugInfo: {
                context,
                cwd: input.cwd,
                mode: input.mode,
                PATH: process.env.PATH?.slice(0, 200),
              },
            }),
          } as UIMessageChunk)
        }

        ;(async () => {
          try {
            const db = getDatabase()

            // 1. Get existing messages from DB
            const existing = db
              .select()
              .from(subChats)
              .where(eq(subChats.id, input.subChatId))
              .get()
            const existingMessages = JSON.parse(existing?.messages || "[]")
            const existingSessionId = existing?.sessionId || null

            // Get resumeSessionAt UUID only if shouldResume flag was set (by rollbackToMessage)
            const lastAssistantMsg = [...existingMessages].reverse().find(
              (m: any) => m.role === "assistant"
            )
            const resumeAtUuid = lastAssistantMsg?.metadata?.shouldResume
              ? (lastAssistantMsg?.metadata?.sdkMessageUuid || null)
              : null
            const historyEnabled = input.historyEnabled === true

            // Check if last message is already this user message (avoid duplicate)
            const lastMsg = existingMessages[existingMessages.length - 1]
            const isDuplicate =
              lastMsg?.role === "user" &&
              lastMsg?.parts?.[0]?.text === input.prompt

            // 2. Create user message and save BEFORE streaming (skip if duplicate)
            let userMessage: any
            let messagesToSave: any[]

            if (isDuplicate) {
              userMessage = lastMsg
              messagesToSave = existingMessages
            } else {
              userMessage = {
                id: crypto.randomUUID(),
                role: "user",
                parts: [{ type: "text", text: input.prompt }],
              }
              messagesToSave = [...existingMessages, userMessage]

              db.update(subChats)
                .set({
                  messages: JSON.stringify(messagesToSave),
                  streamId,
                  updatedAt: new Date(),
                })
                .where(eq(subChats.id, input.subChatId))
                .run()
            }

            // 2.5. AUTO-FALLBACK: Check internet and switch to Ollama if offline
            // Only check if offline mode is enabled in settings
            const claudeCodeToken = getClaudeCodeToken()
            const offlineResult = await checkOfflineFallback(
              input.customConfig,
              claudeCodeToken,
              undefined, // selectedOllamaModel - will be read from customConfig if present
              input.offlineModeEnabled ?? false, // Pass offline mode setting
            )

            if (offlineResult.error) {
              emitError(new Error(offlineResult.error), 'Offline mode unavailable')
              safeEmit({ type: 'finish' } as UIMessageChunk)
              safeComplete()
              return
            }

            // Use offline config if available
            const finalCustomConfig = offlineResult.config || input.customConfig
            const isUsingOllama = offlineResult.isUsingOllama

            // Track connection method for analytics
            let connectionMethod = "claude-subscription" // default (Claude Code OAuth)
            if (isUsingOllama) {
              connectionMethod = "offline-ollama"
            } else if (finalCustomConfig) {
              // Has custom config = either API key or custom model
              const isDefaultAnthropicUrl = !finalCustomConfig.baseUrl ||
                finalCustomConfig.baseUrl.includes("anthropic.com")
              connectionMethod = isDefaultAnthropicUrl ? "api-key" : "custom-model"
            }
            setConnectionMethod(connectionMethod)

            // Offline status is shown in sidebar, no need to emit message here
            // (emitting text-delta without text-start breaks UI text rendering)

            // 3. Get Claude SDK
            let claudeQuery
            try {
              claudeQuery = await getClaudeQuery()
            } catch (sdkError) {
              emitError(sdkError, "Failed to load Claude SDK")
              console.log(`[SD] M:END sub=${subId} reason=sdk_load_error n=${chunkCount}`)
              safeEmit({ type: "finish" } as UIMessageChunk)
              safeComplete()
              return
            }

            const transform = createTransformer({
              emitSdkMessageUuid: historyEnabled,
              isUsingOllama,
            })

            // 4. Setup accumulation state
            const parts: any[] = []
            let currentText = ""
            let metadata: any = {}

            // Capture stderr from Claude process for debugging
            const stderrLines: string[] = []

            // Parse mentions from prompt (agents, skills, files, folders)
            const { cleanedPrompt, agentMentions, skillMentions } = parseMentions(input.prompt)

            // Build agents option for SDK (proper registration via options.agents)
            const agentsOption = await buildAgentsOption(agentMentions, input.cwd)

            // Log if agents were mentioned
            if (agentMentions.length > 0) {
              console.log(`[claude] Registering agents via SDK:`, Object.keys(agentsOption))
            }

            // Log if skills were mentioned
            if (skillMentions.length > 0) {
              console.log(`[claude] Skills mentioned:`, skillMentions)
            }

            // Build final prompt with skill instructions if needed
            let finalPrompt = cleanedPrompt

            // Handle empty prompt when only mentions are present
            if (!finalPrompt.trim()) {
              if (agentMentions.length > 0 && skillMentions.length > 0) {
                finalPrompt = `Use the ${agentMentions.join(", ")} agent(s) and invoke the "${skillMentions.join('", "')}" skill(s) using the Skill tool for this task.`
              } else if (agentMentions.length > 0) {
                finalPrompt = `Use the ${agentMentions.join(", ")} agent(s) for this task.`
              } else if (skillMentions.length > 0) {
                finalPrompt = `Invoke the "${skillMentions.join('", "')}" skill(s) using the Skill tool for this task.`
              }
            } else if (skillMentions.length > 0) {
              // Append skill instruction to existing prompt
              finalPrompt = `${finalPrompt}\n\nUse the "${skillMentions.join('", "')}" skill(s) for this task.`
            }

            // Build prompt: if there are images, create an AsyncIterable<SDKUserMessage>
            // Otherwise use simple string prompt
            let prompt: string | AsyncIterable<any> = finalPrompt

            if (input.images && input.images.length > 0) {
              // Create message content array with images first, then text
              const messageContent: any[] = [
                ...input.images.map((img) => ({
                  type: "image" as const,
                  source: {
                    type: "base64" as const,
                    media_type: img.mediaType,
                    data: img.base64Data,
                  },
                })),
              ]

              // Add text if present
              if (finalPrompt.trim()) {
                messageContent.push({
                  type: "text" as const,
                  text: finalPrompt,
                })
              }

              // Create an async generator that yields a single SDKUserMessage
              async function* createPromptWithImages() {
                yield {
                  type: "user" as const,
                  message: {
                    role: "user" as const,
                    content: messageContent,
                  },
                  parent_tool_use_id: null,
                }
              }

              prompt = createPromptWithImages()
            }

            // Build full environment for Claude SDK (includes HOME, PATH, etc.)
            const claudeEnv = buildClaudeEnv({
              ...(finalCustomConfig && {
                customEnv: {
                  ANTHROPIC_AUTH_TOKEN: finalCustomConfig.token,
                  ANTHROPIC_BASE_URL: finalCustomConfig.baseUrl,
                },
              }),
              enableTasks: input.enableTasks ?? true,
            })

            // Debug logging in dev
            if (process.env.NODE_ENV !== "production") {
              logClaudeEnv(claudeEnv, `[${input.subChatId}] `)
            }

            // Create isolated config directory per subChat to prevent session contamination
            // The Claude binary stores sessions in ~/.claude/ based on cwd, which causes
            // cross-chat contamination when multiple chats use the same project folder
            // For Ollama: use chatId instead of subChatId so all messages in the same chat share history
            const isolatedConfigDir = path.join(
              app.getPath("userData"),
              "claude-sessions",
              isUsingOllama ? input.chatId : input.subChatId
            )

            // MCP servers to pass to SDK (read from ~/.claude.json)
            let mcpServersForSdk: Record<string, any> | undefined

            // Ensure isolated config dir exists and symlink skills/agents from ~/.claude/
            // This is needed because SDK looks for skills at $CLAUDE_CONFIG_DIR/skills/
            // OPTIMIZATION: Only create symlinks once per subChatId (cached)
            try {
              await fs.mkdir(isolatedConfigDir, { recursive: true })

              // Only create symlinks if not already created for this config dir
              const cacheKey = isUsingOllama ? input.chatId : input.subChatId
              if (!symlinksCreated.has(cacheKey)) {
                const homeClaudeDir = path.join(os.homedir(), ".claude")
                const skillsSource = path.join(homeClaudeDir, "skills")
                const skillsTarget = path.join(isolatedConfigDir, "skills")
                const agentsSource = path.join(homeClaudeDir, "agents")
                const agentsTarget = path.join(isolatedConfigDir, "agents")

                // Symlink skills directory if source exists and target doesn't
                try {
                  const skillsSourceExists = await fs.stat(skillsSource).then(() => true).catch(() => false)
                  const skillsTargetExists = await fs.lstat(skillsTarget).then(() => true).catch(() => false)
                  if (skillsSourceExists && !skillsTargetExists) {
                    await fs.symlink(skillsSource, skillsTarget, "dir")
                  }
                } catch (symlinkErr) {
                  // Ignore symlink errors (might already exist or permission issues)
                }

                // Symlink agents directory if source exists and target doesn't
                try {
                  const agentsSourceExists = await fs.stat(agentsSource).then(() => true).catch(() => false)
                  const agentsTargetExists = await fs.lstat(agentsTarget).then(() => true).catch(() => false)
                  if (agentsSourceExists && !agentsTargetExists) {
                    await fs.symlink(agentsSource, agentsTarget, "dir")
                  }
                } catch (symlinkErr) {
                  // Ignore symlink errors (might already exist or permission issues)
                }

                symlinksCreated.add(cacheKey)
              }

              // Read MCP servers from ~/.claude.json for the original project path
              // These will be passed directly to the SDK via options.mcpServers
              // OPTIMIZATION: Cache MCP config by file mtime to avoid re-parsing on every message
              const claudeJsonSource = path.join(os.homedir(), ".claude.json")
              try {
                const stats = await fs.stat(claudeJsonSource).catch(() => null)

                if (stats) {
                  const currentMtime = stats.mtimeMs
                  const cached = mcpConfigCache.get(claudeJsonSource)
                  const lookupPath = input.projectPath || input.cwd

                  // Get or refresh cached config
                  let claudeConfig: any
                  if (cached && cached.mtime === currentMtime) {
                    claudeConfig = cached.config
                  } else {
                    claudeConfig = JSON.parse(await fs.readFile(claudeJsonSource, "utf-8"))
                    mcpConfigCache.set(claudeJsonSource, { config: claudeConfig, mtime: currentMtime })
                  }

                  // Merge global + project servers (project overrides global)
                  // getProjectMcpServers resolves worktree paths internally
                  const globalServers = claudeConfig.mcpServers || {}
                  const projectServers = getProjectMcpServers(claudeConfig, lookupPath) || {}
                  const allServers = { ...globalServers, ...projectServers }

                  // Filter to only working MCPs using scoped cache keys
                  if (workingMcpServers.size > 0) {
                    const filtered: Record<string, any> = {}
                    // Resolve worktree path to original project path to match cache keys
                    const resolvedProjectPath = resolveProjectPathFromWorktree(lookupPath) || lookupPath
                    for (const [name, config] of Object.entries(allServers)) {
                      // Use resolved project scope if server is from project, otherwise global
                      const scope = name in projectServers ? resolvedProjectPath : null
                      if (workingMcpServers.get(mcpCacheKey(scope, name)) === true) {
                        filtered[name] = config
                      }
                    }
                    mcpServersForSdk = filtered
                    const skipped = Object.keys(allServers).length - Object.keys(filtered).length
                    if (skipped > 0) {
                      console.log(`[claude] Filtered out ${skipped} non-working MCP(s)`)
                    }
                  } else {
                    mcpServersForSdk = allServers
                  }
                }
              } catch (configErr) {
                console.error(`[claude] Failed to read MCP config:`, configErr)
              }
            } catch (mkdirErr) {
              console.error(`[claude] Failed to setup isolated config dir:`, mkdirErr)
            }

            // Check if user has existing API key or proxy configured in their shell environment
            // If so, use that instead of OAuth (allows using custom API proxies)
            // Based on PR #29 by @sa4hnd
            const hasExistingApiConfig = !!(claudeEnv.ANTHROPIC_API_KEY || claudeEnv.ANTHROPIC_BASE_URL)

            if (hasExistingApiConfig) {
              console.log(`[claude] Using existing CLI config - API_KEY: ${claudeEnv.ANTHROPIC_API_KEY ? "set" : "not set"}, BASE_URL: ${claudeEnv.ANTHROPIC_BASE_URL || "default"}`)
            }

            // Build final env - only add OAuth token if we have one AND no existing API config
            // Existing CLI config takes precedence over OAuth
            const finalEnv = {
              ...claudeEnv,
              ...(claudeCodeToken && !hasExistingApiConfig && {
                CLAUDE_CODE_OAUTH_TOKEN: claudeCodeToken,
              }),
              // Re-enable CLAUDE_CONFIG_DIR now that we properly map MCP configs
              CLAUDE_CONFIG_DIR: isolatedConfigDir,
            }

            // Get bundled Claude binary path
            const claudeBinaryPath = getBundledClaudeBinaryPath()

            const resumeSessionId = input.sessionId || existingSessionId || undefined

            // DEBUG: Session resume path tracing
            const expectedSanitizedCwd = input.cwd.replace(/[/.]/g, "-")
            const expectedSessionPath = path.join(isolatedConfigDir, "projects", expectedSanitizedCwd, `${resumeSessionId}.jsonl`)
            console.log(`[claude] ========== SESSION DEBUG ==========`)
            console.log(`[claude] subChatId: ${input.subChatId}`)
            console.log(`[claude] cwd: ${input.cwd}`)
            console.log(`[claude] sanitized cwd (expected): ${expectedSanitizedCwd}`)
            console.log(`[claude] CLAUDE_CONFIG_DIR: ${isolatedConfigDir}`)
            console.log(`[claude] Expected session path: ${expectedSessionPath}`)
            console.log(`[claude] Session ID to resume: ${resumeSessionId}`)
            console.log(`[claude] Existing sessionId from DB: ${existingSessionId}`)
            console.log(`[claude] Resume at UUID: ${resumeAtUuid}`)
            console.log(`[claude] ========== END SESSION DEBUG ==========`)

            console.log(`[SD] Query options - cwd: ${input.cwd}, projectPath: ${input.projectPath || "(not set)"}, mcpServers: ${mcpServersForSdk ? Object.keys(mcpServersForSdk).join(", ") : "(none)"}`)
            if (finalCustomConfig) {
              const redactedConfig = {
                ...finalCustomConfig,
                token: `${finalCustomConfig.token.slice(0, 6)}...`,
              }
              if (isUsingOllama) {
                console.log(`[Ollama] Using offline mode - Model: ${finalCustomConfig.model}, Base URL: ${finalCustomConfig.baseUrl}`)
              } else {
                console.log(`[claude] Custom config: ${JSON.stringify(redactedConfig)}`)
              }
            }

            const resolvedModel = finalCustomConfig?.model || input.model

            // DEBUG: If using Ollama, test if it's actually responding
            if (isUsingOllama && finalCustomConfig) {
              console.log('[Ollama Debug] Testing Ollama connectivity...')
              try {
                const testResponse = await fetch(`${finalCustomConfig.baseUrl}/api/tags`, {
                  signal: AbortSignal.timeout(2000)
                })
                if (testResponse.ok) {
                  const data = await testResponse.json()
                  const models = data.models?.map((m: any) => m.name) || []
                  console.log('[Ollama Debug] Ollama is responding. Available models:', models)

                  if (!models.includes(finalCustomConfig.model)) {
                    console.error(`[Ollama Debug] WARNING: Model "${finalCustomConfig.model}" not found in Ollama!`)
                    console.error(`[Ollama Debug] Available models:`, models)
                    console.error(`[Ollama Debug] This will likely cause the stream to hang or fail silently.`)
                  } else {
                    console.log(`[Ollama Debug] ✓ Model "${finalCustomConfig.model}" is available`)
                  }
                } else {
                  console.error('[Ollama Debug] Ollama returned error:', testResponse.status)
                }
              } catch (err) {
                console.error('[Ollama Debug] Failed to connect to Ollama:', err)
              }
            }

            // Skip MCP servers entirely in offline mode (Ollama) - they slow down initialization by 60+ seconds
            // Otherwise pass all MCP servers - the SDK will handle connection
            let mcpServersFiltered: Record<string, any> | undefined

            if (isUsingOllama) {
              console.log('[Ollama] Skipping MCP servers to speed up initialization')
              mcpServersFiltered = undefined
            } else {
              // Ensure MCP tokens are fresh (refresh if within 5 min of expiry)
              if (mcpServersForSdk && Object.keys(mcpServersForSdk).length > 0) {
                const lookupPath = input.projectPath || input.cwd
                mcpServersFiltered = await ensureMcpTokensFresh(mcpServersForSdk, lookupPath)
              } else {
                mcpServersFiltered = mcpServersForSdk
              }
            }

            // Log SDK configuration for debugging
            if (isUsingOllama) {
              console.log('[Ollama Debug] SDK Configuration:', {
                model: resolvedModel,
                baseUrl: finalEnv.ANTHROPIC_BASE_URL,
                cwd: input.cwd,
                configDir: isolatedConfigDir,
                hasAuthToken: !!finalEnv.ANTHROPIC_AUTH_TOKEN,
                tokenPreview: finalEnv.ANTHROPIC_AUTH_TOKEN?.slice(0, 10) + '...',
              })
              console.log('[Ollama Debug] Session settings:', {
                resumeSessionId: resumeSessionId || 'none (first message)',
                mode: resumeSessionId ? 'resume' : 'continue',
                note: resumeSessionId
                  ? 'Resuming existing session to maintain chat history'
                  : 'Starting new session with continue mode'
              })
            }

            // For Ollama: embed context AND history directly in prompt
            // Ollama doesn't have server-side sessions, so we must include full history
            let finalQueryPrompt: string | AsyncIterable<any> = prompt
            if (isUsingOllama && typeof prompt === 'string') {
              // Format conversation history from existingMessages (excluding current message)
              // IMPORTANT: Include tool calls info so model knows what files were read/edited
              let historyText = ''
              if (existingMessages.length > 0) {
                const historyParts: string[] = []
                for (const msg of existingMessages) {
                  if (msg.role === 'user') {
                    // Extract text from user message parts
                    const textParts = msg.parts?.filter((p: any) => p.type === 'text').map((p: any) => p.text) || []
                    if (textParts.length > 0) {
                      historyParts.push(`User: ${textParts.join('\n')}`)
                    }
                  } else if (msg.role === 'assistant') {
                    // Extract text AND tool calls from assistant message parts
                    const parts = msg.parts || []
                    const textParts: string[] = []
                    const toolSummaries: string[] = []

                    for (const p of parts) {
                      if (p.type === 'text' && p.text) {
                        textParts.push(p.text)
                      } else if (p.type === 'tool_use' || p.type === 'tool-use') {
                        // Include brief tool call info - this is critical for context!
                        const toolName = p.name || p.tool || 'unknown'
                        const toolInput = p.input || {}
                        // Extract key info based on tool type
                        let toolInfo = `[Used ${toolName}`
                        if (toolName === 'Read' && (toolInput.file_path || toolInput.file)) {
                          toolInfo += `: ${toolInput.file_path || toolInput.file}`
                        } else if (toolName === 'Edit' && toolInput.file_path) {
                          toolInfo += `: ${toolInput.file_path}`
                        } else if (toolName === 'Write' && toolInput.file_path) {
                          toolInfo += `: ${toolInput.file_path}`
                        } else if (toolName === 'Glob' && toolInput.pattern) {
                          toolInfo += `: ${toolInput.pattern}`
                        } else if (toolName === 'Grep' && toolInput.pattern) {
                          toolInfo += `: "${toolInput.pattern}"`
                        } else if (toolName === 'Bash' && toolInput.command) {
                          const cmd = String(toolInput.command).slice(0, 50)
                          toolInfo += `: ${cmd}${toolInput.command.length > 50 ? '...' : ''}`
                        }
                        toolInfo += ']'
                        toolSummaries.push(toolInfo)
                      }
                    }

                    // Combine text and tool summaries
                    let assistantContent = ''
                    if (textParts.length > 0) {
                      assistantContent = textParts.join('\n')
                    }
                    if (toolSummaries.length > 0) {
                      if (assistantContent) {
                        assistantContent += '\n' + toolSummaries.join(' ')
                      } else {
                        assistantContent = toolSummaries.join(' ')
                      }
                    }
                    if (assistantContent) {
                      historyParts.push(`Assistant: ${assistantContent}`)
                    }
                  }
                }
                if (historyParts.length > 0) {
                  // Limit history to last ~10000 chars to avoid context overflow
                  let history = historyParts.join('\n\n')
                  if (history.length > 10000) {
                    history = '...(earlier messages truncated)...\n\n' + history.slice(-10000)
                  }
                  historyText = `[CONVERSATION HISTORY]
${history}
[/CONVERSATION HISTORY]

`
                  console.log(`[Ollama] Added ${historyParts.length} messages to history (${history.length} chars)`)
                }
              }

              const ollamaContext = `[CONTEXT]
You are a coding assistant in OFFLINE mode (Ollama model: ${resolvedModel || 'unknown'}).
Project: ${input.projectPath || input.cwd}
Working directory: ${input.cwd}

IMPORTANT: When using tools, use these EXACT parameter names:
- Read: use "file_path" (not "file")
- Write: use "file_path" and "content"
- Edit: use "file_path", "old_string", "new_string"
- Glob: use "pattern" (e.g. "**/*.ts") and optionally "path"
- Grep: use "pattern" and optionally "path"
- Bash: use "command"

When asked about the project, use Glob to find files and Read to examine them.
Be concise and helpful.
[/CONTEXT]

${historyText}[CURRENT REQUEST]
${prompt}
[/CURRENT REQUEST]`
              finalQueryPrompt = ollamaContext
              console.log('[Ollama] Context prefix added to prompt')
            }

            // System prompt config - use preset for both Claude and Ollama
            const systemPromptConfig = {
              type: "preset" as const,
              preset: "claude_code" as const,
            }

            const queryOptions = {
              prompt: finalQueryPrompt,
              options: {
                abortController, // Must be inside options!
                cwd: input.cwd,
                systemPrompt: systemPromptConfig,
                // Register mentioned agents with SDK via options.agents (skip for Ollama - not supported)
                ...(!isUsingOllama && Object.keys(agentsOption).length > 0 && { agents: agentsOption }),
                // Pass filtered MCP servers (only working/unknown ones, skip failed/needs-auth)
                ...(mcpServersFiltered && Object.keys(mcpServersFiltered).length > 0 && { mcpServers: mcpServersFiltered }),
                env: finalEnv,
                permissionMode:
                  input.mode === "plan"
                    ? ("plan" as const)
                    : ("bypassPermissions" as const),
                ...(input.mode !== "plan" && {
                  allowDangerouslySkipPermissions: true,
                }),
                includePartialMessages: true,
                // Load skills from project and user directories (skip for Ollama - not supported)
                ...(!isUsingOllama && { settingSources: ["project" as const, "user" as const] }),
                canUseTool: async (
                  toolName: string,
                  toolInput: Record<string, unknown>,
                  options: { toolUseID: string },
                ) => {
                  // Fix common parameter mistakes from Ollama models
                  // Local models often use slightly wrong parameter names
                  if (isUsingOllama) {
                    // Read: "file" -> "file_path"
                    if (toolName === "Read" && toolInput.file && !toolInput.file_path) {
                      toolInput.file_path = toolInput.file
                      delete toolInput.file
                      console.log('[Ollama] Fixed Read tool: file -> file_path')
                    }
                    // Write: "file" -> "file_path", "content" is usually correct
                    if (toolName === "Write" && toolInput.file && !toolInput.file_path) {
                      toolInput.file_path = toolInput.file
                      delete toolInput.file
                      console.log('[Ollama] Fixed Write tool: file -> file_path')
                    }
                    // Edit: "file" -> "file_path"
                    if (toolName === "Edit" && toolInput.file && !toolInput.file_path) {
                      toolInput.file_path = toolInput.file
                      delete toolInput.file
                      console.log('[Ollama] Fixed Edit tool: file -> file_path')
                    }
                    // Glob: "path" might be passed as "directory" or "dir"
                    if (toolName === "Glob") {
                      if (toolInput.directory && !toolInput.path) {
                        toolInput.path = toolInput.directory
                        delete toolInput.directory
                        console.log('[Ollama] Fixed Glob tool: directory -> path')
                      }
                      if (toolInput.dir && !toolInput.path) {
                        toolInput.path = toolInput.dir
                        delete toolInput.dir
                        console.log('[Ollama] Fixed Glob tool: dir -> path')
                      }
                    }
                    // Grep: "query" -> "pattern", "directory" -> "path"
                    if (toolName === "Grep") {
                      if (toolInput.query && !toolInput.pattern) {
                        toolInput.pattern = toolInput.query
                        delete toolInput.query
                        console.log('[Ollama] Fixed Grep tool: query -> pattern')
                      }
                      if (toolInput.directory && !toolInput.path) {
                        toolInput.path = toolInput.directory
                        delete toolInput.directory
                        console.log('[Ollama] Fixed Grep tool: directory -> path')
                      }
                    }
                    // Bash: "cmd" -> "command"
                    if (toolName === "Bash" && toolInput.cmd && !toolInput.command) {
                      toolInput.command = toolInput.cmd
                      delete toolInput.cmd
                      console.log('[Ollama] Fixed Bash tool: cmd -> command')
                    }
                  }

                  if (input.mode === "plan") {
                    if (toolName === "Edit" || toolName === "Write") {
                      const filePath =
                        typeof toolInput.file_path === "string"
                          ? toolInput.file_path
                          : ""
                      if (!/\.md$/i.test(filePath)) {
                        return {
                          behavior: "deny",
                          message:
                            'Only ".md" files can be modified in plan mode.',
                        }
                      }
                    } else if (PLAN_MODE_BLOCKED_TOOLS.has(toolName)) {
                      return {
                        behavior: "deny",
                        message: `Tool "${toolName}" blocked in plan mode.`,
                      }
                    }
                  }
                  if (toolName === "AskUserQuestion") {
                    const { toolUseID } = options
                    // Emit to UI (safely in case observer is closed)
                    safeEmit({
                      type: "ask-user-question",
                      toolUseId: toolUseID,
                      questions: (toolInput as any).questions,
                    } as UIMessageChunk)

                    // Wait for response (60s timeout)
                    const response = await new Promise<{
                      approved: boolean
                      message?: string
                      updatedInput?: unknown
                    }>((resolve) => {
                      const timeoutId = setTimeout(() => {
                        pendingToolApprovals.delete(toolUseID)
                        // Emit chunk to notify UI that the question has timed out
                        // This ensures the pending question dialog is cleared
                        safeEmit({
                          type: "ask-user-question-timeout",
                          toolUseId: toolUseID,
                        } as UIMessageChunk)
                        resolve({ approved: false, message: "Timed out" })
                      }, 60000)

                      pendingToolApprovals.set(toolUseID, {
                        subChatId: input.subChatId,
                        resolve: (d) => {
                          clearTimeout(timeoutId)
                          resolve(d)
                        },
                      })
                    })

                    // Find the tool part in accumulated parts
                    const askToolPart = parts.find(
                      (p) => p.toolCallId === toolUseID && p.type === "tool-AskUserQuestion"
                    )

                    if (!response.approved) {
                      // Update the tool part with error result for skipped/denied
                      const errorMessage = response.message || "Skipped"
                      if (askToolPart) {
                        askToolPart.result = errorMessage
                        askToolPart.state = "result"
                      }
                      // Emit result to frontend so it updates in real-time
                      safeEmit({
                        type: "ask-user-question-result",
                        toolUseId: toolUseID,
                        result: errorMessage,
                      } as UIMessageChunk)
                      return {
                        behavior: "deny",
                        message: errorMessage,
                      }
                    }

                    // Update the tool part with answers result for approved
                    const answers = (response.updatedInput as any)?.answers
                    const answerResult = { answers }
                    if (askToolPart) {
                      askToolPart.result = answerResult
                      askToolPart.state = "result"
                    }
                    // Emit result to frontend so it updates in real-time
                    safeEmit({
                      type: "ask-user-question-result",
                      toolUseId: toolUseID,
                      result: answerResult,
                    } as UIMessageChunk)
                    return {
                      behavior: "allow",
                      updatedInput: response.updatedInput,
                    }
                  }
                  return {
                    behavior: "allow",
                    updatedInput: toolInput,
                  }
                },
                stderr: (data: string) => {
                  stderrLines.push(data)
                  if (isUsingOllama) {
                    console.error("[Ollama stderr]", data)
                  } else {
                    console.error("[claude stderr]", data)
                  }
                },
                // Use bundled binary
                pathToClaudeCodeExecutable: claudeBinaryPath,
                // Session handling: For Ollama, use resume with session ID to maintain history
                // For Claude API, use resume with rollback support
                ...(resumeSessionId && {
                  resume: resumeSessionId,
                  // Rollback support - resume at specific message UUID (from DB)
                  ...(resumeAtUuid && !isUsingOllama
                    ? { resumeSessionAt: resumeAtUuid }
                    : { continue: true }),
                }),
                // For first message in chat (no session ID yet), use continue mode
                ...(!resumeSessionId && { continue: true }),
                ...(resolvedModel && { model: resolvedModel }),
                // fallbackModel: "claude-opus-4-5-20251101",
                ...(input.maxThinkingTokens && {
                  maxThinkingTokens: input.maxThinkingTokens,
                }),
              },
            }

            // 5. Run Claude SDK
            let stream
            try {
              stream = claudeQuery(queryOptions)
            } catch (queryError) {
              console.error(
                "[CLAUDE] ✗ Failed to create SDK query:",
                queryError,
              )
              emitError(queryError, "Failed to start Claude query")
              console.log(`[SD] M:END sub=${subId} reason=query_error n=${chunkCount}`)
              safeEmit({ type: "finish" } as UIMessageChunk)
              safeComplete()
              return
            }

            let messageCount = 0
            let lastError: Error | null = null
            let firstMessageReceived = false
            // Track last assistant message UUID for rollback support
            // Only assigned to metadata AFTER the stream completes (not during generation)
            let lastAssistantUuid: string | null = null
            const streamIterationStart = Date.now()

            // Plan mode: track ExitPlanMode to stop after plan is complete
            let planCompleted = false
            let exitPlanModeToolCallId: string | null = null

            if (isUsingOllama) {
              console.log(`[Ollama] ===== STARTING STREAM ITERATION =====`)
              console.log(`[Ollama] Model: ${finalCustomConfig?.model}`)
              console.log(`[Ollama] Base URL: ${finalCustomConfig?.baseUrl}`)
              console.log(`[Ollama] Prompt: "${typeof input.prompt === 'string' ? input.prompt.slice(0, 100) : 'N/A'}..."`)
              console.log(`[Ollama] CWD: ${input.cwd}`)
            }

            try {
              for await (const msg of stream) {
                if (abortController.signal.aborted) {
                  if (isUsingOllama) console.log(`[Ollama] Stream aborted by user`)
                  break
                }

                messageCount++

                // Extra logging for Ollama to diagnose issues
                if (isUsingOllama) {
                  const msgAnyPreview = msg as any
                  console.log(`[Ollama] ===== MESSAGE #${messageCount} =====`)
                  console.log(`[Ollama] Type: ${msgAnyPreview.type}`)
                  console.log(`[Ollama] Subtype: ${msgAnyPreview.subtype || 'none'}`)
                  if (msgAnyPreview.event) {
                    console.log(`[Ollama] Event: ${msgAnyPreview.event.type}`, {
                      delta_type: msgAnyPreview.event.delta?.type,
                      content_block_type: msgAnyPreview.event.content_block?.type
                    })
                  }
                  if (msgAnyPreview.message?.content) {
                    console.log(`[Ollama] Message content blocks:`, msgAnyPreview.message.content.length)
                    msgAnyPreview.message.content.forEach((block: any, idx: number) => {
                      console.log(`[Ollama]   Block ${idx}: type=${block.type}, text_length=${block.text?.length || 0}`)
                    })
                  }
                }

                // Warn if SDK initialization is slow (MCP delay)
                if (!firstMessageReceived) {
                  firstMessageReceived = true
                  const timeToFirstMessage = Date.now() - streamIterationStart
                  if (isUsingOllama) {
                    console.log(`[Ollama] Time to first message: ${timeToFirstMessage}ms`)
                  }
                  if (timeToFirstMessage > 5000) {
                    console.warn(`[claude] SDK initialization took ${(timeToFirstMessage / 1000).toFixed(1)}s (MCP servers loading?)`)
                  }
                }

                // Log raw message for debugging
                logRawClaudeMessage(input.chatId, msg)

                // Check for error messages from SDK (error can be embedded in message payload!)
                const msgAny = msg as any
                if (msgAny.type === "error" || msgAny.error) {
                  // Extract detailed error text from message content if available
                  // This is where the actual error description lives (e.g., "API Error: Claude Code is unable to respond...")
                  const messageText = msgAny.message?.content?.[0]?.text
                  const sdkError = messageText || msgAny.error || msgAny.message || "Unknown SDK error"
                  lastError = new Error(sdkError)

                  // Detailed SDK error logging in main process
                  console.error(`[CLAUDE SDK ERROR] ========================================`)
                  console.error(`[CLAUDE SDK ERROR] Raw error: ${sdkError}`)
                  console.error(`[CLAUDE SDK ERROR] Message type: ${msgAny.type}`)
                  console.error(`[CLAUDE SDK ERROR] SubChat ID: ${input.subChatId}`)
                  console.error(`[CLAUDE SDK ERROR] Chat ID: ${input.chatId}`)
                  console.error(`[CLAUDE SDK ERROR] CWD: ${input.cwd}`)
                  console.error(`[CLAUDE SDK ERROR] Mode: ${input.mode}`)
                  console.error(`[CLAUDE SDK ERROR] Session ID: ${msgAny.session_id || 'none'}`)
                  console.error(`[CLAUDE SDK ERROR] Has custom config: ${!!finalCustomConfig}`)
                  console.error(`[CLAUDE SDK ERROR] Is using Ollama: ${isUsingOllama}`)
                  console.error(`[CLAUDE SDK ERROR] Model: ${resolvedModel || 'default'}`)
                  console.error(`[CLAUDE SDK ERROR] Has OAuth token: ${!!claudeCodeToken}`)
                  console.error(`[CLAUDE SDK ERROR] MCP servers: ${mcpServersFiltered ? Object.keys(mcpServersFiltered).join(', ') : 'none'}`)
                  console.error(`[CLAUDE SDK ERROR] Full message:`, JSON.stringify(msgAny, null, 2))
                  console.error(`[CLAUDE SDK ERROR] ========================================`)

                  // Categorize SDK-level errors
                  // Use the raw error code (e.g., "invalid_request") for category matching
                  const rawErrorCode = msgAny.error || ""
                  let errorCategory = "SDK_ERROR"
                  // Default errorContext to the full error text (which may include detailed message)
                  let errorContext = sdkError

                  if (
                    rawErrorCode === "authentication_failed" ||
                    sdkError.includes("authentication")
                  ) {
                    errorCategory = "AUTH_FAILED_SDK"
                    errorContext =
                      "Authentication failed - not logged into Claude Code CLI"
                  } else if (
                    String(sdkError).includes("invalid_token") ||
                    String(sdkError).includes("Invalid access token")
                  ) {
                    errorCategory = "MCP_INVALID_TOKEN"
                    errorContext = "Invalid access token. Update MCP settings"
                  } else if (
                    rawErrorCode === "invalid_api_key" ||
                    sdkError.includes("api_key")
                  ) {
                    errorCategory = "INVALID_API_KEY_SDK"
                    errorContext = "Invalid API key in Claude Code CLI"
                  } else if (
                    rawErrorCode === "rate_limit_exceeded" ||
                    sdkError.includes("rate")
                  ) {
                    errorCategory = "RATE_LIMIT_SDK"
                    errorContext = "Session limit reached"
                  } else if (
                    rawErrorCode === "overloaded" ||
                    sdkError.includes("overload")
                  ) {
                    errorCategory = "OVERLOADED_SDK"
                    errorContext = "Claude is overloaded, try again later"
                  } else if (
                    rawErrorCode === "invalid_request" ||
                    sdkError.includes("Usage Policy") ||
                    sdkError.includes("violate")
                  ) {
                    // Usage Policy violation - keep the full detailed error text
                    errorCategory = "USAGE_POLICY_VIOLATION"
                    // errorContext already contains the full message from sdkError
                  }

                  // Emit auth-error for authentication failures, regular error otherwise
                  if (errorCategory === "AUTH_FAILED_SDK") {
                    safeEmit({
                      type: "auth-error",
                      errorText: errorContext,
                    } as UIMessageChunk)
                  } else {
                    safeEmit({
                      type: "error",
                      errorText: errorContext,
                      debugInfo: {
                        category: errorCategory,
                        rawErrorCode,
                        sessionId: msgAny.session_id,
                        messageId: msgAny.message?.id,
                      },
                    } as UIMessageChunk)
                  }

                  console.log(`[SD] M:END sub=${subId} reason=sdk_error cat=${errorCategory} n=${chunkCount}`)
                  console.error(`[SD] SDK Error details:`, {
                    errorCategory,
                    errorContext: errorContext.slice(0, 200), // Truncate for log readability
                    rawErrorCode,
                    sessionId: msgAny.session_id,
                    messageId: msgAny.message?.id,
                    fullMessage: JSON.stringify(msgAny, null, 2),
                  })
                  safeEmit({ type: "finish" } as UIMessageChunk)
                  safeComplete()
                  return
                }

                // Track sessionId for rollback support (available on all messages)
                if (msgAny.session_id) {
                  metadata.sessionId = msgAny.session_id
                  currentSessionId = msgAny.session_id // Share with cleanup
                }

                // Track UUID from assistant messages for resumeSessionAt
                if (msgAny.type === "assistant" && msgAny.uuid) {
                  lastAssistantUuid = msgAny.uuid
                }

                // When result arrives, assign the last assistant UUID to metadata
                // It will be emitted as part of the merged message-metadata chunk below
                if (msgAny.type === "result" && historyEnabled && lastAssistantUuid && !abortController.signal.aborted) {
                  metadata.sdkMessageUuid = lastAssistantUuid
                }

                // Debug: Log system messages from SDK
                if (msgAny.type === "system") {
                  // Full log to see all fields including MCP errors
                  console.log(`[SD] SYSTEM message: subtype=${msgAny.subtype}`, JSON.stringify({
                    cwd: msgAny.cwd,
                    mcp_servers: msgAny.mcp_servers,
                    tools: msgAny.tools,
                    plugins: msgAny.plugins,
                    permissionMode: msgAny.permissionMode,
                  }, null, 2))
                }

                // Transform and emit + accumulate
                for (const chunk of transform(msg)) {
                  chunkCount++
                  lastChunkType = chunk.type

                  // For message-metadata, inject sdkMessageUuid before emitting
                  // so the frontend receives the full merged metadata in one chunk
                  if (chunk.type === "message-metadata" && metadata.sdkMessageUuid) {
                    chunk.messageMetadata = { ...chunk.messageMetadata, sdkMessageUuid: metadata.sdkMessageUuid }
                  }

                  // Use safeEmit to prevent throws when observer is closed
                  if (!safeEmit(chunk)) {
                    // Observer closed (user clicked Stop), break out of loop
                    console.log(`[SD] M:EMIT_CLOSED sub=${subId} type=${chunk.type} n=${chunkCount}`)
                    break
                  }

                  // Accumulate based on chunk type
                  switch (chunk.type) {
                    case "text-delta":
                      currentText += chunk.delta
                      break
                    case "text-end":
                      if (currentText.trim()) {
                        parts.push({ type: "text", text: currentText })
                        currentText = ""
                      }
                      break
                    case "tool-input-available":
                      // DEBUG: Log tool calls
                      console.log(`[SD] M:TOOL_CALL sub=${subId} toolName="${chunk.toolName}" mode=${input.mode} callId=${chunk.toolCallId}`)

                      // Track ExitPlanMode toolCallId so we can stop when it completes
                      if (input.mode === "plan" && chunk.toolName === "ExitPlanMode") {
                        console.log(`[SD] M:PLAN_TOOL_DETECTED sub=${subId} callId=${chunk.toolCallId}`)
                        exitPlanModeToolCallId = chunk.toolCallId
                      }

                      parts.push({
                        type: `tool-${chunk.toolName}`,
                        toolCallId: chunk.toolCallId,
                        toolName: chunk.toolName,
                        input: chunk.input,
                        state: "call",
                        startedAt: Date.now(),
                      })
                      break
                    case "tool-output-available":
                      const toolPart = parts.find(
                        (p) =>
                          p.type?.startsWith("tool-") &&
                          p.toolCallId === chunk.toolCallId,
                      )
                      if (toolPart) {
                        toolPart.result = chunk.output
                        toolPart.output = chunk.output // Backwards compatibility for the UI that relies on output field
                        toolPart.state = "result"

                        // Notify renderer about file changes for Write/Edit tools
                        if (toolPart.type === "tool-Write" || toolPart.type === "tool-Edit") {
                          const filePath = toolPart.input?.file_path
                          if (filePath) {
                            const windows = BrowserWindow.getAllWindows()
                            for (const win of windows) {
                              win.webContents.send("file-changed", {
                                filePath,
                                type: toolPart.type,
                                subChatId: input.subChatId
                              })
                            }
                          }
                        }

                        // Check if ExitPlanMode just completed - stop the stream
                        if (exitPlanModeToolCallId && chunk.toolCallId === exitPlanModeToolCallId) {
                          console.log(`[SD] M:PLAN_FINISH sub=${subId} - ExitPlanMode completed, emitting finish`)
                          planCompleted = true
                          safeEmit({ type: "finish" } as UIMessageChunk)
                        }
                      }
                      break
                    case "message-metadata":
                      metadata = { ...metadata, ...chunk.messageMetadata }
                      break
                    case "system-Compact":
                      // Add system-Compact to parts so it renders in the chat
                      // Find existing part by toolCallId or add new one
                      const existingCompact = parts.find(
                        (p) => p.type === "system-Compact" && p.toolCallId === chunk.toolCallId
                      )
                      if (existingCompact) {
                        existingCompact.state = chunk.state
                      } else {
                        parts.push({
                          type: "system-Compact",
                          toolCallId: chunk.toolCallId,
                          state: chunk.state,
                        })
                      }
                      break
                  }

                  // Break from chunk loop if plan is done
                  if (planCompleted) {
                    console.log(`[SD] M:PLAN_BREAK_CHUNK sub=${subId}`)
                    break
                  }
                }
                // Break from stream loop if observer closed (user clicked Stop)
                if (!isObservableActive) {
                  console.log(`[SD] M:OBSERVER_CLOSED_STREAM sub=${subId}`)
                  break
                }
                // Break from stream loop if plan completed
                if (planCompleted) {
                  console.log(`[SD] M:PLAN_BREAK_STREAM sub=${subId}`)
                  break
                }
              }

              // Warn if stream yielded no messages (offline mode issue)
              const streamDuration = Date.now() - streamIterationStart
              if (isUsingOllama) {
                console.log(`[Ollama] ===== STREAM COMPLETED =====`)
                console.log(`[Ollama] Total messages: ${messageCount}`)
                console.log(`[Ollama] Duration: ${streamDuration}ms`)
                console.log(`[Ollama] Chunks emitted: ${chunkCount}`)
              }

              if (messageCount === 0) {
                console.error(`[claude] Stream yielded no messages - model not responding`)
                if (isUsingOllama) {
                  console.error(`[Ollama] ===== DIAGNOSIS =====`)
                  console.error(`[Ollama] Problem: Stream completed but NO messages received from SDK`)
                  console.error(`[Ollama] This usually means:`)
                  console.error(`[Ollama]   1. Ollama doesn't support Anthropic Messages API format (/v1/messages)`)
                  console.error(`[Ollama]   2. Model failed to start generating (check Ollama logs: ollama logs)`)
                  console.error(`[Ollama]   3. Network issue between Claude SDK and Ollama`)
                  console.error(`[Ollama] ===== NEXT STEPS =====`)
                  console.error(`[Ollama]   1. Check if model works: curl http://localhost:11434/api/generate -d '{"model":"${finalCustomConfig?.model}","prompt":"test"}'`)
                  console.error(`[Ollama]   2. Check Ollama version supports Messages API`)
                  console.error(`[Ollama]   3. Try using a proxy that converts Anthropic API → Ollama format`)
                }
              } else if (messageCount === 1 && isUsingOllama) {
                console.warn(`[Ollama] Only received 1 message (likely just init). No actual content generated.`)
              }
            } catch (streamError) {
              // This catches errors during streaming (like process exit)
              const err = streamError as Error
              const stderrOutput = stderrLines.join("\n")

              if (isUsingOllama) {
                console.error(`[Ollama] ===== STREAM ERROR =====`)
                console.error(`[Ollama] Error message: ${err.message}`)
                console.error(`[Ollama] Error stack:`, err.stack)
                console.error(`[Ollama] Messages received before error: ${messageCount}`)
                if (stderrOutput) {
                  console.error(`[Ollama] Claude binary stderr:`, stderrOutput)
                }
              }

              // Build detailed error message with category
              let errorContext = "Claude streaming error"
              let errorCategory = "UNKNOWN"

              // Check for session-not-found error in stderr
              const isSessionNotFound = stderrOutput?.includes("No conversation found with session ID")

              if (isSessionNotFound) {
                // Clear the invalid session ID from database so next attempt starts fresh
                console.log(`[claude] Session not found - clearing invalid sessionId from database`)
                db.update(subChats)
                  .set({ sessionId: null })
                  .where(eq(subChats.id, input.subChatId))
                  .run()

                errorContext = "Previous session expired. Please try again."
                errorCategory = "SESSION_EXPIRED"
              } else if (err.message?.includes("exited with code")) {
                errorContext = "Claude Code process crashed"
                errorCategory = "PROCESS_CRASH"
              } else if (err.message?.includes("ENOENT")) {
                errorContext = "Required executable not found in PATH"
                errorCategory = "EXECUTABLE_NOT_FOUND"
              } else if (
                err.message?.includes("authentication") ||
                err.message?.includes("401")
              ) {
                errorContext = "Authentication failed - check your API key"
                errorCategory = "AUTH_FAILURE"
              } else if (
                err.message?.includes("invalid_api_key") ||
                err.message?.includes("Invalid API Key") ||
                stderrOutput?.includes("invalid_api_key")
              ) {
                errorContext = "Invalid API key"
                errorCategory = "INVALID_API_KEY"
              } else if (
                err.message?.includes("rate_limit") ||
                err.message?.includes("429")
              ) {
                errorContext = "Session limit reached"
                errorCategory = "RATE_LIMIT"
              } else if (
                err.message?.includes("network") ||
                err.message?.includes("ECONNREFUSED") ||
                err.message?.includes("fetch failed")
              ) {
                errorContext = "Network error - check your connection"
                errorCategory = "NETWORK_ERROR"
              }

              // Track error in Sentry (only if app is ready and Sentry is available)
              if (app.isReady() && app.isPackaged) {
                try {
                  const Sentry = await import("@sentry/electron/main")
                  Sentry.captureException(err, {
                    tags: {
                      errorCategory,
                      mode: input.mode,
                    },
                    extra: {
                      context: errorContext,
                      cwd: input.cwd,
                      stderr: stderrOutput || "(no stderr captured)",
                      chatId: input.chatId,
                      subChatId: input.subChatId,
                    },
                  })
                } catch {
                  // Sentry not available or failed to import - ignore
                }
              }

              // Send error with stderr output to frontend (only if not aborted by user)
              if (!abortController.signal.aborted) {
                safeEmit({
                  type: "error",
                  errorText: stderrOutput
                    ? `${errorContext}: ${err.message}\n\nProcess output:\n${stderrOutput}`
                    : `${errorContext}: ${err.message}`,
                  debugInfo: {
                    context: errorContext,
                    category: errorCategory,
                    cwd: input.cwd,
                    mode: input.mode,
                    stderr: stderrOutput || "(no stderr captured)",
                  },
                } as UIMessageChunk)
              }

              // ALWAYS save accumulated parts before returning (even on abort/error)
              console.log(`[SD] M:CATCH_SAVE sub=${subId} aborted=${abortController.signal.aborted} parts=${parts.length}`)
              if (currentText.trim()) {
                parts.push({ type: "text", text: currentText })
              }
              if (parts.length > 0) {
                const assistantMessage = {
                  id: crypto.randomUUID(),
                  role: "assistant",
                  parts,
                  metadata,
                }
                const finalMessages = [...messagesToSave, assistantMessage]
                db.update(subChats)
                  .set({
                    messages: JSON.stringify(finalMessages),
                    sessionId: metadata.sessionId,
                    streamId: null,
                    updatedAt: new Date(),
                  })
                  .where(eq(subChats.id, input.subChatId))
                  .run()
                db.update(chats)
                  .set({ updatedAt: new Date() })
                  .where(eq(chats.id, input.chatId))
                  .run()

                // Create snapshot stash for rollback support (on error)
                if (historyEnabled && metadata.sdkMessageUuid && input.cwd) {
                  await createRollbackStash(input.cwd, metadata.sdkMessageUuid)
                }
              }

              console.log(`[SD] M:END sub=${subId} reason=stream_error cat=${errorCategory} n=${chunkCount} last=${lastChunkType}`)
              safeEmit({ type: "finish" } as UIMessageChunk)
              safeComplete()
              return
            }

            // 6. Check if we got any response
            if (messageCount === 0 && !abortController.signal.aborted) {
              emitError(
                new Error("No response received from Claude"),
                "Empty response",
              )
              console.log(`[SD] M:END sub=${subId} reason=no_response n=${chunkCount}`)
              safeEmit({ type: "finish" } as UIMessageChunk)
              safeComplete()
              return
            }

            // 7. Save final messages to DB
            // ALWAYS save accumulated parts, even on abort (so user sees partial responses after reload)
            console.log(`[SD] M:SAVE sub=${subId} aborted=${abortController.signal.aborted} parts=${parts.length}`)

            // Flush any remaining text
            if (currentText.trim()) {
              parts.push({ type: "text", text: currentText })
            }

            const savedSessionId = metadata.sessionId

            if (parts.length > 0) {
              const assistantMessage = {
                id: crypto.randomUUID(),
                role: "assistant",
                parts,
                metadata,
              }

              const finalMessages = [...messagesToSave, assistantMessage]

              db.update(subChats)
                .set({
                  messages: JSON.stringify(finalMessages),
                  sessionId: savedSessionId,
                  streamId: null,
                  updatedAt: new Date(),
                })
                .where(eq(subChats.id, input.subChatId))
                .run()
            } else {
              // No assistant response - just clear streamId
              db.update(subChats)
                .set({
                  sessionId: savedSessionId,
                  streamId: null,
                  updatedAt: new Date(),
                })
                .where(eq(subChats.id, input.subChatId))
                .run()
            }

            // Update parent chat timestamp
            db.update(chats)
              .set({ updatedAt: new Date() })
              .where(eq(chats.id, input.chatId))
              .run()

            // Create snapshot stash for rollback support
            if (historyEnabled && metadata.sdkMessageUuid && input.cwd) {
              await createRollbackStash(input.cwd, metadata.sdkMessageUuid)
            }

            const duration = ((Date.now() - streamStart) / 1000).toFixed(1)
            console.log(`[SD] M:END sub=${subId} reason=ok n=${chunkCount} last=${lastChunkType} t=${duration}s`)
            safeComplete()
          } catch (error) {
            const duration = ((Date.now() - streamStart) / 1000).toFixed(1)
            console.log(`[SD] M:END sub=${subId} reason=unexpected_error n=${chunkCount} t=${duration}s`)
            emitError(error, "Unexpected error")
            safeEmit({ type: "finish" } as UIMessageChunk)
            safeComplete()
          } finally {
            activeSessions.delete(input.subChatId)
          }
        })()

        // Cleanup on unsubscribe
        return () => {
          console.log(`[SD] M:CLEANUP sub=${subId} sessionId=${currentSessionId || 'none'}`)
          isObservableActive = false // Prevent emit after unsubscribe
          abortController.abort()
          activeSessions.delete(input.subChatId)
          clearPendingApprovals("Session ended.", input.subChatId)

          // Clear streamId since we're no longer streaming.
          // sessionId is NOT saved here — the save block in the async function
          // handles it (saves on normal completion, clears on abort). This avoids
          // a redundant DB write that the cancel mutation would then overwrite.
          const db = getDatabase()
          db.update(subChats)
            .set({ streamId: null })
            .where(eq(subChats.id, input.subChatId))
            .run()
        }
      })
    }),

  /**
   * Get MCP servers configuration for a project
   * This allows showing MCP servers in UI before starting a chat session
   * NOTE: Does NOT fetch OAuth metadata here - that's done lazily when user clicks Auth
   */
  getMcpConfig: publicProcedure
    .input(z.object({ projectPath: z.string() }))
    .query(async ({ input }) => {
      try {
        const config = await readClaudeConfig()
        const projectMcpServers = getProjectMcpServers(config, input.projectPath)

        if (!projectMcpServers) {
          return { mcpServers: [], projectPath: input.projectPath }
        }

        // Convert to array format - determine status from config (no caching)
        const mcpServers = Object.entries(projectMcpServers).map(([name, serverConfig]) => {
          const configObj = serverConfig as Record<string, unknown>
          const status = getServerStatusFromConfig(configObj)
          const hasUrl = !!configObj.url

          return {
            name,
            status,
            config: { ...configObj, _hasUrl: hasUrl },
          }
        })

        return { mcpServers, projectPath: input.projectPath }
      } catch (error) {
        console.error("[getMcpConfig] Error reading config:", error)
        return { mcpServers: [], projectPath: input.projectPath, error: String(error) }
      }
    }),

  /**
   * Get ALL MCP servers configuration (global + all projects)
   * Returns grouped data for display in settings
   * Also populates the workingMcpServers cache
   */
  getAllMcpConfig: publicProcedure.query(getAllMcpConfigHandler),

  /**
   * Cancel active session
   */
  cancel: publicProcedure
    .input(z.object({ subChatId: z.string() }))
    .mutation(({ input }) => {
      const controller = activeSessions.get(input.subChatId)
      if (controller) {
        controller.abort()
        activeSessions.delete(input.subChatId)
        clearPendingApprovals("Session cancelled.", input.subChatId)
      }


      return { cancelled: !!controller }
    }),

  /**
   * Check if session is active
   */
  isActive: publicProcedure
    .input(z.object({ subChatId: z.string() }))
    .query(({ input }) => activeSessions.has(input.subChatId)),
  respondToolApproval: publicProcedure
    .input(
      z.object({
        toolUseId: z.string(),
        approved: z.boolean(),
        message: z.string().optional(),
        updatedInput: z.unknown().optional(),
      }),
    )
    .mutation(({ input }) => {
      const pending = pendingToolApprovals.get(input.toolUseId)
      if (!pending) {
        return { ok: false }
      }
      pending.resolve({
        approved: input.approved,
        message: input.message,
        updatedInput: input.updatedInput,
      })
      pendingToolApprovals.delete(input.toolUseId)
      return { ok: true }
    }),

  /**
   * Start MCP OAuth flow for a server
   * Fetches OAuth metadata internally when needed
   */
  startMcpOAuth: publicProcedure
    .input(z.object({
      serverName: z.string(),
      projectPath: z.string(),
    }))
    .mutation(async ({ input }) => {
      return startMcpOAuth(input.serverName, input.projectPath)
    }),

  /**
   * Get MCP auth status for a server
   */
  getMcpAuthStatus: publicProcedure
    .input(z.object({
      serverName: z.string(),
      projectPath: z.string(),
    }))
    .query(async ({ input }) => {
      return getMcpAuthStatus(input.serverName, input.projectPath)
    }),
})

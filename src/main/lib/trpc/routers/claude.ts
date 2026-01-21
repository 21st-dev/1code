import { observable } from "@trpc/server/observable"
import { eq } from "drizzle-orm"
import { app, BrowserWindow, safeStorage } from "electron"
import * as fs from "fs/promises"
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, renameSync, statSync } from "fs"
import * as os from "os"
import path, { dirname, join } from "path"
import { z } from "zod"
import {
  buildClaudeEnv,
  createTransformer,
  getBundledClaudeBinaryPath,
  logClaudeEnv,
  logRawClaudeMessage,
  checkOfflineFallback,
  type UIMessageChunk,
} from "../../claude"
import { chats, claudeCodeCredentials, getDatabase, subChats } from "../../db"
import { createRollbackStash } from "../../git/stash"
import { checkInternetConnection, checkOllamaStatus, getOllamaConfig } from "../../ollama"
import { publicProcedure, router } from "../index"
import { buildAgentsOption } from "./agent-utils"

/**
 * Parse @[agent:name], @[skill:name], and @[tool:name] mentions from prompt text
 * Returns the cleaned prompt and lists of mentioned agents/skills/tools
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

// Cache for symlinks (track which subChatIds have already set up symlinks)
const symlinksCreated = new Set<string>()

// Cache for MCP config (avoid re-reading ~/.claude.json on every message)
const mcpConfigCache = new Map<string, {
  config: Record<string, any> | undefined
  mtime: number
}>()

// Cache for MCP server statuses (to filter out failed/needs-auth servers)
// Maps project path -> server name -> status
const mcpServerStatusCache = new Map<string, Map<string, string>>()

// Disk cache types and configuration for MCP server statuses
interface CachedMcpStatus {
  status: string
  cachedAt: number
}

interface McpCacheData {
  version: number
  entries: Record<string, {
    servers: Record<string, CachedMcpStatus>
    updatedAt: number
  }>
}

const MCP_STATUS_TTL = 5 * 60 * 1000 // 5 minutes
const MCP_CACHE_PATH = join(app.getPath("userData"), "cache", "mcp-status.json")
let diskCacheLastLoadTime = 0 // Track when disk cache was last loaded

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
 * Load MCP status cache from disk
 * Reloads if cache was updated on disk since last load (for concurrent requests)
 */
function loadMcpStatusFromDisk(): void {
  try {
    if (!existsSync(MCP_CACHE_PATH)) {
      diskCacheLastLoadTime = Date.now()
      return
    }

    // Check if file was modified since last load (handles concurrent requests)
    const stats = statSync(MCP_CACHE_PATH)
    const fileModTime = stats.mtimeMs

    if (diskCacheLastLoadTime > 0 && fileModTime <= diskCacheLastLoadTime) {
      // File hasn't changed since last load, skip
      return
    }

    const data: McpCacheData = JSON.parse(readFileSync(MCP_CACHE_PATH, "utf-8"))

    if (data.version !== 1) {
      console.warn(`[MCP Cache] Unknown version ${data.version}, ignoring`)
      diskCacheLastLoadTime = Date.now()
      return
    }

    const now = Date.now()
    let loadedCount = 0
    let expiredCount = 0

    for (const [projectPath, entry] of Object.entries(data.entries)) {
      const serverMap = new Map<string, string>()

      for (const [serverName, cached] of Object.entries(entry.servers)) {
        if (now - cached.cachedAt < MCP_STATUS_TTL) {
          serverMap.set(serverName, cached.status)
          loadedCount++
        } else {
          expiredCount++
        }
      }

      if (serverMap.size > 0) {
        mcpServerStatusCache.set(projectPath, serverMap)
      }
    }

    diskCacheLastLoadTime = Date.now()
    if (loadedCount > 0) {
      console.log(`[MCP Cache] Loaded ${loadedCount} cached server statuses`)
    }
  } catch (error) {
    console.warn("[MCP Cache] Failed to load from disk:", error)
    diskCacheLastLoadTime = Date.now()
    try {
      if (existsSync(MCP_CACHE_PATH)) {
        unlinkSync(MCP_CACHE_PATH)
      }
    } catch {}
  }
}

/**
 * Save MCP status cache to disk (write-through)
 */
function saveMcpStatusToDisk(): void {
  try {
    const cacheDir = dirname(MCP_CACHE_PATH)
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true })
    }

    const data: McpCacheData = {
      version: 1,
      entries: Object.fromEntries(
        Array.from(mcpServerStatusCache.entries()).map(([projectPath, serverMap]) => [
          projectPath,
          {
            servers: Object.fromEntries(
              Array.from(serverMap.entries()).map(([name, status]) => [
                name,
                { status, cachedAt: Date.now() }
              ])
            ),
            updatedAt: Date.now()
          }
        ])
      )
    }

    const tempPath = MCP_CACHE_PATH + ".tmp"
    writeFileSync(tempPath, JSON.stringify(data, null, 2), "utf-8")
    renameSync(tempPath, MCP_CACHE_PATH)

    const totalServers = Array.from(mcpServerStatusCache.values())
      .reduce((sum, map) => sum + map.size, 0)
    console.log(`[MCP Cache] Saved ${totalServers} statuses to disk`)
  } catch (error) {
    console.error("[MCP Cache] Failed to save to disk:", error)
  }
}

/**
 * Clear all performance caches (for testing/debugging)
 */
export function clearClaudeCaches() {
  cachedClaudeQuery = null
  symlinksCreated.clear()
  mcpConfigCache.clear()
  mcpServerStatusCache.clear()
  diskCacheLastLoadTime = 0

  // Clear disk cache
  try {
    if (existsSync(MCP_CACHE_PATH)) {
      unlinkSync(MCP_CACHE_PATH)
      console.log("[MCP Cache] Cleared disk cache")
    }
  } catch (error) {
    console.error("[MCP Cache] Failed to clear disk cache:", error)
  }

  console.log("[claude] All caches cleared")
}

/**
 * Warm up MCP server cache by initializing servers for all configured projects
 * This runs once at app startup to populate the cache, so all future sessions
 * can use filtered MCP servers without delays
 */
export async function warmupMcpCache(): Promise<void> {
  try {
    const warmupStart = Date.now()

    // Read ~/.claude.json to get all projects with MCP servers
    const claudeJsonPath = join(os.homedir(), ".claude.json")
    let config: any
    try {
      const configContent = readFileSync(claudeJsonPath, "utf-8")
      config = JSON.parse(configContent)
    } catch (err) {
      console.log("[MCP Warmup] No ~/.claude.json found or failed to read - skipping warmup")
      return
    }

    if (!config.projects || Object.keys(config.projects).length === 0) {
      console.log("[MCP Warmup] No projects configured - skipping warmup")
      return
    }

    // Find projects with MCP servers (excluding worktrees)
    const projectsWithMcp: Array<{ path: string; servers: Record<string, any> }> = []
    for (const [projectPath, projectConfig] of Object.entries(config.projects)) {
      if ((projectConfig as any)?.mcpServers) {
        // Skip worktrees - they're temporary git working directories and inherit MCP from parent
        if (projectPath.includes("/.21st/worktrees/") || projectPath.includes("\\.21st\\worktrees\\")) {
          continue
        }

        projectsWithMcp.push({
          path: projectPath,
          servers: (projectConfig as any).mcpServers
        })
      }
    }

    if (projectsWithMcp.length === 0) {
      console.log("[MCP Warmup] No MCP servers configured (excluding worktrees) - skipping warmup")
      return
    }

    // Get SDK
    const sdk = await import("@anthropic-ai/claude-agent-sdk")
    const claudeQuery = sdk.query

    // Warm up each project
    for (const project of projectsWithMcp) {

      try {
        // Create a minimal query to initialize MCP servers
        const warmupQuery = claudeQuery({
          prompt: "ping",
          options: {
            cwd: project.path,
            mcpServers: project.servers,
            systemPrompt: {
              type: "preset" as const,
              preset: "claude_code" as const,
            },
            env: buildClaudeEnv(),
            permissionMode: "bypassPermissions" as const,
            allowDangerouslySkipPermissions: true,
          }
        })

        // Wait for init message with MCP server statuses
        let gotInit = false
        for await (const msg of warmupQuery) {
          const msgAny = msg as any
          if (msgAny.type === "system" && msgAny.subtype === "init" && msgAny.mcp_servers) {
            // Cache the statuses
            const statusMap = new Map<string, string>()
            for (const server of msgAny.mcp_servers) {
              if (server.name && server.status) {
                statusMap.set(server.name, server.status)
              }
            }
            mcpServerStatusCache.set(project.path, statusMap)
            gotInit = true
            break // We only need the init message
          }
        }

        if (!gotInit) {
          console.warn(`[MCP Warmup] Did not receive init message for ${project.path}`)
        }
      } catch (err) {
        console.error(`[MCP Warmup] Failed to warm up MCP for ${project.path}:`, err)
      }
    }

    // Save all cached statuses to disk
    saveMcpStatusToDisk()

    const totalServers = Array.from(mcpServerStatusCache.values())
      .reduce((sum, map) => sum + map.size, 0)
    const warmupDuration = Date.now() - warmupStart
    console.log(`[MCP Warmup] Initialized ${totalServers} servers across ${projectsWithMcp.length} projects in ${warmupDuration}ms`)
  } catch (error) {
    console.error("[MCP Warmup] Warmup failed:", error)
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
      }),
    )
    .subscription(({ input }) => {
      return observable<UIMessageChunk>((emit) => {
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

            // Get resumeSessionAt UUID from the last assistant message (for rollback)
            const lastAssistantMsg = [...existingMessages].reverse().find(
              (m: any) => m.role === "assistant"
            )
            const resumeAtUuid = lastAssistantMsg?.metadata?.sdkMessageUuid || null
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
            const claudeCodeToken = getClaudeCodeToken()
            const offlineResult = await checkOfflineFallback(input.customConfig, claudeCodeToken)

            if (offlineResult.error) {
              emitError(new Error(offlineResult.error), 'Offline mode unavailable')
              safeEmit({ type: 'finish' } as UIMessageChunk)
              safeComplete()
              return
            }

            // Use offline config if available
            const finalCustomConfig = offlineResult.config || input.customConfig
            const isUsingOllama = offlineResult.isUsingOllama

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
            const claudeEnv = buildClaudeEnv(
              finalCustomConfig
                ? {
                    customEnv: {
                      ANTHROPIC_AUTH_TOKEN: finalCustomConfig.token,
                      ANTHROPIC_BASE_URL: finalCustomConfig.baseUrl,
                    },
                  }
                : undefined,
            )

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

                  // Check if we have a valid cache entry
                  if (cached && cached.mtime === currentMtime) {
                    mcpServersForSdk = cached.config?.[lookupPath]
                  } else {
                    // Read and parse config
                    const originalConfig = JSON.parse(await fs.readFile(claudeJsonSource, "utf-8"))

                    // Cache the projects config by lookup path
                    const projectsConfig: Record<string, any> = {}
                    for (const [projPath, projConfig] of Object.entries(originalConfig.projects || {})) {
                      if ((projConfig as any)?.mcpServers) {
                        projectsConfig[projPath] = (projConfig as any).mcpServers
                      }
                    }

                    mcpConfigCache.set(claudeJsonSource, {
                      config: projectsConfig,
                      mtime: currentMtime,
                    })

                    mcpServersForSdk = projectsConfig[lookupPath]
                  }
                }
              } catch (configErr) {
                console.error(`[claude] Failed to read MCP config:`, configErr)
              }
            } catch (mkdirErr) {
              console.error(`[claude] Failed to setup isolated config dir:`, mkdirErr)
            }

            // Build final env - only add OAuth token if we have one
            const finalEnv = {
              ...claudeEnv,
              ...(claudeCodeToken && {
                CLAUDE_CODE_OAUTH_TOKEN: claudeCodeToken,
              }),
              // Re-enable CLAUDE_CONFIG_DIR now that we properly map MCP configs
              CLAUDE_CONFIG_DIR: isolatedConfigDir,
            }

            // Get bundled Claude binary path
            const claudeBinaryPath = getBundledClaudeBinaryPath()

            const resumeSessionId = input.sessionId || existingSessionId || undefined

            console.log(`[claude] Session ID to resume: ${resumeSessionId} (Existing: ${existingSessionId})`)
            console.log(`[claude] Resume at UUID: ${resumeAtUuid}`)
            
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

            // Filter MCP servers: skip ONLY non-working servers (failed, needs-auth)
            // Pass working/unknown servers in options so Claude can see them
            // OPTIMIZATION: Cache is populated at app startup via warmupMcpCache()
            let mcpServersFiltered: Record<string, any> | undefined

            // Skip MCP servers entirely in offline mode (Ollama) - they slow down initialization by 60+ seconds
            if (mcpServersForSdk && !isUsingOllama) {
              const lookupPath = input.projectPath || input.cwd

              // Load cached statuses from disk if needed
              if (!mcpServerStatusCache.has(lookupPath)) {
                loadMcpStatusFromDisk()
              }

              const cachedStatuses = mcpServerStatusCache.get(lookupPath)
              const hasCachedInfo = cachedStatuses && cachedStatuses.size > 0

              if (hasCachedInfo) {
                // We have cached statuses - filter OUT only failed/needs-auth servers
                mcpServersFiltered = Object.fromEntries(
                  Object.entries(mcpServersForSdk).filter(([name]) => {
                    const status = cachedStatuses.get(name)
                    // Unknown servers (undefined status) are included to allow discovery
                    if (status === undefined) return true
                    return status !== "failed" && status !== "needs-auth"
                  })
                )
              } else {
                // No cache yet (warmup hasn't completed or ~/.claude.json changed)
                // Skip MCP servers to avoid delays - they'll be available after warmup completes
                mcpServersFiltered = undefined
              }
            } else if (isUsingOllama) {
              console.log('[Ollama] Skipping MCP servers to speed up initialization')
              mcpServersFiltered = undefined
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

            const queryOptions = {
              prompt,
              options: {
                abortController, // Must be inside options!
                cwd: input.cwd,
                systemPrompt: {
                  type: "preset" as const,
                  preset: "claude_code" as const,
                },
                // Register mentioned agents with SDK via options.agents
                ...(Object.keys(agentsOption).length > 0 && { agents: agentsOption }),
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
                // Load skills from project and user directories (native Claude Code skills)
                settingSources: ["project" as const, "user" as const],
                canUseTool: async (
                  toolName: string,
                  toolInput: Record<string, unknown>,
                  options: { toolUseID: string },
                ) => {
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
            let planCompleted = false // Flag to stop after ExitPlanMode in plan mode
            let exitPlanModeToolCallId: string | null = null // Track ExitPlanMode's toolCallId
            let firstMessageReceived = false
            const streamIterationStart = Date.now()

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
                  const sdkError =
                    msgAny.error || msgAny.message || "Unknown SDK error"
                  lastError = new Error(sdkError)

                  // Categorize SDK-level errors
                  let errorCategory = "SDK_ERROR"
                  let errorContext = "Claude SDK error"

                  if (
                    sdkError === "authentication_failed" ||
                    sdkError.includes("authentication")
                  ) {
                    errorCategory = "AUTH_FAILED_SDK"
                    errorContext =
                      "Authentication failed - not logged into Claude Code CLI"
                  } else if (
                    sdkError === "invalid_api_key" ||
                    sdkError.includes("api_key")
                  ) {
                    errorCategory = "INVALID_API_KEY_SDK"
                    errorContext = "Invalid API key in Claude Code CLI"
                  } else if (
                    sdkError === "rate_limit_exceeded" ||
                    sdkError.includes("rate")
                  ) {
                    errorCategory = "RATE_LIMIT_SDK"
                    errorContext = "Session limit reached"
                  } else if (
                    sdkError === "overloaded" ||
                    sdkError.includes("overload")
                  ) {
                    errorCategory = "OVERLOADED_SDK"
                    errorContext = "Claude is overloaded, try again later"
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
                        sdkError: sdkError,
                        sessionId: msgAny.session_id,
                        messageId: msgAny.message?.id,
                      },
                    } as UIMessageChunk)
                  }

                  console.log(`[SD] M:END sub=${subId} reason=sdk_error cat=${errorCategory} n=${chunkCount}`)
                  safeEmit({ type: "finish" } as UIMessageChunk)
                  safeComplete()
                  return
                }

                // Track sessionId and uuid for rollback support (available on all messages)
                if (msgAny.session_id) {
                  metadata.sessionId = msgAny.session_id
                  currentSessionId = msgAny.session_id // Share with cleanup
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

                  // Cache MCP server statuses for next request
                  if (msgAny.subtype === "init" && msgAny.mcp_servers) {
                    const lookupPath = input.projectPath || input.cwd
                    const statusMap = new Map<string, string>()

                    for (const server of msgAny.mcp_servers) {
                      if (server.name && server.status) {
                        statusMap.set(server.name, server.status)
                      }
                    }

                    mcpServerStatusCache.set(lookupPath, statusMap)
                    // Persist to disk immediately (write-through)
                    saveMcpStatusToDisk()
                  }
                }

                // Transform and emit + accumulate
                for (const chunk of transform(msg)) {
                  chunkCount++
                  lastChunkType = chunk.type

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
                      }
                      // Stop streaming after ExitPlanMode completes in plan mode
                      // Match by toolCallId since toolName is undefined in output chunks
                      if (input.mode === "plan" && exitPlanModeToolCallId && chunk.toolCallId === exitPlanModeToolCallId) {
                        console.log(`[SD] M:PLAN_STOP sub=${subId} callId=${chunk.toolCallId} n=${chunkCount} parts=${parts.length}`)
                        planCompleted = true
                        // Emit finish chunk so Chat hook properly resets its state
                        console.log(`[SD] M:PLAN_FINISH sub=${subId} - emitting finish chunk`)
                        safeEmit({ type: "finish" } as UIMessageChunk)
                        // Abort the Claude process so it doesn't keep running
                        console.log(`[SD] M:PLAN_ABORT sub=${subId} - aborting claude process`)
                        abortController.abort()
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
                // Break from stream loop if plan is done
                if (planCompleted) {
                  console.log(`[SD] M:PLAN_BREAK_STREAM sub=${subId}`)
                  break
                }
                // Break from stream loop if observer closed (user clicked Stop)
                if (!isObservableActive) {
                  console.log(`[SD] M:OBSERVER_CLOSED_STREAM sub=${subId}`)
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

              if (err.message?.includes("exited with code")) {
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
            console.log(`[SD] M:SAVE sub=${subId} planCompleted=${planCompleted} aborted=${abortController.signal.aborted} parts=${parts.length}`)

            // Flush any remaining text
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
            } else {
              // No assistant response - just clear streamId
              db.update(subChats)
                .set({
                  sessionId: metadata.sessionId,
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
            const reason = planCompleted ? "plan_complete" : "ok"
            console.log(`[SD] M:END sub=${subId} reason=${reason} n=${chunkCount} last=${lastChunkType} t=${duration}s`)
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

          // Save sessionId on abort so conversation can be resumed
          // Clear streamId since we're no longer streaming
          const db = getDatabase()
          db.update(subChats)
            .set({
              streamId: null,
              ...(currentSessionId && { sessionId: currentSessionId })
            })
            .where(eq(subChats.id, input.subChatId))
            .run()
        }
      })
    }),

  /**
   * Get MCP servers configuration for a project
   * This allows showing MCP servers in UI before starting a chat session
   */
  getMcpConfig: publicProcedure
    .input(z.object({ projectPath: z.string() }))
    .query(async ({ input }) => {
      const claudeJsonPath = path.join(os.homedir(), ".claude.json")

      try {
        const exists = await fs.stat(claudeJsonPath).then(() => true).catch(() => false)
        if (!exists) {
          return { mcpServers: [], projectPath: input.projectPath }
        }

        const configContent = await fs.readFile(claudeJsonPath, "utf-8")
        const config = JSON.parse(configContent)

        // Look for project-specific MCP config
        const projectConfig = config.projects?.[input.projectPath]

        if (!projectConfig?.mcpServers) {
          return { mcpServers: [], projectPath: input.projectPath }
        }

        // Convert to array format with names
        const mcpServers = Object.entries(projectConfig.mcpServers).map(([name, serverConfig]) => ({
          name,
          // Status will be "pending" until SDK actually connects
          status: "pending" as const,
          // Include config details for display (command, args, etc)
          config: serverConfig as Record<string, unknown>,
        }))

        return { mcpServers, projectPath: input.projectPath }
      } catch (error) {
        console.error("[getMcpConfig] Error reading config:", error)
        return { mcpServers: [], projectPath: input.projectPath, error: String(error) }
      }
    }),

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
        return { cancelled: true }
      }
      return { cancelled: false }
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
})

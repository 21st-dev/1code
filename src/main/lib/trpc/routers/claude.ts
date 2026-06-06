import { observable } from "@trpc/server/observable"
import { eq } from "drizzle-orm"
import { app, BrowserWindow } from "electron"
import * as fs from "fs/promises"
import * as os from "os"
import path from "path"
import { z } from "zod"
import { setConnectionMethod } from "../../analytics"
import { assertOfficialCloudAllowed, isLocalOnlyMode } from "../../local-only"
import {
  buildClaudeEnv,
  checkOfflineFallback,
  createTransformer,
  getBundledClaudeBinaryPath,
  logClaudeEnv,
  logRawClaudeMessage,
  type UIMessageChunk,
} from "../../claude"
import {
  getMergedGlobalMcpServers,
  getMergedLocalProjectMcpServers,
  getMatchingLocusPluginMcpServerConfig,
  GLOBAL_MCP_PATH,
  readClaudeConfig,
  readClaudeDirConfig,
  readProjectMcpJson,
  removeMcpServerConfig,
  resolveProjectPathFromWorktree,
  updateClaudeConfigAtomic,
  updateMcpServerConfig,
  type ClaudeConfig,
  type McpServerConfig,
} from "../../claude-config"
import { getValidClaudeCodeCredential } from "../../claude-credentials"
import { chats, getDatabase, projects as projectsTable, subChats } from "../../db"
import { getActiveClaudeProviderConfig } from "./claude-provider-config"
import {
  buildClaudeProviderEnv,
  normalizeClaudeProviderRuntimeConfig,
  type ClaudeProviderRuntimeConfig,
} from "../../claude/provider-runtime-config"
import { createClaudeAgentSdkQueryOptions } from "../../claude/agent-sdk-query-options"
import {
  CLAUDE_MAX_POLICY_RETRIES,
  classifyClaudeAgentSdkEmbeddedError,
  classifyClaudeAgentSdkStreamError,
  extractClaudeAgentSdkEmbeddedErrorText,
  getClaudePolicyRetryDelayMs,
} from "../../claude/agent-sdk-errors"
import {
  logClaudeAgentSdkEmbeddedError,
  logClaudeAgentSdkErrorDetails,
} from "../../claude/agent-sdk-error-logging"
import {
  logClaudeAgentSdkAuthDiagnostics,
  logClaudeAgentSdkProviderDiagnostics,
  logClaudeAgentSdkSessionDiagnostics,
} from "../../claude/agent-sdk-runtime-diagnostics"
import { createClaudeAgentSdkAdapter } from "../../claude/agent-sdk-adapter"
import {
  flushClaudeAgentSdkTextAccumulator,
  processClaudeAgentSdkUiChunk,
} from "../../claude/agent-sdk-chunk-processor"
import { trackClaudeAgentSdkMessageMetadata } from "../../claude/agent-sdk-message-metadata"
import { parseClaudePromptMentions } from "../../claude/mentions"
import {
  clearClaudeAgentSdkQueryCache,
  getClaudeAgentSdkQuery,
} from "../../claude/agent-sdk-query-loader"
import {
  createClaudeAgentSdkSystemPromptConfig,
  readClaudeAgentSdkProjectAgentsMd,
} from "../../claude/agent-sdk-project-context"
import { createClaudeAgentSdkPrompt } from "../../claude/agent-sdk-prompt"
import {
  logClaudeOllamaEmptyStreamDiagnosis,
  logClaudeOllamaFirstMessageLatency,
  logClaudeOllamaMessage,
  logClaudeOllamaSdkConfiguration,
  logClaudeOllamaSingleMessageWarning,
  logClaudeOllamaStreamAborted,
  logClaudeOllamaStreamComplete,
  logClaudeOllamaStreamError,
  logClaudeOllamaStreamStart,
  probeClaudeOllamaConnectivity,
} from "../../claude/agent-sdk-ollama-diagnostics"
import { createClaudeOllamaPrompt } from "../../claude/agent-sdk-ollama-prompt"
import {
  deleteActiveClaudeSession,
  deleteActiveClaudeSessionIfController,
  getActiveClaudeSession,
  hasActiveClaudeSession,
  setActiveClaudeSession,
} from "../../claude/active-sessions"
import {
  createClaudeAgentSdkToolPermissionHandler,
} from "../../claude/agent-sdk-tool-permission"
import {
  clearClaudePendingToolApprovals,
  getClaudePendingToolApprovalStore,
  resolveClaudePendingToolApproval,
} from "../../claude/tool-approvals"
import {
  buildClaudeUserParts,
  claudeImageAttachmentSignatureFromInput,
  claudeImageAttachmentSignatureFromParts,
  claudeLongTextAttachmentSignatureFromInput,
  claudeLongTextAttachmentSignatureFromParts,
} from "../../claude/chat-history"
import {
  imageAttachmentSchema,
  longTextAttachmentSchema,
} from "../../claude/chat-input-schema"
import { createClaudeDesktopRunRequest } from "../../claude/desktop-run-request"
import { getProviderGatewayEndpoint } from "../../provider-profiles/gateway"
import {
  getLegacyClaudeProviderProfileId,
  getProviderProfileRuntimeConfig,
} from "../../provider-profiles/storage"
import { parseProviderProfileSource } from "../../../../shared/provider-profile-types"
import type { ResolvedChatImageAttachment } from "../../../../shared/chat-attachments"
import { createRollbackStash } from "../../git/stash"
import { resolveChatImageAttachments } from "../../chat-attachments"
import { prependLongTextAttachmentPromptBlocks } from "../../long-text-attachments"
import {
  ensureMcpTokensFresh,
  fetchMcpTools,
  fetchMcpToolsStdio,
  getMcpAuthStatus,
  startMcpOAuth,
  type McpToolInfo,
} from "../../mcp-auth"
import { fetchOAuthMetadata, getMcpBaseUrl } from "../../oauth"
import { discoverPluginMcpServers, type PluginMcpConfig } from "../../plugins"
import { getPluginSafeModeState } from "../../plugins/update-review-state"
import { publicProcedure, router } from "../index"
import { preparePromptWithAppAgents } from "../../app-agents/prompt"
import {
  agentScopeContractInputSchema,
  buildGuardedRunAudit,
  captureGuardedGitStatus,
  applyActiveGuardedScopeExpansion,
  deleteActiveGuardedContract,
  formatScopeValidationError,
  getActiveGuardedContract,
  setActiveGuardedContract,
  validateAgentScopeContract,
  type GuardedGitStatusSnapshot,
  type ValidatedAgentScopeContract,
} from "../../agent-guard"
import type {
  AgentGuardEvent,
} from "../../../../shared/agent-scope-contracts"
import { sanitizeMcpConfigForRenderer } from "../../../../shared/mcp-import-preview"
import {
  getApprovedPluginMcpServers,
  getEnabledPlugins,
} from "./claude-settings"
import {
  getClaudePermissionMapping,
  resolveDesktopPermissionPolicy,
} from "../../agent-runtime/permission-policy"
import {
  appendRunEventsToAgentJob,
  createDesktopStreamEventMapper,
  redactRendererDiagnosticChunk,
} from "../../agent-runtime/stream-event-mapper"
import {
  completeDesktopAgentJobSafely,
  createAndStartDesktopAgentJob,
  registerActiveDesktopAgentJob,
  requestCancelDesktopAgentJob,
  unregisterActiveDesktopAgentJob,
} from "../../desktop-agent-jobs"
import {
  DesktopRunPreflightError,
  verifyDesktopRunPreflight,
  type DesktopRunPreflightBlocker,
} from "../../agent-runtime/preflight"

function getPluginGateMcpStatus(gate: { status: string }): string {
  if (gate.status === "safe-mode") return "blocked-safe-mode"
  if (gate.status === "review-required") return "pending-review"
  if (gate.status === "read-only") return "read-only"
  return "pending-approval"
}

const MCP_SERVER_NAME_REGEX = /^[a-zA-Z0-9_-]+$/

function normalizeMcpServerName(value: string): string {
  const name = value.trim()
  if (!name || !MCP_SERVER_NAME_REGEX.test(name)) {
    throw new Error(
      "MCP server name must contain only letters, numbers, underscores, and hyphens",
    )
  }
  return name
}

function resolveMcpProjectPathForMutation(input: {
  scope: "global" | "project"
  projectPath?: string
}): string | null {
  if (input.scope === "global") return null
  if (!input.projectPath) {
    throw new Error("Project path required for project-scoped servers")
  }

  const requestedPath = path.resolve(input.projectPath)
  const resolvedProjectPath =
    resolveProjectPathFromWorktree(requestedPath) || requestedPath
  const normalizedResolvedPath = path.resolve(resolvedProjectPath)
  const registeredProject = getDatabase()
    .select({ path: projectsTable.path })
    .from(projectsTable)
    .all()
    .find((project) => path.resolve(project.path) === normalizedResolvedPath)

  if (!registeredProject) {
    throw new Error("Project-scoped MCP writes require a registered project path")
  }

  return registeredProject.path
}

function getMcpServersForScope(
  config: ClaudeConfig,
  projectPath: string | null,
): Record<string, McpServerConfig> | undefined {
  return projectPath ? config.projects?.[projectPath]?.mcpServers : config.mcpServers
}

function getEffectivePluginMcpServerConfig(input: {
  claudeConfig: ClaudeConfig
  pluginConfig: PluginMcpConfig
  serverName: string
  serverConfig: McpServerConfig
}): McpServerConfig {
  const identifier = input.pluginConfig.approvalIdentifiers[input.serverName]
  if (!identifier) return input.serverConfig

  const promotedConfig = getMatchingLocusPluginMcpServerConfig({
    servers: input.claudeConfig.mcpServers,
    serverName: input.serverName,
    pluginSource: input.pluginConfig.pluginSource,
    pluginReviewKey: input.pluginConfig.pluginReviewKey,
    approvalIdentifier: identifier,
  })

  return promotedConfig
    ? { ...input.serverConfig, ...promotedConfig }
    : input.serverConfig
}

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
const mcpConfigCache = new Map<
  string,
  {
    config: Record<string, any> | undefined
    mtime: number
  }
>()

// Cache for .mcp.json files (avoid re-reading on every message)
const projectMcpJsonCache = new Map<
  string,
  {
    servers: Record<string, McpServerConfig>
    mtime: number
  }
>()

/**
 * Read .mcp.json with mtime-based caching
 */
async function readProjectMcpJsonCached(
  projectPath: string
): Promise<Record<string, McpServerConfig>> {
  try {
    const mcpJsonPath = path.join(projectPath, ".mcp.json")
    const stats = await fs.stat(mcpJsonPath).catch(() => null)
    if (!stats) return {}

    const cached = projectMcpJsonCache.get(mcpJsonPath)
    if (cached && cached.mtime === stats.mtimeMs) {
      return cached.servers
    }

    const servers = await readProjectMcpJson(projectPath)
    projectMcpJsonCache.set(mcpJsonPath, {
      servers,
      mtime: stats.mtimeMs,
    })
    return servers
  } catch {
    return {}
  }
}

/**
 * Clear all performance caches (for testing/debugging)
 */
export function clearClaudeCaches() {
  clearClaudeAgentSdkQueryCache()
  symlinksCreated.clear()
  mcpConfigCache.clear()
  projectMcpJsonCache.clear()
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
  if (serverConfig.url && ["oauth", "bearer"].includes(authType ?? "")) {
    return "needs-auth"
  }

  // HTTP server without authType - assume no auth required (public endpoint)
  // Local stdio server - also connected
  return "connected"
}

const MCP_FETCH_TIMEOUT_MS = 40_000

/**
 * Fetch tools from an MCP server (HTTP or stdio transport)
 * Times out after MCP_FETCH_TIMEOUT_MS seconds to prevent slow MCPs from blocking the cache update
 */
async function fetchToolsForServer(
  serverConfig: McpServerConfig,
): Promise<McpToolInfo[]> {
  const timeoutPromise = new Promise<McpToolInfo[]>((_, reject) =>
    setTimeout(() => reject(new Error("Timeout")), MCP_FETCH_TIMEOUT_MS),
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

    const convertServers = async (
      servers: Record<string, McpServerConfig> | undefined,
      scope: string | null,
    ) => {
      if (!servers) return []

      const results = await Promise.all(
        Object.entries(servers).map(async ([name, serverConfig]) => {
          const configObj = sanitizeMcpConfigForRenderer(
            serverConfig as Record<string, unknown>,
          )
          let status = getServerStatusFromConfig(serverConfig)
          const headers = serverConfig.headers as
            | Record<string, string>
            | undefined

          let tools: McpToolInfo[] = []
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
            } else if (
              serverConfig.authType === "oauth" ||
              serverConfig.authType === "bearer"
            ) {
              needsAuth = true
            }

            if (needsAuth && !headers?.Authorization) {
              status = "needs-auth"
            } else {
              // No tools and doesn't need auth - server failed to connect or has no tools
              status = "failed"
            }
          }

          return { name, status, tools, needsAuth, config: configObj }
        }),
      )

      return results
    }

    // Build list of all groups to process with timing
    const groupTasks: Array<{
      groupName: string
      projectPath: string | null
      promise: Promise<{
        mcpServers: Array<{
          name: string
          status: string
          tools: McpToolInfo[]
          needsAuth: boolean
          config: Record<string, unknown>
        }>
        duration: number
      }>
    }> = []

    // Read ~/.claude/.claude.json once for reuse across global + project merging
    let claudeDirConfig: ClaudeConfig = {}
    try {
      claudeDirConfig = await readClaudeDirConfig()
    } catch { /* ignore */ }

    // Global MCPs (merged from ~/.claude.json + ~/.claude/.claude.json + ~/.claude/mcp.json)
    const mergedGlobalServers = await getMergedGlobalMcpServers(config, claudeDirConfig)
    if (Object.keys(mergedGlobalServers).length > 0) {
      groupTasks.push({
        groupName: "Global",
        projectPath: null,
        promise: (async () => {
          const start = Date.now()
          const freshServers = await ensureMcpTokensFresh(
            mergedGlobalServers,
            GLOBAL_MCP_PATH,
          )
          const mcpServers = await convertServers(freshServers, null) // null = global scope
          return { mcpServers, duration: Date.now() - start }
        })(),
      })
    } else {
      groupTasks.push({
        groupName: "Global",
        projectPath: null,
        promise: Promise.resolve({ mcpServers: [], duration: 0 }),
      })
    }

    // Project MCPs from ~/.claude.json + ~/.claude/.claude.json (per-project configs)
    // Collect all known project paths from both configs
    const allProjectPaths = new Set<string>()
    if (config.projects) {
      for (const p of Object.keys(config.projects)) allProjectPaths.add(p)
    }
    if (claudeDirConfig.projects) {
      for (const p of Object.keys(claudeDirConfig.projects)) allProjectPaths.add(p)
    }

    for (const projectPath of allProjectPaths) {
      const mergedProjectServers = await getMergedLocalProjectMcpServers(projectPath, config, claudeDirConfig)

      // Also read .mcp.json from project root
      const projectMcpJsonServers = await readProjectMcpJsonCached(projectPath)

      // Merge: per-project config servers override .mcp.json
      const allProjectServers = { ...projectMcpJsonServers, ...mergedProjectServers }

      if (Object.keys(allProjectServers).length > 0) {
        const groupName = path.basename(projectPath) || projectPath
        groupTasks.push({
          groupName,
          projectPath,
          promise: (async () => {
            const start = Date.now()
            const freshServers = await ensureMcpTokensFresh(
              allProjectServers,
              projectPath,
            )
            const mcpServers = await convertServers(freshServers, projectPath)
            return { mcpServers, duration: Date.now() - start }
          })(),
        })
      }
    }

    // DB project discovery: find projects with .mcp.json that aren't in configs
    try {
      const db = getDatabase()
      const dbProjects = db.select({ path: projectsTable.path }).from(projectsTable).all()
      for (const proj of dbProjects) {
        if (!proj.path || allProjectPaths.has(proj.path)) continue
        const mcpJsonServers = await readProjectMcpJsonCached(proj.path)
        if (Object.keys(mcpJsonServers).length > 0) {
          const groupName = path.basename(proj.path) || proj.path
          groupTasks.push({
            groupName,
            projectPath: proj.path,
            promise: (async () => {
              const start = Date.now()
              const mcpServers = await convertServers(mcpJsonServers, proj.path)
              return { mcpServers, duration: Date.now() - start }
            })(),
          })
        }
      }
    } catch (dbErr) {
      console.error("[MCP] DB project discovery error:", dbErr)
    }

    // Process all groups in parallel
    const results = await Promise.all(groupTasks.map((t) => t.promise))

    // Build groups with timing info
    const groupsWithTiming = groupTasks.map((task, i) => ({
      groupName: task.groupName,
      projectPath: task.projectPath,
      mcpServers: results[i].mcpServers,
      duration: results[i].duration,
    }))

    // Log performance (sorted by duration DESC)
    const totalDuration = Date.now() - totalStart
    const workingCount = [...workingMcpServers.values()].filter((v) => v).length
    const sortedByDuration = [...groupsWithTiming].sort(
      (a, b) => b.duration - a.duration,
    )

    console.log(
      `[MCP] Cache updated in ${totalDuration}ms. Working: ${workingCount}/${workingMcpServers.size}`,
    )
    for (const g of sortedByDuration) {
      if (g.mcpServers.length > 0) {
        console.log(
          `[MCP]   ${g.groupName}: ${g.duration}ms (${g.mcpServers.length} servers)`,
        )
      }
    }

    // Return groups without timing info
    const groups = groupsWithTiming.map(
      ({ groupName, projectPath, mcpServers }) => ({
        groupName,
        projectPath,
        mcpServers,
      }),
    )

    // Plugin MCPs (from installed plugins)
    const [enabledPluginSources, pluginMcpConfigs, approvedServers] =
      await Promise.all([
        getEnabledPlugins(),
        discoverPluginMcpServers(),
        getApprovedPluginMcpServers(),
      ])

    for (const pluginConfig of pluginMcpConfigs) {
      // Only show MCP servers from enabled plugins
      if (!enabledPluginSources.includes(pluginConfig.pluginSource)) continue

      const globalServerNames = Object.keys(mergedGlobalServers)
      if (Object.keys(pluginConfig.mcpServers).length > 0) {
        const pluginMcpServers = (
          await Promise.all(
            Object.entries(pluginConfig.mcpServers).map(
              async ([name, serverConfig]) => {
                // Skip servers that have been promoted to ~/.claude.json (e.g., after OAuth)
                if (globalServerNames.includes(name)) return null

                const identifier = pluginConfig.approvalIdentifiers[name]
                const passesReviewGate = pluginConfig.reviewGate.canUseMcp
                const isApproved = passesReviewGate && Boolean(
                  identifier && approvedServers.includes(identifier),
                )
                const effectiveServerConfig = getEffectivePluginMcpServerConfig({
                  claudeConfig: config,
                  pluginConfig,
                  serverName: name,
                  serverConfig,
                })
                const configObj = sanitizeMcpConfigForRenderer(
                  effectiveServerConfig as Record<string, unknown>,
                )

                if (!passesReviewGate) {
                  return {
                    name,
                    status: getPluginGateMcpStatus(pluginConfig.reviewGate),
                    tools: [] as McpToolInfo[],
                    needsAuth: false,
                    config: configObj,
                    isApproved: false,
                  }
                }

                if (!isApproved) {
                  return {
                    name,
                    status: "pending-approval",
                    tools: [] as McpToolInfo[],
                    needsAuth: false,
                    config: configObj,
                    isApproved,
                  }
                }

                // Try to get status and tools for approved servers
                let status = getServerStatusFromConfig(effectiveServerConfig)
                const headers = effectiveServerConfig.headers as
                  | Record<string, string>
                  | undefined
                let tools: McpToolInfo[] = []
                let needsAuth = false

                try {
                  tools = await fetchToolsForServer(effectiveServerConfig)
                } catch (error) {
                  console.error(
                    `[MCP] Failed to fetch tools for plugin ${name}:`,
                    error,
                  )
                }

                if (tools.length > 0) {
                  status = "connected"
                } else {
                  // Same OAuth detection logic as regular MCP servers
                  if (effectiveServerConfig.url) {
                    try {
                      const baseUrl = getMcpBaseUrl(effectiveServerConfig.url)
                      const metadata = await fetchOAuthMetadata(baseUrl)
                      needsAuth =
                        !!metadata && !!metadata.authorization_endpoint
                    } catch {
                      // If probe fails, assume no auth needed
                    }
                  } else if (
                    effectiveServerConfig.authType === "oauth" ||
                    effectiveServerConfig.authType === "bearer"
                  ) {
                    needsAuth = true
                  }

                  if (needsAuth && !headers?.Authorization) {
                    status = "needs-auth"
                  } else {
                    status = "failed"
                  }
                }

                return {
                  name,
                  status,
                  tools,
                  needsAuth,
                  config: configObj,
                  isApproved,
                }
              },
            ),
          )
        ).filter((s): s is NonNullable<typeof s> => s !== null)

        groups.push({
          groupName: `Plugin: ${pluginConfig.pluginSource}`,
          projectPath: null,
          mcpServers: pluginMcpServers,
        })
      }
    }

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
        runId: z.string().optional(),
        prompt: z.string(),
        cwd: z.string(),
        projectPath: z.string().optional(), // Original project path for MCP config lookup
        mode: z.enum(["plan", "agent"]).default("agent"),
        sessionId: z.string().optional(),
        model: z.string().optional(),
        modelSource: z.string().optional(),
        maxThinkingTokens: z.number().optional(), // Enable extended thinking
        images: z.array(imageAttachmentSchema).optional(), // Image attachments
        longTextAttachments: z.array(longTextAttachmentSchema).optional(),
        historyEnabled: z.boolean().optional(),
        offlineModeEnabled: z.boolean().optional(), // Whether offline mode (Ollama) is enabled in settings
        enableTasks: z.boolean().optional(), // Enable task management tools (TodoWrite, Task agents)
        scopeContract: agentScopeContractInputSchema.optional(),
      }),
    )
    .subscription(({ input }) => {
      return observable<UIMessageChunk>((emit) => {
        // Abort any existing session for this subChatId before starting a new one
        // This prevents race conditions if two messages are sent in quick succession
        const existingSession = getActiveClaudeSession(input.subChatId)
        if (existingSession) {
          existingSession.controller.abort()
        }

        const abortController = new AbortController()
        const streamId = crypto.randomUUID()
        const activeRunId = input.runId ?? streamId
        setActiveClaudeSession(input.subChatId, {
          controller: abortController,
          runId: activeRunId,
        })

        // Stream debug logging
        const subId = input.subChatId.slice(-8) // Short ID for logs
        const streamStart = Date.now()
        let chunkCount = 0
        let lastChunkType = ""
        // Shared sessionId for cleanup to save on abort
        let currentSessionId: string | null = null
        let desktopJobId: string | null = null
        let desktopJobSawError = false
        let desktopJobReachedNaturalFinish = false
        let desktopJobDb: ReturnType<typeof getDatabase> | null = null
        let desktopStreamEventMapper: ReturnType<
          typeof createDesktopStreamEventMapper
        > | null = null
        console.log(
          `[SD] M:START sub=${subId} stream=${streamId.slice(-8)} mode=${input.mode}`,
        )

        // Track if observable is still active (not unsubscribed)
        let isObservableActive = true

        // Helper to safely emit (no-op if already unsubscribed)
        const safeEmit = (chunk: UIMessageChunk) => {
          const observedChunk = chunk as any
          if (
            observedChunk?.type === "error" ||
            observedChunk?.type === "auth-error" ||
            observedChunk?.type === "capability-error" ||
            (observedChunk?.type === "runtime-status" && observedChunk?.ok === false)
          ) {
            desktopJobSawError = true
          }
          if (desktopJobDb && desktopStreamEventMapper && observedChunk?.type !== "finish") {
            try {
              const events = desktopStreamEventMapper.map(observedChunk)
              appendRunEventsToAgentJob(desktopJobDb, events)
            } catch (eventError) {
              console.warn("[claude] Failed to persist desktop run events:", eventError)
            }
          }
          if (!isObservableActive) return false
          try {
            const rendererChunk = redactRendererDiagnosticChunk({
              runtimeId: "claude-code",
              runId: activeRunId,
              jobId: desktopJobId,
              chunk,
            }) as UIMessageChunk
            emit.next(rendererChunk)
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

        let guardedContract: ValidatedAgentScopeContract | null = null
        let guardedPreRunStatus: GuardedGitStatusSnapshot | null = null
        const guardEvents: AgentGuardEvent[] = []
        const guardedRunStartedAt = new Date().toISOString()

        ;(async () => {
          try {
            const db = getDatabase()
            desktopJobDb = db
            const verifiedRunContext = verifyDesktopRunPreflight(db, {
              chatId: input.chatId,
              subChatId: input.subChatId,
              cwd: input.cwd,
            })
            const runtimeCwd = verifiedRunContext.cwd

            if (input.scopeContract) {
              try {
                const validated = await validateAgentScopeContract(input.scopeContract, {
                  cwd: runtimeCwd,
                  projectPath: input.projectPath,
                  chatId: input.chatId,
                  subChatId: input.subChatId,
                  runId: input.runId,
                })
                guardedContract = {
                  ...validated,
                  runId: validated.runId ?? input.runId ?? streamId,
                }
                setActiveGuardedContract(guardedContract)
                guardedPreRunStatus = await captureGuardedGitStatus(runtimeCwd)
              } catch (guardError) {
                emitError(
                  new Error(formatScopeValidationError(guardError)),
                  "Guarded run contract rejected",
                )
                safeEmit({ type: "finish" } as UIMessageChunk)
                safeComplete()
                return
              }
            }
            const permissionPolicy = resolveDesktopPermissionPolicy({
              runtimeId: "claude-code",
              mode: input.mode,
              hasScopeContract: Boolean(guardedContract),
            })
            const claudePermission = getClaudePermissionMapping(permissionPolicy)

            const emitPreflightBlocker = (
              blocker: DesktopRunPreflightBlocker,
            ) => {
              emitError(
                new DesktopRunPreflightError(blocker),
                "Desktop run preflight blocked",
              )
              safeEmit({ type: "finish" } as UIMessageChunk)
              safeComplete()
            }

            // 1. Get existing messages from DB
            const existing = db
              .select()
              .from(subChats)
              .where(eq(subChats.id, input.subChatId))
              .get()
            const existingMessages = JSON.parse(existing?.messages || "[]")
            const existingSessionId = existing?.sessionId || null

            // Get resumeSessionAt UUID only if shouldResume flag was set (by rollbackToMessage)
            // or shouldForkResume flag was set (by forkSubChat)
            const lastAssistantMsg = [...existingMessages]
              .reverse()
              .find((m: any) => m.role === "assistant")
            const resumeAtUuid = lastAssistantMsg?.metadata?.shouldResume
              ? lastAssistantMsg?.metadata?.sdkMessageUuid || null
              : null
            const shouldForkResume =
              lastAssistantMsg?.metadata?.shouldForkResume === true
            const forkResumeAtUuid = shouldForkResume
              ? lastAssistantMsg?.metadata?.sdkMessageUuid || null
              : null
            const historyEnabled = input.historyEnabled === true
            let resolvedImages: ResolvedChatImageAttachment[] = []
            try {
              resolvedImages = await resolveChatImageAttachments(input.images)
            } catch (attachmentError) {
              emitPreflightBlocker({
                id: "attachment",
                status: "blocked",
                message:
                  attachmentError instanceof Error
                    ? `Image attachment unavailable: ${attachmentError.message}`
                    : `Image attachment unavailable: ${String(attachmentError)}`,
              })
              return
            }

            // Clear shouldForkResume flag after reading (consumed once) and persist to DB
            if (shouldForkResume) {
              for (const m of existingMessages) {
                if (m.metadata?.shouldForkResume) {
                  delete m.metadata.shouldForkResume
                }
              }
              db.update(subChats)
                .set({ messages: JSON.stringify(existingMessages) })
                .where(eq(subChats.id, input.subChatId))
                .run()
            }

            // Check if last message is already this user message (avoid duplicate)
            const lastMsg = existingMessages[existingMessages.length - 1]
            const lastMsgText = lastMsg?.parts?.find(
              (p: any) => p.type === "text",
            )?.text
            const isDuplicate =
              lastMsg?.role === "user" &&
              lastMsgText === input.prompt &&
              claudeLongTextAttachmentSignatureFromParts(lastMsg?.parts) ===
                claudeLongTextAttachmentSignatureFromInput(
                  input.longTextAttachments,
                ) &&
              claudeImageAttachmentSignatureFromParts(lastMsg?.parts) ===
                claudeImageAttachmentSignatureFromInput(input.images)

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
                createdAt: new Date().toISOString(),
                parts: buildClaudeUserParts(
                  input.prompt,
                  input.images,
                  input.longTextAttachments,
                ),
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

            let providerConfig: ClaudeProviderRuntimeConfig | undefined

            const selectedProviderProfileId = parseProviderProfileSource(
              input.modelSource,
            )

            if (selectedProviderProfileId) {
              const profile = getProviderProfileRuntimeConfig(selectedProviderProfileId)
              if (!profile || !profile.targetRuntimes.includes("claude")) {
                emitPreflightBlocker({
                  id: "provider-profile",
                  status: "blocked",
                  message: "Provider profile is not available for Claude.",
                  hint: "Choose a provider profile that targets Claude.",
                })
                return
              }

              const gateway = await getProviderGatewayEndpoint(profile.id, "anthropic")
              providerConfig = {
                model: profile.defaultModel,
                baseUrl: gateway.baseUrl,
                token: gateway.token,
                authMode: "auth_token",
              }
            } else if (input.modelSource === "custom-provider") {
              const legacyProfileId = getLegacyClaudeProviderProfileId()
              if (legacyProfileId) {
                const profile = getProviderProfileRuntimeConfig(legacyProfileId)
                if (profile) {
                  const gateway = await getProviderGatewayEndpoint(
                    profile.id,
                    "anthropic",
                  )
                  providerConfig = {
                    model: profile.defaultModel,
                    baseUrl: gateway.baseUrl,
                    token: gateway.token,
                    authMode: "auth_token",
                  }
                }
              }

              providerConfig =
                providerConfig ||
                getActiveClaudeProviderConfig()

              if (!providerConfig) {
                emitPreflightBlocker({
                  id: "provider-profile",
                  status: "needs-auth",
                  message: "Custom provider is not configured.",
                  hint: "Configure a Claude provider profile or use Claude Code auth.",
                })
                return
              }
            }

            // 2.5. AUTO-FALLBACK: Check internet and switch to Ollama if offline
            // Only check if offline mode is enabled in settings. When a custom
            // provider is active, it takes precedence over Claude OAuth.
            let claudeCodeToken: string | null = null
            let claudeCredentialMetadata:
              | Awaited<ReturnType<typeof getValidClaudeCodeCredential>>["metadata"]
              | null = null

            if (!providerConfig) {
              try {
                const credentialResult = await getValidClaudeCodeCredential()
                claudeCodeToken = credentialResult.accessToken
                claudeCredentialMetadata = credentialResult.metadata
              } catch (credentialError) {
                emitPreflightBlocker({
                  id: "provider-profile",
                  status: "needs-auth",
                  message:
                    credentialError instanceof Error
                      ? `Claude Code credential unavailable: ${credentialError.message}`
                      : `Claude Code credential unavailable: ${String(credentialError)}`,
                  hint: "Reconnect Claude Code auth or choose a provider profile.",
                })
                return
              }
            }

            const offlineResult = await checkOfflineFallback(
              providerConfig,
              claudeCodeToken,
              undefined, // selectedOllamaModel - will be read from customConfig if present
              input.offlineModeEnabled ?? false, // Pass offline mode setting
            )

            if (offlineResult.error) {
              emitPreflightBlocker({
                id: "provider-profile",
                status: "blocked",
                message: `Offline mode unavailable: ${offlineResult.error}`,
              })
              return
            }

            // Use offline config if available. Non-secure legacy input defaults
            // to ANTHROPIC_AUTH_TOKEN to preserve previous behavior.
            const finalCustomConfig = offlineResult.config
              ? normalizeClaudeProviderRuntimeConfig(offlineResult.config)
              : providerConfig
            const isUsingOllama = offlineResult.isUsingOllama
            if (finalCustomConfig?.baseUrl) {
              try {
                assertOfficialCloudAllowed(
                  "use Claude provider endpoint",
                  finalCustomConfig.baseUrl,
                )
              } catch (providerError) {
                emitPreflightBlocker({
                  id: "local-only",
                  status: "blocked",
                  message:
                    providerError instanceof Error
                      ? providerError.message
                      : String(providerError),
                })
                return
              }
            }

            const desktopJob = createAndStartDesktopAgentJob(db, {
              runtime: "claude-code",
              mode: input.mode,
              chatId: input.chatId,
              subChatId: input.subChatId,
              cwd: runtimeCwd,
              prompt: input.prompt,
              runId: activeRunId,
            })
            desktopJobId = desktopJob.job.id
            desktopStreamEventMapper = createDesktopStreamEventMapper({
              runtimeId: "claude-code",
              runId: activeRunId,
              jobId: desktopJobId,
            })
            registerActiveDesktopAgentJob({
              jobId: desktopJobId,
              runtime: "claude-code",
              subChatId: input.subChatId,
              runId: activeRunId,
              db,
              workerId: desktopJob.workerId,
              cancel: () => {
                abortController.abort()
                clearClaudePendingToolApprovals(
                  "Session cancelled.",
                  input.subChatId,
                )
              },
            })

            const resumeSessionId =
              input.sessionId || existingSessionId || undefined
            const desktopRunRequest = createClaudeDesktopRunRequest({
              runId: activeRunId,
              streamId,
              jobId: desktopJobId,
              mode: input.mode,
              preflight: verifiedRunContext,
              prompt: input.prompt,
              permissionPolicy,
              providerBinding: {
                model: finalCustomConfig?.model ?? input.model ?? null,
                modelSource: input.modelSource ?? null,
                providerProfileId: selectedProviderProfileId ?? null,
                gatewayEndpoint: finalCustomConfig?.baseUrl ?? null,
                authMode: selectedProviderProfileId
                  ? "provider-profile"
                  : finalCustomConfig
                    ? "app-managed"
                    : "runtime-managed",
              },
              images: input.images,
              longTextAttachments: input.longTextAttachments,
              signal: abortController.signal,
              resumeSessionId,
              parentSessionId: input.sessionId ?? null,
              emitTrace: (event) => {
                appendRunEventsToAgentJob(db, [event])
              },
            })

            // Track connection method for analytics
            let connectionMethod = "claude-subscription" // default (Claude Code OAuth)
            if (isUsingOllama) {
              connectionMethod = "offline-ollama"
            } else if (finalCustomConfig) {
              // Has custom config = either API key or custom model
              const isDefaultAnthropicUrl =
                !finalCustomConfig.baseUrl ||
                finalCustomConfig.baseUrl.includes("anthropic.com")
              connectionMethod = isDefaultAnthropicUrl
                ? "api-key"
                : "custom-model"
            }
            setConnectionMethod(connectionMethod)

            // Offline status is shown in sidebar, no need to emit message here
            // (emitting text-delta without text-start breaks UI text rendering)

            // 3. Get Claude Agent SDK query entrypoint.
            let claudeQuery
            try {
              claudeQuery = await getClaudeAgentSdkQuery()
            } catch (sdkError) {
              emitError(sdkError, "Failed to load Claude Agent SDK")
              console.log(
                `[SD] M:END sub=${subId} reason=sdk_load_error n=${chunkCount}`,
              )
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
            let metadata: any = guardedContract
              ? {
                  guardedRun: {
                    contractId: guardedContract.id,
                    runId: guardedContract.runId ?? guardedContract.id,
                    runtime: "claude",
                    enforcementMode: "hard",
                  },
                }
              : {}

            const finalizeGuardMetadata = async (
              currentMetadata: any,
              options: { failed?: boolean; stopped?: boolean } = {},
            ) => {
              if (!guardedContract || !guardedPreRunStatus) {
                return currentMetadata
              }

              const finalContract =
                getActiveGuardedContract(guardedContract.id) ?? guardedContract
              const postRunStatus = await captureGuardedGitStatus(runtimeCwd)
              const audit = buildGuardedRunAudit({
                contract: finalContract,
                runtime: "claude",
                enforcementMode: "hard",
                preRunStatus: guardedPreRunStatus,
                postRunStatus,
                guardEvents,
                startedAt: guardedRunStartedAt,
                failed: options.failed,
                stopped: options.stopped,
              })
              deleteActiveGuardedContract(guardedContract.id)
              safeEmit({ type: "guard-audit", audit })
              return {
                ...currentMetadata,
                guardedRun: {
                  ...(currentMetadata?.guardedRun ?? {}),
                  audit,
                },
              }
            }

            // Capture stderr from Claude process for debugging
            const stderrLines: string[] = []

            // Parse mentions from prompt (App Agents, skills, files, folders)
            const { cleanedPrompt, agentMentions, skillMentions } =
              parseClaudePromptMentions(input.prompt)

            if (agentMentions.length > 0) {
              console.log(`[claude] App Agents mentioned:`, agentMentions)
            }

            // Log if skills were mentioned
            if (skillMentions.length > 0) {
              console.log(`[claude] Skills mentioned:`, skillMentions)
            }

            const appAgentPrompt = await preparePromptWithAppAgents(
              cleanedPrompt,
              agentMentions,
            )
            if (appAgentPrompt.missingAppAgents.length > 0) {
              console.warn(
                `[claude] Missing App Agents:`,
                appAgentPrompt.missingAppAgents,
              )
            }

            // Build final prompt with App Agent and skill instructions if needed
            let finalPrompt = appAgentPrompt.prompt

            // Handle empty prompt when only mentions are present
            if (!finalPrompt.trim()) {
              if (skillMentions.length > 0) {
                finalPrompt = `Invoke the "${skillMentions.join('", "')}" skill(s) using the Skill tool for this task.`
              }
            } else if (skillMentions.length > 0) {
              // Append skill instruction to existing prompt
              finalPrompt = `${finalPrompt}\n\nUse the "${skillMentions.join('", "')}" skill(s) for this task.`
            }

            try {
              finalPrompt = await prependLongTextAttachmentPromptBlocks(
                finalPrompt,
                input.longTextAttachments,
              )
            } catch (attachmentError) {
              emitError(attachmentError, "Long text attachment unavailable")
              safeEmit({ type: "finish" } as UIMessageChunk)
              safeComplete()
              return
            }

            const prompt = createClaudeAgentSdkPrompt({
              prompt: finalPrompt,
              images: resolvedImages,
            })

            // Build full environment for the Claude runtime (includes HOME, PATH, etc.)
            const claudeEnv = buildClaudeEnv({
              ...(finalCustomConfig && {
                customEnv: buildClaudeProviderEnv(finalCustomConfig),
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
              isUsingOllama ? input.chatId : input.subChatId,
            )

            // MCP servers to pass to SDK (read from ~/.claude.json)
            let mcpServersForSdk: Record<string, any> | undefined

            // Ensure isolated config dir exists and symlink selected ~/.claude/ assets
            // This is needed because SDK looks for these under $CLAUDE_CONFIG_DIR/
            // OPTIMIZATION: Only create symlinks once per subChatId (cached)
            try {
              await fs.mkdir(isolatedConfigDir, { recursive: true })

              // Only create symlinks if not already created for this config dir
              const cacheKey = isUsingOllama ? input.chatId : input.subChatId
              const pluginSafeMode = await getPluginSafeModeState()
              if (!symlinksCreated.has(cacheKey) || pluginSafeMode.enabled) {
                const homeClaudeDir = path.join(os.homedir(), ".claude")
                const symlinkType =
                  process.platform === "win32" ? "junction" : "dir"

                const skillsSource = path.join(homeClaudeDir, "skills")
                const skillsTarget = path.join(isolatedConfigDir, "skills")
                const commandsSource = path.join(homeClaudeDir, "commands")
                const commandsTarget = path.join(isolatedConfigDir, "commands")
                const agentsSource = path.join(homeClaudeDir, "agents")
                const agentsTarget = path.join(isolatedConfigDir, "agents")
                const pluginsTarget = path.join(isolatedConfigDir, "plugins")
                const settingsSource = path.join(homeClaudeDir, "settings.json")
                const settingsTarget = path.join(
                  isolatedConfigDir,
                  "settings.json",
                )

                let symlinkSetupComplete = true
                let symlinkSetupHadErrors = false

                const removeManagedSymlink = async (
                  targetPath: string,
                  label: string,
                ) => {
                  try {
                    const stat = await fs
                      .lstat(targetPath)
                      .catch(() => undefined)
                    if (stat?.isSymbolicLink()) {
                      await fs.unlink(targetPath)
                    }
                  } catch (symlinkErr) {
                    symlinkSetupHadErrors = true
                    console.warn(
                      `[claude] Failed to remove ${label} symlink for plugin safe mode:`,
                      (symlinkErr as Error).message,
                    )
                  }
                }

                const ensureSymlink = async (
                  sourcePath: string,
                  targetPath: string,
                  label: string,
                  targetKind: "dir" | "file",
                ) => {
                  try {
                    const sourceExists = await fs
                      .stat(sourcePath)
                      .then(() => true)
                      .catch(() => false)
                    const targetExists = await fs
                      .lstat(targetPath)
                      .then(() => true)
                      .catch(() => false)

                    if (sourceExists && !targetExists) {
                      if (targetKind === "dir") {
                        await fs.symlink(sourcePath, targetPath, symlinkType)
                      } else {
                        await fs.symlink(sourcePath, targetPath)
                      }
                    }

                    // Keep rechecking on next request when source is not created yet.
                    if (!sourceExists && !targetExists) {
                      symlinkSetupComplete = false
                    }
                  } catch (symlinkErr) {
                    symlinkSetupComplete = false
                    symlinkSetupHadErrors = true
                    console.warn(
                      `[claude] Failed to symlink ${label}:`,
                      (symlinkErr as Error).message,
                    )
                  }
                }

                await ensureSymlink(
                  skillsSource,
                  skillsTarget,
                  "skills directory",
                  "dir",
                )
                await ensureSymlink(
                  commandsSource,
                  commandsTarget,
                  "commands directory",
                  "dir",
                )
                await ensureSymlink(
                  agentsSource,
                  agentsTarget,
                  "agents directory",
                  "dir",
                )
                // Do not expose the whole Claude plugin directory to Locus-managed
                // runs. Reviewed plugin MCP servers are injected explicitly below;
                // commands/skills/agents need a future allowlisted mount design.
                await removeManagedSymlink(pluginsTarget, "plugins directory")
                await ensureSymlink(
                  settingsSource,
                  settingsTarget,
                  "settings.json",
                  "file",
                )

                if (symlinkSetupComplete) {
                  symlinksCreated.add(cacheKey)
                } else if (symlinkSetupHadErrors) {
                  console.warn(
                    "[claude] Symlink setup incomplete, will retry on next request",
                  )
                }
              }

              // Read MCP servers from all sources for the original project path
              // These will be passed directly to the SDK via options.mcpServers
              // Sources: ~/.claude.json, ~/.claude/.claude.json, ~/.claude/mcp.json, .mcp.json
              // OPTIMIZATION: Cache configs by file mtime to avoid re-parsing on every message
              const claudeJsonSource = path.join(os.homedir(), ".claude.json")
              try {
                const stats = await fs.stat(claudeJsonSource).catch(() => null)
                const currentMtime = stats?.mtimeMs ?? 0
                const cached = mcpConfigCache.get(claudeJsonSource)
                const lookupPath = input.projectPath || runtimeCwd

                // Get or refresh cached config
                let claudeConfig: any
                if (cached && cached.mtime === currentMtime && currentMtime > 0) {
                  claudeConfig = cached.config
                } else if (stats) {
                  claudeConfig = JSON.parse(
                    await fs.readFile(claudeJsonSource, "utf-8"),
                  )
                  mcpConfigCache.set(claudeJsonSource, {
                    config: claudeConfig,
                    mtime: currentMtime,
                  })
                } else {
                  claudeConfig = {}
                }

                // Read ~/.claude/.claude.json once for reuse
                let chatClaudeDirConfig: ClaudeConfig = {}
                try {
                  chatClaudeDirConfig = await readClaudeDirConfig()
                } catch { /* ignore */ }

                // Merge global servers from all user-level sources
                const globalServers = await getMergedGlobalMcpServers(claudeConfig, chatClaudeDirConfig)

                // Merge per-project servers from config files
                const projectConfigServers = await getMergedLocalProjectMcpServers(lookupPath, claudeConfig, chatClaudeDirConfig)

                // Read .mcp.json from project root (with mtime caching)
                const projectMcpJsonServers = await readProjectMcpJsonCached(lookupPath)

                // Per-project config servers override .mcp.json
                const projectServers = { ...projectMcpJsonServers, ...projectConfigServers }

                // Load plugin MCP servers (filtered by enabled plugins and approval)
                const [
                  enabledPluginSources,
                  pluginMcpConfigs,
                  approvedServers,
                ] = await Promise.all([
                  getEnabledPlugins(),
                  discoverPluginMcpServers(),
                  getApprovedPluginMcpServers(),
                ])

                const pluginServers: Record<string, McpServerConfig> = {}
                for (const pConfig of pluginMcpConfigs) {
                  if (
                    enabledPluginSources.includes(pConfig.pluginSource) &&
                    pConfig.reviewGate.canUseMcp
                  ) {
                    for (const [name, serverConfig] of Object.entries(
                      pConfig.mcpServers,
                    )) {
                      if (!globalServers[name] && !projectServers[name]) {
                        const identifier = pConfig.approvalIdentifiers[name]
                        if (identifier && approvedServers.includes(identifier)) {
                          pluginServers[name] = getEffectivePluginMcpServerConfig({
                            claudeConfig,
                            pluginConfig: pConfig,
                            serverName: name,
                            serverConfig,
                          })
                        }
                      }
                    }
                  }
                }

                // Priority: project > global > plugin
                const allServers = {
                  ...pluginServers,
                  ...globalServers,
                  ...projectServers,
                }

                // Filter to only working MCPs using scoped cache keys
                if (workingMcpServers.size > 0) {
                  const filtered: Record<string, any> = {}
                  // Resolve worktree path to original project path to match cache keys
                  const resolvedProjectPath =
                    resolveProjectPathFromWorktree(lookupPath) || lookupPath
                  for (const [name, srvConfig] of Object.entries(allServers)) {
                    // Use resolved project scope if server is from project, otherwise global
                    const scope =
                      name in projectServers ? resolvedProjectPath : null
                    const cacheKey = mcpCacheKey(scope, name)
                    // Include server if it's marked working, or if it's not in cache at all
                    // (plugin servers won't be in the cache yet)
                    if (
                      workingMcpServers.get(cacheKey) === true ||
                      !workingMcpServers.has(cacheKey)
                    ) {
                      filtered[name] = srvConfig
                    }
                  }
                  mcpServersForSdk = filtered
                  const skipped =
                    Object.keys(allServers).length -
                    Object.keys(filtered).length
                  if (skipped > 0) {
                    console.log(
                      `[claude] Filtered out ${skipped} non-working MCP(s)`,
                    )
                  }
                } else {
                  mcpServersForSdk = allServers
                }
              } catch (configErr) {
                console.error(`[claude] Failed to read MCP config:`, configErr)
              }
            } catch (mkdirErr) {
              console.error(
                `[claude] Failed to setup isolated config dir:`,
                mkdirErr,
              )
            }

            // Check if an explicit Locus provider/offline config injected Claude
            // API auth or endpoint. Inherited shell/process ANTHROPIC_* values
            // are stripped in buildClaudeEnv so they cannot silently override
            // the selected Claude Code credential.
            const hasExistingApiConfig = !!(
              claudeEnv.ANTHROPIC_API_KEY || claudeEnv.ANTHROPIC_AUTH_TOKEN || claudeEnv.ANTHROPIC_BASE_URL
            )

            // Build final env - only add OAuth token if we have one AND no existing API config
            // Existing CLI config takes precedence over OAuth
            const finalEnv: Record<string, string> = {
              ...claudeEnv,
              ...(claudeCodeToken &&
                !hasExistingApiConfig && {
                  CLAUDE_CODE_OAUTH_TOKEN: claudeCodeToken,
                }),
              // Re-enable CLAUDE_CONFIG_DIR now that we properly map MCP configs
              CLAUDE_CONFIG_DIR: isolatedConfigDir,
            }

            logClaudeAgentSdkAuthDiagnostics({
              hasExistingApiConfig,
              claudeCodeToken,
              credentialMetadata: claudeCredentialMetadata,
              finalEnv,
            })

            // Get bundled Claude binary path
            const claudeBinaryPath = getBundledClaudeBinaryPath()

            logClaudeAgentSdkSessionDiagnostics({
              subChatId: input.subChatId,
              cwd: runtimeCwd,
              isolatedConfigDir,
              resumeSessionId,
              existingSessionId,
              resumeAtUuid,
              shouldForkResume,
              forkResumeAtUuid,
            })

            logClaudeAgentSdkProviderDiagnostics({
              cwd: runtimeCwd,
              projectPath: input.projectPath,
              mcpServers: mcpServersForSdk,
              finalCustomConfig,
              isUsingOllama,
            })

            const resolvedModel = finalCustomConfig?.model || input.model

            // DEBUG: If using Ollama, test if it's actually responding
            if (isUsingOllama && finalCustomConfig) {
              await probeClaudeOllamaConnectivity({
                baseUrl: finalCustomConfig.baseUrl,
                model: finalCustomConfig.model,
              })
            }

            // Skip MCP servers entirely in offline mode (Ollama) - they slow down initialization by 60+ seconds
            // Otherwise pass all MCP servers - the SDK will handle connection
            let mcpServersFiltered: Record<string, any> | undefined

            if (isUsingOllama) {
              console.log(
                "[Ollama] Skipping MCP servers to speed up initialization",
              )
              mcpServersFiltered = undefined
            } else {
              // Ensure MCP tokens are fresh (refresh if within 5 min of expiry)
              if (
                mcpServersForSdk &&
                Object.keys(mcpServersForSdk).length > 0
              ) {
                const lookupPath = input.projectPath || runtimeCwd
                mcpServersFiltered = await ensureMcpTokensFresh(
                  mcpServersForSdk,
                  lookupPath,
                )
              } else {
                mcpServersFiltered = mcpServersForSdk
              }
            }

            // Log SDK configuration for debugging
            if (isUsingOllama) {
              logClaudeOllamaSdkConfiguration({
                model: resolvedModel,
                baseUrl: finalEnv.ANTHROPIC_BASE_URL,
                cwd: runtimeCwd,
                configDir: isolatedConfigDir,
                hasAuthToken: !!finalEnv.ANTHROPIC_AUTH_TOKEN,
                resumeSessionId,
              })
            }

            // Read AGENTS.md from project root if it exists
            const agentsMd = await readClaudeAgentSdkProjectAgentsMd(runtimeCwd)
            const agentsMdContent = agentsMd?.content
            if (agentsMdContent) {
              console.log(
                `[claude] Found AGENTS.md at ${agentsMd.path} (${agentsMdContent.length} chars)`,
              )
            }

            // For Ollama: embed context AND history directly in prompt
            // Ollama doesn't have server-side sessions, so we must include full history
            let finalQueryPrompt: string | AsyncIterable<any> = prompt
            if (isUsingOllama && typeof prompt === "string") {
              const ollamaPrompt = createClaudeOllamaPrompt({
                prompt,
                existingMessages,
                resolvedModel,
                projectPath: input.projectPath,
                cwd: runtimeCwd,
                agentsMdContent,
              })
              finalQueryPrompt = ollamaPrompt.prompt
              if (ollamaPrompt.historyMessageCount > 0) {
                console.log(
                  `[Ollama] Added ${ollamaPrompt.historyMessageCount} messages to history (${ollamaPrompt.historyLength} chars)`,
                )
              }
              console.log("[Ollama] Context prefix added to prompt")
            }

            const systemPromptConfig =
              createClaudeAgentSdkSystemPromptConfig(agentsMdContent)

            const queryOptions = createClaudeAgentSdkQueryOptions({
              request: desktopRunRequest,
              prompt: finalQueryPrompt,
              systemPrompt: systemPromptConfig,
              env: finalEnv,
              permission: claudePermission,
              mcpServers: mcpServersFiltered,
              isUsingOllama,
              canUseTool: createClaudeAgentSdkToolPermissionHandler({
                isUsingOllama,
                permissionPolicy,
                guardedContract,
                getGuardedContract: (contractId) =>
                  getActiveGuardedContract(contractId),
                recordGuardEvent: (event) => {
                  guardEvents.push(event)
                },
                emit: safeEmit,
                subChatId: input.subChatId,
                pendingToolApprovals: getClaudePendingToolApprovalStore(),
                parts,
              }),
              stderr: (data: string) => {
                stderrLines.push(data)
                if (isUsingOllama) {
                  console.error("[Ollama stderr]", data)
                } else {
                  console.error("[claude stderr]", data)
                }
              },
              pathToClaudeCodeExecutable: claudeBinaryPath,
              resumeSessionAt:
                shouldForkResume && forkResumeAtUuid && !isUsingOllama
                  ? forkResumeAtUuid
                  : resumeAtUuid && !isUsingOllama
                    ? resumeAtUuid
                    : null,
              forkSession: Boolean(
                shouldForkResume && forkResumeAtUuid && !isUsingOllama,
              ),
              model: resolvedModel,
              maxThinkingTokens: input.maxThinkingTokens,
            })

            // Auto-retry for transient API errors (e.g., false-positive USAGE_POLICY_VIOLATION)
            let policyRetryCount = 0
            let policyRetryNeeded = false
            let messageCount = 0
            let pendingFinishChunk: UIMessageChunk | null = null

            const claudeAdapter = createClaudeAgentSdkAdapter({
              query: claudeQuery,
              queryOptions,
              consumeStream: async ({ stream }) => {
              let firstMessageReceived = false
              // Track last assistant message UUID for rollback support
              // Only assigned to metadata AFTER the stream completes (not during generation)
              let lastAssistantUuid: string | null = null
              const streamIterationStart = Date.now()

              // Plan mode: track ExitPlanMode to stop after plan is complete
              let exitPlanModeToolCallId: string | null = null

              if (isUsingOllama) {
                logClaudeOllamaStreamStart({
                  model: finalCustomConfig?.model,
                  baseUrl: finalCustomConfig?.baseUrl,
                  prompt: input.prompt,
                  cwd: runtimeCwd,
                })
              }

              try {
                for await (const msg of stream) {
                  if (abortController.signal.aborted) {
                    if (isUsingOllama)
                      logClaudeOllamaStreamAborted()
                    break
                  }

                  messageCount++

                  // Extra logging for Ollama to diagnose issues
                  if (isUsingOllama) {
                    logClaudeOllamaMessage({
                      messageCount,
                      message: msg,
                    })
                  }

                  // Warn if SDK initialization is slow (MCP delay)
                  if (!firstMessageReceived) {
                    firstMessageReceived = true
                    const timeToFirstMessage = Date.now() - streamIterationStart
                    if (isUsingOllama) {
                      logClaudeOllamaFirstMessageLatency(timeToFirstMessage)
                    }
                    if (timeToFirstMessage > 5000) {
                      console.warn(
                        `[claude] SDK initialization took ${(timeToFirstMessage / 1000).toFixed(1)}s (MCP servers loading?)`,
                      )
                    }
                  }

                  // Log raw message for debugging
                  logRawClaudeMessage(input.chatId, msg)

                  // Check for error messages from SDK (error can be embedded in message payload!)
                  const msgAny = msg as any
                  if (msgAny.type === "error" || msgAny.error) {
                    const sdkError =
                      extractClaudeAgentSdkEmbeddedErrorText(msgAny)

                    logClaudeAgentSdkEmbeddedError({
                      sdkError,
                      message: msgAny,
                      subChatId: input.subChatId,
                      chatId: input.chatId,
                      cwd: runtimeCwd,
                      mode: input.mode,
                      hasCustomConfig: !!finalCustomConfig,
                      isUsingOllama,
                      model: resolvedModel,
                      hasOAuthToken: !!claudeCodeToken,
                      mcpServerNames: mcpServersFiltered
                        ? Object.keys(mcpServersFiltered)
                        : [],
                    })

                    const errorDiagnostic =
                      classifyClaudeAgentSdkEmbeddedError({
                        rawErrorCode: msgAny.error,
                        sdkError,
                        usesApiKeyAuth: Boolean(
                          finalCustomConfig || hasExistingApiConfig,
                        ),
                        policyRetryCount,
                        maxPolicyRetries: CLAUDE_MAX_POLICY_RETRIES,
                        aborted: abortController.signal.aborted,
                      })
                    const rawErrorCode = errorDiagnostic.rawErrorCode
                    const errorCategory = errorDiagnostic.category
                    const errorContext = errorDiagnostic.context

                    // Auto-retry on false-positive policy violations (gateway-level rejections)
                    if (errorDiagnostic.shouldRetryPolicy) {
                      policyRetryCount++
                      policyRetryNeeded = true
                      console.log(
                        `[claude] USAGE_POLICY_VIOLATION - silent retry (attempt ${policyRetryCount}/${CLAUDE_MAX_POLICY_RETRIES})`,
                      )
                      break // break for-await loop to retry
                    }

                    // Emit auth-error for authentication failures, regular error otherwise
                    if (errorDiagnostic.shouldEmitAuthError) {
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

                    console.log(
                      `[SD] M:END sub=${subId} reason=sdk_error cat=${errorCategory} n=${chunkCount}`,
                    )
                    logClaudeAgentSdkErrorDetails({
                      errorCategory,
                      errorContext,
                      rawErrorCode,
                      message: msgAny,
                    })
                    safeEmit({ type: "finish" } as UIMessageChunk)
                    safeComplete()
                    return {
                      status: "failed" as const,
                      error: {
                        message: errorContext,
                        code: errorCategory,
                      },
                    }
                  }

                  const trackedMessageMetadata =
                    trackClaudeAgentSdkMessageMetadata({
                      message: msgAny,
                      state: {
                        metadata,
                        currentSessionId,
                        lastAssistantUuid,
                      },
                      historyEnabled,
                      aborted: abortController.signal.aborted,
                    })
                  metadata = trackedMessageMetadata.metadata
                  currentSessionId = trackedMessageMetadata.currentSessionId
                  lastAssistantUuid =
                    trackedMessageMetadata.lastAssistantUuid

                  // Transform and emit + accumulate
                  for (const chunk of transform(msg)) {
                    chunkCount++
                    lastChunkType = chunk.type

                    const processedChunk = processClaudeAgentSdkUiChunk({
                      chunk,
                      state: {
                        metadata,
                        currentText,
                        pendingFinishChunk,
                        exitPlanModeToolCallId,
                      },
                      parts,
                      mode: input.mode,
                      subId,
                      subChatId: input.subChatId,
                      chunkCount,
                      emit: safeEmit,
                      notifyFileChanged: ({ filePath, type, subChatId }) => {
                        const windows = BrowserWindow.getAllWindows()
                        for (const win of windows) {
                          win.webContents.send("file-changed", {
                            filePath,
                            type,
                            subChatId,
                          })
                        }
                      },
                    })
                    metadata = processedChunk.metadata
                    currentText = processedChunk.currentText
                    pendingFinishChunk = processedChunk.pendingFinishChunk
                    exitPlanModeToolCallId =
                      processedChunk.exitPlanModeToolCallId

                    if (processedChunk.emitClosed) {
                      break
                    }
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
                  logClaudeOllamaStreamComplete({
                    messageCount,
                    durationMs: streamDuration,
                    chunkCount,
                  })
                }

                if (messageCount === 0) {
                  console.error(
                    `[claude] Stream yielded no messages - model not responding`,
                  )
                  if (isUsingOllama) {
                    logClaudeOllamaEmptyStreamDiagnosis(finalCustomConfig?.model)
                  }
                } else if (messageCount === 1 && isUsingOllama) {
                  logClaudeOllamaSingleMessageWarning()
                }
              } catch (streamError) {
                // This catches errors during streaming (like process exit)
                const err = streamError as Error
                const stderrOutput = stderrLines.join("\n")

                if (isUsingOllama) {
                  logClaudeOllamaStreamError({
                    error: err,
                    messageCount,
                    stderrOutput,
                  })
                }

                const streamDiagnostic = classifyClaudeAgentSdkStreamError({
                  error: err,
                  stderrOutput,
                })
                const errorContext = streamDiagnostic.context
                const errorCategory = streamDiagnostic.category

                if (streamDiagnostic.isSessionNotFound) {
                  // Clear the invalid session ID from database so next attempt starts fresh
                  console.log(
                    `[claude] Session not found - clearing invalid sessionId from database`,
                  )
                  db.update(subChats)
                    .set({ sessionId: null })
                    .where(eq(subChats.id, input.subChatId))
                    .run()
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
                      cwd: runtimeCwd,
                      mode: input.mode,
                      stderr: stderrOutput || "(no stderr captured)",
                    },
                  } as UIMessageChunk)
                }

                // ALWAYS save accumulated parts before returning (even on abort/error)
                console.log(
                  `[SD] M:CATCH_SAVE sub=${subId} aborted=${abortController.signal.aborted} parts=${parts.length}`,
                )
                currentText = flushClaudeAgentSdkTextAccumulator({
                  currentText,
                  parts,
                })
                metadata = await finalizeGuardMetadata(metadata, {
                  failed: !abortController.signal.aborted,
                  stopped: abortController.signal.aborted,
                })
                if (parts.length > 0) {
                  const assistantMessage = {
                    id: crypto.randomUUID(),
                    role: "assistant",
                    createdAt: new Date().toISOString(),
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
                  if (historyEnabled && metadata.sdkMessageUuid && runtimeCwd) {
                    await createRollbackStash(
                      runtimeCwd,
                      metadata.sdkMessageUuid,
                    )
                  }
                }

                console.log(
                  `[SD] M:END sub=${subId} reason=stream_error cat=${errorCategory} n=${chunkCount} last=${lastChunkType}`,
                )
                safeEmit({ type: "finish" } as UIMessageChunk)
                safeComplete()
                return {
                  status: "failed" as const,
                  error: {
                    message: errorContext,
                    code: errorCategory,
                  },
                }
              }

              return {
                status: "succeeded" as const,
                sessionId: metadata.sessionId,
              }
              },
            })

            // eslint-disable-next-line no-constant-condition
            while (true) {
              policyRetryNeeded = false
              messageCount = 0
              pendingFinishChunk = null

              // 5. Run Claude Agent SDK through the desktop adapter boundary
              try {
                const adapterResult =
                  await claudeAdapter.run(desktopRunRequest)
                if (adapterResult.status === "failed") {
                  return
                }
              } catch (queryError) {
                console.error(
                  "[CLAUDE] ✗ Failed to create SDK query:",
                  queryError,
                )
                emitError(queryError, "Failed to start Claude query")
                console.log(
                  `[SD] M:END sub=${subId} reason=query_error n=${chunkCount}`,
                )
                safeEmit({ type: "finish" } as UIMessageChunk)
                safeComplete()
                return
              }

              // Retry if policy violation detected (transient false positive)
              // Escalating delay: 3s first retry, 6s second retry
              if (policyRetryNeeded) {
                const delayMs = getClaudePolicyRetryDelayMs(policyRetryCount)
                console.log(
                  `[claude] Policy retry ${policyRetryCount}/${CLAUDE_MAX_POLICY_RETRIES} - waiting ${delayMs / 1000}s`,
                )
                await new Promise((resolve) => setTimeout(resolve, delayMs))
                continue
              }
              break
            } // end policyRetryLoop

            // 6. Check if we got any response
            if (messageCount === 0 && !abortController.signal.aborted) {
              emitError(
                new Error("No response received from Claude"),
                "Empty response",
              )
              console.log(
                `[SD] M:END sub=${subId} reason=no_response n=${chunkCount}`,
              )
              safeEmit({ type: "finish" } as UIMessageChunk)
              safeComplete()
              return
            }

            // 7. Save final messages to DB
            // ALWAYS save accumulated parts, even on abort (so user sees partial responses after reload)
            console.log(
              `[SD] M:SAVE sub=${subId} aborted=${abortController.signal.aborted} parts=${parts.length}`,
            )

            // Flush any remaining text
            currentText = flushClaudeAgentSdkTextAccumulator({
              currentText,
              parts,
            })

            metadata = await finalizeGuardMetadata(metadata, {
              stopped: abortController.signal.aborted,
            })

            const savedSessionId = metadata.sessionId

            if (parts.length > 0) {
              const assistantMessage = {
                id: crypto.randomUUID(),
                role: "assistant",
                createdAt: new Date().toISOString(),
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
            if (historyEnabled && metadata.sdkMessageUuid && runtimeCwd) {
              await createRollbackStash(runtimeCwd, metadata.sdkMessageUuid)
            }

            const duration = ((Date.now() - streamStart) / 1000).toFixed(1)
            console.log(
              `[SD] M:END sub=${subId} reason=ok n=${chunkCount} last=${lastChunkType} t=${duration}s`,
            )
            desktopJobReachedNaturalFinish =
              !abortController.signal.aborted && !desktopJobSawError
            if (pendingFinishChunk) {
              safeEmit(pendingFinishChunk)
            } else {
              // Keep protocol invariant for consumers that wait for finish.
              safeEmit({ type: "finish" } as UIMessageChunk)
            }
            safeComplete()
          } catch (error) {
            const duration = ((Date.now() - streamStart) / 1000).toFixed(1)
            console.log(
              `[SD] M:END sub=${subId} reason=unexpected_error n=${chunkCount} t=${duration}s`,
            )
            emitError(error, "Unexpected error")
            safeEmit({ type: "finish" } as UIMessageChunk)
            safeComplete()
          } finally {
            if (desktopJobId) {
              const jobDb = desktopJobDb ?? getDatabase()
              const wasCanceled =
                abortController.signal.aborted && !desktopJobReachedNaturalFinish
              const status = wasCanceled
                ? "canceled"
                : desktopJobSawError
                  ? "failed"
                  : "succeeded"
              completeDesktopAgentJobSafely(jobDb, {
                jobId: desktopJobId,
                status,
                exitCode: status === "succeeded" ? 0 : status === "canceled" ? 5 : 1,
                errorCode:
                  status === "failed"
                    ? "desktop_chat_failed"
                    : status === "canceled"
                      ? "desktop_chat_canceled"
                      : null,
                errorMessage:
                  status === "failed"
                    ? "Desktop Claude chat stream failed."
                    : status === "canceled"
                      ? "Desktop Claude chat stream was canceled."
                      : null,
                result: {
                  runtime: "claude-code",
                  subChatId: input.subChatId,
                  chatId: input.chatId,
                },
              })
              unregisterActiveDesktopAgentJob(desktopJobId)
            }
            deleteActiveClaudeSessionIfController(
              input.subChatId,
              abortController,
            )
            if (guardedContract) {
              deleteActiveGuardedContract(guardedContract.id)
            }
          }
        })()

        // Cleanup on unsubscribe
        return () => {
          console.log(
            `[SD] M:CLEANUP sub=${subId} sessionId=${currentSessionId || "none"}`,
          )
          isObservableActive = false // Prevent emit after unsubscribe
          abortController.abort()
          const ownsActiveSession = deleteActiveClaudeSessionIfController(
            input.subChatId,
            abortController,
          )
          if (guardedContract) {
            deleteActiveGuardedContract(guardedContract.id)
          }
          if (ownsActiveSession) {
            clearClaudePendingToolApprovals("Session ended.", input.subChatId)
          }

          // Clear streamId since we're no longer streaming.
          // sessionId is NOT saved here — the save block in the async function
          // handles it (saves on normal completion, clears on abort). This avoids
          // a redundant DB write that the cancel mutation would then overwrite.
          const db = getDatabase()
          if (desktopJobId && !desktopJobSawError && !desktopJobReachedNaturalFinish) {
            try {
              requestCancelDesktopAgentJob(db, desktopJobId, "desktop-chat")
            } catch {
              // Job may already be terminal if cleanup raced with stream finish.
            }
          }
          if (ownsActiveSession) {
            db.update(subChats)
              .set({ streamId: null })
              .where(eq(subChats.id, input.subChatId))
              .run()
          }
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
        const dirConfig = await readClaudeDirConfig()

        // Merged global servers from all user-level sources
        const globalServers = await getMergedGlobalMcpServers(config, dirConfig)

        // Per-project servers from config files
        const projectConfigServers = await getMergedLocalProjectMcpServers(input.projectPath, config, dirConfig)

        // .mcp.json from project root
        const projectMcpJsonServers = await readProjectMcpJsonCached(input.projectPath)

        // Merge: project config > .mcp.json > global
        const merged = {
          ...globalServers,
          ...projectMcpJsonServers,
          ...projectConfigServers,
        }

        // Add plugin MCP servers (enabled + approved only)
        const [enabledPluginSources, pluginMcpConfigs, approvedServers] =
          await Promise.all([
            getEnabledPlugins(),
            discoverPluginMcpServers(),
            getApprovedPluginMcpServers(),
          ])

        for (const pluginConfig of pluginMcpConfigs) {
          if (
            !enabledPluginSources.includes(pluginConfig.pluginSource) ||
            !pluginConfig.reviewGate.canUseMcp
          )
            continue
          for (const [name, serverConfig] of Object.entries(
            pluginConfig.mcpServers,
          )) {
            if (!merged[name]) {
              const identifier = pluginConfig.approvalIdentifiers[name]
              if (identifier && approvedServers.includes(identifier)) {
                merged[name] = getEffectivePluginMcpServerConfig({
                  claudeConfig: config,
                  pluginConfig,
                  serverName: name,
                  serverConfig,
                })
              }
            }
          }
        }

        // Convert to array format - determine status from config (no caching)
        const mcpServers = Object.entries(merged).map(
          ([name, serverConfig]) => {
            const configObj = sanitizeMcpConfigForRenderer(
              serverConfig as Record<string, unknown>,
            )
            const status = getServerStatusFromConfig(serverConfig)
            const hasUrl = !!serverConfig.url

            return {
              name,
              status,
              config: { ...configObj, _hasUrl: hasUrl },
            }
          },
        )

        return { mcpServers, projectPath: input.projectPath }
      } catch (error) {
        console.error("[getMcpConfig] Error reading config:", error)
        return {
          mcpServers: [],
          projectPath: input.projectPath,
          error: String(error),
        }
      }
    }),

  /**
   * Get ALL MCP servers configuration (global + all projects)
   * Returns grouped data for display in settings
   * Also populates the workingMcpServers cache
   */
  getAllMcpConfig: publicProcedure.query(getAllMcpConfigHandler),

  refreshMcpConfig: publicProcedure.mutation(() => {
    workingMcpServers.clear()
    mcpConfigCache.clear()
    projectMcpJsonCache.clear()
    return { success: true }
  }),

  /**
   * Cancel active session
   */
  cancel: publicProcedure
    .input(z.object({ subChatId: z.string(), runId: z.string().optional() }))
    .mutation(({ input }) => {
      const session = getActiveClaudeSession(input.subChatId)
      if (session && input.runId && session.runId !== input.runId) {
        return { cancelled: false, ignoredStale: true }
      }
      if (session) {
        session.controller.abort()
        deleteActiveClaudeSession(input.subChatId)
        clearClaudePendingToolApprovals("Session cancelled.", input.subChatId)
      }

      return { cancelled: !!session, ignoredStale: false }
    }),

  /**
   * Check if session is active
   */
  isActive: publicProcedure
    .input(z.object({ subChatId: z.string() }))
    .query(({ input }) => hasActiveClaudeSession(input.subChatId)),
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
      return {
        ok: resolveClaudePendingToolApproval({
          toolUseId: input.toolUseId,
          decision: {
            approved: input.approved,
            message: input.message,
            updatedInput: input.updatedInput,
          },
        }),
      }
    }),
  respondScopeExpansion: publicProcedure
    .input(
      z.object({
        contractId: z.string(),
        toolUseId: z.string(),
        approved: z.boolean(),
        path: z.string().optional(),
        paths: z.array(z.string()).optional(),
        reason: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return applyActiveGuardedScopeExpansion(input)
    }),

  /**
   * Start MCP OAuth flow for a server
   * Fetches OAuth metadata internally when needed
   */
  startMcpOAuth: publicProcedure
    .input(
      z.object({
        serverName: z.string(),
        projectPath: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const serverName = normalizeMcpServerName(input.serverName)
      const projectPath = resolveMcpProjectPathForMutation({
        scope: "project",
        projectPath: input.projectPath,
      })
      if (!projectPath) {
        throw new Error("Project path required for MCP OAuth")
      }
      return startMcpOAuth(serverName, projectPath)
    }),

  /**
   * Get MCP auth status for a server
   */
  getMcpAuthStatus: publicProcedure
    .input(
      z.object({
        serverName: z.string(),
        projectPath: z.string(),
      }),
    )
    .query(async ({ input }) => {
      return getMcpAuthStatus(input.serverName, input.projectPath)
    }),

  addMcpServer: publicProcedure
    .input(
      z.object({
        name: z
          .string()
          .min(1)
          .regex(
            /^[a-zA-Z0-9_-]+$/,
            "Name must contain only letters, numbers, underscores, and hyphens",
          ),
        scope: z.enum(["global", "project"]),
        projectPath: z.string().optional(),
        transport: z.enum(["stdio", "http"]),
        command: z.string().optional(),
        args: z.array(z.string()).optional(),
        env: z.record(z.string(), z.string()).optional(),
        url: z.string().url().optional(),
        authType: z.enum(["none", "oauth", "bearer"]).optional(),
        bearerToken: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const serverName = normalizeMcpServerName(input.name)
      const projectPath = resolveMcpProjectPathForMutation(input)

      if (input.transport === "stdio" && !input.command?.trim()) {
        throw new Error("Command is required for stdio servers")
      }
      if (input.transport === "http" && !input.url?.trim()) {
        throw new Error("URL is required for HTTP servers")
      }

      const serverConfig: McpServerConfig = {}
      if (input.transport === "stdio") {
        serverConfig.command = input.command!.trim()
        if (input.args && input.args.length > 0) {
          serverConfig.args = input.args
        }
        if (input.env && Object.keys(input.env).length > 0) {
          serverConfig.env = input.env
        }
      } else {
        serverConfig.url = input.url!.trim()
        if (input.authType) {
          serverConfig.authType = input.authType
        }
        if (input.bearerToken) {
          serverConfig.headers = {
            Authorization: `Bearer ${input.bearerToken}`,
          }
        }
      }

      await updateClaudeConfigAtomic((existingConfig) => {
        // Check existence inside the locked read-modify-write cycle.
        if (projectPath) {
          if (existingConfig.projects?.[projectPath]?.mcpServers?.[serverName]) {
            throw new Error(
              `Server "${serverName}" already exists in this project`,
            )
          }
        } else {
          if (existingConfig.mcpServers?.[serverName]) {
            throw new Error(`Server "${serverName}" already exists`)
          }
        }

        return updateMcpServerConfig(
          existingConfig,
          projectPath,
          serverName,
          serverConfig,
        )
      })

      return { success: true, name: serverName }
    }),

  updateMcpServer: publicProcedure
    .input(
      z.object({
        name: z.string(),
        scope: z.enum(["global", "project"]),
        projectPath: z.string().optional(),
        newName: z
          .string()
          .regex(/^[a-zA-Z0-9_-]+$/)
          .optional(),
        command: z.string().optional(),
        args: z.array(z.string()).optional(),
        env: z.record(z.string(), z.string()).optional(),
        url: z.string().url().optional(),
        authType: z.enum(["none", "oauth", "bearer"]).optional(),
        bearerToken: z.string().optional(),
        disabled: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const serverName = normalizeMcpServerName(input.name)
      const projectPath = resolveMcpProjectPathForMutation(input)
      const newName = input.newName
        ? normalizeMcpServerName(input.newName)
        : undefined
      let returnedName = serverName

      await updateClaudeConfigAtomic((config) => {
        // Check server exists inside the locked read-modify-write cycle.
        const servers = getMcpServersForScope(config, projectPath)
        if (!servers?.[serverName]) {
          throw new Error(`Server "${serverName}" not found`)
        }

        const existing = servers[serverName]

        // Handle rename: create new, remove old
        if (newName && newName !== serverName) {
          if (servers[newName]) {
            throw new Error(`Server "${newName}" already exists`)
          }
          returnedName = newName
          const updated = removeMcpServerConfig(
            config,
            projectPath,
            serverName,
          )
          return updateMcpServerConfig(updated, projectPath, newName, existing)
        }

        // Build update object from provided fields
        const update: Partial<McpServerConfig> = {}
        if (input.command !== undefined) update.command = input.command
        if (input.args !== undefined) update.args = input.args
        if (input.env !== undefined) update.env = input.env
        if (input.url !== undefined) update.url = input.url
        if (input.disabled !== undefined) update.disabled = input.disabled

        // Handle bearer token
        if (input.bearerToken) {
          update.authType = "bearer"
          update.headers = { Authorization: `Bearer ${input.bearerToken}` }
        }

        // Handle authType changes
        if (input.authType) {
          update.authType = input.authType
          if (input.authType === "none") {
            // Clear auth-related fields
            update.headers = undefined
            update._oauth = undefined
          }
        }

        const merged = { ...existing, ...update }
        return updateMcpServerConfig(config, projectPath, serverName, merged)
      })

      return { success: true, name: returnedName }
    }),

  removeMcpServer: publicProcedure
    .input(
      z.object({
        name: z.string(),
        scope: z.enum(["global", "project"]),
        projectPath: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const serverName = normalizeMcpServerName(input.name)
      const projectPath = resolveMcpProjectPathForMutation(input)

      await updateClaudeConfigAtomic((config) => {
        // Check server exists inside the locked read-modify-write cycle.
        const servers = getMcpServersForScope(config, projectPath)
        if (!servers?.[serverName]) {
          throw new Error(`Server "${serverName}" not found`)
        }

        return removeMcpServerConfig(config, projectPath, serverName)
      })

      return { success: true }
    }),

  setMcpBearerToken: publicProcedure
    .input(
      z.object({
        name: z.string(),
        scope: z.enum(["global", "project"]),
        projectPath: z.string().optional(),
        token: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const serverName = normalizeMcpServerName(input.name)
      const projectPath = resolveMcpProjectPathForMutation(input)

      await updateClaudeConfigAtomic((config) => {
        // Check server exists inside the locked read-modify-write cycle.
        const servers = getMcpServersForScope(config, projectPath)
        if (!servers?.[serverName]) {
          throw new Error(`Server "${serverName}" not found`)
        }

        const existing = servers[serverName]
        const updated: McpServerConfig = {
          ...existing,
          authType: "bearer",
          headers: { Authorization: `Bearer ${input.token}` },
        }

        return updateMcpServerConfig(config, projectPath, serverName, updated)
      })

      return { success: true }
    }),

  getPendingPluginMcpApprovals: publicProcedure
    .input(z.object({ projectPath: z.string().optional() }))
    .query(async ({ input }) => {
      const [enabledPluginSources, pluginMcpConfigs, approvedServers] =
        await Promise.all([
          getEnabledPlugins(),
          discoverPluginMcpServers(),
          getApprovedPluginMcpServers(),
        ])

      // Read global/project servers from all sources for conflict check
      const config = await readClaudeConfig()
      const dirConfig = await readClaudeDirConfig()
      const globalServers = await getMergedGlobalMcpServers(config, dirConfig)
      let projectServers: Record<string, McpServerConfig> = {}
      if (input.projectPath) {
        const projectConfigServers = await getMergedLocalProjectMcpServers(input.projectPath, config, dirConfig)
        const projectMcpJsonServers = await readProjectMcpJsonCached(input.projectPath)
        projectServers = { ...projectMcpJsonServers, ...projectConfigServers }
      }

      const pending: Array<{
        pluginSource: string
        serverName: string
        identifier: string
        config: Record<string, unknown>
        gateStatus?: string
        gateReasons?: string[]
      }> = []

      for (const pluginConfig of pluginMcpConfigs) {
        if (!enabledPluginSources.includes(pluginConfig.pluginSource)) continue

        for (const [name, serverConfig] of Object.entries(
          pluginConfig.mcpServers,
        )) {
          const identifier = pluginConfig.approvalIdentifiers[name]
          const isReviewBlocked = !pluginConfig.reviewGate.canUseMcp
          if (
            identifier &&
            (isReviewBlocked || !approvedServers.includes(identifier)) &&
            !globalServers[name] &&
            !projectServers[name]
          ) {
            pending.push({
              pluginSource: pluginConfig.pluginSource,
              serverName: name,
              identifier,
              gateStatus: pluginConfig.reviewGate.status,
              gateReasons: pluginConfig.reviewGate.reasons,
              config: sanitizeMcpConfigForRenderer(
                serverConfig as Record<string, unknown>,
              ),
            })
          }
        }
      }

      return { pending }
    }),
})

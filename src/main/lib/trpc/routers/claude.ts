import { observable } from "@trpc/server/observable"
import { eq } from "drizzle-orm"
import * as fs from "fs/promises"
import * as os from "os"
import path from "path"
import { z } from "zod"
import type { UIMessageChunk } from "../../claude"
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
import { chats, getDatabase, projects as projectsTable, subChats } from "../../db"
import {
  clearClaudeAgentSdkQueryCache,
} from "../../claude/agent-sdk-query-loader"
import {
  clearClaudeAgentSdkIsolatedConfigDirCache,
} from "../../claude/agent-sdk-config-dir"
import {
  createClaudeAgentSdkDesktopRunEnvelope,
} from "../../claude/agent-sdk-desktop-run-envelope"
import {
  prepareClaudeAgentSdkDesktopRunControls,
} from "../../claude/agent-sdk-desktop-run-controls"
import {
  prepareClaudeAgentSdkDesktopRunInputs,
} from "../../claude/agent-sdk-desktop-run-inputs"
import {
  runClaudeAgentSdkDesktopRuntimeWithMcpReadiness,
  type ClaudeAgentSdkDesktopRunMcpReadinessStatus,
} from "../../claude/agent-sdk-desktop-run-runtime"
import {
  prepareClaudeAgentSdkDesktopRunStartup,
} from "../../claude/agent-sdk-desktop-run-startup"
import {
  superviseClaudeAgentSdkDesktopRun,
} from "../../claude/agent-sdk-desktop-run-supervision"
import {
  abortClaudeAgentSdkDesktopRunRequest,
  cancelClaudeAgentSdkActiveDesktopRun,
  cleanupClaudeAgentSdkDesktopRunSubscription,
} from "../../claude/agent-sdk-desktop-run-cleanup"
import {
  hasActiveClaudeSession,
} from "../../claude/active-sessions"
import {
  resolveClaudePendingToolApproval,
} from "../../claude/tool-approvals"
import {
  imageAttachmentSchema,
  longTextAttachmentSchema,
} from "../../claude/chat-input-schema"
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
import { publicProcedure, router } from "../index"
import {
  agentScopeContractInputSchema,
  applyActiveGuardedScopeExpansion,
  type GuardedGitStatusSnapshot,
  type ValidatedAgentScopeContract,
} from "../../agent-guard"
import { sanitizeMcpConfigForRenderer } from "../../../../shared/mcp-import-preview"
import {
  getApprovedPluginMcpServers,
  getEnabledPlugins,
} from "./claude-settings"

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
  clearClaudeAgentSdkIsolatedConfigDirCache()
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
        const {
          abortController,
          streamId,
          activeRunId,
          subId,
          streamStart,
          streamState,
          desktopRunState,
          emit: safeEmit,
          complete: safeComplete,
          emitError,
          emitPreflightBlocker,
        } = createClaudeAgentSdkDesktopRunEnvelope({
          subChatId: input.subChatId,
          requestedRunId: input.runId,
          createId: () => crypto.randomUUID(),
          cwd: input.cwd,
          mode: input.mode,
          emitNext: (chunk) => {
            emit.next(chunk)
          },
          emitComplete: () => {
            emit.complete()
          },
        })

        let guardedContract: ValidatedAgentScopeContract | null = null
        let guardedPreRunStatus: GuardedGitStatusSnapshot | null = null

        void superviseClaudeAgentSdkDesktopRun({
          chatId: input.chatId,
          subChatId: input.subChatId,
          abortController,
          getGuardedContract: () => guardedContract,
          getDb: getDatabase,
          desktopRunState,
          streamState,
          subId,
          streamStart,
          emitError,
          emit: safeEmit,
          complete: safeComplete,
          run: async () => {
            const db = getDatabase()
            desktopRunState.setDb(db)
            const runControls = await prepareClaudeAgentSdkDesktopRunControls({
              db,
              chatId: input.chatId,
              subChatId: input.subChatId,
              cwd: input.cwd,
              projectPath: input.projectPath,
              mode: input.mode,
              scopeContract: input.scopeContract,
              runId: input.runId,
              fallbackRunId: streamId,
              emitError,
              emit: safeEmit,
              complete: safeComplete,
            })
            if (!runControls.ok) {
              return
            }
            const verifiedRunContext = runControls.preflight
            const runtimeCwd = runControls.runtimeCwd
            guardedContract = runControls.guardedContract
            guardedPreRunStatus = runControls.guardedPreRunStatus
            const permissionPolicy = runControls.permissionPolicy

            const runInputs = await prepareClaudeAgentSdkDesktopRunInputs({
              db,
              subChatId: input.subChatId,
              streamId,
              prompt: input.prompt,
              images: input.images,
              longTextAttachments: input.longTextAttachments,
              historyEnabled: input.historyEnabled,
              emitPreflightBlocker,
              createId: () => crypto.randomUUID(),
            })
            if (!runInputs.ok) {
              return
            }
            const {
              historyEnabled,
              resolvedImages,
              chatHistory,
            } = runInputs
            const {
              existingMessages,
              existingSessionId,
              resumeAtUuid,
              shouldForkResume,
              forkResumeAtUuid,
              messagesToSave,
            } = chatHistory

            const runStartup = await prepareClaudeAgentSdkDesktopRunStartup({
              db,
              mode: input.mode,
              chatId: input.chatId,
              subChatId: input.subChatId,
              cwd: runtimeCwd,
              prompt: input.prompt,
              runId: activeRunId,
              cancel: () => {
                abortClaudeAgentSdkDesktopRunRequest({
                  subChatId: input.subChatId,
                  abortController,
                })
              },
              streamId,
              preflight: verifiedRunContext,
              permissionPolicy,
              requestedModel: input.model,
              modelSource: input.modelSource,
              offlineModeEnabled: input.offlineModeEnabled ?? false,
              enableTasks: input.enableTasks ?? true,
              images: input.images,
              longTextAttachments: input.longTextAttachments,
              signal: abortController.signal,
              requestedSessionId: input.sessionId,
              existingSessionId,
              emitPreflightBlocker,
              desktopRunState,
            })
            if (!runStartup.ok) {
              return
            }
            const {
              desktopRunRequest,
              resumeSessionId,
              runtimeStartup,
              isolatedConfigReady,
              providerStartup: {
                claudeCodeToken,
                claudeCredentialMetadata,
                finalCustomConfig,
                isUsingOllama,
              },
            } = runStartup

            // MCP servers to pass to SDK (read from ~/.claude.json)
            let mcpServersForSdk: Record<string, any> | undefined
            let mcpReadinessStatus: ClaudeAgentSdkDesktopRunMcpReadinessStatus =
              isolatedConfigReady ? "ready" : "skipped"

            if (isolatedConfigReady) {
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
                mcpReadinessStatus = "skipped"
              }
            }

            const runtimeResult =
              await runClaudeAgentSdkDesktopRuntimeWithMcpReadiness({
                desktopRunRequest,
                mcpReadinessStatus,
                runtimeQuery: {
                  existingMessages,
                  rawMcpServers: mcpServersForSdk,
                  shouldForkResume,
                  forkResumeAtUuid,
                  resumeAtUuid,
                  maxThinkingTokens: input.maxThinkingTokens,
                  projectPath: input.projectPath,
                },
                runtimePrompt: {
                  images: resolvedImages,
                  longTextAttachments: input.longTextAttachments,
                },
                runtimeStartupDiagnostics: {
                  runtimeStartup,
                  resumeSessionId,
                  credentialMetadata: claudeCredentialMetadata,
                  existingSessionId,
                },
                streamState,
                desktopRunState,
                isUsingOllama,
                customConfig: finalCustomConfig,
                oauthToken: claudeCodeToken,
                historyEnabled,
                db,
                messagesToSave,
                guardedContract,
                guardedPreRunStatus,
                subId,
                emitError,
                emit: safeEmit,
                complete: safeComplete,
                streamStart,
              })
            if (runtimeResult.status === "failed") {
              return
            }
          },
        })

        // Cleanup on unsubscribe
        return () => {
          cleanupClaudeAgentSdkDesktopRunSubscription({
            subId,
            subChatId: input.subChatId,
            sessionId: streamState.currentSessionId,
            abortController,
            guardedContract,
            getDb: getDatabase,
            desktopRunState,
          })
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
      return cancelClaudeAgentSdkActiveDesktopRun(input)
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

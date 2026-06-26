import * as fs from "node:fs/promises"
import path from "node:path"
import { sanitizeMcpConfigForRenderer } from "../../../shared/mcp-import-preview"
import { clearClaudeAgentSdkIsolatedConfigDirCache } from "../claude/agent-sdk-config-dir"
import type { ClaudeAgentSdkDesktopRunMcpReadinessStatus } from "../claude/agent-sdk-desktop-run-runtime"
import type { ClaudeMcpRegistryVerificationTargets } from "../claude/agent-sdk-mcp-registry-verification"
import { clearClaudeAgentSdkQueryCache } from "../claude/agent-sdk-query-loader"
import type { PrepareClaudeAgentSdkMcpServersInput } from "../claude/agent-sdk-query-options"
import {
  type ClaudeConfig,
  GLOBAL_MCP_PATH,
  getClaudeConfigPath,
  getMatchingLocusPluginMcpServerConfig,
  getMergedGlobalMcpServers,
  getMergedLocalProjectMcpServers,
  type McpServerConfig,
  readClaudeConfig,
  readClaudeDirConfig,
  readProjectMcpJson,
  removeMcpServerConfig,
  resolveProjectPathFromWorktree,
  updateClaudeConfigAtomic,
  updateMcpServerConfig,
} from "../claude-config"
import { getDatabase, projects as projectsTable } from "../db"
import {
  ensureMcpTokensFresh,
  fetchMcpTools,
  fetchMcpToolsStdio,
  type McpToolInfo,
  getMcpAuthStatus as readMcpAuthStatus,
  startMcpOAuth as startMcpOAuthFlow,
} from "../mcp-auth"
import {
  getMcpRegistryVerificationKeyFromConfig,
  isMcpRegistryServerInactiveForRuntime,
  materializeMcpRegistryServerConfigForRuntime,
  resolveMcpRegistryRuntimeLocalStateFromConfig,
} from "../mcp-registry/secrets"
import { upsertMcpRegistryVerificationRecord } from "../mcp-registry/verification-state"
import { fetchOAuthMetadata, getMcpBaseUrl } from "../oauth"
import { discoverPluginMcpServers, type PluginMcpConfig } from "../plugins"
import {
  getApprovedPluginMcpServers,
  getEnabledPlugins,
} from "../trpc/routers/claude-settings"

type ClaudeMcpServersForSdk = PrepareClaudeAgentSdkMcpServersInput["mcpServers"]
type ClaudeMcpServerForSdk = NonNullable<ClaudeMcpServersForSdk>[string]

type ClaudeMcpServerForSettings = {
  name: string
  status: string
  tools: McpToolInfo[]
  needsAuth: boolean
  config: Record<string, unknown>
  isApproved?: boolean
}

export type ClaudeMcpRegistryCheckResult = {
  success: boolean
  runtime: "claude-code"
  serverName: string
  status: "ready-to-verify" | "failed-check"
  toolCount: number
  toolNames: string[]
  reason?: string
}

function classifyRegistryCheckFailure(input: {
  serverConfig: McpServerConfig
  error: unknown
}): string {
  const message =
    input.error instanceof Error ? input.error.message : String(input.error)
  if (!input.serverConfig.command && !input.serverConfig.url) {
    return `unsupported-adapter-field: ${message}`
  }
  if (input.serverConfig.command) {
    return `process-launch-failure: ${message}`
  }
  if (/auth|unauthori[sz]ed|forbidden|401|403/i.test(message)) {
    return `missing-auth: ${message}`
  }
  if (
    /connect|network|fetch|timeout|ECONN|ENOTFOUND|EAI_AGAIN/i.test(message)
  ) {
    return `connection-failure: ${message}`
  }
  return `tool-list-failure: ${message}`
}

const MCP_SERVER_NAME_REGEX = /^[a-zA-Z0-9_-]+$/

function getPluginGateMcpStatus(gate: { status: string }): string {
  if (gate.status === "safe-mode") return "blocked-safe-mode"
  if (gate.status === "review-required") return "pending-review"
  if (gate.status === "read-only") return "read-only"
  return "pending-approval"
}

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
    throw new Error(
      "Project-scoped MCP writes require a registered project path",
    )
  }

  return registeredProject.path
}

function getMcpServersForScope(
  config: ClaudeConfig,
  projectPath: string | null,
): Record<string, McpServerConfig> | undefined {
  return projectPath
    ? config.projects?.[projectPath]?.mcpServers
    : config.mcpServers
}

function assertWritableClaudeMcpConfig(config: McpServerConfig): void {
  const command =
    typeof config.command === "string" ? config.command.trim() : ""
  const url = typeof config.url === "string" ? config.url.trim() : ""
  if (!command && !url) {
    throw new Error("Claude MCP server config requires command or URL")
  }
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

const workingMcpServers = new Map<string, boolean>()

const GLOBAL_SCOPE = "__global__"
function mcpCacheKey(scope: string | null, serverName: string): string {
  return `${scope ?? GLOBAL_SCOPE}::${serverName}`
}

const mcpConfigCache = new Map<
  string,
  {
    config: ClaudeConfig | undefined
    mtime: number
  }
>()

const projectMcpJsonCache = new Map<
  string,
  {
    servers: Record<string, McpServerConfig>
    mtime: number
  }
>()

async function readProjectMcpJsonCached(
  projectPath: string,
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

export function refreshClaudeMcpConfig(): void {
  workingMcpServers.clear()
  mcpConfigCache.clear()
  projectMcpJsonCache.clear()
}

export function clearClaudeCaches(): void {
  clearClaudeAgentSdkQueryCache()
  clearClaudeAgentSdkIsolatedConfigDirCache()
  refreshClaudeMcpConfig()
  console.log("[claude] All caches cleared")
}

function getServerStatusFromConfig(serverConfig: McpServerConfig): string {
  const registryState = resolveMcpRegistryRuntimeLocalStateFromConfig({
    config: serverConfig,
  })
  if (registryState?.status === "ready-to-verify") {
    return "ready-to-verify"
  }
  if (registryState?.status === "failed-check") {
    return "failed"
  }
  if (registryState?.status === "verified-local") {
    return "connected"
  }
  if (
    serverConfig.disabled === true ||
    registryState?.status === "installed-needs-setup" ||
    isMcpRegistryServerInactiveForRuntime(serverConfig)
  ) {
    return "disabled"
  }

  const headers = serverConfig.headers as Record<string, string> | undefined
  const { _oauth: oauth, authType } = serverConfig

  if (authType === "none") {
    return "connected"
  }

  if (headers?.Authorization) {
    return "connected"
  }

  if (oauth?.hasTokens === true) {
    return "connected"
  }

  if (oauth?.accessToken && !headers?.Authorization) {
    return "needs-auth"
  }

  if (serverConfig.url && ["oauth", "bearer"].includes(authType ?? "")) {
    return "needs-auth"
  }

  return "connected"
}

function shouldIncludeClaudeMcpServerInSdk(
  serverConfig: McpServerConfig,
): boolean {
  return (
    serverConfig.disabled !== true &&
    !isMcpRegistryServerInactiveForRuntime(serverConfig)
  )
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === "string")
  )
}

function getClaudeSdkMcpCommonFields(
  serverConfig: McpServerConfig,
): Record<string, unknown> {
  const commonFields: Record<string, unknown> = {}
  if (typeof serverConfig.timeout === "number") {
    commonFields.timeout = serverConfig.timeout
  }
  if (typeof serverConfig.alwaysLoad === "boolean") {
    commonFields.alwaysLoad = serverConfig.alwaysLoad
  }
  if (Array.isArray(serverConfig.tools)) {
    commonFields.tools = serverConfig.tools
  }
  return commonFields
}

function resolveClaudeSdkRemoteMcpType(
  serverConfig: McpServerConfig,
): "http" | "sse" {
  const transportType =
    typeof serverConfig.transportType === "string"
      ? serverConfig.transportType.trim().toLowerCase()
      : ""
  const sdkType =
    typeof serverConfig.type === "string"
      ? serverConfig.type.trim().toLowerCase()
      : ""

  return transportType === "sse" || sdkType === "sse" ? "sse" : "http"
}

function materializeClaudeMcpServerConfigForSdk(
  serverConfig: McpServerConfig,
): ClaudeMcpServerForSdk | undefined {
  const runtimeConfig = materializeMcpRegistryServerConfigForRuntime(
    serverConfig,
    { stripMetadata: true },
  )
  const commonFields = getClaudeSdkMcpCommonFields(runtimeConfig)
  const url =
    typeof runtimeConfig.url === "string" ? runtimeConfig.url.trim() : ""

  if (url) {
    return {
      ...commonFields,
      type: resolveClaudeSdkRemoteMcpType(runtimeConfig),
      url,
      ...(isStringRecord(runtimeConfig.headers)
        ? { headers: runtimeConfig.headers }
        : {}),
    } as ClaudeMcpServerForSdk
  }

  const command =
    typeof runtimeConfig.command === "string"
      ? runtimeConfig.command.trim()
      : ""
  if (command) {
    return {
      ...commonFields,
      command,
      ...(Array.isArray(runtimeConfig.args)
        ? { args: runtimeConfig.args.filter((arg) => typeof arg === "string") }
        : {}),
      ...(isStringRecord(runtimeConfig.env) ? { env: runtimeConfig.env } : {}),
    } as ClaudeMcpServerForSdk
  }

  return undefined
}

function addClaudeMcpRegistryVerificationTarget(input: {
  targets: ClaudeMcpRegistryVerificationTargets
  serverName: string
  serverConfig: McpServerConfig
}): void {
  const verificationKey = getMcpRegistryVerificationKeyFromConfig(
    input.serverConfig,
    input.serverName,
  )
  if (verificationKey?.runtime !== "claude-code") return
  input.targets[input.serverName] = verificationKey
}

const MCP_FETCH_TIMEOUT_MS = 40_000

async function fetchToolsForServerStrict(
  serverConfig: McpServerConfig,
): Promise<McpToolInfo[]> {
  const timeoutPromise = new Promise<McpToolInfo[]>((_, reject) =>
    setTimeout(() => reject(new Error("Timeout")), MCP_FETCH_TIMEOUT_MS),
  )

  const fetchPromise = (async () => {
    const runtimeConfig = materializeMcpRegistryServerConfigForRuntime(
      serverConfig,
      { stripMetadata: true },
    )
    if (runtimeConfig.url) {
      const headers = runtimeConfig.headers as
        | Record<string, string>
        | undefined
      return await fetchMcpTools(runtimeConfig.url, headers)
    }

    const command = runtimeConfig.command
    if (command) {
      return await fetchMcpToolsStdio({
        command,
        args: runtimeConfig.args,
        env: runtimeConfig.env as Record<string, string> | undefined,
      })
    }

    throw new Error("Registry MCP server config has no command or URL")
  })()

  return await Promise.race([fetchPromise, timeoutPromise])
}

async function fetchToolsForServer(
  serverConfig: McpServerConfig,
): Promise<McpToolInfo[]> {
  try {
    return await fetchToolsForServerStrict(serverConfig)
  } catch {
    return []
  }
}

async function resolveServerAuthStatus(input: {
  serverConfig: McpServerConfig
  currentStatus: string
  tools: McpToolInfo[]
}): Promise<{
  status: string
  needsAuth: boolean
}> {
  let status = input.currentStatus
  let needsAuth = false
  const headers = input.serverConfig.headers as
    | Record<string, string>
    | undefined

  if (input.tools.length > 0) {
    return { status: "connected", needsAuth }
  }

  if (input.serverConfig.url) {
    try {
      const baseUrl = getMcpBaseUrl(input.serverConfig.url)
      const metadata = await fetchOAuthMetadata(baseUrl)
      needsAuth = !!metadata && !!metadata.authorization_endpoint
    } catch {
      // If probe fails, assume no auth needed.
    }
  } else if (
    input.serverConfig.authType === "oauth" ||
    input.serverConfig.authType === "bearer"
  ) {
    needsAuth = true
  }

  status = needsAuth && !headers?.Authorization ? "needs-auth" : "failed"
  return { status, needsAuth }
}

async function convertServersForSettings(
  servers: Record<string, McpServerConfig> | undefined,
  scope: string | null,
): Promise<ClaudeMcpServerForSettings[]> {
  if (!servers) return []

  return Promise.all(
    Object.entries(servers).map(async ([name, serverConfig]) => {
      const configObj = sanitizeMcpConfigForRenderer(
        serverConfig as Record<string, unknown>,
      )
      let status = getServerStatusFromConfig(serverConfig)
      let tools: McpToolInfo[] = []

      try {
        tools = await fetchToolsForServer(serverConfig)
      } catch (error) {
        console.error(`[MCP] Failed to fetch tools for ${name}:`, error)
      }

      const cacheKey = mcpCacheKey(scope, name)
      if (tools.length > 0) {
        workingMcpServers.set(cacheKey, true)
      } else {
        workingMcpServers.set(cacheKey, false)
      }

      const authStatus = await resolveServerAuthStatus({
        serverConfig,
        currentStatus: status,
        tools,
      })
      status = authStatus.status

      return {
        name,
        status,
        tools,
        needsAuth: authStatus.needsAuth,
        config: configObj,
      }
    }),
  )
}

export async function getAllMcpConfigHandler() {
  try {
    const totalStart = Date.now()

    workingMcpServers.clear()

    const config = await readClaudeConfig()

    const groupTasks: Array<{
      groupName: string
      projectPath: string | null
      promise: Promise<{
        mcpServers: ClaudeMcpServerForSettings[]
        duration: number
      }>
    }> = []

    let claudeDirConfig: ClaudeConfig = {}
    try {
      claudeDirConfig = await readClaudeDirConfig()
    } catch {
      // ignore
    }

    const mergedGlobalServers = await getMergedGlobalMcpServers(
      config,
      claudeDirConfig,
    )
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
          const mcpServers = await convertServersForSettings(freshServers, null)
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

    const allProjectPaths = new Set<string>()
    if (config.projects) {
      for (const p of Object.keys(config.projects)) allProjectPaths.add(p)
    }
    if (claudeDirConfig.projects) {
      for (const p of Object.keys(claudeDirConfig.projects))
        allProjectPaths.add(p)
    }

    for (const projectPath of allProjectPaths) {
      const mergedProjectServers = await getMergedLocalProjectMcpServers(
        projectPath,
        config,
        claudeDirConfig,
      )

      const projectMcpJsonServers = await readProjectMcpJsonCached(projectPath)
      const allProjectServers = {
        ...projectMcpJsonServers,
        ...mergedProjectServers,
      }

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
            const mcpServers = await convertServersForSettings(
              freshServers,
              projectPath,
            )
            return { mcpServers, duration: Date.now() - start }
          })(),
        })
      }
    }

    try {
      const db = getDatabase()
      const dbProjects = db
        .select({ path: projectsTable.path })
        .from(projectsTable)
        .all()
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
              const mcpServers = await convertServersForSettings(
                mcpJsonServers,
                proj.path,
              )
              return { mcpServers, duration: Date.now() - start }
            })(),
          })
        }
      }
    } catch (dbErr) {
      console.error("[MCP] DB project discovery error:", dbErr)
    }

    const results = await Promise.all(groupTasks.map((t) => t.promise))

    const groupsWithTiming = groupTasks.map((task, i) => ({
      groupName: task.groupName,
      projectPath: task.projectPath,
      mcpServers: results[i].mcpServers,
      duration: results[i].duration,
    }))

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

    const groups = groupsWithTiming.map(
      ({ groupName, projectPath, mcpServers }) => ({
        groupName,
        projectPath,
        mcpServers,
      }),
    )

    const [enabledPluginSources, pluginMcpConfigs, approvedServers] =
      await Promise.all([
        getEnabledPlugins(),
        discoverPluginMcpServers(),
        getApprovedPluginMcpServers(),
      ])

    for (const pluginConfig of pluginMcpConfigs) {
      if (!enabledPluginSources.includes(pluginConfig.pluginSource)) continue

      const globalServerNames = Object.keys(mergedGlobalServers)
      if (Object.keys(pluginConfig.mcpServers).length > 0) {
        const pluginMcpServers = (
          await Promise.all(
            Object.entries(pluginConfig.mcpServers).map(
              async ([name, serverConfig]) => {
                if (globalServerNames.includes(name)) return null

                const identifier = pluginConfig.approvalIdentifiers[name]
                const passesReviewGate = pluginConfig.reviewGate.canUseMcp
                const isApproved =
                  passesReviewGate &&
                  Boolean(identifier && approvedServers.includes(identifier))
                const effectiveServerConfig = getEffectivePluginMcpServerConfig(
                  {
                    claudeConfig: config,
                    pluginConfig,
                    serverName: name,
                    serverConfig,
                  },
                )
                const configObj = sanitizeMcpConfigForRenderer(
                  effectiveServerConfig as Record<string, unknown>,
                )

                if (!passesReviewGate) {
                  return {
                    name,
                    status: getPluginGateMcpStatus(pluginConfig.reviewGate),
                    tools: [],
                    needsAuth: false,
                    config: configObj,
                    isApproved: false,
                  } satisfies ClaudeMcpServerForSettings
                }

                if (!isApproved) {
                  return {
                    name,
                    status: "pending-approval",
                    tools: [],
                    needsAuth: false,
                    config: configObj,
                    isApproved,
                  } satisfies ClaudeMcpServerForSettings
                }

                let status = getServerStatusFromConfig(effectiveServerConfig)
                let tools: McpToolInfo[] = []

                try {
                  tools = await fetchToolsForServer(effectiveServerConfig)
                } catch (error) {
                  console.error(
                    `[MCP] Failed to fetch tools for plugin ${name}:`,
                    error,
                  )
                }

                const authStatus = await resolveServerAuthStatus({
                  serverConfig: effectiveServerConfig,
                  currentStatus: status,
                  tools,
                })
                status = authStatus.status

                return {
                  name,
                  status,
                  tools,
                  needsAuth: authStatus.needsAuth,
                  config: configObj,
                  isApproved,
                } satisfies ClaudeMcpServerForSettings
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

export async function resolveClaudeMcpServersForSdk(input: {
  isolatedConfigReady: boolean
  projectPath?: string
  runtimeCwd: string
}): Promise<{
  mcpServersForSdk: ClaudeMcpServersForSdk | undefined
  mcpReadinessStatus: ClaudeAgentSdkDesktopRunMcpReadinessStatus
  mcpRegistryVerificationTargets: ClaudeMcpRegistryVerificationTargets
}> {
  let mcpReadinessStatus: ClaudeAgentSdkDesktopRunMcpReadinessStatus =
    input.isolatedConfigReady ? "ready" : "skipped"
  let mcpServersForSdk: ClaudeMcpServersForSdk | undefined
  const mcpRegistryVerificationTargets: ClaudeMcpRegistryVerificationTargets =
    {}

  if (!input.isolatedConfigReady) {
    return {
      mcpServersForSdk,
      mcpReadinessStatus,
      mcpRegistryVerificationTargets,
    }
  }

  const claudeJsonSource = getClaudeConfigPath()
  try {
    const stats = await fs.stat(claudeJsonSource).catch(() => null)
    const currentMtime = stats?.mtimeMs ?? 0
    const cached = mcpConfigCache.get(claudeJsonSource)
    const lookupPath = input.projectPath || input.runtimeCwd

    let claudeConfig: ClaudeConfig
    if (cached && cached.mtime === currentMtime && currentMtime > 0) {
      claudeConfig = cached.config || {}
    } else if (stats) {
      claudeConfig = JSON.parse(
        await fs.readFile(claudeJsonSource, "utf-8"),
      ) as ClaudeConfig
      mcpConfigCache.set(claudeJsonSource, {
        config: claudeConfig,
        mtime: currentMtime,
      })
    } else {
      claudeConfig = {}
    }

    let chatClaudeDirConfig: ClaudeConfig = {}
    try {
      chatClaudeDirConfig = await readClaudeDirConfig()
    } catch {
      // ignore
    }

    const globalServers = await getMergedGlobalMcpServers(
      claudeConfig,
      chatClaudeDirConfig,
    )
    const projectConfigServers = await getMergedLocalProjectMcpServers(
      lookupPath,
      claudeConfig,
      chatClaudeDirConfig,
    )
    const projectMcpJsonServers = await readProjectMcpJsonCached(lookupPath)
    const projectServers = { ...projectMcpJsonServers, ...projectConfigServers }

    const [enabledPluginSources, pluginMcpConfigs, approvedServers] =
      await Promise.all([
        getEnabledPlugins(),
        discoverPluginMcpServers(),
        getApprovedPluginMcpServers(),
      ])

    const pluginServers: NonNullable<ClaudeMcpServersForSdk> = {}
    for (const pConfig of pluginMcpConfigs) {
      if (
        enabledPluginSources.includes(pConfig.pluginSource) &&
        pConfig.reviewGate.canUseMcp
      ) {
        for (const [name, serverConfig] of Object.entries(pConfig.mcpServers)) {
          if (!globalServers[name] && !projectServers[name]) {
            const identifier = pConfig.approvalIdentifiers[name]
            if (identifier && approvedServers.includes(identifier)) {
              pluginServers[name] = getEffectivePluginMcpServerConfig({
                claudeConfig,
                pluginConfig: pConfig,
                serverName: name,
                serverConfig,
              }) as NonNullable<ClaudeMcpServersForSdk>[string]
            }
          }
        }
      }
    }

    const globalServersForSdk =
      globalServers as NonNullable<ClaudeMcpServersForSdk>
    const projectServersForSdk =
      projectServers as NonNullable<ClaudeMcpServersForSdk>
    const allServers: NonNullable<ClaudeMcpServersForSdk> = {
      ...pluginServers,
      ...globalServersForSdk,
      ...projectServersForSdk,
    }

    if (workingMcpServers.size > 0) {
      const filtered: NonNullable<ClaudeMcpServersForSdk> = {}
      const resolvedProjectPath =
        resolveProjectPathFromWorktree(lookupPath) || lookupPath
      for (const [name, srvConfig] of Object.entries(allServers)) {
        const scope = name in projectServers ? resolvedProjectPath : null
        const cacheKey = mcpCacheKey(scope, name)
        if (
          shouldIncludeClaudeMcpServerInSdk(srvConfig) &&
          (workingMcpServers.get(cacheKey) === true ||
            !workingMcpServers.has(cacheKey))
        ) {
          const runtimeConfig =
            materializeClaudeMcpServerConfigForSdk(srvConfig)
          if (runtimeConfig) {
            filtered[name] = runtimeConfig
            addClaudeMcpRegistryVerificationTarget({
              targets: mcpRegistryVerificationTargets,
              serverName: name,
              serverConfig: srvConfig,
            })
          }
        }
      }
      mcpServersForSdk = filtered
      const skipped =
        Object.keys(allServers).length - Object.keys(filtered).length
      if (skipped > 0) {
        console.log(`[claude] Filtered out ${skipped} non-working MCP(s)`)
      }
    } else {
      const entries: Array<[string, ClaudeMcpServerForSdk]> = []
      for (const [name, srvConfig] of Object.entries(allServers)) {
        if (!shouldIncludeClaudeMcpServerInSdk(srvConfig)) continue
        const runtimeConfig = materializeClaudeMcpServerConfigForSdk(srvConfig)
        if (runtimeConfig) {
          entries.push([name, runtimeConfig])
          addClaudeMcpRegistryVerificationTarget({
            targets: mcpRegistryVerificationTargets,
            serverName: name,
            serverConfig: srvConfig,
          })
        }
      }
      mcpServersForSdk = Object.fromEntries(
        entries,
      ) as NonNullable<ClaudeMcpServersForSdk>
    }
  } catch (configErr) {
    console.error("[claude] Failed to read MCP config:", configErr)
    mcpReadinessStatus = "skipped"
  }

  return {
    mcpServersForSdk,
    mcpReadinessStatus,
    mcpRegistryVerificationTargets,
  }
}

export async function getClaudeMcpConfig(input: { projectPath: string }) {
  try {
    const config = await readClaudeConfig()
    const dirConfig = await readClaudeDirConfig()

    const globalServers = await getMergedGlobalMcpServers(config, dirConfig)
    const projectConfigServers = await getMergedLocalProjectMcpServers(
      input.projectPath,
      config,
      dirConfig,
    )
    const projectMcpJsonServers = await readProjectMcpJsonCached(
      input.projectPath,
    )

    const merged: Record<string, McpServerConfig> = {
      ...globalServers,
      ...projectMcpJsonServers,
      ...projectConfigServers,
    }

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
      ) {
        continue
      }
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

    const mcpServers = Object.entries(merged).map(([name, serverConfig]) => {
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
    })

    return { mcpServers, projectPath: input.projectPath }
  } catch (error) {
    console.error("[getMcpConfig] Error reading config:", error)
    return {
      mcpServers: [],
      projectPath: input.projectPath,
      error: String(error),
    }
  }
}

export async function startClaudeMcpOAuth(input: {
  serverName: string
  projectPath: string
}) {
  const serverName = normalizeMcpServerName(input.serverName)
  const requestedPath = input.projectPath?.trim()
  let projectPath = GLOBAL_MCP_PATH
  if (requestedPath && requestedPath !== GLOBAL_MCP_PATH) {
    const resolvedProjectPath = resolveMcpProjectPathForMutation({
      scope: "project",
      projectPath: requestedPath,
    })
    if (!resolvedProjectPath) {
      throw new Error("Project path required for MCP OAuth")
    }
    projectPath = resolvedProjectPath
  }

  return startMcpOAuthFlow(serverName, projectPath)
}

export async function getClaudeMcpAuthStatus(input: {
  serverName: string
  projectPath: string
}) {
  return readMcpAuthStatus(input.serverName, input.projectPath)
}

export async function addClaudeMcpServer(input: {
  name: string
  scope: "global" | "project"
  projectPath?: string
  transport: "stdio" | "http"
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  authType?: "none" | "oauth" | "bearer"
  bearerToken?: string
}) {
  const serverName = normalizeMcpServerName(input.name)

  if (input.transport === "stdio" && !input.command?.trim()) {
    throw new Error("Command is required for stdio servers")
  }
  if (input.transport === "http" && !input.url?.trim()) {
    throw new Error("URL is required for HTTP servers")
  }

  const serverConfig: McpServerConfig = {}
  if (input.transport === "stdio") {
    serverConfig.command = input.command?.trim()
    if (input.args && input.args.length > 0) {
      serverConfig.args = input.args
    }
    if (input.env && Object.keys(input.env).length > 0) {
      serverConfig.env = input.env
    }
  } else {
    serverConfig.url = input.url?.trim()
    if (input.authType) {
      serverConfig.authType = input.authType
    }
    if (input.bearerToken) {
      serverConfig.headers = {
        Authorization: `Bearer ${input.bearerToken}`,
      }
    }
  }

  return writeClaudeMcpServerConfig({
    name: serverName,
    scope: input.scope,
    projectPath: input.projectPath,
    config: serverConfig,
  })
}

export async function writeClaudeMcpServerConfig(input: {
  name: string
  scope: "global" | "project"
  projectPath?: string
  config: McpServerConfig
}) {
  const serverName = normalizeMcpServerName(input.name)
  const projectPath = resolveMcpProjectPathForMutation(input)
  assertWritableClaudeMcpConfig(input.config)

  await updateClaudeConfigAtomic((existingConfig) => {
    if (projectPath) {
      if (existingConfig.projects?.[projectPath]?.mcpServers?.[serverName]) {
        throw new Error(`Server "${serverName}" already exists in this project`)
      }
    } else if (existingConfig.mcpServers?.[serverName]) {
      throw new Error(`Server "${serverName}" already exists`)
    }

    return updateMcpServerConfig(
      existingConfig,
      projectPath,
      serverName,
      input.config,
    )
  })

  return { success: true, name: serverName }
}

export async function updateClaudeMcpServer(input: {
  name: string
  scope: "global" | "project"
  projectPath?: string
  newName?: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  authType?: "none" | "oauth" | "bearer"
  bearerToken?: string
  disabled?: boolean
}) {
  const serverName = normalizeMcpServerName(input.name)
  const projectPath = resolveMcpProjectPathForMutation(input)
  const newName = input.newName
    ? normalizeMcpServerName(input.newName)
    : undefined
  let returnedName = serverName

  await updateClaudeConfigAtomic((config) => {
    const servers = getMcpServersForScope(config, projectPath)
    if (!servers?.[serverName]) {
      throw new Error(`Server "${serverName}" not found`)
    }

    const existing = servers[serverName]

    if (newName && newName !== serverName) {
      if (servers[newName]) {
        throw new Error(`Server "${newName}" already exists`)
      }
      returnedName = newName
      const updated = removeMcpServerConfig(config, projectPath, serverName)
      return updateMcpServerConfig(updated, projectPath, newName, existing)
    }

    const update: Partial<McpServerConfig> = {}
    if (input.command !== undefined) update.command = input.command
    if (input.args !== undefined) update.args = input.args
    if (input.env !== undefined) update.env = input.env
    if (input.url !== undefined) update.url = input.url
    if (input.disabled !== undefined) update.disabled = input.disabled

    if (input.bearerToken) {
      update.authType = "bearer"
      update.headers = { Authorization: `Bearer ${input.bearerToken}` }
    }

    if (input.authType) {
      update.authType = input.authType
      if (input.authType === "none") {
        update.headers = undefined
        update._oauth = undefined
      }
    }

    const merged = { ...existing, ...update }
    return updateMcpServerConfig(config, projectPath, serverName, merged)
  })

  return { success: true, name: returnedName }
}

export async function removeClaudeMcpServer(input: {
  name: string
  scope: "global" | "project"
  projectPath?: string
}) {
  const serverName = normalizeMcpServerName(input.name)
  const projectPath = resolveMcpProjectPathForMutation(input)

  await updateClaudeConfigAtomic((config) => {
    const servers = getMcpServersForScope(config, projectPath)
    if (!servers?.[serverName]) {
      throw new Error(`Server "${serverName}" not found`)
    }

    return removeMcpServerConfig(config, projectPath, serverName)
  })

  return { success: true }
}

export async function setClaudeMcpBearerToken(input: {
  name: string
  scope: "global" | "project"
  projectPath?: string
  token: string
}) {
  const serverName = normalizeMcpServerName(input.name)
  const projectPath = resolveMcpProjectPathForMutation(input)

  await updateClaudeConfigAtomic((config) => {
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
}

export async function checkClaudeMcpRegistryServer(input: {
  serverName: string
  scope: "global" | "project"
  projectPath?: string
}): Promise<ClaudeMcpRegistryCheckResult> {
  const serverName = normalizeMcpServerName(input.serverName)
  const projectPath = resolveMcpProjectPathForMutation(input)
  const config = await readClaudeConfig()
  const servers = getMcpServersForScope(config, projectPath)
  const serverConfig = servers?.[serverName]
  if (!serverConfig) {
    throw new Error(`Server "${serverName}" not found`)
  }

  const verificationKey = getMcpRegistryVerificationKeyFromConfig(
    serverConfig,
    serverName,
  )
  if (!verificationKey) {
    throw new Error(
      `Server "${serverName}" is not a registry-installed MCP server`,
    )
  }

  const localState = resolveMcpRegistryRuntimeLocalStateFromConfig({
    config: serverConfig,
  })
  if (
    serverConfig.disabled === true ||
    localState?.status === "installed-needs-setup"
  ) {
    const reason = localState?.reason ?? "missing setup"
    await upsertMcpRegistryVerificationRecord({
      ...verificationKey,
      status: "failed-check",
      reason,
    })
    return {
      success: false,
      runtime: "claude-code",
      serverName,
      status: "failed-check",
      toolCount: 0,
      toolNames: [],
      reason,
    }
  }

  const materializedConfig = materializeMcpRegistryServerConfigForRuntime(
    serverConfig,
    { stripMetadata: true },
  )

  try {
    const tools = await fetchToolsForServerStrict(materializedConfig)
    await upsertMcpRegistryVerificationRecord({
      ...verificationKey,
      status: "ready-to-verify",
      reason: `tool-list-success:${tools.length}`,
    })
    return {
      success: true,
      runtime: "claude-code",
      serverName,
      status: "ready-to-verify",
      toolCount: tools.length,
      toolNames: tools.map((tool) => tool.name).sort(),
    }
  } catch (error) {
    const reason = classifyRegistryCheckFailure({
      serverConfig: materializedConfig,
      error,
    })
    await upsertMcpRegistryVerificationRecord({
      ...verificationKey,
      status: "failed-check",
      reason,
    })
    return {
      success: false,
      runtime: "claude-code",
      serverName,
      status: "failed-check",
      toolCount: 0,
      toolNames: [],
      reason,
    }
  }
}

export async function getPendingPluginMcpApprovals(input: {
  projectPath?: string
}) {
  const [enabledPluginSources, pluginMcpConfigs, approvedServers] =
    await Promise.all([
      getEnabledPlugins(),
      discoverPluginMcpServers(),
      getApprovedPluginMcpServers(),
    ])

  const config = await readClaudeConfig()
  const dirConfig = await readClaudeDirConfig()
  const globalServers = await getMergedGlobalMcpServers(config, dirConfig)
  let projectServers: Record<string, McpServerConfig> = {}
  if (input.projectPath) {
    const projectConfigServers = await getMergedLocalProjectMcpServers(
      input.projectPath,
      config,
      dirConfig,
    )
    const projectMcpJsonServers = await readProjectMcpJsonCached(
      input.projectPath,
    )
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
}

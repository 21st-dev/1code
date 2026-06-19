import { createHash } from "node:crypto"
import { statSync } from "node:fs"
import { basename, isAbsolute, resolve } from "node:path"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { sanitizeMcpConfigForRenderer } from "../../../shared/mcp-import-preview"
import { resolveProjectPathFromWorktree } from "../claude-config"
import { runCodexCliChecked } from "../codex/cli-runner"
import { getDatabase, projects as projectsTable } from "../db"
import {
  fetchMcpTools,
  fetchMcpToolsStdio,
  type McpToolInfo,
} from "../mcp-auth"

export type CodexMcpServerForSession =
  | {
      name: string
      type: "stdio"
      command: string
      args: string[]
      env: Array<{ name: string; value: string }>
    }
  | {
      name: string
      type: "http"
      url: string
      headers: Array<{ name: string; value: string }>
    }

type CodexMcpServerForSettings = {
  name: string
  status: "connected" | "failed" | "pending" | "needs-auth"
  tools: McpToolInfo[]
  needsAuth: boolean
  config: Record<string, unknown>
  serverInfo?: {
    name: string
    version: string
    icons?: Array<{ src: string }>
  }
  error?: string
}

export type CodexMcpSnapshot = {
  mcpServersForSession: CodexMcpServerForSession[]
  groups: Array<{
    groupName: string
    projectPath: string | null
    mcpServers: CodexMcpServerForSettings[]
  }>
  fingerprint: string
  fetchedAt: number
  toolsResolved: boolean
}

const codexMcpCache = new Map<string, CodexMcpSnapshot>()

const CODEX_MCP_TOOLS_FETCH_TIMEOUT_MS = 40_000

const codexMcpListEntrySchema = z
  .object({
    name: z.string(),
    enabled: z.boolean(),
    disabled_reason: z.string().nullable().optional(),
    transport: z
      .object({
        type: z.string(),
        command: z.string().nullable().optional(),
        args: z.array(z.string()).nullable().optional(),
        env: z.record(z.string(), z.string()).nullable().optional(),
        env_vars: z.array(z.string()).nullable().optional(),
        cwd: z.string().nullable().optional(),
        url: z.string().nullable().optional(),
        bearer_token_env_var: z.string().nullable().optional(),
        http_headers: z.record(z.string(), z.string()).nullable().optional(),
        env_http_headers: z
          .record(z.string(), z.string())
          .nullable()
          .optional(),
      })
      .passthrough(),
    auth_status: z.string().nullable().optional(),
  })
  .passthrough()

type CodexMcpListEntry = z.infer<typeof codexMcpListEntrySchema>

function getCodexMcpAuthState(authStatus: string | null | undefined): {
  supportsAuth: boolean
  authenticated: boolean
  needsAuth: boolean
} {
  const normalized = (authStatus || "").trim().toLowerCase()

  // Exact CLI values from codex-rs/protocol/src/protocol.rs (McpAuthStatus):
  // unsupported | not_logged_in | bearer_token | o_auth
  switch (normalized) {
    case "":
    case "none":
    case "unsupported":
      return { supportsAuth: false, authenticated: false, needsAuth: false }
    case "not_logged_in":
      return { supportsAuth: true, authenticated: false, needsAuth: true }
    case "bearer_token":
    case "o_auth":
      return { supportsAuth: true, authenticated: true, needsAuth: false }
    default:
      // Unknown/forward-compatible value: don't force needs-auth.
      return { supportsAuth: true, authenticated: false, needsAuth: false }
  }
}

function objectToPairs(
  value: Record<string, string> | null | undefined,
): Array<{ name: string; value: string }> | undefined {
  if (!value) return undefined
  const pairs = Object.entries(value)
    .filter(
      ([name, val]) => typeof name === "string" && typeof val === "string",
    )
    .map(([name, val]) => ({ name, value: val }))

  return pairs.length > 0 ? pairs : undefined
}

function resolveCodexStdioEnv(
  transport: CodexMcpListEntry["transport"],
): Record<string, string> | undefined {
  const merged: Record<string, string> = {}

  if (transport.env) {
    for (const [name, value] of Object.entries(transport.env)) {
      if (typeof name === "string" && typeof value === "string") {
        merged[name] = value
      }
    }
  }

  if (Array.isArray(transport.env_vars)) {
    for (const envName of transport.env_vars) {
      const value = process.env[envName]
      if (typeof value === "string" && value.length > 0 && !merged[envName]) {
        merged[envName] = value
      }
    }
  }

  return Object.keys(merged).length > 0 ? merged : undefined
}

function resolveCodexHttpHeaders(
  transport: CodexMcpListEntry["transport"],
): Record<string, string> | undefined {
  const merged: Record<string, string> = {}

  if (transport.http_headers) {
    for (const [name, value] of Object.entries(transport.http_headers)) {
      if (typeof name === "string" && typeof value === "string") {
        merged[name] = value
      }
    }
  }

  if (transport.env_http_headers) {
    for (const [headerName, envName] of Object.entries(
      transport.env_http_headers,
    )) {
      if (typeof headerName !== "string" || typeof envName !== "string")
        continue
      const value = process.env[envName]
      if (typeof value === "string" && value.length > 0) {
        merged[headerName] = value
      }
    }
  }

  const bearerEnvVar = transport.bearer_token_env_var?.trim()
  if (bearerEnvVar && !merged.Authorization) {
    const token = process.env[bearerEnvVar]?.trim()
    if (token) {
      merged.Authorization = `Bearer ${token}`
    }
  }

  return Object.keys(merged).length > 0 ? merged : undefined
}

function resolveCodexStdioCwd(
  transport: CodexMcpListEntry["transport"],
): string | undefined {
  const cwd = transport.cwd?.trim()
  return cwd ? cwd : undefined
}

function resolveCodexStdioCommand(
  transport: CodexMcpListEntry["transport"],
): string | undefined {
  const command = transport.command?.trim()
  if (!command) return undefined

  const cwd = resolveCodexStdioCwd(transport)
  if (!cwd || isAbsolute(command)) {
    return command
  }

  const isPathLike =
    command.startsWith(".") || command.includes("/") || command.includes("\\")

  return isPathLike ? resolve(cwd, command) : command
}

function normalizeCodexTools(tools: McpToolInfo[]): McpToolInfo[] {
  const unique = new Map<string, McpToolInfo>()
  for (const tool of tools) {
    if (typeof tool?.name === "string" && tool.name.trim()) {
      const name = tool.name.trim()
      unique.set(name, {
        name,
        ...(tool.description ? { description: tool.description } : {}),
      })
    }
  }
  return [...unique.values()]
}

async function fetchCodexMcpTools(
  entry: CodexMcpListEntry,
): Promise<McpToolInfo[]> {
  const transportType = entry.transport.type.trim().toLowerCase()
  const timeoutPromise = new Promise<McpToolInfo[]>((_, reject) =>
    setTimeout(
      () => reject(new Error("Timeout")),
      CODEX_MCP_TOOLS_FETCH_TIMEOUT_MS,
    ),
  )

  const fetchPromise = (async (): Promise<McpToolInfo[]> => {
    if (transportType === "stdio") {
      const command = resolveCodexStdioCommand(entry.transport)
      if (!command) return []
      return await fetchMcpToolsStdio({
        command,
        args: entry.transport.args || undefined,
        env: resolveCodexStdioEnv(entry.transport),
        cwd: resolveCodexStdioCwd(entry.transport),
      })
    }

    if (
      transportType === "streamable_http" ||
      transportType === "http" ||
      transportType === "sse"
    ) {
      const url = entry.transport.url?.trim()
      if (!url) return []
      return await fetchMcpTools(url, resolveCodexHttpHeaders(entry.transport))
    }

    return []
  })()

  try {
    const tools = await Promise.race([fetchPromise, timeoutPromise])
    return normalizeCodexTools(tools)
  } catch {
    return []
  }
}

function resolveCodexLookupPath(
  pathCandidate: string | null | undefined,
): string {
  return pathCandidate?.trim() || "__global__"
}

function isExistingCodexMcpCwd(pathCandidate: string): boolean {
  try {
    return statSync(pathCandidate).isDirectory()
  } catch {
    return false
  }
}

function getCodexMcpFingerprint(servers: CodexMcpServerForSession[]): string {
  return createHash("sha256").update(JSON.stringify(servers)).digest("hex")
}

export function createEmptyCodexMcpSnapshot(input: {
  toolsResolved: boolean
}): CodexMcpSnapshot {
  return {
    mcpServersForSession: [],
    groups: [],
    fingerprint: getCodexMcpFingerprint([]),
    fetchedAt: Date.now(),
    toolsResolved: input.toolsResolved,
  }
}

export async function resolveCodexMcpSnapshot(params: {
  lookupPath?: string | null
  forceRefresh?: boolean
  includeTools?: boolean
}): Promise<CodexMcpSnapshot> {
  const lookupPath = resolveCodexLookupPath(params.lookupPath)
  const shouldIncludeTools = Boolean(params.includeTools)
  if (lookupPath !== "__global__" && !isExistingCodexMcpCwd(lookupPath)) {
    return createEmptyCodexMcpSnapshot({ toolsResolved: shouldIncludeTools })
  }

  const cached = codexMcpCache.get(lookupPath)
  if (
    cached &&
    !params.forceRefresh &&
    (!shouldIncludeTools || cached.toolsResolved)
  ) {
    return cached
  }

  const result = await runCodexCliChecked(["mcp", "list", "--json"], {
    cwd: lookupPath === "__global__" ? undefined : lookupPath,
  })

  let parsed: unknown
  try {
    parsed = JSON.parse(result.stdout)
  } catch {
    throw new Error("Failed to parse Codex MCP list JSON output.")
  }

  const entries = z.array(codexMcpListEntrySchema).parse(parsed)
  const mcpServersForSession: CodexMcpServerForSession[] = []
  const mcpServersForSettings: CodexMcpServerForSettings[] = []

  const convertedEntries = await Promise.all(
    entries.map(async (entry) => {
      const transportType = entry.transport.type.trim().toLowerCase()
      const authState = getCodexMcpAuthState(entry.auth_status)
      const includeInSession = entry.enabled
      const resolvedStdioEnv = resolveCodexStdioEnv(entry.transport)
      const resolvedHttpHeaders = resolveCodexHttpHeaders(entry.transport)
      let status: CodexMcpServerForSettings["status"] = !entry.enabled
        ? "failed"
        : authState.needsAuth
          ? "needs-auth"
          : "connected"

      const settingsConfig: Record<string, unknown> = {
        transportType: entry.transport.type,
        authStatus: entry.auth_status ?? "unknown",
        enabled: entry.enabled,
        disabledReason: entry.disabled_reason ?? undefined,
      }

      let sessionServer: CodexMcpServerForSession | null = null
      if (transportType === "stdio") {
        const command = resolveCodexStdioCommand(entry.transport)
        const args = entry.transport.args || undefined
        if (includeInSession && command) {
          const envPairs = objectToPairs(resolvedStdioEnv) || []
          sessionServer = {
            name: entry.name,
            type: "stdio",
            command,
            args: Array.isArray(args) ? args : [],
            env: envPairs,
          }
        }

        settingsConfig.command = command
        settingsConfig.args = args
        settingsConfig.env = entry.transport.env || undefined
        settingsConfig.envVars = entry.transport.env_vars || undefined
        settingsConfig.cwd = entry.transport.cwd || undefined
      } else if (
        transportType === "streamable_http" ||
        transportType === "http" ||
        transportType === "sse"
      ) {
        const url = entry.transport.url || undefined
        const headers = objectToPairs(resolvedHttpHeaders)
        if (includeInSession && url) {
          sessionServer = {
            name: entry.name,
            type: "http",
            url,
            headers: headers || [],
          }
        }

        settingsConfig.url = url
        settingsConfig.headers = entry.transport.http_headers || undefined
        settingsConfig.envHttpHeaders =
          entry.transport.env_http_headers || undefined
        settingsConfig.bearerTokenEnvVar =
          entry.transport.bearer_token_env_var || undefined
      }

      const shouldProbeTools =
        shouldIncludeTools &&
        includeInSession &&
        !authState.needsAuth &&
        transportType !== "stdio" &&
        // Probe unauthenticated/public HTTP servers. Avoid probing stdio
        // servers during startup because they can launch GUI/permission flows.
        (!authState.supportsAuth ||
          // For auth-capable HTTP, only probe if explicit auth header is available.
          Boolean(resolvedHttpHeaders?.Authorization))
      const tools = shouldProbeTools ? await fetchCodexMcpTools(entry) : []
      if (shouldProbeTools && tools.length === 0) {
        status = "failed"
      }

      return {
        sessionServer,
        settingsServer: {
          name: entry.name,
          status,
          tools,
          needsAuth: authState.needsAuth,
          config: sanitizeMcpConfigForRenderer(settingsConfig),
        } satisfies CodexMcpServerForSettings,
      }
    }),
  )

  for (const converted of convertedEntries) {
    if (converted.sessionServer) {
      mcpServersForSession.push(converted.sessionServer)
    }
    mcpServersForSettings.push(converted.settingsServer)
  }

  const snapshot: CodexMcpSnapshot = {
    mcpServersForSession,
    groups: [
      {
        groupName: "Global",
        projectPath: null,
        mcpServers: mcpServersForSettings,
      },
    ],
    fingerprint: getCodexMcpFingerprint(mcpServersForSession),
    fetchedAt: Date.now(),
    toolsResolved: shouldIncludeTools,
  }

  codexMcpCache.set(lookupPath, snapshot)
  return snapshot
}

export function clearCodexMcpConfigCache(): void {
  codexMcpCache.clear()
}

function getCodexServerIdentity(server: CodexMcpServerForSettings): string {
  const config = server.config as Record<string, unknown>
  return JSON.stringify({
    enabled: config.enabled ?? null,
    disabledReason: config.disabledReason ?? null,
    transportType: config.transportType ?? null,
    command: config.command ?? null,
    args: config.args ?? null,
    cwd: config.cwd ?? null,
    env: config.env ?? null,
    envVars: config.envVars ?? null,
    url: config.url ?? null,
    headers: config.headers ?? null,
    envHttpHeaders: config.envHttpHeaders ?? null,
    bearerTokenEnvVar: config.bearerTokenEnvVar ?? null,
    authStatus: config.authStatus ?? null,
  })
}

export async function getAllCodexMcpConfigHandler() {
  const globalSnapshot = await resolveCodexMcpSnapshot({ includeTools: true })
  const globalServers = globalSnapshot.groups[0]?.mcpServers || []
  const globalByName = new Map(
    globalServers.map((server) => [
      server.name,
      getCodexServerIdentity(server),
    ]),
  )

  const groups: CodexMcpSnapshot["groups"] = [...globalSnapshot.groups]

  // Only enumerate projects the app knows about (DB-backed projects).
  // Do not scan ~/.codex/config.toml project entries.
  const projectPathSet = new Set<string>()

  try {
    const db = getDatabase()
    const dbProjects = db
      .select({ path: projectsTable.path })
      .from(projectsTable)
      .all()
    for (const project of dbProjects) {
      if (typeof project.path === "string" && project.path.trim().length > 0) {
        projectPathSet.add(project.path)
      }
    }
  } catch (error) {
    console.error(
      "[codex.getAllMcpConfig] Failed to read projects from DB:",
      error,
    )
  }

  const projectPaths = [...projectPathSet].sort((a, b) => a.localeCompare(b))
  const projectResults = await Promise.allSettled(
    projectPaths.map(async (projectPath) => {
      const projectSnapshot = await resolveCodexMcpSnapshot({
        lookupPath: projectPath,
        includeTools: true,
      })
      const effectiveServers = projectSnapshot.groups[0]?.mcpServers || []
      const projectOnlyServers = effectiveServers.filter((server) => {
        const globalIdentity = globalByName.get(server.name)
        if (!globalIdentity) return true
        return globalIdentity !== getCodexServerIdentity(server)
      })

      if (projectOnlyServers.length === 0) {
        return null
      }

      return {
        groupName: basename(projectPath) || projectPath,
        projectPath,
        mcpServers: projectOnlyServers,
      }
    }),
  )

  for (const result of projectResults) {
    if (result.status === "fulfilled" && result.value) {
      groups.push(result.value)
      continue
    }
    if (result.status === "rejected") {
      console.error(
        "[codex.getAllMcpConfig] Failed to resolve project MCP snapshot:",
        result.reason,
      )
    }
  }

  return { groups }
}

function resolveCodexMcpProjectPathForCli(
  projectPath: string | undefined,
): string | undefined {
  const requestedPath = projectPath?.trim()
  if (!requestedPath) return undefined

  const db = getDatabase()
  const registeredProject = db
    .select({ path: projectsTable.path })
    .from(projectsTable)
    .where(eq(projectsTable.path, requestedPath))
    .get()

  if (!registeredProject) {
    throw new Error("Codex MCP project path must match a registered project.")
  }

  if (!isExistingCodexMcpCwd(registeredProject.path)) {
    throw new Error("Codex MCP project path no longer exists.")
  }

  return registeredProject.path
}

export async function addCodexMcpServer(input: {
  name: string
  scope: "global" | "project"
  transport: "stdio" | "http"
  command?: string
  args?: string[]
  url?: string
}): Promise<{ success: true }> {
  if (input.scope !== "global") {
    throw new Error("Codex MCP currently supports global scope only.")
  }

  const args = ["mcp", "add", input.name.trim()]
  if (input.transport === "http") {
    const url = input.url?.trim()
    if (!url) {
      throw new Error("URL is required for HTTP servers.")
    }
    args.push("--url", url)
  } else {
    const command = input.command?.trim()
    if (!command) {
      throw new Error("Command is required for stdio servers.")
    }

    args.push("--", command, ...(input.args || []))
  }

  await runCodexCliChecked(args)
  clearCodexMcpConfigCache()
  return { success: true }
}

export async function removeCodexMcpServer(input: {
  name: string
  scope: "global" | "project"
}): Promise<{ success: true }> {
  if (input.scope !== "global") {
    throw new Error("Codex MCP currently supports global scope only.")
  }

  await runCodexCliChecked(["mcp", "remove", input.name.trim()])
  clearCodexMcpConfigCache()
  return { success: true }
}

export async function startCodexMcpOAuth(input: {
  serverName: string
  projectPath?: string
}): Promise<{ success: true }> {
  const projectPath = resolveCodexMcpProjectPathForCli(input.projectPath)
  await runCodexCliChecked(["mcp", "login", input.serverName.trim()], {
    cwd: projectPath,
  })
  clearCodexMcpConfigCache()
  return { success: true }
}

export async function logoutCodexMcpServer(input: {
  serverName: string
  projectPath?: string
}): Promise<{ success: true }> {
  const projectPath = resolveCodexMcpProjectPathForCli(input.projectPath)
  await runCodexCliChecked(["mcp", "logout", input.serverName.trim()], {
    cwd: projectPath,
  })
  clearCodexMcpConfigCache()
  return { success: true }
}

export async function resolveCodexMcpSnapshotForDesktopRun(input: {
  projectPath?: string | null
  runtimeCwd: string
}): Promise<CodexMcpSnapshot> {
  const resolvedProjectPathFromCwd = resolveProjectPathFromWorktree(
    input.runtimeCwd,
  )
  const mcpLookupPath =
    input.projectPath || resolvedProjectPathFromCwd || input.runtimeCwd
  return resolveCodexMcpSnapshot({ lookupPath: mcpLookupPath })
}

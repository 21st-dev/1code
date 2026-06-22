import { createHash } from "node:crypto"
import { statSync } from "node:fs"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { basename, dirname, isAbsolute, join, resolve } from "node:path"
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
import {
  listMcpRegistryVerificationRecords,
  upsertMcpRegistryVerificationRecord,
  type McpRegistryVerificationRecord,
} from "../mcp-registry/verification-state"

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

type CodexMcpServerConfigWrite = {
  command?: string
  args?: string[]
  env?: Record<string, string>
  envVars?: string[]
  cwd?: string
  url?: string
  headers?: Record<string, string>
  envHttpHeaders?: Record<string, string>
  bearerTokenEnvVar?: string
  transportType?: string
  disabled?: boolean
  disabledReason?: string
}

export type CodexMcpRegistryCheckResult = {
  success: boolean
  runtime: "codex"
  serverName: string
  status: "connected-unverified" | "installed-unverified" | "failed-check"
  toolCount: number
  toolNames: string[]
  reason?: string
}

const codexMcpCache = new Map<string, CodexMcpSnapshot>()

const CODEX_MCP_TOOLS_FETCH_TIMEOUT_MS = 40_000
const CODEX_CONFIG_HOME_ENV = "CODEX_HOME"

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

function getCodexConfigHome(): string {
  const explicit = process.env[CODEX_CONFIG_HOME_ENV]?.trim()
  return explicit ? resolve(explicit) : join(homedir(), ".codex")
}

export function getCodexConfigPath(): string {
  return join(getCodexConfigHome(), "config.toml")
}

function escapeTomlBasicString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

function tomlString(value: string): string {
  return `"${escapeTomlBasicString(value)}"`
}

function tomlStringArray(values: string[]): string {
  return `[${values.map(tomlString).join(", ")}]`
}

function tomlInlineStringMap(values: Record<string, string>): string {
  const entries = Object.entries(values)
    .filter(([key, value]) => key.trim() && value.trim())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${tomlString(key)} = ${tomlString(value)}`)
  return `{ ${entries.join(", ")} }`
}

function isTomlTableHeader(line: string): boolean {
  return /^\s*\[[^\]]+\]\s*$/.test(line)
}

function isCodexMcpServerTomlHeader(line: string, serverName: string): boolean {
  const escapedName = escapeTomlBasicString(serverName)
  const trimmed = line.trim()
  const serverHeader = `[mcp_servers."${escapedName}"]`
  const serverSubtablePrefix = `[mcp_servers."${escapedName}".`
  return (
    trimmed === serverHeader ||
    (trimmed.startsWith(serverSubtablePrefix) && trimmed.endsWith("]"))
  )
}

function removeCodexMcpServerTomlBlock(
  source: string,
  serverName: string,
): string {
  const lines = source.split(/\r?\n/)
  const output: string[] = []
  let skipping = false

  for (const line of lines) {
    if (isTomlTableHeader(line)) {
      skipping = isCodexMcpServerTomlHeader(line, serverName)
    }
    if (!skipping) output.push(line)
  }

  return `${output.join("\n").trimEnd()}\n`
}

function buildCodexMcpServerTomlBlock(input: {
  name: string
  config: CodexMcpServerConfigWrite
}): string {
  const lines = [`[mcp_servers."${escapeTomlBasicString(input.name)}"]`]
  const config = input.config
  if (config.disabled === true) {
    lines.push("enabled = false")
    if (config.disabledReason?.trim()) {
      lines.push(
        `disabled_reason = ${tomlString(config.disabledReason.trim())}`,
      )
    }
  }

  if (config.url?.trim()) {
    lines.push(`url = ${tomlString(config.url.trim())}`)
    if (config.transportType === "sse") {
      lines.push('transport = "sse"')
    }
    if (config.headers && Object.keys(config.headers).length > 0) {
      lines.push(`http_headers = ${tomlInlineStringMap(config.headers)}`)
    }
    if (
      config.envHttpHeaders &&
      Object.keys(config.envHttpHeaders).length > 0
    ) {
      lines.push(
        `env_http_headers = ${tomlInlineStringMap(config.envHttpHeaders)}`,
      )
    }
    if (config.bearerTokenEnvVar?.trim()) {
      lines.push(
        `bearer_token_env_var = ${tomlString(config.bearerTokenEnvVar.trim())}`,
      )
    }
    return `${lines.join("\n")}\n`
  }

  const command = config.command?.trim()
  if (!command) {
    throw new Error("Command is required for Codex stdio MCP config.")
  }
  lines.push(`command = ${tomlString(command)}`)
  if (config.args && config.args.length > 0) {
    lines.push(`args = ${tomlStringArray(config.args)}`)
  }
  if (config.cwd?.trim()) {
    lines.push(`cwd = ${tomlString(config.cwd.trim())}`)
  }
  if (config.envVars && config.envVars.length > 0) {
    lines.push(
      `env_vars = ${tomlStringArray([...new Set(config.envVars)].sort())}`,
    )
  }
  if (config.env && Object.keys(config.env).length > 0) {
    lines.push("")
    lines.push(`[mcp_servers."${escapeTomlBasicString(input.name)}".env]`)
    for (const [key, value] of Object.entries(config.env).sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      lines.push(`${tomlString(key)} = ${tomlString(value)}`)
    }
  }
  return `${lines.join("\n")}\n`
}

async function readCodexConfigToml(): Promise<string> {
  try {
    return await readFile(getCodexConfigPath(), "utf-8")
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return ""
    }
    throw error
  }
}

async function writeCodexConfigToml(source: string): Promise<void> {
  const configPath = getCodexConfigPath()
  await mkdir(dirname(configPath), { recursive: true })
  const tempPath = `${configPath}.tmp`
  await writeFile(tempPath, source)
  await rename(tempPath, configPath)
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
  const registryRecords =
    lookupPath === "__global__"
      ? await listMcpRegistryVerificationRecords().catch(() => [])
      : []
  const latestRegistryRecordByName = new Map<
    string,
    McpRegistryVerificationRecord
  >()
  for (const entry of entries) {
    const record = mostRecentMcpRegistryRecord(
      registryRecords.filter(
        (candidate) =>
          candidate.runtime === "codex" && candidate.serverName === entry.name,
      ),
    )
    if (record) latestRegistryRecordByName.set(entry.name, record)
  }
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
      const registryRecord = latestRegistryRecordByName.get(entry.name)
      const safeConfig = sanitizeMcpConfigForRenderer(settingsConfig)
      if (registryRecord) {
        safeConfig._locusMcpRegistry = {
          runtime: "codex",
          status: registryRecord.status,
          entryFingerprint: registryRecord.entryFingerprint,
          configFingerprint: registryRecord.configFingerprint,
          ...(registryRecord.reason ? { reason: registryRecord.reason } : {}),
        }
      }

      return {
        sessionServer,
        settingsServer: {
          name: entry.name,
          status,
          tools,
          needsAuth: authState.needsAuth,
          config: safeConfig,
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

const CODEX_REMOTE_MCP_TRANSPORTS = new Set(["http", "sse", "streamable_http"])

function getCodexSettingsTransportType(
  server: CodexMcpServerForSettings,
): string {
  const transportType = server.config.transportType
  return typeof transportType === "string"
    ? transportType.trim().toLowerCase()
    : ""
}

function mostRecentMcpRegistryRecord(
  records: McpRegistryVerificationRecord[],
): McpRegistryVerificationRecord | null {
  const sorted = [...records].sort((a, b) => {
    const timeA = Date.parse(a.updatedAt)
    const timeB = Date.parse(b.updatedAt)
    if (Number.isFinite(timeA) && Number.isFinite(timeB)) {
      return timeB - timeA
    }
    return b.updatedAt.localeCompare(a.updatedAt)
  })
  return sorted[0] ?? null
}

async function getLatestCodexMcpRegistryRecord(
  serverName: string,
): Promise<McpRegistryVerificationRecord | null> {
  const records = await listMcpRegistryVerificationRecords()
  return mostRecentMcpRegistryRecord(
    records.filter(
      (record) =>
        record.runtime === "codex" && record.serverName === serverName,
    ),
  )
}

function codexRegistryCheckResult(input: {
  serverName: string
  status: CodexMcpRegistryCheckResult["status"]
  toolNames?: string[]
  reason?: string
}): CodexMcpRegistryCheckResult {
  const toolNames = input.toolNames ?? []
  return {
    success: input.status !== "failed-check",
    runtime: "codex",
    serverName: input.serverName,
    status: input.status,
    toolCount: toolNames.length,
    toolNames,
    ...(input.reason ? { reason: input.reason } : {}),
  }
}

export async function checkCodexMcpRegistryServer(input: {
  runtime: "codex"
  serverName: string
  scope: "global" | "project"
  projectPath?: string
}): Promise<CodexMcpRegistryCheckResult> {
  if (input.scope !== "global") {
    throw new Error(
      "Codex MCP registry check currently supports global scope only.",
    )
  }

  const serverName = input.serverName.trim()
  const record = await getLatestCodexMcpRegistryRecord(serverName)
  if (!record) {
    throw new Error(
      "Codex MCP registry check requires a stored registry identity for this server.",
    )
  }

  const snapshot = await resolveCodexMcpSnapshot({
    includeTools: true,
    forceRefresh: true,
  })
  const server = snapshot.groups[0]?.mcpServers.find(
    (candidate) => candidate.name === serverName,
  )

  if (!server) {
    await upsertMcpRegistryVerificationRecord({
      ...record,
      status: "failed-check",
      reason: "codex-server-not-found",
    })
    return codexRegistryCheckResult({
      serverName,
      status: "failed-check",
      reason: "codex-server-not-found",
    })
  }

  const transportType = getCodexSettingsTransportType(server)
  if (!CODEX_REMOTE_MCP_TRANSPORTS.has(transportType)) {
    const reason = `codex-check-remote-only:${transportType || "unknown"}`
    await upsertMcpRegistryVerificationRecord({
      ...record,
      status: "installed-unverified",
      reason,
    })
    return codexRegistryCheckResult({
      serverName,
      status: "installed-unverified",
      reason,
    })
  }

  const toolNames = server.tools
    .map((tool) => tool.name.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
  if (server.status !== "connected" || toolNames.length === 0) {
    const reason =
      server.status === "needs-auth"
        ? "codex-server-needs-auth"
        : "codex-tool-list-failed"
    await upsertMcpRegistryVerificationRecord({
      ...record,
      status: "failed-check",
      reason,
    })
    return codexRegistryCheckResult({
      serverName,
      status: "failed-check",
      reason,
    })
  }

  await upsertMcpRegistryVerificationRecord({
    ...record,
    status: "connected-unverified",
    reason: "codex-tools-visible-auto-verify-unavailable",
  })
  return codexRegistryCheckResult({
    serverName,
    status: "connected-unverified",
    toolNames,
    reason: "codex-tools-visible-auto-verify-unavailable",
  })
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

export async function writeCodexMcpServerConfig(input: {
  name: string
  scope: "global" | "project"
  projectPath?: string
  config: CodexMcpServerConfigWrite
}): Promise<{ success: true; name: string }> {
  if (input.scope !== "global") {
    throw new Error(
      "Codex MCP registry install currently supports global scope only.",
    )
  }

  const serverName = input.name.trim()
  if (!/^[a-zA-Z0-9_-]+$/.test(serverName)) {
    throw new Error(
      "Codex MCP server name must contain only letters, numbers, underscores, or hyphens.",
    )
  }

  const existing = await readCodexConfigToml()
  const withoutServer = removeCodexMcpServerTomlBlock(existing, serverName)
  const block = buildCodexMcpServerTomlBlock({
    name: serverName,
    config: input.config,
  })
  const next = `${withoutServer.trimEnd()}\n\n${block}`.trimStart()
  await writeCodexConfigToml(`${next.trimEnd()}\n`)
  clearCodexMcpConfigCache()
  return { success: true, name: serverName }
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

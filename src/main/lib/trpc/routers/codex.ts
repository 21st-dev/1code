import { observable } from "@trpc/server/observable"
import { eq } from "drizzle-orm"
import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { basename, isAbsolute, join, resolve } from "node:path"
import { z } from "zod"
import {
  normalizeCodexStreamChunk,
} from "../../../../shared/codex-tool-normalizer"
import {
  buildCodexCapabilityErrorChunk,
  buildCodexRuntimeStatusChunk,
  createCodexRuntimeBlocker,
} from "../../../../shared/codex-runtime-status"
import { sanitizeMcpConfigForRenderer } from "../../../../shared/mcp-import-preview"
import {
  captureGuardedGitStatus,
  formatScopeValidationError,
  validateAgentScopeContract,
  type GuardedGitStatusSnapshot,
  type ValidatedAgentScopeContract,
} from "../../agent-guard"
import {
  codexChatInputSchema,
} from "../../codex/chat-input-schema"
import {
  buildCodexUserParts,
  codexImageAttachmentSignatureFromInput,
  codexImageAttachmentSignatureFromParts,
  codexLongTextAttachmentSignatureFromInput,
  codexLongTextAttachmentSignatureFromParts,
  extractCodexPromptFromStoredMessage,
  getLastCodexSessionId,
  parseCodexStoredMessages,
} from "../../codex/chat-history"
import {
  extractCodexError as extractCodexErrorWithProviderRedaction,
  getCodexErrorDiagnostics,
  isCodexAuthError,
} from "../../codex/errors"
import { resolveCodexSelectedModelId } from "../../codex/model-selection"
import {
  appendCodexLoginOutput,
  redactCodexLoginOutput,
} from "../../codex/login-output"
import {
  cancelCodexLoginSession,
  createCodexLoginSession,
  getActiveCodexLoginSession,
  getCodexLoginSession,
  toCodexLoginSessionResponse,
} from "../../codex/login-session"
import {
  getCodexApiKeyStatus,
  readCodexApiKey,
  removeCodexApiKey as removeStoredCodexApiKey,
  saveCodexApiKey as saveStoredCodexApiKey,
} from "../../codex/api-key-store"
import {
  resolveBundledCodexCliPath,
} from "../../codex/cli-path"
import {
  runCodexCli,
  runCodexCliChecked,
} from "../../codex/cli-runner"
import {
  getCodexIntegrationStatus,
  isCodexIntegrationConnected,
  normalizeCodexIntegrationState,
} from "../../codex/integration-status"
import { getCodexRuntimeStatus } from "../../codex/runtime-status"
import type { CodexProviderProfileBinding } from "../../codex/provider-runtime-binding"
import {
  cleanupAllCodexAcpProviders,
  cleanupCodexAcpProvider,
} from "../../codex/acp-adapter"
import { createCodexDesktopRunRequest } from "../../codex/desktop-run-request"
import { createCodexAcpTemporaryCompatAdapter } from "../../codex/acp-temporary-compat-adapter"
import {
  type CodexAskUserQuestionApproval,
  type CodexAskUserQuestionPending,
} from "../../codex/ask-user-question"
import { resolveProjectPathFromWorktree } from "../../claude-config"
import { getDatabase, projects as projectsTable, subChats } from "../../db"
import { prepareChatImageAttachmentsForDesktopRun } from "../../chat-attachments"
import { getProviderGatewayEndpoint } from "../../provider-profiles/gateway"
import { getProviderProfileRuntimeConfig } from "../../provider-profiles/storage"
import { assertOfficialCloudAllowed } from "../../local-only"
import {
  DesktopRunPreflightError,
  verifyDesktopRunPreflight,
  type DesktopRunPreflightBlocker,
} from "../../agent-runtime/preflight"
import {
  resolveDesktopPermissionPolicy,
} from "../../agent-runtime/permission-policy"
import {
  appendRunEventsToAgentJob,
  createDesktopStreamEventMapper,
  redactRendererDiagnosticChunk,
} from "../../agent-runtime/stream-event-mapper"
import {
  fetchMcpTools,
  fetchMcpToolsStdio,
  type McpToolInfo,
} from "../../mcp-auth"
import { publicProcedure, router } from "../index"
import {
  completeDesktopChatAgentJobSafely,
  createAndRegisterDesktopChatAgentJob,
  requestCancelDesktopChatAgentJobSafely,
} from "../../desktop-agent-jobs"

type CodexMcpServerForSession =
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

type CodexMcpSnapshot = {
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

type ActiveCodexStream = {
  runId: string
  controller: AbortController
  cancelRequested: boolean
}

const activeStreams = new Map<string, ActiveCodexStream>()
const pendingCodexToolApprovals = new Map<
  string,
  CodexAskUserQuestionPending
>()

function clearPendingCodexApprovals(
  message = "Session cancelled.",
  subChatId?: string,
): void {
  for (const [toolUseId, pending] of pendingCodexToolApprovals) {
    if (subChatId && pending.subChatId !== subChatId) {
      continue
    }
    pending.resolve({ approved: false, message })
    pendingCodexToolApprovals.delete(toolUseId)
  }
}

/** Check if there are any active Codex streaming sessions */
export function hasActiveCodexStreams(): boolean {
  return activeStreams.size > 0
}

/** Abort all active Codex streams so their cleanup saves partial state */
export function abortAllCodexStreams(): void {
  for (const [subChatId, stream] of activeStreams) {
    console.log(`[codex] Aborting stream ${subChatId} before reload`)
    stream.controller.abort()
    clearPendingCodexApprovals("Session cancelled.", subChatId)
  }
  activeStreams.clear()
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
        env_http_headers: z.record(z.string(), z.string()).nullable().optional(),
      })
      .passthrough(),
    auth_status: z.string().nullable().optional(),
  })
  .passthrough()

type CodexMcpListEntry = z.infer<typeof codexMcpListEntrySchema>

function extractCodexError(error: unknown): { message: string; code?: string } {
  return extractCodexErrorWithProviderRedaction(error, {
    redactLoginOutput: redactCodexLoginOutput,
  })
}

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
    .filter(([name, val]) => typeof name === "string" && typeof val === "string")
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
    for (const [headerName, envName] of Object.entries(transport.env_http_headers)) {
      if (typeof headerName !== "string" || typeof envName !== "string") continue
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
    command.startsWith(".") ||
    command.includes("/") ||
    command.includes("\\")

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

async function fetchCodexMcpTools(entry: CodexMcpListEntry): Promise<McpToolInfo[]> {
  const transportType = entry.transport.type.trim().toLowerCase()
  const timeoutPromise = new Promise<McpToolInfo[]>((_, reject) =>
    setTimeout(() => reject(new Error("Timeout")), CODEX_MCP_TOOLS_FETCH_TIMEOUT_MS),
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

function resolveCodexLookupPath(pathCandidate: string | null | undefined): string {
  return pathCandidate && pathCandidate.trim() ? pathCandidate.trim() : "__global__"
}

function getCodexMcpFingerprint(servers: CodexMcpServerForSession[]): string {
  return createHash("sha256").update(JSON.stringify(servers)).digest("hex")
}

async function resolveCodexMcpSnapshot(params: {
  lookupPath?: string | null
  forceRefresh?: boolean
  includeTools?: boolean
}): Promise<CodexMcpSnapshot> {
  const lookupPath = resolveCodexLookupPath(params.lookupPath)
  const cached = codexMcpCache.get(lookupPath)
  const shouldIncludeTools = Boolean(params.includeTools)
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
        settingsConfig.envHttpHeaders = entry.transport.env_http_headers || undefined
        settingsConfig.bearerTokenEnvVar =
          entry.transport.bearer_token_env_var || undefined
      }

      const shouldProbeTools =
        shouldIncludeTools &&
        includeInSession &&
        !authState.needsAuth &&
        transportType !== "stdio" &&
        (
          // Probe unauthenticated/public HTTP servers. Avoid probing stdio
          // servers during startup because they can launch GUI/permission flows.
          !authState.supportsAuth ||
          // For auth-capable HTTP, only probe if explicit auth header is available.
          Boolean(resolvedHttpHeaders?.Authorization)
        )
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

function clearCodexMcpCache(): void {
  codexMcpCache.clear()
}

function getCodexServerIdentity(
  server: CodexMcpServerForSettings,
): string {
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
    globalServers.map((server) => [server.name, getCodexServerIdentity(server)]),
  )

  const groups: CodexMcpSnapshot["groups"] = [...globalSnapshot.groups]

  // Only enumerate projects the app knows about (DB-backed projects).
  // Do not scan ~/.codex/config.toml project entries.
  const projectPathSet = new Set<string>()

  try {
    const db = getDatabase()
    const dbProjects = db.select({ path: projectsTable.path }).from(projectsTable).all()
    for (const project of dbProjects) {
      if (typeof project.path === "string" && project.path.trim().length > 0) {
        projectPathSet.add(project.path)
      }
    }
  } catch (error) {
    console.error("[codex.getAllMcpConfig] Failed to read projects from DB:", error)
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
      console.error("[codex.getAllMcpConfig] Failed to resolve project MCP snapshot:", result.reason)
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

  return registeredProject.path
}

export const codexRouter = router({
  getRuntimeStatus: publicProcedure.query(() => getCodexRuntimeStatus()),

  getIntegration: publicProcedure.query(() => getCodexIntegrationStatus()),

  getCodexApiKeyStatus: publicProcedure.query(() => getCodexApiKeyStatus()),

  saveCodexApiKey: publicProcedure
    .input(z.object({ apiKey: z.string().min(1) }))
    .mutation(({ input }) => {
      const status = saveStoredCodexApiKey(input.apiKey)
      cleanupAllCodexAcpProviders()
      return status
    }),

  removeCodexApiKey: publicProcedure.mutation(() => {
    const status = removeStoredCodexApiKey()
    cleanupAllCodexAcpProviders()
    return status
  }),

  logout: publicProcedure.mutation(async () => {
    const logoutResult = await runCodexCli(["logout"])
    const statusResult = await runCodexCli(["login", "status"])

    const statusOutput = [statusResult.stdout, statusResult.stderr]
      .filter((chunk) => chunk.trim().length > 0)
      .join("\n")
      .trim()

    const state = normalizeCodexIntegrationState(statusOutput)
    const isConnected = isCodexIntegrationConnected(state)

    if (isConnected) {
      throw new Error("Failed to log out from Codex. Please try again.")
    }

    const logoutOutput = [logoutResult.stdout, logoutResult.stderr]
      .filter((chunk) => chunk.trim().length > 0)
      .join("\n")
      .trim()

    return {
      success: true,
      state,
      isConnected: false,
      logoutExitCode: logoutResult.exitCode,
      logoutOutput,
      statusOutput,
    }
  }),

  startLogin: publicProcedure.mutation(() => {
    const existingSession = getActiveCodexLoginSession()
    if (existingSession) {
      return toCodexLoginSessionResponse(existingSession)
    }

    const codexCliPath = resolveBundledCodexCliPath()
    const sessionId = crypto.randomUUID()

    const child = spawn(codexCliPath, ["login"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
      windowsHide: true,
    })

    const session = createCodexLoginSession({
      id: sessionId,
      process: child,
    })

    const handleChunk = (chunk: Buffer | string) => {
      appendCodexLoginOutput(session, chunk.toString("utf8"))
    }

    child.stdout.on("data", handleChunk)
    child.stderr.on("data", handleChunk)

    child.once("error", (error) => {
      session.state = "error"
      session.error = `[codex] Failed to start login flow: ${error.message}`
      session.process = null
    })

    child.once("close", (exitCode) => {
      session.exitCode = exitCode
      session.process = null

      if (session.state === "cancelled") {
        return
      }

      if (exitCode === 0) {
        session.state = "success"
        session.error = null
      } else {
        session.state = "error"
        session.error = session.error || `Codex login exited with code ${exitCode ?? "unknown"}`
      }
    })

    return toCodexLoginSessionResponse(session)
  }),

  getLoginSession: publicProcedure
    .input(
      z.object({
        sessionId: z.string(),
      }),
    )
    .query(({ input }) => {
      const session = getCodexLoginSession(input.sessionId)
      if (!session) {
        throw new Error("Codex login session not found")
      }

      return toCodexLoginSessionResponse(session)
    }),

  cancelLogin: publicProcedure
    .input(
      z.object({
        sessionId: z.string(),
      }),
    )
    .mutation(({ input }) => {
      return cancelCodexLoginSession(input.sessionId)
    }),

  getAllMcpConfig: publicProcedure.query(async () => {
    try {
      return await getAllCodexMcpConfigHandler()
    } catch (error) {
      console.error("[codex.getAllMcpConfig] Error:", error)
      return {
        groups: [],
        error: extractCodexError(error).message,
      }
    }
  }),

  refreshMcpConfig: publicProcedure.mutation(() => {
    clearCodexMcpCache()
    return { success: true }
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
        transport: z.enum(["stdio", "http"]),
        command: z.string().optional(),
        args: z.array(z.string()).optional(),
        url: z.string().url().optional(),
      }),
    )
    .mutation(async ({ input }) => {
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
      clearCodexMcpCache()
      return { success: true }
    }),

  removeMcpServer: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        scope: z.enum(["global", "project"]).default("global"),
      }),
    )
    .mutation(async ({ input }) => {
      if (input.scope !== "global") {
        throw new Error("Codex MCP currently supports global scope only.")
      }

      await runCodexCliChecked(["mcp", "remove", input.name.trim()])
      clearCodexMcpCache()
      return { success: true }
    }),

  startMcpOAuth: publicProcedure
    .input(
      z.object({
        serverName: z.string().min(1),
        projectPath: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const projectPath = resolveCodexMcpProjectPathForCli(input.projectPath)
        await runCodexCliChecked(["mcp", "login", input.serverName.trim()], {
          cwd: projectPath,
        })
        clearCodexMcpCache()
        return { success: true as const }
      } catch (error) {
        return {
          success: false as const,
          error: extractCodexError(error).message,
        }
      }
    }),

  logoutMcpServer: publicProcedure
    .input(
      z.object({
        serverName: z.string().min(1),
        projectPath: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const projectPath = resolveCodexMcpProjectPathForCli(input.projectPath)
        await runCodexCliChecked(["mcp", "logout", input.serverName.trim()], {
          cwd: projectPath,
        })
        clearCodexMcpCache()
        return { success: true as const }
      } catch (error) {
        return {
          success: false as const,
          error: extractCodexError(error).message,
        }
      }
    }),

  chat: publicProcedure
    .input(codexChatInputSchema)
    .subscription(({ input }) => {
      return observable<any>((emit) => {
        const existingStream = activeStreams.get(input.subChatId)
        if (existingStream) {
          existingStream.cancelRequested = true
          existingStream.controller.abort()
          // Ensure old run cannot continue emitting after supersede.
          cleanupCodexAcpProvider(input.subChatId)
        }

        const abortController = new AbortController()
        activeStreams.set(input.subChatId, {
          runId: input.runId,
          controller: abortController,
          cancelRequested: false,
        })

        let isActive = true
        let desktopJobId: string | null = null
        let desktopJobSawError = false
        let desktopJobReachedNaturalFinish = false
        let desktopJobAdapterFailed = false
        let desktopJobDb: ReturnType<typeof getDatabase> | null = null
        let desktopStreamEventMapper: ReturnType<
          typeof createDesktopStreamEventMapper
        > | null = null

        const safeEmit = (chunk: any) => {
          if (
            chunk?.type === "error" ||
            chunk?.type === "auth-error" ||
            chunk?.type === "capability-error" ||
            (chunk?.type === "runtime-status" && chunk?.ok === false)
          ) {
            desktopJobSawError = true
          }
          if (desktopJobDb && desktopStreamEventMapper && chunk?.type !== "finish") {
            try {
              const events = desktopStreamEventMapper.map(chunk)
              appendRunEventsToAgentJob(desktopJobDb, events)
            } catch (eventError) {
              console.warn("[codex] Failed to persist desktop run events:", eventError)
            }
          }
          if (!isActive) return
          try {
            const rendererChunk = redactRendererDiagnosticChunk({
              runtimeId: "codex",
              runId: input.runId,
              jobId: desktopJobId,
              chunk,
            })
            emit.next(rendererChunk)
          } catch {
            isActive = false
          }
        }

        const safeComplete = () => {
          if (!isActive) return
          isActive = false
          try {
            emit.complete()
          } catch {
            // Ignore double completion
          }
        }

        let guardedContract: ValidatedAgentScopeContract | null = null
        let guardedPreRunStatus: GuardedGitStatusSnapshot | null = null
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
                  runId: validated.runId ?? input.runId,
                }
                guardedPreRunStatus = await captureGuardedGitStatus(runtimeCwd)
              } catch (guardError) {
                safeEmit({
                  type: "error",
                  errorText: `Guarded run contract rejected: ${formatScopeValidationError(guardError)}`,
                })
                safeEmit({ type: "finish" })
                safeComplete()
                return
              }
            }
            const permissionPolicy = resolveDesktopPermissionPolicy({
              runtimeId: "codex",
              mode: input.mode,
              hasScopeContract: Boolean(guardedContract),
            })

            const emitPreflightBlocker = (
              blocker: DesktopRunPreflightBlocker,
              chunks: any[] = [],
            ) => {
              for (const chunk of chunks) safeEmit(chunk)
              const error = new DesktopRunPreflightError(blocker)
              safeEmit({
                type: blocker.status === "needs-auth" ? "auth-error" : "error",
                errorText: blocker.hint
                  ? `${error.message} ${blocker.hint}`
                  : error.message,
              })
              safeEmit({ type: "finish" })
              safeComplete()
            }
            const emitLocalOnlyPreflightBlocker = (
              operation: string,
              url?: string | null,
            ) => {
              try {
                assertOfficialCloudAllowed(operation, url)
                return false
              } catch (localOnlyError) {
                const message =
                  localOnlyError instanceof Error
                    ? localOnlyError.message
                    : String(localOnlyError)
                const blocker = createCodexRuntimeBlocker({
                  id: "local-only",
                  label: "Local-only policy",
                  status: "blocked",
                  ok: false,
                  message,
                  hint: "Choose a user-configured provider endpoint that is not an official upstream hosted URL, or explicitly disable local-only mode for hosted/internal testing.",
                })
                emitPreflightBlocker(
                  {
                    id: "local-only",
                    status: "blocked",
                    message: blocker.message,
                    hint: blocker.hint,
                  },
                  [
                    buildCodexRuntimeStatusChunk(blocker),
                    buildCodexCapabilityErrorChunk(blocker),
                  ],
                )
                return true
              }
            }

            const runtimeStatus = await getCodexRuntimeStatus()
            if (!runtimeStatus.ok) {
              const blocker =
                runtimeStatus.blockers[0] ??
                createCodexRuntimeBlocker({
                  id: "acp-runtime",
                  label: "Codex runtime",
                  status: "failed",
                  ok: false,
                  message: "Codex runtime is unavailable.",
                  hint: "Check Codex runtime status and try again.",
                })
              emitPreflightBlocker(
                {
                  id: "unsupported-capability",
                  status: "blocked",
                  message: blocker.message,
                  hint: blocker.hint,
                },
                [buildCodexRuntimeStatusChunk(blocker)],
              )
              return
            }

            const existingSubChat = db
              .select()
              .from(subChats)
              .where(eq(subChats.id, input.subChatId))
              .get()

            if (!existingSubChat) {
              throw new Error("Sub-chat not found")
            }

            const existingMessages = parseCodexStoredMessages(
              existingSubChat.messages,
            )
            const imageAttachments =
              await prepareChatImageAttachmentsForDesktopRun({
                images: input.images,
                emitPreflightBlocker,
              })
            if (!imageAttachments.ok) {
              return
            }
            const resolvedImages = imageAttachments.attachments
            let codexProviderProfile:
              | {
                  id: string
                  name: string
                  baseUrl: string
                  token: string
                }
              | undefined
            let appManagedCodexApiKey: string | null = null
            const wantsAppManagedCodexApiKey =
              input.codexAuthMethod === "api_key" && !input.providerProfileId

            if (input.providerProfileId) {
              const profile = getProviderProfileRuntimeConfig(input.providerProfileId)
              if (!profile || !profile.targetRuntimes.includes("codex")) {
                const blocker = createCodexRuntimeBlocker({
                  id: "provider-profile",
                  label: "Codex provider profile",
                  status: "unavailable",
                  ok: false,
                  message: "Provider profile is not available for Codex.",
                  hint: "Choose a provider profile that targets Codex.",
                })
                emitPreflightBlocker(
                  {
                    id: "provider-profile",
                    status: "blocked",
                    message: blocker.message,
                    hint: blocker.hint,
                  },
                  [
                    buildCodexRuntimeStatusChunk(blocker),
                    buildCodexCapabilityErrorChunk(blocker),
                  ],
                )
                return
              }
              if (
                emitLocalOnlyPreflightBlocker(
                  "use Codex provider endpoint",
                  profile.baseUrl,
                )
              ) {
                return
              }
              const gateway = await getProviderGatewayEndpoint(profile.id, "responses")
              codexProviderProfile = {
                id: profile.id,
                name: profile.name,
                baseUrl: gateway.baseUrl,
                token: gateway.token,
              }
            } else if (wantsAppManagedCodexApiKey) {
              appManagedCodexApiKey = readCodexApiKey()
              if (!appManagedCodexApiKey) {
                const blocker = createCodexRuntimeBlocker({
                  id: "login",
                  label: "Codex API key",
                  status: "needs-auth",
                  ok: false,
                  message: "Saved Codex API key is required.",
                  hint: "Save a Codex API key again from onboarding or Settings > Models.",
                })
                emitPreflightBlocker(
                  {
                    id: "provider-profile",
                    status: "needs-auth",
                    message: blocker.message,
                    hint: blocker.hint,
                  },
                  [
                    buildCodexRuntimeStatusChunk(blocker),
                    buildCodexCapabilityErrorChunk(blocker),
                  ],
                )
                return
              }
            } else {
              const integration = await getCodexIntegrationStatus()
              if (!integration.isConnected) {
                const blocker = createCodexRuntimeBlocker({
                  id: "login",
                  label: "Codex login",
                  status: "needs-auth",
                  ok: false,
                  message: "Codex login or API key is required.",
                  hint: "Connect Codex with ChatGPT login or choose a Codex API key/provider profile.",
                })
                emitPreflightBlocker(
                  {
                    id: "provider-profile",
                    status: "needs-auth",
                    message: blocker.message,
                    hint: blocker.hint,
                  },
                  [
                    buildCodexRuntimeStatusChunk(blocker),
                    buildCodexCapabilityErrorChunk(blocker),
                  ],
                )
                return
              }
            }
            const selectedModelId = resolveCodexSelectedModelId({
              requestedModel: input.model,
              hasAppManagedApiKey: Boolean(appManagedCodexApiKey),
            })
            const metadataModel = selectedModelId

            const lastMessage = existingMessages[existingMessages.length - 1]
            const isDuplicatePrompt =
              lastMessage?.role === "user" &&
              extractCodexPromptFromStoredMessage(lastMessage) === input.prompt &&
              codexLongTextAttachmentSignatureFromParts(lastMessage?.parts) ===
                codexLongTextAttachmentSignatureFromInput(input.longTextAttachments) &&
              codexImageAttachmentSignatureFromParts(lastMessage?.parts) ===
                codexImageAttachmentSignatureFromInput(input.images)

            let messagesForStream = existingMessages
            const isAuthoritativeRun = () => {
              const currentStream = activeStreams.get(input.subChatId)
              return !currentStream || currentStream.runId === input.runId
            }

            const persistSubChatMessages = (messages: any[]) => {
              if (!isAuthoritativeRun()) {
                return false
              }

              db.update(subChats)
                .set({
                  messages: JSON.stringify(messages),
                  updatedAt: new Date(),
                })
                .where(eq(subChats.id, input.subChatId))
                .run()
              return true
            }

            if (!isDuplicatePrompt) {
              const userMessage = {
                id: crypto.randomUUID(),
                role: "user",
                createdAt: new Date().toISOString(),
                parts: buildCodexUserParts(
                  input.prompt,
                  input.images,
                  input.longTextAttachments,
                ),
                metadata: { model: metadataModel, provider: "codex" },
              }

              messagesForStream = [...existingMessages, userMessage]

              db.update(subChats)
                .set({
                  messages: JSON.stringify(messagesForStream),
                  updatedAt: new Date(),
                })
                .where(eq(subChats.id, input.subChatId))
                .run()
            }

            if (input.forceNewSession) {
              cleanupCodexAcpProvider(input.subChatId)
            }

            let mcpSnapshot: CodexMcpSnapshot = {
              mcpServersForSession: [],
              groups: [],
              fingerprint: getCodexMcpFingerprint([]),
              fetchedAt: Date.now(),
              toolsResolved: false,
            }
            try {
              const resolvedProjectPathFromCwd = resolveProjectPathFromWorktree(
                runtimeCwd,
              )
              const mcpLookupPath =
                input.projectPath || resolvedProjectPathFromCwd || runtimeCwd
              mcpSnapshot = await resolveCodexMcpSnapshot({
                lookupPath: mcpLookupPath,
              })
            } catch (mcpError) {
              const message = extractCodexError(mcpError).message
              const blocker = createCodexRuntimeBlocker({
                id: "mcp",
                label: "Codex MCP configuration",
                status: "failed",
                ok: false,
                message: `Codex MCP configuration failed: ${message}`,
                hint: "Fix Codex MCP configuration or disable the failing MCP server.",
              })
              console.error("[codex] Failed to resolve MCP servers:", message)
              emitPreflightBlocker(
                {
                  id: "mcp",
                  status: "blocked",
                  message: blocker.message,
                  hint: blocker.hint,
                },
                [
                  buildCodexRuntimeStatusChunk(blocker),
                  buildCodexCapabilityErrorChunk(blocker),
                ],
              )
              return
            }

            const needsAuthMcpServer = mcpSnapshot.groups
              .flatMap((group) => group.mcpServers)
              .find((server) => server.needsAuth || server.status === "needs-auth")
            if (needsAuthMcpServer) {
              const blocker = createCodexRuntimeBlocker({
                id: "mcp",
                label: "Codex MCP auth",
                status: "needs-auth",
                ok: false,
                message: `Codex MCP server '${needsAuthMcpServer.name}' needs authentication.`,
                hint: "Authenticate the MCP server before starting this Codex run.",
              })
              emitPreflightBlocker(
                {
                  id: "mcp",
                  status: "needs-auth",
                  message: blocker.message,
                  hint: blocker.hint,
                },
                [
                  buildCodexRuntimeStatusChunk(blocker),
                  buildCodexCapabilityErrorChunk(blocker),
                ],
              )
              return
            }

            const desktopJob = createAndRegisterDesktopChatAgentJob(db, {
              runtime: "codex",
              mode: input.mode,
              chatId: input.chatId,
              subChatId: input.subChatId,
              cwd: runtimeCwd,
              prompt: input.prompt,
              runId: input.runId,
              permissionPolicy,
              cancel: () => {
                const activeStream = activeStreams.get(input.subChatId)
                if (activeStream?.runId !== input.runId) return
                activeStream.cancelRequested = true
                activeStream.controller.abort()
                clearPendingCodexApprovals("Session cancelled.", input.subChatId)
              },
            })
            desktopJobId = desktopJob.job.id
            desktopStreamEventMapper = createDesktopStreamEventMapper({
              runtimeId: "codex",
              runId: input.runId,
              jobId: desktopJobId,
            })

            const desktopRunRequest = createCodexDesktopRunRequest({
              runId: input.runId,
              jobId: desktopJobId,
              mode: input.mode,
              preflight: verifiedRunContext,
              prompt: input.prompt,
              permissionPolicy,
              providerBinding: {
                model: metadataModel,
                modelSource: input.model ? "request" : "default",
                providerProfileId: codexProviderProfile?.id ?? null,
                gatewayEndpoint: codexProviderProfile?.baseUrl ?? null,
                authMode: codexProviderProfile
                  ? "provider-profile"
                  : appManagedCodexApiKey
                    ? "app-managed"
                    : "runtime-managed",
              },
              mcpServers: mcpSnapshot.mcpServersForSession,
              images: input.images,
              longTextAttachments: input.longTextAttachments,
              signal: abortController.signal,
              resumeSessionId: input.forceNewSession
                ? null
                : input.sessionId ?? getLastCodexSessionId(existingMessages) ?? null,
              parentSessionId: input.sessionId ?? null,
              emitTrace: (event) => {
                appendRunEventsToAgentJob(db, [event])
              },
            })

            const codexAdapter = createCodexAcpTemporaryCompatAdapter({
              mcpServers: mcpSnapshot.mcpServersForSession,
              mcpFingerprint: mcpSnapshot.fingerprint,
              appManagedApiKey: codexProviderProfile
                ? null
                : appManagedCodexApiKey,
              providerProfile: codexProviderProfile,
              modelId: selectedModelId,
              images: resolvedImages,
              longTextAttachments: input.longTextAttachments,
              messagesForStream,
              guardedRun:
                guardedContract && guardedPreRunStatus
                  ? {
                      contract: guardedContract,
                      preRunStatus: guardedPreRunStatus,
                      startedAt: guardedRunStartedAt,
                      events: [],
                    }
                  : null,
              emit: safeEmit,
              persistMessages: persistSubChatMessages,
              registerPendingQuestion: (toolUseId, pending) => {
                pendingCodexToolApprovals.set(toolUseId, pending)
              },
              unregisterPendingQuestion: (toolUseId) => {
                pendingCodexToolApprovals.delete(toolUseId)
              },
              generateMessageId: () => crypto.randomUUID(),
            })

            const adapterResult = await codexAdapter.run(desktopRunRequest)

            desktopJobAdapterFailed = adapterResult.status === "failed"
            if (desktopJobAdapterFailed) {
              desktopJobSawError = true
            }
            desktopJobReachedNaturalFinish =
              adapterResult.status === "succeeded" && !desktopJobSawError
            safeComplete()
          } catch (error) {
            const normalized = extractCodexError(error)

            console.error("[codex-acp] chat stream error", {
              subChatId: input.subChatId.slice(-8),
              ...getCodexErrorDiagnostics(error),
              message: normalized.message,
            })
            if (isCodexAuthError(normalized)) {
              safeEmit({ type: "auth-error", errorText: normalized.message })
            } else {
              safeEmit({ type: "error", errorText: normalized.message })
            }
            safeEmit({ type: "finish" })
            safeComplete()
          } finally {
            if (desktopJobId) {
              const jobDb = desktopJobDb ?? getDatabase()
              completeDesktopChatAgentJobSafely(jobDb, {
                jobId: desktopJobId,
                runtime: "codex",
                aborted:
                  abortController.signal.aborted && !desktopJobAdapterFailed,
                reachedNaturalFinish: desktopJobReachedNaturalFinish,
                sawError: desktopJobSawError || desktopJobAdapterFailed,
                result: {
                  runtime: "codex",
                  subChatId: input.subChatId,
                  chatId: input.chatId,
                  runId: input.runId,
                },
              })
            }
            const activeStream = activeStreams.get(input.subChatId)
            if (activeStream?.runId === input.runId) {
              const shouldCleanupProvider =
                abortController.signal.aborted || activeStream.cancelRequested
              if (shouldCleanupProvider) {
                cleanupCodexAcpProvider(input.subChatId)
              }
              clearPendingCodexApprovals("Session cancelled.", input.subChatId)
              activeStreams.delete(input.subChatId)
            }
          }
        })()

        return () => {
          isActive = false
          requestCancelDesktopChatAgentJobSafely(desktopJobDb ?? getDatabase(), {
            jobId: desktopJobId,
            sawError: desktopJobSawError,
            reachedNaturalFinish: desktopJobReachedNaturalFinish,
            requestedBy: "desktop-chat",
          })
          abortController.abort()

          const activeStream = activeStreams.get(input.subChatId)
          if (activeStream?.runId === input.runId) {
            activeStream.cancelRequested = true
          }
        }
      })
    }),

  cancel: publicProcedure
    .input(
      z.object({
        subChatId: z.string(),
        runId: z.string(),
      }),
    )
    .mutation(({ input }) => {
      const activeStream = activeStreams.get(input.subChatId)
      if (!activeStream) {
        return { cancelled: false, ignoredStale: false }
      }

      if (activeStream.runId !== input.runId) {
        return { cancelled: false, ignoredStale: true }
      }

      activeStream.cancelRequested = true
      activeStream.controller.abort()
      clearPendingCodexApprovals("Session cancelled.", input.subChatId)

      return { cancelled: true, ignoredStale: false }
    }),

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
      const pending = pendingCodexToolApprovals.get(input.toolUseId)
      if (!pending) {
        return { ok: false }
      }
      const response: CodexAskUserQuestionApproval = {
        approved: input.approved,
        message: input.message,
        updatedInput: input.updatedInput,
      }
      pending.resolve(response)
      pendingCodexToolApprovals.delete(input.toolUseId)
      return { ok: true }
    }),

  cleanup: publicProcedure
    .input(z.object({ subChatId: z.string() }))
    .mutation(({ input }) => {
      cleanupCodexAcpProvider(input.subChatId)

      const activeStream = activeStreams.get(input.subChatId)
      if (activeStream) {
        activeStream.controller.abort()
        clearPendingCodexApprovals("Session cancelled.", input.subChatId)
        activeStreams.delete(input.subChatId)
      }

      return { success: true }
    }),
})

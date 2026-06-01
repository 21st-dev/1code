import { createACPProvider, type ACPProvider } from "@mcpc-tech/acp-ai-provider"
import { observable } from "@trpc/server/observable"
import { streamText } from "ai"
import { eq } from "drizzle-orm"
import { app } from "electron"
import { spawn, type ChildProcess } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path"
import { z } from "zod"
import {
  normalizeCodexAssistantMessage,
  normalizeCodexStreamChunk,
} from "../../../../shared/codex-tool-normalizer"
import type { AgentGuardEvent } from "../../../../shared/agent-scope-contracts"
import { redactProviderSecrets } from "../../../../shared/provider-profile-security"
import {
  buildCodexCapabilityErrorChunk,
  buildCodexRuntimeAvailability,
  buildCodexRuntimeAvailabilityFromComponents,
  buildCodexRuntimeStatusChunk,
  createCodexRuntimeComponent,
  createCodexRuntimeBlocker,
} from "../../../../shared/codex-runtime-status"
import {
  buildCodexRuntimeCapabilityErrorChunk,
  getCodexRuntimeCapabilities,
  getCodexRunRequiredCapability,
} from "../../../../shared/codex-runtime-capabilities"
import { preparePromptWithAppAgents } from "../../app-agents/prompt"
import {
  agentScopeContractInputSchema,
  buildGuardedRunAudit,
  buildGuardedRunPromptBlock,
  captureGuardedGitStatus,
  formatScopeValidationError,
  validateAgentScopeContract,
  type GuardedGitStatusSnapshot,
  type ValidatedAgentScopeContract,
} from "../../agent-guard"
import {
  createCodexAcpPermissionHandler,
  installCodexAcpPermissionHandler,
} from "../../codex/acp-permission"
import {
  createCodexAskUserQuestionTools,
  installCodexAskUserQuestionAcpResultNormalizer,
  type CodexAskUserQuestionApproval,
  type CodexAskUserQuestionPending,
} from "../../codex/ask-user-question"
import type { UIMessageChunk } from "../../claude/types"
import { getClaudeShellEnvironment } from "../../claude/env"
import { resolveProjectPathFromWorktree } from "../../claude-config"
import { getDatabase, projects as projectsTable, subChats } from "../../db"
import { resolveChatImageAttachments } from "../../chat-attachments"
import { prependLongTextAttachmentPromptBlocks } from "../../long-text-attachments"
import { getRuntimeExecutableStatus } from "../../runtime-executable"
import { getProviderGatewayEndpoint } from "../../provider-profiles/gateway"
import { getProviderProfileRuntimeConfig } from "../../provider-profiles/storage"
import { isLocalOnlyMode } from "../../local-only"
import {
  fetchMcpTools,
  fetchMcpToolsStdio,
  type McpToolInfo,
} from "../../mcp-auth"
import { publicProcedure, router } from "../index"

const imageAttachmentSchema = z.object({
  base64Data: z.string().optional(),
  localRef: z.string().optional(),
  attachmentId: z.string().optional(),
  mediaType: z.string(),
  filename: z.string().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  sha256: z.string().optional(),
})

const longTextAttachmentSchema = z.object({
  type: z.literal("long-text-attachment").optional(),
  attachmentId: z.string(),
  localRef: z.string(),
  filename: z.string(),
  byteLength: z.number().int().nonnegative(),
  preview: z.string().optional(),
  kind: z.enum(["pasted", "chatHistory"]),
})

function buildLongTextAttachmentParts(
  attachments: z.infer<typeof longTextAttachmentSchema>[] | undefined
): any[] {
  return (attachments ?? []).map((attachment) => ({
    type: "long-text-attachment",
    attachmentId: attachment.attachmentId,
    localRef: attachment.localRef,
    filename: attachment.filename,
    byteLength: attachment.byteLength,
    preview: attachment.preview ?? "",
    kind: attachment.kind,
  }))
}

function longTextAttachmentSignatureFromParts(parts: any[] | undefined): string {
  return JSON.stringify(
    (parts ?? [])
      .filter((part: any) => part?.type === "long-text-attachment")
      .map((part: any) => ({
        localRef: part.localRef,
        byteLength: part.byteLength,
        kind: part.kind,
      }))
  )
}

function longTextAttachmentSignatureFromInput(
  attachments: z.infer<typeof longTextAttachmentSchema>[] | undefined
): string {
  return JSON.stringify(
    (attachments ?? []).map((attachment) => ({
      localRef: attachment.localRef,
      byteLength: attachment.byteLength,
      kind: attachment.kind,
    }))
  )
}

function chatImageAttachmentSignatureFromParts(parts: any[] | undefined): string {
  return JSON.stringify(
    (parts ?? [])
      .filter(
        (part: any) =>
          part?.type === "attachment-image" || part?.type === "data-image",
      )
      .map((part: any) => {
        if (part.type === "attachment-image") {
          return {
            localRef: part.localRef,
            sizeBytes: part.sizeBytes,
            mediaType: part.mediaType,
          }
        }
        return {
          legacy: true,
          filename: part.data?.filename,
          mediaType: part.data?.mediaType,
          base64Length:
            typeof part.data?.base64Data === "string"
              ? part.data.base64Data.length
              : 0,
        }
      })
  )
}

function chatImageAttachmentSignatureFromInput(
  images: z.infer<typeof imageAttachmentSchema>[] | undefined
): string {
  return JSON.stringify(
    (images ?? []).map((image) => ({
      localRef: image.localRef,
      sizeBytes: image.sizeBytes,
      mediaType: image.mediaType,
      legacy: image.localRef ? undefined : Boolean(image.base64Data),
      base64Length:
        !image.localRef && image.base64Data ? image.base64Data.length : 0,
    }))
  )
}

type CodexProviderSession = {
  provider: ACPProvider
  cwd: string
  authFingerprint: string | null
  mcpFingerprint: string
  providerProfileId: string | null
}

type CodexLoginSessionState =
  | "running"
  | "success"
  | "error"
  | "cancelled"

type CodexLoginSession = {
  id: string
  process: ChildProcess | null
  state: CodexLoginSessionState
  output: string
  rawOutput: string
  url: string | null
  error: string | null
  exitCode: number | null
}

type CodexIntegrationState =
  | "connected_chatgpt"
  | "connected_api_key"
  | "not_logged_in"
  | "unknown"

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

const providerSessions = new Map<string, CodexProviderSession>()
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
const loginSessions = new Map<string, CodexLoginSession>()
const codexMcpCache = new Map<string, CodexMcpSnapshot>()

const URL_CANDIDATE_REGEX = /https?:\/\/[^\s]+/g
const ANSI_ESCAPE_REGEX = /\u001B\[[0-?]*[ -/]*[@-~]/g
const ANSI_OSC_REGEX = /\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g

const AUTH_HINTS = [
  "not logged in",
  "authentication required",
  "auth required",
  "login required",
  "missing credentials",
  "no credentials",
  "unauthorized",
  "forbidden",
  "codex login",
  "401",
  "403",
]
const DEFAULT_CODEX_MODEL = "gpt-5.5/high"
const CODEX_MCP_TOOLS_FETCH_TIMEOUT_MS = 40_000
const CODEX_USAGE_POLL_ATTEMPTS = 3
const CODEX_USAGE_POLL_INTERVAL_MS = 200
const CODEX_ACP_SPAWN_PROBE_TIMEOUT_MS = 5_000

type CodexTokenUsage = {
  input_tokens?: number
  cached_input_tokens?: number
  output_tokens?: number
  total_tokens?: number
}

type CodexTokenCountInfo = {
  last_token_usage?: CodexTokenUsage
  model_context_window?: number
}

type CodexUsageMetadata = {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  modelContextWindow?: number
}

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

type CodexAcpSpawnProbeStatus = {
  ok: boolean
  exitCode: number | null
  signal: string | null
  error: string | null
  stdoutPreview: string
  stderrPreview: string
  durationMs: number
}

type CodexAuthMethodId = "chatgpt" | "codex-api-key"

function getCodexPackageName(): string {
  const platform = process.platform
  const arch = process.arch

  if (platform === "darwin") {
    if (arch === "arm64") return "@zed-industries/codex-acp-darwin-arm64"
    if (arch === "x64") return "@zed-industries/codex-acp-darwin-x64"
  }

  if (platform === "linux") {
    if (arch === "arm64") return "@zed-industries/codex-acp-linux-arm64"
    if (arch === "x64") return "@zed-industries/codex-acp-linux-x64"
  }

  if (platform === "win32") {
    if (arch === "arm64") return "@zed-industries/codex-acp-win32-arm64"
    if (arch === "x64") return "@zed-industries/codex-acp-win32-x64"
  }

  throw new Error(`Unsupported platform/arch for codex-acp: ${platform}/${arch}`)
}

function toUnpackedAsarPath(filePath: string): string {
  const unpackedPath = filePath.replace(
    `${sep}app.asar${sep}`,
    `${sep}app.asar.unpacked${sep}`,
  )

  if (unpackedPath !== filePath && existsSync(unpackedPath)) {
    return unpackedPath
  }

  return filePath
}

function resolveCodexAcpBinaryPath(): string {
  const packageName = getCodexPackageName()
  const binaryName = process.platform === "win32" ? "codex-acp.exe" : "codex-acp"
  const codexPackageRoot = dirname(
    require.resolve("@zed-industries/codex-acp/package.json"),
  )
  const resolvedPath = require.resolve(`${packageName}/bin/${binaryName}`, {
    // Resolve relative to the wrapper package so nested optional deps work in packaged apps.
    paths: [codexPackageRoot],
  })

  return toUnpackedAsarPath(resolvedPath)
}

function getBundledCodexCliPath(): string {
  const binaryName = process.platform === "win32" ? "codex.exe" : "codex"
  const resourcesDir = app.isPackaged
    ? join(process.resourcesPath, "bin")
    : join(
        app.getAppPath(),
        "resources",
        "bin",
        `${process.platform}-${process.arch}`,
      )

  return join(resourcesDir, binaryName)
}

function resolveBundledCodexCliPath(): string {
  const binaryPath = getBundledCodexCliPath()
  if (existsSync(binaryPath)) {
    return binaryPath
  }

  const hint = app.isPackaged
    ? "Binary is missing from bundled resources."
    : "Run `bun run codex:download` to download it for local dev."

  throw new Error(
    `[codex] Bundled Codex CLI not found at ${binaryPath}. ${hint}`,
  )
}

function previewProcessOutput(output: string): string {
  return stripAnsi(output).replace(/\s+/g, " ").trim().slice(0, 240)
}

async function probeCodexAcpSpawn(
  acpPath: string | null,
): Promise<CodexAcpSpawnProbeStatus> {
  const startedAt = Date.now()

  if (!acpPath) {
    return {
      ok: false,
      exitCode: null,
      signal: null,
      error: "Codex ACP runtime path could not be resolved.",
      stdoutPreview: "",
      stderrPreview: "",
      durationMs: Date.now() - startedAt,
    }
  }

  return await new Promise((resolvePromise) => {
    let child: ChildProcess | null = null
    let timeout: ReturnType<typeof setTimeout> | null = null
    let stdout = ""
    let stderr = ""
    let settled = false

    const appendOutput = (current: string, chunk: Buffer | string): string =>
      `${current}${chunk.toString()}`.slice(-8_000)

    const finish = (
      status: Omit<CodexAcpSpawnProbeStatus, "durationMs">,
    ) => {
      if (settled) return
      settled = true
      if (timeout) {
        clearTimeout(timeout)
      }
      resolvePromise({
        ...status,
        durationMs: Date.now() - startedAt,
      })
    }

    try {
      child = spawn(acpPath, ["--help"], {
        stdio: ["ignore", "pipe", "pipe"],
        cwd: homedir(),
      })
    } catch (error) {
      finish({
        ok: false,
        exitCode: null,
        signal: null,
        error:
          error instanceof Error
            ? error.message
            : "Codex ACP spawn probe failed before process start.",
        stdoutPreview: "",
        stderrPreview: "",
      })
      return
    }

    timeout = setTimeout(() => {
      try {
        child?.kill("SIGTERM")
      } catch {}
      finish({
        ok: false,
        exitCode: null,
        signal: "timeout",
        error: `codex-acp --help timed out after ${CODEX_ACP_SPAWN_PROBE_TIMEOUT_MS}ms.`,
        stdoutPreview: previewProcessOutput(stdout),
        stderrPreview: previewProcessOutput(stderr),
      })
    }, CODEX_ACP_SPAWN_PROBE_TIMEOUT_MS)

    child.stdout?.on("data", (chunk) => {
      stdout = appendOutput(stdout, chunk)
    })
    child.stderr?.on("data", (chunk) => {
      stderr = appendOutput(stderr, chunk)
    })
    child.once("error", (error) => {
      finish({
        ok: false,
        exitCode: null,
        signal: null,
        error: error.message,
        stdoutPreview: previewProcessOutput(stdout),
        stderrPreview: previewProcessOutput(stderr),
      })
    })
    child.once("close", (exitCode, signal) => {
      finish({
        ok: exitCode === 0,
        exitCode,
        signal,
        error:
          exitCode === 0
            ? null
            : `codex-acp --help exited with code ${exitCode ?? "null"}${
                signal ? ` and signal ${signal}` : ""
              }.`,
        stdoutPreview: previewProcessOutput(stdout),
        stderrPreview: previewProcessOutput(stderr),
      })
    })
  })
}

async function getCodexRuntimeStatus() {
  const cliHint = app.isPackaged
    ? "Reinstall the app so the bundled Codex command is restored."
    : "Run `bun run codex:download` from the repo, then restart the dev app."
  const acpHint = app.isPackaged
    ? "Reinstall the app so the bundled Codex ACP runtime is restored."
    : "Run `bun install` from the repo, then restart the dev app."

  let acpPath: string | null = null
  let acpResolveError: string | null = null
  try {
    acpPath = resolveCodexAcpBinaryPath()
  } catch (error) {
    acpResolveError =
      error instanceof Error
        ? error.message
        : "Codex ACP runtime path could not be resolved."
  }

  const loginCli = getRuntimeExecutableStatus(
    getBundledCodexCliPath(),
    cliHint,
  )
  const acp = getRuntimeExecutableStatus(acpPath, acpHint)
  const spawnProbe = acp.ok
    ? await probeCodexAcpSpawn(acp.path)
    : {
        ok: false,
        exitCode: null,
        signal: null,
        error: acp.error,
        stdoutPreview: "",
        stderrPreview: "",
        durationMs: 0,
      }
  const acpWithProbe = { ...acp, spawnProbe }
  const resolvedAcp = acpResolveError
    ? { ...acpWithProbe, error: acpResolveError }
    : acpWithProbe
  const runtimeAvailability = buildCodexRuntimeAvailability({
    loginCli,
    acp: resolvedAcp,
  })
  const extraComponents = [
    createCodexRuntimeComponent({
      id: "provider-profile",
      label: "Codex provider profile",
      status: "unknown",
      ok: true,
      blocking: false,
      error: null,
      hint: "Provider profile availability is checked for the selected run.",
    }),
    createCodexRuntimeComponent({
      id: "mcp",
      label: "Codex MCP configuration",
      status: "unknown",
      ok: true,
      blocking: false,
      error: null,
      hint: "MCP configuration and auth are checked for the selected project before each run.",
    }),
    createCodexRuntimeComponent({
      id: "local-only",
      label: "Local-only policy",
      status: isLocalOnlyMode() ? "ready" : "unknown",
      ok: true,
      blocking: false,
      error: null,
      hint: isLocalOnlyMode()
        ? "Local-only policy is active; Codex runs use local runtime components and user-selected providers."
        : "Local-only policy is disabled by environment configuration.",
    }),
  ]

  if (loginCli.ok) {
    try {
      const integration = await getCodexIntegrationStatus()
      extraComponents.unshift(
        createCodexRuntimeComponent({
          id: "login",
          label: "Codex login",
          status: integration.isConnected ? "ready" : "needs-auth",
          ok: integration.isConnected,
          blocking: false,
          error: integration.isConnected
            ? null
            : "Codex login or API key is required for ChatGPT-backed Codex runs.",
          hint: integration.isConnected
            ? "Codex login is connected."
            : "Connect Codex with ChatGPT login, use a Codex API key, or choose a provider profile.",
        }),
      )
    } catch (error) {
      const normalized = extractCodexError(error)
      extraComponents.unshift(
        createCodexRuntimeComponent({
          id: "login",
          label: "Codex login",
          status: "failed",
          ok: false,
          blocking: false,
          error: normalized.message,
          hint: "Codex login status could not be checked.",
        }),
      )
    }
  } else {
    extraComponents.unshift(
      createCodexRuntimeComponent({
        id: "login",
        label: "Codex login",
        status: "blocked",
        ok: false,
        blocking: false,
        error: "Codex CLI is unavailable, so login status cannot be checked.",
        hint: loginCli.hint,
      }),
    )
  }
  const availability = buildCodexRuntimeAvailabilityFromComponents([
    ...runtimeAvailability.components,
    ...extraComponents,
  ])

  return {
    runtime: "codex" as const,
    requiresGlobalCli: false,
    ok: availability.ok,
    loginCli,
    acp: resolvedAcp,
    components: availability.components,
    blockers: availability.blockers,
    capabilities: getCodexRuntimeCapabilities(),
  }
}

function stripAnsi(input: string): string {
  return input.replace(ANSI_OSC_REGEX, "").replace(ANSI_ESCAPE_REGEX, "")
}

function isLocalhostHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase()
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    normalized.endsWith(".localhost")
  )
}

function extractFirstNonLocalhostUrl(output: string): string | null {
  const matches = stripAnsi(output).match(URL_CANDIDATE_REGEX)
  if (!matches) return null

  for (const match of matches) {
    try {
      const parsedUrl = new URL(match.trim().replace(/[),.;!?]+$/, ""))
      if (!isLocalhostHostname(parsedUrl.hostname)) {
        return parsedUrl.toString()
      }
    } catch {
      // Ignore invalid URL candidates.
    }
  }

  return null
}

function redactUrlForDisplay(match: string): string {
  const trailingMatch = match.match(/[),.;!?]+$/)
  const trailing = trailingMatch?.[0] ?? ""
  const rawUrl = trailing ? match.slice(0, -trailing.length) : match

  try {
    const parsedUrl = new URL(rawUrl)
    if (isLocalhostHostname(parsedUrl.hostname)) {
      return match
    }

    const hadSearch = parsedUrl.search.length > 0
    const hadHash = parsedUrl.hash.length > 0
    parsedUrl.search = ""
    parsedUrl.hash = ""

    return [
      parsedUrl.toString(),
      hadSearch ? "?[redacted]" : "",
      hadHash ? "#[redacted]" : "",
      trailing,
    ].join("")
  } catch {
    return match
  }
}

function redactCodexLoginOutput(output: string): string {
  return output
    .replace(URL_CANDIDATE_REGEX, redactUrlForDisplay)
    .replace(/sk-[A-Za-z0-9_-]{16,}/g, "sk-[redacted]")
    .replace(
      /("(?:access|refresh|id)_?token"\s*:\s*")[^"]+(")/gi,
      "$1[redacted]$2",
    )
    .replace(
      /\b((?:access|refresh|id)_?token|code|state|nonce|verifier)\s*=\s*[^\s]+/gi,
      "$1=[redacted]",
    )
}

function appendLoginOutput(session: CodexLoginSession, chunk: string): void {
  const cleanChunk = stripAnsi(chunk)
  if (!cleanChunk) return

  session.rawOutput += cleanChunk
  session.output += redactCodexLoginOutput(cleanChunk)

  if (!session.url) {
    session.url = extractFirstNonLocalhostUrl(session.rawOutput)
  }
}

function toLoginSessionResponse(session: CodexLoginSession) {
  return {
    sessionId: session.id,
    state: session.state,
    url: session.url,
    output: session.output,
    error: session.error,
    exitCode: session.exitCode,
  }
}

function getActiveLoginSession(): CodexLoginSession | null {
  for (const session of loginSessions.values()) {
    if (session.state === "running" && session.process && !session.process.killed) {
      return session
    }
  }

  return null
}

function extractCodexError(error: unknown): { message: string; code?: string } {
  const anyError = error as any
  const message =
    anyError?.data?.message ||
    anyError?.errorText ||
    anyError?.message ||
    anyError?.error ||
    String(error)
  const code = anyError?.data?.code || anyError?.code

  const rawMessage = typeof message === "string" ? message : String(message)
  const redactedMessage = redactCodexLoginOutput(redactProviderSecrets(rawMessage))

  return {
    message: redactedMessage,
    code: typeof code === "string" ? code : undefined,
  }
}

function getCodexErrorDiagnostics(error: unknown) {
  const anyError = error as any
  const code = anyError?.data?.code || anyError?.code || anyError?.cause?.code
  const exitCode =
    anyError?.data?.exitCode ??
    anyError?.exitCode ??
    anyError?.status ??
    anyError?.cause?.exitCode ??
    null

  return {
    name: typeof anyError?.name === "string" ? anyError.name : null,
    code: typeof code === "string" ? code : null,
    exitCode: typeof exitCode === "number" ? exitCode : null,
  }
}

function isCodexAuthError(params: {
  message?: string | null
  code?: string | null
}): boolean {
  const searchableText = `${params.code || ""} ${params.message || ""}`.toLowerCase()
  return AUTH_HINTS.some((hint) => searchableText.includes(hint))
}

type RunCodexCliOptions = {
  cwd?: string
}

async function runCodexCli(
  args: string[],
  options?: RunCodexCliOptions,
): Promise<{
  stdout: string
  stderr: string
  exitCode: number | null
}> {
  const codexCliPath = resolveBundledCodexCliPath()
  const cwd = options?.cwd?.trim()

  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(codexCliPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: cwd && cwd.length > 0 ? cwd : undefined,
      env: process.env,
      windowsHide: true,
    })

    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8")
    })

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8")
    })

    child.once("error", (error) => {
      rejectPromise(
        new Error(
          `[codex] Failed to execute \`codex ${args.join(" ")}\`: ${error.message}`,
        ),
      )
    })

    child.once("close", (exitCode) => {
      resolvePromise({
        stdout: stripAnsi(stdout),
        stderr: stripAnsi(stderr),
        exitCode,
      })
    })
  })
}

async function runCodexCliChecked(
  args: string[],
  options?: RunCodexCliOptions,
): Promise<{
  stdout: string
  stderr: string
}> {
  const result = await runCodexCli(args, options)
  if (result.exitCode === 0) {
    return {
      stdout: result.stdout,
      stderr: result.stderr,
    }
  }

  const message =
    result.stderr.trim() ||
    result.stdout.trim() ||
    `Codex command failed with exit code ${result.exitCode ?? "unknown"}`
  throw new Error(message)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}

function toNonNegativeInt(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined
  }
  return Math.trunc(value)
}

function toTimestampMs(value: unknown): number | undefined {
  if (typeof value !== "string") {
    return undefined
  }
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) {
    return undefined
  }
  return parsed
}

function resolveSessionsRoot(): string {
  // Match provider env precedence: shell-derived env overrides process.env.
  const shellCodexHome = getClaudeShellEnvironment().CODEX_HOME?.trim()
  if (shellCodexHome) {
    return join(shellCodexHome, "sessions")
  }

  const processCodexHome = process.env.CODEX_HOME?.trim()
  if (processCodexHome) {
    return join(processCodexHome, "sessions")
  }

  return join(homedir(), ".codex", "sessions")
}

async function findSessionFileById(sessionId: string): Promise<string | null> {
  const sessionsRoot = resolveSessionsRoot()
  const fileSuffix = `-${sessionId}.jsonl`
  const sortDesc = (values: string[]) =>
    values.sort((left, right) =>
      right.localeCompare(left, undefined, { numeric: true }),
    )
  const listNames = async (dirPath: string): Promise<string[]> => {
    try {
      return await readdir(dirPath, { encoding: "utf8" })
    } catch {
      return []
    }
  }
  const years = sortDesc(
    (await listNames(sessionsRoot)).filter((name) => /^\d{4}$/.test(name)),
  )

  for (const year of years) {
    const yearPath = join(sessionsRoot, year)
    const months = sortDesc(
      (await listNames(yearPath)).filter((name) => /^\d{2}$/.test(name)),
    )
    for (const month of months) {
      const monthPath = join(yearPath, month)
      const days = sortDesc(
        (await listNames(monthPath)).filter((name) => /^\d{2}$/.test(name)),
      )
      for (const day of days) {
        const dayPath = join(monthPath, day)
        const fileName = (await listNames(dayPath)).find((name) =>
          name.endsWith(fileSuffix),
        )
        if (fileName) {
          return join(dayPath, fileName)
        }
      }
    }
  }

  return null
}

async function readLatestTokenCountInfo(
  filePath: string,
  options?: { notBeforeTimestampMs?: number },
): Promise<CodexTokenCountInfo | null> {
  let rawContent = ""
  try {
    rawContent = await readFile(filePath, "utf8")
  } catch {
    return null
  }

  const lines = rawContent.split("\n")
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const rawLine = lines[index]?.trim()
    if (!rawLine) continue

    let parsedLine: any
    try {
      parsedLine = JSON.parse(rawLine)
    } catch {
      continue
    }

    if (
      parsedLine?.type !== "event_msg" ||
      parsedLine?.payload?.type !== "token_count"
    ) {
      continue
    }

    const eventTimestampMs = toTimestampMs(parsedLine?.timestamp)
    const notBeforeTimestampMs = options?.notBeforeTimestampMs
    if (
      notBeforeTimestampMs !== undefined &&
      (eventTimestampMs === undefined || eventTimestampMs < notBeforeTimestampMs)
    ) {
      continue
    }

    const rawInfo = parsedLine.payload?.info
    if (!rawInfo || typeof rawInfo !== "object") continue

    const rawTokenUsage = (rawInfo as any).last_token_usage
    let lastTokenUsage: CodexTokenUsage | undefined
    if (rawTokenUsage && typeof rawTokenUsage === "object") {
      const tokenUsage = rawTokenUsage as any
      const parsedTokenUsage: CodexTokenUsage = {
        input_tokens: toNonNegativeInt(tokenUsage.input_tokens),
        cached_input_tokens: toNonNegativeInt(tokenUsage.cached_input_tokens),
        output_tokens: toNonNegativeInt(tokenUsage.output_tokens),
        total_tokens: toNonNegativeInt(tokenUsage.total_tokens),
      }
      if (Object.values(parsedTokenUsage).some((tokenCount) => tokenCount !== undefined)) {
        lastTokenUsage = parsedTokenUsage
      }
    }

    const modelContextWindow = toNonNegativeInt(
      (rawInfo as any).model_context_window,
    )

    const info: CodexTokenCountInfo = {
      last_token_usage: lastTokenUsage,
      model_context_window: modelContextWindow,
    }
    if (!info.last_token_usage && info.model_context_window === undefined) continue

    return info
  }

  return null
}

function mapToUsageMetadata(info: CodexTokenCountInfo): CodexUsageMetadata | null {
  const perMessageUsage = info.last_token_usage

  if (!perMessageUsage && info.model_context_window === undefined) {
    return null
  }

  const inputTokens =
    perMessageUsage?.input_tokens !== undefined
      ? Math.max(
          0,
          perMessageUsage.input_tokens - (perMessageUsage.cached_input_tokens ?? 0),
        )
      : undefined
  const outputTokens = perMessageUsage?.output_tokens
  const totalTokens =
    perMessageUsage?.total_tokens ??
    (perMessageUsage?.input_tokens !== undefined || perMessageUsage?.output_tokens !== undefined
      ? (perMessageUsage?.input_tokens ?? 0) + (perMessageUsage?.output_tokens ?? 0)
      : undefined
    )

  const usageMetadata: CodexUsageMetadata = {}
  if (inputTokens !== undefined) usageMetadata.inputTokens = inputTokens
  if (outputTokens !== undefined) usageMetadata.outputTokens = outputTokens
  if (totalTokens !== undefined) usageMetadata.totalTokens = totalTokens
  if (info.model_context_window !== undefined) {
    usageMetadata.modelContextWindow = info.model_context_window
  }

  return Object.keys(usageMetadata).length > 0 ? usageMetadata : null
}

async function pollUsage(
  sessionId: string,
  options?: { notBeforeTimestampMs?: number },
): Promise<CodexUsageMetadata | null> {
  let sessionFilePath: string | null = null

  for (let attempt = 0; attempt < CODEX_USAGE_POLL_ATTEMPTS; attempt += 1) {
    if (!sessionFilePath) {
      sessionFilePath = await findSessionFileById(sessionId)
    }

    if (sessionFilePath) {
      const latestInfo = await readLatestTokenCountInfo(sessionFilePath, options)
      if (latestInfo) {
        const usageMetadata = mapToUsageMetadata(latestInfo)
        if (usageMetadata) {
          return usageMetadata
        }
      }
    }

    if (attempt < CODEX_USAGE_POLL_ATTEMPTS - 1) {
      await sleep(CODEX_USAGE_POLL_INTERVAL_MS)
    }
  }

  return null
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
          config: settingsConfig,
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

function normalizeCodexIntegrationState(rawOutput: string): CodexIntegrationState {
  const normalizedOutput = rawOutput.toLowerCase()

  if (normalizedOutput.includes("logged in using chatgpt")) {
    return "connected_chatgpt"
  }

  if (
    normalizedOutput.includes("logged in using an api key") ||
    normalizedOutput.includes("logged in using api key")
  ) {
    return "connected_api_key"
  }

  if (normalizedOutput.includes("not logged in")) {
    return "not_logged_in"
  }

  return "unknown"
}

async function getCodexIntegrationStatus() {
  const result = await runCodexCli(["login", "status"])
  const combinedOutput = [result.stdout, result.stderr]
    .filter((chunk) => chunk.trim().length > 0)
    .join("\n")
    .trim()

  const state = normalizeCodexIntegrationState(combinedOutput)

  return {
    state,
    isConnected:
      state === "connected_chatgpt" || state === "connected_api_key",
    rawOutput: combinedOutput,
    exitCode: result.exitCode,
  }
}

function parseStoredMessages(raw: string | null | undefined): any[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function extractPromptFromStoredMessage(message: any): string {
  if (!message || !Array.isArray(message.parts)) return ""

  const textParts: string[] = []
  const fileContents: string[] = []

  for (const part of message.parts) {
    if (part?.type === "text" && typeof part.text === "string") {
      textParts.push(part.text)
    } else if (part?.type === "file-content") {
      const filePath =
        typeof part.filePath === "string" ? part.filePath : undefined
      const fileName = filePath?.split("/").pop() || filePath || "file"
      const content = typeof part.content === "string" ? part.content : ""
      fileContents.push(`\n--- ${fileName} ---\n${content}`)
    }
  }

  return textParts.join("\n") + fileContents.join("")
}

function getLastSessionId(messages: any[]): string | undefined {
  const lastAssistant = [...messages].reverse().find((message) => message?.role === "assistant")
  const sessionId = lastAssistant?.metadata?.sessionId
  return typeof sessionId === "string" ? sessionId : undefined
}

function extractCodexModelId(rawModel: unknown): string | undefined {
  if (typeof rawModel !== "string" || rawModel.length === 0) {
    return undefined
  }

  const normalizedModel = rawModel.trim()

  if (!normalizedModel || normalizedModel === "codex") {
    return undefined
  }

  return normalizedModel
}

function preprocessCodexModelName(params: {
  modelId: string
  authConfig?: { apiKey: string }
}): string {
  const hasAppManagedApiKey = Boolean(params.authConfig?.apiKey?.trim())
  if (!hasAppManagedApiKey) {
    return params.modelId
  }

  // All model IDs now match the real API; pass through as-is
  return params.modelId
}

function getCodexAcpModeId(mode: "plan" | "agent"): string {
  return mode === "plan" ? "read-only" : "auto"
}

function getAuthFingerprint(authConfig?: { apiKey: string }): string | null {
  const apiKey = authConfig?.apiKey?.trim()
  if (!apiKey) return null
  return createHash("sha256").update(apiKey).digest("hex")
}

function buildCodexProviderEnv(params?: {
  authConfig?: { apiKey: string }
  providerGatewayToken?: string
}): Record<string, string> {
  // Prefer shell-derived values (notably PATH) so stdio MCP dependencies
  // like pipx/npx resolve the same way as in MCP tool probing.
  const env: Record<string, string> = {}

  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") {
      env[key] = value
    }
  }

  const shellEnv = getClaudeShellEnvironment()
  for (const [key, value] of Object.entries(shellEnv)) {
    if (typeof value === "string") {
      env[key] = value
    }
  }

  const apiKey = params?.authConfig?.apiKey?.trim()
  if (!apiKey) {
    return {
      ...env,
      ...(params?.providerGatewayToken
        ? { LOCUS_CODEX_PROVIDER_GATEWAY_TOKEN: params.providerGatewayToken }
        : {}),
    }
  }

  return {
    ...env,
    CODEX_API_KEY: apiKey,
    ...(params?.providerGatewayToken
      ? { LOCUS_CODEX_PROVIDER_GATEWAY_TOKEN: params.providerGatewayToken }
      : {}),
  }
}

function getCodexAuthMethodId(params?: {
  authConfig?: {
    apiKey: string
  }
  providerProfile?: {
    id: string
  }
}): CodexAuthMethodId | undefined {
  if (params?.providerProfile) {
    return undefined
  }

  const apiKey = params?.authConfig?.apiKey?.trim()

  // codex-acp advertises auth methods:
  // - chatgpt
  // - codex-api-key
  // - openai-api-key
  // Official ChatGPT and app-managed API key paths should be explicit so a
  // stale custom provider profile cannot affect the next ACP session.
  return apiKey ? "codex-api-key" : "chatgpt"
}

function buildUserParts(
  prompt: string,
  images:
    | Array<{
        base64Data?: string
        localRef?: string
        attachmentId?: string
        mediaType?: string
        filename?: string
        sizeBytes?: number
        width?: number
        height?: number
        sha256?: string
      }>
    | undefined,
  longTextAttachments?: z.infer<typeof longTextAttachmentSchema>[],
): any[] {
  const parts: any[] = [{ type: "text", text: prompt }]

  if (images && images.length > 0) {
    for (const image of images) {
      if (image.localRef && image.mediaType) {
        parts.push({
          type: "attachment-image",
          attachmentId: image.attachmentId || image.localRef,
          localRef: image.localRef,
          filename: image.filename || "image",
          mediaType: image.mediaType,
          sizeBytes: image.sizeBytes || 0,
          width: image.width,
          height: image.height,
          sha256: image.sha256,
        })
        continue
      }
      if (!image.base64Data || !image.mediaType) continue
      parts.push({
        type: "data-image",
        data: {
          base64Data: image.base64Data,
          mediaType: image.mediaType,
          filename: image.filename,
        },
      })
    }
  }

  parts.push(...buildLongTextAttachmentParts(longTextAttachments))

  return parts
}

function buildModelMessageContent(
  prompt: string,
  images:
    | Array<{
        base64Data: string
        mediaType: string
        filename?: string
      }>
    | undefined,
): any[] {
  const content: any[] = [{ type: "text", text: prompt }]

  if (images && images.length > 0) {
    for (const image of images) {
      if (!image.base64Data || !image.mediaType) continue
      content.push({
        type: "file",
        mediaType: image.mediaType,
        data: image.base64Data,
        ...(image.filename ? { filename: image.filename } : {}),
      })
    }
  }

  return content
}

function getOrCreateProvider(params: {
  subChatId: string
  cwd: string
  mcpServers: CodexMcpServerForSession[]
  mcpFingerprint: string
  existingSessionId?: string
  authConfig?: {
    apiKey: string
  }
  providerProfile?: {
    id: string
    name: string
    baseUrl: string
    token: string
  }
}): ACPProvider {
  const authFingerprint = getAuthFingerprint(params.authConfig)
  const existing = providerSessions.get(params.subChatId)

  if (
    existing &&
    existing.cwd === params.cwd &&
    existing.authFingerprint === authFingerprint &&
    existing.mcpFingerprint === params.mcpFingerprint &&
    existing.providerProfileId === (params.providerProfile?.id ?? null)
  ) {
    return existing.provider
  }

  if (existing) {
    existing.provider.cleanup()
    providerSessions.delete(params.subChatId)
  }

  const hasAppManagedApiKey = Boolean(params.authConfig?.apiKey?.trim())
  // When app-managed key auth is used, avoid resuming older persisted session IDs.
  // Those can be tied to unauthenticated/CLI-auth state and trigger auth loops.
  const existingSessionIdForProvider = hasAppManagedApiKey
    ? undefined
    : params.existingSessionId
  const command = resolveCodexAcpBinaryPath()
  const providerProfileArgs = params.providerProfile
    ? [
        "-c",
        `model_provider=${JSON.stringify("locus_profile")}`,
        "-c",
        `model_providers.locus_profile.name=${JSON.stringify(params.providerProfile.name)}`,
        "-c",
        `model_providers.locus_profile.base_url=${JSON.stringify(params.providerProfile.baseUrl)}`,
        "-c",
        `model_providers.locus_profile.env_key=${JSON.stringify("LOCUS_CODEX_PROVIDER_GATEWAY_TOKEN")}`,
        "-c",
        `model_providers.locus_profile.wire_api=${JSON.stringify("responses")}`,
      ]
    : undefined
  const authMethodId = getCodexAuthMethodId({
    authConfig: params.authConfig,
    providerProfile: params.providerProfile,
  })
  const providerSource = params.providerProfile
    ? "provider-profile"
    : hasAppManagedApiKey
      ? "codex-api-key"
      : "chatgpt"
  const commandStatus = getRuntimeExecutableStatus(
    command,
    "Codex ACP runtime must be executable before provider start.",
  )

  console.info("[codex-acp] starting provider", {
    subChatId: params.subChatId.slice(-8),
    command,
    commandOk: commandStatus.ok,
    commandError: commandStatus.error,
    cwd: params.cwd,
    cwdExists: existsSync(params.cwd),
    args: providerProfileArgs
      ? providerProfileArgs.map((arg) =>
          arg.includes("model_providers.locus_profile.name=")
            ? "model_providers.locus_profile.name=<configured>"
            : arg.includes("model_providers.locus_profile.base_url=")
              ? "model_providers.locus_profile.base_url=<configured>"
              : arg,
        )
      : [],
    authMethodId: authMethodId ?? null,
    providerSource,
    hasExistingSessionId: Boolean(existingSessionIdForProvider),
    mcpServerCount: params.mcpServers.length,
  })

  const provider = createACPProvider({
    command,
    env: buildCodexProviderEnv({
      authConfig: params.authConfig,
      providerGatewayToken: params.providerProfile?.token,
    }),
    ...(providerProfileArgs ? { args: providerProfileArgs } : {}),
    authMethodId,
    session: {
      cwd: params.cwd,
      mcpServers: params.mcpServers,
    },
    ...(existingSessionIdForProvider
      ? { existingSessionId: existingSessionIdForProvider }
      : {}),
    persistSession: true,
  })

  providerSessions.set(params.subChatId, {
    provider,
    cwd: params.cwd,
    authFingerprint,
    mcpFingerprint: params.mcpFingerprint,
    providerProfileId: params.providerProfile?.id ?? null,
  })

  return provider
}

function cleanupProvider(subChatId: string): void {
  const existing = providerSessions.get(subChatId)
  if (!existing) return

  existing.provider.cleanup()
  providerSessions.delete(subChatId)
}

export const codexRouter = router({
  getRuntimeStatus: publicProcedure.query(() => getCodexRuntimeStatus()),

  getIntegration: publicProcedure.query(() => getCodexIntegrationStatus()),

  logout: publicProcedure.mutation(async () => {
    const logoutResult = await runCodexCli(["logout"])
    const statusResult = await runCodexCli(["login", "status"])

    const statusOutput = [statusResult.stdout, statusResult.stderr]
      .filter((chunk) => chunk.trim().length > 0)
      .join("\n")
      .trim()

    const state = normalizeCodexIntegrationState(statusOutput)
    const isConnected =
      state === "connected_chatgpt" || state === "connected_api_key"

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
    const existingSession = getActiveLoginSession()
    if (existingSession) {
      return toLoginSessionResponse(existingSession)
    }

    const codexCliPath = resolveBundledCodexCliPath()
    const sessionId = crypto.randomUUID()

    const child = spawn(codexCliPath, ["login"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
      windowsHide: true,
    })

    const session: CodexLoginSession = {
      id: sessionId,
      process: child,
      state: "running",
      output: "",
      rawOutput: "",
      url: null,
      error: null,
      exitCode: null,
    }

    const handleChunk = (chunk: Buffer | string) => {
      appendLoginOutput(session, chunk.toString("utf8"))
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

    loginSessions.set(sessionId, session)

    return toLoginSessionResponse(session)
  }),

  getLoginSession: publicProcedure
    .input(
      z.object({
        sessionId: z.string(),
      }),
    )
    .query(({ input }) => {
      const session = loginSessions.get(input.sessionId)
      if (!session) {
        throw new Error("Codex login session not found")
      }

      return toLoginSessionResponse(session)
    }),

  cancelLogin: publicProcedure
    .input(
      z.object({
        sessionId: z.string(),
      }),
    )
    .mutation(({ input }) => {
      const session = loginSessions.get(input.sessionId)
      if (!session) {
        return { success: true, found: false }
      }

      session.state = "cancelled"
      session.error = null

      if (session.process && !session.process.killed) {
        session.process.kill("SIGTERM")
      }

      return { success: true, found: true, session: toLoginSessionResponse(session) }
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
        const projectPath = input.projectPath?.trim()
        await runCodexCliChecked(["mcp", "login", input.serverName.trim()], {
          cwd: projectPath && projectPath.length > 0 ? projectPath : undefined,
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
        const projectPath = input.projectPath?.trim()
        await runCodexCliChecked(["mcp", "logout", input.serverName.trim()], {
          cwd: projectPath && projectPath.length > 0 ? projectPath : undefined,
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
    .input(
      z.object({
        subChatId: z.string(),
        chatId: z.string(),
        runId: z.string(),
        prompt: z.string(),
        model: z.string().optional(),
        cwd: z.string(),
        projectPath: z.string().optional(),
        mode: z.enum(["plan", "agent"]).default("agent"),
        sessionId: z.string().optional(),
        forceNewSession: z.boolean().optional(),
        images: z.array(imageAttachmentSchema).optional(),
        longTextAttachments: z.array(longTextAttachmentSchema).optional(),
        authConfig: z
          .object({
            apiKey: z.string().min(1),
          })
          .optional(),
        providerProfileId: z.string().optional(),
        scopeContract: agentScopeContractInputSchema.optional(),
      }),
    )
    .subscription(({ input }) => {
      return observable<any>((emit) => {
        const existingStream = activeStreams.get(input.subChatId)
        if (existingStream) {
          existingStream.cancelRequested = true
          existingStream.controller.abort()
          // Ensure old run cannot continue emitting after supersede.
          cleanupProvider(input.subChatId)
        }

        const abortController = new AbortController()
        activeStreams.set(input.subChatId, {
          runId: input.runId,
          controller: abortController,
          cancelRequested: false,
        })

        let isActive = true

        const safeEmit = (chunk: any) => {
          if (!isActive) return
          try {
            emit.next(chunk)
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
        const guardedRunEvents: AgentGuardEvent[] = []

        ;(async () => {
          try {
            if (input.scopeContract) {
              try {
                const validated = await validateAgentScopeContract(input.scopeContract, {
                  cwd: input.cwd,
                  projectPath: input.projectPath,
                  chatId: input.chatId,
                  subChatId: input.subChatId,
                  runId: input.runId,
                })
                guardedContract = {
                  ...validated,
                  runId: validated.runId ?? input.runId,
                }
                guardedPreRunStatus = await captureGuardedGitStatus(input.cwd)
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

            const requiredSafetyCapability = getCodexRunRequiredCapability({
              mode: input.mode,
              hasScopeContract: Boolean(guardedContract),
            })
            const emitUnsupportedSafetyCapability = (error: string) => {
              if (!requiredSafetyCapability) return
              const chunk = buildCodexRuntimeCapabilityErrorChunk({
                capability: requiredSafetyCapability,
                message: `Codex ${requiredSafetyCapability.label} could not start because ACP permission enforcement is unavailable.`,
                hint: error,
              })
              safeEmit(chunk)
              safeEmit({
                type: "error",
                errorText: chunk.errorText,
              })
              safeEmit({ type: "finish" })
              safeComplete()
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
              safeEmit(buildCodexRuntimeStatusChunk(blocker))
              safeEmit({
                type: "error",
                errorText: blocker.hint
                  ? `${blocker.message} ${blocker.hint}`
                  : blocker.message,
              })
              safeEmit({ type: "finish" })
              safeComplete()
              return
            }

            const db = getDatabase()

            const existingSubChat = db
              .select()
              .from(subChats)
              .where(eq(subChats.id, input.subChatId))
              .get()

            if (!existingSubChat) {
              throw new Error("Sub-chat not found")
            }

            const existingMessages = parseStoredMessages(existingSubChat.messages)
            let resolvedImages: Array<{
              base64Data: string
              mediaType: string
              filename?: string
            }> = []
            try {
              resolvedImages = await resolveChatImageAttachments(input.images)
            } catch (attachmentError) {
              safeEmit({
                type: "error",
                errorText:
                  attachmentError instanceof Error
                    ? `Image attachment unavailable: ${attachmentError.message}`
                    : `Image attachment unavailable: ${String(attachmentError)}`,
              })
              safeEmit({ type: "finish" })
              safeComplete()
              return
            }
            let codexProviderProfile:
              | {
                  id: string
                  name: string
                  baseUrl: string
                  token: string
                }
              | undefined
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
                safeEmit(buildCodexRuntimeStatusChunk(blocker))
                safeEmit(buildCodexCapabilityErrorChunk(blocker))
                safeEmit({
                  type: "error",
                  errorText: blocker.message,
                })
                safeEmit({ type: "finish" })
                safeComplete()
                return
              }
              const gateway = await getProviderGatewayEndpoint(profile.id, "responses")
              codexProviderProfile = {
                id: profile.id,
                name: profile.name,
                baseUrl: gateway.baseUrl,
                token: gateway.token,
              }
            } else if (!input.authConfig?.apiKey?.trim()) {
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
                safeEmit(buildCodexRuntimeStatusChunk(blocker))
                safeEmit(buildCodexCapabilityErrorChunk(blocker))
                safeEmit({
                  type: "auth-error",
                  errorText: blocker.message,
                })
                safeEmit({ type: "finish" })
                safeComplete()
                return
              }
            }
            const requestedModelId =
              extractCodexModelId(input.model) ||
              DEFAULT_CODEX_MODEL
            const selectedModelId = preprocessCodexModelName({
              modelId: requestedModelId,
              authConfig: codexProviderProfile ? undefined : input.authConfig,
            })
            const metadataModel = selectedModelId

            const lastMessage = existingMessages[existingMessages.length - 1]
            const isDuplicatePrompt =
              lastMessage?.role === "user" &&
              extractPromptFromStoredMessage(lastMessage) === input.prompt &&
              longTextAttachmentSignatureFromParts(lastMessage?.parts) ===
                longTextAttachmentSignatureFromInput(input.longTextAttachments) &&
              chatImageAttachmentSignatureFromParts(lastMessage?.parts) ===
                chatImageAttachmentSignatureFromInput(input.images)

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

            const cleanAssistantMessageForPersistence = (message: any) => {
              if (!message || message.role !== "assistant") return message
              if (!Array.isArray(message.parts)) return message

              const cleanedParts = message.parts.filter(
                (part: any) => part?.state !== "input-streaming",
              )

              if (cleanedParts.length === 0) {
                return null
              }

              const cleanedMessage = {
                ...message,
                parts: cleanedParts,
              }

              return normalizeCodexAssistantMessage(cleanedMessage, {
                normalizeState: true,
              })
            }

            if (!isDuplicatePrompt) {
              const userMessage = {
                id: crypto.randomUUID(),
                role: "user",
                createdAt: new Date().toISOString(),
                parts: buildUserParts(
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
              cleanupProvider(input.subChatId)
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
                input.cwd,
              )
              const mcpLookupPath =
                input.projectPath || resolvedProjectPathFromCwd || input.cwd
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
              safeEmit(buildCodexRuntimeStatusChunk(blocker))
              safeEmit(buildCodexCapabilityErrorChunk(blocker))
              safeEmit({
                type: "error",
                errorText: blocker.message,
              })
              safeEmit({ type: "finish" })
              safeComplete()
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
              safeEmit(buildCodexRuntimeStatusChunk(blocker))
              safeEmit(buildCodexCapabilityErrorChunk(blocker))
              safeEmit({
                type: "error",
                errorText: blocker.message,
              })
              safeEmit({ type: "finish" })
              safeComplete()
              return
            }

            const provider = getOrCreateProvider({
              subChatId: input.subChatId,
              cwd: input.cwd,
              mcpServers: mcpSnapshot.mcpServersForSession,
              mcpFingerprint: mcpSnapshot.fingerprint,
              existingSessionId:
                input.forceNewSession
                  ? undefined
                  : input.sessionId ?? getLastSessionId(existingMessages),
              authConfig: codexProviderProfile ? undefined : input.authConfig,
              providerProfile: codexProviderProfile,
            })

            const startedAt = Date.now()
            let latestSessionId =
              provider.getSessionId() ||
              input.sessionId ||
              getLastSessionId(existingMessages)
            let usagePromise: Promise<CodexUsageMetadata | null> | null = null

            const resolveUsageOnce = (): Promise<CodexUsageMetadata | null> => {
              if (usagePromise) return usagePromise

              const sessionId = latestSessionId || provider.getSessionId()
              if (!sessionId) {
                return Promise.resolve(null)
              }

              usagePromise = pollUsage(sessionId, {
                notBeforeTimestampMs: startedAt,
              }).catch(() => null)
              return usagePromise
            }

            const appAgentPrompt = await preparePromptWithAppAgents(input.prompt)
            let finalPrompt = appAgentPrompt.prompt
            if (appAgentPrompt.appAgentMentions.length > 0) {
              console.log(
                `[codex] App Agents mentioned:`,
                appAgentPrompt.appAgentMentions,
              )
            }
            if (appAgentPrompt.missingAppAgents.length > 0) {
              console.warn(
                `[codex] Missing App Agents:`,
                appAgentPrompt.missingAppAgents,
              )
            }

            try {
              finalPrompt = await prependLongTextAttachmentPromptBlocks(
                finalPrompt,
                input.longTextAttachments,
              )
            } catch (attachmentError) {
              safeEmit({
                type: "error",
                errorText:
                  attachmentError instanceof Error
                    ? attachmentError.message
                    : String(attachmentError),
              })
              safeEmit({ type: "finish" })
              safeComplete()
              return
            }

            if (guardedContract) {
              finalPrompt = `${buildGuardedRunPromptBlock(guardedContract)}\n\n${finalPrompt}`
            }

            const model = provider.languageModel(
              selectedModelId,
              getCodexAcpModeId(input.mode),
            )
            installCodexAskUserQuestionAcpResultNormalizer(model)
            const codexRuntimeTools = {
              ...(provider.tools || {}),
              ...createCodexAskUserQuestionTools({
                subChatId: input.subChatId,
                emit: (chunk) => safeEmit(chunk as UIMessageChunk),
                registerPending: (toolUseId, pending) => {
                  pendingCodexToolApprovals.set(toolUseId, pending)
                },
                unregisterPending: (toolUseId) => {
                  pendingCodexToolApprovals.delete(toolUseId)
                },
              }),
            }

            if (requiredSafetyCapability) {
              const installResult = await installCodexAcpPermissionHandler({
                model,
                handler: createCodexAcpPermissionHandler({
                  mode: input.mode,
                  contract: guardedContract,
                  onGuardEvent: (event) => {
                    guardedRunEvents.push(event)
                    safeEmit({ type: "guard-event", event })
                  },
                }),
              })
              if (!installResult.ok) {
                emitUnsupportedSafetyCapability(installResult.error)
                return
              }
            }

            const result = streamText({
              model,
              messages: [
                {
                  role: "user",
                  content: buildModelMessageContent(
                    finalPrompt,
                    resolvedImages,
                  ),
                },
              ],
              tools: codexRuntimeTools,
              abortSignal: abortController.signal,
            })

            const uiStream = result.toUIMessageStream({
              originalMessages: messagesForStream,
              generateMessageId: () => crypto.randomUUID(),
              messageMetadata: ({ part }) => {
                const sessionId = provider.getSessionId() || undefined
                if (sessionId) {
                  latestSessionId = sessionId
                }
                const guardedRunMetadata = guardedContract
                  ? {
                      guardedRun: {
                        contractId: guardedContract.id,
                        runId: guardedContract.runId ?? input.runId,
                        runtime: "codex",
                        enforcementMode: "hard",
                      },
                    }
                  : {}

                if (part.type === "finish") {
                  return {
                    provider: "codex",
                    model: metadataModel,
                    sessionId,
                    durationMs: Date.now() - startedAt,
                    resultSubtype:
                      part.finishReason === "error" ? "error" : "success",
                    ...guardedRunMetadata,
                  }
                }

                if (sessionId) {
                  return {
                    provider: "codex",
                    model: metadataModel,
                    sessionId,
                    ...guardedRunMetadata,
                  }
                }

                return {
                  provider: "codex",
                  model: metadataModel,
                  ...guardedRunMetadata,
                }
              },
              onFinish: async ({ responseMessage, isContinuation }) => {
                try {
                  const usageMetadata = await resolveUsageOnce()
                  const guardedRunAudit =
                    guardedContract && guardedPreRunStatus
                      ? buildGuardedRunAudit({
                          contract: guardedContract,
                          runtime: "codex",
                          enforcementMode: "hard",
                          preRunStatus: guardedPreRunStatus,
                          postRunStatus: await captureGuardedGitStatus(input.cwd),
                          guardEvents: guardedRunEvents,
                          startedAt: guardedRunStartedAt,
                          stopped: abortController.signal.aborted,
                        })
                      : null
                  if (guardedRunAudit) {
                    safeEmit({ type: "guard-audit", audit: guardedRunAudit })
                  }
                  const responseWithUsage = {
                    ...responseMessage,
                    createdAt:
                      (responseMessage as any)?.createdAt ??
                      new Date().toISOString(),
                    metadata: {
                      ...((responseMessage as any)?.metadata || {}),
                      ...(usageMetadata || {}),
                      ...(guardedRunAudit
                        ? {
                            guardedRun: {
                              contractId: guardedRunAudit.contractId,
                              runId: guardedRunAudit.runId,
                              runtime: "codex",
                              enforcementMode: guardedRunAudit.enforcementMode,
                              audit: guardedRunAudit,
                            },
                          }
                        : {}),
                    },
                  }
                  const cleanedResponseMessage =
                    cleanAssistantMessageForPersistence(responseWithUsage)

                  if (!cleanedResponseMessage) {
                    persistSubChatMessages(messagesForStream)
                    return
                  }

                  const messagesToPersist = [
                    ...(isContinuation
                      ? messagesForStream.slice(0, -1)
                      : messagesForStream),
                    cleanedResponseMessage,
                  ]

                  persistSubChatMessages(messagesToPersist)
                } catch (error) {
                  console.error("[codex] Failed to persist messages:", error)
                }
              },
              onError: (error) => {
                const normalized = extractCodexError(error)
                console.error("[codex-acp] stream error", {
                  subChatId: input.subChatId.slice(-8),
                  ...getCodexErrorDiagnostics(error),
                  message: normalized.message,
                })
                return normalized.message
              },
            })

            const reader = uiStream.getReader()
            let pendingFinishChunk: any | null = null
            while (true) {
              const { done, value } = await reader.read()
              if (done) break

              if (value?.type === "error") {
                const normalized = extractCodexError(value)

                if (isCodexAuthError(normalized)) {
                  safeEmit({ ...value, type: "auth-error", errorText: normalized.message })
                } else {
                  safeEmit({ ...value, errorText: normalized.message })
                }
                continue
              }

              if (value?.type === "finish") {
                pendingFinishChunk = value
                continue
              }

              safeEmit(value)
            }

            if (pendingFinishChunk) {
              const usageMetadata = await resolveUsageOnce()
              if (usageMetadata) {
                safeEmit({
                  type: "message-metadata",
                  messageMetadata: usageMetadata,
                })
              }
              safeEmit(pendingFinishChunk)
            } else {
              safeEmit({ type: "finish" })
            }

            safeComplete()
          } catch (error) {
            const normalized = extractCodexError(error)

            console.error("[codex-acp] chat stream error", {
              subChatId: input.subChatId.slice(-8),
              ...getCodexErrorDiagnostics(error),
              message: normalized.message,
            })
            console.error("[codex] chat stream error:", error)
            if (isCodexAuthError(normalized)) {
              safeEmit({ type: "auth-error", errorText: normalized.message })
            } else {
              safeEmit({ type: "error", errorText: normalized.message })
            }
            safeEmit({ type: "finish" })
            safeComplete()
          } finally {
            const activeStream = activeStreams.get(input.subChatId)
            if (activeStream?.runId === input.runId) {
              const shouldCleanupProvider =
                abortController.signal.aborted || activeStream.cancelRequested
              if (shouldCleanupProvider) {
                cleanupProvider(input.subChatId)
              }
              clearPendingCodexApprovals("Session cancelled.", input.subChatId)
              activeStreams.delete(input.subChatId)
            }
          }
        })()

        return () => {
          isActive = false
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
      cleanupProvider(input.subChatId)

      const activeStream = activeStreams.get(input.subChatId)
      if (activeStream) {
        activeStream.controller.abort()
        clearPendingCodexApprovals("Session cancelled.", input.subChatId)
        activeStreams.delete(input.subChatId)
      }

      return { success: true }
    }),
})

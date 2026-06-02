import { execFile } from "node:child_process"
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto"
import * as os from "node:os"
import { promisify } from "node:util"
import { stripVTControlCharacters } from "node:util"
import {
  type RuntimeMarketplaceDiagnostic,
  type RuntimePluginMarketplaceSnapshot,
  type RuntimePluginWriteActionId,
  type RuntimePluginWriteActionRequest,
  type RuntimePluginWriteExecutionRequest,
  type RuntimePluginWriteExecutionResult,
  type RuntimePluginWritePreview,
  type RuntimePluginWriteScope,
  type RuntimePluginWriteTarget,
} from "../../../shared/runtime-plugin-marketplace"
import type { PluginRuntime } from "../../../shared/plugin-target-modes"
import {
  buildRuntimePluginCommandEnv,
  getRuntimePluginMarketplaceSnapshot,
  redactRuntimeMarketplaceText,
  resolveBundledRuntimeCommandPath,
  type RuntimeCommandRunner,
  type RuntimeMarketplaceAdapterOptions,
} from "./runtime-marketplace"

const execFileAsync = promisify(execFile)
const DEFAULT_RUNTIME_PLUGIN_WRITE_TIMEOUT_MS = 30_000
const DEFAULT_RUNTIME_PLUGIN_WRITE_TOKEN_TTL_MS = 5 * 60 * 1000
const MAX_RUNTIME_PLUGIN_WRITE_BUFFER = 1024 * 1024
const RUNTIME_PLUGIN_ACTION_SCHEMA_VERSION = 1

export interface RuntimePluginWriteActionOptions extends RuntimeMarketplaceAdapterOptions {
  safeModeEnabled?: boolean
  snapshotProvider?: (runtime: PluginRuntime) => Promise<RuntimePluginMarketplaceSnapshot>
  tokenTtlMs?: number
}

interface RuntimePluginWriteCommandSpec {
  runtime: PluginRuntime
  action: RuntimePluginWriteActionId
  command: "codex" | "claude"
  args: string[]
  target: RuntimePluginWriteTarget
  targetLabel: string
  label: string
  destructive: boolean
  requiresTargetConfirmation: boolean
  impact: string
  reloadHint?: string
}

interface PendingRuntimePluginWritePreview {
  input: RuntimePluginWriteActionRequest
  operationFingerprint: string
  tokenHash: string
  targetConfirmation?: string
  expiresAtMs: number
}

interface RuntimePluginWriteCommandRunResult {
  stdout: string
  stderr: string
  diagnostics: RuntimeMarketplaceDiagnostic[]
}

const pendingRuntimePluginWritePreviews = new Map<string, PendingRuntimePluginWritePreview>()

export function buildRuntimePluginWriteCommand(
  input: RuntimePluginWriteActionRequest,
): RuntimePluginWriteCommandSpec {
  assertActionRuntimeMatches(input)

  switch (input.action) {
    case "codex.marketplace.add": {
      const source = requireTargetValue(input.target.source, "source", "source")
      return makeCommandSpec(input, {
        command: "codex",
        args: ["plugin", "marketplace", "add", source],
        target: { source },
        targetLabel: source,
        label: "Add Codex marketplace",
        destructive: false,
        impact: "Adds a marketplace source to Codex plugin configuration.",
      })
    }
    case "codex.marketplace.upgrade": {
      const marketplace = requireTargetValue(input.target.marketplace, "marketplace", "marketplace")
      return makeCommandSpec(input, {
        command: "codex",
        args: ["plugin", "marketplace", "upgrade", marketplace],
        target: { marketplace },
        targetLabel: marketplace,
        label: "Upgrade Codex marketplace",
        destructive: false,
        impact: "Refreshes the selected Codex marketplace snapshot.",
      })
    }
    case "codex.marketplace.remove": {
      const marketplace = requireTargetValue(input.target.marketplace, "marketplace", "marketplace")
      return makeCommandSpec(input, {
        command: "codex",
        args: ["plugin", "marketplace", "remove", marketplace],
        target: { marketplace },
        targetLabel: marketplace,
        label: "Remove Codex marketplace",
        destructive: true,
        impact: "Removes this marketplace source from Codex plugin configuration.",
      })
    }
    case "codex.plugin.add": {
      const target = buildPluginTarget(input.target)
      return makeCommandSpec(input, {
        command: "codex",
        args: ["plugin", "add", target.selector],
        target: target.target,
        targetLabel: target.selector,
        label: "Add Codex plugin",
        destructive: false,
        impact: "Installs the selected plugin through the Codex runtime.",
      })
    }
    case "codex.plugin.remove": {
      const target = buildPluginTarget(input.target)
      return makeCommandSpec(input, {
        command: "codex",
        args: ["plugin", "remove", target.selector],
        target: target.target,
        targetLabel: target.selector,
        label: "Remove Codex plugin",
        destructive: true,
        impact: "Removes the installed plugin through the Codex runtime.",
      })
    }
    case "claude.marketplace.add": {
      const source = requireTargetValue(input.target.source, "source", "source")
      const scope = normalizeClaudeScope(input.target.scope, ["user", "project", "local"])
      return makeCommandSpec(input, {
        command: "claude",
        args: appendClaudeScope(["plugin", "marketplace", "add", source], scope),
        target: { source, scope },
        targetLabel: source,
        label: "Add Claude marketplace",
        destructive: false,
        impact: "Adds a marketplace source to Claude Code plugin configuration.",
      })
    }
    case "claude.marketplace.update": {
      const marketplace = requireTargetValue(input.target.marketplace, "marketplace", "marketplace")
      return makeCommandSpec(input, {
        command: "claude",
        args: ["plugin", "marketplace", "update", marketplace],
        target: { marketplace },
        targetLabel: marketplace,
        label: "Update Claude marketplace",
        destructive: false,
        impact: "Refreshes the selected Claude Code marketplace snapshot.",
      })
    }
    case "claude.marketplace.remove": {
      const marketplace = requireTargetValue(input.target.marketplace, "marketplace", "marketplace")
      const scope = normalizeClaudeScope(input.target.scope, ["user", "project", "local"])
      return makeCommandSpec(input, {
        command: "claude",
        args: appendClaudeScope(["plugin", "marketplace", "remove", marketplace], scope),
        target: { marketplace, scope },
        targetLabel: marketplace,
        label: "Remove Claude marketplace",
        destructive: true,
        impact: "Removes this marketplace source from Claude Code plugin configuration.",
      })
    }
    case "claude.plugin.install": {
      const target = buildPluginTarget(input.target)
      const scope = normalizeClaudeScope(input.target.scope, ["user", "project", "local"])
      return makeCommandSpec(input, {
        command: "claude",
        args: appendClaudeScope(["plugin", "install", target.selector], scope),
        target: { ...target.target, scope },
        targetLabel: target.selector,
        label: "Install Claude plugin",
        destructive: false,
        impact: "Installs the selected plugin through the Claude Code runtime.",
        reloadHint: "Run /reload-plugins in Claude Code after this plugin mutation if an active session needs the updated plugin state.",
      })
    }
    case "claude.plugin.update": {
      const target = buildPluginTarget(input.target)
      const scope = normalizeClaudeScope(input.target.scope, ["user", "project", "local", "managed"])
      return makeCommandSpec(input, {
        command: "claude",
        args: appendClaudeScope(["plugin", "update", target.selector], scope),
        target: { ...target.target, scope },
        targetLabel: target.selector,
        label: "Update Claude plugin",
        destructive: false,
        impact: "Updates the selected plugin through the Claude Code runtime.",
        reloadHint: "Run /reload-plugins in Claude Code after this plugin mutation if an active session needs the updated plugin state.",
      })
    }
    case "claude.plugin.enable": {
      const target = buildPluginTarget(input.target)
      const scope = normalizeClaudeScope(input.target.scope, ["user", "project", "local"])
      return makeCommandSpec(input, {
        command: "claude",
        args: appendClaudeScope(["plugin", "enable", target.selector], scope),
        target: { ...target.target, scope },
        targetLabel: target.selector,
        label: "Enable Claude plugin",
        destructive: false,
        impact: "Enables the selected plugin in Claude Code.",
        reloadHint: "Run /reload-plugins in Claude Code after this plugin mutation if an active session needs the updated plugin state.",
      })
    }
    case "claude.plugin.disable": {
      const target = buildPluginTarget(input.target)
      const scope = normalizeClaudeScope(input.target.scope, ["user", "project", "local"])
      return makeCommandSpec(input, {
        command: "claude",
        args: appendClaudeScope(["plugin", "disable", target.selector], scope),
        target: { ...target.target, scope },
        targetLabel: target.selector,
        label: "Disable Claude plugin",
        destructive: false,
        impact: "Disables the selected plugin in Claude Code.",
        reloadHint: "Run /reload-plugins in Claude Code after this plugin mutation if an active session needs the updated plugin state.",
      })
    }
    case "claude.plugin.uninstall": {
      const target = buildPluginTarget(input.target)
      const scope = normalizeClaudeScope(input.target.scope, ["user", "project", "local"])
      return makeCommandSpec(input, {
        command: "claude",
        args: appendClaudeScope(["plugin", "uninstall", target.selector], scope),
        target: { ...target.target, scope },
        targetLabel: target.selector,
        label: "Uninstall Claude plugin",
        destructive: true,
        impact: "Uninstalls the selected plugin through the Claude Code runtime.",
        reloadHint: "Run /reload-plugins in Claude Code after this plugin mutation if an active session needs the updated plugin state.",
      })
    }
  }
}

export async function previewRuntimePluginWriteAction(
  input: RuntimePluginWriteActionRequest,
  options: RuntimePluginWriteActionOptions = {},
): Promise<RuntimePluginWritePreview> {
  return createRuntimePluginWritePreview(input, options, true)
}

export async function executeRuntimePluginWriteAction(
  request: RuntimePluginWriteExecutionRequest,
  options: RuntimePluginWriteActionOptions = {},
): Promise<RuntimePluginWriteExecutionResult> {
  const pending = pendingRuntimePluginWritePreviews.get(request.previewId)
  const now = options.now ?? new Date()
  if (!pending) {
    throw new Error("Runtime plugin write preview is missing or already used.")
  }
  if (pending.expiresAtMs <= now.getTime()) {
    pendingRuntimePluginWritePreviews.delete(request.previewId)
    throw new Error("Runtime plugin write preview has expired.")
  }
  if (!hashMatches(pending.tokenHash, request.confirmationToken)) {
    throw new Error("Runtime plugin write confirmation token does not match.")
  }
  if (
    pending.targetConfirmation &&
    request.targetConfirmation !== pending.targetConfirmation
  ) {
    throw new Error("Runtime plugin write target confirmation does not match.")
  }

  const currentPreview = await createRuntimePluginWritePreview(pending.input, options, false)
  if (!currentPreview.canExecute) {
    pendingRuntimePluginWritePreviews.delete(request.previewId)
    throw new Error(currentPreview.blockedReason ?? "Runtime plugin write action is blocked.")
  }
  if (currentPreview.operationFingerprint !== pending.operationFingerprint) {
    pendingRuntimePluginWritePreviews.delete(request.previewId)
    throw new Error("Runtime plugin write preview is stale.")
  }

  pendingRuntimePluginWritePreviews.delete(request.previewId)
  const spec = buildRuntimePluginWriteCommand(pending.input)
  const runResult = await runRuntimePluginWriteCommand(spec.command, spec.args, options)
  const executedAt = (options.now ?? new Date()).toISOString()
  const status = runResult.diagnostics.length === 0 ? "success" : "failed"
  const refreshedSnapshot = status === "success"
    ? await getRuntimeWriteSnapshot(spec.runtime, options)
    : undefined

  return {
    status,
    preview: {
      ...currentPreview,
      previewId: request.previewId,
      confirmationToken: undefined,
    },
    stdout: runResult.stdout,
    stderr: runResult.stderr,
    diagnostics: runResult.diagnostics,
    refreshedSnapshot,
    executedAt,
  }
}

export function clearPendingRuntimePluginWritePreviews(): void {
  pendingRuntimePluginWritePreviews.clear()
}

async function createRuntimePluginWritePreview(
  input: RuntimePluginWriteActionRequest,
  options: RuntimePluginWriteActionOptions,
  storePreview: boolean,
): Promise<RuntimePluginWritePreview> {
  const spec = buildRuntimePluginWriteCommand(input)
  const [snapshot, safeModeEnabled] = await Promise.all([
    getRuntimeWriteSnapshot(input.runtime, options),
    getRuntimePluginWriteSafeModeEnabled(options),
  ])
  const stateHash = hashRuntimePluginMarketplaceSnapshot(snapshot)
  const blockedReason = safeModeEnabled
    ? getSafeModeBlockedReason(input.action)
    : undefined
  const canExecute = !blockedReason
  const operationFingerprint = hashRuntimePluginWriteOperation({
    runtime: spec.runtime,
    action: spec.action,
    command: spec.command,
    args: spec.args,
    target: spec.target,
    stateHash,
  })
  const previewId = randomUUID()
  const tokenTtlMs = options.tokenTtlMs ?? DEFAULT_RUNTIME_PLUGIN_WRITE_TOKEN_TTL_MS
  const expiresAtMs = (options.now ?? new Date()).getTime() + tokenTtlMs
  const confirmationToken = canExecute ? randomBytes(24).toString("hex") : undefined

  if (storePreview && confirmationToken) {
    pendingRuntimePluginWritePreviews.set(previewId, {
      input: {
        runtime: input.runtime,
        action: input.action,
        target: spec.target,
      },
      operationFingerprint,
      tokenHash: sha256(confirmationToken),
      targetConfirmation: spec.requiresTargetConfirmation ? spec.targetLabel : undefined,
      expiresAtMs,
    })
  }

  return {
    previewId,
    confirmationToken,
    operationFingerprint,
    runtime: spec.runtime,
    action: spec.action,
    label: spec.label,
    command: spec.command,
    args: spec.args.map((arg) => sanitizeCommandDisplayPart(arg)),
    commandDisplay: buildCommandDisplay(spec.command, spec.args),
    target: redactRuntimePluginWriteTarget(spec.target),
    targetLabel: sanitizeCommandDisplayPart(spec.targetLabel),
    destructive: spec.destructive,
    requiresTargetConfirmation: spec.requiresTargetConfirmation,
    canExecute,
    blockedReason,
    impact: spec.impact,
    reloadHint: spec.reloadHint,
    expiresAt: new Date(expiresAtMs).toISOString(),
  }
}

async function runRuntimePluginWriteCommand(
  command: "codex" | "claude",
  args: string[],
  options: RuntimePluginWriteActionOptions,
): Promise<RuntimePluginWriteCommandRunResult> {
  const runner = options.runner ?? defaultRuntimePluginWriteRunner
  const commandDisplay = buildCommandDisplay(command, args)
  try {
    const result = await runner(
      options.runner ? command : resolveBundledRuntimeCommandPath(command),
      args,
      {
        timeoutMs: options.timeoutMs ?? DEFAULT_RUNTIME_PLUGIN_WRITE_TIMEOUT_MS,
        maxBuffer: MAX_RUNTIME_PLUGIN_WRITE_BUFFER,
        env: buildRuntimePluginWriteCommandEnv(),
      },
    )
    return {
      stdout: cleanRuntimePluginWriteOutput(result.stdout),
      stderr: cleanRuntimePluginWriteOutput(result.stderr),
      diagnostics: [],
    }
  } catch (error) {
    return {
      stdout: cleanRuntimePluginWriteOutput(getErrorStringField(error, "stdout")),
      stderr: cleanRuntimePluginWriteOutput(getErrorStringField(error, "stderr")),
      diagnostics: [diagnosticFromWriteCommandError(command, commandDisplay, error)],
    }
  }
}

async function defaultRuntimePluginWriteRunner(
  command: string,
  args: string[],
  options: { timeoutMs: number; maxBuffer: number; env: Record<string, string> },
): Promise<{ stdout: string; stderr: string }> {
  const result = await execFileAsync(command, args, {
    encoding: "utf8",
    timeout: options.timeoutMs,
    maxBuffer: options.maxBuffer,
    shell: false,
    windowsHide: true,
    env: options.env,
    cwd: os.homedir(),
  })
  return {
    stdout: result.stdout,
    stderr: result.stderr,
  }
}

export function buildRuntimePluginWriteCommandEnv(
  sourceEnv: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const env = buildRuntimePluginCommandEnv(sourceEnv)
  env.PATH = process.platform === "win32"
    ? [
        sourceEnv.SYSTEMROOT ? `${sourceEnv.SYSTEMROOT}\\System32` : undefined,
        sourceEnv.WINDIR ? `${sourceEnv.WINDIR}\\System32` : undefined,
      ].filter((value): value is string => Boolean(value)).join(";")
    : "/usr/bin:/bin:/usr/sbin:/sbin"
  return env
}

function makeCommandSpec(
  input: RuntimePluginWriteActionRequest,
  spec: Omit<RuntimePluginWriteCommandSpec, "runtime" | "action" | "requiresTargetConfirmation">,
): RuntimePluginWriteCommandSpec {
  return {
    ...spec,
    runtime: input.runtime,
    action: input.action,
    requiresTargetConfirmation: spec.destructive,
  }
}

function buildPluginTarget(target: RuntimePluginWriteTarget): {
  selector: string
  target: RuntimePluginWriteTarget
} {
  const pluginId = requireTargetValue(target.pluginId, "pluginId", "plugin")
  const marketplace = target.marketplace
    ? requireTargetValue(target.marketplace, "marketplace", "marketplace")
    : undefined
  const selector = pluginId.includes("@") || !marketplace
    ? pluginId
    : `${pluginId}@${marketplace}`
  return {
    selector,
    target: { pluginId, marketplace },
  }
}

function requireTargetValue(
  value: string | undefined,
  field: keyof RuntimePluginWriteTarget,
  kind: "plugin" | "marketplace" | "source",
): string {
  if (typeof value !== "string") {
    throw new Error(`Runtime plugin write target is missing ${field}.`)
  }
  const cleaned = value.trim()
  if (cleaned !== value || cleaned.length === 0) {
    throw new Error(`Runtime plugin write target ${field} is invalid.`)
  }
  validateRuntimePluginWriteTargetValue(cleaned, field, kind)
  return cleaned
}

function validateRuntimePluginWriteTargetValue(
  value: string,
  field: keyof RuntimePluginWriteTarget,
  kind: "plugin" | "marketplace" | "source",
): void {
  if (value.length > 500 || value.startsWith("-") || /[\u0000-\u001f\u007f\s]/.test(value)) {
    throw new Error(`Runtime plugin write target ${field} is invalid.`)
  }
  if (kind === "source") {
    if (value === "." || value === ".." || value.startsWith("./") || value.startsWith("../")) {
      throw new Error("Runtime marketplace source must be an absolute path, URL, SSH Git source, or owner/repo reference.")
    }
    return
  }
  const allowed = kind === "marketplace"
    ? /^[A-Za-z0-9._-]+$/
    : /^[A-Za-z0-9._@/-]+$/
  if (!allowed.test(value)) {
    throw new Error(`Runtime plugin write target ${field} is invalid.`)
  }
}

function normalizeClaudeScope(
  scope: RuntimePluginWriteScope | undefined,
  allowed: RuntimePluginWriteScope[],
): RuntimePluginWriteScope | undefined {
  if (!scope) return undefined
  if (!allowed.includes(scope)) {
    throw new Error(`Runtime plugin write scope ${scope} is not supported for this action.`)
  }
  return scope
}

function appendClaudeScope(args: string[], scope: RuntimePluginWriteScope | undefined): string[] {
  return scope ? [...args, "--scope", scope] : args
}

function assertActionRuntimeMatches(input: RuntimePluginWriteActionRequest): void {
  const actionRuntime = input.action.startsWith("codex.") ? "codex" : "claude"
  if (input.runtime !== actionRuntime) {
    throw new Error("Runtime plugin write action does not match the requested runtime.")
  }
}

async function getRuntimeWriteSnapshot(
  runtime: PluginRuntime,
  options: RuntimePluginWriteActionOptions,
): Promise<RuntimePluginMarketplaceSnapshot> {
  if (options.snapshotProvider) return options.snapshotProvider(runtime)
  return getRuntimePluginMarketplaceSnapshot(runtime, options)
}

async function getRuntimePluginWriteSafeModeEnabled(
  options: RuntimePluginWriteActionOptions,
): Promise<boolean> {
  if (typeof options.safeModeEnabled === "boolean") return options.safeModeEnabled
  return false
}

function getSafeModeBlockedReason(action: RuntimePluginWriteActionId): string | undefined {
  switch (action) {
    case "codex.plugin.add":
    case "claude.plugin.install":
    case "claude.plugin.update":
    case "claude.plugin.enable":
      return "Plugin safe mode is enabled. Actions that can activate plugin-provided runtime capabilities are blocked."
    default:
      return undefined
  }
}

function hashRuntimePluginMarketplaceSnapshot(snapshot: RuntimePluginMarketplaceSnapshot): string {
  return hashRuntimePluginWriteOperation({
    runtime: snapshot.runtime,
    marketplaces: snapshot.marketplaces
      .map((marketplace) => ({
        name: marketplace.name,
        source: marketplace.source,
        path: marketplace.path,
        status: marketplace.status,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    plugins: snapshot.plugins
      .map((plugin) => ({
        id: plugin.id,
        marketplace: plugin.marketplace,
        version: plugin.version,
        status: plugin.status,
        installed: plugin.installed,
        enabled: plugin.enabled,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  })
}

function hashRuntimePluginWriteOperation(value: unknown): string {
  return sha256(JSON.stringify({
    schemaVersion: RUNTIME_PLUGIN_ACTION_SCHEMA_VERSION,
    value,
  }))
}

function hashMatches(expectedHash: string, token: string): boolean {
  const actualHash = sha256(token)
  const expected = Buffer.from(expectedHash, "hex")
  const actual = Buffer.from(actualHash, "hex")
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function buildCommandDisplay(command: "codex" | "claude", args: string[]): string {
  return [command, ...args].map((part) => sanitizeCommandDisplayPart(part)).join(" ")
}

function sanitizeCommandDisplayPart(value: string): string {
  const redacted = redactRuntimeMarketplaceText(value)
  return redacted.length > 240 ? `${redacted.slice(0, 240)}...` : redacted
}

function redactRuntimePluginWriteTarget(target: RuntimePluginWriteTarget): RuntimePluginWriteTarget {
  return {
    pluginId: target.pluginId ? sanitizeCommandDisplayPart(target.pluginId) : undefined,
    marketplace: target.marketplace ? sanitizeCommandDisplayPart(target.marketplace) : undefined,
    source: target.source ? sanitizeCommandDisplayPart(target.source) : undefined,
    scope: target.scope,
  }
}

function cleanRuntimePluginWriteOutput(value: string | undefined): string {
  if (!value) return ""
  return redactRuntimeMarketplaceText(
    stripVTControlCharacters(value).replace(/\r/g, "").trim(),
  )
}

function diagnosticFromWriteCommandError(
  command: "codex" | "claude",
  commandDisplay: string,
  error: unknown,
): RuntimeMarketplaceDiagnostic {
  const record = isRecord(error) ? error : {}
  const code = typeof record.code === "string" ? record.code : undefined
  const killed = typeof record.killed === "boolean" ? record.killed : false
  const signal = typeof record.signal === "string" ? record.signal : undefined
  const exitCode = typeof record.code === "number" ? record.code : undefined
  if (code === "ENOENT") {
    return {
      code: "runtime-cli-unavailable",
      severity: "warning",
      runtime: command,
      command: commandDisplay,
      message: `${command} CLI is not available.`,
    }
  }
  if (killed || signal === "SIGTERM") {
    return {
      code: "runtime-cli-timeout",
      severity: "warning",
      runtime: command,
      command: commandDisplay,
      exitCode,
      message: "Runtime plugin write command timed out.",
    }
  }
  return {
    code: "runtime-cli-error",
    severity: "warning",
    runtime: command,
    command: commandDisplay,
    exitCode,
    message: "Runtime plugin write command failed.",
  }
}

function getErrorStringField(error: unknown, field: "stdout" | "stderr"): string | undefined {
  const record = isRecord(error) ? error : {}
  return typeof record[field] === "string" ? record[field] : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

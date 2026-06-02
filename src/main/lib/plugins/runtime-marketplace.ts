import { execFile } from "node:child_process"
import { promisify } from "node:util"
import {
  getRuntimeMarketplaceTrust,
  normalizeRuntimePluginStatus,
  type RuntimeMarketplaceDiagnostic,
  type RuntimePluginListing,
  type RuntimePluginMarketplace,
  type RuntimePluginMarketplaceSnapshot,
} from "../../../shared/runtime-plugin-marketplace"
import type { PluginRuntime } from "../../../shared/plugin-target-modes"

const execFileAsync = promisify(execFile)
const DEFAULT_RUNTIME_MARKETPLACE_TIMEOUT_MS = 5_000
const MAX_RUNTIME_MARKETPLACE_BUFFER = 1024 * 1024

export interface RuntimeCommandRunner {
  (command: string, args: string[], options: {
    timeoutMs: number
    maxBuffer: number
  }): Promise<{ stdout: string; stderr: string }>
}

export interface RuntimeMarketplaceAdapterOptions {
  now?: Date
  runner?: RuntimeCommandRunner
  timeoutMs?: number
}

interface RuntimeCommandResult {
  stdout: string
  stderr: string
  diagnostics: RuntimeMarketplaceDiagnostic[]
}

export async function getRuntimePluginMarketplaceSnapshot(
  runtime: PluginRuntime,
  options: RuntimeMarketplaceAdapterOptions = {},
): Promise<RuntimePluginMarketplaceSnapshot> {
  return runtime === "codex"
    ? getCodexPluginMarketplaceSnapshot(options)
    : getClaudePluginMarketplaceSnapshot(options)
}

export async function getAllRuntimePluginMarketplaceSnapshots(
  options: RuntimeMarketplaceAdapterOptions = {},
): Promise<RuntimePluginMarketplaceSnapshot[]> {
  const [codex, claude] = await Promise.all([
    getCodexPluginMarketplaceSnapshot(options),
    getClaudePluginMarketplaceSnapshot(options),
  ])
  return [codex, claude]
}

export async function getCodexPluginMarketplaceSnapshot(
  options: RuntimeMarketplaceAdapterOptions = {},
): Promise<RuntimePluginMarketplaceSnapshot> {
  const [marketplaceResult, pluginResult] = await Promise.all([
    runRuntimePluginCommand("codex", ["plugin", "marketplace", "list"], options),
    runRuntimePluginCommand("codex", ["plugin", "list"], options),
  ])
  const marketplaceParse = parseCodexMarketplaceList(marketplaceResult.stdout)
  const pluginParse = parseCodexPluginList(pluginResult.stdout)
  const diagnostics = [
    ...marketplaceResult.diagnostics,
    ...pluginResult.diagnostics,
    ...marketplaceParse.diagnostics,
    ...pluginParse.diagnostics,
  ]

  return {
    runtime: "codex",
    marketplaces: marketplaceParse.marketplaces,
    plugins: pluginParse.plugins,
    diagnostics,
    refreshedAt: (options.now ?? new Date()).toISOString(),
  }
}

export async function getClaudePluginMarketplaceSnapshot(
  options: RuntimeMarketplaceAdapterOptions = {},
): Promise<RuntimePluginMarketplaceSnapshot> {
  const [marketplaceResult, installedResult, availableResult] = await Promise.all([
    runRuntimePluginCommand("claude", ["plugin", "marketplace", "list"], options),
    runRuntimePluginCommand("claude", ["plugin", "list", "--json"], options),
    runRuntimePluginCommand("claude", ["plugin", "list", "--available", "--json"], options),
  ])
  const marketplaceParse = parseClaudeMarketplaceList(marketplaceResult.stdout)
  const installedParse = parseClaudePluginJson(installedResult.stdout, "installed")
  const availableParse = parseClaudePluginJson(availableResult.stdout, "available")
  const plugins = mergeRuntimePluginListings([
    ...installedParse.plugins,
    ...availableParse.plugins,
  ])
  const diagnostics = [
    ...marketplaceResult.diagnostics,
    ...installedResult.diagnostics,
    ...availableResult.diagnostics,
    ...marketplaceParse.diagnostics,
    ...installedParse.diagnostics,
    ...availableParse.diagnostics,
  ]

  return {
    runtime: "claude",
    marketplaces: marketplaceParse.marketplaces,
    plugins,
    diagnostics,
    refreshedAt: (options.now ?? new Date()).toISOString(),
  }
}

export async function runRuntimePluginCommand(
  command: string,
  args: string[],
  options: RuntimeMarketplaceAdapterOptions = {},
): Promise<RuntimeCommandResult> {
  const runner = options.runner ?? defaultRuntimeCommandRunner
  const commandText = [command, ...args].join(" ")
  try {
    const result = await runner(command, args, {
      timeoutMs: options.timeoutMs ?? DEFAULT_RUNTIME_MARKETPLACE_TIMEOUT_MS,
      maxBuffer: MAX_RUNTIME_MARKETPLACE_BUFFER,
    })
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      diagnostics: [],
    }
  } catch (error) {
    return {
      stdout: "",
      stderr: "",
      diagnostics: [diagnosticFromCommandError(command, commandText, error)],
    }
  }
}

async function defaultRuntimeCommandRunner(
  command: string,
  args: string[],
  options: { timeoutMs: number; maxBuffer: number },
): Promise<{ stdout: string; stderr: string }> {
  const result = await execFileAsync(command, args, {
    encoding: "utf8",
    timeout: options.timeoutMs,
    maxBuffer: options.maxBuffer,
    shell: false,
  })
  return {
    stdout: result.stdout,
    stderr: result.stderr,
  }
}

function diagnosticFromCommandError(
  command: string,
  commandText: string,
  error: unknown,
): RuntimeMarketplaceDiagnostic {
  const record = isRecord(error) ? error : {}
  const code = typeof record.code === "string" ? record.code : undefined
  const killed = typeof record.killed === "boolean" ? record.killed : false
  const signal = typeof record.signal === "string" ? record.signal : undefined
  const exitCode = typeof record.code === "number" ? record.code : undefined
  const message = error instanceof Error ? error.message : "Runtime command failed."

  if (code === "ENOENT") {
    return {
      code: "runtime-cli-unavailable",
      severity: "warning",
      runtime: commandToRuntime(command),
      command: commandText,
      message: `${command} CLI is not available.`,
    }
  }
  if (killed || signal === "SIGTERM" || /timeout|timed out/i.test(message)) {
    return {
      code: "runtime-cli-timeout",
      severity: "warning",
      runtime: commandToRuntime(command),
      command: commandText,
      exitCode,
      message: `${command} CLI marketplace read timed out.`,
    }
  }
  return {
    code: "runtime-cli-error",
    severity: "warning",
    runtime: commandToRuntime(command),
    command: commandText,
    exitCode,
    message,
  }
}

function commandToRuntime(command: string): PluginRuntime | undefined {
  if (command === "codex") return "codex"
  if (command === "claude") return "claude"
  return undefined
}

export function parseCodexMarketplaceList(output: string): {
  marketplaces: RuntimePluginMarketplace[]
  diagnostics: RuntimeMarketplaceDiagnostic[]
} {
  const lines = nonEmptyLines(output)
  if (lines.length === 0) {
    return {
      marketplaces: [],
      diagnostics: [emptyCommandDiagnostic("codex", "codex plugin marketplace list")],
    }
  }
  const rows = lines[0]?.toLowerCase().startsWith("marketplace")
    ? lines.slice(1)
    : lines
  const marketplaces = rows.flatMap((line) => {
    const parts = splitColumns(line)
    const name = parts[0]
    if (!name) return []
    const path = parts.slice(1).join("  ") || undefined
    return [{
      runtime: "codex" as const,
      name,
      source: path,
      path,
      sourceKind: "runtime-cli" as const,
      trust: getRuntimeMarketplaceTrust({ runtime: "codex", name, source: path }),
      status: "available" as const,
      diagnostics: [],
    }]
  })
  return {
    marketplaces,
    diagnostics: marketplaces.length === 0
      ? [parseFailureDiagnostic("codex", "codex plugin marketplace list")]
      : [],
  }
}

export function parseCodexPluginList(output: string): {
  plugins: RuntimePluginListing[]
  diagnostics: RuntimeMarketplaceDiagnostic[]
} {
  const plugins: RuntimePluginListing[] = []
  let marketplace: string | undefined
  const lines = output.split(/\r?\n/)

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    const marketplaceMatch = /^Marketplace `(.+)`$/.exec(line)
    if (marketplaceMatch) {
      marketplace = marketplaceMatch[1]
      continue
    }
    if (line.startsWith("/") || line.toLowerCase().startsWith("plugin ")) {
      continue
    }

    const parts = splitColumns(line)
    if (parts.length < 2 || !parts[0]?.includes("@")) continue
    const [namePart, marketplacePart] = splitPluginMarketplaceId(parts[0], marketplace)
    const statusText = parts[1] ?? ""
    const status = normalizeRuntimePluginStatus(statusText)
    const version = status.installed
      ? parts[2]
      : parts.length >= 4
        ? parts[2]
        : undefined
    const path = status.installed
      ? parts.slice(3).join("  ") || undefined
      : parts.length >= 4
        ? parts.slice(3).join("  ") || undefined
        : parts.slice(2).join("  ") || undefined

    plugins.push({
      runtime: "codex",
      id: parts[0],
      marketplace: marketplacePart,
      name: namePart,
      version: version || undefined,
      status: status.status,
      statusText,
      installed: status.installed,
      enabled: status.enabled,
      path,
      componentSummary: { unknown: true },
      diagnostics: [],
    })
  }

  return {
    plugins,
    diagnostics: plugins.length === 0 && output.trim()
      ? [parseFailureDiagnostic("codex", "codex plugin list")]
      : [],
  }
}

export function parseClaudeMarketplaceList(output: string): {
  marketplaces: RuntimePluginMarketplace[]
  diagnostics: RuntimeMarketplaceDiagnostic[]
} {
  const lines = nonEmptyLines(output)
  if (lines.length === 0 || /^No marketplaces configured/i.test(lines[0] ?? "")) {
    return {
      marketplaces: [],
      diagnostics: lines.length === 0
        ? [emptyCommandDiagnostic("claude", "claude plugin marketplace list")]
        : [],
    }
  }
  const rows = lines[0]?.toLowerCase().includes("marketplace")
    ? lines.slice(1)
    : lines
  const marketplaces = rows.flatMap((line) => {
    const parts = splitColumns(line)
    const name = parts[0]
    if (!name) return []
    const source = parts.slice(1).join("  ") || undefined
    return [{
      runtime: "claude" as const,
      name,
      source,
      path: source?.startsWith("/") ? source : undefined,
      sourceKind: "runtime-cli" as const,
      trust: getRuntimeMarketplaceTrust({ runtime: "claude", name, source }),
      status: "available" as const,
      diagnostics: [],
    }]
  })
  return {
    marketplaces,
    diagnostics: marketplaces.length === 0
      ? [parseFailureDiagnostic("claude", "claude plugin marketplace list")]
      : [],
  }
}

export function parseClaudePluginJson(
  output: string,
  mode: "installed" | "available",
): {
  plugins: RuntimePluginListing[]
  diagnostics: RuntimeMarketplaceDiagnostic[]
} {
  if (!output.trim()) {
    return {
      plugins: [],
      diagnostics: [emptyCommandDiagnostic("claude", `claude plugin list ${mode}`)],
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(output) as unknown
  } catch {
    return {
      plugins: [],
      diagnostics: [parseFailureDiagnostic("claude", `claude plugin list ${mode}`)],
    }
  }

  const values = mode === "installed"
    ? extractClaudeJsonArray(parsed, ["installed", "plugins"])
    : extractClaudeJsonArray(parsed, ["available", "plugins"])
  const plugins = values.map((value, index): RuntimePluginListing => {
    const record = isRecord(value) ? value : {}
    const rawName = getString(record.name) ??
      getString(record.id) ??
      getString(record.plugin) ??
      `claude-plugin-${index + 1}`
    const marketplace = getString(record.marketplace) ??
      getString(record.marketplaceName) ??
      getString(record.sourceName)
    const statusText = getString(record.status) ??
      (mode === "installed" ? "installed" : "not installed")
    const status = normalizeRuntimePluginStatus(statusText)
    return {
      runtime: "claude",
      id: marketplace ? `${rawName}@${marketplace}` : rawName,
      marketplace,
      name: rawName,
      version: getString(record.version),
      status: mode === "available" && !status.installed ? "not-installed" : status.status,
      statusText,
      installed: mode === "installed" ? true : status.installed,
      enabled: getBoolean(record.enabled) ?? status.enabled,
      source: getString(record.source) ?? getString(record.url),
      path: getString(record.path),
      scope: getString(record.scope),
      componentSummary: normalizeComponentSummary(record),
      diagnostics: [],
    }
  })

  return {
    plugins,
    diagnostics: [],
  }
}

function extractClaudeJsonArray(parsed: unknown, preferredKeys: string[]): unknown[] {
  if (Array.isArray(parsed)) return parsed
  if (!isRecord(parsed)) return []
  for (const key of preferredKeys) {
    const value = parsed[key]
    if (Array.isArray(value)) return value
  }
  return []
}

function mergeRuntimePluginListings(
  listings: RuntimePluginListing[],
): RuntimePluginListing[] {
  const byId = new Map<string, RuntimePluginListing>()
  for (const listing of listings) {
    const existing = byId.get(listing.id)
    if (!existing || listing.installed) {
      byId.set(listing.id, listing)
    }
  }
  return Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id))
}

function splitPluginMarketplaceId(
  id: string,
  fallbackMarketplace: string | undefined,
): [string, string | undefined] {
  const index = id.lastIndexOf("@")
  if (index <= 0) return [id, fallbackMarketplace]
  return [id.slice(0, index), id.slice(index + 1) || fallbackMarketplace]
}

function splitColumns(line: string): string[] {
  return line.trim().split(/\s{2,}/).map((part) => part.trim()).filter(Boolean)
}

function nonEmptyLines(output: string): string[] {
  return output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
}

function emptyCommandDiagnostic(
  runtime: PluginRuntime,
  command: string,
): RuntimeMarketplaceDiagnostic {
  return {
    code: "runtime-command-empty",
    severity: "info",
    runtime,
    command,
    message: "Runtime marketplace command returned no output.",
  }
}

function parseFailureDiagnostic(
  runtime: PluginRuntime,
  command: string,
): RuntimeMarketplaceDiagnostic {
  return {
    code: "runtime-cli-parse-failed",
    severity: "warning",
    runtime,
    command,
    message: "Runtime marketplace command output could not be parsed.",
  }
}

function normalizeComponentSummary(record: Record<string, unknown>) {
  const summary = {
    skills: getNumber(record.skills) ?? getNumber(record.skillCount),
    mcpServers: getNumber(record.mcpServers) ?? getNumber(record.mcpServerCount),
    hooks: getNumber(record.hooks) ?? getNumber(record.hookCount),
    apps: getNumber(record.apps) ?? getNumber(record.appCount),
    commands: getNumber(record.commands) ?? getNumber(record.commandCount),
    agents: getNumber(record.agents) ?? getNumber(record.agentCount),
    lspServers: getNumber(record.lspServers) ?? getNumber(record.lspServerCount),
  }
  return Object.values(summary).some((value) => typeof value === "number")
    ? summary
    : { unknown: true }
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function getBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined
}

function getNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

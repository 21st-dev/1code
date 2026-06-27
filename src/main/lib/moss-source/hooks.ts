import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import path from "node:path"
import type { AgentEngineId } from "../agent-runtime/types"
import type { SharedResource } from "../shared-resources/types"
import { discoverMossSourceResources } from "./registry"

export type MossHookRunStatus = "passed" | "failed" | "skipped" | "timed-out"

export interface MossHookRunResult {
  resourceId: string
  name: string
  event: string
  status: MossHookRunStatus
  command?: string
  commandHash?: string
  exitCode?: number | null
  elapsedMs: number
  stdout?: string
  stderr?: string
  error?: string
  timedOut?: boolean
}

export interface MossHookRunSummary {
  status: MossHookRunStatus
  event: string
  engineId: AgentEngineId
  projectPath: string
  matchedCount: number
  executedCount: number
  skippedCount: number
  failedCount: number
  timedOutCount: number
  payloadHash: string
  results: MossHookRunResult[]
  warnings: string[]
}

export interface RunMossHooksOptions {
  projectPath: string
  event: string
  engineId: AgentEngineId
  cwd?: string
  payload?: Record<string, unknown>
  env?: Record<string, string | undefined>
  timeoutMs?: number
  maxHooks?: number
}

const DEFAULT_HOOK_TIMEOUT_MS = 10_000
const DEFAULT_MAX_HOOKS = 20

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function normalizeEvent(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? ""
}

function redactHookOutput(value: string): string {
  return value
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, "sk-REDACTED")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer REDACTED")
    .replace(
      /(["']?(?:api[_-]?key|token|secret|password|authorization)["']?\s*[:=]\s*["']?)([^"',\n}]+)/gi,
      "$1REDACTED",
    )
    .slice(0, 4000)
}

function hookEvent(resource: SharedResource): string {
  const event = resource.metadata?.event
  return typeof event === "string" && event.trim() ? event.trim() : "Stop"
}

function hookCommand(resource: SharedResource): string | undefined {
  const command = resource.metadata?.command
  return typeof command === "string" && command.trim()
    ? command.trim()
    : undefined
}

function isHookEnabled(resource: SharedResource): boolean {
  if (resource.enabled === false) return false
  if (resource.metadata?.hookEnabled === false) return false
  return true
}

function visibleResult(result: MossHookRunResult): MossHookRunResult {
  return {
    ...result,
    command: result.command ? redactHookOutput(result.command) : undefined,
    stdout: result.stdout ? redactHookOutput(result.stdout) : undefined,
    stderr: result.stderr ? redactHookOutput(result.stderr) : undefined,
    error: result.error ? redactHookOutput(result.error) : undefined,
  }
}

function runHookCommand(params: {
  resource: SharedResource
  command: string
  event: string
  engineId: AgentEngineId
  projectPath: string
  cwd: string
  payloadJson: string
  payloadHash: string
  env?: Record<string, string | undefined>
  timeoutMs: number
}): Promise<MossHookRunResult> {
  const startedAt = Date.now()

  return new Promise((resolve) => {
    const child = spawn(params.command, {
      cwd: params.cwd,
      env: {
        ...process.env,
        ...params.env,
        MOSS_HOOK_EVENT: params.event,
        MOSS_HOOK_ENGINE: params.engineId,
        MOSS_HOOK_RESOURCE_ID: params.resource.id,
        MOSS_HOOK_NAME: params.resource.name,
        MOSS_HOOK_PROJECT_PATH: params.projectPath,
        MOSS_HOOK_CWD: params.cwd,
        MOSS_HOOK_PAYLOAD_JSON: params.payloadJson,
        MOSS_HOOK_PAYLOAD_SHA256: params.payloadHash,
      },
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    })
    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    let timedOut = false
    let forceKillTimer: ReturnType<typeof setTimeout> | null = null

    const timeout = setTimeout(() => {
      timedOut = true
      child.kill("SIGTERM")
      forceKillTimer = setTimeout(() => child.kill("SIGKILL"), 2000)
    }, params.timeoutMs)

    child.stdout.on("data", (chunk) => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
    })
    child.stderr.on("data", (chunk) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
    })
    child.once("error", (error) => {
      clearTimeout(timeout)
      if (forceKillTimer) clearTimeout(forceKillTimer)
      resolve(
        visibleResult({
          resourceId: params.resource.id,
          name: params.resource.name,
          event: params.event,
          status: "failed",
          command: params.command,
          commandHash: sha256(params.command),
          elapsedMs: Date.now() - startedAt,
          error: error.message,
        }),
      )
    })
    child.once("close", (exitCode) => {
      clearTimeout(timeout)
      if (forceKillTimer) clearTimeout(forceKillTimer)
      const status: MossHookRunStatus = timedOut
        ? "timed-out"
        : exitCode === 0
          ? "passed"
          : "failed"

      resolve(
        visibleResult({
          resourceId: params.resource.id,
          name: params.resource.name,
          event: params.event,
          status,
          command: params.command,
          commandHash: sha256(params.command),
          exitCode,
          elapsedMs: Date.now() - startedAt,
          stdout: Buffer.concat(stdoutChunks).toString("utf-8").trim(),
          stderr: Buffer.concat(stderrChunks).toString("utf-8").trim(),
          timedOut,
        }),
      )
    })
  })
}

export async function runMossHooks(
  options: RunMossHooksOptions,
): Promise<MossHookRunSummary> {
  const payloadJson = JSON.stringify(options.payload ?? {})
  const payloadHash = sha256(payloadJson)
  const warnings: string[] = []
  const event = options.event.trim()
  const normalizedEvent = normalizeEvent(event)
  const timeoutMs = options.timeoutMs ?? DEFAULT_HOOK_TIMEOUT_MS
  const maxHooks = options.maxHooks ?? DEFAULT_MAX_HOOKS

  let resources: SharedResource[] = []
  try {
    resources = await discoverMossSourceResources(options.projectPath)
  } catch (error) {
    return {
      status: "failed",
      event,
      engineId: options.engineId,
      projectPath: options.projectPath,
      matchedCount: 0,
      executedCount: 0,
      skippedCount: 0,
      failedCount: 1,
      timedOutCount: 0,
      payloadHash,
      results: [
        {
          resourceId: "moss:hooks",
          name: "Moss hook discovery",
          event,
          status: "failed",
          elapsedMs: 0,
          error: error instanceof Error ? error.message : String(error),
        },
      ],
      warnings,
    }
  }

  const matchedHooks = resources
    .filter((resource) => resource.kind === "hook" && resource.scope === "moss")
    .filter((resource) => normalizeEvent(hookEvent(resource)) === normalizedEvent)
    .slice(0, maxHooks)

  const allMatches = resources
    .filter((resource) => resource.kind === "hook" && resource.scope === "moss")
    .filter((resource) => normalizeEvent(hookEvent(resource)) === normalizedEvent)

  if (allMatches.length > matchedHooks.length) {
    warnings.push(
      `Moss hook run limited to ${matchedHooks.length} of ${allMatches.length} matching hooks.`,
    )
  }

  const results: MossHookRunResult[] = []
  for (const resource of matchedHooks) {
    if (!isHookEnabled(resource)) {
      results.push({
        resourceId: resource.id,
        name: resource.name,
        event,
        status: "skipped",
        elapsedMs: 0,
        error: "Hook is disabled.",
      })
      continue
    }

    const command = hookCommand(resource)
    if (!command) {
      results.push({
        resourceId: resource.id,
        name: resource.name,
        event,
        status: "skipped",
        elapsedMs: 0,
        error: "Hook has no command.",
      })
      continue
    }

    results.push(
      await runHookCommand({
        resource,
        command,
        event,
        engineId: options.engineId,
        projectPath: options.projectPath,
        cwd: options.cwd ?? options.projectPath,
        payloadJson,
        payloadHash,
        env: options.env,
        timeoutMs,
      }),
    )
  }

  const executedCount = results.filter((result) =>
    ["passed", "failed", "timed-out"].includes(result.status),
  ).length
  const skippedCount = results.filter((result) => result.status === "skipped").length
  const failedCount = results.filter((result) => result.status === "failed").length
  const timedOutCount = results.filter((result) => result.status === "timed-out").length
  const status: MossHookRunStatus =
    failedCount > 0 || timedOutCount > 0
      ? "failed"
      : executedCount > 0
        ? "passed"
        : "skipped"

  return {
    status,
    event,
    engineId: options.engineId,
    projectPath: options.projectPath,
    matchedCount: matchedHooks.length,
    executedCount,
    skippedCount,
    failedCount,
    timedOutCount,
    payloadHash,
    results,
    warnings,
  }
}

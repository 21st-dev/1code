import { spawn } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import type { AgentEngineId } from "../agent-runtime/types"
import type { SharedResource } from "../shared-resources/types"
import { discoverMossSourceResources } from "./registry"

export type MossSubagentInvocationStatus =
  | "passed"
  | "failed"
  | "skipped"
  | "timed-out"

export interface MossSubagentInvocationResult {
  status: MossSubagentInvocationStatus
  invocationId: string
  engineId: AgentEngineId
  projectPath: string
  resourceId?: string
  name: string
  taskHash: string
  payloadHash: string
  command?: string
  commandHash?: string
  exitCode?: number | null
  elapsedMs: number
  stdout?: string
  stderr?: string
  error?: string
  timedOut?: boolean
  warnings: string[]
}

export interface InvokeMossSubagentOptions {
  projectPath: string
  engineId: AgentEngineId
  name: string
  task: string
  cwd?: string
  payload?: Record<string, unknown>
  env?: Record<string, string | undefined>
  timeoutMs?: number
}

const DEFAULT_SUBAGENT_TIMEOUT_MS = 30_000

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function redactSubagentOutput(value: string): string {
  return value
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, "sk-REDACTED")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer REDACTED")
    .replace(
      /(["']?(?:api[_-]?key|token|secret|password|authorization)["']?\s*[:=]\s*["']?)([^"',\n}]+)/gi,
      "$1REDACTED",
    )
    .slice(0, 4000)
}

function subagentCommand(resource: SharedResource): string | undefined {
  const command = resource.metadata?.command
  return typeof command === "string" && command.trim()
    ? command.trim()
    : undefined
}

function isSubagentEnabled(resource: SharedResource): boolean {
  if (resource.enabled === false) return false
  if (resource.metadata?.subagentEnabled === false) return false
  return true
}

function visibleResult(
  result: MossSubagentInvocationResult,
): MossSubagentInvocationResult {
  return {
    ...result,
    command: result.command ? redactSubagentOutput(result.command) : undefined,
    stdout: result.stdout ? redactSubagentOutput(result.stdout) : undefined,
    stderr: result.stderr ? redactSubagentOutput(result.stderr) : undefined,
    error: result.error ? redactSubagentOutput(result.error) : undefined,
  }
}

function selectMossSubagent(
  resources: SharedResource[],
  name: string,
): SharedResource | undefined {
  const normalizedName = name.trim().toLowerCase()
  return resources.find(
    (resource) =>
      resource.kind === "subagent" &&
      resource.scope === "moss" &&
      (resource.name.toLowerCase() === normalizedName ||
        resource.id.toLowerCase() === normalizedName),
  )
}

export async function invokeMossSubagent(
  options: InvokeMossSubagentOptions,
): Promise<MossSubagentInvocationResult> {
  const startedAt = Date.now()
  const invocationId = randomUUID()
  const payloadJson = JSON.stringify(options.payload ?? {})
  const payloadHash = sha256(payloadJson)
  const taskHash = sha256(options.task)
  const warnings: string[] = []
  const name = options.name.trim()

  let resources: SharedResource[] = []
  try {
    resources = await discoverMossSourceResources(options.projectPath)
  } catch (error) {
    return {
      status: "failed",
      invocationId,
      engineId: options.engineId,
      projectPath: options.projectPath,
      name,
      taskHash,
      payloadHash,
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
      warnings,
    }
  }

  const resource = selectMossSubagent(resources, name)
  if (!resource) {
    return {
      status: "failed",
      invocationId,
      engineId: options.engineId,
      projectPath: options.projectPath,
      name,
      taskHash,
      payloadHash,
      elapsedMs: Date.now() - startedAt,
      error: `Moss subagent ${name} was not found.`,
      warnings,
    }
  }

  if (!isSubagentEnabled(resource)) {
    return {
      status: "skipped",
      invocationId,
      engineId: options.engineId,
      projectPath: options.projectPath,
      resourceId: resource.id,
      name: resource.name,
      taskHash,
      payloadHash,
      elapsedMs: Date.now() - startedAt,
      error: "Subagent is disabled.",
      warnings,
    }
  }

  const command = subagentCommand(resource)
  if (!command) {
    return {
      status: "skipped",
      invocationId,
      engineId: options.engineId,
      projectPath: options.projectPath,
      resourceId: resource.id,
      name: resource.name,
      taskHash,
      payloadHash,
      elapsedMs: Date.now() - startedAt,
      error: "Subagent has no Moss invocation command.",
      warnings,
    }
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_SUBAGENT_TIMEOUT_MS
  const cwd = options.cwd ?? options.projectPath

  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd,
      env: {
        ...process.env,
        ...options.env,
        MOSS_SUBAGENT_INVOCATION_ID: invocationId,
        MOSS_SUBAGENT_ENGINE: options.engineId,
        MOSS_SUBAGENT_RESOURCE_ID: resource.id,
        MOSS_SUBAGENT_NAME: resource.name,
        MOSS_SUBAGENT_PROJECT_PATH: options.projectPath,
        MOSS_SUBAGENT_CWD: cwd,
        MOSS_SUBAGENT_TASK: options.task,
        MOSS_SUBAGENT_TASK_SHA256: taskHash,
        MOSS_SUBAGENT_PAYLOAD_JSON: payloadJson,
        MOSS_SUBAGENT_PAYLOAD_SHA256: payloadHash,
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
    }, timeoutMs)

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
          status: "failed",
          invocationId,
          engineId: options.engineId,
          projectPath: options.projectPath,
          resourceId: resource.id,
          name: resource.name,
          taskHash,
          payloadHash,
          command,
          commandHash: sha256(command),
          elapsedMs: Date.now() - startedAt,
          error: error.message,
          warnings,
        }),
      )
    })
    child.once("close", (exitCode) => {
      clearTimeout(timeout)
      if (forceKillTimer) clearTimeout(forceKillTimer)
      const status: MossSubagentInvocationStatus = timedOut
        ? "timed-out"
        : exitCode === 0
          ? "passed"
          : "failed"

      resolve(
        visibleResult({
          status,
          invocationId,
          engineId: options.engineId,
          projectPath: options.projectPath,
          resourceId: resource.id,
          name: resource.name,
          taskHash,
          payloadHash,
          command,
          commandHash: sha256(command),
          exitCode,
          elapsedMs: Date.now() - startedAt,
          stdout: Buffer.concat(stdoutChunks).toString("utf-8").trim(),
          stderr: Buffer.concat(stderrChunks).toString("utf-8").trim(),
          timedOut,
          warnings,
        }),
      )
    })
  })
}

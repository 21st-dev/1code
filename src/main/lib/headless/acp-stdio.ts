import type { Readable } from "stream"
import { z } from "zod"
import {
  AGENT_JOB_MODES,
  type AgentJobContractRuntime,
} from "../../../shared/agent-jobs"
import { CONTRACT_RUNTIME_IDS } from "../../../shared/agent-runtime-capabilities"
import {
  createAgentJob,
  listAgentJobEvents,
  requestCancelAgentJob,
  type AgentJobDatabase,
} from "./job-store"
import {
  serializeAgentJob,
  serializeAgentJobEvent,
} from "./cli-output"
import {
  HEADLESS_EXIT_CODES,
  runPersistedAgentJob,
} from "./job-runner"
import type { AgentTaskRunner } from "./agent-runtime-contract"
import { findRegisteredProjectForCwdWithCanonicalPath } from "./schedules"

type Writer = {
  write(chunk: string): unknown
}

type JsonRpcId = string | number | null

type ActiveProtocolJob = {
  jobId: string
  abortController: AbortController
  streamPromise: Promise<void>
}

export type RunAcpStdioServerOptions = {
  db: AgentJobDatabase
  stdin?: Readable
  stdout?: Writer
  stderr?: Writer
  env?: NodeJS.ProcessEnv
  runner?: AgentTaskRunner | null
}

const ACP_PROTOCOL_VERSION = "locus-acp-stdio.v1"
export const ACP_MAX_FRAME_BYTES = 1024 * 1024

const jsonRpcIdSchema = z.union([z.string(), z.number(), z.null()])
const requestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: jsonRpcIdSchema.optional(),
  method: z.string().min(1),
  params: z.unknown().optional(),
}).strict()

const jobRunParamsSchema = z.object({
  runtime: z.enum(CONTRACT_RUNTIME_IDS),
  mode: z.enum(AGENT_JOB_MODES).default("agent"),
  cwd: z.string().min(1),
  prompt: z.string().min(1),
}).strict()

const jobCancelParamsSchema = z.object({
  jobId: z.string().min(1),
}).strict()

type JsonRpcRequest = z.infer<typeof requestSchema>

function writeJsonLine(writer: Writer | undefined, value: unknown): void {
  writer?.write(`${JSON.stringify(value)}\n`)
}

function writeStderr(writer: Writer | undefined, message: string): void {
  writer?.write(`${message}\n`)
}

function response(id: JsonRpcId, result: unknown): unknown {
  return { jsonrpc: "2.0", id, result }
}

function errorResponse(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
): unknown {
  return {
    jsonrpc: "2.0",
    id,
    error: data === undefined ? { code, message } : { code, message, data },
  }
}

function notification(method: string, params: unknown): unknown {
  return { jsonrpc: "2.0", method, params }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    const onAbort = () => {
      clearTimeout(timer)
      resolve()
    }
    signal?.addEventListener("abort", onAbort, { once: true })
  })
}

function hasForbiddenSecretValue(value: string): boolean {
  return (
    /-----BEGIN [A-Z0-9 ]+-----/i.test(value) ||
    /sk-[A-Za-z0-9_-]{20,}/.test(value) ||
    /gh[pousr]_[A-Za-z0-9_]{20,}/.test(value) ||
    /github_pat_[A-Za-z0-9_]{20,}/.test(value) ||
    /authorization\s*:/i.test(value) ||
    /bearer\s+[A-Za-z0-9._-]{10,}/i.test(value)
  )
}

function findForbiddenSecretPath(
  value: unknown,
  path = "$",
  depth = 0,
): string | null {
  if (depth > 12) return null
  if (typeof value === "string") {
    return hasForbiddenSecretValue(value) ? path : null
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findForbiddenSecretPath(value[index], `${path}[${index}]`, depth + 1)
      if (found) return found
    }
    return null
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (/^env$/i.test(key)) return `${path}.${key}`
      if (
        /token|authorization|api[-_]?key|secret|password|credential/i.test(key) &&
        item !== null &&
        item !== undefined &&
        item !== ""
      ) {
        return `${path}.${key}`
      }
      const found = findForbiddenSecretPath(item, `${path}.${key}`, depth + 1)
      if (found) return found
    }
  }
  return null
}

function assertNoProtocolSecrets(params: unknown): void {
  const path = findForbiddenSecretPath(params)
  if (path) {
    throw new Error(
      `Protocol input must not include provider tokens, raw env, or credentials (${path})`,
    )
  }
}

async function* readJsonLines(stream: Readable | undefined): AsyncGenerator<string> {
  if (!stream) return
  let buffer = ""
  for await (const chunk of stream) {
    buffer += Buffer.isBuffer(chunk) ? chunk.toString("utf-8") : String(chunk)
    if (Buffer.byteLength(buffer, "utf-8") > ACP_MAX_FRAME_BYTES) {
      throw new Error(`ACP frame exceeds ${ACP_MAX_FRAME_BYTES} byte limit`)
    }
    let newlineIndex = buffer.indexOf("\n")
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim()
      buffer = buffer.slice(newlineIndex + 1)
      if (line) yield line
      newlineIndex = buffer.indexOf("\n")
    }
  }
  const remaining = buffer.trim()
  if (remaining) yield remaining
}

async function streamJobEvents(
  options: RunAcpStdioServerOptions,
  jobId: string,
  runPromise: Promise<unknown>,
  signal?: AbortSignal,
): Promise<void> {
  let afterSequence = 0
  let finished = false
  let runError: unknown = null
  void runPromise
    .catch((error) => {
      runError = error
    })
    .finally(() => {
      finished = true
    })

  while (true) {
    const events = listAgentJobEvents(options.db, jobId, afterSequence)
    for (const event of events) {
      afterSequence = event.sequence
      writeJsonLine(
        options.stdout,
        notification("job/event", {
          jobId,
          event: serializeAgentJobEvent(event),
        }),
      )
    }
    if (finished && events.length === 0) break
    await delay(finished ? 0 : 100, signal)
  }

  if (runError) {
    const message = runError instanceof Error ? runError.message : String(runError)
    writeStderr(options.stderr, `[ACP] Job ${jobId} failed to stream: ${message}`)
    writeJsonLine(
      options.stdout,
      notification("job/error", {
        jobId,
        message,
      }),
    )
  }
}

function handleInitialize(id: JsonRpcId, options: RunAcpStdioServerOptions): void {
  writeJsonLine(
    options.stdout,
    response(id, {
      protocolVersion: ACP_PROTOCOL_VERSION,
      serverInfo: {
        name: "Locus",
      },
      capabilities: {
        jobRun: true,
        jobCancel: true,
        eventStream: true,
        shutdown: true,
      },
    }),
  )
}

function handleJobRun(
  id: JsonRpcId,
  request: JsonRpcRequest,
  options: RunAcpStdioServerOptions,
  activeJobs: Map<string, ActiveProtocolJob>,
): void {
  assertNoProtocolSecrets(request.params)
  const params = jobRunParamsSchema.parse(request.params ?? {})
  const { project, cwd } = findRegisteredProjectForCwdWithCanonicalPath(
    options.db,
    params.cwd,
    null,
    "Protocol job cwd",
  )
  const job = createAgentJob(options.db, {
    source: "protocol",
    runtime: params.runtime as AgentJobContractRuntime,
    mode: params.mode,
    cwd,
    prompt: params.prompt,
    input: {
      prompt: params.prompt,
      protocol: ACP_PROTOCOL_VERSION,
    },
    projectId: project.id,
  })
  const abortController = new AbortController()
  const runPromise = runPersistedAgentJob({
    db: options.db,
    jobId: job.id,
    env: options.env,
    runner: options.runner,
    workerId: `protocol:${process.pid}:${Date.now()}:${job.id}`,
    workerPid: process.pid,
    signal: abortController.signal,
  })
  const streamPromise = streamJobEvents(
    options,
    job.id,
    runPromise,
    abortController.signal,
  ).finally(() => {
    activeJobs.delete(job.id)
  })
  activeJobs.set(job.id, {
    jobId: job.id,
    abortController,
    streamPromise,
  })
  writeJsonLine(options.stdout, response(id, { job: serializeAgentJob(job) }))
}

function handleJobCancel(
  id: JsonRpcId,
  request: JsonRpcRequest,
  options: RunAcpStdioServerOptions,
  activeJobs: Map<string, ActiveProtocolJob>,
): void {
  const params = jobCancelParamsSchema.parse(request.params ?? {})
  const activeJob = activeJobs.get(params.jobId)
  if (!activeJob) {
    writeJsonLine(
      options.stdout,
      errorResponse(
        id,
        -32602,
        "Protocol jobs can only be canceled by the ACP session that created them.",
      ),
    )
    return
  }
  const job = requestCancelAgentJob(options.db, params.jobId, "protocol")
  activeJob.abortController.abort()
  writeJsonLine(options.stdout, response(id, { job: serializeAgentJob(job) }))
}

function cancelActiveProtocolJobs(
  options: RunAcpStdioServerOptions,
  activeJobs: Map<string, ActiveProtocolJob>,
): void {
  for (const job of activeJobs.values()) {
    try {
      requestCancelAgentJob(options.db, job.jobId, "protocol")
    } catch {}
    job.abortController.abort()
  }
}

async function drainActiveProtocolJobs(
  activeJobs: Map<string, ActiveProtocolJob>,
  timeoutMs: number,
): Promise<void> {
  if (activeJobs.size === 0) return
  await Promise.race([
    Promise.allSettled(Array.from(activeJobs.values(), (job) => job.streamPromise)),
    delay(timeoutMs),
  ])
}

function handleRequest(
  request: JsonRpcRequest,
  options: RunAcpStdioServerOptions,
  activeJobs: Map<string, ActiveProtocolJob>,
): boolean {
  const id = request.id ?? null
  try {
    if (request.method === "initialize") {
      handleInitialize(id, options)
      return false
    }
    if (request.method === "job.run") {
      handleJobRun(id, request, options, activeJobs)
      return false
    }
    if (request.method === "job.cancel") {
      handleJobCancel(id, request, options, activeJobs)
      return false
    }
    if (request.method === "shutdown") {
      writeJsonLine(options.stdout, response(id, { ok: true }))
      return true
    }
    writeJsonLine(
      options.stdout,
      errorResponse(id, -32601, `Unknown method: ${request.method}`),
    )
    return false
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    writeStderr(options.stderr, `[ACP] Request failed: ${message}`)
    writeJsonLine(options.stdout, errorResponse(id, -32602, message))
    return false
  }
}

export async function runAcpStdioServer(
  options: RunAcpStdioServerOptions,
): Promise<number> {
  const activeJobs = new Map<string, ActiveProtocolJob>()
  let shouldShutdown = false
  try {
    for await (const line of readJsonLines(options.stdin)) {
      let parsed: unknown
      try {
        parsed = JSON.parse(line)
      } catch {
        writeJsonLine(options.stdout, errorResponse(null, -32700, "Parse error"))
        continue
      }
      const requestResult = requestSchema.safeParse(parsed)
      if (!requestResult.success) {
        writeJsonLine(
          options.stdout,
          errorResponse(null, -32600, "Invalid request", requestResult.error.flatten()),
        )
        continue
      }
      shouldShutdown = handleRequest(requestResult.data, options, activeJobs)
      if (shouldShutdown) break
    }
    await drainActiveProtocolJobs(activeJobs, 250)
    cancelActiveProtocolJobs(options, activeJobs)
    await drainActiveProtocolJobs(activeJobs, 250)
    return HEADLESS_EXIT_CODES.success
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    writeStderr(options.stderr, `[ACP] ${message}`)
    writeJsonLine(options.stdout, errorResponse(null, -32600, message))
    cancelActiveProtocolJobs(options, activeJobs)
    await drainActiveProtocolJobs(activeJobs, 250)
    return HEADLESS_EXIT_CODES.invalidArguments
  }
}

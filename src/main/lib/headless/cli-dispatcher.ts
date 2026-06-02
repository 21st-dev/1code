import type { Readable } from "stream"
import type { AgentJob, AgentJobEvent } from "../db/schema"
import { isTerminalAgentJobStatus, type AgentJobStatus } from "../../../shared/agent-jobs"
import {
  appendAgentJobEvent,
  completeAgentJob,
  createAgentJob,
  getAgentJob,
  getAgentJobPrompt,
  heartbeatAgentJob,
  listAgentJobEvents,
  listAgentJobs,
  requestCancelAgentJob,
  retryAgentJob,
  startAgentJob,
  type AgentJobDatabase,
} from "./job-store"
import { recoverStaleAgentJobs } from "./job-recovery"
import {
  formatEventsText,
  formatJobListText,
  formatJobText,
  serializeAgentJob,
  serializeAgentJobEvent,
} from "./cli-output"
import {
  parseHeadlessCliArgv,
  type HeadlessCliCommand,
  type HeadlessOutputFormat,
} from "./cli-args"
import type {
  AgentRuntimeObserver,
  AgentRuntimeRunRequest,
  AgentRuntimeRunResult,
  AgentTaskRunner,
} from "./agent-runtime-contract"

type Writer = {
  write(chunk: string): unknown
}

export type RunHeadlessCliCommandOptions = {
  argv?: string[]
  db: AgentJobDatabase
  appVersion?: string | null
  env?: NodeJS.ProcessEnv
  stdin?: Readable
  stdout?: Writer
  stderr?: Writer
  runner?: AgentTaskRunner | null
  now?: Date
}

export const HEADLESS_STDIN_MAX_BYTES = 1024 * 1024

const HEADLESS_EXIT_CODES = {
  success: 0,
  runtimeFailed: 1,
  invalidArguments: 2,
  unsupportedRuntimeOrMode: 3,
  missingCredentials: 4,
  canceled: 5,
  localOnlyBlocked: 6,
  invalidCwd: 7,
  internalFailure: 8,
} as const

function write(writer: Writer | undefined, chunk: string): void {
  writer?.write(chunk)
}

function writeLine(writer: Writer | undefined, line: string): void {
  write(writer, `${line}\n`)
}

function writeJson(writer: Writer | undefined, value: unknown): void {
  writeLine(writer, JSON.stringify(value))
}

function commandError(
  stderr: Writer | undefined,
  message: string,
  code = 1,
): number {
  writeLine(stderr, message)
  return code
}

function isFakeRunnerEnabled(env: NodeJS.ProcessEnv | undefined): boolean {
  return env?.LOCUS_HEADLESS_FAKE_RUNNER === "1"
}

async function readStdin(stream: Readable | undefined): Promise<string> {
  if (!stream) return ""
  const chunks: Buffer[] = []
  let byteLength = 0
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
    byteLength += buffer.length
    if (byteLength > HEADLESS_STDIN_MAX_BYTES) {
      throw new Error(
        `stdin exceeds ${HEADLESS_STDIN_MAX_BYTES} byte limit`,
      )
    }
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString("utf-8")
}

function shouldUseJson(output: HeadlessOutputFormat): boolean {
  return output === "json" || output === "stream-json"
}

function outputJob(
  stdout: Writer | undefined,
  output: HeadlessOutputFormat,
  job: AgentJob,
): void {
  if (shouldUseJson(output)) {
    writeJson(stdout, { job: serializeAgentJob(job) })
    return
  }
  write(stdout, formatJobText(job))
}

function outputEvents(
  stdout: Writer | undefined,
  output: HeadlessOutputFormat,
  events: AgentJobEvent[],
): void {
  if (output === "stream-json") {
    for (const event of events) {
      writeJson(stdout, { event: serializeAgentJobEvent(event) })
    }
    return
  }
  if (output === "json") {
    writeJson(stdout, {
      events: events.map(serializeAgentJobEvent),
    })
    return
  }
  write(stdout, formatEventsText(events))
}

function outputRunResult(
  stdout: Writer | undefined,
  output: HeadlessOutputFormat,
  job: AgentJob,
  events: AgentJobEvent[],
): void {
  if (output === "stream-json") {
    writeJson(stdout, { job: serializeAgentJob(job) })
    for (const event of events) {
      writeJson(stdout, { event: serializeAgentJobEvent(event) })
    }
    return
  }
  if (output === "json") {
    writeJson(stdout, {
      job: serializeAgentJob(job),
      events: events.map(serializeAgentJobEvent),
    })
    return
  }

  const finalMessage =
    job.resultJson && typeof job.resultJson === "string"
      ? JSON.parse(job.resultJson).finalMessage
      : null
  if (typeof finalMessage === "string" && finalMessage.trim()) {
    writeLine(stdout, finalMessage)
    return
  }
  write(stdout, formatJobText(job))
}

function fakeAgentTaskRunner(
  request: AgentRuntimeRunRequest,
  observer: AgentRuntimeObserver,
): Promise<AgentRuntimeRunResult> {
  observer.appendEvent("status", {
    fake: true,
    status: "running",
    runtime: request.runtime,
  })
  observer.appendEvent("assistant_delta", {
    fake: true,
    text: `Fake ${request.runtime} response for: ${request.prompt.slice(0, 120)}`,
  })
  observer.heartbeat()
  return Promise.resolve({
    status: "succeeded",
    exitCode: 0,
    result: {
      fake: true,
      finalMessage: `Fake ${request.runtime} job completed.`,
    },
  })
}

function normalizeHeadlessExitCode(input: {
  status?: AgentJobStatus | null
  errorCode?: string | null
}): number {
  if (input.status === "succeeded") return HEADLESS_EXIT_CODES.success
  if (input.status === "canceled") return HEADLESS_EXIT_CODES.canceled
  if (input.errorCode === "unsupported_capability") {
    return HEADLESS_EXIT_CODES.unsupportedRuntimeOrMode
  }
  if (input.errorCode === "runtime_auth_required") {
    return HEADLESS_EXIT_CODES.missingCredentials
  }
  if (input.errorCode === "local_only_guard_blocked") {
    return HEADLESS_EXIT_CODES.localOnlyBlocked
  }
  if (input.errorCode === "invalid_cwd") return HEADLESS_EXIT_CODES.invalidCwd
  if (
    input.errorCode === "spawn_failed" ||
    input.errorCode === "heartbeat_failed" ||
    input.errorCode === "internal_error"
  ) {
    return HEADLESS_EXIT_CODES.internalFailure
  }
  return HEADLESS_EXIT_CODES.runtimeFailed
}

function createObserver(
  db: AgentJobDatabase,
  jobId: string,
  workerId: string,
  abortController: AbortController,
): AgentRuntimeObserver {
  return {
    appendEvent(type, payload) {
      const current = getAgentJob(db, jobId)
      if (current?.cancelRequestedAt) abortController.abort()
      return appendAgentJobEvent(db, { jobId, type, payload })
    },
    heartbeat() {
      const job = heartbeatAgentJob(db, jobId, workerId)
      if (job.cancelRequestedAt) abortController.abort()
      return job
    },
    isCancelRequested() {
      const job = getAgentJob(db, jobId)
      const requested = !!job?.cancelRequestedAt
      if (requested) abortController.abort()
      return requested
    },
  }
}

async function runCommand(
  command: Extract<HeadlessCliCommand, { kind: "run" }>,
  options: RunHeadlessCliCommandOptions,
): Promise<number> {
  let stdinPrompt = ""
  try {
    stdinPrompt = command.stdin ? await readStdin(options.stdin) : ""
  } catch (error) {
    return commandError(
      options.stderr,
      error instanceof Error ? error.message : String(error),
      HEADLESS_EXIT_CODES.invalidArguments,
    )
  }
  const prompt = [command.prompt, stdinPrompt]
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n\n")
  if (!prompt) {
    return commandError(
      options.stderr,
      "locus run requires --prompt or --stdin",
      HEADLESS_EXIT_CODES.invalidArguments,
    )
  }

  const job = createAgentJob(options.db, {
    source: "cli",
    runtime: command.runtime,
    mode: command.mode,
    cwd: command.cwd,
    prompt,
    createdByVersion: options.appVersion ?? null,
  })
  const workerId = `headless:${process.pid}:${Date.now()}`
  startAgentJob(options.db, {
    jobId: job.id,
    workerId,
    workerPid: process.pid,
  })

  let runner =
    options.runner ??
    (isFakeRunnerEnabled(options.env) ? fakeAgentTaskRunner : null)
  if (!runner) {
    runner = (await import("./agent-runtime")).runAgentTask
  }

  const abortController = new AbortController()
  const observer = createObserver(options.db, job.id, workerId, abortController)
  try {
    const result = await runner(
      {
        jobId: job.id,
        runtime: command.runtime,
        cwd: command.cwd,
        mode: command.mode,
        prompt,
        signal: abortController.signal,
      },
      observer,
    )
    const canceled = observer.isCancelRequested() || abortController.signal.aborted
    const status = canceled ? "canceled" : result.status ?? "succeeded"
    const errorCode = canceled ? "job_canceled" : result.errorCode ?? null
    const exitCode = normalizeHeadlessExitCode({ status, errorCode })
    const completed = completeAgentJob(options.db, {
      jobId: job.id,
      status,
      exitCode,
      errorCode,
      errorMessage: canceled ? "Job was canceled." : result.errorMessage ?? null,
      result: result.result,
    })
    outputRunResult(
      options.stdout,
      command.output,
      completed,
      listAgentJobEvents(options.db, job.id),
    )
    return exitCode
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const status = abortController.signal.aborted ? "canceled" : "failed"
    const errorCode = abortController.signal.aborted
      ? "job_canceled"
      : "runtime_error"
    const exitCode = normalizeHeadlessExitCode({ status, errorCode })
    const completed = completeAgentJob(options.db, {
      jobId: job.id,
      status,
      exitCode,
      errorCode,
      errorMessage: abortController.signal.aborted ? "Job was canceled." : message,
    })
    outputRunResult(
      options.stdout,
      command.output,
      completed,
      listAgentJobEvents(options.db, job.id),
    )
    return exitCode
  }
}

function listCommand(
  command: Extract<HeadlessCliCommand, { kind: "jobs-list" }>,
  options: RunHeadlessCliCommandOptions,
): number {
  const jobs = listAgentJobs(options.db, { source: "cli", limit: 100 })
  if (command.output === "json" || command.output === "stream-json") {
    writeJson(options.stdout, { jobs: jobs.map(serializeAgentJob) })
  } else {
    write(options.stdout, formatJobListText(jobs))
  }
  return 0
}

function showCommand(
  command: Extract<HeadlessCliCommand, { kind: "jobs-show" }>,
  options: RunHeadlessCliCommandOptions,
): number {
  const job = getAgentJob(options.db, command.jobId)
  if (!job) return commandError(options.stderr, `Unknown job: ${command.jobId}`, 3)
  outputJob(options.stdout, command.output, job)
  return 0
}

async function logsCommand(
  command: Extract<HeadlessCliCommand, { kind: "jobs-logs" }>,
  options: RunHeadlessCliCommandOptions,
): Promise<number> {
  const job = getAgentJob(options.db, command.jobId)
  if (!job) return commandError(options.stderr, `Unknown job: ${command.jobId}`, 3)

  let afterSequence = 0
  let currentJob: AgentJob | null = job
  do {
    const events = listAgentJobEvents(options.db, command.jobId, afterSequence)
    if (events.length > 0) {
      afterSequence = events[events.length - 1]!.sequence
      outputEvents(options.stdout, command.output, events)
    } else if (!command.follow) {
      outputEvents(options.stdout, command.output, [])
    }
    if (!command.follow) break
    currentJob = getAgentJob(options.db, command.jobId)
    if (
      currentJob &&
      isTerminalAgentJobStatus(currentJob.status as AgentJobStatus)
    ) {
      break
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  } while (command.follow)
  return 0
}

function cancelCommand(
  command: Extract<HeadlessCliCommand, { kind: "jobs-cancel" }>,
  options: RunHeadlessCliCommandOptions,
): number {
  const job = getAgentJob(options.db, command.jobId)
  if (!job) return commandError(options.stderr, `Unknown job: ${command.jobId}`, 3)
  let updated = requestCancelAgentJob(options.db, command.jobId, "cli")
  if (updated.status === "queued") {
    updated = completeAgentJob(options.db, {
      jobId: command.jobId,
      status: "canceled",
      exitCode: HEADLESS_EXIT_CODES.canceled,
      errorCode: "job_canceled",
      errorMessage: "Job was canceled before it started.",
    })
  }
  outputJob(options.stdout, command.output, updated)
  return 0
}

function retryCommand(
  command: Extract<HeadlessCliCommand, { kind: "jobs-retry" }>,
  options: RunHeadlessCliCommandOptions,
): number {
  const job = getAgentJob(options.db, command.jobId)
  if (!job) return commandError(options.stderr, `Unknown job: ${command.jobId}`, 3)
  if (job.source === "desktop") {
    return commandError(
      options.stderr,
      "Desktop chat jobs must be retried from their linked chat.",
      3,
    )
  }
  getAgentJobPrompt(options.db, command.jobId)
  const retry = retryAgentJob(options.db, command.jobId)
  outputJob(options.stdout, command.output, retry)
  return 0
}

function helpCommand(options: RunHeadlessCliCommandOptions): number {
  write(
    options.stdout,
    [
      "Usage:",
      "  locus run --runtime claude-code|codex --prompt <text> [--cwd <path>] [--mode plan|agent] [--output text|json|stream-json]",
      "  locus run --stdin [--prompt <prefix>]",
      `  stdin limit: ${HEADLESS_STDIN_MAX_BYTES} bytes`,
      "  locus jobs list",
      "  locus jobs show <id>",
      "  locus jobs logs <id> [--follow]",
      "  locus jobs cancel <id>",
      "  locus jobs retry <id>",
      "",
    ].join("\n"),
  )
  return 0
}

export async function runHeadlessCliCommand(
  options: RunHeadlessCliCommandOptions,
): Promise<number> {
  const parsed = parseHeadlessCliArgv(options.argv)
  if (!parsed.ok) {
    return commandError(options.stderr, parsed.message, parsed.code)
  }

  recoverStaleAgentJobs(options.db, options.now)

  switch (parsed.command.kind) {
    case "run":
      return runCommand(parsed.command, options)
    case "jobs-list":
      return listCommand(parsed.command, options)
    case "jobs-show":
      return showCommand(parsed.command, options)
    case "jobs-logs":
      return logsCommand(parsed.command, options)
    case "jobs-cancel":
      return cancelCommand(parsed.command, options)
    case "jobs-retry":
      return retryCommand(parsed.command, options)
    case "help":
      return helpCommand(options)
  }
}

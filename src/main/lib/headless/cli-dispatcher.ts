import type { Readable } from "stream"
import type { AgentJob, AgentJobEvent } from "../db/schema"
import { isTerminalAgentJobStatus, type AgentJobStatus } from "../../../shared/agent-jobs"
import {
  completeAgentJob,
  createAgentJob,
  getAgentJob,
  getAgentJobPrompt,
  listAgentJobEvents,
  listAgentJobs,
  requestCancelAgentJob,
  retryAgentJob,
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
import type { AgentTaskRunner } from "./agent-runtime-contract"
import {
  HEADLESS_EXIT_CODES,
  runPersistedAgentJob,
} from "./job-runner"
import { runLocalAgentDaemon } from "./daemon"

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
  daemonLockPath?: string | null
}

export const HEADLESS_STDIN_MAX_BYTES = 1024 * 1024

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
    source: command.daemon ? "daemon" : "cli",
    runtime: command.runtime,
    mode: command.mode,
    cwd: command.cwd,
    prompt,
    createdByVersion: options.appVersion ?? null,
  })

  if (command.daemon) {
    if (command.follow) {
      outputJob(options.stdout, command.output, job)
      return logsCommand(
        {
          kind: "jobs-logs",
          jobId: job.id,
          follow: true,
          output: command.output,
        },
        options,
      )
    }
    outputJob(options.stdout, command.output, job)
    return HEADLESS_EXIT_CODES.success
  }

  const result = await runPersistedAgentJob({
    db: options.db,
    jobId: job.id,
    runner: options.runner,
    env: options.env,
  })
  outputRunResult(options.stdout, command.output, result.job, result.events)
  return result.exitCode
}

function listCommand(
  command: Extract<HeadlessCliCommand, { kind: "jobs-list" }>,
  options: RunHeadlessCliCommandOptions,
): number {
  const jobs = listAgentJobs(options.db, {
    source: command.source === "all" ? undefined : command.source,
    limit: 100,
  })
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

async function daemonRunCommand(
  command: Extract<HeadlessCliCommand, { kind: "daemon-run" }>,
  options: RunHeadlessCliCommandOptions,
): Promise<number> {
  const abortController = new AbortController()
  const abort = () => abortController.abort()
  if (!command.once) {
    process.once("SIGINT", abort)
    process.once("SIGTERM", abort)
  }

  try {
    const result = await runLocalAgentDaemon({
      db: options.db,
      env: options.env,
      runner: options.runner,
      stderr: options.stderr,
      concurrency: command.concurrency,
      pollIntervalMs: command.pollIntervalMs,
      once: command.once,
      lockPath: options.daemonLockPath,
      signal: abortController.signal,
      now: options.now,
    })
    if (shouldUseJson(command.output)) {
      writeJson(options.stdout, { daemon: result })
    } else {
      writeLine(
        options.stdout,
        `daemon stopped (${result.stoppedBy}); started=${result.startedJobs} completed=${result.completedJobs} failed=${result.failedJobs} interrupted=${result.interruptedJobs}`,
      )
    }
    return HEADLESS_EXIT_CODES.success
  } catch (error) {
    return commandError(
      options.stderr,
      error instanceof Error ? error.message : String(error),
      HEADLESS_EXIT_CODES.internalFailure,
    )
  } finally {
    process.removeListener("SIGINT", abort)
    process.removeListener("SIGTERM", abort)
  }
}

function helpCommand(options: RunHeadlessCliCommandOptions): number {
  write(
    options.stdout,
    [
      "Usage:",
      "  locus run --runtime claude-code|codex --prompt <text> [--cwd <path>] [--mode plan|agent] [--output text|json|stream-json]",
      "  locus run --stdin [--prompt <prefix>]",
      "  locus run --daemon [--follow] --prompt <text>",
      "  locus daemon run [--concurrency <n>] [--poll-interval-ms <ms>]",
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

  if (parsed.command.kind !== "daemon-run") {
    recoverStaleAgentJobs(options.db, options.now)
  }

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
    case "daemon-run":
      return daemonRunCommand(parsed.command, options)
    case "help":
      return helpCommand(options)
  }
}

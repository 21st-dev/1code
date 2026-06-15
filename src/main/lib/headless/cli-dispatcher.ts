import type { Readable } from "stream"
import { readFileSync } from "node:fs"
import type { AgentJob, AgentJobEvent, Project } from "../db/schema"
import { isTerminalAgentJobStatus, type AgentJobStatus } from "../../../shared/agent-jobs"
import {
  completeAgentJob,
  appendAgentJobEvent,
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
  formatScheduleListText,
  formatScheduleText,
  serializeAgentJob,
  serializeAgentJobEvent,
  serializeAgentSchedule,
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
  type RunPersistedAgentJobResult,
} from "./job-runner"
import { runLocalAgentDaemon } from "./daemon"
import { runAcpStdioServer } from "./acp-stdio"
import {
  getProjectRegistrationForCwd,
  isProjectRegistrationError,
  registerProjectForPath,
  type ProjectRegistrationError,
  unregisterProjectForPath,
} from "../projects/registry"
import {
  createAgentSchedule,
  deleteAgentSchedule,
  findRegisteredProjectForCwd,
  listAgentSchedules,
  pauseAgentSchedule,
  resumeAgentSchedule,
  runAgentScheduleNow,
} from "./schedules"
import {
  createLocalJobApiJob,
  getLocalJobApiEvents,
  getLocalJobApiJobOrThrow,
  parseLocalJobApiCreateRequestJson,
  retryLocalJobApiJob,
  toLocalJobApiJobEnvelope,
  toLocalJobApiResultEnvelope,
  toLocalJobApiRuntimeManifestEnvelope,
  writeLocalJobApiFinalArtifacts,
  writeLocalJobApiInitialArtifacts,
} from "./local-job-api"
import {
  LOCAL_JOB_API_PROJECT_NOT_REGISTERED,
  LOCAL_JOB_API_VERSION,
} from "../../../shared/local-job-api"

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

function readRequestFile(path: string): string {
  if (path === "-") {
    throw new Error("stdin request must be read asynchronously")
  }
  const buffer = readFileSync(path)
  if (buffer.byteLength > HEADLESS_STDIN_MAX_BYTES) {
    throw new Error(`request file exceeds ${HEADLESS_STDIN_MAX_BYTES} byte limit`)
  }
  return buffer.toString("utf-8")
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

function outputSchedule(
  stdout: Writer | undefined,
  output: HeadlessOutputFormat,
  schedule: Parameters<typeof serializeAgentSchedule>[0],
): void {
  if (shouldUseJson(output)) {
    writeJson(stdout, { schedule: serializeAgentSchedule(schedule) })
    return
  }
  write(stdout, formatScheduleText(schedule))
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

  let project: ReturnType<typeof findRegisteredProjectForCwd>
  try {
    project = findRegisteredProjectForCwd(options.db, command.cwd, null, "Run cwd")
  } catch (error) {
    return commandError(
      options.stderr,
      error instanceof Error ? error.message : String(error),
      HEADLESS_EXIT_CODES.invalidCwd,
    )
  }

  const job = createAgentJob(options.db, {
    source: command.daemon ? "daemon" : "cli",
    runtime: command.runtime,
    mode: command.mode,
    cwd: command.cwd,
    prompt,
    projectId: project.id,
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
  if (job.source === "api") {
    return commandError(
      options.stderr,
      "API jobs must be retried through locus api runs retry.",
      3,
    )
  }
  getAgentJobPrompt(options.db, command.jobId)
  const retry = retryAgentJob(options.db, command.jobId)
  outputJob(options.stdout, command.output, retry)
  return 0
}

async function readApiRequestContent(
  command: Extract<HeadlessCliCommand, { kind: "api-runs-create" }>,
  options: RunHeadlessCliCommandOptions,
): Promise<string> {
  if (command.requestPath === "-") return readStdin(options.stdin)
  return readRequestFile(command.requestPath)
}

async function runPreparedLocalJobApiJob(
  prepared: ReturnType<typeof createLocalJobApiJob>,
  options: RunHeadlessCliCommandOptions,
): Promise<RunPersistedAgentJobResult> {
  const initialArtifacts = writeLocalJobApiInitialArtifacts({
    runDir: prepared.runDir,
    request: prepared.request,
    job: prepared.job,
    events: listAgentJobEvents(options.db, prepared.job.id),
  })
  if (initialArtifacts.length > 0) {
    appendAgentJobEvent(options.db, {
      jobId: prepared.job.id,
      type: "artifact_created",
      payload: {
        artifacts: initialArtifacts,
      },
    })
  }

  const result = await runPersistedAgentJob({
    db: options.db,
    jobId: prepared.job.id,
    runner: options.runner,
    env: options.env,
  })
  const finalEvents = listAgentJobEvents(options.db, result.job.id)
  const artifacts = writeLocalJobApiFinalArtifacts({
    runDir: prepared.runDir,
    job: result.job,
    events: finalEvents,
  })
  writeJson(options.stdout, {
    apiVersion: LOCAL_JOB_API_VERSION,
    job: toLocalJobApiJobEnvelope(result.job).job,
    result: toLocalJobApiResultEnvelope(result.job, artifacts),
  })
  return result
}

async function apiRunsCreateCommand(
  command: Extract<HeadlessCliCommand, { kind: "api-runs-create" }>,
  options: RunHeadlessCliCommandOptions,
): Promise<number> {
  try {
    const request = parseLocalJobApiCreateRequestJson(
      await readApiRequestContent(command, options),
    )
    const prepared = createLocalJobApiJob(
      options.db,
      request,
      options.appVersion,
    )
    const result = await runPreparedLocalJobApiJob(prepared, options)
    return result.exitCode
  } catch (error) {
    if (isLocalJobApiProjectNotRegisteredError(error)) {
      writeJson(options.stdout, toLocalJobApiProjectErrorEnvelope(error))
      return HEADLESS_EXIT_CODES.invalidCwd
    }
    const message = error instanceof Error ? error.message : String(error)
    return commandError(
      options.stderr,
      message,
      localJobApiCreateErrorCode(error),
    )
  }
}

function apiRuntimesListCommand(options: RunHeadlessCliCommandOptions): number {
  writeJson(options.stdout, toLocalJobApiRuntimeManifestEnvelope())
  return HEADLESS_EXIT_CODES.success
}

function isoDate(value: Date | string | number | null | undefined): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function serializeLocalJobApiProject(project: Project) {
  return {
    id: project.id,
    name: project.name,
    path: project.path,
    createdAt: isoDate(project.createdAt),
    updatedAt: isoDate(project.updatedAt),
  }
}

function serializeLocalJobApiActiveJob(
  job: ReturnType<typeof unregisterProjectForPath>["activeJobs"][number],
) {
  return {
    id: job.id,
    source: job.source,
    runtime: job.runtime,
    status: job.status,
    createdAt: isoDate(job.createdAt),
  }
}

function apiProjectCommandErrorCode(error: unknown): number {
  if (isProjectRegistrationError(error)) return HEADLESS_EXIT_CODES.invalidCwd
  return HEADLESS_EXIT_CODES.invalidArguments
}

async function apiProjectsRegisterCommand(
  command: Extract<HeadlessCliCommand, { kind: "api-projects-register" }>,
  options: RunHeadlessCliCommandOptions,
): Promise<number> {
  try {
    const registration = await registerProjectForPath({
      db: options.db,
      path: command.cwd,
      name: command.name,
    })
    writeJson(options.stdout, {
      apiVersion: LOCAL_JOB_API_VERSION,
      registered: true,
      created: registration.created,
      cwd: registration.canonicalPath,
      project: serializeLocalJobApiProject(registration.project),
    })
    return HEADLESS_EXIT_CODES.success
  } catch (error) {
    return commandError(
      options.stderr,
      error instanceof Error ? error.message : String(error),
      apiProjectCommandErrorCode(error),
    )
  }
}

function apiProjectsStatusCommand(
  command: Extract<HeadlessCliCommand, { kind: "api-projects-status" }>,
  options: RunHeadlessCliCommandOptions,
): number {
  try {
    const registration = getProjectRegistrationForCwd({
      db: options.db,
      cwd: command.cwd,
      label: "Project cwd",
    })
    if (registration.registered) {
      writeJson(options.stdout, {
        apiVersion: LOCAL_JOB_API_VERSION,
        registered: true,
        cwd: registration.cwd,
        project: serializeLocalJobApiProject(registration.project),
      })
      return HEADLESS_EXIT_CODES.success
    }

    writeJson(options.stdout, {
      apiVersion: LOCAL_JOB_API_VERSION,
      registered: false,
      cwd: registration.cwd,
      error: {
        code: LOCAL_JOB_API_PROJECT_NOT_REGISTERED,
        message: "Project cwd must be inside a registered project",
      },
    })
    return HEADLESS_EXIT_CODES.success
  } catch (error) {
    return commandError(
      options.stderr,
      error instanceof Error ? error.message : String(error),
      apiProjectCommandErrorCode(error),
    )
  }
}

function apiProjectsUnregisterCommand(
  command: Extract<HeadlessCliCommand, { kind: "api-projects-unregister" }>,
  options: RunHeadlessCliCommandOptions,
): number {
  try {
    const result = unregisterProjectForPath({
      db: options.db,
      path: command.cwd,
      force: command.force,
    })
    if (result.removed) {
      writeJson(options.stdout, {
        apiVersion: LOCAL_JOB_API_VERSION,
        removed: true,
        cwd: result.canonicalPath,
        project: serializeLocalJobApiProject(result.project),
        activeJobs: result.activeJobs.map(serializeLocalJobApiActiveJob),
      })
      return HEADLESS_EXIT_CODES.success
    }

    if (result.reason === "active_jobs") {
      writeJson(options.stdout, {
        apiVersion: LOCAL_JOB_API_VERSION,
        removed: false,
        cwd: result.canonicalPath,
        project: result.project
          ? serializeLocalJobApiProject(result.project)
          : null,
        activeJobs: result.activeJobs.map(serializeLocalJobApiActiveJob),
        error: {
          code: "project_has_active_jobs",
          message: "Project has active jobs; rerun with --force to unregister.",
        },
      })
      return HEADLESS_EXIT_CODES.invalidArguments
    }

    writeJson(options.stdout, {
      apiVersion: LOCAL_JOB_API_VERSION,
      removed: false,
      cwd: result.canonicalPath,
      project: null,
      activeJobs: [],
      error: {
        code: LOCAL_JOB_API_PROJECT_NOT_REGISTERED,
        message: "Project path is not registered",
      },
    })
    return HEADLESS_EXIT_CODES.invalidCwd
  } catch (error) {
    return commandError(
      options.stderr,
      error instanceof Error ? error.message : String(error),
      apiProjectCommandErrorCode(error),
    )
  }
}

function isLocalJobApiProjectNotRegisteredError(
  error: unknown,
): error is ProjectRegistrationError {
  return (
    isProjectRegistrationError(error) &&
    error.code === LOCAL_JOB_API_PROJECT_NOT_REGISTERED
  )
}

function toLocalJobApiProjectErrorEnvelope(error: ProjectRegistrationError) {
  return {
    apiVersion: LOCAL_JOB_API_VERSION,
    error: {
      code: error.code,
      message: error.message,
      cwd: error.cwd,
      projectId: error.projectId,
    },
  }
}

function localJobApiCreateErrorCode(error: unknown): number {
  if (isProjectRegistrationError(error)) return HEADLESS_EXIT_CODES.invalidCwd
  const message = error instanceof Error ? error.message : String(error)
  if (/unsupported/i.test(message)) {
    return HEADLESS_EXIT_CODES.unsupportedRuntimeOrMode
  }
  return HEADLESS_EXIT_CODES.invalidArguments
}

function apiRunsStatusCommand(
  command: Extract<HeadlessCliCommand, { kind: "api-runs-status" }>,
  options: RunHeadlessCliCommandOptions,
): number {
  try {
    writeJson(options.stdout, toLocalJobApiJobEnvelope(getLocalJobApiJobOrThrow(options.db, command.jobId)))
    return HEADLESS_EXIT_CODES.success
  } catch (error) {
    return commandError(
      options.stderr,
      error instanceof Error ? error.message : String(error),
      HEADLESS_EXIT_CODES.unsupportedRuntimeOrMode,
    )
  }
}

function apiRunsResultCommand(
  command: Extract<HeadlessCliCommand, { kind: "api-runs-result" }>,
  options: RunHeadlessCliCommandOptions,
): number {
  try {
    const job = getLocalJobApiJobOrThrow(options.db, command.jobId)
    writeJson(options.stdout, toLocalJobApiResultEnvelope(job))
    return HEADLESS_EXIT_CODES.success
  } catch (error) {
    return commandError(
      options.stderr,
      error instanceof Error ? error.message : String(error),
      HEADLESS_EXIT_CODES.unsupportedRuntimeOrMode,
    )
  }
}

async function apiRunsEventsCommand(
  command: Extract<HeadlessCliCommand, { kind: "api-runs-events" }>,
  options: RunHeadlessCliCommandOptions,
): Promise<number> {
  try {
    let afterSequence = command.afterSequence
    do {
      const events = getLocalJobApiEvents(options.db, command.jobId, afterSequence)
      for (const event of events) {
        afterSequence = event.sequence
        writeJson(options.stdout, event)
      }
      if (!command.follow) break
      const job = getLocalJobApiJobOrThrow(options.db, command.jobId)
      if (isTerminalAgentJobStatus(job.status as AgentJobStatus)) break
      await new Promise((resolve) => setTimeout(resolve, 1000))
    } while (command.follow)
    return HEADLESS_EXIT_CODES.success
  } catch (error) {
    return commandError(
      options.stderr,
      error instanceof Error ? error.message : String(error),
      HEADLESS_EXIT_CODES.unsupportedRuntimeOrMode,
    )
  }
}

function apiRunsCancelCommand(
  command: Extract<HeadlessCliCommand, { kind: "api-runs-cancel" }>,
  options: RunHeadlessCliCommandOptions,
): number {
  try {
    const job = getLocalJobApiJobOrThrow(options.db, command.jobId)
    let updated = requestCancelAgentJob(options.db, job.id, "api")
    if (updated.status === "queued") {
      updated = completeAgentJob(options.db, {
        jobId: job.id,
        status: "canceled",
        exitCode: HEADLESS_EXIT_CODES.canceled,
        errorCode: "job_canceled",
        errorMessage: "Job was canceled before it started.",
      })
    }
    writeJson(options.stdout, toLocalJobApiJobEnvelope(updated))
    return HEADLESS_EXIT_CODES.success
  } catch (error) {
    return commandError(
      options.stderr,
      error instanceof Error ? error.message : String(error),
      HEADLESS_EXIT_CODES.unsupportedRuntimeOrMode,
    )
  }
}

async function apiRunsRetryCommand(
  command: Extract<HeadlessCliCommand, { kind: "api-runs-retry" }>,
  options: RunHeadlessCliCommandOptions,
): Promise<number> {
  try {
    const job = getLocalJobApiJobOrThrow(options.db, command.jobId)
    const result = await runPreparedLocalJobApiJob(
      retryLocalJobApiJob(options.db, job),
      options,
    )
    return result.exitCode
  } catch (error) {
    return commandError(
      options.stderr,
      error instanceof Error ? error.message : String(error),
      HEADLESS_EXIT_CODES.unsupportedRuntimeOrMode,
    )
  }
}

function scheduleErrorCode(message: string): number {
  if (/cwd|project path|registered project/i.test(message)) {
    return HEADLESS_EXIT_CODES.invalidCwd
  }
  if (/Unsupported/.test(message)) return HEADLESS_EXIT_CODES.unsupportedRuntimeOrMode
  return HEADLESS_EXIT_CODES.invalidArguments
}

function schedulesListCommand(
  command: Extract<HeadlessCliCommand, { kind: "schedules-list" }>,
  options: RunHeadlessCliCommandOptions,
): number {
  const schedules = listAgentSchedules(options.db, {
    includeDisabled: command.includeDisabled,
    status: command.status ?? undefined,
    limit: 100,
  })
  if (shouldUseJson(command.output)) {
    writeJson(options.stdout, {
      schedules: schedules.map(serializeAgentSchedule),
    })
    return HEADLESS_EXIT_CODES.success
  }
  write(options.stdout, formatScheduleListText(schedules))
  return HEADLESS_EXIT_CODES.success
}

function schedulesCreateCommand(
  command: Extract<HeadlessCliCommand, { kind: "schedules-create" }>,
  options: RunHeadlessCliCommandOptions,
): number {
  try {
    const schedule = createAgentSchedule(options.db, {
      name: command.name,
      cwd: command.cwd,
      runtime: command.runtime,
      mode: command.mode,
      prompt: command.prompt,
      intervalSeconds: command.intervalSeconds,
      now: options.now,
    })
    outputSchedule(options.stdout, command.output, schedule)
    return HEADLESS_EXIT_CODES.success
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return commandError(options.stderr, message, scheduleErrorCode(message))
  }
}

function schedulesMutationCommand(
  command: Extract<
    HeadlessCliCommand,
    {
      kind:
        | "schedules-pause"
        | "schedules-resume"
        | "schedules-delete"
        | "schedules-run"
    }
  >,
  options: RunHeadlessCliCommandOptions,
): number {
  try {
    if (command.kind === "schedules-run") {
      const fired = runAgentScheduleNow(options.db, command.scheduleId, options.now)
      if (shouldUseJson(command.output)) {
        writeJson(options.stdout, {
          schedule: serializeAgentSchedule(fired.schedule),
          job: serializeAgentJob(fired.job),
        })
      } else {
        write(options.stdout, formatScheduleText(fired.schedule))
        write(options.stdout, formatJobText(fired.job))
      }
      return HEADLESS_EXIT_CODES.success
    }

    const schedule =
      command.kind === "schedules-pause"
        ? pauseAgentSchedule(options.db, command.scheduleId, options.now)
        : command.kind === "schedules-resume"
          ? resumeAgentSchedule(options.db, command.scheduleId, options.now)
          : deleteAgentSchedule(options.db, command.scheduleId, options.now)
    outputSchedule(options.stdout, command.output, schedule)
    return HEADLESS_EXIT_CODES.success
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return commandError(options.stderr, message, scheduleErrorCode(message))
  }
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
        `daemon stopped (${result.stoppedBy}); scheduled=${result.scheduledJobs} started=${result.startedJobs} completed=${result.completedJobs} failed=${result.failedJobs} interrupted=${result.interruptedJobs}`,
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

async function acpCommand(options: RunHeadlessCliCommandOptions): Promise<number> {
  return runAcpStdioServer({
    db: options.db,
    stdin: options.stdin,
    stdout: options.stdout,
    stderr: options.stderr,
    env: options.env,
    runner: options.runner,
  })
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
      "  locus schedules list [--status enabled|paused|disabled] [--include-disabled]",
      "  locus schedules create --name <name> --prompt <text> --interval-seconds <n> [--cwd <path>] [--runtime claude-code|codex] [--mode plan|agent]",
      "  locus schedules pause|resume|delete|run <id>",
      "  locus api runtimes list --json",
      "  locus api projects register --cwd <path> [--name <name>] --json",
      "  locus api projects status --cwd <path> --json",
      "  locus api projects unregister --cwd <path> [--force] --json",
      "  locus api runs create --request <path|-> --json",
      "  locus api runs status|result|cancel|retry <id> --json",
      "  locus api runs events <id> [--after <sequence>] [--follow] --jsonl",
      "  locus acp",
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
    case "api-runtimes-list":
      return apiRuntimesListCommand(options)
    case "api-projects-register":
      return apiProjectsRegisterCommand(parsed.command, options)
    case "api-projects-status":
      return apiProjectsStatusCommand(parsed.command, options)
    case "api-projects-unregister":
      return apiProjectsUnregisterCommand(parsed.command, options)
    case "api-runs-create":
      return apiRunsCreateCommand(parsed.command, options)
    case "api-runs-status":
      return apiRunsStatusCommand(parsed.command, options)
    case "api-runs-events":
      return apiRunsEventsCommand(parsed.command, options)
    case "api-runs-result":
      return apiRunsResultCommand(parsed.command, options)
    case "api-runs-cancel":
      return apiRunsCancelCommand(parsed.command, options)
    case "api-runs-retry":
      return apiRunsRetryCommand(parsed.command, options)
    case "schedules-list":
      return schedulesListCommand(parsed.command, options)
    case "schedules-create":
      return schedulesCreateCommand(parsed.command, options)
    case "schedules-pause":
    case "schedules-resume":
    case "schedules-delete":
    case "schedules-run":
      return schedulesMutationCommand(parsed.command, options)
    case "acp":
      return acpCommand(options)
    case "daemon-run":
      return daemonRunCommand(parsed.command, options)
    case "help":
      return helpCommand(options)
  }
}

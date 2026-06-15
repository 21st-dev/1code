import type { AgentJob, AgentJobEvent } from "../db/schema"
import type {
  AgentJobMode,
  AgentJobRuntime,
  AgentJobSource,
  AgentJobStatus,
} from "../../../shared/agent-jobs"
import {
  appendAgentJobEvent,
  completeAgentJob,
  getAgentJob,
  getAgentJobPrompt,
  heartbeatAgentJob,
  listAgentJobEvents,
  startAgentJob,
  type AgentJobDatabase,
} from "./job-store"
import type {
  AgentRuntimeObserver,
  AgentRuntimeRunRequest,
  AgentRuntimeRunResult,
  AgentTaskRunner,
} from "./agent-runtime-contract"
import { createAgentRuntimeRunRequest } from "./agent-runtime-contract"

export const HEADLESS_EXIT_CODES = {
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

export type RunPersistedAgentJobOptions = {
  db: AgentJobDatabase
  jobId: string
  runner?: AgentTaskRunner | null
  env?: NodeJS.ProcessEnv
  workerId?: string
  workerPid?: number | null
  signal?: AbortSignal
}

export type RunPersistedAgentJobResult = {
  job: AgentJob
  events: AgentJobEvent[]
  exitCode: number
}

export function isFakeRunnerEnabled(
  env: NodeJS.ProcessEnv | undefined,
): boolean {
  return env?.LOCUS_HEADLESS_FAKE_RUNNER === "1"
}

export function fakeAgentTaskRunner(
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

export function normalizeHeadlessExitCode(input: {
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

async function resolveRunner(
  runner: AgentTaskRunner | null | undefined,
  env: NodeJS.ProcessEnv | undefined,
): Promise<AgentTaskRunner> {
  if (runner) return runner
  if (isFakeRunnerEnabled(env)) return fakeAgentTaskRunner
  return (await import("./agent-runtime")).runAgentTask
}

function canceledRunResult(): AgentRuntimeRunResult {
  return {
    status: "canceled",
    exitCode: HEADLESS_EXIT_CODES.canceled,
    errorCode: "job_canceled",
    errorMessage: "Job was canceled.",
  }
}

function waitForAbort(signal: AbortSignal): Promise<AgentRuntimeRunResult> {
  if (signal.aborted) return Promise.resolve(canceledRunResult())
  return new Promise((resolve) => {
    signal.addEventListener(
      "abort",
      () => {
        resolve(canceledRunResult())
      },
      { once: true },
    )
  })
}

export async function runPersistedAgentJob(
  options: RunPersistedAgentJobOptions,
): Promise<RunPersistedAgentJobResult> {
  const initial = getAgentJob(options.db, options.jobId)
  if (!initial) throw new Error(`Unknown job: ${options.jobId}`)
  const workerId =
    options.workerId ?? `headless:${process.pid}:${Date.now()}:${initial.id}`
  const workerPid = options.workerPid === undefined ? process.pid : options.workerPid
  const job = startAgentJob(options.db, {
    jobId: initial.id,
    workerId,
    workerPid,
  })
  const prompt = getAgentJobPrompt(options.db, job.id)
  const runner = await resolveRunner(options.runner, options.env)
  const abortController = new AbortController()
  const abortFromExternalSignal = () => abortController.abort()
  if (options.signal?.aborted) {
    abortController.abort()
  } else {
    options.signal?.addEventListener("abort", abortFromExternalSignal, {
      once: true,
    })
  }
  const observer = createObserver(
    options.db,
    job.id,
    workerId,
    abortController,
  )

  try {
    const result = abortController.signal.aborted
      ? canceledRunResult()
      : await (() => {
          const runnerPromise = runner(
            createAgentRuntimeRunRequest({
              jobId: job.id,
              runtime: job.runtime as AgentJobRuntime,
              cwd: job.cwd,
              mode: job.mode as AgentJobMode,
              source: job.source as AgentJobSource,
              prompt,
              signal: abortController.signal,
              attempt: job.attempt,
              projectId: job.projectId,
              chatId: job.chatId,
              subChatId: job.subChatId,
              apiConsumerId: job.apiConsumerId,
              apiConsumerRunId: job.apiConsumerRunId,
              artifactBaseDir: job.artifactBaseDir,
              artifactManifestPath: job.artifactManifestPath,
            }),
            observer,
          )
          void runnerPromise.catch(() => {})
          return Promise.race([
            runnerPromise,
            waitForAbort(abortController.signal),
          ])
        })()
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
    return {
      job: completed,
      events: listAgentJobEvents(options.db, job.id),
      exitCode,
    }
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
    return {
      job: completed,
      events: listAgentJobEvents(options.db, job.id),
      exitCode,
    }
  } finally {
    options.signal?.removeEventListener("abort", abortFromExternalSignal)
  }
}

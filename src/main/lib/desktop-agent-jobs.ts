import { createHash, randomUUID } from "node:crypto"
import type { AgentRuntimeId } from "../../shared/agent-runtime-capabilities"
import type { AgentJobMode } from "../../shared/agent-jobs"
import type { AgentJob } from "./db/schema"
import { verifyDesktopRunPreflight } from "./agent-runtime/preflight"
import type { AgentJobDatabase } from "./headless/job-store"
import {
  appendAgentJobEvent,
  completeAgentJob,
  createAgentJob,
  getAgentJob,
  heartbeatAgentJob,
  requestCancelAgentJob,
  startAgentJob,
} from "./headless/job-store"

type DesktopAgentRuntime = Extract<AgentRuntimeId, "claude-code" | "codex">

export type CreateDesktopAgentJobInput = {
  runtime: DesktopAgentRuntime
  mode: AgentJobMode
  chatId: string
  subChatId: string
  cwd: string
  prompt: string
  runId?: string | null
}

export type DesktopAgentJobHandle = {
  job: AgentJob
  workerId: string
  cwd: string
}

export type ResolveDesktopChatJobCompletionInput = {
  runtime: DesktopAgentRuntime
  aborted: boolean
  reachedNaturalFinish: boolean
  sawError: boolean
}

export type DesktopChatJobCompletion = {
  status: "succeeded" | "failed" | "canceled"
  exitCode: number
  errorCode: string | null
  errorMessage: string | null
}

type CancelRegistration = {
  jobId: string
  runtime: DesktopAgentRuntime
  subChatId: string
  runId?: string | null
  db: AgentJobDatabase
  workerId: string
  heartbeatIntervalMs?: number
  cancel: () => void
}

type ActiveCancelRegistration = CancelRegistration & {
  heartbeatTimer: ReturnType<typeof setInterval> | null
}

const activeDesktopJobCancellations = new Map<string, ActiveCancelRegistration>()

function assertDesktopRuntime(runtime: string): asserts runtime is DesktopAgentRuntime {
  if (runtime !== "claude-code" && runtime !== "codex") {
    throw new Error(`Unsupported desktop job runtime: ${runtime}`)
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

export function createAndStartDesktopAgentJob(
  db: AgentJobDatabase,
  input: CreateDesktopAgentJobInput,
): DesktopAgentJobHandle {
  assertDesktopRuntime(input.runtime)
  const context = verifyDesktopRunPreflight(db, input)
  const workerId = `desktop:${input.runtime}:${input.runId || randomUUID()}`
  const prompt = input.prompt
  const job = createAgentJob(db, {
    source: "desktop",
    runtime: input.runtime,
    mode: input.mode,
    cwd: context.cwd,
    prompt,
    input: {
      kind: "desktop-chat",
      chatId: context.chat.id,
      subChatId: context.subChat.id,
      projectId: context.project.id,
      runId: input.runId ?? null,
      promptSha256: sha256(prompt),
      promptLength: prompt.length,
    },
    projectId: context.project.id,
    chatId: context.chat.id,
    subChatId: context.subChat.id,
  })

  const running = startAgentJob(db, {
    jobId: job.id,
    workerId,
    workerPid: process.pid,
  })
  appendAgentJobEvent(db, {
    jobId: job.id,
    type: "status",
    payload: {
      status: "desktop_chat_stream_started",
      runtime: input.runtime,
      mode: input.mode,
      runId: input.runId ?? null,
    },
  })

  return { job: running, workerId, cwd: context.cwd }
}

export function registerActiveDesktopAgentJob(
  registration: CancelRegistration,
): void {
  unregisterActiveDesktopAgentJob(registration.jobId)
  const heartbeatTimer = setInterval(() => {
    try {
      heartbeatAgentJob(registration.db, registration.jobId, registration.workerId)
    } catch {
      unregisterActiveDesktopAgentJob(registration.jobId)
    }
  }, registration.heartbeatIntervalMs ?? 30_000)
  heartbeatTimer.unref?.()
  activeDesktopJobCancellations.set(registration.jobId, {
    ...registration,
    heartbeatTimer,
  })
}

export function unregisterActiveDesktopAgentJob(jobId: string): void {
  const registration = activeDesktopJobCancellations.get(jobId)
  if (registration?.heartbeatTimer) {
    clearInterval(registration.heartbeatTimer)
  }
  activeDesktopJobCancellations.delete(jobId)
}

export function cancelActiveDesktopAgentJob(jobId: string): boolean {
  const registration = activeDesktopJobCancellations.get(jobId)
  if (!registration) return false
  registration.cancel()
  return true
}

export function requestCancelDesktopAgentJob(
  db: AgentJobDatabase,
  jobId: string,
  requestedBy: string,
): { job: AgentJob; activeCancelDelivered: boolean } {
  const job = getAgentJob(db, jobId)
  if (!job) throw new Error(`Unknown job: ${jobId}`)
  const updated = requestCancelAgentJob(db, jobId, requestedBy)
  return {
    job: updated,
    activeCancelDelivered: cancelActiveDesktopAgentJob(jobId),
  }
}

function desktopRuntimeLabel(runtime: DesktopAgentRuntime): "Claude" | "Codex" {
  return runtime === "claude-code" ? "Claude" : "Codex"
}

export function resolveDesktopChatJobCompletion({
  runtime,
  aborted,
  reachedNaturalFinish,
  sawError,
}: ResolveDesktopChatJobCompletionInput): DesktopChatJobCompletion {
  const wasCanceled = aborted && !reachedNaturalFinish
  const status = wasCanceled ? "canceled" : sawError ? "failed" : "succeeded"
  const runtimeLabel = desktopRuntimeLabel(runtime)

  return {
    status,
    exitCode: status === "succeeded" ? 0 : status === "canceled" ? 5 : 1,
    errorCode:
      status === "failed"
        ? "desktop_chat_failed"
        : status === "canceled"
          ? "desktop_chat_canceled"
          : null,
    errorMessage:
      status === "failed"
        ? `Desktop ${runtimeLabel} chat stream failed.`
        : status === "canceled"
          ? `Desktop ${runtimeLabel} chat stream was canceled.`
          : null,
  }
}

export function completeDesktopAgentJobSafely(
  db: AgentJobDatabase,
  input: {
    jobId: string | null | undefined
    status: "succeeded" | "failed" | "canceled" | "interrupted"
    exitCode?: number | null
    errorCode?: string | null
    errorMessage?: string | null
    result?: unknown
  },
): AgentJob | null {
  if (!input.jobId) return null
  const current = getAgentJob(db, input.jobId)
  if (!current || current.status !== "running") return current
  return completeAgentJob(db, {
    jobId: input.jobId,
    status: input.status,
    exitCode: input.exitCode,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
    result: input.result,
  })
}

import { createHash, randomUUID } from "node:crypto"
import type { AgentRuntimeId } from "../../shared/agent-runtime-capabilities"
import type { AgentJobMode } from "../../shared/agent-jobs"
import type { AgentJob } from "./db/schema"
import type { DesktopPermissionPolicy } from "./agent-runtime/permission-policy"
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

type DesktopAgentRuntime = Extract<
  AgentRuntimeId,
  "claude-code" | "codex" | "qwen-code" | "kun"
>

export type CreateDesktopAgentJobInput = {
  runtime: DesktopAgentRuntime
  mode: AgentJobMode
  chatId: string
  subChatId: string
  cwd: string
  prompt: string
  runId?: string | null
  permissionPolicy?: DesktopPermissionPolicy | null
}

export type DesktopAgentJobHandle = {
  job: AgentJob
  workerId: string
  cwd: string
}

export type CreateAndRegisterDesktopChatAgentJobInput =
  CreateDesktopAgentJobInput & {
    cancel: () => void
    heartbeatIntervalMs?: number
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

export type CompleteDesktopChatAgentJobSafelyInput =
  ResolveDesktopChatJobCompletionInput & {
    jobId: string | null | undefined
    result?: unknown
  }

export type RequestCancelDesktopChatAgentJobSafelyInput = {
  jobId: string | null | undefined
  sawError: boolean
  reachedNaturalFinish: boolean
  requestedBy: string
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
  if (
    runtime !== "claude-code" &&
    runtime !== "codex" &&
    runtime !== "qwen-code" &&
    runtime !== "kun"
  ) {
    throw new Error(`Unsupported desktop job runtime: ${runtime}`)
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function createDesktopPermissionPolicySnapshot(
  policy: DesktopPermissionPolicy | null | undefined,
) {
  if (!policy) return null

  return {
    runtimeId: policy.runtimeId,
    mode: policy.mode,
    guarded: policy.guarded,
    enforcement: policy.enforcement,
    planWorkspaceSideEffects: policy.planWorkspaceSideEffects,
    allowedLocusPersistence: policy.allowedLocusPersistence,
    blockedSideEffects: policy.blockedSideEffects,
    requiresPreExecutionEnforcement: policy.requiresPreExecutionEnforcement,
    runtimeMapping: policy.runtimeMapping,
    diagnostics: policy.diagnostics,
  }
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
      workspaceKind: context.kind,
      projectId: context.kind === "project" ? context.project.id : null,
      runId: input.runId ?? null,
      promptSha256: sha256(prompt),
      promptLength: prompt.length,
      permissionPolicy: createDesktopPermissionPolicySnapshot(
        input.permissionPolicy,
      ),
    },
    projectId: context.kind === "project" ? context.project.id : null,
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

export function createAndRegisterDesktopChatAgentJob(
  db: AgentJobDatabase,
  input: CreateAndRegisterDesktopChatAgentJobInput,
): DesktopAgentJobHandle {
  const handle = createAndStartDesktopAgentJob(db, input)
  registerActiveDesktopAgentJob({
    jobId: handle.job.id,
    runtime: input.runtime,
    subChatId: input.subChatId,
    runId: input.runId,
    db,
    workerId: handle.workerId,
    heartbeatIntervalMs: input.heartbeatIntervalMs,
    cancel: input.cancel,
  })
  return handle
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

function desktopRuntimeLabel(
  runtime: DesktopAgentRuntime,
): "Claude" | "Codex" | "Qwen" {
  if (runtime === "claude-code") return "Claude"
  if (runtime === "codex") return "Codex"
  return "Qwen"
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

export function completeDesktopChatAgentJobSafely(
  db: AgentJobDatabase,
  input: CompleteDesktopChatAgentJobSafelyInput,
): AgentJob | null {
  if (!input.jobId) return null
  const completion = resolveDesktopChatJobCompletion({
    runtime: input.runtime,
    aborted: input.aborted,
    reachedNaturalFinish: input.reachedNaturalFinish,
    sawError: input.sawError,
  })
  const completed = completeDesktopAgentJobSafely(db, {
    jobId: input.jobId,
    ...completion,
    result: input.result,
  })
  unregisterActiveDesktopAgentJob(input.jobId)
  return completed
}

export function requestCancelDesktopChatAgentJobSafely(
  db: AgentJobDatabase,
  input: RequestCancelDesktopChatAgentJobSafelyInput,
): ReturnType<typeof requestCancelDesktopAgentJob> | null {
  if (!input.jobId || input.sawError || input.reachedNaturalFinish) {
    return null
  }
  try {
    return requestCancelDesktopAgentJob(db, input.jobId, input.requestedBy)
  } catch {
    // Job may already be terminal if cleanup raced with stream finish.
    return null
  }
}

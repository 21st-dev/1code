import type { AgentJob, AgentJobEvent } from "../db/schema"

export type SerializedAgentJob = {
  id: string
  retryOfJobId: string | null
  attempt: number
  source: string
  runtime: string
  status: string
  mode: string
  cwd: string
  projectId: string | null
  chatId: string | null
  subChatId: string | null
  promptPreview: string | null
  createdAt: string | null
  startedAt: string | null
  finishedAt: string | null
  exitCode: number | null
  errorCode: string | null
  errorMessage: string | null
  result: unknown
  workerId: string | null
  workerPid: number | null
  heartbeatAt: string | null
  cancelRequestedAt: string | null
  cancelRequestedBy: string | null
}

export type SerializedAgentJobEvent = {
  id: string
  jobId: string
  sequence: number
  type: string
  payload: unknown
  createdAt: string | null
}

function toIso(value: Date | string | number | null | undefined): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

function parseJson(value: string | null | undefined): unknown {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export function serializeAgentJob(job: AgentJob): SerializedAgentJob {
  return {
    id: job.id,
    retryOfJobId: job.retryOfJobId,
    attempt: job.attempt,
    source: job.source,
    runtime: job.runtime,
    status: job.status,
    mode: job.mode,
    cwd: job.cwd,
    projectId: job.projectId,
    chatId: job.chatId,
    subChatId: job.subChatId,
    promptPreview: job.promptPreview,
    createdAt: toIso(job.createdAt),
    startedAt: toIso(job.startedAt),
    finishedAt: toIso(job.finishedAt),
    exitCode: job.exitCode,
    errorCode: job.errorCode,
    errorMessage: job.errorMessage,
    result: parseJson(job.resultJson),
    workerId: job.workerId,
    workerPid: job.workerPid,
    heartbeatAt: toIso(job.heartbeatAt),
    cancelRequestedAt: toIso(job.cancelRequestedAt),
    cancelRequestedBy: job.cancelRequestedBy,
  }
}

export function serializeAgentJobEvent(
  event: AgentJobEvent,
): SerializedAgentJobEvent {
  return {
    id: event.id,
    jobId: event.jobId,
    sequence: event.sequence,
    type: event.type,
    payload: parseJson(event.payloadJson) ?? {},
    createdAt: toIso(event.createdAt),
  }
}

export function formatJobListText(jobs: AgentJob[]): string {
  if (jobs.length === 0) return "No jobs found.\n"
  return `${jobs
    .map((job) => {
      const createdAt = toIso(job.createdAt) ?? "unknown"
      return [
        job.id,
        job.status.padEnd(11),
        job.runtime.padEnd(11),
        job.mode.padEnd(5),
        createdAt,
        job.cwd,
      ].join("  ")
    })
    .join("\n")}\n`
}

export function formatJobText(job: AgentJob): string {
  const lines = [
    `id: ${job.id}`,
    `status: ${job.status}`,
    `runtime: ${job.runtime}`,
    `mode: ${job.mode}`,
    `source: ${job.source}`,
    `cwd: ${job.cwd}`,
    `attempt: ${job.attempt}`,
    `created: ${toIso(job.createdAt) ?? "unknown"}`,
  ]
  if (job.startedAt) lines.push(`started: ${toIso(job.startedAt)}`)
  if (job.finishedAt) lines.push(`finished: ${toIso(job.finishedAt)}`)
  if (job.exitCode !== null) lines.push(`exitCode: ${job.exitCode}`)
  if (job.errorCode) lines.push(`errorCode: ${job.errorCode}`)
  if (job.errorMessage) lines.push(`error: ${job.errorMessage}`)
  if (job.promptPreview) lines.push(`prompt: ${job.promptPreview}`)
  return `${lines.join("\n")}\n`
}

export function formatEventsText(events: AgentJobEvent[]): string {
  if (events.length === 0) return "No logs found.\n"
  return `${events
    .map((event) => {
      const payload = parseJson(event.payloadJson)
      const text =
        payload && typeof payload === "object"
          ? JSON.stringify(payload)
          : String(payload ?? "")
      return `${String(event.sequence).padStart(4, " ")}  ${event.type}  ${text}`
    })
    .join("\n")}\n`
}

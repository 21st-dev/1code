import {
  getWorkbenchTraceError,
  type WorkbenchTraceError,
  type WorkbenchTraceRow,
} from "../../agents/workbench/workbench-trace-presenter"

export type CurrentChatAgentJob = {
  id: string
  source: string
  runtime: string
  status: string
  chatId: string | null
  subChatId: string | null
  createdAt: Date | string | null
  startedAt: Date | string | null
  finishedAt: Date | string | null
  errorCode: string | null
  errorMessage: string | null
}

export type CurrentRunTraceError = WorkbenchTraceError & {
  source: "event" | "job"
}

function getTime(value: Date | string | null): number {
  if (!value) return 0
  const date = value instanceof Date ? value : new Date(value)
  const time = date.getTime()
  return Number.isNaN(time) ? 0 : time
}

export function isActiveJob(job: CurrentChatAgentJob | null): boolean {
  return job?.status === "queued" || job?.status === "running"
}

export function selectCurrentChatJob(
  jobs: CurrentChatAgentJob[],
  chatId: string,
  activeSubChatId?: string | null,
): CurrentChatAgentJob | null {
  const chatJobs = jobs.filter((job) => job.chatId === chatId)
  if (chatJobs.length === 0) return null

  const subChatJobs = activeSubChatId
    ? chatJobs.filter((job) => job.subChatId === activeSubChatId)
    : []
  const candidates = subChatJobs.length > 0 ? subChatJobs : chatJobs

  return candidates
    .slice()
    .sort((a, b) => getTime(b.createdAt) - getTime(a.createdAt))[0]
}

export function getCompactTraceRows(
  rows: WorkbenchTraceRow[],
  limit = 8,
): WorkbenchTraceRow[] {
  const visibleRows = rows.filter(
    (row) =>
      row.kind !== "assistant" &&
      row.kind !== "reasoning" &&
      row.type !== "tool_delta" &&
      row.type !== "command_output",
  )
  return visibleRows.slice(Math.max(0, visibleRows.length - limit))
}

export function getLatestTraceError(
  rows: WorkbenchTraceRow[],
  job: CurrentChatAgentJob | null,
): CurrentRunTraceError | null {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index]
    if (row.error) return { ...row.error, source: "event" }
  }

  if (job?.errorCode || job?.errorMessage) {
    return {
      ...getWorkbenchTraceError({
        errorCode: job.errorCode ?? "internal_error",
        errorMessage: job.errorMessage ?? undefined,
      }),
      source: "job",
    }
  }

  return null
}

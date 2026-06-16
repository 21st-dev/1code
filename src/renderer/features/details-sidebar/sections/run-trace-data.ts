"use client"

import { useMemo } from "react"
import { trpc } from "@/lib/trpc"
import {
  getWorkbenchTraceRow,
  type WorkbenchTraceEvent,
} from "../../agents/workbench/workbench-trace-presenter"
import {
  type CurrentChatAgentJob,
  getCompactTraceRows,
  getLatestTraceError,
  isActiveJob,
  selectCurrentChatJob,
} from "./run-trace-model"

export function useCurrentRunTrace({
  chatId,
  activeSubChatId,
  enabled = true,
}: {
  chatId: string
  activeSubChatId?: string | null
  enabled?: boolean
}) {
  const jobsQuery = trpc.agentJobs.list.useQuery(
    { source: "desktop", limit: 100 },
    {
      enabled,
      refetchInterval: enabled ? 5000 : false,
      placeholderData: (previous) => previous,
    },
  )
  const jobs = (jobsQuery.data?.jobs ?? []) as CurrentChatAgentJob[]
  const selectedJob = useMemo(
    () => selectCurrentChatJob(jobs, chatId, activeSubChatId),
    [activeSubChatId, chatId, jobs],
  )

  const logsQuery = trpc.agentJobs.logs.useQuery(
    { jobId: selectedJob?.id ?? "", afterSequence: 0 },
    {
      enabled: enabled && !!selectedJob?.id,
      refetchInterval: selectedJob && isActiveJob(selectedJob) ? 3000 : false,
      placeholderData: (previous) => previous,
    },
  )
  const events = (logsQuery.data?.events ?? []) as WorkbenchTraceEvent[]
  const job =
    ((logsQuery.data?.job as CurrentChatAgentJob | undefined) ?? selectedJob) ||
    null
  const rows = useMemo(
    () => events.map((event) => getWorkbenchTraceRow(event)),
    [events],
  )
  const compactRows = useMemo(() => getCompactTraceRows(rows), [rows])
  const error = useMemo(() => getLatestTraceError(rows, job), [job, rows])

  return {
    job,
    rows,
    compactRows,
    error,
    isLoading: jobsQuery.isLoading || logsQuery.isLoading,
    isFetching: jobsQuery.isFetching || logsQuery.isFetching,
    hasJob: !!selectedJob,
  }
}

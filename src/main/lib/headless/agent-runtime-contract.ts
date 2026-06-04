import type { AgentJob, AgentJobEvent } from "../db/schema"
import type { AgentJobEventType, AgentJobStatus } from "../../../shared/agent-jobs"
import type { AgentRuntimeId } from "../../../shared/agent-runtime-capabilities"

export type AgentRuntimeObserver = {
  appendEvent(type: AgentJobEventType, payload?: unknown): AgentJobEvent
  heartbeat(): AgentJob
  isCancelRequested(): boolean
}

export type AgentRuntimeRunRequest = {
  jobId: string
  runtime: AgentRuntimeId
  cwd: string
  mode: "plan" | "agent"
  prompt: string
  signal: AbortSignal
}

export type AgentRuntimeRunResult = {
  status?: Exclude<AgentJobStatus, "queued" | "running">
  exitCode?: number | null
  errorCode?: string | null
  errorMessage?: string | null
  result?: unknown
}

export type AgentTaskRunner = (
  request: AgentRuntimeRunRequest,
  observer: AgentRuntimeObserver,
) => Promise<AgentRuntimeRunResult>

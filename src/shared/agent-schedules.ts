import type { AgentJobMode, AgentJobRuntime } from "./agent-jobs"

export const AGENT_SCHEDULE_STATUSES = [
  "enabled",
  "paused",
  "disabled",
] as const

export type AgentScheduleStatus = (typeof AGENT_SCHEDULE_STATUSES)[number]

export const AGENT_SCHEDULE_TRIGGERS = ["manual", "due"] as const

export type AgentScheduleTrigger = (typeof AGENT_SCHEDULE_TRIGGERS)[number]

export const MIN_AGENT_SCHEDULE_INTERVAL_SECONDS = 1
export const MAX_AGENT_SCHEDULE_INTERVAL_SECONDS = 365 * 24 * 60 * 60

export type AgentScheduleDefinition = {
  id: string
  name: string
  status: AgentScheduleStatus
  runtime: AgentJobRuntime
  mode: AgentJobMode
  cwd: string
  projectId: string | null
  promptPreview: string | null
  intervalSeconds: number
  timezone: string
  nextRunAt: string | null
  lastRunAt: string | null
  lastJobId: string | null
  createdAt: string | null
  updatedAt: string | null
  disabledAt: string | null
}

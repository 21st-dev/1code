import type {
  AgentRuntimeContractId,
  AgentRuntimeId,
} from "./agent-runtime-capabilities"

export const AGENT_JOB_SOURCES = [
  "desktop",
  "cli",
  "api",
  "daemon",
  "schedule",
  "protocol",
] as const

export type AgentJobSource = (typeof AGENT_JOB_SOURCES)[number]

export const AGENT_JOB_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "canceled",
  "interrupted",
] as const

export type AgentJobStatus = (typeof AGENT_JOB_STATUSES)[number]

export const AGENT_JOB_MODES = ["plan", "agent"] as const

export type AgentJobMode = (typeof AGENT_JOB_MODES)[number]

export const AGENT_JOB_EVENT_TYPES = [
  "job_created",
  "job_started",
  "assistant_delta",
  "reasoning_delta",
  "tool_started",
  "tool_delta",
  "tool_finished",
  "guard_decision",
  "permission_requested",
  "scope_expansion_requested",
  "question_pending",
  "question_result",
  "mcp_needs_auth",
  "usage_update",
  "command_started",
  "command_output",
  "command_finished",
  "artifact_created",
  "status",
  "error",
  "completed",
] as const

export type AgentJobEventType = (typeof AGENT_JOB_EVENT_TYPES)[number]

export type AgentJobRuntime = AgentRuntimeId
export type AgentJobContractRuntime = AgentRuntimeContractId

export function isTerminalAgentJobStatus(status: AgentJobStatus): boolean {
  return (
    status === "succeeded" ||
    status === "failed" ||
    status === "canceled" ||
    status === "interrupted"
  )
}

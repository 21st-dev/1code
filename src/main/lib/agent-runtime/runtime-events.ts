import type { AgentRuntimeId } from "../../../shared/agent-runtime-capabilities"
import type {
  AgentJobEventType,
  AgentJobStatus,
} from "../../../shared/agent-jobs"

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export type RunEventRedactionStatus = "not-required" | "redacted"

export type RunEventRedactionContext = {
  runtimeId: AgentRuntimeId
  runId: string
  jobId?: string | null
  source: "desktop-adapter" | "headless-adapter" | "runtime-diagnostic"
  secretHints?: readonly string[]
}

export type RunEvent = {
  runId: string
  jobId?: string | null
  runtimeId: AgentRuntimeId
  sequence: number
  type: AgentJobEventType
  createdAt: string
  payload?: JsonValue
  redaction: {
    status: RunEventRedactionStatus
    appliedRules: string[]
  }
}

export type RunTerminalEvent = RunEvent & {
  type: "completed" | "error"
  payload: {
    status: Exclude<AgentJobStatus, "queued" | "running">
    message?: string
    [key: string]: JsonValue | undefined
  }
}

export type CreateRunEventInput = {
  runId: string
  jobId?: string | null
  runtimeId: AgentRuntimeId
  sequence: number
  type: AgentJobEventType
  payload?: JsonValue
  createdAt?: string
  redaction?: {
    status?: RunEventRedactionStatus
    appliedRules?: string[]
  }
}

export function createRunEvent(input: CreateRunEventInput): RunEvent {
  return {
    runId: input.runId,
    jobId: input.jobId ?? null,
    runtimeId: input.runtimeId,
    sequence: input.sequence,
    type: input.type,
    createdAt: input.createdAt ?? new Date().toISOString(),
    ...(input.payload === undefined ? {} : { payload: input.payload }),
    redaction: {
      status: input.redaction?.status ?? "not-required",
      appliedRules: input.redaction?.appliedRules ?? [],
    },
  }
}

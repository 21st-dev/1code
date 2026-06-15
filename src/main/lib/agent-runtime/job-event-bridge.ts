import type {
  AgentJobEventType,
  AgentJobRuntime,
  AgentJobSource,
} from "../../../shared/agent-jobs"
import { redactRuntimePayload } from "./redaction"
import {
  createRunEvent,
  type JsonValue,
  type RunEvent,
  type RunEventRedactionContext,
} from "./runtime-events"

export type CreateAgentJobRunEventInput = {
  jobId: string
  runtimeId: AgentJobRuntime
  source: AgentJobSource
  sequence: number
  type: AgentJobEventType
  payload?: unknown
  createdAt: Date
}

export type AgentJobRunEventBridgeResult = {
  runEvent: RunEvent
  persistedPayload: JsonValue
}

function toJsonValue(value: unknown, seen = new WeakSet<object>()): JsonValue {
  if (value === undefined) return null
  if (value === null) return null
  if (
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "bigint") return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
    }
  }
  if (Array.isArray(value)) {
    return value.map((item) => toJsonValue(item, seen))
  }
  if (typeof value !== "object") return null
  if (seen.has(value)) return "[Circular]"
  seen.add(value)

  const output: { [key: string]: JsonValue } = {}
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined || typeof item === "function") continue
    output[key] = toJsonValue(item, seen)
  }
  seen.delete(value)
  return output
}

function redactionSourceForJobSource(
  source: AgentJobSource,
): RunEventRedactionContext["source"] {
  return source === "desktop" ? "desktop-adapter" : "headless-adapter"
}

export function createAgentJobRunEvent(
  input: CreateAgentJobRunEventInput,
): AgentJobRunEventBridgeResult {
  const payload = toJsonValue(input.payload ?? {})
  const redacted = redactRuntimePayload(payload, {
    runtimeId: input.runtimeId,
    runId: input.jobId,
    jobId: input.jobId,
    source: redactionSourceForJobSource(input.source),
  })
  const runEvent = createRunEvent({
    runId: input.jobId,
    jobId: input.jobId,
    runtimeId: input.runtimeId,
    sequence: input.sequence,
    type: input.type,
    payload: redacted.payload,
    createdAt: input.createdAt.toISOString(),
    redaction: {
      status: redacted.appliedRules.length > 0 ? "redacted" : "not-required",
      appliedRules: redacted.appliedRules,
    },
  })

  return {
    runEvent,
    persistedPayload: runEvent.payload ?? {},
  }
}

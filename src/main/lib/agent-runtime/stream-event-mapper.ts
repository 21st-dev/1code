import type { AgentRuntimeId } from "../../../shared/agent-runtime-capabilities"
import type { AgentJobEvent } from "../db/schema"
import {
  appendAgentJobEvent,
  type AgentJobDatabase,
} from "../headless/job-store"
import { redactRuntimePayload } from "./redaction"
import {
  createRunEvent,
  type JsonValue,
  type RunEvent,
} from "./runtime-events"

export type DesktopStreamChunk = Record<string, unknown> & { type?: string }

export type DesktopStreamEventMapperContext = {
  runtimeId: AgentRuntimeId
  runId: string
  jobId?: string | null
  source?: "desktop-adapter" | "runtime-diagnostic"
  secretHints?: readonly string[]
}

export type MapDesktopStreamChunkInput = DesktopStreamEventMapperContext & {
  chunk: unknown
  sequence: number
  createdAt?: string
}

export type DesktopStreamEventMapper = {
  map(chunk: unknown): RunEvent[]
}

export type RedactRendererDiagnosticChunkInput = DesktopStreamEventMapperContext & {
  chunk: unknown
}

export type RuntimeRendererChunkEmitterInput = {
  runtimeId: AgentRuntimeId
  runId: string
  getJobId: () => string | null | undefined
  getDb: () => AgentJobDatabase | null | undefined
  getMapper: () => DesktopStreamEventMapper | null | undefined
  isActive: () => boolean
  markInactive: () => void
  markFailed: () => void
  emitNext: (chunk: unknown) => void
  warn?: (...args: any[]) => void
  warningLabel?: string
}

const RENDERER_DIAGNOSTIC_CHUNK_TYPES = new Set([
  "auth-error",
  "capability-error",
  "error",
  "guard-audit",
  "observed-tool-decision",
  "retry-notification",
  "runtime-status",
])

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function toJsonValue(value: unknown, seen = new WeakSet<object>()): JsonValue {
  if (value === null) return null
  if (
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null
  }
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
  if (!isObject(value)) return null

  if (seen.has(value)) return "[Circular]"
  seen.add(value)
  const output: Record<string, JsonValue> = {}
  for (const [key, child] of Object.entries(value)) {
    if (child === undefined || typeof child === "function" || typeof child === "symbol") {
      continue
    }
    output[key] = toJsonValue(child, seen)
  }
  seen.delete(value)
  return output
}

function getString(chunk: Record<string, unknown>, key: string): string | undefined {
  const value = chunk[key]
  return typeof value === "string" ? value : undefined
}

function getTerminalStatus(chunk: Record<string, unknown>): string {
  const status = getString(chunk, "status")
  return status === "failed" ||
    status === "canceled" ||
    status === "interrupted" ||
    status === "succeeded"
    ? status
    : "succeeded"
}

function eventPayloadForChunk(chunk: Record<string, unknown>): {
  type:
    | "assistant_delta"
    | "reasoning_delta"
    | "tool_started"
    | "tool_delta"
    | "tool_finished"
    | "guard_decision"
    | "permission_requested"
    | "question_pending"
    | "question_result"
    | "mcp_needs_auth"
    | "usage_update"
    | "status"
    | "error"
    | "completed"
  payload: JsonValue
} | null {
  switch (chunk.type) {
    case "text-delta":
      return {
        type: "assistant_delta",
        payload: {
          id: getString(chunk, "id") ?? null,
          delta: getString(chunk, "delta") ?? "",
        },
      }
    case "reasoning":
    case "reasoning-delta":
      return {
        type: "reasoning_delta",
        payload: {
          id: getString(chunk, "id") ?? null,
          delta:
            getString(chunk, "delta") ??
            getString(chunk, "text") ??
            "",
        },
      }
    case "tool-input-start":
    case "tool-input-available":
      return {
        type: "tool_started",
        payload: {
          toolCallId: getString(chunk, "toolCallId") ?? null,
          toolName: getString(chunk, "toolName") ?? null,
          input: toJsonValue(chunk.input),
        },
      }
    case "tool-input-delta":
      return {
        type: "tool_delta",
        payload: {
          toolCallId: getString(chunk, "toolCallId") ?? null,
          delta: getString(chunk, "inputTextDelta") ?? "",
        },
      }
    case "tool-output-available":
      return {
        type: "tool_finished",
        payload: {
          toolCallId: getString(chunk, "toolCallId") ?? null,
          output: toJsonValue(chunk.output),
        },
      }
    case "tool-output-error":
      return {
        type: "tool_finished",
        payload: {
          toolCallId: getString(chunk, "toolCallId") ?? null,
          errorText: getString(chunk, "errorText") ?? "",
        },
      }
    case "guard-event":
      return {
        type: "guard_decision",
        payload: { event: toJsonValue(chunk.event) },
      }
    case "observed-tool-decision":
      return {
        type: "permission_requested",
        payload: {
          controlLevel: getString(chunk, "controlLevel") ?? "observe",
          decision: getString(chunk, "decision") ?? null,
          message: getString(chunk, "message") ?? null,
          risk: toJsonValue(chunk.risk),
        },
      }
    case "ask-user-question":
      return {
        type: "question_pending",
        payload: {
          toolUseId: getString(chunk, "toolUseId") ?? null,
          questions: toJsonValue(chunk.questions),
        },
      }
    case "ask-user-question-timeout":
    case "ask-user-question-result":
      return {
        type: "question_result",
        payload: {
          toolUseId: getString(chunk, "toolUseId") ?? null,
          result:
            chunk.type === "ask-user-question-timeout"
              ? "timeout"
              : toJsonValue(chunk.result),
        },
      }
    case "runtime-status": {
      const blocker = isObject(chunk.blocker) ? chunk.blocker : null
      const component = blocker ? getString(blocker, "component") : undefined
      const mcpNeedsAuth = component === "mcp" && chunk.ok === false
      return {
        type: mcpNeedsAuth ? "mcp_needs_auth" : "status",
        payload: {
          status: "runtime-status",
          ok: chunk.ok === true,
          blocker: toJsonValue(chunk.blocker),
          mcp: toJsonValue(chunk.mcp),
        },
      }
    }
    case "capability-error":
    case "auth-error":
    case "error":
      return {
        type: "error",
        payload: {
          errorText:
            getString(chunk, "errorText") ??
            getString(chunk, "message") ??
            "Runtime stream error",
          chunkType: getString(chunk, "type") ?? null,
        },
      }
    case "message-metadata":
      return {
        type: "usage_update",
        payload: { messageMetadata: toJsonValue(chunk.messageMetadata) },
      }
    case "finish":
      return {
        type: "completed",
        payload: {
          status: getTerminalStatus(chunk),
          message: getString(chunk, "message") ?? null,
          messageMetadata: toJsonValue(chunk.messageMetadata),
        },
      }
    case "retry-notification":
    case "session-init":
    case "start":
    case "start-step":
    case "finish-step":
    case "file-change-diff":
    case "file-change-patch":
    case "file-change-delta":
      return {
        type: "status",
        payload: {
          chunkType: getString(chunk, "type") ?? null,
          data: toJsonValue(chunk),
        },
      }
    default:
      return null
  }
}

export function mapDesktopStreamChunkToRunEvents(
  input: MapDesktopStreamChunkInput,
): RunEvent[] {
  if (!isObject(input.chunk)) return []
  const mapped = eventPayloadForChunk(input.chunk)
  if (!mapped) return []

  const redacted = redactRuntimePayload(mapped.payload, {
    runtimeId: input.runtimeId,
    runId: input.runId,
    jobId: input.jobId,
    source: input.source ?? "desktop-adapter",
    secretHints: input.secretHints,
  })

  return [
    createRunEvent({
      runId: input.runId,
      jobId: input.jobId,
      runtimeId: input.runtimeId,
      sequence: input.sequence,
      type: mapped.type,
      payload: redacted.payload,
      createdAt: input.createdAt,
      redaction: {
        status: redacted.appliedRules.length > 0 ? "redacted" : "not-required",
        appliedRules: redacted.appliedRules,
      },
    }),
  ]
}

export function createDesktopStreamEventMapper(
  context: DesktopStreamEventMapperContext,
): DesktopStreamEventMapper {
  let sequence = 0
  return {
    map(chunk: unknown) {
      sequence += 1
      return mapDesktopStreamChunkToRunEvents({
        ...context,
        chunk,
        sequence,
      })
    },
  }
}

export function redactRendererDiagnosticChunk(
  input: RedactRendererDiagnosticChunkInput,
): unknown {
  if (!isObject(input.chunk)) return input.chunk
  const chunkType = getString(input.chunk, "type")
  if (!chunkType || !RENDERER_DIAGNOSTIC_CHUNK_TYPES.has(chunkType)) {
    return input.chunk
  }

  const redacted = redactRuntimePayload(toJsonValue(input.chunk), {
    runtimeId: input.runtimeId,
    runId: input.runId,
    jobId: input.jobId,
    source: input.source ?? "runtime-diagnostic",
    secretHints: input.secretHints,
  })
  return redacted.payload
}

export function redactRendererRuntimeChunk(
  input: RedactRendererDiagnosticChunkInput,
): unknown {
  const redacted = redactRuntimePayload(toJsonValue(input.chunk), {
    runtimeId: input.runtimeId,
    runId: input.runId,
    jobId: input.jobId,
    source: input.source ?? "runtime-diagnostic",
    secretHints: input.secretHints,
  })
  if (
    isObject(input.chunk) &&
    isObject(redacted.payload) &&
    typeof input.chunk.type === "string"
  ) {
    redacted.payload.type = input.chunk.type
  }
  return redacted.payload
}

export function isDesktopRuntimeFailureChunk(chunk: unknown): boolean {
  if (!isObject(chunk)) return false
  return (
    chunk.type === "error" ||
    chunk.type === "auth-error" ||
    chunk.type === "capability-error" ||
    (chunk.type === "runtime-status" && chunk.ok === false)
  )
}

export function createRuntimeRendererChunkEmitter({
  runtimeId,
  runId,
  getJobId,
  getDb,
  getMapper,
  isActive,
  markInactive,
  markFailed,
  emitNext,
  warn = console.warn,
  warningLabel = "[runtime]",
}: RuntimeRendererChunkEmitterInput): (chunk: unknown) => boolean {
  return (chunk: unknown) => {
    if (isDesktopRuntimeFailureChunk(chunk)) {
      markFailed()
    }

    const mapper = getMapper()
    const db = getDb()
    const chunkType = isObject(chunk) ? chunk.type : undefined
    if (db && mapper && chunkType !== "finish") {
      try {
        const events = mapper.map(chunk)
        appendRunEventsToAgentJob(db, events)
      } catch (eventError) {
        warn(`${warningLabel} Failed to persist desktop run events:`, eventError)
      }
    }

    if (!isActive()) return false
    try {
      emitNext(
        redactRendererDiagnosticChunk({
          runtimeId,
          runId,
          jobId: getJobId(),
          chunk,
        }),
      )
      return true
    } catch {
      markInactive()
      return false
    }
  }
}

function persistedPayloadForRunEvent(event: RunEvent): JsonValue {
  return {
    runId: event.runId,
    runtimeId: event.runtimeId,
    runEventSequence: event.sequence,
    redaction: event.redaction,
    payload: event.payload ?? {},
  }
}

export function appendRunEventsToAgentJob(
  db: AgentJobDatabase,
  events: RunEvent[],
): AgentJobEvent[] {
  const appended: AgentJobEvent[] = []
  for (const event of events) {
    if (!event.jobId) {
      throw new Error("RunEvent jobId is required for persistence.")
    }
    appended.push(
      appendAgentJobEvent(db, {
        jobId: event.jobId,
        type: event.type,
        payload: persistedPayloadForRunEvent(event),
        now: new Date(event.createdAt),
      }),
    )
  }
  return appended
}

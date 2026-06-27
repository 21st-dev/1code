import type {
  AgentRuntimeBlockStatus,
  AgentRuntimeConversationBlock,
  AgentRuntimeStreamEvent,
} from "./types"
import { providerRuntimeEventToStreamEvent } from "./provider-runtime-contract"

const CONVERSATION_BLOCK_TYPES = new Set([
  "exec",
  "mcp-tool-call",
  "patch",
  "generated-image",
  "text-output",
  "todo-list",
  "proposed-plan",
  "active-goal",
  "permission-request",
  "user-input",
  "status",
  "dynamic-tool-call",
  "automation-update",
  "multi-agent-action",
  "context-compaction",
  "model-change",
  "model-reroute",
  "goal-status",
  "realtime-state",
  "dictation-state",
  "queued-follow-up",
  "rate-limit-status",
  "usage-status",
  "project-event",
  "library-artifact",
  "pull-request-status",
  "diagnostic-snapshot",
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function normalizeBlockStatus(value: unknown): AgentRuntimeBlockStatus | undefined {
  if (
    value === "queued" ||
    value === "running" ||
    value === "completed" ||
    value === "failed" ||
    value === "interrupted" ||
    value === "blocked"
  ) {
    return value
  }

  return undefined
}

function normalizeRuntimeConversationBlock(
  value: unknown,
): AgentRuntimeConversationBlock | null {
  if (!isRecord(value)) return null

  const type = cleanString(value.type)
  const id = cleanString(value.id)
  if (!type || !id || !CONVERSATION_BLOCK_TYPES.has(type)) return null

  const { id: _id, type: _type, status: _status, ...rest } = value
  const status = normalizeBlockStatus(_status)

  return {
    ...rest,
    id,
    type,
    ...(status ? { status } : {}),
  } as AgentRuntimeConversationBlock
}

function normalizeConversationBlockUpdate(
  value: Record<string, unknown>,
): AgentRuntimeStreamEvent | null {
  const id = cleanString(value.id)
  if (!id || !isRecord(value.patch)) return null

  const { status: _status, ...patch } = value.patch
  const status = normalizeBlockStatus(_status)

  return {
    type: "conversation-block-update",
    id,
    patch: {
      ...patch,
      ...(status ? { status } : {}),
    } as Partial<AgentRuntimeConversationBlock>,
  }
}

export function normalizeRuntimeStreamEvent(
  chunk: Record<string, unknown>,
): AgentRuntimeStreamEvent | null {
  const providerRuntimeEvent = providerRuntimeEventToStreamEvent(chunk)
  if (providerRuntimeEvent) return providerRuntimeEvent

  if (chunk.type === "text" && typeof chunk.text === "string") {
    return { type: "text", text: chunk.text }
  }

  if (chunk.type === "tool-call") {
    const name = cleanString(chunk.name)
    if (!name) return null
    return {
      type: "tool-call",
      id: cleanString(chunk.id),
      name,
      input: chunk.input,
    }
  }

  if (chunk.type === "tool-result") {
    return {
      type: "tool-result",
      id: cleanString(chunk.id),
      name: cleanString(chunk.name),
      result: chunk.result,
    }
  }

  if (chunk.type === "conversation-block") {
    const block = normalizeRuntimeConversationBlock(chunk.block)
    return block ? { type: "conversation-block", block } : null
  }

  if (chunk.type === "conversation-block-update") {
    return normalizeConversationBlockUpdate(chunk)
  }

  if (typeof chunk.type === "string" && CONVERSATION_BLOCK_TYPES.has(chunk.type)) {
    const block = normalizeRuntimeConversationBlock(chunk)
    return block ? { type: "conversation-block", block } : null
  }

  if (chunk.type === "finish") {
    return {
      type: "finish",
      nativeSessionId:
        typeof chunk.sessionId === "string" ? chunk.sessionId : null,
      resultSubtype:
        chunk.resultSubtype === "error" ||
        chunk.resultSubtype === "cancelled" ||
        chunk.resultSubtype === "success"
          ? chunk.resultSubtype
          : undefined,
    }
  }

  if (
    chunk.type === "auth-error" ||
    (chunk.type === "error" && typeof chunk.errorText === "string")
  ) {
    return {
      type: chunk.type === "auth-error" ? "auth-error" : "error",
      message: String(chunk.errorText),
    }
  }

  if (chunk.type === "message-metadata") {
    const metadata = chunk.messageMetadata
    if (metadata && typeof metadata === "object") {
      const value = metadata as Record<string, unknown>
      return {
        type: "usage",
        inputTokens:
          typeof value.inputTokens === "number" ? value.inputTokens : undefined,
        outputTokens:
          typeof value.outputTokens === "number"
            ? value.outputTokens
            : undefined,
        totalTokens:
          typeof value.totalTokens === "number" ? value.totalTokens : undefined,
        modelContextWindow:
          typeof value.modelContextWindow === "number"
            ? value.modelContextWindow
            : undefined,
      }
    }
  }

  return null
}

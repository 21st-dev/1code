import { z } from "zod"
import type {
  AgentEngineId,
  AgentRuntimeConversationBlock,
  AgentRuntimeStreamEvent,
} from "./types"
import {
  isAgentEngineId,
  makeAgentRuntimeProviderInstanceId,
  type AgentRuntimeProviderInstanceId,
} from "./provider-instances"

export const PROVIDER_RUNTIME_EVENT_TYPES = [
  "session.started",
  "session.configured",
  "session.state.changed",
  "session.exited",
  "thread.started",
  "thread.state.changed",
  "thread.metadata.updated",
  "thread.token-usage.updated",
  "thread.realtime.started",
  "thread.realtime.item-added",
  "thread.realtime.audio.delta",
  "thread.realtime.error",
  "thread.realtime.closed",
  "turn.started",
  "turn.completed",
  "turn.aborted",
  "turn.plan.updated",
  "turn.proposed.delta",
  "turn.proposed.completed",
  "turn.diff.updated",
  "item.started",
  "item.updated",
  "item.completed",
  "content.delta",
  "request.opened",
  "request.resolved",
  "user-input.requested",
  "user-input.resolved",
  "task.started",
  "task.progress",
  "task.completed",
  "hook.started",
  "hook.progress",
  "hook.completed",
  "tool.progress",
  "tool.summary",
  "tool.denied",
  "auth.status",
  "account.updated",
  "account.rate-limits.updated",
  "mcp.status.updated",
  "mcp.oauth.completed",
  "app.list.updated",
  "model.rerouted",
  "config.updated",
  "config.warning",
  "deprecation.notice",
  "files.persisted",
  "runtime.warning",
  "runtime.error",
] as const

export type ProviderRuntimeEventType =
  (typeof PROVIDER_RUNTIME_EVENT_TYPES)[number]

export const CANONICAL_RUNTIME_ITEM_TYPES = [
  "user_message",
  "assistant_message",
  "reasoning",
  "plan",
  "command_execution",
  "file_change",
  "mcp_tool_call",
  "dynamic_tool_call",
  "collab_agent_tool_call",
  "web_search",
  "image_view",
  "review_entered",
  "review_exited",
  "context_compaction",
  "error",
  "unknown",
] as const

export type CanonicalRuntimeItemType =
  (typeof CANONICAL_RUNTIME_ITEM_TYPES)[number]

export const CANONICAL_RUNTIME_REQUEST_TYPES = [
  "command_execution_approval",
  "file_read_approval",
  "file_change_approval",
  "apply_patch_approval",
  "exec_command_approval",
  "tool_user_input",
  "dynamic_tool_call",
  "auth_tokens_refresh",
  "unknown",
] as const

export type CanonicalRuntimeRequestType =
  (typeof CANONICAL_RUNTIME_REQUEST_TYPES)[number]

const providerRuntimeEventSchema = z.object({
  type: z.enum(PROVIDER_RUNTIME_EVENT_TYPES),
  eventId: z.string().trim().min(1).optional(),
  provider: z.string().trim().min(1).optional(),
  engineId: z.string().trim().min(1).optional(),
  providerInstanceId: z.string().trim().min(1).optional(),
  subChatId: z.string().trim().min(1).optional(),
  chatId: z.string().trim().min(1).optional(),
  threadId: z.string().trim().min(1).optional(),
  nativeSessionId: z.string().trim().min(1).nullable().optional(),
  turnId: z.string().trim().min(1).optional(),
  itemId: z.string().trim().min(1).optional(),
  requestId: z.string().trim().min(1).optional(),
  createdAt: z.string().trim().min(1).optional(),
  providerRefs: z.record(z.string(), z.unknown()).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  raw: z.unknown().optional(),
}).passthrough()

export interface ProviderRuntimeEvent {
  type: ProviderRuntimeEventType
  eventId?: string
  provider?: string
  engineId?: AgentEngineId
  providerInstanceId?: AgentRuntimeProviderInstanceId
  subChatId?: string
  chatId?: string
  threadId?: string
  nativeSessionId?: string | null
  turnId?: string
  itemId?: string
  requestId?: string
  createdAt?: string
  providerRefs?: Record<string, unknown>
  payload: Record<string, unknown>
  raw?: unknown
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function cleanNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function cleanBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined
}

function engineIdFromProvider(provider: unknown): AgentEngineId | undefined {
  if (isAgentEngineId(provider)) return provider
  if (provider === "claudeAgent" || provider === "claude-code") return "claude-code"
  if (provider === "codex") return "codex"
  if (provider === "hermes") return "hermes"
  return undefined
}

function compactRecord<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T
}

function eventBlockId(
  event: Pick<
    ProviderRuntimeEvent,
    "eventId" | "threadId" | "turnId" | "itemId" | "requestId"
  >,
): string {
  return (
    event.requestId ??
    event.itemId ??
    event.turnId ??
    event.threadId ??
    event.eventId ??
    "runtime-event"
  )
}

function payloadBlockId(
  event: ProviderRuntimeEvent,
  keys: readonly string[],
): string {
  for (const key of keys) {
    const value = cleanString(event.payload[key])
    if (value) return value
  }
  return eventBlockId(event)
}

function normalizeItemStatus(value: unknown): "running" | "completed" | "failed" | undefined {
  if (value === "inProgress" || value === "running" || value === "queued") return "running"
  if (value === "completed" || value === "declined") return "completed"
  if (value === "failed" || value === "error") return "failed"
  return undefined
}

function runtimeItemTypeToBlock(
  itemType: unknown,
): Pick<AgentRuntimeConversationBlock, "type"> & Record<string, unknown> {
  switch (itemType) {
    case "command_execution":
      return {
        type: "exec",
        command: "",
        executionStatus: "running",
        parsedCmd: { type: "unknown", isFinished: false },
      }
    case "file_change":
      return { type: "patch", toolName: "Edit" }
    case "mcp_tool_call":
      return { type: "mcp-tool-call", server: "mcp", tool: "tool", callId: "" }
    case "dynamic_tool_call":
      return { type: "dynamic-tool-call", toolName: "dynamic-tool" }
    case "plan":
      return { type: "proposed-plan" }
    case "context_compaction":
      return { type: "context-compaction" }
    case "error":
      return { type: "status", level: "error" }
    default:
      return { type: "status", level: "info" }
  }
}

function makeConversationBlock(
  event: ProviderRuntimeEvent,
  base: Record<string, unknown>,
): AgentRuntimeConversationBlock {
  return ({
    id: eventBlockId(event),
    turnId: event.turnId,
    status: normalizeItemStatus(base.status) ?? "running",
    ...base,
    metadata: {
      providerRuntimeEventType: event.type,
      ...(event.provider ? { provider: event.provider } : {}),
      ...(event.providerInstanceId ? { providerInstanceId: event.providerInstanceId } : {}),
      ...(event.engineId ? { engineId: event.engineId } : {}),
      ...(event.providerRefs ? { providerRefs: event.providerRefs } : {}),
    },
  } as unknown) as AgentRuntimeConversationBlock
}

function turnStateToResultSubtype(
  state: unknown,
): "success" | "error" | "cancelled" {
  if (state === "completed") return "success"
  if (state === "cancelled" || state === "interrupted") return "cancelled"
  return "error"
}

function hookOutcomeToStatus(value: unknown): "completed" | "failed" | "interrupted" {
  if (value === "success" || value === "completed") return "completed"
  if (value === "cancelled" || value === "canceled" || value === "stopped") {
    return "interrupted"
  }
  return "failed"
}

function realtimeBlockId(event: ProviderRuntimeEvent): string {
  return `realtime:${
    event.threadId ??
    cleanString(event.payload.threadId) ??
    event.nativeSessionId ??
    event.chatId ??
    event.subChatId ??
    cleanString(event.payload.realtimeSessionId) ??
    eventBlockId(event)
  }`
}

export function parseProviderRuntimeEvent(value: unknown): ProviderRuntimeEvent | null {
  const parsed = providerRuntimeEventSchema.safeParse(value)
  if (!parsed.success) return null
  const engineId =
    engineIdFromProvider(parsed.data.engineId) ??
    engineIdFromProvider(parsed.data.provider)
  const providerInstanceId = parsed.data.providerInstanceId
    ? makeAgentRuntimeProviderInstanceId(parsed.data.providerInstanceId)
    : undefined

  return {
    type: parsed.data.type,
    ...(parsed.data.eventId ? { eventId: parsed.data.eventId } : {}),
    ...(parsed.data.provider ? { provider: parsed.data.provider } : {}),
    ...(engineId ? { engineId } : {}),
    ...(providerInstanceId ? { providerInstanceId } : {}),
    ...(parsed.data.subChatId ? { subChatId: parsed.data.subChatId } : {}),
    ...(parsed.data.chatId ? { chatId: parsed.data.chatId } : {}),
    ...(parsed.data.threadId ? { threadId: parsed.data.threadId } : {}),
    ...(parsed.data.nativeSessionId !== undefined
      ? { nativeSessionId: parsed.data.nativeSessionId }
      : {}),
    ...(parsed.data.turnId ? { turnId: parsed.data.turnId } : {}),
    ...(parsed.data.itemId ? { itemId: parsed.data.itemId } : {}),
    ...(parsed.data.requestId ? { requestId: parsed.data.requestId } : {}),
    ...(parsed.data.createdAt ? { createdAt: parsed.data.createdAt } : {}),
    ...(parsed.data.providerRefs ? { providerRefs: parsed.data.providerRefs } : {}),
    payload: parsed.data.payload ?? {},
    ...(parsed.data.raw !== undefined ? { raw: parsed.data.raw } : {}),
  }
}

export function providerRuntimeEventToStreamEvent(
  value: unknown,
): AgentRuntimeStreamEvent | null {
  const event = parseProviderRuntimeEvent(value)
  if (!event) return null

  switch (event.type) {
    case "content.delta": {
      const delta = typeof event.payload.delta === "string" ? event.payload.delta : ""
      return delta ? { type: "text", text: delta } : null
    }
    case "thread.token-usage.updated": {
      const usage = event.payload.usage
      if (!usage || typeof usage !== "object") return null
      const record = usage as Record<string, unknown>
      const inputTokens = cleanNumber(record.inputTokens)
      const outputTokens = cleanNumber(record.outputTokens)
      const usedTokens = cleanNumber(record.usedTokens)
      const totalTokens = usedTokens ?? cleanNumber(record.totalTokens)
      const maxTokens = cleanNumber(record.maxTokens)
      return compactRecord({
        type: "usage" as const,
        inputTokens,
        outputTokens,
        totalTokens,
        modelContextWindow: maxTokens ?? cleanNumber(record.modelContextWindow),
        usedTokens,
        totalProcessedTokens: cleanNumber(record.totalProcessedTokens),
        maxTokens,
        cachedInputTokens: cleanNumber(record.cachedInputTokens),
        reasoningOutputTokens: cleanNumber(record.reasoningOutputTokens),
        lastUsedTokens: cleanNumber(record.lastUsedTokens),
        lastInputTokens: cleanNumber(record.lastInputTokens),
        lastCachedInputTokens: cleanNumber(record.lastCachedInputTokens),
        lastOutputTokens: cleanNumber(record.lastOutputTokens),
        lastReasoningOutputTokens: cleanNumber(record.lastReasoningOutputTokens),
        toolUses: cleanNumber(record.toolUses),
        durationMs: cleanNumber(record.durationMs),
        compactsAutomatically: cleanBoolean(record.compactsAutomatically),
      })
    }
    case "thread.state.changed": {
      const state = cleanString(event.payload.state) ?? cleanString(event.payload.status)
      if (state !== "compacted") return null
      const detail =
        event.payload.detail && typeof event.payload.detail === "object"
          ? (event.payload.detail as Record<string, unknown>)
          : {}
      return {
        type: "conversation-block",
        block: makeConversationBlock(event, {
          id:
            event.eventId ??
            `context-compaction:${event.threadId ?? event.turnId ?? "runtime-event"}`,
          type: "context-compaction",
          title: "Context compacted",
          summary: cleanString(event.payload.reason) ?? "Context compacted",
          input: event.payload,
          previousInputTokens: cleanNumber(detail.previousInputTokens),
          nextInputTokens: cleanNumber(detail.nextInputTokens),
          droppedMessages: cleanNumber(detail.droppedMessages),
          status: "completed",
        }),
      }
    }
    case "turn.completed": {
      return {
        type: "finish",
        nativeSessionId: event.nativeSessionId ?? null,
        resultSubtype: turnStateToResultSubtype(event.payload.state),
      }
    }
    case "turn.aborted": {
      return {
        type: "finish",
        nativeSessionId: event.nativeSessionId ?? null,
        resultSubtype: "cancelled",
      }
    }
    case "turn.proposed.delta": {
      const delta = typeof event.payload.delta === "string" ? event.payload.delta : ""
      return delta
        ? {
            type: "conversation-block-update",
            id: eventBlockId(event),
            patch: {
              type: "proposed-plan",
              status: "running",
              input: { delta },
            } as Partial<AgentRuntimeConversationBlock>,
          }
        : null
    }
    case "turn.proposed.completed": {
      const planMarkdown = cleanString(event.payload.planMarkdown)
      return {
        type: "conversation-block",
        block: makeConversationBlock(event, {
          type: "proposed-plan",
          plan: planMarkdown ? { markdown: planMarkdown } : event.payload,
          output: event.payload,
          status: "completed",
        }),
      }
    }
    case "session.state.changed": {
      const state = cleanString(event.payload.state) ?? "unknown"
      return {
        type: "conversation-block",
        block: makeConversationBlock(event, {
          type: "status",
          level: state === "error" ? "error" : "info",
          title: "Codex app-server",
          message:
            cleanString(event.payload.reason) ??
            cleanString(event.payload.message) ??
            `Session ${state}.`,
          data: event.payload,
          status: state === "starting" ? "running" : "completed",
        }),
      }
    }
    case "thread.realtime.started": {
      return {
        type: "conversation-block",
        block: makeConversationBlock(event, {
          id: realtimeBlockId(event),
          type: "realtime-state",
          title: "Realtime voice",
          mode: "voice-only",
          input: event.payload,
          status: "running",
        }),
      }
    }
    case "thread.realtime.item-added":
    case "thread.realtime.audio.delta": {
      return {
        type: "conversation-block-update",
        id: realtimeBlockId(event),
        patch: {
          status: "running",
          output: event.payload,
        } as Partial<AgentRuntimeConversationBlock>,
      }
    }
    case "thread.realtime.error": {
      return {
        type: "conversation-block-update",
        id: realtimeBlockId(event),
        patch: {
          status: "failed",
          summary: cleanString(event.payload.message) ?? "Realtime error",
          output: event.payload,
        } as Partial<AgentRuntimeConversationBlock>,
      }
    }
    case "thread.realtime.closed": {
      return {
        type: "conversation-block-update",
        id: realtimeBlockId(event),
        patch: {
          status: "completed",
          summary: cleanString(event.payload.reason),
          output: event.payload,
        } as Partial<AgentRuntimeConversationBlock>,
      }
    }
    case "runtime.error": {
      return {
        type: "error",
        message:
          cleanString(event.payload.message) ??
          cleanString(event.payload.error) ??
          "Provider runtime error.",
      }
    }
    case "auth.status": {
      const error = cleanString(event.payload.error)
      return error ? { type: "auth-error", message: error } : null
    }
    case "account.updated": {
      return {
        type: "conversation-block",
        block: makeConversationBlock(event, {
          type: "status",
          level: "info",
          title: "Account updated",
          message: "Codex account state updated.",
          data: event.payload,
          status: "completed",
        }),
      }
    }
    case "account.rate-limits.updated": {
      return {
        type: "conversation-block",
        block: makeConversationBlock(event, {
          type: "status",
          level: "info",
          title: "Rate limits updated",
          message: "Codex rate limit state updated.",
          data: event.payload,
          status: "completed",
        }),
      }
    }
    case "mcp.status.updated": {
      const status = cleanString(event.payload.status) ?? "updated"
      const serverName = cleanString(event.payload.name)
      return {
        type: "conversation-block",
        block: makeConversationBlock(event, {
          type: "status",
          level: status === "failed" ? "error" : "info",
          title: serverName ? `MCP ${serverName}` : "MCP server",
          message:
            cleanString(event.payload.error) ?? `MCP server status: ${status}.`,
          data: event.payload,
          status: status === "starting" ? "running" : "completed",
        }),
      }
    }
    case "mcp.oauth.completed": {
      const serverName = cleanString(event.payload.name)
      const success = event.payload.success === true
      return {
        type: "conversation-block",
        block: makeConversationBlock(event, {
          type: "status",
          level: success ? "info" : "error",
          title: serverName ? `MCP OAuth ${serverName}` : "MCP OAuth",
          message:
            cleanString(event.payload.error) ??
            (success ? "MCP OAuth completed." : "MCP OAuth failed."),
          data: event.payload,
          status: "completed",
        }),
      }
    }
    case "app.list.updated": {
      const apps = Array.isArray(event.payload.apps)
        ? event.payload.apps
        : undefined
      return {
        type: "conversation-block",
        block: makeConversationBlock(event, {
          type: "status",
          level: "info",
          title: "Apps updated",
          message:
            typeof apps?.length === "number"
              ? `${apps.length} app${apps.length === 1 ? "" : "s"} available.`
              : "App list updated.",
          data: event.payload,
          status: "completed",
        }),
      }
    }
    case "config.updated": {
      return {
        type: "conversation-block",
        block: makeConversationBlock(event, {
          type: "status",
          level: "info",
          title: cleanString(event.payload.title) ?? "Config updated",
          message:
            cleanString(event.payload.message) ??
            "Codex configuration state updated.",
          data: event.payload,
          status: "completed",
        }),
      }
    }
    case "model.rerouted": {
      return {
        type: "conversation-block",
        block: makeConversationBlock(event, {
          type: "model-reroute",
          fromModelId: cleanString(event.payload.fromModel),
          toModelId: cleanString(event.payload.toModel),
          reason: cleanString(event.payload.reason),
          status: "completed",
        }),
      }
    }
    case "turn.plan.updated": {
      return {
        type: "conversation-block",
        block: makeConversationBlock(event, {
          type: "proposed-plan",
          plan: event.payload.plan,
          input: event.payload,
          status: "running",
        }),
      }
    }
    case "request.opened": {
      return {
        type: "conversation-block",
        block: makeConversationBlock(event, {
          type: "permission-request",
          input: event.payload,
          status: "running",
        }),
      }
    }
    case "request.resolved": {
      return {
        type: "conversation-block-update",
        id: eventBlockId(event),
        patch: {
          status: event.payload.decision === "decline" ? "failed" : "completed",
          output: event.payload,
        } as Partial<AgentRuntimeConversationBlock>,
      }
    }
    case "user-input.requested": {
      return {
        type: "conversation-block",
        block: makeConversationBlock(event, {
          type: "user-input",
          input: event.payload,
          status: "running",
        }),
      }
    }
    case "user-input.resolved": {
      return {
        type: "conversation-block-update",
        id: eventBlockId(event),
        patch: {
          status: "completed",
          output: event.payload,
        } as Partial<AgentRuntimeConversationBlock>,
      }
    }
    case "item.started":
    case "item.updated":
    case "item.completed": {
      const status =
        event.type === "item.completed"
          ? "completed"
          : normalizeItemStatus(event.payload.status) ?? "running"
      const blockBase = runtimeItemTypeToBlock(event.payload.itemType)
      return {
        type: "conversation-block",
        block: makeConversationBlock(event, {
          ...blockBase,
          title: cleanString(event.payload.title),
          summary: cleanString(event.payload.detail),
          input: event.payload.data,
          status,
        }),
      }
    }
    case "hook.started": {
      const hookName = cleanString(event.payload.hookName) ?? "hook"
      const hookEvent = cleanString(event.payload.hookEvent)
      return {
        type: "conversation-block",
        block: makeConversationBlock(event, {
          id: payloadBlockId(event, ["hookId"]),
          type: "status",
          level: "info",
          title: `Hook ${hookName}`,
          message: hookEvent ? `${hookEvent} started.` : "Hook started.",
          data: event.payload,
          status: "running",
        }),
      }
    }
    case "hook.progress": {
      const output =
        cleanString(event.payload.output) ??
        cleanString(event.payload.stdout) ??
        cleanString(event.payload.stderr)
      return {
        type: "conversation-block-update",
        id: payloadBlockId(event, ["hookId"]),
        patch: {
          status: "running",
          ...(output ? { summary: output } : {}),
          output: event.payload,
        } as Partial<AgentRuntimeConversationBlock>,
      }
    }
    case "hook.completed": {
      const output =
        cleanString(event.payload.output) ??
        cleanString(event.payload.stdout) ??
        cleanString(event.payload.stderr)
      return {
        type: "conversation-block-update",
        id: payloadBlockId(event, ["hookId"]),
        patch: {
          status: hookOutcomeToStatus(event.payload.outcome ?? event.payload.status),
          ...(output ? { summary: output } : {}),
          output: event.payload,
        } as Partial<AgentRuntimeConversationBlock>,
      }
    }
    case "tool.progress": {
      const summary = cleanString(event.payload.summary)
      return {
        type: "conversation-block-update",
        id: payloadBlockId(event, ["toolUseId"]),
        patch: {
          status: "running",
          ...(summary ? { summary } : {}),
          output: event.payload,
        } as Partial<AgentRuntimeConversationBlock>,
      }
    }
    case "tool.summary": {
      return {
        type: "conversation-block",
        block: makeConversationBlock(event, {
          type: "status",
          level: "info",
          title: "Tool summary",
          message: cleanString(event.payload.summary),
          data: event.payload,
          status: "completed",
        }),
      }
    }
    case "deprecation.notice": {
      return {
        type: "conversation-block",
        block: makeConversationBlock(event, {
          type: "status",
          level: "warning",
          title: cleanString(event.payload.summary) ?? "Deprecation notice",
          message: cleanString(event.payload.details),
          data: event.payload,
          status: "completed",
        }),
      }
    }
    case "tool.denied": {
      const toolUseId = cleanString(event.payload.toolUseId)
      const toolName = cleanString(event.payload.toolName) ?? "Tool"
      const reason = cleanString(event.payload.reason)
      if (toolUseId) {
        return {
          type: "conversation-block-update",
          id: toolUseId,
          patch: {
            status: "failed",
            summary: reason ?? `${toolName} denied.`,
            output: event.payload,
          } as Partial<AgentRuntimeConversationBlock>,
        }
      }
      return {
        type: "conversation-block",
        block: makeConversationBlock(event, {
          type: "status",
          level: "warning",
          title: `${toolName} denied`,
          message: reason,
          data: event.payload,
          status: "completed",
        }),
      }
    }
    case "files.persisted": {
      const files = Array.isArray(event.payload.files)
        ? event.payload.files
        : []
      const failed = Array.isArray(event.payload.failed)
        ? event.payload.failed
        : []
      return {
        type: "conversation-block",
        block: makeConversationBlock(event, {
          type: "status",
          level: failed.length > 0 ? "warning" : "info",
          title: "Files persisted",
          message:
            failed.length > 0
              ? `${files.length} file${files.length === 1 ? "" : "s"} persisted, ${failed.length} failed.`
              : `${files.length} file${files.length === 1 ? "" : "s"} persisted.`,
          data: event.payload,
          status: "completed",
        }),
      }
    }
    case "runtime.warning":
    case "config.warning": {
      return {
        type: "conversation-block",
        block: makeConversationBlock(event, {
          type: "status",
          level: "warning",
          title: cleanString(event.payload.summary),
          message:
            cleanString(event.payload.message) ?? cleanString(event.payload.details),
          data: event.payload,
          status: "completed",
        }),
      }
    }
    default:
      return null
  }
}

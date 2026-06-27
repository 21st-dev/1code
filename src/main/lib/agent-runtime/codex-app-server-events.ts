import type {
  AgentRuntimeConversationBlock,
  AgentRuntimeStreamEvent,
} from "./types"
import {
  providerRuntimeEventToStreamEvent,
  type CanonicalRuntimeItemType,
  type CanonicalRuntimeRequestType,
  type ProviderRuntimeEvent,
  type ProviderRuntimeEventType,
} from "./provider-runtime-contract"

export interface CodexAppServerNotification {
  method: string
  params?: unknown
}

export interface CodexAppServerServerRequest {
  id: string | number
  method: string
  params?: unknown
}

export interface CodexAppServerNotificationContext {
  providerInstanceId?: string | null
  nativeSessionId?: string | null
  eventId?: string | null
  createdAt?: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null
}

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

export function codexAppServerServerRequestId(
  value: CodexAppServerServerRequest,
): string {
  const params = readRecord(value.params) ?? {}
  return (
    readString(params.approvalId) ??
    readString(params.requestId) ??
    readString(params.itemId) ??
    readString(params.callId) ??
    String(value.id)
  )
}

function readThreadId(method: string, params: Record<string, unknown>): string | undefined {
  if (method === "thread/started") {
    return readString(readRecord(params.thread)?.id)
  }
  return readString(params.threadId)
}

function readTurnRecord(params: Record<string, unknown>): Record<string, unknown> | null {
  return readRecord(params.turn)
}

function readTurnId(params: Record<string, unknown>): string | undefined {
  return readString(params.turnId) ?? readString(readTurnRecord(params)?.id)
}

function readItemRecord(params: Record<string, unknown>): Record<string, unknown> | null {
  return readRecord(params.item)
}

function readItemId(params: Record<string, unknown>): string | undefined {
  return readString(params.itemId) ?? readString(readItemRecord(params)?.id)
}

function mapCodexAppServerItemType(value: unknown): CanonicalRuntimeItemType {
  switch (value) {
    case "userMessage":
      return "user_message"
    case "agentMessage":
      return "assistant_message"
    case "reasoning":
      return "reasoning"
    case "plan":
      return "plan"
    case "commandExecution":
      return "command_execution"
    case "fileChange":
      return "file_change"
    case "mcpToolCall":
      return "mcp_tool_call"
    case "dynamicToolCall":
      return "dynamic_tool_call"
    case "collabAgentToolCall":
      return "collab_agent_tool_call"
    case "webSearch":
      return "web_search"
    case "imageView":
      return "image_view"
    case "enteredReviewMode":
      return "review_entered"
    case "exitedReviewMode":
      return "review_exited"
    case "contextCompaction":
      return "context_compaction"
    default:
      return "unknown"
  }
}

export function codexAppServerRequestType(
  method: string,
): CanonicalRuntimeRequestType {
  switch (method) {
    case "item/commandExecution/requestApproval":
      return "command_execution_approval"
    case "item/fileRead/requestApproval":
      return "file_read_approval"
    case "item/fileChange/requestApproval":
      return "file_change_approval"
    case "applyPatchApproval":
      return "apply_patch_approval"
    case "execCommandApproval":
      return "exec_command_approval"
    case "item/tool/requestUserInput":
      return "tool_user_input"
    case "item/tool/call":
      return "dynamic_tool_call"
    case "account/chatgptAuthTokens/refresh":
      return "auth_tokens_refresh"
    default:
      return "unknown"
  }
}

function titleForItem(item: Record<string, unknown>): string | undefined {
  switch (item.type) {
    case "commandExecution":
      return readString(item.command)
    case "mcpToolCall": {
      const server = readString(item.server)
      const tool = readString(item.tool)
      return server && tool ? `${server}.${tool}` : tool ?? server
    }
    case "dynamicToolCall":
      return readString(item.tool)
    case "webSearch":
      return readString(item.query)
    case "imageView":
      return readString(item.path)
    case "imageGeneration":
      return readString(item.revisedPrompt) ?? readString(item.result)
    case "enteredReviewMode":
    case "exitedReviewMode":
      return readString(item.review)
    default:
      return undefined
  }
}

function detailForItem(item: Record<string, unknown>): string | undefined {
  return (
    readString(item.command) ??
    readString(item.title) ??
    readString(item.summary) ??
    readString(item.text) ??
    readString(item.aggregatedOutput) ??
    readString(item.path) ??
    readString(item.prompt)
  )
}

function detailForRequest(
  method: string,
  params: Record<string, unknown>,
): string | undefined {
  switch (method) {
    case "item/commandExecution/requestApproval":
      return readString(params.command) ?? readString(params.reason)
    case "item/fileChange/requestApproval":
    case "applyPatchApproval":
      return readString(params.reason)
    case "execCommandApproval": {
      const command = readArray(params.command)
        .filter((entry): entry is string => typeof entry === "string")
        .join(" ")
      return readString(params.reason) ?? readString(command)
    }
    case "item/tool/call":
      return readString(params.tool)
    default:
      return undefined
  }
}

function tokenUsagePayload(params: Record<string, unknown>): Record<string, unknown> {
  const tokenUsage = readRecord(params.tokenUsage)
  const total = readRecord(tokenUsage?.total) ?? tokenUsage ?? {}
  const last = readRecord(tokenUsage?.last)
  const totalTokens = readNumber(total.totalTokens)
  const usedTokens = readNumber(total.usedTokens) ?? totalTokens
  const maxTokens =
    readNumber(tokenUsage?.modelContextWindow) ??
    readNumber(tokenUsage?.maxTokens) ??
    readNumber(total.modelContextWindow) ??
    readNumber(total.maxTokens)
  return {
    usage: {
      inputTokens: readNumber(total.inputTokens),
      outputTokens: readNumber(total.outputTokens),
      totalTokens,
      usedTokens,
      totalProcessedTokens:
        readNumber(tokenUsage?.totalProcessedTokens) ??
        readNumber(total.totalProcessedTokens),
      reasoningOutputTokens: readNumber(total.reasoningOutputTokens),
      cachedInputTokens: readNumber(total.cachedInputTokens),
      maxTokens,
      modelContextWindow: maxTokens,
      lastUsedTokens: readNumber(last?.usedTokens) ?? readNumber(last?.totalTokens),
      lastInputTokens: readNumber(last?.inputTokens),
      lastCachedInputTokens: readNumber(last?.cachedInputTokens),
      lastOutputTokens: readNumber(last?.outputTokens),
      lastReasoningOutputTokens: readNumber(last?.reasoningOutputTokens),
      toolUses: readNumber(tokenUsage?.toolUses) ?? readNumber(total.toolUses),
      durationMs: readNumber(tokenUsage?.durationMs) ?? readNumber(total.durationMs),
      compactsAutomatically:
        readBoolean(tokenUsage?.compactsAutomatically) ??
        readBoolean(total.compactsAutomatically),
      last,
    },
  }
}

function compactObject(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  )
}

function makeProviderRuntimeEvent(
  type: ProviderRuntimeEventType,
  notification: CodexAppServerNotification,
  context: CodexAppServerNotificationContext,
  payload: Record<string, unknown>,
  fallbackEventId?: string,
): ProviderRuntimeEvent | null {
  const params = readRecord(notification.params) ?? {}
  const threadId = readThreadId(notification.method, params)
  const turnId = readTurnId(params)
  const itemId = readItemId(params)
  const requestId = readString(params.requestId)

  return compactObject({
    type,
    engineId: "codex",
    providerInstanceId: readString(context.providerInstanceId),
    nativeSessionId: readString(context.nativeSessionId) ?? null,
    eventId: readString(context.eventId) ?? readString(fallbackEventId),
    createdAt: readString(context.createdAt),
    threadId,
    turnId,
    itemId,
    requestId,
    payload,
    raw: notification,
  }) as unknown as ProviderRuntimeEvent
}

function itemPayload(params: Record<string, unknown>): Record<string, unknown> {
  const item = readItemRecord(params) ?? {}
  return {
    itemType: mapCodexAppServerItemType(item.type),
    title: titleForItem(item),
    status: item.status,
    detail: detailForItem(item),
    data: item,
  }
}

function warningPayload(params: Record<string, unknown>): Record<string, unknown> {
  return {
    summary:
      readString(params.summary) ??
      readString(params.title) ??
      readString(params.message) ??
      "Codex app-server warning",
    message: readString(params.message) ?? readString(params.details),
    details: readString(params.details),
    data: params,
  }
}

function hookRunOutput(run: Record<string, unknown>): string | undefined {
  const entries = readArray(run.entries)
    .map((entry) => readString(readRecord(entry)?.text))
    .filter((entry): entry is string => Boolean(entry))
  return readString(entries.join("\n")) ?? readString(run.statusMessage)
}

function hookRunOutcome(run: Record<string, unknown>): "success" | "error" | "cancelled" {
  const status = readString(run.status)
  if (status === "completed") return "success"
  if (status === "stopped") return "cancelled"
  return "error"
}

function hookRunPayload(
  params: Record<string, unknown>,
  phase: "started" | "completed",
): Record<string, unknown> {
  const run = readRecord(params.run) ?? {}
  const hookId = readString(run.id)
  const hookName =
    readString(run.sourcePath) ??
    readString(run.handlerType) ??
    "hook"
  const output = hookRunOutput(run)

  return compactObject({
    hookId,
    hookName,
    hookEvent: readString(run.eventName),
    status: readString(run.status),
    ...(phase === "completed" ? { outcome: hookRunOutcome(run) } : {}),
    output,
    durationMs: readNumber(run.durationMs),
    run,
  })
}

function directBlockPatch(
  notification: CodexAppServerNotification,
  context: CodexAppServerNotificationContext,
  patch: Partial<AgentRuntimeConversationBlock>,
): AgentRuntimeStreamEvent | null {
  const params = readRecord(notification.params) ?? {}
  const id = readItemId(params) ?? readString(params.requestId)
  if (!id) return null
  const patchRecord = patch as Record<string, unknown>
  const metadata = isRecord(patchRecord.metadata) ? patchRecord.metadata : {}

  return {
    type: "conversation-block-update",
    id,
    patch: {
      ...patch,
      metadata: {
        ...metadata,
        codexAppServerMethod: notification.method,
        ...(readString(context.providerInstanceId)
          ? { providerInstanceId: readString(context.providerInstanceId) }
          : {}),
      },
    } as Partial<AgentRuntimeConversationBlock>,
  }
}

export function codexAppServerServerRequestToProviderRuntimeEvent(
  request: CodexAppServerServerRequest,
  context: CodexAppServerNotificationContext = {},
): ProviderRuntimeEvent | null {
  const params = readRecord(request.params) ?? {}
  const requestId = codexAppServerServerRequestId(request)
  const base = compactObject({
    engineId: "codex",
    providerInstanceId: readString(context.providerInstanceId),
    nativeSessionId: readString(context.nativeSessionId) ?? null,
    eventId: readString(context.eventId),
    createdAt: readString(context.createdAt),
    threadId: readString(params.threadId) ?? readString(context.nativeSessionId),
    turnId: readString(params.turnId),
    requestId,
    raw: request,
  })

  if (request.method === "item/tool/requestUserInput") {
    return {
      ...base,
      type: "user-input.requested",
      payload: {
        requestType: codexAppServerRequestType(request.method),
        questions: params.questions,
        args: params,
      },
    } as ProviderRuntimeEvent
  }

  return {
    ...base,
    type: "request.opened",
    payload: compactObject({
      requestType: codexAppServerRequestType(request.method),
      detail: detailForRequest(request.method, params),
      args: params,
    }),
  } as ProviderRuntimeEvent
}

export function codexAppServerServerRequestToStreamEvent(
  request: CodexAppServerServerRequest,
  context: CodexAppServerNotificationContext = {},
): AgentRuntimeStreamEvent | null {
  const event = codexAppServerServerRequestToProviderRuntimeEvent(request, context)
  return event ? providerRuntimeEventToStreamEvent(event) : null
}

export function codexAppServerNotificationToProviderRuntimeEvent(
  notification: CodexAppServerNotification,
  context: CodexAppServerNotificationContext = {},
): ProviderRuntimeEvent | null {
  const params = readRecord(notification.params) ?? {}

  switch (notification.method) {
    case "session/connecting":
      return makeProviderRuntimeEvent("session.state.changed", notification, context, {
        state: "starting",
        reason:
          readString(params.message) ??
          "Starting Codex app-server session.",
      })
    case "session/ready":
      return makeProviderRuntimeEvent("session.state.changed", notification, context, {
        state: "ready",
        reason:
          readString(params.message) ??
          "Codex app-server session ready.",
      })
    case "session/error":
      return makeProviderRuntimeEvent("session.state.changed", notification, context, {
        state: "error",
        reason:
          readString(params.message) ??
          readString(readRecord(params.error)?.message) ??
          "Codex app-server session failed.",
        error: params.error,
      })
    case "thread/started":
      return makeProviderRuntimeEvent("thread.started", notification, context, {
        thread: params.thread,
      })
    case "thread/status/changed":
      return makeProviderRuntimeEvent("thread.state.changed", notification, context, {
        status: params.status,
      })
    case "thread/tokenUsage/updated":
      return makeProviderRuntimeEvent(
        "thread.token-usage.updated",
        notification,
        context,
        tokenUsagePayload(params),
      )
    case "turn/started":
      return makeProviderRuntimeEvent("turn.started", notification, context, {
        state: readString(readTurnRecord(params)?.status) ?? "inProgress",
        turn: params.turn,
      })
    case "turn/completed": {
      const turn = readTurnRecord(params)
      return makeProviderRuntimeEvent("turn.completed", notification, context, {
        state: readString(turn?.status) ?? "failed",
        error: turn?.error,
        turn,
      })
    }
    case "turn/plan/updated":
      return makeProviderRuntimeEvent("turn.plan.updated", notification, context, {
        plan: params.plan,
        explanation: params.explanation,
      })
    case "item/plan/delta":
      return makeProviderRuntimeEvent("turn.proposed.delta", notification, context, {
        delta: readString(params.delta) ?? "",
      })
    case "hook/started": {
      const run = readRecord(params.run) ?? {}
      return makeProviderRuntimeEvent(
        "hook.started",
        notification,
        context,
        hookRunPayload(params, "started"),
        `codex-app-server:hook:${readString(run.id) ?? "unknown"}`,
      )
    }
    case "hook/completed": {
      const run = readRecord(params.run) ?? {}
      return makeProviderRuntimeEvent(
        "hook.completed",
        notification,
        context,
        hookRunPayload(params, "completed"),
        `codex-app-server:hook:${readString(run.id) ?? "unknown"}`,
      )
    }
    case "item/started":
      return makeProviderRuntimeEvent(
        "item.started",
        notification,
        context,
        itemPayload(params),
      )
    case "item/completed": {
      const item = readItemRecord(params) ?? {}
      const planMarkdown = item.type === "plan" ? readString(item.text) : undefined
      if (planMarkdown) {
        return makeProviderRuntimeEvent(
          "turn.proposed.completed",
          notification,
          context,
          {
            planMarkdown,
            data: item,
          },
        )
      }
      return makeProviderRuntimeEvent(
        "item.completed",
        notification,
        context,
        itemPayload(params),
      )
    }
    case "serverRequest/resolved":
      return makeProviderRuntimeEvent("request.resolved", notification, context, {
        requestId: params.requestId,
        requestType: readString(params.requestType),
        rawRequestId: params.rawRequestId,
        state: "resolved",
      })
    case "item/mcpToolCall/progress":
      return makeProviderRuntimeEvent("tool.progress", notification, context, {
        toolUseId: readString(params.itemId),
        summary: readString(params.message),
        toolName: readString(params.toolName),
        data: params,
      })
    case "model/rerouted":
      return makeProviderRuntimeEvent("model.rerouted", notification, context, {
        fromModel: params.fromModel,
        toModel: params.toModel,
        reason: params.reason,
      })
    case "thread/realtime/started":
      return makeProviderRuntimeEvent(
        "thread.realtime.started",
        notification,
        context,
        {
          threadId: readString(params.threadId),
          realtimeSessionId: readString(params.realtimeSessionId),
          version: readString(params.version),
        },
        `codex-app-server:realtime:${readString(params.threadId) ?? "unknown"}`,
      )
    case "thread/realtime/itemAdded":
      return makeProviderRuntimeEvent(
        "thread.realtime.item-added",
        notification,
        context,
        {
          threadId: readString(params.threadId),
          item: params.item,
        },
        `codex-app-server:realtime:${readString(params.threadId) ?? "unknown"}`,
      )
    case "thread/realtime/outputAudio/delta":
      return makeProviderRuntimeEvent(
        "thread.realtime.audio.delta",
        notification,
        context,
        {
          threadId: readString(params.threadId),
          audio: params.audio,
        },
        `codex-app-server:realtime:${readString(params.threadId) ?? "unknown"}`,
      )
    case "thread/realtime/error":
      return makeProviderRuntimeEvent(
        "thread.realtime.error",
        notification,
        context,
        {
          threadId: readString(params.threadId),
          message: readString(params.message) ?? "Realtime error",
        },
        `codex-app-server:realtime:${readString(params.threadId) ?? "unknown"}`,
      )
    case "thread/realtime/closed":
      return makeProviderRuntimeEvent(
        "thread.realtime.closed",
        notification,
        context,
        {
          threadId: readString(params.threadId),
          reason: readString(params.reason),
        },
        `codex-app-server:realtime:${readString(params.threadId) ?? "unknown"}`,
      )
    case "configWarning":
      return makeProviderRuntimeEvent(
        "config.warning",
        notification,
        context,
        warningPayload(params),
      )
    case "account/updated":
      return makeProviderRuntimeEvent(
        "account.updated",
        notification,
        context,
        {
          account: params,
        },
        "codex-app-server:account/updated",
      )
    case "account/rateLimits/updated":
      return makeProviderRuntimeEvent(
        "account.rate-limits.updated",
        notification,
        context,
        {
          rateLimits: readRecord(params.rateLimits) ?? params.rateLimits ?? params,
        },
        "codex-app-server:account/rateLimits/updated",
      )
    case "mcpServer/startupStatus/updated":
      return makeProviderRuntimeEvent(
        "mcp.status.updated",
        notification,
        context,
        {
          name: readString(params.name),
          status: readString(params.status),
          error: readString(params.error),
          data: params,
        },
        `codex-app-server:mcp:${readString(params.name) ?? "unknown"}`,
      )
    case "mcpServer/oauthLogin/completed":
      return makeProviderRuntimeEvent(
        "mcp.oauth.completed",
        notification,
        context,
        {
          name: readString(params.name),
          success: readBoolean(params.success) ?? false,
          error: readString(params.error),
        },
        `codex-app-server:mcp-oauth:${readString(params.name) ?? "unknown"}`,
      )
    case "app/list/updated":
      return makeProviderRuntimeEvent(
        "app.list.updated",
        notification,
        context,
        {
          apps: readArray(params.data),
        },
        "codex-app-server:app/list/updated",
      )
    case "externalAgentConfig/import/completed":
      return makeProviderRuntimeEvent(
        "config.updated",
        notification,
        context,
        {
          source: "external-agent-config",
          title: "External config imported",
          message: "External agent configuration import completed.",
        },
        "codex-app-server:externalAgentConfig/import/completed",
      )
    case "deprecationNotice":
      return makeProviderRuntimeEvent(
        "deprecation.notice",
        notification,
        context,
        {
          summary:
            readString(params.summary) ??
            "Codex app-server deprecation notice",
          details: readString(params.details),
        },
        "codex-app-server:deprecationNotice",
      )
    case "warning":
    case "guardianWarning":
      return makeProviderRuntimeEvent(
        "runtime.warning",
        notification,
        context,
        warningPayload(params),
      )
    case "error": {
      const error = readRecord(params.error)
      return makeProviderRuntimeEvent("runtime.error", notification, context, {
        message:
          readString(error?.message) ??
          readString(params.message) ??
          "Codex app-server error.",
        error: params.error,
        willRetry: params.willRetry,
      })
    }
    default:
      return null
  }
}

export function codexAppServerNotificationToStreamEvent(
  notification: CodexAppServerNotification,
  context: CodexAppServerNotificationContext = {},
): AgentRuntimeStreamEvent | null {
  const params = readRecord(notification.params) ?? {}

  switch (notification.method) {
    case "item/agentMessage/delta": {
      const delta = readString(params.delta)
      return delta ? { type: "text", text: delta } : null
    }
    case "item/plan/delta": {
      const event = codexAppServerNotificationToProviderRuntimeEvent(
        notification,
        context,
      )
      return event ? providerRuntimeEventToStreamEvent(event) : null
    }
    case "item/commandExecution/outputDelta":
    case "item/fileChange/outputDelta": {
      const delta = readString(params.delta)
      return delta
        ? directBlockPatch(notification, context, {
            output: { delta },
          })
        : null
    }
    case "item/reasoning/summaryTextDelta":
    case "item/reasoning/textDelta": {
      const delta = readString(params.delta)
      return delta
        ? directBlockPatch(notification, context, {
            summary: delta,
          })
        : null
    }
    case "turn/diff/updated":
      return directBlockPatch(notification, context, {
        input: {
          diff: params.diff,
        },
      })
    default: {
      const event = codexAppServerNotificationToProviderRuntimeEvent(
        notification,
        context,
      )
      return event ? providerRuntimeEventToStreamEvent(event) : null
    }
  }
}

export function codexAppServerNotificationsToStreamEvents(
  notifications: readonly CodexAppServerNotification[],
  context: CodexAppServerNotificationContext = {},
): AgentRuntimeStreamEvent[] {
  return notifications
    .map((notification) =>
      codexAppServerNotificationToStreamEvent(notification, context),
    )
    .filter((event): event is AgentRuntimeStreamEvent => Boolean(event))
}

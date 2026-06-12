import type { AgentJobStatus } from "../../../shared/agent-jobs"

type TokenUsageBreakdown = {
  totalTokens: number
  inputTokens: number
  cachedInputTokens?: number
  outputTokens: number
  reasoningOutputTokens?: number
}

type ThreadTokenUsage = {
  total: TokenUsageBreakdown
  last: TokenUsageBreakdown
  modelContextWindow: number | null
}

type AppServerTurn = {
  id: string
  status: "completed" | "interrupted" | "failed" | "inProgress"
  error?: { message?: string; code?: string } | null
  durationMs?: number | null
}

export type CodexAppServerNotification =
  | {
      method: "thread/started"
      params: {
        thread: {
          id: string
          sessionId: string
          modelProvider?: string
        }
      }
    }
  | {
      method: "turn/started"
      params: {
        threadId: string
        turn: AppServerTurn
      }
    }
  | {
      method: "item/agentMessage/delta"
      params: {
        threadId: string
        turnId: string
        itemId: string
        delta: string
      }
    }
  | {
      method:
        | "item/reasoning/textDelta"
        | "item/reasoning/summaryTextDelta"
      params: {
        threadId: string
        turnId: string
        itemId: string
        delta: string
      }
    }
  | {
      method: "thread/tokenUsage/updated"
      params: {
        threadId: string
        turnId: string
        tokenUsage: ThreadTokenUsage
      }
    }
  | {
      method: "turn/diff/updated"
      params: {
        threadId: string
        turnId: string
        diff: string
      }
    }
  | {
      method: "item/fileChange/patchUpdated"
      params: {
        threadId: string
        turnId: string
        itemId: string
        changes: unknown[]
      }
    }
  | {
      method: "item/fileChange/outputDelta"
      params: {
        threadId: string
        turnId: string
        itemId: string
        delta: string
      }
    }
  | {
      method: "turn/completed"
      params: {
        threadId: string
        turn: AppServerTurn
      }
    }
  | {
      method: "error"
      params: {
        threadId: string
        turnId: string
        error: { message?: string; code?: string }
        willRetry?: boolean
      }
    }

export type CodexAppServerStreamChunk = Record<string, unknown> & {
  type: string
}

export type CodexAppServerTurnInterruptRequest = {
  method: "turn/interrupt"
  params: {
    threadId: string
    turnId: string
  }
}

export type CodexAppServerRuntimeEventMapper = {
  map(notification: CodexAppServerNotification): CodexAppServerStreamChunk[]
  getSessionId(): string | null
  getThreadId(): string | null
  getTurnId(): string | null
  buildInterruptRequest(): CodexAppServerTurnInterruptRequest | null
}

function statusFromTurn(turn: AppServerTurn): AgentJobStatus {
  if (turn.status === "completed") return "succeeded"
  if (turn.status === "interrupted") return "interrupted"
  if (turn.status === "failed") return "failed"
  return "running"
}

function messageFromTurn(turn: AppServerTurn): string | null {
  return turn.error?.message ?? turn.error?.code ?? null
}

function messageMetadata(input: {
  threadId: string | null
  turnId: string | null
  sessionId: string | null
  usage?: ThreadTokenUsage | null
}) {
  const last = input.usage?.last
  const total = input.usage?.total
  return {
    provider: "codex",
    adapterSource: "codex-app-server",
    threadId: input.threadId,
    turnId: input.turnId,
    sessionId: input.sessionId,
    inputTokens: last?.inputTokens,
    outputTokens: last?.outputTokens,
    totalTokens: last?.totalTokens,
    cachedInputTokens: last?.cachedInputTokens,
    reasoningOutputTokens: last?.reasoningOutputTokens,
    cumulativeInputTokens: total?.inputTokens,
    cumulativeOutputTokens: total?.outputTokens,
    cumulativeTotalTokens: total?.totalTokens,
    modelContextWindow: input.usage?.modelContextWindow ?? null,
  }
}

export function createCodexAppServerRuntimeEventMapper(): CodexAppServerRuntimeEventMapper {
  let threadId: string | null = null
  let sessionId: string | null = null
  let turnId: string | null = null
  let tokenUsage: ThreadTokenUsage | null = null

  return {
    map(notification) {
      switch (notification.method) {
        case "thread/started": {
          threadId = notification.params.thread.id
          sessionId = notification.params.thread.sessionId
          return [
            {
              type: "session-init",
              threadId,
              sessionId,
              provider: "codex",
              adapterSource: "codex-app-server",
            },
          ]
        }
        case "turn/started": {
          threadId = notification.params.threadId
          turnId = notification.params.turn.id
          return [
            {
              type: "start-step",
              id: turnId,
              threadId,
              sessionId,
              adapterSource: "codex-app-server",
            },
          ]
        }
        case "item/agentMessage/delta":
          return [
            {
              type: "text-delta",
              id: notification.params.itemId,
              delta: notification.params.delta,
              threadId: notification.params.threadId,
              turnId: notification.params.turnId,
            },
          ]
        case "item/reasoning/textDelta":
        case "item/reasoning/summaryTextDelta":
          return [
            {
              type: "reasoning-delta",
              id: notification.params.itemId,
              delta: notification.params.delta,
              threadId: notification.params.threadId,
              turnId: notification.params.turnId,
            },
          ]
        case "thread/tokenUsage/updated": {
          threadId = notification.params.threadId
          turnId = notification.params.turnId
          tokenUsage = notification.params.tokenUsage
          return [
            {
              type: "message-metadata",
              messageMetadata: messageMetadata({
                threadId,
                turnId,
                sessionId,
                usage: tokenUsage,
              }),
            },
          ]
        }
        case "turn/diff/updated":
          return [
            {
              type: "file-change-diff",
              diff: notification.params.diff,
              threadId: notification.params.threadId,
              turnId: notification.params.turnId,
            },
          ]
        case "item/fileChange/patchUpdated":
          return [
            {
              type: "file-change-patch",
              id: notification.params.itemId,
              changes: notification.params.changes,
              threadId: notification.params.threadId,
              turnId: notification.params.turnId,
            },
          ]
        case "item/fileChange/outputDelta":
          return [
            {
              type: "file-change-delta",
              id: notification.params.itemId,
              delta: notification.params.delta,
              threadId: notification.params.threadId,
              turnId: notification.params.turnId,
            },
          ]
        case "turn/completed": {
          threadId = notification.params.threadId
          turnId = notification.params.turn.id
          const status = statusFromTurn(notification.params.turn)
          return [
            {
              type: "finish",
              status,
              message: messageFromTurn(notification.params.turn),
              messageMetadata: messageMetadata({
                threadId,
                turnId,
                sessionId,
                usage: tokenUsage,
              }),
            },
          ]
        }
        case "error":
          return [
            {
              type: "error",
              errorText:
                notification.params.error.message ??
                notification.params.error.code ??
                "Codex app-server error",
              threadId: notification.params.threadId,
              turnId: notification.params.turnId,
              willRetry: Boolean(notification.params.willRetry),
            },
          ]
        default:
          return []
      }
    },
    getSessionId() {
      return sessionId
    },
    getThreadId() {
      return threadId
    },
    getTurnId() {
      return turnId
    },
    buildInterruptRequest() {
      if (!threadId || !turnId) return null
      return {
        method: "turn/interrupt",
        params: { threadId, turnId },
      }
    },
  }
}

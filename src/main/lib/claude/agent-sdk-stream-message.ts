import { logRawClaudeMessage } from "./raw-logger"
import {
  recordClaudeAgentSdkStreamMessage,
  type ClaudeAgentSdkStreamIterationState,
} from "./agent-sdk-stream-lifecycle"

export type RecordClaudeAgentSdkIncomingMessageInput = {
  chatId: string
  message: any
  state: ClaudeAgentSdkStreamIterationState
  isUsingOllama: boolean
  logRawMessage?: (chatId: string, message: unknown) => unknown
  now?: () => number
  warn?: (...args: any[]) => void
}

export function recordClaudeAgentSdkIncomingMessage({
  chatId,
  message,
  state,
  isUsingOllama,
  logRawMessage = logRawClaudeMessage,
  now,
  warn,
}: RecordClaudeAgentSdkIncomingMessageInput): {
  messageCount: number
  timeToFirstMessageMs?: number
} {
  const result = recordClaudeAgentSdkStreamMessage({
    state,
    message,
    isUsingOllama,
    now,
    warn,
  })
  void logRawMessage(chatId, message)
  return result
}

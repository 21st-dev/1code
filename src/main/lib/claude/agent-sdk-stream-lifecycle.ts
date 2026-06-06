import {
  logClaudeOllamaEmptyStreamDiagnosis,
  logClaudeOllamaFirstMessageLatency,
  logClaudeOllamaMessage,
  logClaudeOllamaSingleMessageWarning,
  logClaudeOllamaStreamComplete,
} from "./agent-sdk-ollama-diagnostics"

export type ClaudeAgentSdkStreamIterationState = {
  firstMessageReceived: boolean
  messageCount: number
  startedAt: number
}

export function createClaudeAgentSdkStreamIterationState(
  startedAt: number = Date.now(),
): ClaudeAgentSdkStreamIterationState {
  return {
    firstMessageReceived: false,
    messageCount: 0,
    startedAt,
  }
}

export function recordClaudeAgentSdkStreamMessage(input: {
  state: ClaudeAgentSdkStreamIterationState
  message: any
  isUsingOllama: boolean
  now?: () => number
  warn?: (...args: any[]) => void
}): { messageCount: number; timeToFirstMessageMs?: number } {
  const now = input.now ?? Date.now
  const warn = input.warn ?? console.warn
  input.state.messageCount++

  if (input.isUsingOllama) {
    logClaudeOllamaMessage({
      messageCount: input.state.messageCount,
      message: input.message,
    })
  }

  if (input.state.firstMessageReceived) {
    return { messageCount: input.state.messageCount }
  }

  input.state.firstMessageReceived = true
  const timeToFirstMessageMs = now() - input.state.startedAt
  if (input.isUsingOllama) {
    logClaudeOllamaFirstMessageLatency(timeToFirstMessageMs)
  }
  if (timeToFirstMessageMs > 5000) {
    warn(
      `[claude] SDK initialization took ${(timeToFirstMessageMs / 1000).toFixed(1)}s (MCP servers loading?)`,
    )
  }

  return {
    messageCount: input.state.messageCount,
    timeToFirstMessageMs,
  }
}

export function completeClaudeAgentSdkStreamIteration(input: {
  state: ClaudeAgentSdkStreamIterationState
  isUsingOllama: boolean
  chunkCount: number
  model?: string | null
  now?: () => number
  error?: (...args: any[]) => void
}): { messageCount: number; durationMs: number } {
  const now = input.now ?? Date.now
  const error = input.error ?? console.error
  const durationMs = now() - input.state.startedAt

  if (input.isUsingOllama) {
    logClaudeOllamaStreamComplete({
      messageCount: input.state.messageCount,
      durationMs,
      chunkCount: input.chunkCount,
    })
  }

  if (input.state.messageCount === 0) {
    error("[claude] Stream yielded no messages - model not responding")
    if (input.isUsingOllama) {
      logClaudeOllamaEmptyStreamDiagnosis(input.model)
    }
  } else if (input.state.messageCount === 1 && input.isUsingOllama) {
    logClaudeOllamaSingleMessageWarning()
  }

  return {
    messageCount: input.state.messageCount,
    durationMs,
  }
}

"use client"

export interface ToolLifecycleState {
  isInputStreaming: boolean
  isTerminal: boolean
  isError: boolean
  hasOutput: boolean
  hasResult: boolean
  isPendingState: boolean
}

export interface ToolStatus extends ToolLifecycleState {
  isPending: boolean
  isInterrupted: boolean
  isSuccess: boolean
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null
}

export function getToolLifecycleState(part: any): ToolLifecycleState {
  const state = typeof part?.state === "string" ? part.state : undefined
  const hasOutput = hasValue(part?.output)
  const hasResult = hasValue(part?.result)
  const isInputStreaming = state === "input-streaming"
  const isTerminalState =
    state === "output-available" ||
    state === "output-error" ||
    state === "result" ||
    state === "error"
  const isError =
    state === "output-error" ||
    state === "error" ||
    (hasOutput && part?.output?.success === false) ||
    (hasResult && part?.result?.success === false)
  const isTerminal = isTerminalState || hasOutput || hasResult

  return {
    isInputStreaming,
    isTerminal,
    isError,
    hasOutput,
    hasResult,
    isPendingState: !isInputStreaming && !isTerminal,
  }
}

export function getToolStatus(part: any, chatStatus?: string): ToolStatus {
  const lifecycle = getToolLifecycleState(part)
  const isActivelyStreaming =
    chatStatus === "streaming" || chatStatus === "submitted"
  const isInFlight = lifecycle.isInputStreaming || lifecycle.isPendingState

  return {
    ...lifecycle,
    isPending: isInFlight && isActivelyStreaming,
    isInterrupted: isInFlight && !isActivelyStreaming && chatStatus !== undefined,
    isSuccess: lifecycle.isTerminal && !lifecycle.isError,
  }
}

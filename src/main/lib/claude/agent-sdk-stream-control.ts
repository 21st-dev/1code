import { logClaudeOllamaStreamAborted } from "./agent-sdk-ollama-diagnostics"

export function shouldStopClaudeAgentSdkStreamForAbort(input: {
  signal: AbortSignal
  isUsingOllama: boolean
}): boolean {
  if (!input.signal.aborted) return false
  if (input.isUsingOllama) logClaudeOllamaStreamAborted()
  return true
}

export function shouldStopClaudeAgentSdkStreamForClosedObserver(input: {
  isActive: boolean
  subId: string
  log?: (...args: any[]) => void
}): boolean {
  if (input.isActive) return false
  const log = input.log ?? console.log
  log(`[SD] M:OBSERVER_CLOSED_STREAM sub=${input.subId}`)
  return true
}

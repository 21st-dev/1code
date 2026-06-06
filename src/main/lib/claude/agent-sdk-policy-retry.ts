import {
  CLAUDE_MAX_POLICY_RETRIES,
  getClaudePolicyRetryDelayMs,
} from "./agent-sdk-errors"

export type ClaudeAgentSdkPolicyRetryState = {
  count: number
  needed: boolean
}

export const CLAUDE_AGENT_SDK_POLICY_RETRY_LIMIT =
  CLAUDE_MAX_POLICY_RETRIES

export function createClaudeAgentSdkPolicyRetryState(): ClaudeAgentSdkPolicyRetryState {
  return {
    count: 0,
    needed: false,
  }
}

export function resetClaudeAgentSdkPolicyRetryAttempt(
  state: ClaudeAgentSdkPolicyRetryState,
): void {
  state.needed = false
}

export function recordClaudeAgentSdkPolicyRetry(input: {
  state: ClaudeAgentSdkPolicyRetryState
  log?: (...args: any[]) => void
}): ClaudeAgentSdkPolicyRetryState {
  const log = input.log ?? console.log
  input.state.count++
  input.state.needed = true
  log(
    `[claude] USAGE_POLICY_VIOLATION - silent retry (attempt ${input.state.count}/${CLAUDE_AGENT_SDK_POLICY_RETRY_LIMIT})`,
  )
  return input.state
}

export async function waitForClaudeAgentSdkPolicyRetry(input: {
  state: ClaudeAgentSdkPolicyRetryState
  sleep?: (delayMs: number) => Promise<unknown>
  log?: (...args: any[]) => void
}): Promise<boolean> {
  if (!input.state.needed) {
    return false
  }

  const sleep =
    input.sleep ??
    ((delayMs: number) => new Promise((resolve) => setTimeout(resolve, delayMs)))
  const log = input.log ?? console.log
  const delayMs = getClaudePolicyRetryDelayMs(input.state.count)
  log(
    `[claude] Policy retry ${input.state.count}/${CLAUDE_AGENT_SDK_POLICY_RETRY_LIMIT} - waiting ${delayMs / 1000}s`,
  )
  await sleep(delayMs)
  return true
}

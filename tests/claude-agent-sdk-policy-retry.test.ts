import { describe, expect, mock, test } from "bun:test"
import {
  CLAUDE_AGENT_SDK_POLICY_RETRY_LIMIT,
  createClaudeAgentSdkPolicyRetryState,
  recordClaudeAgentSdkPolicyRetry,
  resetClaudeAgentSdkPolicyRetryAttempt,
  waitForClaudeAgentSdkPolicyRetry,
} from "../src/main/lib/claude/agent-sdk-policy-retry"

function flattenedCalls(fn: unknown): string[] {
  return ((fn as { mock: { calls: unknown[][] } }).mock.calls ?? [])
    .flat()
    .map((item) => String(item))
}

describe("Claude Agent SDK policy retry", () => {
  test("records retry attempts and resets per adapter attempt", () => {
    const log = mock(() => {})
    const state = createClaudeAgentSdkPolicyRetryState()

    expect(state).toEqual({ count: 0, needed: false })
    recordClaudeAgentSdkPolicyRetry({ state, log })
    expect(state).toEqual({ count: 1, needed: true })
    expect(flattenedCalls(log)).toContain(
      `[claude] USAGE_POLICY_VIOLATION - silent retry (attempt 1/${CLAUDE_AGENT_SDK_POLICY_RETRY_LIMIT})`,
    )

    resetClaudeAgentSdkPolicyRetryAttempt(state)
    expect(state).toEqual({ count: 1, needed: false })
  })

  test("waits with escalating delay when retry is needed", async () => {
    const log = mock(() => {})
    const slept: number[] = []
    const state = createClaudeAgentSdkPolicyRetryState()

    expect(
      await waitForClaudeAgentSdkPolicyRetry({
        state,
        sleep: async (delayMs) => {
          slept.push(delayMs)
        },
        log,
      }),
    ).toBe(false)
    expect(slept).toEqual([])

    recordClaudeAgentSdkPolicyRetry({ state, log })
    expect(
      await waitForClaudeAgentSdkPolicyRetry({
        state,
        sleep: async (delayMs) => {
          slept.push(delayMs)
        },
        log,
      }),
    ).toBe(true)
    expect(slept).toEqual([3000])
    expect(flattenedCalls(log)).toContain(
      `[claude] Policy retry 1/${CLAUDE_AGENT_SDK_POLICY_RETRY_LIMIT} - waiting 3s`,
    )

    resetClaudeAgentSdkPolicyRetryAttempt(state)
    recordClaudeAgentSdkPolicyRetry({ state, log })
    expect(
      await waitForClaudeAgentSdkPolicyRetry({
        state,
        sleep: async (delayMs) => {
          slept.push(delayMs)
        },
        log,
      }),
    ).toBe(true)
    expect(slept).toEqual([3000, 6000])
  })
})

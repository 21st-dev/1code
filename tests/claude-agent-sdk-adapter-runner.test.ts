import { describe, expect, mock, test } from "bun:test"
import { resolveDesktopPermissionPolicy } from "../src/main/lib/agent-runtime/permission-policy"
import type { DesktopRunRequest } from "../src/main/lib/agent-runtime/desktop-run-request"
import type { DesktopRuntimeAdapter } from "../src/main/lib/agent-runtime/desktop-runner"
import {
  ClaudeAgentSdkLoadError,
  ClaudeAgentSdkQueryStartError,
} from "../src/main/lib/claude/agent-sdk-adapter"
import { runClaudeAgentSdkAdapterWithPolicyRetry } from "../src/main/lib/claude/agent-sdk-adapter-runner"
import {
  createClaudeAgentSdkPolicyRetryState,
  recordClaudeAgentSdkPolicyRetry,
} from "../src/main/lib/claude/agent-sdk-policy-retry"

function createRequest(): DesktopRunRequest {
  return {
    identity: { runId: "run-1", jobId: "job-1" },
    context: {
      runtimeId: "claude-code",
      mode: "agent",
      projectId: "project-1",
      chatId: "chat-1",
      subChatId: "sub-1",
      cwd: "/repo",
    },
    prompt: "hello",
    permissionPolicy: resolveDesktopPermissionPolicy({
      runtimeId: "claude-code",
      mode: "agent",
    }),
    providerBinding: {},
    mcp: { status: "skipped", serverNames: [], blockers: [] },
    attachments: [],
    trace: { emit: () => {} },
    signal: new AbortController().signal,
    session: {},
  }
}

function createAdapter(run: DesktopRuntimeAdapter["run"]): DesktopRuntimeAdapter {
  return {
    metadata: {
      runtimeId: "claude-code",
      source: "claude-agent-sdk",
      label: "Claude Agent SDK",
      temporaryFallback: false,
    },
    run,
  }
}

function flattenedCalls(fn: unknown): string[] {
  return ((fn as { mock: { calls: unknown[][] } }).mock.calls ?? [])
    .flat()
    .map((item) => String(item))
}

describe("Claude Agent SDK adapter runner", () => {
  test("retries adapter runs when the stream records a policy retry", async () => {
    const policyRetry = createClaudeAgentSdkPolicyRetryState()
    const beforeAttempts: string[] = []
    const slept: number[] = []
    const log = mock(() => {})
    let runs = 0
    const adapter = createAdapter(async () => {
      runs++
      if (runs === 1) {
        recordClaudeAgentSdkPolicyRetry({ state: policyRetry, log })
      }
      return { status: "succeeded" }
    })

    await expect(
      runClaudeAgentSdkAdapterWithPolicyRetry({
        adapter,
        request: createRequest(),
        policyRetry,
        beforeAttempt: () => beforeAttempts.push("attempt"),
        getChunkCount: () => 7,
        subId: "sub-1",
        emitError: () => {
          throw new Error("emitError should not run")
        },
        emit: () => {},
        complete: () => {},
        sleep: async (delayMs) => {
          slept.push(delayMs)
        },
        log,
      }),
    ).resolves.toEqual({ status: "succeeded" })

    expect(runs).toBe(2)
    expect(beforeAttempts).toEqual(["attempt", "attempt"])
    expect(slept).toEqual([3000])
    expect(flattenedCalls(log)).toContain(
      "[claude] Policy retry 1/2 - waiting 3s",
    )
  })

  test("handles SDK load failures at the route boundary", async () => {
    const policyRetry = createClaudeAgentSdkPolicyRetryState()
    const emitted: unknown[] = []
    const completed: string[] = []
    const errors: Array<{ error: unknown; context: string }> = []
    const log = mock(() => {})
    const adapter = createAdapter(async () => {
      throw new ClaudeAgentSdkLoadError(new Error("load failed"))
    })

    await expect(
      runClaudeAgentSdkAdapterWithPolicyRetry({
        adapter,
        request: createRequest(),
        policyRetry,
        beforeAttempt: () => {},
        getChunkCount: () => 3,
        subId: "sub-1",
        emitError: (error, context) => errors.push({ error, context }),
        emit: (chunk) => emitted.push(chunk),
        complete: () => completed.push("complete"),
        log,
      }),
    ).resolves.toMatchObject({ status: "failed" })

    expect(errors).toHaveLength(1)
    expect(errors[0].context).toBe("Failed to load Claude Agent SDK")
    expect(emitted).toEqual([{ type: "finish" }])
    expect(completed).toEqual(["complete"])
    expect(flattenedCalls(log)).toContain(
      "[SD] M:END sub=sub-1 reason=sdk_load_error n=3",
    )
  })

  test("handles SDK query startup failures at the route boundary", async () => {
    const policyRetry = createClaudeAgentSdkPolicyRetryState()
    const emitted: unknown[] = []
    const completed: string[] = []
    const errors: Array<{ error: unknown; context: string }> = []
    const log = mock(() => {})
    const error = mock(() => {})
    const adapter = createAdapter(async () => {
      throw new ClaudeAgentSdkQueryStartError(new Error("query failed"))
    })

    await expect(
      runClaudeAgentSdkAdapterWithPolicyRetry({
        adapter,
        request: createRequest(),
        policyRetry,
        beforeAttempt: () => {},
        getChunkCount: () => 4,
        subId: "sub-2",
        emitError: (emittedError, context) =>
          errors.push({ error: emittedError, context }),
        emit: (chunk) => emitted.push(chunk),
        complete: () => completed.push("complete"),
        log,
        error,
      }),
    ).resolves.toMatchObject({ status: "failed" })

    expect(errors).toHaveLength(1)
    expect(errors[0].context).toBe("Failed to start Claude query")
    expect(emitted).toEqual([{ type: "finish" }])
    expect(completed).toEqual(["complete"])
    expect(flattenedCalls(log)).toContain(
      "[SD] M:END sub=sub-2 reason=query_error n=4",
    )
    expect(flattenedCalls(error)).toContain(
      "[CLAUDE] ✗ Failed to create SDK query:",
    )
  })
})

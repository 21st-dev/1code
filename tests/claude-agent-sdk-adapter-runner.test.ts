import { describe, expect, mock, test } from "bun:test"
import { resolveDesktopPermissionPolicy } from "../src/main/lib/agent-runtime/permission-policy"
import type { DesktopRunRequest } from "../src/main/lib/agent-runtime/desktop-run-request"
import type { DesktopRuntimeAdapter } from "../src/main/lib/agent-runtime/desktop-runner"
import {
  ClaudeAgentSdkLoadError,
  ClaudeAgentSdkQueryStartError,
} from "../src/main/lib/claude/agent-sdk-adapter"
import {
  resolveClaudeAgentSdkDesktopAdapter,
  runClaudeAgentSdkAdapterWithPolicyRetry,
  runClaudeAgentSdkDesktopAdapter,
  runClaudeAgentSdkDesktopAdapterWithPreparedRuntimeQuery,
  runClaudeAgentSdkDesktopAdapterWithRuntimeConsumer,
} from "../src/main/lib/claude/agent-sdk-adapter-runner"
import {
  createClaudeAgentSdkPolicyRetryState,
  recordClaudeAgentSdkPolicyRetry,
} from "../src/main/lib/claude/agent-sdk-policy-retry"
import {
  createClaudeAgentSdkStreamConsumerMutableState,
} from "../src/main/lib/claude/agent-sdk-stream-consumer"
import type { UIMessageChunk } from "../src/main/lib/claude/types"

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
    providerBinding: {
      model: "claude-from-request",
      gatewayEndpoint: "https://provider.example.com",
    },
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

async function* createStream() {
  yield { type: "assistant", text: "hello" }
}

async function* createClaudeAssistantStream() {
  yield {
    type: "assistant",
    uuid: "assistant-1",
    session_id: "session-1",
  }
}

describe("Claude Agent SDK adapter runner", () => {
  test("resolves the Claude Agent SDK adapter through the desktop factory", () => {
    const request = createRequest()
    const adapter = createAdapter(async () => ({ status: "succeeded" }))

    expect(
      resolveClaudeAgentSdkDesktopAdapter({ adapter, request }),
    ).toBe(adapter)

    expect(() =>
      resolveClaudeAgentSdkDesktopAdapter({
        adapter,
        request: {
          ...request,
          context: { ...request.context, runtimeId: "codex" },
        },
      }),
    ).toThrow(
      "Desktop runtime adapter not registered: codex:claude-agent-sdk",
    )
  })

  test("creates the current Claude Agent SDK adapter before the policy retry loop", async () => {
    const request = createRequest()
    const policyRetry = createClaudeAgentSdkPolicyRetryState()
    const queryOptions = { prompt: "hello", options: {} } as any
    const queryCalls: unknown[] = []
    const consumedMessages: unknown[] = []
    const beforeAttempts: string[] = []
    const consumedRequests: DesktopRunRequest[] = []
    const resolveAdapter = mock(({ adapter }) => adapter)

    await expect(
      runClaudeAgentSdkDesktopAdapter({
        query: ((params: any) => {
          queryCalls.push(params)
          return createStream()
        }) as any,
        request,
        queryOptions,
        consumeStream: async ({ request: consumedRequest, stream }) => {
          consumedRequests.push(consumedRequest)
          for await (const message of stream) {
            consumedMessages.push(message)
          }
          return { status: "succeeded" }
        },
        resolveAdapter,
        policyRetry,
        beforeAttempt: () => beforeAttempts.push("attempt"),
        getChunkCount: () => consumedMessages.length,
        subId: "sub-1",
        emitError: () => {
          throw new Error("emitError should not run")
        },
        emit: () => {},
        complete: () => {},
      }),
    ).resolves.toEqual({ status: "succeeded" })

    expect(resolveAdapter).toHaveBeenCalledTimes(1)
    expect(resolveAdapter.mock.calls[0][0]).toMatchObject({
      request,
      adapter: {
        metadata: {
          runtimeId: "claude-code",
          source: "claude-agent-sdk",
          temporaryFallback: false,
        },
      },
    })
    expect(queryCalls).toEqual([queryOptions])
    expect(consumedRequests).toHaveLength(1)
    expect(consumedRequests[0]).not.toBe(request)
    expect(consumedRequests[0]).toMatchObject({
      identity: { runId: "run-1", jobId: "job-1", attempt: 1 },
      context: request.context,
    })
    expect(request.identity).toEqual({ runId: "run-1", jobId: "job-1" })
    expect(consumedMessages).toEqual([{ type: "assistant", text: "hello" }])
    expect(beforeAttempts).toEqual(["attempt"])
  })

  test("runs the current adapter with owned runtime stream consumer wiring", async () => {
    const request = createRequest()
    const queryOptions = { prompt: "hello", options: {} } as any
    const streamState = createClaudeAgentSdkStreamConsumerMutableState({
      messageCount: 5,
      pendingFinishChunk: { type: "finish" },
    })
    const queryCalls: unknown[] = []
    const emitted: UIMessageChunk[] = []

    await expect(
      runClaudeAgentSdkDesktopAdapterWithRuntimeConsumer({
        query: ((params: any) => {
          queryCalls.push(params)
          return createClaudeAssistantStream()
        }) as any,
        request,
        queryOptions,
        streamState,
        isUsingOllama: false,
        isObservableActive: () => true,
        customConfig: null,
        hasExistingApiConfig: false,
        resolvedModel: "claude-sonnet",
        oauthToken: null,
        mcpServers: undefined,
        transform: () => [
          { type: "text-delta", id: "text-1", delta: "hello" },
          { type: "text-end", id: "text-1" },
        ],
        parts: [],
        historyEnabled: true,
        stderrLines: [],
        db: null,
        messagesToSave: [],
        guardedContract: null,
        guardedPreRunStatus: null,
        guardEvents: [],
        guardedRunStartedAt: "2026-06-01T00:00:00.000Z",
        getContract: () => null,
        deleteContract: () => undefined,
        subId: "sub-1",
        emitError: () => {
          throw new Error("emitError should not run")
        },
        emit: (chunk) => {
          emitted.push(chunk)
          return true
        },
        complete: () => {},
      }),
    ).resolves.toEqual({ status: "succeeded" })

    expect(queryCalls).toEqual([queryOptions])
    expect(emitted).toEqual([
      { type: "text-delta", id: "text-1", delta: "hello" },
      { type: "text-end", id: "text-1" },
    ])
    expect(streamState).toMatchObject({
      metadata: { sessionId: "session-1" },
      currentSessionId: "session-1",
      currentText: "",
      chunkCount: 2,
      lastChunkType: "text-end",
      messageCount: 1,
      pendingFinishChunk: null,
    })
  })

  test("runs a prepared runtime query through owned adapter wiring", async () => {
    const request = createRequest()
    const queryOptions = { prompt: "prepared", options: {} } as any
    const streamState = createClaudeAgentSdkStreamConsumerMutableState()
    const queryCalls: unknown[] = []
    const emitted: UIMessageChunk[] = []

    await expect(
      runClaudeAgentSdkDesktopAdapterWithPreparedRuntimeQuery({
        query: ((params: any) => {
          queryCalls.push(params)
          return createClaudeAssistantStream()
        }) as any,
        request,
        runtimeQuery: {
          queryOptions,
          mcpServers: {
            github: { type: "http", url: "https://mcp.example.com" },
          } as any,
        },
        streamState,
        isUsingOllama: false,
        isObservableActive: () => true,
        customConfig: null,
        hasExistingApiConfig: false,
        resolvedModel: "claude-sonnet",
        oauthToken: null,
        transform: () => [
          { type: "text-delta", id: "text-1", delta: "prepared" },
          { type: "text-end", id: "text-1" },
        ],
        parts: [],
        historyEnabled: true,
        stderrLines: [],
        db: null,
        messagesToSave: [],
        guardedContract: null,
        guardedPreRunStatus: null,
        guardEvents: [],
        guardedRunStartedAt: "2026-06-01T00:00:00.000Z",
        getContract: () => null,
        deleteContract: () => undefined,
        subId: "sub-1",
        emitError: () => {
          throw new Error("emitError should not run")
        },
        emit: (chunk) => {
          emitted.push(chunk)
          return true
        },
        complete: () => {},
      }),
    ).resolves.toEqual({ status: "succeeded" })

    expect(queryCalls).toEqual([queryOptions])
    expect(emitted).toEqual([
      { type: "text-delta", id: "text-1", delta: "prepared" },
      { type: "text-end", id: "text-1" },
    ])
    expect(streamState.currentSessionId).toBe("session-1")
  })

  test("retries adapter runs when the stream records a policy retry", async () => {
    const policyRetry = createClaudeAgentSdkPolicyRetryState()
    const beforeAttempts: string[] = []
    const slept: number[] = []
    const log = mock(() => {})
    let runs = 0
    const attempts: Array<number | null | undefined> = []
    const adapter = createAdapter(async (request) => {
      attempts.push(request.identity.attempt)
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
    expect(attempts).toEqual([1, 2])
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

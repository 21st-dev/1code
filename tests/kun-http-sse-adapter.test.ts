import { describe, expect, test } from "bun:test"
import { setTimeout as sleep } from "node:timers/promises"
import { createKunDesktopRunRequest } from "../src/main/lib/kun/desktop-run-request"
import { createKunHttpSseAdapter } from "../src/main/lib/kun/kun-http-sse-adapter"
import { resolveDesktopPermissionPolicy } from "../src/main/lib/agent-runtime/permission-policy"

function fakeKunRequest(signal = new AbortController().signal) {
  return createKunDesktopRunRequest({
    runId: "run-1",
    jobId: "job-1",
    mode: "agent",
    preflight: {
      kind: "project",
      cwd: "/repo",
      chat: { id: "chat-1" },
      subChat: { id: "sub-1" },
      project: { id: "project-1" },
    } as any,
    prompt: "hello",
    permissionPolicy: resolveDesktopPermissionPolicy({
      runtimeId: "kun",
      mode: "agent",
    }),
    signal,
    emitTrace: () => {},
  })
}

async function waitFor(predicate: () => boolean) {
  for (let i = 0; i < 50; i += 1) {
    if (predicate()) return
    await sleep(1)
  }
  throw new Error("condition was not met")
}

describe("Kun HTTP/SSE adapter", () => {
  test("correlates approval to tool_call and posts allow after UI approval", async () => {
    const emitted: Record<string, unknown>[] = []
    const decisions: Array<{ approvalId: string; decision: string }> = []
    const adapter = createKunHttpSseAdapter({
      emit: (chunk) => emitted.push(chunk),
      registerPendingApproval: (_toolUseId, pending) => {
        pending.resolve({ approved: true, message: "ok" })
      },
      createTransport: async () => ({
        transport: {
          async createThread() {
            return { id: "thread-1" }
          },
          async startTurn() {
            return { threadId: "thread-1", turnId: "turn-1" }
          },
          async interruptTurn() {},
          async decideApproval(input) {
            decisions.push({
              approvalId: input.approvalId,
              decision: input.decision,
            })
          },
          async streamEvents(input) {
            input.onEvent({
              kind: "item_created",
              item: {
                kind: "tool_call",
                callId: "call_1",
                toolName: "edit",
                toolKind: "file_change",
                summary: "Edit a file",
              },
            })
            input.onEvent({
              kind: "approval_requested",
              approvalId: "appr_call_1",
              toolName: "edit",
              status: "pending",
            })
            await waitFor(() => decisions.length === 1)
            input.onEvent({ kind: "turn_completed" })
          },
        },
      }),
    })

    const result = await adapter.run(fakeKunRequest())

    expect(result.status).toBe("succeeded")
    expect(decisions).toEqual([
      { approvalId: "appr_call_1", decision: "allow" },
    ])
    expect(emitted).toContainEqual(
      expect.objectContaining({
        type: "ask-user-question",
        toolUseId: "kun-approval-run-1-appr_call_1",
      }),
    )
    expect(emitted).toContainEqual(
      expect.objectContaining({
        type: "observed-tool-decision",
        decision: "allow",
      }),
    )
  })

  test("denies command_execution approvals and reports unknown events once", async () => {
    const emitted: Record<string, unknown>[] = []
    const decisions: Array<{ approvalId: string; decision: string; reason?: string | null }> = []
    const adapter = createKunHttpSseAdapter({
      emit: (chunk) => emitted.push(chunk),
      createTransport: async () => ({
        transport: {
          async createThread() {
            return { id: "thread-1" }
          },
          async startTurn() {
            return { threadId: "thread-1", turnId: "turn-1" }
          },
          async interruptTurn() {},
          async decideApproval(input) {
            decisions.push({
              approvalId: input.approvalId,
              decision: input.decision,
              reason: input.reason,
            })
          },
          async streamEvents(input) {
            input.onEvent({ kind: "future_new_event" })
            input.onEvent({ kind: "future_new_event" })
            input.onEvent({
              kind: "item_created",
              item: {
                kind: "tool_call",
                callId: "call_2",
                toolName: "bash",
                toolKind: "command_execution",
              },
            })
            input.onEvent({
              kind: "approval_requested",
              approvalId: "appr_call_2",
              toolName: "bash",
              status: "pending",
            })
            await waitFor(() => decisions.length === 1)
            input.onEvent({ kind: "turn_completed" })
          },
        },
      }),
    })

    const result = await adapter.run(fakeKunRequest())

    expect(result.status).toBe("succeeded")
    expect(decisions).toEqual([
      expect.objectContaining({
        approvalId: "appr_call_2",
        decision: "deny",
        reason: expect.stringContaining("command_execution"),
      }),
    ])
    expect(
      emitted.filter(
        (chunk) =>
          chunk.type === "runtime-status" &&
          (chunk.blocker as any)?.code === "kun-unsupported-event",
      ),
    ).toHaveLength(1)
  })

  test("denies file_change when approval is denied by the UI bridge", async () => {
    const emitted: Record<string, unknown>[] = []
    const decisions: Array<{ approvalId: string; decision: string; reason?: string | null }> = []
    const adapter = createKunHttpSseAdapter({
      emit: (chunk) => emitted.push(chunk),
      registerPendingApproval: (_toolUseId, pending) => {
        pending.resolve({ approved: false, message: "user denied" })
      },
      createTransport: async () => ({
        transport: {
          async createThread() {
            return { id: "thread-1" }
          },
          async startTurn() {
            return { threadId: "thread-1", turnId: "turn-1" }
          },
          async interruptTurn() {},
          async decideApproval(input) {
            decisions.push({
              approvalId: input.approvalId,
              decision: input.decision,
              reason: input.reason,
            })
          },
          async streamEvents(input) {
            input.onEvent({
              kind: "item_created",
              item: {
                kind: "tool_call",
                callId: "call_3",
                toolName: "edit",
                toolKind: "file_change",
                summary: "Edit a file",
              },
            })
            input.onEvent({
              kind: "approval_requested",
              approvalId: "appr_call_3",
              toolName: "edit",
              status: "pending",
            })
            await waitFor(() => decisions.length === 1)
            input.onEvent({ kind: "turn_completed" })
          },
        },
      }),
    })

    const result = await adapter.run(fakeKunRequest())

    expect(result.status).toBe("succeeded")
    expect(decisions).toEqual([
      { approvalId: "appr_call_3", decision: "deny", reason: "user denied" },
    ])
    expect(emitted).toContainEqual(
      expect.objectContaining({
        type: "observed-tool-decision",
        decision: "deny",
        message: "user denied",
      }),
    )
    expect(JSON.stringify(emitted)).not.toContain('"decision":"allow"')
  })

  test("missing approval bridge fails closed by timeout", async () => {
    const decisions: Array<{ approvalId: string; decision: string; reason?: string | null }> = []
    const adapter = createKunHttpSseAdapter({
      approvalTimeoutMs: 1,
      createTransport: async () => ({
        transport: {
          async createThread() {
            return { id: "thread-1" }
          },
          async startTurn() {
            return { threadId: "thread-1", turnId: "turn-1" }
          },
          async interruptTurn() {},
          async decideApproval(input) {
            decisions.push({
              approvalId: input.approvalId,
              decision: input.decision,
              reason: input.reason,
            })
          },
          async streamEvents(input) {
            input.onEvent({
              kind: "item_created",
              item: {
                kind: "tool_call",
                callId: "call_4",
                toolName: "edit",
                toolKind: "file_change",
              },
            })
            input.onEvent({
              kind: "approval_requested",
              approvalId: "appr_call_4",
              toolName: "edit",
              status: "pending",
            })
            await waitFor(() => decisions.length === 1)
            input.onEvent({ kind: "turn_completed" })
          },
        },
      }),
    })

    const result = await adapter.run(fakeKunRequest())

    expect(result.status).toBe("succeeded")
    expect(decisions).toEqual([
      {
        approvalId: "appr_call_4",
        decision: "deny",
        reason: "Kun approval request timed out.",
      },
    ])
  })

  test("redacts transport secret hints before emitting renderer chunks", async () => {
    const emitted: Record<string, unknown>[] = []
    const token = "runtime-token-secret-value"
    const adapter = createKunHttpSseAdapter({
      emit: (chunk) => emitted.push(chunk),
      createTransport: async () => ({
        secretHints: [token],
        transport: {
          async createThread() {
            throw new Error(`Kun failed with ${token}`)
          },
          async startTurn() {
            throw new Error("should not start turn")
          },
          async interruptTurn() {},
          async decideApproval() {},
          async streamEvents() {},
        },
      }),
    })

    const result = await adapter.run(fakeKunRequest())

    expect(result.status).toBe("failed")
    expect(JSON.stringify(emitted)).not.toContain(token)
    expect(emitted).toContainEqual(
      expect.objectContaining({
        type: "error",
        errorText: "Kun failed with <redacted>",
      }),
    )
  })

  test("treats sampled Kun pipeline and error events as known before turn_failed", async () => {
    const emitted: Record<string, unknown>[] = []
    const adapter = createKunHttpSseAdapter({
      emit: (chunk) => emitted.push(chunk),
      createTransport: async () => ({
        transport: {
          async createThread() {
            return { id: "thread-1" }
          },
          async startTurn() {
            return { threadId: "thread-1", turnId: "turn-1" }
          },
          async interruptTurn() {},
          async decideApproval() {},
          async streamEvents(input) {
            input.onEvent({ kind: "thread_created", seq: 1 })
            input.onEvent({ kind: "turn_started", seq: 2 })
            input.onEvent({
              kind: "pipeline_stage",
              seq: 3,
              stage: "pre_send",
              details: {
                endpointFormat: "chat_completions",
              },
            })
            input.onEvent({
              kind: "error",
              seq: 4,
              message: "model request failed with status 401",
              code: "http_401",
            })
            input.onEvent({
              kind: "assistant_text_delta",
              seq: 5,
              itemId: "item_text_1",
              text: "partial text",
            })
            input.onEvent({
              kind: "turn_failed",
              seq: 6,
              message: "model request failed with status 401",
              code: "http_401",
            })
          },
        },
      }),
    })

    const result = await adapter.run(fakeKunRequest())

    expect(result).toMatchObject({
      status: "failed",
      error: { message: "model request failed with status 401" },
    })
    expect(
      emitted.filter((chunk) => {
        const blocker = chunk.blocker
        return (
          chunk.type === "runtime-status" &&
          typeof blocker === "object" &&
          blocker !== null &&
          "code" in blocker &&
          blocker.code === "kun-unsupported-event"
        )
      }),
    ).toHaveLength(0)
    expect(emitted).toContainEqual(
      expect.objectContaining({
        type: "text-delta",
        delta: "partial text",
      }),
    )
  })
})

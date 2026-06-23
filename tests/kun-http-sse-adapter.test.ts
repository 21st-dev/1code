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
})

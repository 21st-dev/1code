import { describe, expect, test } from "bun:test"
import { EventEmitter } from "node:events"
import { createServer } from "node:http"
import { setTimeout as sleep } from "node:timers/promises"
import type { ValidatedAgentScopeContract } from "../src/main/lib/agent-guard"
import type { DesktopRunProviderBinding } from "../src/main/lib/agent-runtime/desktop-run-request"
import { resolveDesktopPermissionPolicy } from "../src/main/lib/agent-runtime/permission-policy"
import type { RunEvent } from "../src/main/lib/agent-runtime/runtime-events"
import { createKunDesktopRunRequest } from "../src/main/lib/kun/desktop-run-request"
import {
  createKunHttpSseAdapter,
  type KunHttpSseApprovalPending,
} from "../src/main/lib/kun/kun-http-sse-adapter"
import type { KunServeHandle } from "../src/main/lib/kun/kun-serve-launcher"

type KunDesktopRunRequestInput = Parameters<
  typeof createKunDesktopRunRequest
>[0]

function guardedContract(): ValidatedAgentScopeContract {
  return {
    id: "contract-kun-shell",
    version: 1,
    status: "approved",
    createdAt: "2026-06-24T00:00:00.000Z",
    approvedAt: "2026-06-24T00:00:01.000Z",
    source: "manual",
    chatId: "chat-1",
    subChatId: "sub-1",
    runId: "run-1",
    cwd: "/repo",
    editableScope: [{ path: "src", kind: "directory" }],
    readOnlyEvidence: [],
    successChecks: [{ command: "bun test" }],
    blockedPaths: [],
    expansions: [],
  }
}

function fakeKunRequest(
  signal = new AbortController().signal,
  options: {
    hasScopeContract?: boolean
    providerBinding?: Omit<DesktopRunProviderBinding, "diagnostics">
    traceEvents?: RunEvent[]
  } = {},
) {
  const preflight: KunDesktopRunRequestInput["preflight"] = {
    kind: "project",
    cwd: "/repo",
    chat: { id: "chat-1" },
    subChat: { id: "sub-1" },
    project: { id: "project-1" },
  }
  return createKunDesktopRunRequest({
    runId: "run-1",
    jobId: "job-1",
    mode: "agent",
    preflight,
    prompt: "hello",
    permissionPolicy: resolveDesktopPermissionPolicy({
      runtimeId: "kun",
      mode: "agent",
      hasScopeContract: options.hasScopeContract,
    }),
    providerBinding: options.providerBinding,
    signal,
    emitTrace: (event) => {
      options.traceEvents?.push(event)
    },
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
  test("uses Kun ready model for BYO config without overriding turn model", async () => {
    const calls: Array<{
      kind: "createThread" | "startTurn"
      model?: string | null
    }> = []
    const adapter = createKunHttpSseAdapter({
      createTransport: async () => ({
        ready: { model: "deepseek-v4-flash" },
        transport: {
          async createThread(input) {
            calls.push({ kind: "createThread", model: input.model })
            return { id: "thread-1" }
          },
          async startTurn(input) {
            calls.push({ kind: "startTurn", model: input.model })
            return { threadId: "thread-1", turnId: "turn-1" }
          },
          async interruptTurn() {},
          async decideApproval() {},
          async streamEvents(input) {
            await waitFor(() => calls.some((call) => call.kind === "startTurn"))
            input.onEvent({ kind: "turn_completed" })
          },
        },
      }),
    })

    const result = await adapter.run(fakeKunRequest())

    expect(result.status).toBe("succeeded")
    expect(calls).toEqual([
      { kind: "createThread", model: "deepseek-v4-flash" },
      { kind: "startTurn", model: null },
    ])
  })

  test("uses provider profile model for thread and turn overrides", async () => {
    const calls: Array<{
      kind: "createThread" | "startTurn"
      model?: string | null
    }> = []
    const adapter = createKunHttpSseAdapter({
      createTransport: async () => ({
        ready: { model: "deepseek-v4-flash" },
        transport: {
          async createThread(input) {
            calls.push({ kind: "createThread", model: input.model })
            return { id: "thread-1" }
          },
          async startTurn(input) {
            calls.push({ kind: "startTurn", model: input.model })
            return { threadId: "thread-1", turnId: "turn-1" }
          },
          async interruptTurn() {},
          async decideApproval() {},
          async streamEvents(input) {
            await waitFor(() => calls.some((call) => call.kind === "startTurn"))
            input.onEvent({ kind: "turn_completed" })
          },
        },
      }),
    })

    const result = await adapter.run(
      fakeKunRequest(new AbortController().signal, {
        providerBinding: {
          model: "deepseek-v4-pro",
          modelSource: "provider-profile:profile-1",
          providerProfileId: "profile-1",
          gatewayEndpoint: "http://127.0.0.1:4000/v1",
          authMode: "provider-profile",
        },
      }),
    )

    expect(result.status).toBe("succeeded")
    expect(calls).toEqual([
      { kind: "createThread", model: "deepseek-v4-pro" },
      { kind: "startTurn", model: "deepseek-v4-pro" },
    ])
  })

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
    const decisions: Array<{
      approvalId: string
      decision: string
      reason?: string | null
    }> = []
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
    ).toHaveLength(1)
  })

  test("routes shell-enabled command_execution approvals through the canonical guard owner", async () => {
    const emitted: Record<string, unknown>[] = []
    const traceEvents: RunEvent[] = []
    const decisions: Array<{
      approvalId: string
      decision: string
      reason?: string | null
    }> = []
    const adapter = createKunHttpSseAdapter({
      shellEnabled: true,
      guardedContract: guardedContract(),
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
            input.onEvent({
              kind: "item_created",
              item: {
                kind: "tool_call",
                callId: "call_shell_guarded",
                toolName: "bash",
                toolKind: "command_execution",
                input: { command: "ls src" },
              },
            })
            input.onEvent({
              kind: "approval_requested",
              approvalId: "appr_call_shell_guarded",
              toolName: "bash",
              status: "pending",
            })
            await waitFor(() => decisions.length === 1)
            input.onEvent({
              kind: "tool_call_started",
              callId: "call_shell_guarded",
            })
            input.onEvent({ kind: "turn_completed" })
          },
        },
      }),
    })

    const result = await adapter.run(
      fakeKunRequest(new AbortController().signal, {
        hasScopeContract: true,
        traceEvents,
      }),
    )

    expect(result.status).toBe("succeeded")
    expect(decisions).toEqual([
      expect.objectContaining({
        approvalId: "appr_call_shell_guarded",
        decision: "allow",
        reason: "Bash command is a read-only inspection command.",
      }),
    ])
    expect(emitted).toContainEqual(
      expect.objectContaining({
        type: "observed-tool-decision",
        decision: "allow",
        risk: expect.objectContaining({
          guardOwner: true,
          toolKind: "command_execution",
        }),
      }),
    )
    expect(traceEvents).toContainEqual(
      expect.objectContaining({
        type: "guard_decision",
        payload: expect.objectContaining({
          type: "allowed",
          toolName: "Bash",
          command: "ls src",
        }),
      }),
    )
  })

  test("requires user approval for bounded scoped shell file operations", async () => {
    const emitted: Record<string, unknown>[] = []
    const decisions: Array<{
      approvalId: string
      decision: string
      reason?: string | null
    }> = []
    const adapter = createKunHttpSseAdapter({
      shellEnabled: true,
      guardedContract: guardedContract(),
      emit: (chunk) => emitted.push(chunk),
      registerPendingApproval: (_toolUseId, pending) => {
        pending.resolve({
          approved: true,
          message: "user approved scoped shell",
        })
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
                callId: "call_scoped_shell_write",
                toolName: "bash",
                toolKind: "command_execution",
                input: {
                  command:
                    "/bin/zsh -lc \"mkdir -p /repo/src && printf 'hello' > /repo/src/generated.txt\"",
                },
              },
            })
            input.onEvent({
              kind: "approval_requested",
              approvalId: "appr_call_scoped_shell_write",
              toolName: "bash",
              status: "pending",
            })
            await waitFor(() => decisions.length === 1)
            input.onEvent({ kind: "turn_completed" })
          },
        },
      }),
    })

    const result = await adapter.run(
      fakeKunRequest(new AbortController().signal, {
        hasScopeContract: true,
      }),
    )

    expect(result.status).toBe("succeeded")
    expect(decisions).toEqual([
      expect.objectContaining({
        approvalId: "appr_call_scoped_shell_write",
        decision: "allow",
        reason: "user approved scoped shell",
      }),
    ])
    expect(emitted).toContainEqual(
      expect.objectContaining({
        type: "ask-user-question",
        toolUseId: "kun-approval-run-1-appr_call_scoped_shell_write",
      }),
    )
    expect(emitted).toContainEqual(
      expect.objectContaining({
        type: "guard-event",
        event: expect.objectContaining({
          type: "allowed",
          toolName: "Bash",
          paths: ["src", "src/generated.txt"],
        }),
      }),
    )
  })

  test("normalizes Kun file_change paths through the guard owner", async () => {
    const emitted: Record<string, unknown>[] = []
    const decisions: Array<{
      approvalId: string
      decision: string
      reason?: string | null
    }> = []
    const adapter = createKunHttpSseAdapter({
      shellEnabled: true,
      guardedContract: guardedContract(),
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
            input.onEvent({
              kind: "item_created",
              item: {
                kind: "tool_call",
                callId: "call_sensitive_write",
                toolName: "edit",
                toolKind: "file_change",
                input: { path: "/repo/.env" },
              },
            })
            input.onEvent({
              kind: "approval_requested",
              approvalId: "appr_call_sensitive_write",
              toolName: "edit",
              status: "pending",
            })
            await waitFor(() => decisions.length === 1)
            input.onEvent({
              kind: "item_created",
              item: {
                kind: "tool_call",
                callId: "call_scope_expansion",
                toolName: "edit",
                toolKind: "file_change",
                input: { path: "/repo/docs/readme.md" },
              },
            })
            input.onEvent({
              kind: "approval_requested",
              approvalId: "appr_call_scope_expansion",
              toolName: "edit",
              status: "pending",
            })
            await waitFor(() => decisions.length === 2)
            input.onEvent({
              kind: "item_created",
              item: {
                kind: "tool_call",
                callId: "call_missing_path",
                toolName: "edit",
                toolKind: "file_change",
                input: {},
              },
            })
            input.onEvent({
              kind: "approval_requested",
              approvalId: "appr_call_missing_path",
              toolName: "edit",
              status: "pending",
            })
            await waitFor(() => decisions.length === 3)
            input.onEvent({
              kind: "item_created",
              item: {
                kind: "tool_call",
                callId: "call_in_scope_write",
                toolName: "edit",
                toolKind: "file_change",
                input: { path: "/repo/src/app.ts" },
              },
            })
            input.onEvent({
              kind: "approval_requested",
              approvalId: "appr_call_in_scope_write",
              toolName: "edit",
              status: "pending",
            })
            await waitFor(() => decisions.length === 4)
            input.onEvent({ kind: "turn_completed" })
          },
        },
      }),
    })

    const result = await adapter.run(
      fakeKunRequest(new AbortController().signal, {
        hasScopeContract: true,
      }),
    )

    expect(result.status).toBe("succeeded")
    expect(decisions).toEqual([
      expect.objectContaining({
        approvalId: "appr_call_sensitive_write",
        decision: "deny",
        reason: expect.stringContaining("protected path"),
      }),
      expect.objectContaining({
        approvalId: "appr_call_scope_expansion",
        decision: "deny",
        reason: expect.stringContaining("requires approval"),
      }),
      expect.objectContaining({
        approvalId: "appr_call_missing_path",
        decision: "deny",
        reason: expect.stringContaining("could not be normalized"),
      }),
      expect.objectContaining({
        approvalId: "appr_call_in_scope_write",
        decision: "allow",
        reason: expect.stringContaining("approved editable scope"),
      }),
    ])
    expect(emitted).toContainEqual(
      expect.objectContaining({
        type: "guard-event",
        event: expect.objectContaining({
          type: "blocked",
          toolName: "Edit",
          paths: [".env"],
        }),
      }),
    )
    expect(emitted).toContainEqual(
      expect.objectContaining({
        type: "guard-event",
        event: expect.objectContaining({
          type: "scope-expansion-request",
          toolName: "Edit",
          path: "docs/readme.md",
        }),
      }),
    )
  })

  test("denies shell-enabled side effects when the guarded contract is missing", async () => {
    const decisions: Array<{
      approvalId: string
      decision: string
      reason?: string | null
    }> = []
    const adapter = createKunHttpSseAdapter({
      shellEnabled: true,
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
                callId: "call_shell_no_contract",
                toolName: "bash",
                toolKind: "command_execution",
                input: { command: "ls src" },
              },
            })
            input.onEvent({
              kind: "approval_requested",
              approvalId: "appr_call_shell_no_contract",
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
        approvalId: "appr_call_shell_no_contract",
        decision: "deny",
        reason: expect.stringContaining("guarded scope contract"),
      }),
    ])
  })

  test("fails closed when a side-effecting tool executes without prior guard approval", async () => {
    const emitted: Record<string, unknown>[] = []
    const adapter = createKunHttpSseAdapter({
      shellEnabled: true,
      guardedContract: guardedContract(),
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
            input.onEvent({
              kind: "item_created",
              item: {
                kind: "tool_call",
                callId: "call_unapproved_execution",
                toolName: "bash",
                toolKind: "command_execution",
                input: { command: "ls src" },
              },
            })
            input.onEvent({
              kind: "tool_call_started",
              callId: "call_unapproved_execution",
            })
            input.onEvent({ kind: "turn_completed" })
          },
        },
      }),
    })

    const result = await adapter.run(
      fakeKunRequest(new AbortController().signal, {
        hasScopeContract: true,
      }),
    )

    expect(result).toMatchObject({
      status: "failed",
      error: {
        message: expect.stringContaining(
          "without a prior approved guard decision",
        ),
      },
    })
    expect(emitted).toContainEqual(
      expect.objectContaining({
        type: "runtime-status",
        ok: false,
        blocker: expect.objectContaining({
          code: "kun-unguarded-side-effect",
        }),
      }),
    )
  })

  test("denies file_change when approval is denied by the UI bridge", async () => {
    const emitted: Record<string, unknown>[] = []
    const decisions: Array<{
      approvalId: string
      decision: string
      reason?: string | null
    }> = []
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

  test("posts external approval denials with a cleanup signal after run abort", async () => {
    const runAbort = new AbortController()
    let pendingApproval: KunHttpSseApprovalPending | null = null
    const decisions: Array<{
      approvalId: string
      decision: string
      reason?: string | null
      signalAborted: boolean
    }> = []
    const interruptSignals: boolean[] = []
    const adapter = createKunHttpSseAdapter({
      registerPendingApproval: (_toolUseId, pending) => {
        pendingApproval = pending
      },
      createTransport: async () => ({
        transport: {
          async createThread() {
            return { id: "thread-1" }
          },
          async startTurn() {
            return { threadId: "thread-1", turnId: "turn-1" }
          },
          async interruptTurn(input) {
            interruptSignals.push(input.signal.aborted)
          },
          async decideApproval(input) {
            decisions.push({
              approvalId: input.approvalId,
              decision: input.decision,
              reason: input.reason,
              signalAborted: input.signal.aborted,
            })
          },
          async streamEvents(input) {
            input.onEvent({
              kind: "item_created",
              item: {
                kind: "tool_call",
                callId: "call_5",
                toolName: "edit",
                toolKind: "file_change",
              },
            })
            input.onEvent({
              kind: "approval_requested",
              approvalId: "appr_call_5",
              toolName: "edit",
              status: "pending",
            })
            await waitFor(() => Boolean(pendingApproval))
            pendingApproval?.resolve({
              approved: false,
              message: "Kun runtime was disabled in Settings.",
            })
            runAbort.abort()
            await waitFor(() => decisions.length === 1)
          },
        },
      }),
    })

    const result = await adapter.run(fakeKunRequest(runAbort.signal))

    expect(result.status).toBe("canceled")
    expect(decisions).toEqual([
      {
        approvalId: "appr_call_5",
        decision: "deny",
        reason: "Kun runtime was disabled in Settings.",
        signalAborted: false,
      },
    ])
    expect(interruptSignals).toEqual([false])
  })

  test("missing approval bridge fails closed by timeout", async () => {
    const decisions: Array<{
      approvalId: string
      decision: string
      reason?: string | null
    }> = []
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

  test("fails the current run when a launched Kun serve exits unexpectedly", async () => {
    const child = new EventEmitter() as unknown as KunServeHandle["child"]
    const server = createServer((request, response) => {
      if (request.method === "POST" && request.url === "/v1/threads") {
        response.writeHead(200, { "content-type": "application/json" })
        response.end(JSON.stringify({ id: "thread-exit" }))
        return
      }
      if (
        request.method === "POST" &&
        request.url === "/v1/threads/thread-exit/turns"
      ) {
        response.writeHead(200, { "content-type": "application/json" })
        response.end(
          JSON.stringify({ threadId: "thread-exit", turnId: "turn-exit" }),
        )
        setImmediate(() => child.emit("exit", 1, null))
        return
      }
      if (
        request.method === "GET" &&
        request.url?.startsWith("/v1/threads/thread-exit/events")
      ) {
        response.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache",
        })
        request.on("close", () => response.end())
        return
      }
      response.writeHead(404)
      response.end()
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    if (!address || typeof address === "string") {
      throw new Error("test server did not bind to a TCP port")
    }
    try {
      const adapter = createKunHttpSseAdapter({
        executable: "/usr/local/bin/kun",
        launchServe: async () => ({
          baseUrl: `http://127.0.0.1:${address.port}`,
          runtimeToken: "test-runtime-token",
          ready: {
            service: "kun",
            mode: "serve",
            host: "127.0.0.1",
            port: address.port,
            approvalPolicy: "on-request",
            sandboxMode: "workspace-write",
            insecure: false,
          },
          child,
          close: async () => {
            await new Promise<void>((resolve) => server.close(() => resolve()))
          },
        }),
      })

      const result = await adapter.run(fakeKunRequest())

      expect(result).toMatchObject({
        status: "failed",
        error: {
          message: "Kun serve exited unexpectedly: code=1 signal=null.",
        },
      })
    } finally {
      if (server.listening) {
        await new Promise<void>((resolve) => server.close(() => resolve()))
      }
    }
  })
})

import { describe, expect, test } from "bun:test"
import type { DesktopRunRequest } from "../src/main/lib/agent-runtime/desktop-run-request"
import { createRunEvent } from "../src/main/lib/agent-runtime/runtime-events"
import { createCodexAppServerHeadlessTaskRunner } from "../src/main/lib/headless/adapters/codex-app-server"
import {
  createAgentRuntimeRunRequest,
  type AgentRuntimeObserver,
  type CreateAgentRuntimeRunRequestInput,
} from "../src/main/lib/headless/agent-runtime-contract"

const baseInput = {
  jobId: "job-app-server-headless",
  runtime: "codex" as const,
  cwd: "/tmp/project",
  mode: "agent" as const,
  source: "api" as const,
  prompt: "Run through app-server",
  signal: new AbortController().signal,
} satisfies CreateAgentRuntimeRunRequestInput

function request(overrides: Partial<CreateAgentRuntimeRunRequestInput> = {}) {
  return createAgentRuntimeRunRequest({
    ...baseInput,
    ...overrides,
  })
}

function policyGrantRequest() {
  return request({
    executionProfile: "policy-grant",
    policyGrant: {
      scopes: ["workspace:file-write"],
    },
  })
}

function observer() {
  const events: Array<{ type: string; payload: unknown }> = []
  const runtimeObserver: AgentRuntimeObserver = {
    appendEvent(type, payload) {
      events.push({ type, payload })
      return {
        id: `event-${events.length}`,
        jobId: baseInput.jobId,
        sequence: events.length,
        type,
        payloadJson: JSON.stringify(payload ?? {}),
        createdAt: new Date("2026-06-15T00:00:00.000Z"),
      }
    },
    heartbeat() {
      return { id: baseInput.jobId, status: "running" } as any
    },
    isCancelRequested() {
      return false
    },
  }
  return { observer: runtimeObserver, events }
}

describe("headless Codex app-server adapter", () => {
  test("bridges a policy-grant headless request into the desktop app-server adapter", async () => {
    const { observer: runtimeObserver, events } = observer()
    let desktopRequest: DesktopRunRequest | null = null
    const runner = createCodexAppServerHeadlessTaskRunner({
      createDesktopAdapter: () => ({
        metadata: {
          runtimeId: "codex",
          source: "codex-app-server",
          label: "Codex app-server adapter",
          temporaryFallback: false,
        },
        async run(request) {
          desktopRequest = request
          request.trace.emit(
            createRunEvent({
              runId: request.identity.runId,
              jobId: request.identity.jobId,
              runtimeId: "codex",
              sequence: 1,
              type: "status",
              payload: { status: "desktop_runtime_adapter_started" },
            }),
          )
          request.trace.emit(
            createRunEvent({
              runId: request.identity.runId,
              jobId: request.identity.jobId,
              runtimeId: "codex",
              sequence: 2,
              type: "assistant_delta",
              payload: { text: "hello from app-server" },
            }),
          )
          request.trace.emit(
            createRunEvent({
              runId: request.identity.runId,
              jobId: request.identity.jobId,
              runtimeId: "codex",
              sequence: 3,
              type: "completed",
              payload: { status: "succeeded" },
            }),
          )
          return {
            status: "succeeded",
            sessionId: "session-1",
            usage: {
              inputTokens: 3,
              outputTokens: 4,
              totalTokens: 7,
            },
          }
        },
      }),
    })

    const result = await runner(policyGrantRequest(), runtimeObserver)

    expect(result).toMatchObject({
      status: "succeeded",
      exitCode: 0,
      sessionId: "session-1",
      result: {
        adapterSource: "codex-app-server",
      },
    })
    expect(events).toEqual([
      {
        type: "status",
        payload: { status: "desktop_runtime_adapter_started" },
      },
      {
        type: "assistant_delta",
        payload: { text: "hello from app-server" },
      },
    ])
    expect(desktopRequest?.context).toMatchObject({
      runtimeId: "codex",
      source: "desktop",
      cwd: "/tmp/project",
      projectId: "headless-project:job-app-server-headless",
    })
    expect(desktopRequest?.permissionPolicy.runtimeMapping).toMatchObject({
      runtime: "codex",
      adapterSource: "codex-app-server",
      approvalGateFailure: "fail-closed",
    })
  })

  test("refuses non-policy-grant requests before creating the desktop adapter", async () => {
    const { observer: runtimeObserver } = observer()
    let created = 0
    const runner = createCodexAppServerHeadlessTaskRunner({
      createDesktopAdapter: () => {
        created += 1
        throw new Error("desktop adapter should not be created")
      },
    })

    const result = await runner(request(), runtimeObserver)

    expect(created).toBe(0)
    expect(result).toMatchObject({
      status: "failed",
      errorCode: "unsupported_execution_profile",
    })
  })

  test("fails closed when the desktop adapter cannot start", async () => {
    const { observer: runtimeObserver, events } = observer()
    const runner = createCodexAppServerHeadlessTaskRunner({
      createDesktopAdapter: () => ({
        metadata: {
          runtimeId: "codex",
          source: "codex-app-server",
          label: "Codex app-server adapter",
          temporaryFallback: false,
        },
        async run() {
          throw new Error("approval hook failed closed before provider work")
        },
      }),
    })

    const result = await runner(policyGrantRequest(), runtimeObserver)

    expect(result).toMatchObject({
      status: "failed",
      errorCode: "codex_app_server_failed",
      errorMessage: "approval hook failed closed before provider work",
    })
    expect(events).toEqual([
      {
        type: "error",
        payload: {
          errorCode: "codex_app_server_failed",
          errorMessage: "approval hook failed closed before provider work",
        },
      },
    ])
  })
})

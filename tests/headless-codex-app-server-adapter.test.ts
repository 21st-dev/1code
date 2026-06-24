import { describe, expect, test } from "bun:test"
import type { DesktopRunRequest } from "../src/main/lib/agent-runtime/desktop-run-request"
import { createRunEvent } from "../src/main/lib/agent-runtime/runtime-events"
import type {
  CodexAppServerClientNotificationMethod,
  CodexAppServerClientRequestMethod,
  CodexAppServerTransport,
  CodexAppServerTransportNotification,
  CodexAppServerTransportServerRequest,
} from "../src/main/lib/codex/app-server-transport"
import {
  createCodexAppServerHeadlessTaskRunner,
  createHeadlessCodexAppServerDesktopAdapter,
} from "../src/main/lib/headless/adapters/codex-app-server"
import {
  type AgentRuntimeObserver,
  type CreateAgentRuntimeRunRequestInput,
  createAgentRuntimeRunRequest,
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

function sleep(ms: number): Promise<"timed-out"> {
  return new Promise((resolve) => setTimeout(() => resolve("timed-out"), ms))
}

class FakeCodexAppServerTransport implements CodexAppServerTransport {
  closed = false
  notificationHandler:
    | ((notification: CodexAppServerTransportNotification) => void)
    | null = null
  serverRequestHandler:
    | ((
        request: CodexAppServerTransportServerRequest,
      ) => unknown | Promise<unknown>)
    | null = null
  onTurnStart?: () => void | Promise<void>

  async request(
    method: CodexAppServerClientRequestMethod,
    params: unknown,
  ): Promise<unknown> {
    if (method === "initialize") {
      return {
        userAgent: "codex-test",
        codexHome: "/tmp/codex-home",
        platformFamily: "unix",
        platformOs: "macos",
      }
    }
    if (method === "thread/start") {
      this.emitNotification({
        method: "thread/started",
        params: {
          thread: {
            id: "thread-1",
            sessionId: "session-1",
            modelProvider: "locus_profile",
          },
        },
      })
      return { thread: { id: "thread-1", sessionId: "session-1" } }
    }
    if (method === "mcpServerStatus/list") {
      return { data: [], nextCursor: null }
    }
    if (method === "turn/start") {
      this.emitNotification({
        method: "turn/started",
        params: {
          threadId: "thread-1",
          turn: { id: "turn-1", status: "inProgress", error: null },
        },
      })
      await this.onTurnStart?.()
      this.emitNotification({
        method: "turn/completed",
        params: {
          threadId: "thread-1",
          turn: { id: "turn-1", status: "completed", error: null },
        },
      })
      return { turn: { id: "turn-1" } }
    }
    if (method === "turn/interrupt") {
      return { params }
    }
    throw new Error(`unexpected method ${method}`)
  }

  notify(method: CodexAppServerClientNotificationMethod): void {
    if (method !== "initialized") {
      throw new Error(`unexpected notification ${method}`)
    }
  }

  onNotification(
    handler: (notification: CodexAppServerTransportNotification) => void,
  ): () => void {
    this.notificationHandler = handler
    return () => {
      this.notificationHandler = null
    }
  }

  onServerRequest(
    handler: (
      request: CodexAppServerTransportServerRequest,
    ) => unknown | Promise<unknown>,
  ): () => void {
    this.serverRequestHandler = handler
    return () => {
      this.serverRequestHandler = null
    }
  }

  emitNotification(notification: CodexAppServerTransportNotification): void {
    this.notificationHandler?.(notification)
  }

  close(): Promise<void> {
    this.closed = true
    return Promise.resolve()
  }
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
    expect(desktopRequest?.attachments).toEqual([])
  })

  test("fails app-server interaction requests closed without waiting for a headless UI bridge", async () => {
    const transport = new FakeCodexAppServerTransport()
    const { observer: runtimeObserver } = observer()
    let permissionResponse: unknown = null
    let userInputResponse: unknown = null

    transport.onTurnStart = async () => {
      const permissionPromise = Promise.resolve(
        transport.serverRequestHandler?.({
          id: "permission-1",
          method: "item/permissions/requestApproval",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            itemId: "item-permission",
            permissions: {
              fileSystem: { write: ["/tmp/project/src/generated.txt"] },
            },
            cwd: "/tmp/project",
            reason: "write generated file",
          },
        }),
      )
      permissionResponse = await Promise.race([permissionPromise, sleep(25)])

      const userInputPromise = Promise.resolve(
        transport.serverRequestHandler?.({
          id: "question-1",
          method: "item/tool/requestUserInput",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            itemId: "item-question",
            questions: [
              {
                id: "q-confirm",
                header: "Confirm",
                question: "Proceed?",
                isOther: false,
                isSecret: false,
                options: [{ label: "Yes", description: "" }],
              },
            ],
          },
        }),
      )
      userInputResponse = await Promise.race([userInputPromise, sleep(25)])
    }

    const runner = createCodexAppServerHeadlessTaskRunner({
      createDesktopAdapter: () =>
        createHeadlessCodexAppServerDesktopAdapter({
          createTransport: () => transport,
        }),
    })

    const result = await runner(policyGrantRequest(), runtimeObserver)

    expect(permissionResponse).toEqual({
      permissions: {},
      scope: "turn",
      strictAutoReview: true,
    })
    expect(userInputResponse).toEqual({ answers: {} })
    expect(result).toMatchObject({
      status: "succeeded",
      exitCode: 0,
      sessionId: "session-1",
    })
    expect(transport.closed).toBe(true)
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

  test("passes cancellation signal into the desktop app-server adapter", async () => {
    const abortController = new AbortController()
    abortController.abort()
    const { observer: runtimeObserver } = observer()
    let sawAbortedSignal = false
    const runner = createCodexAppServerHeadlessTaskRunner({
      createDesktopAdapter: () => ({
        metadata: {
          runtimeId: "codex",
          source: "codex-app-server",
          label: "Codex app-server adapter",
          temporaryFallback: false,
        },
        async run(request) {
          sawAbortedSignal = request.signal.aborted
          return {
            status: "canceled",
            sessionId: "session-canceled",
          }
        },
      }),
    })

    const result = await runner(
      request({
        signal: abortController.signal,
        executionProfile: "policy-grant",
        policyGrant: {
          scopes: ["workspace:file-write"],
        },
      }),
      runtimeObserver,
    )

    expect(sawAbortedSignal).toBe(true)
    expect(result).toMatchObject({
      status: "canceled",
      exitCode: 5,
      sessionId: "session-canceled",
    })
  })
})

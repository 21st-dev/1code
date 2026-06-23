import { describe, expect, test } from "bun:test"
import type { ChildProcessWithoutNullStreams } from "node:child_process"
import { EventEmitter } from "node:events"
import { PassThrough, Writable } from "node:stream"
import type { DesktopRunRequest } from "../src/main/lib/agent-runtime/desktop-run-request"
import { resolveDesktopPermissionPolicy } from "../src/main/lib/agent-runtime/permission-policy"
import {
  createQwenAcpClientAdapter,
  createQwenAcpStdioTransport,
  type QwenAcpTransport,
  type QwenAcpTransportNotification,
  type QwenAcpTransportServerRequest,
} from "../src/main/lib/qwen/qwen-acp-client"

function createDesktopRequest(
  overrides: Partial<DesktopRunRequest> = {},
): DesktopRunRequest {
  const abortController = new AbortController()
  const traceEvents: unknown[] = []
  return {
    identity: {
      runId: "run-qwen-1",
      jobId: "job-qwen-1",
    },
    context: {
      runtimeId: "qwen-code",
      mode: "agent",
      source: "desktop",
      executionProfile: "interactive",
      workspaceKind: "project",
      projectId: "project-1",
      chatId: "chat-1",
      subChatId: "sub-1",
      cwd: "/tmp/qwen-project",
    },
    prompt: "Review this file.",
    signal: abortController.signal,
    requestedCapabilities: [],
    permissionPolicy: resolveDesktopPermissionPolicy({
      runtimeId: "qwen-code",
      mode: "agent",
    }),
    providerBinding: {
      authMode: "runtime-managed",
      diagnostics: [],
    },
    mcp: {
      status: "ready",
      serverNames: [],
      blockers: [],
    },
    attachments: [],
    trace: {
      emit(event) {
        traceEvents.push(event)
      },
    },
    session: {},
    ...overrides,
  }
}

function createFakeTransport(input: {
  onPrompt?: (emit: (notification: QwenAcpTransportNotification) => void) => void
} = {}): QwenAcpTransport & { calls: Array<{ method: string; params: unknown }> } {
  const calls: Array<{ method: string; params: unknown }> = []
  const notifications = new Set<(notification: QwenAcpTransportNotification) => void>()
  const serverRequests = new Set<
    (request: QwenAcpTransportServerRequest) => unknown | Promise<unknown>
  >()

  return {
    calls,
    async request(method, params) {
      calls.push({ method, params })
      if (method === "initialize") {
        return {
          protocolVersion: 1,
          agentCapabilities: {
            sessionCapabilities: {},
          },
        }
      }
      if (method === "session/new") {
        return { sessionId: "qwen-session-1" }
      }
      if (method === "session/prompt") {
        input.onPrompt?.((notification) => {
          for (const handler of notifications) handler(notification)
        })
        return { stopReason: "end_turn" }
      }
      return {}
    },
    notify(method, params) {
      calls.push({ method, params })
    },
    onNotification(handler) {
      notifications.add(handler)
      return () => notifications.delete(handler)
    },
    onServerRequest(handler) {
      serverRequests.add(handler)
      return () => serverRequests.delete(handler)
    },
    async close() {},
  }
}

describe("Qwen ACP client", () => {
  test("initializes ACP, creates a session, prompts, and maps updates", async () => {
    const chunks: Record<string, unknown>[] = []
    const transport = createFakeTransport({
      onPrompt(emit) {
        emit({
          method: "session/update",
          params: {
            sessionId: "qwen-session-1",
            update: {
              sessionUpdate: "agent_message_chunk",
              messageId: "msg-1",
              content: {
                type: "text",
                text: "Reviewed.",
              },
            },
          },
        })
      },
    })
    const request = createDesktopRequest()
    const traceEvents: unknown[] = []
    request.trace = { emit: (event) => traceEvents.push(event) }

    const adapter = createQwenAcpClientAdapter({
      createTransport: () => transport,
      emit: (chunk) => chunks.push(chunk),
    })
    const result = await adapter.run(request)

    expect(result).toMatchObject({
      status: "succeeded",
      sessionId: "qwen-session-1",
    })
    expect(transport.calls.map((call) => call.method)).toEqual([
      "initialize",
      "session/new",
      "session/prompt",
    ])
    expect(transport.calls[0]?.params).toMatchObject({
      protocolVersion: 1,
      clientCapabilities: {
        fs: {
          readTextFile: false,
          writeTextFile: false,
        },
        terminal: false,
      },
    })
    expect(transport.calls[2]?.params).toMatchObject({
      sessionId: "qwen-session-1",
      prompt: [{ type: "text", text: "Review this file." }],
    })
    expect(chunks).toContainEqual({
      type: "text-delta",
      id: "msg-1",
      delta: "Reviewed.",
    })
    expect(traceEvents).toContainEqual(
      expect.objectContaining({
        runtimeId: "qwen-code",
        type: "assistant_delta",
        payload: {
          id: "msg-1",
          delta: "Reviewed.",
        },
      }),
    )
    expect(traceEvents).toContainEqual(
      expect.objectContaining({
        runtimeId: "qwen-code",
        type: "completed",
      }),
    )
  })

  test("cancels active prompt and closes transport on abort", async () => {
    const abortController = new AbortController()
    const calls: Array<{ method: string; params: unknown }> = []
    let rejectPrompt: ((error: Error) => void) | null = null
    let closeCount = 0
    const transport: QwenAcpTransport = {
      async request(method, params) {
        calls.push({ method, params })
        if (method === "initialize") {
          return { protocolVersion: 1 }
        }
        if (method === "session/new") {
          return { sessionId: "qwen-session-1" }
        }
        if (method === "session/prompt") {
          const prompt = new Promise((_resolve, reject) => {
            rejectPrompt = reject
          })
          queueMicrotask(() => abortController.abort())
          return prompt
        }
        return {}
      },
      notify(method, params) {
        calls.push({ method, params })
      },
      onNotification() {
        return () => {}
      },
      onServerRequest() {
        return () => {}
      },
      async close() {
        closeCount += 1
        rejectPrompt?.(new Error("transport closed"))
      },
    }
    const adapter = createQwenAcpClientAdapter({
      createTransport: () => transport,
    })

    const result = await adapter.run(
      createDesktopRequest({ signal: abortController.signal }),
    )

    expect(result.status).toBe("canceled")
    expect(calls).toContainEqual({
      method: "session/cancel",
      params: { sessionId: "qwen-session-1" },
    })
    expect(closeCount).toBe(1)
  })

  test("fails closed and traces Qwen ACP permission requests", async () => {
    const chunks: Record<string, unknown>[] = []
    const traceEvents: unknown[] = []
    let serverRequestHandler:
      | ((request: QwenAcpTransportServerRequest) => unknown | Promise<unknown>)
      | null = null
    let permissionResponse: unknown = null
    const transport: QwenAcpTransport = {
      async request(method) {
        if (method === "initialize") {
          return { protocolVersion: 1 }
        }
        if (method === "session/new") {
          return { sessionId: "qwen-session-1" }
        }
        if (method === "session/prompt") {
          if (!serverRequestHandler) {
            throw new Error("missing permission handler")
          }
          permissionResponse = await serverRequestHandler({
            id: "permission-1",
            method: "session/request_permission",
            params: {
              sessionId: "qwen-session-1",
              toolCall: {
                sessionUpdate: "tool_call",
                toolCallId: "tool-1",
                title: "Write file",
                kind: "edit",
                status: "pending",
              },
              options: [
                {
                  optionId: "allow-once",
                  kind: "allow_once",
                  name: "Allow",
                },
                {
                  optionId: "reject-once",
                  kind: "reject_once",
                  name: "Reject",
                },
              ],
            },
          })
          return { stopReason: "end_turn" }
        }
        return {}
      },
      notify() {},
      onNotification() {
        return () => {}
      },
      onServerRequest(handler) {
        serverRequestHandler = handler
        return () => {
          serverRequestHandler = null
        }
      },
      async close() {},
    }
    const request = createDesktopRequest()
    request.trace = { emit: (event) => traceEvents.push(event) }
    const adapter = createQwenAcpClientAdapter({
      createTransport: () => transport,
      emit: (chunk) => chunks.push(chunk),
    })

    const result = await adapter.run(request)

    expect(result.status).toBe("succeeded")
    expect(permissionResponse).toEqual({
      outcome: {
        outcome: "selected",
        optionId: "reject-once",
      },
    })
    expect(chunks).toContainEqual(
      expect.objectContaining({
        type: "observed-tool-decision",
        controlLevel: "observe",
        decision: "deny",
        message: expect.stringContaining("fail-closed"),
      }),
    )
    expect(chunks).toContainEqual(
      expect.objectContaining({
        type: "runtime-status",
        ok: false,
        blocker: expect.objectContaining({
          component: "permission",
          code: "qwen-acp-permission-fail-closed",
        }),
      }),
    )
    expect(traceEvents).toContainEqual(
      expect.objectContaining({
        runtimeId: "qwen-code",
        type: "permission_requested",
        payload: expect.objectContaining({
          decision: "deny",
          message: expect.stringContaining("fail-closed"),
        }),
      }),
    )
  })

  test("stdio transport starts qwen --acp and frames JSON-RPC 2.0 requests", async () => {
    const writes: string[] = []
    const child = new EventEmitter() as EventEmitter & {
      stdin: Writable
      stdout: PassThrough
      stderr: PassThrough
      killed: boolean
      kill: () => boolean
    }
    child.stdin = new Writable({
      write(chunk, _encoding, callback) {
        writes.push(String(chunk))
        callback()
      },
    })
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    child.killed = false
    child.kill = () => {
      child.killed = true
      child.emit("exit", null, "SIGTERM")
      return true
    }
    const spawnCalls: Array<{
      executable: string
      args: string[]
      options: Record<string, unknown>
    }> = []
    const transport = createQwenAcpStdioTransport({
      executable: "/usr/local/bin/qwen",
      cwd: "/tmp/qwen-project",
      spawnProcess(executable, args, options) {
        spawnCalls.push({
          executable: String(executable),
          args: [...(args ?? [])],
          options: options as Record<string, unknown>,
        })
        return child as unknown as ChildProcessWithoutNullStreams
      },
    })

    const response = transport.request("initialize", { protocolVersion: 1 })
    expect(spawnCalls).toEqual([
      {
        executable: "/usr/local/bin/qwen",
        args: ["--acp"],
        options: expect.objectContaining({
          cwd: "/tmp/qwen-project",
          shell: false,
          stdio: "pipe",
        }),
      },
    ])
    expect(JSON.parse(writes[0] ?? "{}")).toEqual({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: 1 },
    })

    child.stdout.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result: { protocolVersion: 1 },
      })}\n`,
    )
    await expect(response).resolves.toEqual({ protocolVersion: 1 })
    await transport.close()
  })

  test("stdio transport can pass a non-secret Qwen auth type from main env", async () => {
    const child = new EventEmitter() as EventEmitter & {
      stdin: Writable
      stdout: PassThrough
      stderr: PassThrough
      killed: boolean
      kill: () => boolean
    }
    child.stdin = new Writable({
      write(_chunk, _encoding, callback) {
        callback()
      },
    })
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    child.killed = false
    child.kill = () => {
      child.killed = true
      child.emit("exit", null, "SIGTERM")
      return true
    }
    const spawnCalls: Array<{
      executable: string
      args: string[]
    }> = []

    const transport = createQwenAcpStdioTransport({
      executable: "/usr/local/bin/qwen",
      env: {
        ...process.env,
        LOCUS_QWEN_CODE_AUTH_TYPE: "openai",
        OPENAI_API_KEY: "sk-redacted-test-key",
      },
      spawnProcess(executable, args) {
        spawnCalls.push({
          executable: String(executable),
          args: [...(args ?? [])],
        })
        return child as unknown as ChildProcessWithoutNullStreams
      },
    })

    expect(spawnCalls).toEqual([
      {
        executable: "/usr/local/bin/qwen",
        args: ["--auth-type=openai", "--acp"],
      },
    ])
    await transport.close()
  })

  test("stdio transport redacts process stderr before rejecting pending requests", async () => {
    const child = new EventEmitter() as EventEmitter & {
      stdin: Writable
      stdout: PassThrough
      stderr: PassThrough
      killed: boolean
      kill: () => boolean
    }
    child.stdin = new Writable({
      write(_chunk, _encoding, callback) {
        callback()
      },
    })
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    child.killed = false
    child.kill = () => {
      child.killed = true
      return true
    }
    const transport = createQwenAcpStdioTransport({
      spawnProcess() {
        return child as unknown as ChildProcessWithoutNullStreams
      },
    })

    const pending = transport.request("initialize", {})
    child.stderr.write("auth failed with sk-abcdefghijklmnopqrstuvwxyz123456")
    child.emit("exit", 1, null)

    await expect(pending).rejects.toThrow("<redacted>")
    await expect(pending).rejects.not.toThrow("sk-abcdefghijklmnopqrstuvwxyz")
    await transport.close()
  })
})

import {
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process"
import { createInterface } from "node:readline"
import type {
  DesktopRunRequest,
  DesktopRunResult,
  DesktopRunMcpSessionServer,
} from "../agent-runtime/desktop-run-request"
import { QWEN_ACP_CLIENT_DESKTOP_ADAPTER_METADATA } from "../agent-runtime/desktop-adapter-metadata"
import {
  emitDesktopRuntimeAdapterStarted,
  type DesktopRuntimeAdapter,
} from "../agent-runtime/desktop-runner"
import {
  getQwenAcpClientPermissionMapping,
  type QwenAcpClientPermissionMapping,
} from "../agent-runtime/permission-policy"
import { redactRuntimePayload } from "../agent-runtime/redaction"
import { mapDesktopStreamChunkToRunEvents } from "../agent-runtime/stream-event-mapper"

export type QwenAcpMessageId = string | number

export type QwenAcpProtocolRequest = {
  jsonrpc: "2.0"
  id: QwenAcpMessageId
  method: string
  params?: unknown
}

export type QwenAcpProtocolNotification = {
  jsonrpc: "2.0"
  method: string
  params?: unknown
}

export type QwenAcpProtocolResponse = {
  jsonrpc: "2.0"
  id: QwenAcpMessageId
  result?: unknown
  error?: {
    code?: number
    message?: string
    data?: unknown
  }
}

export type QwenAcpTransportNotification = {
  method: string
  params?: unknown
}

export type QwenAcpTransportServerRequest = {
  id: QwenAcpMessageId
  method: string
  params?: unknown
}

export type QwenAcpTransport = {
  request(method: string, params?: unknown): Promise<unknown>
  notify(method: string, params?: unknown): void
  onNotification(
    handler: (notification: QwenAcpTransportNotification) => void,
  ): () => void
  onServerRequest(
    handler: (
      request: QwenAcpTransportServerRequest,
    ) => unknown | Promise<unknown>,
  ): () => void
  close(): Promise<void>
}

export type CreateQwenAcpStdioTransportInput = {
  executable?: string
  env?: NodeJS.ProcessEnv
  cwd?: string
  spawnProcess?: typeof spawn
}

export type CreateQwenAcpClientAdapterInput = {
  createTransport?: (input: {
    request: DesktopRunRequest
  }) => QwenAcpTransport
  executable?: string
  env?: NodeJS.ProcessEnv
  spawnProcess?: typeof spawn
  emit?: (chunk: Record<string, unknown>) => void
}

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

type QwenAcpSessionUpdate = {
  sessionUpdate?: unknown
  content?: unknown
  messageId?: unknown
  toolCallId?: unknown
  title?: unknown
  kind?: unknown
  status?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function stringAt(value: unknown, key: string): string | null {
  if (!isRecord(value)) return null
  const child = value[key]
  return typeof child === "string" ? child : null
}

function arrayAt(value: unknown, key: string): unknown[] {
  if (!isRecord(value)) return []
  const child = value[key]
  return Array.isArray(child) ? child : []
}

function trimLongMessage(message: string): string {
  return message.length > 1000 ? `${message.slice(0, 1000)}...` : message
}

function redactQwenDiagnostic(message: string, fallback: string): string {
  const rawMessage = message.trim() || fallback
  const redacted = redactRuntimePayload(rawMessage, {
    runtimeId: "qwen-code",
    runId: "qwen-acp-client",
    source: "runtime-diagnostic",
  }).payload
  return trimLongMessage(typeof redacted === "string" ? redacted : fallback)
}

function protocolErrorMessage(message: QwenAcpProtocolResponse): string {
  return redactQwenDiagnostic(
    message.error?.message ?? "",
    "Qwen ACP request failed.",
  )
}

function writeJsonLine(
  child: ChildProcessWithoutNullStreams,
  message:
    | QwenAcpProtocolRequest
    | QwenAcpProtocolNotification
    | QwenAcpProtocolResponse,
): void {
  child.stdin.write(`${JSON.stringify(message)}\n`)
}

export function createQwenAcpStdioTransport({
  executable = "qwen",
  env,
  cwd,
  spawnProcess = spawn,
}: CreateQwenAcpStdioTransportInput = {}): QwenAcpTransport {
  const child = spawnProcess(executable, ["--acp"], {
    cwd,
    env,
    stdio: "pipe",
  }) as ChildProcessWithoutNullStreams
  let nextId = 1
  let stderr = ""
  const pending = new Map<QwenAcpMessageId, PendingRequest>()
  const notificationHandlers = new Set<
    (notification: QwenAcpTransportNotification) => void
  >()
  const serverRequestHandlers = new Set<
    (request: QwenAcpTransportServerRequest) => unknown | Promise<unknown>
  >()

  child.stderr.on("data", (chunk) => {
    stderr += String(chunk)
  })

  const rl = createInterface({ input: child.stdout })
  rl.on("line", (line) => {
    if (!line.trim()) return
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      return
    }
    if (!isRecord(parsed)) return

    if ("id" in parsed && ("result" in parsed || "error" in parsed)) {
      const id = parsed.id as QwenAcpMessageId
      const waiter = pending.get(id)
      if (!waiter) return
      pending.delete(id)
      const response = parsed as QwenAcpProtocolResponse
      if (response.error) {
        waiter.reject(new Error(protocolErrorMessage(response)))
      } else {
        waiter.resolve(response.result)
      }
      return
    }

    if (typeof parsed.method !== "string") return
    if ("id" in parsed) {
      const request = {
        id: parsed.id as QwenAcpMessageId,
        method: parsed.method,
        params: parsed.params,
      }
      void Promise.resolve()
        .then(async () => {
          const [handler] = [...serverRequestHandlers]
          if (!handler) {
            throw new Error(`No Qwen ACP handler installed for ${request.method}.`)
          }
          return handler(request)
        })
        .then((result) => {
          writeJsonLine(child, {
            jsonrpc: "2.0",
            id: request.id,
            result,
          })
        })
        .catch((error) => {
          writeJsonLine(child, {
            jsonrpc: "2.0",
            id: request.id,
            error: {
              code: -32000,
              message: redactQwenDiagnostic(
                error instanceof Error ? error.message : String(error),
                "Qwen ACP client request failed closed.",
              ),
            },
          })
        })
      return
    }

    for (const handler of notificationHandlers) {
      handler({ method: parsed.method, params: parsed.params })
    }
  })

  child.once("error", (error) => {
    for (const waiter of pending.values()) {
      waiter.reject(error instanceof Error ? error : new Error(String(error)))
    }
    pending.clear()
  })

  child.once("exit", (code, signal) => {
    const message = redactQwenDiagnostic(
      stderr,
      `Qwen ACP process exited before completing requests (code=${code}, signal=${signal}).`,
    )
    for (const waiter of pending.values()) {
      waiter.reject(new Error(message))
    }
    pending.clear()
  })

  return {
    request(method, params) {
      const id = nextId++
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        writeJsonLine(child, {
          jsonrpc: "2.0",
          id,
          method,
          ...(params === undefined ? {} : { params }),
        })
      })
    },

    notify(method, params) {
      writeJsonLine(child, {
        jsonrpc: "2.0",
        method,
        ...(params === undefined ? {} : { params }),
      })
    },

    onNotification(handler) {
      notificationHandlers.add(handler)
      return () => notificationHandlers.delete(handler)
    },

    onServerRequest(handler) {
      serverRequestHandlers.add(handler)
      return () => serverRequestHandlers.delete(handler)
    },

    close() {
      rl.close()
      if (!child.killed) {
        child.kill()
      }
      return Promise.resolve()
    },
  }
}

function qwenMcpServer(server: DesktopRunMcpSessionServer): Record<string, unknown> {
  if (server.type === "stdio") {
    return {
      name: server.name,
      command: server.command,
      args: server.args,
      env: server.env,
    }
  }
  return {
    name: server.name,
    type: "http",
    url: server.url,
    headers: server.headers,
  }
}

function qwenTextContent(text: string): Record<string, unknown> {
  return {
    type: "text",
    text,
  }
}

function qwenSessionUpdateToChunk(
  notification: QwenAcpTransportNotification,
): Record<string, unknown> | null {
  if (notification.method !== "session/update") return null
  const params = isRecord(notification.params) ? notification.params : null
  const update = isRecord(params?.update)
    ? (params.update as QwenAcpSessionUpdate)
    : null
  if (!update || typeof update.sessionUpdate !== "string") return null

  const content = isRecord(update.content) ? update.content : null
  const text = typeof content?.text === "string" ? content.text : null
  switch (update.sessionUpdate) {
    case "agent_message_chunk":
      return {
        type: "text-delta",
        id: typeof update.messageId === "string" ? update.messageId : null,
        delta: text ?? "",
      }
    case "agent_thought_chunk":
      return {
        type: "reasoning-delta",
        id: typeof update.messageId === "string" ? update.messageId : null,
        delta: text ?? "",
      }
    case "tool_call":
      return {
        type: "tool-input-start",
        toolCallId:
          typeof update.toolCallId === "string" ? update.toolCallId : null,
        toolName: typeof update.title === "string" ? update.title : "tool",
        input: {
          kind: typeof update.kind === "string" ? update.kind : null,
          status: typeof update.status === "string" ? update.status : null,
        },
      }
    case "usage_update":
      return {
        type: "message-metadata",
        messageMetadata: update,
      }
    default:
      return {
        type: "runtime-status",
        ok: true,
        blocker: null,
        qwen: {
          method: notification.method,
          update,
        },
      }
  }
}

function qwenRejectPermissionOptionId(params: unknown): string | null {
  for (const option of arrayAt(params, "options")) {
    if (!isRecord(option)) continue
    const kind = stringAt(option, "kind")
    const optionId = stringAt(option, "optionId")
    if (!optionId) continue
    if (kind === "reject_once" || kind === "reject_always") {
      return optionId
    }
  }
  return null
}

function qwenToolCallLabel(params: unknown): string {
  const toolCall = isRecord(params) ? params.toolCall : null
  if (!isRecord(toolCall)) return "unknown Qwen tool"
  return (
    stringAt(toolCall, "title") ??
    stringAt(toolCall, "kind") ??
    "unknown Qwen tool"
  )
}

function qwenPermissionDeniedResponse(
  params: unknown,
  aborted: boolean,
): Record<string, unknown> {
  if (aborted) {
    return { outcome: { outcome: "cancelled" } }
  }
  const optionId = qwenRejectPermissionOptionId(params)
  if (!optionId) {
    return { outcome: { outcome: "cancelled" } }
  }
  return {
    outcome: {
      outcome: "selected",
      optionId,
    },
  }
}

function qwenStopReasonStatus(
  stopReason: string | null,
): DesktopRunResult["status"] {
  if (stopReason === "cancelled") return "canceled"
  if (stopReason === "refusal") return "failed"
  return "succeeded"
}

function assertQwenRuntimeRequest(
  request: DesktopRunRequest,
): QwenAcpClientPermissionMapping {
  if (request.context.runtimeId !== "qwen-code") {
    throw new Error(
      `Qwen ACP client cannot run ${request.context.runtimeId} requests.`,
    )
  }
  return getQwenAcpClientPermissionMapping(request.permissionPolicy)
}

export function createQwenAcpClientAdapter({
  createTransport,
  executable,
  env = process.env,
  spawnProcess,
  emit,
}: CreateQwenAcpClientAdapterInput = {}): DesktopRuntimeAdapter {
  return {
    metadata: QWEN_ACP_CLIENT_DESKTOP_ADAPTER_METADATA,

    async run(request: DesktopRunRequest): Promise<DesktopRunResult> {
      emitDesktopRuntimeAdapterStarted(
        request,
        QWEN_ACP_CLIENT_DESKTOP_ADAPTER_METADATA,
      )
      const permissionMapping = assertQwenRuntimeRequest(request)

      const transport =
        createTransport?.({ request }) ??
        createQwenAcpStdioTransport({
          executable,
          env,
          cwd: request.context.cwd,
          spawnProcess,
        })
      let sequence = 0
      let sessionId: string | null = null
      let transportClosed = false

      const closeTransport = async () => {
        if (transportClosed) return
        transportClosed = true
        await transport.close()
      }

      const emitChunk = (chunk: Record<string, unknown>) => {
        emit?.(chunk)
        const events = mapDesktopStreamChunkToRunEvents({
          runtimeId: "qwen-code",
          runId: request.identity.runId,
          jobId: request.identity.jobId,
          sequence: ++sequence,
          chunk,
        })
        for (const event of events) {
          request.trace.emit(event)
        }
      }

      const removeNotification = transport.onNotification((notification) => {
        const chunk = qwenSessionUpdateToChunk(notification)
        if (chunk) emitChunk(chunk)
      })
      const removeServerRequest = transport.onServerRequest((serverRequest) => {
        if (serverRequest.method === "session/request_permission") {
          const response = qwenPermissionDeniedResponse(
            serverRequest.params,
            request.signal.aborted,
          )
          const decision =
            isRecord(response.outcome) &&
            response.outcome.outcome === "selected"
              ? "deny"
              : "cancel"
          const message =
            decision === "deny"
              ? "Qwen ACP permission request denied by Locus fail-closed spike policy."
              : "Qwen ACP permission request cancelled by Locus fail-closed spike policy."
          emitChunk({
            type: "observed-tool-decision",
            controlLevel: permissionMapping.controlLevel,
            decision,
            message,
            risk: {
              runtime: "qwen-code",
              adapterSource: permissionMapping.adapterSource,
              tool: qwenToolCallLabel(serverRequest.params),
              requestId: String(serverRequest.id),
            },
          })
          emitChunk({
            type: "runtime-status",
            ok: false,
            blocker: {
              component: "permission",
              code: "qwen-acp-permission-fail-closed",
              message,
              hint: "Qwen permission allow UI is not wired in this spike.",
            },
            qwen: {
              method: serverRequest.method,
              outcome: response.outcome,
            },
          })
          return response
        }
        throw new Error(
          `Qwen ACP server request ${serverRequest.method} is not supported by this spike adapter.`,
        )
      })

      const abortHandler = () => {
        if (sessionId) {
          transport.notify("session/cancel", { sessionId })
        }
        void closeTransport()
      }
      request.signal.addEventListener("abort", abortHandler, { once: true })

      try {
        emitChunk({
          type: "runtime-status",
          ok: true,
          blocker: null,
          qwen: { status: "initializing" },
        })
        await transport.request("initialize", {
          protocolVersion: 1,
          clientCapabilities: {
            fs: {
              readTextFile: false,
              writeTextFile: false,
            },
            terminal: false,
          },
          clientInfo: {
            name: "locus",
            title: "Locus",
            version: "0.0.0",
          },
        })
        emitChunk({
          type: "runtime-status",
          ok: true,
          blocker: null,
          qwen: { status: "initialized" },
        })

        const newSession = await transport.request("session/new", {
          cwd: request.context.cwd,
          mcpServers: (request.mcpSessionServers ?? []).map(qwenMcpServer),
        })
        sessionId = stringAt(newSession, "sessionId")
        if (!sessionId) {
          throw new Error("Qwen ACP session/new did not return a sessionId.")
        }
        emitChunk({
          type: "session-init",
          sessionId,
        })

        if (request.signal.aborted) {
          return { status: "canceled", sessionId }
        }

        const promptResponse = await transport.request("session/prompt", {
          sessionId,
          prompt: [qwenTextContent(request.prompt)],
        })
        const stopReason = stringAt(promptResponse, "stopReason")
        const status = request.signal.aborted
          ? "canceled"
          : qwenStopReasonStatus(stopReason)
        emitChunk({
          type: "finish",
          status,
          message:
            stopReason === "refusal"
              ? "Qwen refused to continue the turn."
              : null,
          messageMetadata: {
            sessionId,
            stopReason,
          },
        })
        return {
          status,
          sessionId,
          ...(status === "failed"
            ? {
                error: {
                  message: "Qwen refused to continue the turn.",
                  code: stopReason ?? "refusal",
                },
              }
            : {}),
        }
      } catch (error) {
        const message = redactQwenDiagnostic(
          error instanceof Error ? error.message : String(error),
          "Qwen ACP run failed.",
        )
        emitChunk({
          type: "error",
          errorText: message,
        })
        return {
          status: request.signal.aborted ? "canceled" : "failed",
          sessionId,
          error: {
            message,
            code: request.signal.aborted ? "job_canceled" : "qwen_acp_failed",
          },
        }
      } finally {
        request.signal.removeEventListener("abort", abortHandler)
        removeServerRequest()
        removeNotification()
        await closeTransport()
      }
    },
  }
}

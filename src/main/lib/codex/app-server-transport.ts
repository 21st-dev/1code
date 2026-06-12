import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { createInterface } from "node:readline"
import { redactRuntimePayload } from "../agent-runtime/redaction"
import { resolveBundledCodexCliPath } from "./cli-path"

export type CodexAppServerMessageId = string | number

export type CodexAppServerClientRequestMethod =
  | "initialize"
  | "mcpServerStatus/list"
  | "thread/resume"
  | "thread/start"
  | "turn/start"
  | "turn/interrupt"

export type CodexAppServerClientNotificationMethod = "initialized"

export type CodexAppServerProtocolRequest = {
  id: CodexAppServerMessageId
  method: string
  params?: unknown
}

export type CodexAppServerProtocolNotification = {
  method: string
  params?: unknown
}

export type CodexAppServerProtocolResponse = {
  id: CodexAppServerMessageId
  result?: unknown
  error?: {
    code?: number
    message?: string
    data?: unknown
  }
}

export type CodexAppServerTransportNotification = {
  method: string
  params?: unknown
}

export type CodexAppServerTransportServerRequest = {
  id: CodexAppServerMessageId
  method: string
  params?: unknown
}

export type CodexAppServerTransport = {
  request(
    method: CodexAppServerClientRequestMethod,
    params: unknown,
  ): Promise<unknown>
  notify(
    method: CodexAppServerClientNotificationMethod,
    params?: unknown,
  ): void
  onNotification(
    handler: (notification: CodexAppServerTransportNotification) => void,
  ): () => void
  onServerRequest(
    handler: (
      request: CodexAppServerTransportServerRequest,
    ) => unknown | Promise<unknown>,
  ): () => void
  close(): Promise<void>
}

export type CreateCodexAppServerStdioTransportInput = {
  executable?: string
  env?: NodeJS.ProcessEnv
  cwd?: string
  spawnProcess?: typeof spawn
}

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function protocolErrorMessage(message: CodexAppServerProtocolResponse): string {
  return message.error?.message || "Codex app-server request failed."
}

function writeJsonLine(
  child: ChildProcessWithoutNullStreams,
  message:
    | CodexAppServerProtocolRequest
    | CodexAppServerProtocolNotification
    | CodexAppServerProtocolResponse,
): void {
  child.stdin.write(`${JSON.stringify(message)}\n`)
}

function redactedProcessErrorMessage(stderr: string, fallback: string): string {
  const rawMessage = stderr.trim() || fallback
  const redacted = redactRuntimePayload(rawMessage, {
    runtimeId: "codex",
    runId: "codex-app-server-transport",
    source: "runtime-diagnostic",
  }).payload
  const message = typeof redacted === "string" ? redacted : fallback
  return message.length > 1000 ? `${message.slice(0, 1000)}...` : message
}

export function createCodexAppServerStdioTransport({
  executable = resolveBundledCodexCliPath(),
  env,
  cwd,
  spawnProcess = spawn,
}: CreateCodexAppServerStdioTransportInput = {}): CodexAppServerTransport {
  const child = spawnProcess(executable, ["app-server", "--listen", "stdio://"], {
    cwd,
    env,
    stdio: "pipe",
  }) as ChildProcessWithoutNullStreams
  let nextId = 1
  let stderr = ""
  const pending = new Map<CodexAppServerMessageId, PendingRequest>()
  const notificationHandlers = new Set<
    (notification: CodexAppServerTransportNotification) => void
  >()
  const serverRequestHandlers = new Set<
    (request: CodexAppServerTransportServerRequest) => unknown | Promise<unknown>
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
      const id = parsed.id as CodexAppServerMessageId
      const waiter = pending.get(id)
      if (!waiter) return
      pending.delete(id)
      const response = parsed as CodexAppServerProtocolResponse
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
        id: parsed.id as CodexAppServerMessageId,
        method: parsed.method,
        params: parsed.params,
      }
      void Promise.resolve()
        .then(async () => {
          const [handler] = [...serverRequestHandlers]
          if (!handler) {
            throw new Error(
              `No Codex app-server handler installed for ${request.method}.`,
            )
          }
          return handler(request)
        })
        .then((result) => {
          writeJsonLine(child, {
            id: request.id,
            result,
          })
        })
        .catch((error) => {
          writeJsonLine(child, {
            id: request.id,
            error: {
              code: -32000,
              message: error instanceof Error ? error.message : String(error),
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
    const message = redactedProcessErrorMessage(
      stderr,
      `Codex app-server exited before completing requests (code=${code}, signal=${signal}).`,
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
          id,
          method,
          params,
        })
      })
    },

    notify(method, params) {
      writeJsonLine(child, {
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

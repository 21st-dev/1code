import type { Readable, Writable } from "node:stream"

export type CodexAppServerJsonRpcId = string | number

export interface CodexAppServerRpcNotification {
  method: string
  params?: unknown
}

export interface CodexAppServerRpcRequest
  extends CodexAppServerRpcNotification {
  id: CodexAppServerJsonRpcId
}

export interface CodexAppServerRpcErrorShape {
  code: number
  message: string
  data?: unknown
}

export interface CodexAppServerRpcClientOptions {
  stdin: Writable
  stdout: Readable
  stderr?: Readable | null
  signal?: AbortSignal | null
  onNotification?: (notification: CodexAppServerRpcNotification) => void
  onRequest?: (request: CodexAppServerRpcRequest) => void
  onStderrLine?: (line: string) => void
  onProtocolError?: (error: Error) => void
}

interface PendingRpcRequest {
  method: string
  resolve(value: unknown): void
  reject(error: Error): void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isJsonRpcId(value: unknown): value is CodexAppServerJsonRpcId {
  return typeof value === "string" || typeof value === "number"
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

function errorFromRpcResponse(
  method: string,
  requestId: string,
  error: unknown,
): Error {
  if (isRecord(error)) {
    const message =
      typeof error.message === "string"
        ? error.message
        : `Codex app-server request ${method} failed.`
    const code = typeof error.code === "number" ? error.code : undefined
    const details = code === undefined ? message : `${message} (${code})`
    return new Error(`Codex app-server request ${method} failed for id ${requestId}: ${details}`)
  }

  return new Error(`Codex app-server request ${method} failed for id ${requestId}.`)
}

export function codexAppServerMethodNotFoundError(
  method: string,
): CodexAppServerRpcErrorShape {
  return {
    code: -32601,
    message: `Method not found: ${method}`,
  }
}

export function codexAppServerInvalidParamsError(
  message: string,
  data?: unknown,
): CodexAppServerRpcErrorShape {
  return {
    code: -32602,
    message,
    ...(data !== undefined ? { data } : {}),
  }
}

export class CodexAppServerRpcClient {
  private nextRequestId = 1
  private stdoutRemainder = ""
  private stderrRemainder = ""
  private closed = false
  private readonly pending = new Map<string, PendingRpcRequest>()
  private readonly abortListener: (() => void) | undefined

  constructor(private readonly options: CodexAppServerRpcClientOptions) {
    this.options.stdout.on("data", this.handleStdoutData)
    this.options.stdout.on("error", this.handleStreamError)
    this.options.stdout.on("end", this.handleStreamEnd)
    this.options.stdout.on("close", this.handleStreamEnd)

    this.options.stderr?.on("data", this.handleStderrData)
    this.options.stderr?.on("error", this.handleProtocolError)

    if (this.options.signal) {
      this.abortListener = () => {
        this.close(new Error("Codex app-server request was aborted."))
      }
      if (this.options.signal.aborted) {
        this.abortListener()
      } else {
        this.options.signal.addEventListener("abort", this.abortListener, { once: true })
      }
    }
  }

  request(method: string, params?: unknown): Promise<unknown> {
    if (this.closed) {
      return Promise.reject(new Error("Codex app-server RPC client is closed."))
    }

    const id = this.nextRequestId++
    const requestId = String(id)
    const message: Record<string, unknown> = { id, method }
    if (params !== undefined) message.params = params

    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { method, resolve, reject })
      try {
        this.writeMessage(message)
      } catch (error) {
        this.pending.delete(requestId)
        reject(toError(error))
      }
    })
  }

  notify(method: string, params?: unknown): void {
    const message: Record<string, unknown> = { method }
    if (params !== undefined) message.params = params
    this.writeMessage(message)
  }

  respond(id: CodexAppServerJsonRpcId, result: unknown): void {
    this.writeMessage({
      id,
      ...(result !== undefined ? { result } : {}),
    })
  }

  respondError(
    id: CodexAppServerJsonRpcId,
    error: CodexAppServerRpcErrorShape,
  ): void {
    this.writeMessage({ id, error })
  }

  close(error?: Error): void {
    if (this.closed) return
    this.closed = true
    this.options.stdout.off("data", this.handleStdoutData)
    this.options.stdout.off("error", this.handleStreamError)
    this.options.stdout.off("end", this.handleStreamEnd)
    this.options.stdout.off("close", this.handleStreamEnd)
    this.options.stderr?.off("data", this.handleStderrData)
    this.options.stderr?.off("error", this.handleProtocolError)
    if (this.options.signal && this.abortListener) {
      this.options.signal.removeEventListener("abort", this.abortListener)
    }

    const closeError = error ?? new Error("Codex app-server RPC client closed.")
    for (const pending of this.pending.values()) {
      pending.reject(closeError)
    }
    this.pending.clear()
  }

  private writeMessage(message: Record<string, unknown>): void {
    if (this.closed) {
      throw new Error("Codex app-server RPC client is closed.")
    }

    this.options.stdin.write(`${JSON.stringify(message)}\n`)
  }

  private readonly handleStdoutData = (chunk: Buffer | string): void => {
    this.stdoutRemainder = this.consumeJsonLines(
      this.stdoutRemainder + chunk.toString(),
      this.handleWireLine,
    )
  }

  private readonly handleStderrData = (chunk: Buffer | string): void => {
    this.stderrRemainder = this.consumeJsonLines(
      this.stderrRemainder + chunk.toString(),
      (line) => this.options.onStderrLine?.(line),
    )
  }

  private consumeJsonLines(
    value: string,
    onLine: (line: string) => void,
  ): string {
    const lines = value.split("\n")
    const remainder = lines.pop() ?? ""
    for (const rawLine of lines) {
      const line = rawLine.replace(/\r$/, "")
      if (line.trim()) onLine(line)
    }
    return remainder
  }

  private readonly handleWireLine = (line: string): void => {
    let decoded: unknown
    try {
      decoded = JSON.parse(line)
    } catch (error) {
      this.handleProtocolError(
        new Error(`Failed to parse Codex app-server JSON line: ${toError(error).message}`),
      )
      return
    }

    if (!isRecord(decoded)) {
      this.handleProtocolError(new Error("Codex app-server message must be an object."))
      return
    }

    if (isJsonRpcId(decoded.id) && ("result" in decoded || "error" in decoded)) {
      this.handleResponse(decoded)
      return
    }

    if (typeof decoded.method === "string" && isJsonRpcId(decoded.id)) {
      this.options.onRequest?.({
        id: decoded.id,
        method: decoded.method,
        ...(decoded.params !== undefined ? { params: decoded.params } : {}),
      })
      return
    }

    if (typeof decoded.method === "string" && !("id" in decoded)) {
      this.options.onNotification?.({
        method: decoded.method,
        ...(decoded.params !== undefined ? { params: decoded.params } : {}),
      })
      return
    }

    this.handleProtocolError(
      new Error("Codex app-server message was not a response, request, or notification."),
    )
  }

  private handleResponse(message: Record<string, unknown>): void {
    const id = String(message.id)
    const pending = this.pending.get(id)
    if (!pending) {
      this.handleProtocolError(
        new Error(`Codex app-server response had no pending request for id ${id}.`),
      )
      return
    }

    this.pending.delete(id)
    if ("error" in message && message.error !== undefined) {
      pending.reject(errorFromRpcResponse(pending.method, id, message.error))
      return
    }
    pending.resolve(message.result)
  }

  private readonly handleStreamError = (error: Error): void => {
    this.close(error)
  }

  private readonly handleStreamEnd = (): void => {
    this.close(new Error("Codex app-server stdout closed."))
  }

  private readonly handleProtocolError = (error: Error): void => {
    this.options.onProtocolError?.(error)
  }
}

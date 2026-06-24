import { redactRuntimePayload } from "../agent-runtime/redaction"
import {
  KUN_FILE_ONLY_SANDBOX_MODE,
  type KunServeSandboxMode,
} from "./kun-serve-launcher"

export type KunRuntimeEvent = Record<string, unknown> & {
  kind?: string
  seq?: number
  threadId?: string
  turnId?: string
}

export type KunThreadResponse = {
  id: string
}

export type KunStartTurnResponse = {
  threadId: string
  turnId: string
  userMessageItemId?: string
}

export type KunHttpSseTransportInput = {
  baseUrl: string
  runtimeToken: string
  sandboxMode?: KunServeSandboxMode
  fetchImpl?: typeof fetch
}

export class KunHttpSseTransport {
  private readonly baseUrl: string
  private readonly runtimeToken: string
  private readonly sandboxMode: KunServeSandboxMode
  private readonly fetchImpl: typeof fetch

  constructor(input: KunHttpSseTransportInput) {
    this.baseUrl = input.baseUrl.replace(/\/+$/, "")
    this.runtimeToken = input.runtimeToken
    this.sandboxMode = input.sandboxMode ?? KUN_FILE_ONLY_SANDBOX_MODE
    this.fetchImpl = input.fetchImpl ?? fetch
  }

  async createThread(input: {
    workspace: string
    model: string
    mode: "agent" | "plan"
    signal: AbortSignal
  }): Promise<KunThreadResponse> {
    const json = await this.requestJson("/v1/threads", {
      method: "POST",
      signal: input.signal,
      body: {
        workspace: input.workspace,
        model: input.model,
        mode: input.mode,
        approvalPolicy: "on-request",
        sandboxMode: this.sandboxMode,
      },
    })
    const id = getString(json, "id")
    if (!id) throw new Error("Kun create thread response did not include id.")
    return { id }
  }

  async startTurn(input: {
    threadId: string
    prompt: string
    mode: "agent" | "plan"
    model?: string | null
    signal: AbortSignal
  }): Promise<KunStartTurnResponse> {
    const json = await this.requestJson(
      `/v1/threads/${encodeURIComponent(input.threadId)}/turns`,
      {
        method: "POST",
        signal: input.signal,
        body: {
          prompt: input.prompt,
          mode: input.mode,
          model: input.model || undefined,
          approvalPolicy: "on-request",
          sandboxMode: this.sandboxMode,
        },
      },
    )
    const threadId = getString(json, "threadId") ?? input.threadId
    const turnId = getString(json, "turnId")
    if (!turnId) throw new Error("Kun start turn response did not include turnId.")
    return {
      threadId,
      turnId,
      userMessageItemId: getString(json, "userMessageItemId"),
    }
  }

  async interruptTurn(input: {
    threadId: string
    turnId: string
    signal: AbortSignal
  }): Promise<void> {
    await this.requestJson(
      `/v1/threads/${encodeURIComponent(input.threadId)}/turns/${encodeURIComponent(input.turnId)}/interrupt`,
      {
        method: "POST",
        signal: input.signal,
        body: { discard: false },
      },
    )
  }

  async decideApproval(input: {
    approvalId: string
    decision: "allow" | "deny"
    reason?: string | null
    signal: AbortSignal
  }): Promise<void> {
    await this.requestJson(
      `/v1/approvals/${encodeURIComponent(input.approvalId)}`,
      {
        method: "POST",
        signal: input.signal,
        body: {
          decision: input.decision,
          ...(input.reason ? { reason: input.reason } : {}),
        },
      },
    )
  }

  async streamEvents(input: {
    threadId: string
    sinceSeq?: number
    signal: AbortSignal
    onEvent: (event: KunRuntimeEvent) => void
  }): Promise<void> {
    const sinceSeq = input.sinceSeq ?? 0
    const response = await this.fetchImpl(
      `${this.baseUrl}/v1/threads/${encodeURIComponent(input.threadId)}/events?since_seq=${encodeURIComponent(String(sinceSeq))}`,
      {
        method: "GET",
        headers: this.authHeaders(),
        signal: input.signal,
      },
    )
    if (!response.ok) {
      throw new Error(
        `Kun event stream failed: HTTP ${response.status} ${await safeResponseText(response, [this.runtimeToken])}`,
      )
    }
    if (!response.body) {
      throw new Error("Kun event stream did not include a response body.")
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    try {
      while (!input.signal.aborted) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let boundary = buffer.indexOf("\n\n")
        while (boundary >= 0) {
          const frame = buffer.slice(0, boundary)
          buffer = buffer.slice(boundary + 2)
          const event = parseSseFrame(frame)
          if (event) input.onEvent(event)
          boundary = buffer.indexOf("\n\n")
        }
      }
    } finally {
      try {
        await reader.cancel()
      } catch {
        // ignore
      }
    }
  }

  private async requestJson(
    path: string,
    input: {
      method: "GET" | "POST" | "PATCH" | "DELETE"
      signal: AbortSignal
      body?: Record<string, unknown>
    },
  ): Promise<Record<string, unknown>> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: input.method,
      headers: {
        ...this.authHeaders(),
        "content-type": "application/json",
      },
      signal: input.signal,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
    })
    if (!response.ok) {
      throw new Error(
        `Kun HTTP request failed: ${input.method} ${path} HTTP ${response.status} ${await safeResponseText(response, [this.runtimeToken])}`,
      )
    }
    const text = await response.text()
    if (!text.trim()) return {}
    const parsed = JSON.parse(text) as unknown
    return isRecord(parsed) ? parsed : {}
  }

  private authHeaders(): Record<string, string> {
    return {
      authorization: `Bearer ${this.runtimeToken}`,
    }
  }
}

function parseSseFrame(frame: string): KunRuntimeEvent | null {
  const dataLines: string[] = []
  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart())
    }
  }
  if (dataLines.length === 0) return null
  const parsed = JSON.parse(dataLines.join("\n")) as unknown
  return isRecord(parsed) ? parsed : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function getString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key]
  return typeof value === "string" ? value : undefined
}

async function safeResponseText(
  response: Response,
  secretHints: readonly string[],
): Promise<string> {
  try {
    const redacted = redactRuntimePayload((await response.text()).slice(0, 500), {
      runtimeId: "kun",
      runId: "kun-http-sse-transport",
      source: "runtime-diagnostic",
      secretHints,
    }).payload
    return typeof redacted === "string" ? redacted : ""
  } catch {
    return ""
  }
}

export const KUN_HTTP_SSE_TRANSPORT_TEST_ONLY = {
  parseSseFrame,
  safeResponseText,
}

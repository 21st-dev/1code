import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { randomBytes } from "node:crypto"
import { appendFileSync } from "node:fs"
import {
  anthropicMessagesToChatCompletions,
  anthropicMessagesToResponses,
  buildProviderChatCompletionBody,
  chatCompletionToAnthropicMessage,
  chatCompletionToResponse,
  resolveProviderChatToolCallForResponses,
  responsesToChatCompletionsWithToolMappings,
  type ProviderProfileNamespaceToolNameMap,
} from "../../../shared/provider-profile-transforms"
import {
  redactProviderSecrets,
} from "../../../shared/provider-profile-security"
import type {
  ProviderDiagnosticCategory,
  ProviderDiagnosticCheck,
  ProviderDiagnosticCheckId,
  ProviderDiagnosticStatus,
  ProviderProfileCapabilities,
  ProviderProfileTestStatus,
} from "../../../shared/provider-profile-types"
import {
  getProviderProfileRuntimeConfig,
  normalizeProviderBaseUrl,
  saveProviderProfile,
  type ProviderProfileRuntimeConfig,
} from "./storage"
import {
  resolveCodexDesktopAdapterSelection,
} from "../codex/desktop-adapter-selection"

type GatewayEndpointKind = "anthropic" | "responses"

type GatewayEndpoint = {
  baseUrl: string
  token: string
  providerId: string
}

type GatewayTokenScope = {
  providerId: string
  kind: GatewayEndpointKind
}

type GatewayToolTracePhase = "incoming" | "forwarded"

const CODEX_REASONING_SUFFIXES = new Set([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
])

const CODEX_GATEWAY_MODEL_IDS = new Set([
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.3-codex",
  "gpt-5.3-codex-spark",
  "gpt-5.2",
])

let serverState:
  | {
      server: ReturnType<typeof createServer>
      origin: string
      tokens: Map<string, GatewayTokenScope>
    }
  | null = null

function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)))
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8")
      if (!text.trim()) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(text))
      } catch (error) {
        reject(error)
      }
    })
    req.on("error", reject)
  })
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
  })
  res.end(JSON.stringify(body))
}

function sendText(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
  })
  res.end(body)
}

function sendModelsList(res: ServerResponse, profile: ProviderProfileRuntimeConfig): void {
  const modelId = profile.defaultModel
  const displayName = profile.defaultModel
  const description = profile.name
    ? `Provider profile: ${profile.name}`
    : "Provider profile model"

  sendJson(res, 200, {
    models: [
      {
        slug: modelId,
        display_name: displayName,
        description,
        default_reasoning_level: "none",
        supported_reasoning_levels: [
          {
            effort: "none",
            description: "Provider profile default",
          },
        ],
        shell_type: "unified_exec",
        visibility: "list",
        supported_in_api: true,
        priority: 0,
        additional_speed_tiers: [],
        service_tiers: [],
        availability_nux: null,
        upgrade: null,
        base_instructions: "",
        model_messages: null,
        supports_reasoning_summaries: false,
        default_reasoning_summary: "none",
        support_verbosity: false,
        default_verbosity: "low",
        apply_patch_tool_type: "freeform",
        web_search_tool_type: "text",
        truncation_policy: {
          mode: "tokens",
          limit: profile.capabilities.vision ? 128000 : 64000,
        },
        supports_parallel_tool_calls: Boolean(profile.capabilities.tools),
        supports_image_detail_original: Boolean(profile.capabilities.vision),
        context_window: profile.capabilities.vision ? 128000 : 64000,
        max_context_window: profile.capabilities.vision ? 128000 : 64000,
        auto_compact_token_limit: null,
        effective_context_window_percent: 100,
        experimental_supported_tools: [],
        input_modalities: profile.capabilities.vision ? ["text", "image"] : ["text"],
        supports_search_tool: false,
      },
    ],
    object: "list",
    data: [
      {
        id: modelId,
        object: "model",
        created: 0,
        owned_by: profile.name || "provider-profile",
      },
    ],
  })
}

function summarizeGatewayTools(tools: unknown): Array<{
  type: string | null
  name: string | null
  hasParameters: boolean
  nestedTools?: Array<{
    type: string | null
    name: string | null
    hasParameters: boolean
  }>
}> {
  if (!Array.isArray(tools)) return []
  return tools.map((tool) => {
    const record = tool && typeof tool === "object" ? (tool as Record<string, any>) : {}
    const fn = record.function && typeof record.function === "object"
      ? (record.function as Record<string, any>)
      : null
    const nestedTools = Array.isArray(record.tools)
      ? summarizeGatewayTools(record.tools)
      : undefined
    return {
      type: typeof record.type === "string" ? record.type : null,
      name:
        typeof record.name === "string"
          ? record.name
          : typeof fn?.name === "string"
            ? fn.name
            : null,
      hasParameters: Boolean(record.parameters || fn?.parameters || record.input_schema || record.inputSchema),
      ...(nestedTools ? { nestedTools } : {}),
    }
  })
}

function summarizeGatewayPayload(body: any): Record<string, unknown> {
  const input = Array.isArray(body?.input) ? body.input : []
  const messages = Array.isArray(body?.messages) ? body.messages : []
  return {
    keys: Object.keys(body || {}).sort(),
    model: typeof body?.model === "string" ? body.model : null,
    stream: Boolean(body?.stream),
    toolChoiceType:
      typeof body?.tool_choice === "string"
        ? body.tool_choice
        : typeof body?.tool_choice?.type === "string"
          ? body.tool_choice.type
          : null,
    toolCount: Array.isArray(body?.tools) ? body.tools.length : 0,
    tools: summarizeGatewayTools(body?.tools),
    inputKinds: input.map((item: any) => ({
      type: typeof item?.type === "string" ? item.type : null,
      role: typeof item?.role === "string" ? item.role : null,
    })),
    messageRoles: messages.map((message: any) => ({
      role: typeof message?.role === "string" ? message.role : null,
      hasToolCalls: Array.isArray(message?.tool_calls) && message.tool_calls.length > 0,
    })),
  }
}

function recordGatewayToolTrace(input: {
  phase: GatewayToolTracePhase
  endpointKind: GatewayEndpointKind
  upstreamProtocol?: string
  profile: ProviderProfileRuntimeConfig
  body: any
}): void {
  const tracePath = process.env.LOCUS_PROVIDER_GATEWAY_TOOL_TRACE_PATH
  if (!tracePath) return
  try {
    appendFileSync(
      tracePath,
      `${JSON.stringify({
        at: new Date().toISOString(),
        phase: input.phase,
        endpointKind: input.endpointKind,
        upstreamProtocol: input.upstreamProtocol ?? input.profile.protocol,
        profileId: input.profile.id,
        profileProtocol: input.profile.protocol,
        payload: summarizeGatewayPayload(input.body),
      })}\n`,
      "utf8",
    )
  } catch {
    // Diagnostics must never affect provider gateway behavior.
  }
}

function resolveProviderModel(
  profile: ProviderProfileRuntimeConfig,
  requestedModel: unknown,
): string {
  if (typeof requestedModel !== "string" || !requestedModel.trim()) {
    return profile.defaultModel
  }

  const normalized = requestedModel.trim()
  const [baseModel, reasoningSuffix] = normalized.split("/")
  if (
    baseModel &&
    CODEX_GATEWAY_MODEL_IDS.has(baseModel) &&
    (!reasoningSuffix || CODEX_REASONING_SUFFIXES.has(reasoningSuffix))
  ) {
    return profile.defaultModel
  }

  for (const suffix of CODEX_REASONING_SUFFIXES) {
    if (normalized === `${profile.defaultModel}/${suffix}`) {
      return profile.defaultModel
    }
  }

  return normalized
}

function writeSse(res: ServerResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

function anthropicStopReason(finishReason?: string | null): string {
  if (finishReason === "length") return "max_tokens"
  if (finishReason === "tool_calls") return "tool_use"
  return "end_turn"
}

function createResponseEnvelope(params: {
  id: string
  status: "in_progress" | "completed"
  model: string
  output: any[]
}) {
  return {
    id: params.id,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status: params.status,
    model: params.model,
    output: params.output,
  }
}

function responseHeadersToRecord(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {}
  headers.forEach((value, key) => {
    result[key] = value
  })
  return result
}

function readGatewayAuthToken(req: IncomingMessage): string | null {
  const authorization = req.headers.authorization
  const xApiKey = req.headers["x-api-key"]
  const authorizationValues = Array.isArray(authorization)
    ? authorization
    : authorization
      ? [authorization]
      : []
  for (const value of authorizationValues) {
    const match = value.match(/^Bearer\s+(.+)$/i)
    if (match?.[1]?.trim()) return match[1].trim()
  }
  if (typeof xApiKey === "string" && xApiKey.trim()) return xApiKey.trim()
  if (Array.isArray(xApiKey)) {
    const value = xApiKey.find((item) => item.trim())
    if (value) return value.trim()
  }
  return null
}

function hasScopedGatewayAuth(params: {
  req: IncomingMessage
  tokens: Map<string, GatewayTokenScope>
  providerId: string
  kind: GatewayEndpointKind
}): boolean {
  const token = readGatewayAuthToken(params.req)
  if (!token) return false
  const scope = params.tokens.get(token)
  return scope?.providerId === params.providerId && scope.kind === params.kind
}

function appendPath(baseUrl: string, path: string): string {
  const normalizedBase = normalizeProviderBaseUrl(baseUrl)
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  return `${normalizedBase}${normalizedPath}`
}

function upstreamHeaders(profile: ProviderProfileRuntimeConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...profile.headers,
  }

  if (profile.authMode === "bearer" && profile.token) {
    headers.authorization = `Bearer ${profile.token}`
  } else if (profile.authMode === "x-api-key" && profile.token) {
    headers["x-api-key"] = profile.token
  }

  if (profile.protocol === "anthropic" && !headers["anthropic-version"]) {
    headers["anthropic-version"] = "2023-06-01"
  }

  return headers
}

function getProviderRedactionValues(
  profile: ProviderProfileRuntimeConfig,
  extra: Array<string | null | undefined> = [],
): string[] {
  const values = [
    profile.token,
    profile.token ? `Bearer ${profile.token}` : null,
    ...Object.values(profile.headers || {}),
    ...extra,
  ]
  return values.filter((value): value is string => Boolean(value?.trim()))
}

function sanitizeError(
  error: unknown,
  exactSecrets: Array<string | null | undefined> = [],
): string {
  return redactProviderSecrets(error, exactSecrets)
}

async function forwardJson(params: {
  profile: ProviderProfileRuntimeConfig
  url: string
  body: any
  signal?: AbortSignal
}) {
  const response = await fetch(params.url, {
    method: "POST",
    headers: upstreamHeaders(params.profile),
    body: JSON.stringify(params.body),
    signal: params.signal,
  })
  const text = await response.text()
  let json: any = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { error: text || response.statusText }
  }
  return { response, json }
}

async function sendSanitizedUpstreamError(
  res: ServerResponse,
  upstream: Response,
  profile: ProviderProfileRuntimeConfig,
): Promise<void> {
  let text = ""
  try {
    text = await upstream.text()
  } catch {
    text = ""
  }
  sendJson(res, upstream.status, {
    error: sanitizeError(
      text || upstream.statusText,
      getProviderRedactionValues(profile),
    ),
  })
}

async function pipeDirectUpstreamResponse(params: {
  profile: ProviderProfileRuntimeConfig
  upstream: Response
  res: ServerResponse
}): Promise<void> {
  if (!params.upstream.ok) {
    await sendSanitizedUpstreamError(params.res, params.upstream, params.profile)
    return
  }

  params.res.writeHead(
    params.upstream.status,
    responseHeadersToRecord(params.upstream.headers),
  )
  if (params.upstream.body) {
    await params.upstream.body.pipeTo(
      new WritableStream({
        write(chunk) {
          params.res.write(Buffer.from(chunk))
        },
        close() {
          params.res.end()
        },
        abort(error) {
          params.res.destroy(error)
        },
      }),
    )
  } else {
    params.res.end()
  }
}

function providerDiagnosticCheck(
  id: ProviderDiagnosticCheckId,
  status: ProviderDiagnosticStatus,
  message: string,
  category?: ProviderDiagnosticCategory,
): ProviderDiagnosticCheck {
  return {
    id,
    status,
    message,
    ...(category ? { category } : {}),
  }
}

function getProviderProbe(profile: ProviderProfileRuntimeConfig) {
  const model = profile.defaultModel
  if (profile.protocol === "anthropic") {
    return {
      url: appendPath(profile.baseUrl, "/messages"),
      body: {
        model,
        max_tokens: 16,
        messages: [{ role: "user", content: "Reply OK." }],
      },
    }
  }
  if (profile.protocol === "openai-responses") {
    return {
      url: appendPath(profile.baseUrl, "/responses"),
      body: {
        model,
        input: "Reply OK.",
        max_output_tokens: 16,
      },
    }
  }
  return {
    url: appendPath(profile.baseUrl, "/chat/completions"),
    body: buildProviderChatCompletionBody(profile, {
      model,
      messages: [{ role: "user", content: "Reply OK." }],
      max_tokens: 16,
    }),
  }
}

function getErrorText(json: any, fallback: string): string {
  const error = json?.error
  if (typeof error === "string") return error
  if (typeof error?.message === "string") return error.message
  if (typeof error?.type === "string") return error.type
  return fallback
}

export function classifyProviderDiagnosticFailure(input: {
  status?: number
  message?: string
  errorName?: string
}): ProviderDiagnosticCategory {
  const message = input.message?.toLowerCase() ?? ""
  const status = input.status
  const errorName = input.errorName?.toLowerCase() ?? ""

  if (errorName === "aborterror" || /timeout|timed out|fetch failed|econnrefused|enotfound|network/.test(message)) {
    return "endpoint_unreachable"
  }
  if (status === 401) return "auth_failed"
  if (status === 403) {
    if (/model|permission|access|denied|unauthorized|not authorized/.test(message)) {
      return "model_denied"
    }
    return "auth_failed"
  }
  if (status === 404) {
    if (/model|not found|does not exist/.test(message)) return "model_denied"
    return "protocol_mismatch"
  }
  if (status === 400 || status === 422) {
    if (/model|not found|does not exist|permission|denied|authorized/.test(message)) {
      return "model_denied"
    }
    if (/stream|streaming/.test(message)) return "streaming_unsupported"
    return "protocol_mismatch"
  }
  if (/stream|streaming/.test(message)) return "streaming_unsupported"
  if (/model|not found|does not exist|permission|denied|authorized/.test(message)) {
    return "model_denied"
  }
  return "gateway_failed"
}

function failureCheckId(category: ProviderDiagnosticCategory): ProviderDiagnosticCheckId {
  switch (category) {
    case "endpoint_unreachable":
      return "endpoint"
    case "auth_failed":
      return "auth"
    case "model_denied":
      return "model"
    case "protocol_mismatch":
      return "protocol"
    case "streaming_unsupported":
      return "streaming"
    case "tools_unsupported":
      return "tools"
    case "vision_unsupported":
      return "vision"
    case "runtime_unavailable":
      return "runtime"
    case "codex_app_server_unavailable":
      return "codex_app_server"
    case "gateway_failed":
    default:
      return "gateway"
  }
}

function buildFailureChecks(
  category: ProviderDiagnosticCategory,
  message: string,
): ProviderDiagnosticCheck[] {
  const failedId = failureCheckId(category)
  const ids = [
    "endpoint",
    "auth",
    "model",
    "protocol",
    "streaming",
    "tools",
    "vision",
    "gateway",
    "runtime",
    "codex_app_server",
  ] as const
  const failedIndex = ids.indexOf(failedId)
  const checks: ProviderDiagnosticCheck[] = []
  for (const [index, id] of ids.entries()) {
    if (id === failedId) {
      checks.push(providerDiagnosticCheck(id, "failed", message, category))
    } else {
      checks.push(
        providerDiagnosticCheck(
          id,
          index < failedIndex ? "ok" : "skipped",
          index < failedIndex
            ? "Passed before the failed diagnostic."
            : "Skipped after the first failed required diagnostic.",
        ),
      )
    }
  }
  return checks
}

function inferredCapabilities(profile: ProviderProfileRuntimeConfig): ProviderProfileCapabilities {
  return {
    claude: profile.targetRuntimes.includes("claude"),
    codex: profile.targetRuntimes.includes("codex"),
    helpers: profile.targetRuntimes.includes("helpers"),
    local: profile.targetRuntimes.includes("local"),
    streaming: profile.capabilities.streaming ?? true,
    tools: profile.capabilities.tools,
    vision: profile.capabilities.vision,
  }
}

async function runStreamingDiagnostic(
  profile: ProviderProfileRuntimeConfig,
  signal: AbortSignal,
): Promise<ProviderDiagnosticCheck> {
  if (profile.capabilities.streaming === false) {
    return providerDiagnosticCheck(
      "streaming",
      "unsupported",
      "Streaming is marked unsupported for this profile.",
      "streaming_unsupported",
    )
  }

  const probe = getProviderProbe(profile)
  const response = await fetch(probe.url, {
    method: "POST",
    headers: upstreamHeaders(profile),
    body: JSON.stringify({ ...probe.body, stream: true }),
    signal,
  })

  if (response.ok && response.body) {
    await response.body.cancel().catch(() => undefined)
    return providerDiagnosticCheck("streaming", "ok", "Streaming endpoint accepted a probe request.")
  }

  const text = await response.text().catch(() => response.statusText)
  const category = classifyProviderDiagnosticFailure({
    status: response.status,
    message: text || response.statusText,
  })
  if (category === "streaming_unsupported" || response.status === 400 || response.status === 422) {
    return providerDiagnosticCheck(
      "streaming",
      "unsupported",
      "Streaming probe was not accepted by this provider.",
      "streaming_unsupported",
    )
  }
  return providerDiagnosticCheck(
    "streaming",
    "failed",
    `Streaming probe failed: ${response.statusText || response.status}`,
    category,
  )
}

async function streamChatAsAnthropic(params: {
  profile: ProviderProfileRuntimeConfig
  url: string
  body: any
  res: ServerResponse
}) {
  const redactionValues = getProviderRedactionValues(params.profile)
  const response = await fetch(params.url, {
    method: "POST",
    headers: upstreamHeaders(params.profile),
    body: JSON.stringify({ ...params.body, stream: true }),
  })
  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => response.statusText)
    sendJson(params.res, response.status, {
      error: sanitizeError(text, redactionValues),
    })
    return
  }

  params.res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-store",
    connection: "keep-alive",
  })

  const decoder = new TextDecoder()
  const reader = response.body.getReader()
  let buffer = ""
  const message = {
    id: `msg_${randomBytes(8).toString("hex")}`,
    type: "message",
    role: "assistant",
    model: params.body.model || params.profile.defaultModel,
    content: [],
    stop_reason: null,
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0 },
  }
  let nextContentIndex = 0
  let textIndex: number | null = null
  let textOpen = false
  let finishReason: string | null = null
  const toolBlocks = new Map<
    number,
    {
      index: number
      id: string
      name: string
      pendingArguments: string
      started: boolean
    }
  >()

  writeSse(params.res, "message_start", {
    type: "message_start",
    message,
  })

  const ensureTextBlock = () => {
    if (textOpen) return textIndex ?? 0
    textIndex = nextContentIndex++
    textOpen = true
    writeSse(params.res, "content_block_start", {
      type: "content_block_start",
      index: textIndex,
      content_block: { type: "text", text: "" },
    })
    return textIndex
  }

  const ensureToolBlock = (toolDelta: any) => {
    const upstreamIndex =
      typeof toolDelta?.index === "number" ? toolDelta.index : 0
    let block = toolBlocks.get(upstreamIndex)
    if (!block) {
      block = {
        index: nextContentIndex++,
        id: toolDelta?.id || `call_${randomBytes(8).toString("hex")}`,
        name: toolDelta?.function?.name || "",
        pendingArguments: "",
        started: false,
      }
      toolBlocks.set(upstreamIndex, block)
    }

    if (toolDelta?.id) block.id = toolDelta.id
    if (toolDelta?.function?.name) block.name = toolDelta.function.name
    if (typeof toolDelta?.function?.arguments === "string") {
      block.pendingArguments += toolDelta.function.arguments
    }

    if (!block.started && block.name) {
      block.started = true
      writeSse(params.res, "content_block_start", {
        type: "content_block_start",
        index: block.index,
        content_block: {
          type: "tool_use",
          id: block.id,
          name: block.name,
          input: {},
        },
      })
    }

    if (block.started && block.pendingArguments) {
      writeSse(params.res, "content_block_delta", {
        type: "content_block_delta",
        index: block.index,
        delta: {
          type: "input_json_delta",
          partial_json: block.pendingArguments,
        },
      })
      block.pendingArguments = ""
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split("\n\n")
    buffer = events.pop() || ""
    for (const event of events) {
      for (const line of event.split("\n")) {
        if (!line.startsWith("data:")) continue
        const data = line.slice(5).trim()
        if (!data || data === "[DONE]") continue
        try {
          const chunk = JSON.parse(data)
          const choice = chunk.choices?.[0]
          const delta = choice?.delta || {}
          if (choice?.finish_reason) finishReason = choice.finish_reason

          if (typeof delta.content === "string" && delta.content) {
            const index = ensureTextBlock()
            writeSse(params.res, "content_block_delta", {
              type: "content_block_delta",
              index,
              delta: { type: "text_delta", text: delta.content },
            })
          }

          for (const toolDelta of Array.isArray(delta.tool_calls)
            ? delta.tool_calls
            : []) {
            finishReason = "tool_calls"
            ensureToolBlock(toolDelta)
          }
        } catch {
          // Ignore malformed upstream SSE chunks.
        }
      }
    }
  }

  if (textOpen && textIndex !== null) {
    writeSse(params.res, "content_block_stop", {
      type: "content_block_stop",
      index: textIndex,
    })
  }
  for (const block of [...toolBlocks.values()].sort((a, b) => a.index - b.index)) {
    if (!block.started) {
      writeSse(params.res, "content_block_start", {
        type: "content_block_start",
        index: block.index,
        content_block: {
          type: "tool_use",
          id: block.id,
          name: block.name || "tool",
          input: {},
        },
      })
      if (block.pendingArguments) {
        writeSse(params.res, "content_block_delta", {
          type: "content_block_delta",
          index: block.index,
          delta: {
            type: "input_json_delta",
            partial_json: block.pendingArguments,
          },
        })
        block.pendingArguments = ""
      }
    }
    writeSse(params.res, "content_block_stop", {
      type: "content_block_stop",
      index: block.index,
    })
  }
  writeSse(params.res, "message_delta", {
    type: "message_delta",
    delta: { stop_reason: anthropicStopReason(finishReason), stop_sequence: null },
    usage: { output_tokens: 0 },
  })
  writeSse(params.res, "message_stop", { type: "message_stop" })
  params.res.end()
}

async function streamChatAsResponses(params: {
  profile: ProviderProfileRuntimeConfig
  url: string
  body: any
  namespaceToolNameMap?: ProviderProfileNamespaceToolNameMap
  res: ServerResponse
}) {
  const redactionValues = getProviderRedactionValues(params.profile)
  const response = await fetch(params.url, {
    method: "POST",
    headers: upstreamHeaders(params.profile),
    body: JSON.stringify({ ...params.body, stream: true }),
  })
  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => response.statusText)
    sendJson(params.res, response.status, {
      error: sanitizeError(text, redactionValues),
    })
    return
  }

  params.res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-store",
    connection: "keep-alive",
  })

  const decoder = new TextDecoder()
  const reader = response.body.getReader()
  let buffer = ""
  const responseId = `resp_${randomBytes(8).toString("hex")}`
  const model = params.body.model || params.profile.defaultModel
  const textItemRef: {
    current:
      | {
        id: string
        outputIndex: number
        text: string
        started: boolean
      }
      | null
  } = { current: null }
  const toolItems = new Map<
    number,
    {
      id: string
      outputIndex: number
      callId: string
      name: string
      namespace?: string
      arguments: string
      started: boolean
    }
  >()
  let nextOutputIndex = 0
  let finishReason: string | null = null

  writeSse(params.res, "response.created", {
    type: "response.created",
    response: createResponseEnvelope({
      id: responseId,
      status: "in_progress",
      model,
      output: [],
    }),
  })
  writeSse(params.res, "response.in_progress", {
    type: "response.in_progress",
    response: createResponseEnvelope({
      id: responseId,
      status: "in_progress",
      model,
      output: [],
    }),
  })

  const ensureTextItem = () => {
    if (textItemRef.current) return textItemRef.current
    textItemRef.current = {
      id: `msg_${randomBytes(8).toString("hex")}`,
      outputIndex: nextOutputIndex++,
      text: "",
      started: true,
    }
    const item = {
      id: textItemRef.current.id,
      type: "message",
      role: "assistant",
      status: "in_progress",
      content: [],
    }
    writeSse(params.res, "response.output_item.added", {
      type: "response.output_item.added",
      output_index: textItemRef.current.outputIndex,
      item,
    })
    writeSse(params.res, "response.content_part.added", {
      type: "response.content_part.added",
      item_id: textItemRef.current.id,
      output_index: textItemRef.current.outputIndex,
      content_index: 0,
      part: { type: "output_text", text: "", annotations: [] },
    })
    return textItemRef.current
  }

  const ensureToolItem = (toolDelta: any) => {
    const upstreamIndex =
      typeof toolDelta?.index === "number" ? toolDelta.index : 0
    let item = toolItems.get(upstreamIndex)
    if (!item) {
      const callId = toolDelta?.id || `call_${randomBytes(8).toString("hex")}`
      item = {
        id: `fc_${callId}`,
        outputIndex: nextOutputIndex++,
        callId,
        name: "",
        namespace: undefined,
        arguments: "",
        started: false,
      }
      toolItems.set(upstreamIndex, item)
    }

    if (toolDelta?.id) {
      item.callId = toolDelta.id
      item.id = `fc_${toolDelta.id}`
    }
    if (toolDelta?.function?.name) {
      const resolved = resolveProviderChatToolCallForResponses(
        toolDelta.function.name,
        params.namespaceToolNameMap,
      )
      item.name = resolved.name
      item.namespace = resolved.namespace
    }

    if (!item.started && item.name) {
      item.started = true
      writeSse(params.res, "response.output_item.added", {
        type: "response.output_item.added",
        output_index: item.outputIndex,
        item: {
          id: item.id,
          type: "function_call",
          status: "in_progress",
          call_id: item.callId,
          name: item.name,
          ...(item.namespace ? { namespace: item.namespace } : {}),
          arguments: "",
        },
      })
    }

    const argumentDelta = toolDelta?.function?.arguments
    if (typeof argumentDelta === "string" && argumentDelta) {
      item.arguments += argumentDelta
      if (item.started) {
        writeSse(params.res, "response.function_call_arguments.delta", {
          type: "response.function_call_arguments.delta",
          item_id: item.id,
          output_index: item.outputIndex,
          delta: argumentDelta,
        })
      }
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split("\n\n")
    buffer = events.pop() || ""
    for (const event of events) {
      for (const line of event.split("\n")) {
        if (!line.startsWith("data:")) continue
        const data = line.slice(5).trim()
        if (!data || data === "[DONE]") continue
        try {
          const chunk = JSON.parse(data)
          const choice = chunk.choices?.[0]
          const delta = choice?.delta || {}
          if (choice?.finish_reason) finishReason = choice.finish_reason

          if (typeof delta.content === "string" && delta.content) {
            const item = ensureTextItem()
            item.text += delta.content
            writeSse(params.res, "response.output_text.delta", {
              type: "response.output_text.delta",
              item_id: item.id,
              output_index: item.outputIndex,
              content_index: 0,
              delta: delta.content,
            })
          }

          for (const toolDelta of Array.isArray(delta.tool_calls)
            ? delta.tool_calls
            : []) {
            finishReason = "tool_calls"
            ensureToolItem(toolDelta)
          }
        } catch {
          // Ignore malformed upstream SSE chunks.
        }
      }
    }
  }

  const output: any[] = []
  const completedTextItem = textItemRef.current
  if (completedTextItem) {
    writeSse(params.res, "response.output_text.done", {
      type: "response.output_text.done",
      item_id: completedTextItem.id,
      output_index: completedTextItem.outputIndex,
      content_index: 0,
      text: completedTextItem.text,
    })
    writeSse(params.res, "response.content_part.done", {
      type: "response.content_part.done",
      item_id: completedTextItem.id,
      output_index: completedTextItem.outputIndex,
      content_index: 0,
      part: { type: "output_text", text: completedTextItem.text, annotations: [] },
    })
    const item = {
      id: completedTextItem.id,
      type: "message",
      role: "assistant",
      status: "completed",
      content: [{ type: "output_text", text: completedTextItem.text, annotations: [] }],
    }
    output.push(item)
    writeSse(params.res, "response.output_item.done", {
      type: "response.output_item.done",
      output_index: completedTextItem.outputIndex,
      item,
    })
  }

  for (const item of [...toolItems.values()].sort((a, b) => a.outputIndex - b.outputIndex)) {
    if (!item.started) {
      item.started = true
      writeSse(params.res, "response.output_item.added", {
        type: "response.output_item.added",
        output_index: item.outputIndex,
        item: {
          id: item.id,
          type: "function_call",
          status: "in_progress",
          call_id: item.callId,
          name: item.name || "tool",
          ...(item.namespace ? { namespace: item.namespace } : {}),
          arguments: "",
        },
      })
    }
    writeSse(params.res, "response.function_call_arguments.done", {
      type: "response.function_call_arguments.done",
      item_id: item.id,
      output_index: item.outputIndex,
      arguments: item.arguments || "{}",
    })
    const outputItem = {
      id: item.id,
      type: "function_call",
      status: "completed",
      call_id: item.callId,
      name: item.name || "tool",
      ...(item.namespace ? { namespace: item.namespace } : {}),
      arguments: item.arguments || "{}",
    }
    output.push(outputItem)
    writeSse(params.res, "response.output_item.done", {
      type: "response.output_item.done",
      output_index: item.outputIndex,
      item: outputItem,
    })
  }

  if (output.length === 0 && finishReason !== "tool_calls") {
    const item = {
      id: `msg_${randomBytes(8).toString("hex")}`,
      type: "message",
      role: "assistant",
      status: "completed",
      content: [{ type: "output_text", text: "", annotations: [] }],
    }
    output.push(item)
  }

  writeSse(params.res, "response.completed", {
    type: "response.completed",
    response: createResponseEnvelope({
      id: responseId,
      status: "completed",
      model,
      output,
    }),
  })
  params.res.end()
}

async function handleAnthropicRequest(
  profile: ProviderProfileRuntimeConfig,
  body: any,
  res: ServerResponse,
) {
  const redactionValues = getProviderRedactionValues(profile)
  const model = resolveProviderModel(profile, body.model)
  recordGatewayToolTrace({
    phase: "incoming",
    endpointKind: "anthropic",
    profile,
    body,
  })
  if (profile.protocol === "anthropic") {
    const requestBody = { ...body, model }
    recordGatewayToolTrace({
      phase: "forwarded",
      endpointKind: "anthropic",
      upstreamProtocol: "anthropic",
      profile,
      body: requestBody,
    })
    const upstream = await fetch(appendPath(profile.baseUrl, "/messages"), {
      method: "POST",
      headers: upstreamHeaders(profile),
      body: JSON.stringify(requestBody),
    })
    await pipeDirectUpstreamResponse({ profile, upstream, res })
    return
  }

  if (profile.protocol === "openai-responses") {
    const requestBody = anthropicMessagesToResponses({ ...body, model })
    recordGatewayToolTrace({
      phase: "forwarded",
      endpointKind: "anthropic",
      upstreamProtocol: "openai-responses",
      profile,
      body: requestBody,
    })
    const { response, json } = await forwardJson({
      profile,
      url: appendPath(profile.baseUrl, "/responses"),
      body: requestBody,
    })
    if (!response.ok) {
      sendJson(res, response.status, {
        error: sanitizeError(
          json?.error?.message || json?.error || response.statusText,
          redactionValues,
        ),
      })
      return
    }
    const text =
      json?.output_text ||
      json?.output?.[0]?.content?.find?.((part: any) => part.type === "output_text")?.text ||
      ""
    sendJson(res, 200, {
      id: json.id || `msg_${randomBytes(8).toString("hex")}`,
      type: "message",
      role: "assistant",
      model: json.model || model,
      content: [{ type: "text", text }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: {
        input_tokens: json.usage?.input_tokens || 0,
        output_tokens: json.usage?.output_tokens || 0,
      },
    })
    return
  }

  const chatBody = buildProviderChatCompletionBody(
    profile,
    anthropicMessagesToChatCompletions({ ...body, model }),
  )
  recordGatewayToolTrace({
    phase: "forwarded",
    endpointKind: "anthropic",
    upstreamProtocol: "openai-chat",
    profile,
    body: chatBody,
  })
  if (body.stream) {
    await streamChatAsAnthropic({
      profile,
      url: appendPath(profile.baseUrl, "/chat/completions"),
      body: chatBody,
      res,
    })
    return
  }

  const { response, json } = await forwardJson({
    profile,
    url: appendPath(profile.baseUrl, "/chat/completions"),
    body: chatBody,
  })
  if (!response.ok) {
    sendJson(res, response.status, {
      error: sanitizeError(
        json?.error?.message || json?.error || response.statusText,
        redactionValues,
      ),
    })
    return
  }
  sendJson(res, 200, chatCompletionToAnthropicMessage(json, model))
}

async function handleResponsesRequest(
  profile: ProviderProfileRuntimeConfig,
  body: any,
  res: ServerResponse,
) {
  const redactionValues = getProviderRedactionValues(profile)
  const model = resolveProviderModel(profile, body.model)
  recordGatewayToolTrace({
    phase: "incoming",
    endpointKind: "responses",
    profile,
    body,
  })
  if (profile.protocol === "openai-responses") {
    const requestBody = { ...body, model }
    recordGatewayToolTrace({
      phase: "forwarded",
      endpointKind: "responses",
      upstreamProtocol: "openai-responses",
      profile,
      body: requestBody,
    })
    const upstream = await fetch(appendPath(profile.baseUrl, "/responses"), {
      method: "POST",
      headers: upstreamHeaders(profile),
      body: JSON.stringify(requestBody),
    })
    await pipeDirectUpstreamResponse({ profile, upstream, res })
    return
  }

  const chatBridge = responsesToChatCompletionsWithToolMappings({ ...body, model })
  const chatBody = buildProviderChatCompletionBody(
    profile,
    chatBridge.body,
  )
  recordGatewayToolTrace({
    phase: "forwarded",
    endpointKind: "responses",
    upstreamProtocol: "openai-chat",
    profile,
    body: chatBody,
  })
  if (body.stream) {
    await streamChatAsResponses({
      profile,
      url: appendPath(profile.baseUrl, "/chat/completions"),
      body: chatBody,
      namespaceToolNameMap: chatBridge.namespaceToolNameMap,
      res,
    })
    return
  }

  const { response, json } = await forwardJson({
    profile,
    url: appendPath(profile.baseUrl, "/chat/completions"),
    body: chatBody,
  })
  if (!response.ok) {
    sendJson(res, response.status, {
      error: sanitizeError(
        json?.error?.message || json?.error || response.statusText,
        redactionValues,
      ),
    })
    return
  }
  sendJson(
    res,
    200,
    chatCompletionToResponse(json, model, {
      namespaceToolNameMap: chatBridge.namespaceToolNameMap,
    }),
  )
}

async function handleGatewayRequest(req: IncomingMessage, res: ServerResponse) {
  const current = serverState
  if (!current) {
    sendText(res, 503, "Provider gateway unavailable")
    return
  }

  let redactionValues: string[] = []
  try {
    const url = new URL(req.url || "/", current.origin)
    const match = url.pathname.match(
      /^\/profile\/([^/]+)\/(anthropic|responses)\/v1\/(?:v1\/)?(.+)$/,
    )
    if (!match) {
      sendJson(res, 404, { error: "Unknown provider gateway route" })
      return
    }

    const [, profileId, kind, endpoint] = match
    const decodedProfileId = decodeURIComponent(profileId)
    const gatewayKind = kind as GatewayEndpointKind
    if (
      !hasScopedGatewayAuth({
        req,
        tokens: current.tokens,
        providerId: decodedProfileId,
        kind: gatewayKind,
      })
    ) {
      sendJson(res, 401, { error: "Unauthorized provider gateway request" })
      return
    }

    const profile = getProviderProfileRuntimeConfig(decodedProfileId)
    if (!profile) {
      sendJson(res, 404, { error: "Provider profile not found" })
      return
    }
    redactionValues = getProviderRedactionValues(profile)

    if (endpoint === "models" && req.method === "GET") {
      sendModelsList(res, profile)
      return
    }

    const body = await readBody(req)
    if (gatewayKind === "anthropic" && endpoint === "messages") {
      await handleAnthropicRequest(profile, body, res)
      return
    }
    if (gatewayKind === "responses" && endpoint === "responses") {
      await handleResponsesRequest(profile, body, res)
      return
    }
    sendJson(res, 404, { error: "Unsupported provider gateway endpoint" })
  } catch (error) {
    sendJson(res, 500, { error: sanitizeError(error, redactionValues) })
  }
}

async function ensureProviderGateway() {
  if (serverState) return serverState

  const server = createServer((req, res) => {
    void handleGatewayRequest(req, res)
  })

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject)
      resolve()
    })
  })

  const address = server.address()
  if (!address || typeof address === "string") {
    server.close()
    throw new Error("Failed to start provider gateway")
  }

  serverState = {
    server,
    origin: `http://127.0.0.1:${address.port}`,
    tokens: new Map(),
  }
  return serverState
}

export async function getProviderGatewayEndpoint(
  providerId: string,
  kind: GatewayEndpointKind,
): Promise<GatewayEndpoint> {
  const gateway = await ensureProviderGateway()
  const token = randomBytes(32).toString("hex")
  gateway.tokens.set(token, { providerId, kind })
  return {
    baseUrl: `${gateway.origin}/profile/${encodeURIComponent(providerId)}/${kind}/v1`,
    token,
    providerId,
  }
}

export async function runProviderProfileDiagnostics(
  profile: ProviderProfileRuntimeConfig,
): Promise<ProviderProfileTestStatus> {
  const checkedAt = new Date().toISOString()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 15_000)
  const redactionValues = getProviderRedactionValues(profile)

  try {
    const probe = getProviderProbe(profile)
    const { response, json } = await forwardJson({
      profile,
      url: probe.url,
      body: probe.body,
      signal: controller.signal,
    })
    if (!response.ok) {
      const errorMessage = getErrorText(json, response.statusText)
      const category = classifyProviderDiagnosticFailure({
        status: response.status,
        message: errorMessage,
      })
      const message = sanitizeError(errorMessage, redactionValues)
      const status = {
        ok: false,
        checkedAt,
        message,
        diagnosticVersion: 1 as const,
        category,
        checks: buildFailureChecks(category, message),
        capabilities: profile.capabilities,
      }
      return status
    }

    const capabilities = inferredCapabilities(profile)
    const checks: ProviderDiagnosticCheck[] = [
      providerDiagnosticCheck("endpoint", "ok", "Endpoint accepted a diagnostic request."),
      providerDiagnosticCheck("auth", "ok", "Authentication was accepted."),
      providerDiagnosticCheck("model", "ok", "Model accepted a diagnostic request."),
      providerDiagnosticCheck("protocol", "ok", `${profile.protocol} protocol probe succeeded.`),
    ]

    const streamingCheck = await runStreamingDiagnostic(profile, controller.signal)
    checks.push(streamingCheck)
    checks.push(
      profile.capabilities.tools
        ? providerDiagnosticCheck("tools", "ok", "Tool calling is advertised for this profile.")
        : providerDiagnosticCheck(
            "tools",
            "unsupported",
            "Tool calling is not advertised for this profile.",
            "tools_unsupported",
          ),
    )
    checks.push(
      profile.capabilities.vision
        ? providerDiagnosticCheck("vision", "ok", "Vision is advertised for this profile.")
        : providerDiagnosticCheck(
            "vision",
            "unsupported",
            "Vision is not advertised for this profile.",
            "vision_unsupported",
          ),
    )

    if (profile.targetRuntimes.some((target) => target === "claude" || target === "codex")) {
      const gateway = await ensureProviderGateway()
      checks.push(
        providerDiagnosticCheck(
          "gateway",
          "ok",
          `Local provider gateway is available on ${gateway.origin}.`,
        ),
      )
    } else {
      checks.push(
        providerDiagnosticCheck(
          "gateway",
          "skipped",
          "Gateway check skipped because no Claude or Codex runtime target is selected.",
        ),
      )
    }

    checks.push(
      providerDiagnosticCheck(
        "runtime",
        "ok",
        `Runtime targets: ${profile.targetRuntimes.join(", ")}.`,
      ),
    )

    if (profile.targetRuntimes.includes("codex")) {
      const codexAdapterSelection =
        resolveCodexDesktopAdapterSelection(process.env)
      checks.push(
        codexAdapterSelection.useAppServer
          ? providerDiagnosticCheck(
              "codex_app_server",
              "ok",
              "Codex app-server adapter is selected for this process; readiness is validated by app-server runtime smoke evidence.",
            )
          : providerDiagnosticCheck(
              "codex_app_server",
              "skipped",
              `Codex app-server readiness check skipped because ${codexAdapterSelection.reason}`,
              "codex_app_server_unavailable",
            ),
      )
    } else {
      checks.push(
        providerDiagnosticCheck(
          "codex_app_server",
          "skipped",
          "Codex app-server readiness check skipped because Codex is not a target runtime.",
        ),
      )
    }

    const failedCheck = checks.find((check) => check.status === "failed")
    const category = failedCheck?.category
    const ok = !failedCheck

    const status = {
      ok,
      checkedAt,
      message: ok
        ? "Provider diagnostics completed"
        : failedCheck?.message ?? "Provider diagnostics failed",
      diagnosticVersion: 1 as const,
      ...(category ? { category } : {}),
      checks,
      capabilities,
    }
    return status
  } catch (error) {
    const category = classifyProviderDiagnosticFailure({
      message: error instanceof Error ? error.message : String(error),
      errorName: error instanceof Error ? error.name : undefined,
    })
    const message = sanitizeError(error, redactionValues)
    const status = {
      ok: false,
      checkedAt,
      message,
      diagnosticVersion: 1 as const,
      category,
      checks: buildFailureChecks(category, message),
      capabilities: profile.capabilities,
    }
    return status
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function testProviderProfile(
  profile: ProviderProfileRuntimeConfig,
): Promise<ProviderProfileTestStatus> {
  const status = await runProviderProfileDiagnostics(profile)
  saveProviderProfile({
    ...profile,
    token: profile.token || undefined,
    ...(status.capabilities ? { capabilities: status.capabilities } : {}),
    lastTestStatus: status,
  })
  return status
}

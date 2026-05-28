import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { randomBytes } from "node:crypto"
import {
  anthropicMessagesToChatCompletions,
  anthropicMessagesToResponses,
  buildProviderChatCompletionBody,
  chatCompletionToAnthropicMessage,
  chatCompletionToResponse,
  responsesToChatCompletions,
} from "../../../shared/provider-profile-transforms"
import {
  hasProviderGatewayAuthHeader,
  redactProviderSecrets,
} from "../../../shared/provider-profile-security"
import type { ProviderProfileTestStatus } from "../../../shared/provider-profile-types"
import {
  getProviderProfileRuntimeConfig,
  normalizeProviderBaseUrl,
  saveProviderProfile,
  type ProviderProfileRuntimeConfig,
} from "./storage"

type GatewayEndpointKind = "anthropic" | "responses"

type GatewayEndpoint = {
  baseUrl: string
  token: string
  providerId: string
}

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
      token: string
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

function hasGatewayAuth(req: IncomingMessage, token: string): boolean {
  return hasProviderGatewayAuthHeader(req.headers, token)
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

function sanitizeError(error: unknown): string {
  return redactProviderSecrets(error)
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

async function streamChatAsAnthropic(params: {
  profile: ProviderProfileRuntimeConfig
  url: string
  body: any
  res: ServerResponse
}) {
  const response = await fetch(params.url, {
    method: "POST",
    headers: upstreamHeaders(params.profile),
    body: JSON.stringify({ ...params.body, stream: true }),
  })
  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => response.statusText)
    sendJson(params.res, response.status, { error: sanitizeError(text) })
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
  res: ServerResponse
}) {
  const response = await fetch(params.url, {
    method: "POST",
    headers: upstreamHeaders(params.profile),
    body: JSON.stringify({ ...params.body, stream: true }),
  })
  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => response.statusText)
    sendJson(params.res, response.status, { error: sanitizeError(text) })
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
        name: toolDelta?.function?.name || "",
        arguments: "",
        started: false,
      }
      toolItems.set(upstreamIndex, item)
    }

    if (toolDelta?.id) {
      item.callId = toolDelta.id
      item.id = `fc_${toolDelta.id}`
    }
    if (toolDelta?.function?.name) item.name = toolDelta.function.name

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
  const model = resolveProviderModel(profile, body.model)
  if (profile.protocol === "anthropic") {
    const upstream = await fetch(appendPath(profile.baseUrl, "/messages"), {
      method: "POST",
      headers: upstreamHeaders(profile),
      body: JSON.stringify({ ...body, model }),
    })
    res.writeHead(upstream.status, responseHeadersToRecord(upstream.headers))
    if (upstream.body) {
      await upstream.body.pipeTo(
        new WritableStream({
          write(chunk) {
            res.write(Buffer.from(chunk))
          },
          close() {
            res.end()
          },
          abort(error) {
            res.destroy(error)
          },
        }),
      )
    } else {
      res.end()
    }
    return
  }

  if (profile.protocol === "openai-responses") {
    const requestBody = anthropicMessagesToResponses({ ...body, model })
    const { response, json } = await forwardJson({
      profile,
      url: appendPath(profile.baseUrl, "/responses"),
      body: requestBody,
    })
    if (!response.ok) {
      sendJson(res, response.status, { error: sanitizeError(json?.error?.message || json?.error || response.statusText) })
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
    sendJson(res, response.status, { error: sanitizeError(json?.error?.message || json?.error || response.statusText) })
    return
  }
  sendJson(res, 200, chatCompletionToAnthropicMessage(json, model))
}

async function handleResponsesRequest(
  profile: ProviderProfileRuntimeConfig,
  body: any,
  res: ServerResponse,
) {
  const model = resolveProviderModel(profile, body.model)
  if (profile.protocol === "openai-responses") {
    const upstream = await fetch(appendPath(profile.baseUrl, "/responses"), {
      method: "POST",
      headers: upstreamHeaders(profile),
      body: JSON.stringify({ ...body, model }),
    })
    res.writeHead(upstream.status, responseHeadersToRecord(upstream.headers))
    if (upstream.body) {
      await upstream.body.pipeTo(
        new WritableStream({
          write(chunk) {
            res.write(Buffer.from(chunk))
          },
          close() {
            res.end()
          },
          abort(error) {
            res.destroy(error)
          },
        }),
      )
    } else {
      res.end()
    }
    return
  }

  const chatBody = buildProviderChatCompletionBody(
    profile,
    responsesToChatCompletions({ ...body, model }),
  )
  if (body.stream) {
    await streamChatAsResponses({
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
    sendJson(res, response.status, { error: sanitizeError(json?.error?.message || json?.error || response.statusText) })
    return
  }
  sendJson(res, 200, chatCompletionToResponse(json, model))
}

async function handleGatewayRequest(req: IncomingMessage, res: ServerResponse) {
  const current = serverState
  if (!current) {
    sendText(res, 503, "Provider gateway unavailable")
    return
  }

  if (!hasGatewayAuth(req, current.token)) {
    sendJson(res, 401, { error: "Unauthorized provider gateway request" })
    return
  }

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
    const profile = getProviderProfileRuntimeConfig(decodeURIComponent(profileId))
    if (!profile) {
      sendJson(res, 404, { error: "Provider profile not found" })
      return
    }

    if (endpoint === "models" && req.method === "GET") {
      sendModelsList(res, profile)
      return
    }

    const body = await readBody(req)
    if (kind === "anthropic" && endpoint === "messages") {
      await handleAnthropicRequest(profile, body, res)
      return
    }
    if (kind === "responses" && endpoint === "responses") {
      await handleResponsesRequest(profile, body, res)
      return
    }
    sendJson(res, 404, { error: "Unsupported provider gateway endpoint" })
  } catch (error) {
    sendJson(res, 500, { error: sanitizeError(error) })
  }
}

async function ensureProviderGateway() {
  if (serverState) return serverState

  const token = randomBytes(32).toString("hex")
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
    token,
  }
  return serverState
}

export async function getProviderGatewayEndpoint(
  providerId: string,
  kind: GatewayEndpointKind,
): Promise<GatewayEndpoint> {
  const gateway = await ensureProviderGateway()
  return {
    baseUrl: `${gateway.origin}/profile/${encodeURIComponent(providerId)}/${kind}/v1`,
    token: gateway.token,
    providerId,
  }
}

export async function testProviderProfile(
  profile: ProviderProfileRuntimeConfig,
): Promise<ProviderProfileTestStatus> {
  const checkedAt = new Date().toISOString()
  const model = profile.defaultModel
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 15_000)

  try {
    if (profile.protocol === "anthropic") {
      const { response, json } = await forwardJson({
        profile,
        url: appendPath(profile.baseUrl, "/messages"),
        body: {
          model,
          max_tokens: 16,
          messages: [{ role: "user", content: "Reply OK." }],
        },
        signal: controller.signal,
      })
      if (!response.ok) {
        throw new Error(json?.error?.message || json?.error || response.statusText)
      }
    } else if (profile.protocol === "openai-responses") {
      const { response, json } = await forwardJson({
        profile,
        url: appendPath(profile.baseUrl, "/responses"),
        body: {
          model,
          input: "Reply OK.",
          max_output_tokens: 16,
        },
        signal: controller.signal,
      })
      if (!response.ok) {
        throw new Error(json?.error?.message || json?.error || response.statusText)
      }
    } else {
      const { response, json } = await forwardJson({
        profile,
        url: appendPath(profile.baseUrl, "/chat/completions"),
        body: buildProviderChatCompletionBody(profile, {
          model,
          messages: [{ role: "user", content: "Reply OK." }],
          max_tokens: 16,
        }),
        signal: controller.signal,
      })
      if (!response.ok) {
        throw new Error(json?.error?.message || json?.error || response.statusText)
      }
    }

    const capabilities = {
      claude: profile.targetRuntimes.includes("claude"),
      codex: profile.targetRuntimes.includes("codex"),
      helpers: profile.targetRuntimes.includes("helpers"),
      local: profile.targetRuntimes.includes("local"),
      streaming: profile.capabilities.streaming ?? true,
      tools: profile.capabilities.tools,
      vision: profile.capabilities.vision,
    }

    const status = {
      ok: true,
      checkedAt,
      message: "Provider test succeeded",
      capabilities,
    }
    saveProviderProfile({
      ...profile,
      token: profile.token || undefined,
      capabilities,
      lastTestStatus: status,
    })
    return status
  } catch (error) {
    const status = {
      ok: false,
      checkedAt,
      message: sanitizeError(error),
      capabilities: profile.capabilities,
    }
    saveProviderProfile({
      ...profile,
      token: profile.token || undefined,
      lastTestStatus: status,
    })
    return status
  } finally {
    clearTimeout(timeoutId)
  }
}

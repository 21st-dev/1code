type AnyRecord = Record<string, any>

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : []
}

function contentToText(content: unknown): string {
  if (typeof content === "string") return content
  if (typeof content === "number" || typeof content === "boolean") {
    return String(content)
  }
  if (!Array.isArray(content)) return ""

  return content
    .map((part) => {
      if (typeof part === "string") return part
      if (!part || typeof part !== "object") return ""
      const p = part as AnyRecord
      if (typeof p.text === "string") return p.text
      if (typeof p.output_text === "string") return p.output_text
      if (typeof p.output === "string") return p.output
      if (typeof p.content === "string") return p.content
      if (Array.isArray(p.content)) return contentToText(p.content)
      return ""
    })
    .filter(Boolean)
    .join("\n")
}

function parseJsonObject(value: unknown): AnyRecord {
  if (!value) return {}
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as AnyRecord
  }
  if (typeof value !== "string") return {}

  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {}
  } catch {
    return {}
  }
}

function stringifyArguments(value: unknown): string {
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value ?? {})
  } catch {
    return "{}"
  }
}

function anthropicToolUseToOpenAiToolCall(part: AnyRecord): AnyRecord | null {
  if (part.type !== "tool_use" || typeof part.name !== "string") {
    return null
  }

  return {
    id: typeof part.id === "string" && part.id ? part.id : `call_${crypto.randomUUID()}`,
    type: "function",
    function: {
      name: part.name,
      arguments: stringifyArguments(part.input),
    },
  }
}

function chatToolCallToAnthropicContent(part: AnyRecord): AnyRecord | null {
  const fn = part.function || {}
  const name = typeof fn.name === "string" ? fn.name : undefined
  if (!name) return null

  return {
    type: "tool_use",
    id: typeof part.id === "string" && part.id ? part.id : `call_${crypto.randomUUID()}`,
    name,
    input: parseJsonObject(fn.arguments),
  }
}

function chatToolCallToResponsesOutput(part: AnyRecord): AnyRecord | null {
  const fn = part.function || {}
  const name = typeof fn.name === "string" ? fn.name : undefined
  if (!name) return null
  const callId =
    typeof part.id === "string" && part.id ? part.id : `call_${crypto.randomUUID()}`

  return {
    id: `fc_${callId}`,
    type: "function_call",
    status: "completed",
    call_id: callId,
    name,
    arguments: typeof fn.arguments === "string" ? fn.arguments : "{}",
  }
}

function normalizeChatMessages(input: unknown): AnyRecord[] {
  if (!Array.isArray(input)) return []

  const result: AnyRecord[] = []

  for (const message of input) {
    const m = message as AnyRecord
    const contentParts = asArray(m.content)
    const toolResults = contentParts.filter(
      (part) => part?.type === "tool_result" && typeof part.tool_use_id === "string",
    )

    if (toolResults.length > 0) {
      result.push(...toolResults.map((part) => ({
        role: "tool",
        tool_call_id: part.tool_use_id,
        content: contentToText(part.content),
      })))
      const text = contentToText(
        contentParts.filter((part) => part?.type !== "tool_result"),
      )
      if (text) {
        result.push({ role: "user", content: text })
      }
      continue
    }

    const role = m.role === "assistant" || m.role === "system" ? m.role : "user"
    const toolCalls =
      role === "assistant"
        ? contentParts
            .map((part) => anthropicToolUseToOpenAiToolCall(part as AnyRecord))
            .filter((part): part is AnyRecord => Boolean(part))
        : []
    const content = contentToText(
      contentParts.filter((part) => part?.type !== "tool_use"),
    )

    result.push({
      role,
      content,
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    })
  }

  return result
}

function responsesToolToChatTool(tool: AnyRecord): AnyRecord | null {
  if (tool?.type !== "function") return null
  if (tool.function?.name) return tool
  if (!tool.name) return null

  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description || "",
      parameters: tool.parameters || {
        type: "object",
        properties: {},
      },
    },
  }
}

function chatToolToResponsesTool(tool: AnyRecord): AnyRecord | null {
  if (tool?.type !== "function") return null
  if (tool.name) return tool
  const fn = tool.function
  if (!fn?.name) return null

  return {
    type: "function",
    name: fn.name,
    description: fn.description || "",
    parameters: fn.parameters || {
      type: "object",
      properties: {},
    },
  }
}

export function anthropicMessagesToChatCompletions(body: AnyRecord): AnyRecord {
  const messages: AnyRecord[] = []
  const system = contentToText(body.system)

  if (system) {
    messages.push({ role: "system", content: system })
  }

  messages.push(...normalizeChatMessages(body.messages))

  const tools = asArray(body.tools)
    .map((tool) => {
      if (!tool?.name) return null
      return {
        type: "function",
        function: {
          name: tool.name,
          description: tool.description || "",
          parameters: tool.input_schema || tool.inputSchema || {
            type: "object",
            properties: {},
          },
        },
      }
    })
    .filter(Boolean)

  return {
    model: body.model,
    messages,
    ...(body.max_tokens ? { max_tokens: body.max_tokens } : {}),
    ...(body.temperature !== undefined ? { temperature: body.temperature } : {}),
    ...(body.top_p !== undefined ? { top_p: body.top_p } : {}),
    ...(body.stream !== undefined ? { stream: body.stream } : {}),
    ...(tools.length > 0 ? { tools } : {}),
  }
}

export function anthropicMessagesToResponses(body: AnyRecord): AnyRecord {
  const chat = anthropicMessagesToChatCompletions(body)
  const instructions = chat.messages
    .filter((message: AnyRecord) => message.role === "system")
    .map((message: AnyRecord) => message.content)
    .join("\n")

  return {
    model: body.model,
    input: chat.messages
      .filter((message: AnyRecord) => message.role !== "system")
      .map((message: AnyRecord) => ({
        role: message.role,
        content: [{ type: "input_text", text: message.content }],
      })),
    ...(instructions ? { instructions } : {}),
    ...(body.max_tokens ? { max_output_tokens: body.max_tokens } : {}),
    ...(body.stream !== undefined ? { stream: body.stream } : {}),
    ...(chat.tools
      ? {
          tools: asArray(chat.tools)
            .map((tool) => chatToolToResponsesTool(tool as AnyRecord))
            .filter(Boolean),
        }
      : {}),
  }
}

export function responsesToChatCompletions(body: AnyRecord): AnyRecord {
  const messages: AnyRecord[] = []
  if (typeof body.instructions === "string" && body.instructions.trim()) {
    messages.push({ role: "system", content: body.instructions.trim() })
  }

  const input = Array.isArray(body.input)
    ? body.input
    : typeof body.input === "string"
      ? [{ role: "user", content: body.input }]
      : []

  for (const item of input) {
    if (typeof item === "string") {
      messages.push({ role: "user", content: item })
      continue
    }

    if (item?.type === "function_call_output" && typeof item.call_id === "string") {
      messages.push({
        role: "tool",
        tool_call_id: item.call_id,
        content: contentToText(item.output),
      })
      continue
    }

    if (item?.type === "function_call") {
      const name = typeof item.name === "string" ? item.name : undefined
      if (name) {
        messages.push({
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: item.call_id || item.id || `call_${crypto.randomUUID()}`,
              type: "function",
              function: {
                name,
                arguments: stringifyArguments(item.arguments),
              },
            },
          ],
        })
      }
      continue
    }

    const role = item?.role === "assistant" || item?.role === "system"
      ? item.role
      : "user"
    messages.push({ role, content: contentToText(item?.content) })
  }

  const tools = asArray(body.tools)
    .map((tool) => responsesToolToChatTool(tool as AnyRecord))
    .filter(Boolean)

  return {
    model: body.model,
    messages,
    ...(body.max_output_tokens ? { max_tokens: body.max_output_tokens } : {}),
    ...(body.temperature !== undefined ? { temperature: body.temperature } : {}),
    ...(body.top_p !== undefined ? { top_p: body.top_p } : {}),
    ...(body.stream !== undefined ? { stream: body.stream } : {}),
    ...(tools.length > 0 ? { tools } : {}),
  }
}

export function chatCompletionToAnthropicMessage(
  response: AnyRecord,
  fallbackModel: string,
): AnyRecord {
  const choice = response.choices?.[0]
  const message = choice?.message || {}
  const text = message.content || ""
  const toolBlocks = asArray(message.tool_calls)
    .map((toolCall) => chatToolCallToAnthropicContent(toolCall as AnyRecord))
    .filter(Boolean)
  const content = [
    ...(text ? [{ type: "text", text }] : []),
    ...toolBlocks,
  ]
  return {
    id: response.id || `msg_${crypto.randomUUID()}`,
    type: "message",
    role: "assistant",
    model: response.model || fallbackModel,
    content: content.length > 0 ? content : [{ type: "text", text: "" }],
    stop_reason:
      choice?.finish_reason === "length"
        ? "max_tokens"
        : choice?.finish_reason === "tool_calls" || toolBlocks.length > 0
          ? "tool_use"
          : "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: response.usage?.prompt_tokens || 0,
      output_tokens: response.usage?.completion_tokens || 0,
    },
  }
}

export function chatCompletionToResponse(
  response: AnyRecord,
  fallbackModel: string,
): AnyRecord {
  const choice = response.choices?.[0]
  const message = choice?.message || {}
  const text = message.content || ""
  const output: AnyRecord[] = []
  if (text) {
    output.push({
      id: `msg_${crypto.randomUUID()}`,
      type: "message",
      role: "assistant",
      status: "completed",
      content: [{ type: "output_text", text }],
    })
  }
  output.push(
    ...asArray(message.tool_calls)
      .map((toolCall) => chatToolCallToResponsesOutput(toolCall as AnyRecord))
      .filter((item): item is AnyRecord => Boolean(item)),
  )
  if (output.length === 0) {
    output.push({
      id: `msg_${crypto.randomUUID()}`,
      type: "message",
      role: "assistant",
      status: "completed",
      content: [{ type: "output_text", text: "" }],
    })
  }

  return {
    id: response.id || `resp_${crypto.randomUUID()}`,
    object: "response",
    created_at: response.created || Math.floor(Date.now() / 1000),
    status: "completed",
    model: response.model || fallbackModel,
    output,
    usage: {
      input_tokens: response.usage?.prompt_tokens || 0,
      output_tokens: response.usage?.completion_tokens || 0,
      total_tokens: response.usage?.total_tokens || 0,
    },
  }
}

export function extractTextFromChatCompletionChunk(chunk: AnyRecord): string {
  return chunk.choices?.[0]?.delta?.content || ""
}

export function createAnthropicStreamStart(model: string): string {
  const message = {
    id: `msg_${crypto.randomUUID()}`,
    type: "message",
    role: "assistant",
    model,
    content: [],
    stop_reason: null,
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0 },
  }
  return [
    `event: message_start\ndata: ${JSON.stringify({ type: "message_start", message })}\n\n`,
    `event: content_block_start\ndata: ${JSON.stringify({
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" },
    })}\n\n`,
  ].join("")
}

export function createAnthropicStreamDelta(text: string): string {
  if (!text) return ""
  return `event: content_block_delta\ndata: ${JSON.stringify({
    type: "content_block_delta",
    index: 0,
    delta: { type: "text_delta", text },
  })}\n\n`
}

export function createAnthropicStreamStop(): string {
  return [
    `event: content_block_stop\ndata: ${JSON.stringify({
      type: "content_block_stop",
      index: 0,
    })}\n\n`,
    `event: message_delta\ndata: ${JSON.stringify({
      type: "message_delta",
      delta: { stop_reason: "end_turn", stop_sequence: null },
      usage: { output_tokens: 0 },
    })}\n\n`,
    `event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`,
  ].join("")
}

export function createResponsesStreamDelta(text: string): string {
  if (!text) return ""
  return `event: response.output_text.delta\ndata: ${JSON.stringify({
    type: "response.output_text.delta",
    output_index: 0,
    content_index: 0,
    delta: text,
  })}\n\n`
}

export function createResponsesStreamCompleted(model: string): string {
  const response = {
    id: `resp_${crypto.randomUUID()}`,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status: "completed",
    model,
    output: [],
  }
  return `event: response.completed\ndata: ${JSON.stringify({
    type: "response.completed",
    response,
  })}\n\n`
}

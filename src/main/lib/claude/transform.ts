import type { MCPServer, MCPServerStatus, MessageMetadata, UIMessageChunk } from "./types";

export function createTransformer(options?: { isUsingOllama?: boolean }) {
  const isUsingOllama = options?.isUsingOllama === true
  let textId: string | null = null
  let textStarted = false
  let started = false
  let startTime: number | null = null

  // Track streaming tool calls
  let currentToolCallId: string | null = null
  let currentToolName: string | null = null
  let accumulatedToolInput = ""

  // Track already emitted tool IDs to avoid duplicates
  // (tools can come via streaming AND in the final assistant message)
  const emittedToolIds = new Set<string>()

  // Track the last text block ID for final response marking
  // This is used to identify when there's a "final text" response after tools
  let lastTextId: string | null = null

  // Track parent tool context for nested tools (e.g., Explore agent)
  let currentParentToolUseId: string | null = null

  // Map original toolCallId -> composite toolCallId (for tool-result matching)
  const toolIdMapping = new Map<string, string>()

  // Track compacting system tool for matching status->boundary events
  let lastCompactId: string | null = null
  let compactCounter = 0

  // Track streaming thinking for Extended Thinking
  let currentThinkingId: string | null = null
  let accumulatedThinking = ""
  let inThinkingBlock = false // Track if we're currently in a thinking block
  let thinkingJsonStarted = false // Track if we've sent the JSON prefix for thinking deltas

  // Helper to create composite toolCallId: "parentId:childId" or just "childId"
  const makeCompositeId = (originalId: string, parentId: string | null): string => {
    if (parentId) return `${parentId}:${originalId}`
    return originalId
  }

  const genId = () => `text-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

  // Helper to end current text block
  function* endTextBlock(): Generator<UIMessageChunk> {
    if (textStarted && textId) {
      yield { type: "text-end", id: textId }
      // Track the last text ID for final response marking
      lastTextId = textId
      textStarted = false
      textId = null
    }
  }

  // Helper to end current tool input
  function* endToolInput(): Generator<UIMessageChunk> {
    if (currentToolCallId) {
      // Track this tool ID to avoid duplicates from assistant message
      emittedToolIds.add(currentToolCallId)

      let parsedInput = {}
      if (accumulatedToolInput) {
        try {
          parsedInput = JSON.parse(accumulatedToolInput)
        } catch (e) {
          // Stream may have been interrupted mid-JSON (e.g. network error, abort)
          // resulting in incomplete JSON like '{"prompt":"write co'
          console.error("[transform] Failed to parse tool input JSON:", (e as Error).message, "partial:", accumulatedToolInput.slice(0, 120))
          parsedInput = { _raw: accumulatedToolInput, _parseError: true }
        }
      }

      // Emit complete tool call with accumulated input
      yield {
        type: "tool-input-available",
        toolCallId: currentToolCallId,
        toolName: currentToolName || "unknown",
        input: parsedInput,
        providerMetadata: { custom: { startedAt: Date.now() } },
      }
      currentToolCallId = null
      currentToolName = null
      accumulatedToolInput = ""
    }
  }

  return function* transform(msg: any): Generator<UIMessageChunk> {

    // Track parent_tool_use_id for nested tools
    // Only update when explicitly present (don't reset on messages without it)
    if (msg.parent_tool_use_id !== undefined) {
      currentParentToolUseId = msg.parent_tool_use_id
    }

    // Emit start once
    if (!started) {
      started = true
      startTime = Date.now()
      yield { type: "start" }
      yield { type: "start-step" }
    }

    // Reset thinking state on new message start to prevent memory leaks
    if (msg.type === "stream_event" && msg.event?.type === "message_start") {
      currentThinkingId = null
      accumulatedThinking = ""
      inThinkingBlock = false
    }

    // ===== STREAMING EVENTS (token-by-token) =====
    if (msg.type === "stream_event") {
      const event = msg.event
      if (!event) return

      // Text block start
      if (event.type === "content_block_start" && event.content_block?.type === "text") {
        yield* endTextBlock()
        yield* endToolInput()
        textId = genId()
        yield { type: "text-start", id: textId }
        textStarted = true
      }

      // Text delta
      if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
        if (!textStarted) {
          yield* endToolInput()
          textId = genId()
          yield { type: "text-start", id: textId }
          textStarted = true
        }
        yield { type: "text-delta", id: textId!, delta: event.delta.text || "" }
      }

      // Content block stop
      if (event.type === "content_block_stop") {
        if (textStarted) {
          yield* endTextBlock()
        }
        if (currentToolCallId) {
          yield* endToolInput()
        }
      }

      // Tool use start (streaming)
      if (event.type === "content_block_start" && event.content_block?.type === "tool_use") {
        yield* endTextBlock()
        yield* endToolInput()

        const originalId = event.content_block.id || genId()
        currentToolCallId = makeCompositeId(originalId, currentParentToolUseId)
        currentToolName = event.content_block.name || "unknown"
        accumulatedToolInput = ""

        // Store mapping for tool-result lookup
        toolIdMapping.set(originalId, currentToolCallId)

        // Emit tool-input-start for progressive UI
        yield {
          type: "tool-input-start",
          toolCallId: currentToolCallId,
          toolName: currentToolName,
        }
      }

      // Tool input delta
      if (event.delta?.type === "input_json_delta" && currentToolCallId) {
        const partialJson = event.delta.partial_json || ""
        accumulatedToolInput += partialJson

        // Emit tool-input-delta for progressive UI
        yield {
          type: "tool-input-delta",
          toolCallId: currentToolCallId,
          inputTextDelta: partialJson,
        }
      }

      // Thinking content block start (Extended Thinking)
      if (event.type === "content_block_start" && event.content_block?.type === "thinking") {
        currentThinkingId = `thinking-${Date.now()}`
        accumulatedThinking = ""
        inThinkingBlock = true
        thinkingJsonStarted = false
        yield {
          type: "tool-input-start",
          toolCallId: currentThinkingId,
          toolName: "Thinking",
        }
      }

      // Thinking/reasoning streaming - emit as tool-like chunks for UI
      if (event.delta?.type === "thinking_delta" && currentThinkingId && inThinkingBlock) {
        const thinkingText = String(event.delta.thinking || "")
        accumulatedThinking += thinkingText

        // Emit as JSON fragment so AI SDK's parsePartialJson can parse it incrementally.
        // AI SDK accumulates all deltas and runs fixJson() to repair incomplete JSON,
        // so we start with '{"text":"' and send JSON-escaped text chunks.
        const escaped = JSON.stringify(thinkingText).slice(1, -1)
        const prefix = !thinkingJsonStarted ? '{"text":"' : ""
        thinkingJsonStarted = true

        yield {
          type: "tool-input-delta",
          toolCallId: currentThinkingId,
          inputTextDelta: prefix + escaped,
        }
      }
      
      // Thinking complete (content_block_stop while in thinking block)
      if (event.type === "content_block_stop" && inThinkingBlock && currentThinkingId) {
        yield {
          type: "tool-input-available",
          toolCallId: currentThinkingId,
          toolName: "Thinking",
          input: { text: accumulatedThinking },
        }
        yield {
          type: "tool-output-available",
          toolCallId: currentThinkingId,
          output: { completed: true },
        }
        // Track as emitted to skip duplicate from assistant message
        emittedToolIds.add(currentThinkingId)
        emittedToolIds.add("thinking-streamed")
        currentThinkingId = null
        accumulatedThinking = ""
        inThinkingBlock = false
      }
    }

    // ===== ASSISTANT MESSAGE (complete, often with tool_use) =====
    // When streaming is enabled, text arrives via stream_event, not here
    if (msg.type === "assistant" && msg.message?.content) {
      for (const block of msg.message.content) {
        // Handle thinking blocks from Extended Thinking
        // Skip if already emitted via streaming (thinking_delta)
        if (block.type === "thinking" && block.thinking) {
          // Check if we already streamed OR are currently streaming this thinking block
          // The assistant message can arrive BEFORE content_block_stop, so we also check inThinkingBlock
          const wasStreamed = emittedToolIds.has("thinking-streamed")
          const isCurrentlyStreaming = inThinkingBlock

          if (wasStreamed || isCurrentlyStreaming) {
            continue
          }

          const thinkingId = genId()
          yield {
            type: "tool-input-available",
            toolCallId: thinkingId,
            toolName: "Thinking",
            input: { text: block.thinking },
          }
          // Immediately mark as complete
          yield {
            type: "tool-output-available",
            toolCallId: thinkingId,
            output: { completed: true },
          }
        }

        if (block.type === "text") {
          yield* endToolInput()

          // Only emit text if we're NOT already streaming (textStarted = false)
          // When includePartialMessages is true, text comes via stream_event
          if (!textStarted) {
            textId = genId()
            yield { type: "text-start", id: textId }
            yield { type: "text-delta", id: textId, delta: block.text }
            yield { type: "text-end", id: textId }
            lastTextId = textId
            textId = null
          }
        }

        if (block.type === "tool_use") {
          yield* endTextBlock()
          yield* endToolInput()

          // Skip if already emitted via streaming
          if (emittedToolIds.has(block.id)) {
            continue
          }

          emittedToolIds.add(block.id)

          const compositeId = makeCompositeId(block.id, currentParentToolUseId)

          // Store mapping for tool-result lookup
          toolIdMapping.set(block.id, compositeId)

          yield {
            type: "tool-input-available",
            toolCallId: compositeId,
            toolName: block.name,
            input: block.input,
            providerMetadata: { custom: { startedAt: Date.now() } },
          }
        }
      }
    }

    // ===== USER MESSAGE (tool results) =====
    if (msg.type === "user" && msg.message?.content && Array.isArray(msg.message.content)) {
      for (const block of msg.message.content) {
        if (block.type === "tool_result") {
          // Lookup composite ID from mapping, fallback to original
          const compositeId = toolIdMapping.get(block.tool_use_id) || block.tool_use_id

          if (block.is_error) {
            yield {
              type: "tool-output-error",
              toolCallId: compositeId,
              errorText: String(block.content),
            }
          } else {
            // Try to parse structured data from block.content if it's JSON
            let output = msg.tool_use_result
            if (!output && typeof block.content === 'string') {
              try {
                // Some tool results may have JSON embedded in the string
                const parsed = JSON.parse(block.content)
                if (parsed && typeof parsed === 'object') {
                  output = parsed
                }
              } catch {
                // Not JSON, use raw content
              }
            }
            output = output || block.content

            yield {
              type: "tool-output-available",
              toolCallId: compositeId,
              output,
            }
          }
        }
      }
    }

    // ===== SYSTEM STATUS (compacting, etc.) =====
    if (msg.type === "system") {
      // Session init - extract MCP servers, plugins, tools
      if (msg.subtype === "init") {
        // Map MCP servers with validated status type and additional info
        const mcpServers: MCPServer[] = (msg.mcp_servers || []).map(
          (s: { name: string; status: string; serverInfo?: { name: string; version: string; icons?: { src: string; mimeType?: string; sizes?: string[]; theme?: "light" | "dark" }[] }; error?: string }) => ({
            name: s.name,
            status: (["connected", "failed", "pending", "needs-auth"].includes(
              s.status,
            )
              ? s.status
              : "pending") as MCPServerStatus,
            ...(s.serverInfo && { serverInfo: s.serverInfo }),
            ...(s.error && { error: s.error }),
          }),
        )
        yield {
          type: "session-init",
          tools: msg.tools || [],
          mcpServers,
          plugins: msg.plugins || [],
          skills: msg.skills || [],
        }
      }

      // Compacting status - expose as a tool so it becomes a UI message part
      if (msg.subtype === "status" && msg.status === "compacting") {
        // Create unique ID and save for matching with boundary event
        lastCompactId = `compact-${Date.now()}-${compactCounter++}`
        yield {
          type: "tool-input-available",
          toolCallId: lastCompactId,
          toolName: "Compact",
          input: { status: "compacting" },
        }
      }

      // Compact boundary - mark the compacting tool as complete
      if (msg.subtype === "compact_boundary") {
        let compactId = lastCompactId
        // If we didn't receive a compacting status, create a tool invocation now
        if (!compactId) {
          compactId = `compact-${Date.now()}-${compactCounter++}`
          yield {
            type: "tool-input-available",
            toolCallId: compactId,
            toolName: "Compact",
            input: { status: "compacting" },
          }
        }
        yield {
          type: "tool-output-available",
          toolCallId: compactId,
          output: { status: "compacted" },
        }
        lastCompactId = null // Clear for next compacting cycle
      }
    }

    // ===== RESULT (final) =====
    if (msg.type === "result") {
      yield* endTextBlock()
      yield* endToolInput()

      const inputTokens = msg.usage?.input_tokens
      const outputTokens = msg.usage?.output_tokens

      // Extract per-model usage from SDK (if available)
      const modelUsage = msg.modelUsage
        ? Object.fromEntries(
            Object.entries(msg.modelUsage).map(([model, usage]: [string, any]) => [
              model,
              {
                inputTokens: usage.inputTokens || 0,
                outputTokens: usage.outputTokens || 0,
                cacheReadInputTokens: usage.cacheReadInputTokens || 0,
                cacheCreationInputTokens: usage.cacheCreationInputTokens || 0,
                costUSD: usage.costUSD || 0,
              },
            ])
          )
        : undefined

      // Fallback: if SDK didn't populate msg.usage, derive totals from modelUsage
      const fallbackInputTokens = msg.modelUsage
        ? Object.values(msg.modelUsage).reduce(
            (sum: number, usage: any) => sum + (usage?.inputTokens || 0),
            0,
          )
        : undefined
      const fallbackOutputTokens = msg.modelUsage
        ? Object.values(msg.modelUsage).reduce(
            (sum: number, usage: any) => sum + (usage?.outputTokens || 0),
            0,
          )
        : undefined

      const resolvedInputTokens =
        inputTokens == null || (inputTokens === 0 && (fallbackInputTokens || 0) > 0)
          ? fallbackInputTokens
          : inputTokens
      const resolvedOutputTokens =
        outputTokens == null || (outputTokens === 0 && (fallbackOutputTokens || 0) > 0)
          ? fallbackOutputTokens
          : outputTokens

      const metadata: MessageMetadata = {
        sessionId: msg.session_id,
        inputTokens: resolvedInputTokens,
        outputTokens: resolvedOutputTokens,
        totalTokens:
          resolvedInputTokens != null && resolvedOutputTokens != null
            ? resolvedInputTokens + resolvedOutputTokens
            : undefined,
        totalCostUsd: msg.total_cost_usd,
        durationMs: startTime ? Date.now() - startTime : undefined,
        resultSubtype: msg.subtype || "success",
        // Include finalTextId for collapsing tools when there's a final response
        finalTextId: lastTextId || undefined,
        // Per-model usage breakdown
        modelUsage,
      }
      yield { type: "message-metadata", messageMetadata: metadata }
      yield { type: "finish-step" }
      yield { type: "finish", messageMetadata: metadata }
    }
  }
}

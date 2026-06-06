export function logClaudeOllamaStreamStart(input: {
  model?: string | null
  baseUrl?: string | null
  prompt: unknown
  cwd: string
}): void {
  console.log("[Ollama] ===== STARTING STREAM ITERATION =====")
  console.log(`[Ollama] Model: ${input.model}`)
  console.log(`[Ollama] Base URL: ${input.baseUrl}`)
  console.log(
    `[Ollama] Prompt: "${typeof input.prompt === "string" ? input.prompt.slice(0, 100) : "N/A"}..."`,
  )
  console.log(`[Ollama] CWD: ${input.cwd}`)
}

export function logClaudeOllamaStreamAborted(): void {
  console.log("[Ollama] Stream aborted by user")
}

export function logClaudeOllamaMessage(input: {
  messageCount: number
  message: any
}): void {
  const msgAnyPreview = input.message as any
  console.log(`[Ollama] ===== MESSAGE #${input.messageCount} =====`)
  console.log(`[Ollama] Type: ${msgAnyPreview.type}`)
  console.log(`[Ollama] Subtype: ${msgAnyPreview.subtype || "none"}`)

  if (msgAnyPreview.event) {
    console.log(`[Ollama] Event: ${msgAnyPreview.event.type}`, {
      delta_type: msgAnyPreview.event.delta?.type,
      content_block_type: msgAnyPreview.event.content_block?.type,
    })
  }

  if (msgAnyPreview.message?.content) {
    console.log(
      "[Ollama] Message content blocks:",
      msgAnyPreview.message.content.length,
    )
    msgAnyPreview.message.content.forEach((block: any, idx: number) => {
      console.log(
        `[Ollama]   Block ${idx}: type=${block.type}, text_length=${block.text?.length || 0}`,
      )
    })
  }
}

export function logClaudeOllamaFirstMessageLatency(
  timeToFirstMessageMs: number,
): void {
  console.log(`[Ollama] Time to first message: ${timeToFirstMessageMs}ms`)
}

export function logClaudeOllamaStreamComplete(input: {
  messageCount: number
  durationMs: number
  chunkCount: number
}): void {
  console.log("[Ollama] ===== STREAM COMPLETED =====")
  console.log(`[Ollama] Total messages: ${input.messageCount}`)
  console.log(`[Ollama] Duration: ${input.durationMs}ms`)
  console.log(`[Ollama] Chunks emitted: ${input.chunkCount}`)
}

export function logClaudeOllamaEmptyStreamDiagnosis(model?: string | null): void {
  console.error("[Ollama] ===== DIAGNOSIS =====")
  console.error(
    "[Ollama] Problem: Stream completed but NO messages received from SDK",
  )
  console.error("[Ollama] This usually means:")
  console.error(
    "[Ollama]   1. Ollama doesn't support Anthropic Messages API format (/v1/messages)",
  )
  console.error(
    "[Ollama]   2. Model failed to start generating (check Ollama logs: ollama logs)",
  )
  console.error(
    "[Ollama]   3. Network issue between Claude Agent SDK and Ollama",
  )
  console.error("[Ollama] ===== NEXT STEPS =====")
  console.error(
    `[Ollama]   1. Check if model works: curl http://localhost:11434/api/generate -d '{"model":"${model}","prompt":"test"}'`,
  )
  console.error("[Ollama]   2. Check Ollama version supports Messages API")
  console.error(
    "[Ollama]   3. Try using a proxy that converts Anthropic API -> Ollama format",
  )
}

export function logClaudeOllamaSingleMessageWarning(): void {
  console.warn(
    "[Ollama] Only received 1 message (likely just init). No actual content generated.",
  )
}

export function logClaudeOllamaStreamError(input: {
  error: Error
  messageCount: number
  stderrOutput?: string
}): void {
  console.error("[Ollama] ===== STREAM ERROR =====")
  console.error(`[Ollama] Error message: ${input.error.message}`)
  console.error("[Ollama] Error stack:", input.error.stack)
  console.error(
    `[Ollama] Messages received before error: ${input.messageCount}`,
  )
  if (input.stderrOutput) {
    console.error("[Ollama] Claude binary stderr:", input.stderrOutput)
  }
}

type OllamaConnectivityLogger = {
  log: (...args: any[]) => void
  error: (...args: any[]) => void
}

type OllamaConnectivityFetch = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<{
  ok: boolean
  status: number
  json: () => Promise<any>
}>

export async function probeClaudeOllamaConnectivity(input: {
  baseUrl: string
  model: string
  timeoutMs?: number
  fetchImpl?: OllamaConnectivityFetch
  logger?: OllamaConnectivityLogger
}): Promise<void> {
  const fetchImpl = input.fetchImpl ?? fetch
  const logger = input.logger ?? console

  logger.log("[Ollama Debug] Testing Ollama connectivity...")
  try {
    const testResponse = await fetchImpl(`${input.baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(input.timeoutMs ?? 2000),
    })
    if (testResponse.ok) {
      const data = await testResponse.json()
      const models = data.models?.map((model: any) => model.name) || []
      logger.log(
        "[Ollama Debug] Ollama is responding. Available models:",
        models,
      )

      if (!models.includes(input.model)) {
        logger.error(
          `[Ollama Debug] WARNING: Model "${input.model}" not found in Ollama!`,
        )
        logger.error("[Ollama Debug] Available models:", models)
        logger.error(
          "[Ollama Debug] This will likely cause the stream to hang or fail silently.",
        )
      } else {
        logger.log(`[Ollama Debug] ✓ Model "${input.model}" is available`)
      }
    } else {
      logger.error("[Ollama Debug] Ollama returned error:", testResponse.status)
    }
  } catch (err) {
    logger.error("[Ollama Debug] Failed to connect to Ollama:", err)
  }
}

type ClaudeOllamaStartupCustomConfig = {
  baseUrl: string
  model: string
}

type ProbeClaudeOllamaConnectivity = typeof probeClaudeOllamaConnectivity
type LogClaudeOllamaSdkConfiguration = typeof logClaudeOllamaSdkConfiguration

export async function prepareClaudeAgentSdkOllamaStartupDiagnostics(input: {
  isUsingOllama: boolean
  customConfig?: ClaudeOllamaStartupCustomConfig | null
  model?: string | null
  baseUrl?: string
  cwd: string
  configDir: string
  hasAuthToken: boolean
  resumeSessionId?: string | null
  probeConnectivity?: ProbeClaudeOllamaConnectivity
  logSdkConfiguration?: LogClaudeOllamaSdkConfiguration
}): Promise<void> {
  if (!input.isUsingOllama) {
    return
  }

  if (input.customConfig) {
    await (input.probeConnectivity ?? probeClaudeOllamaConnectivity)({
      baseUrl: input.customConfig.baseUrl,
      model: input.customConfig.model,
    })
  }

  const logSdkConfiguration =
    input.logSdkConfiguration ?? logClaudeOllamaSdkConfiguration
  logSdkConfiguration({
    model: input.model,
    baseUrl: input.baseUrl,
    cwd: input.cwd,
    configDir: input.configDir,
    hasAuthToken: input.hasAuthToken,
    resumeSessionId: input.resumeSessionId,
  })
}

export function logClaudeOllamaSdkConfiguration(input: {
  model?: string | null
  baseUrl?: string
  cwd: string
  configDir: string
  hasAuthToken: boolean
  resumeSessionId?: string | null
}): void {
  console.log("[Ollama Debug] SDK Configuration:", {
    model: input.model,
    baseUrl: input.baseUrl,
    cwd: input.cwd,
    configDir: input.configDir,
    hasAuthToken: input.hasAuthToken,
  })
  console.log("[Ollama Debug] Session settings:", {
    resumeSessionId: input.resumeSessionId || "none (first message)",
    mode: input.resumeSessionId ? "resume" : "continue",
    note: input.resumeSessionId
      ? "Resuming existing session to maintain chat history"
      : "Starting new session with continue mode",
  })
}

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

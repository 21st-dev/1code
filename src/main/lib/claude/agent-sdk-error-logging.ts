export function logClaudeAgentSdkEmbeddedError(input: {
  sdkError: unknown
  message: any
  subChatId: string
  chatId: string
  cwd: string
  mode: string
  hasCustomConfig: boolean
  isUsingOllama: boolean
  model?: string | null
  hasOAuthToken: boolean
  mcpServerNames?: string[]
}): void {
  console.error("[CLAUDE SDK ERROR] ========================================")
  console.error(`[CLAUDE SDK ERROR] Raw error: ${input.sdkError}`)
  console.error(`[CLAUDE SDK ERROR] Message type: ${input.message.type}`)
  console.error(`[CLAUDE SDK ERROR] SubChat ID: ${input.subChatId}`)
  console.error(`[CLAUDE SDK ERROR] Chat ID: ${input.chatId}`)
  console.error(`[CLAUDE SDK ERROR] CWD: ${input.cwd}`)
  console.error(`[CLAUDE SDK ERROR] Mode: ${input.mode}`)
  console.error(
    `[CLAUDE SDK ERROR] Session ID: ${input.message.session_id || "none"}`,
  )
  console.error(
    `[CLAUDE SDK ERROR] Has custom config: ${input.hasCustomConfig}`,
  )
  console.error(
    `[CLAUDE SDK ERROR] Is using Ollama: ${input.isUsingOllama}`,
  )
  console.error(`[CLAUDE SDK ERROR] Model: ${input.model || "default"}`)
  console.error(
    `[CLAUDE SDK ERROR] Has OAuth token: ${input.hasOAuthToken}`,
  )
  console.error(
    `[CLAUDE SDK ERROR] MCP servers: ${
      input.mcpServerNames && input.mcpServerNames.length > 0
        ? input.mcpServerNames.join(", ")
        : "none"
    }`,
  )
  console.error(
    "[CLAUDE SDK ERROR] Full message:",
    JSON.stringify(input.message, null, 2),
  )
  console.error("[CLAUDE SDK ERROR] ========================================")
}

export function logClaudeAgentSdkErrorDetails(input: {
  errorCategory: string
  errorContext: string
  rawErrorCode: string
  message: any
}): void {
  console.error("[SD] SDK Error details:", {
    errorCategory: input.errorCategory,
    errorContext: input.errorContext.slice(0, 200),
    rawErrorCode: input.rawErrorCode,
    sessionId: input.message.session_id,
    messageId: input.message.message?.id,
    fullMessage: JSON.stringify(input.message, null, 2),
  })
}

import * as Sentry from "@sentry/electron/renderer"
import type { ChatTransport, UIMessage } from "ai"
import { toast } from "sonner"
import {
  claudeLoginModalConfigAtom,
  agentsLoginModalOpenAtom,
  autoOfflineModeAtom,
  type CustomClaudeConfig,
  customClaudeConfigAtom,
  enableTasksAtom,
  historyEnabledAtom,
  normalizeCustomClaudeConfig,
  selectedOllamaModelAtom,
  sessionInfoAtom,
  showOfflineModeFeaturesAtom,
} from "../../../lib/atoms"
import { appStore } from "../../../lib/jotai-store"
import { trpcClient } from "../../../lib/trpc"
import {
  askUserQuestionResultsAtom,
  compactingSubChatsAtom,
  expiredUserQuestionsAtom,
  MODEL_ID_MAP,
  pendingAuthRetryMessageAtom,
  pendingUserQuestionsAtom,
  subChatClaudeThinkingAtomFamily,
  subChatModelIdAtomFamily,
} from "../atoms"
import { setSubChatModel } from "./model-switching"
import { useAgentSubChatStore } from "../stores/sub-chat-store"
import type { AgentMessageMetadata } from "../ui/agent-message-usage"

// Error categories and their user-friendly messages
const ERROR_TOAST_CONFIG: Record<
  string,
  {
    title: string
    description: string
    action?: { label: string; onClick: () => void }
  }
> = {
  AUTH_FAILED_SDK: {
    title: "Not logged in",
    description: "Run 'claude login' in your terminal to authenticate",
    action: {
      label: "Copy command",
      onClick: () => navigator.clipboard.writeText("claude login"),
    },
  },
  INVALID_API_KEY_SDK: {
    title: "Invalid API key",
    description:
      "Your Claude API key is invalid. Check your CLI configuration.",
  },
  INVALID_API_KEY: {
    title: "Invalid API key",
    description:
      "Your Claude API key is invalid. Check your CLI configuration.",
  },
  RATE_LIMIT_SDK: {
    title: "Session limit reached",
    description: "You've hit the Claude Code usage limit.",
    action: {
      label: "View usage",
      onClick: () =>
        trpcClient.external.openExternal.mutate(
          "https://claude.ai/settings/usage",
        ),
    },
  },
  RATE_LIMIT: {
    title: "Session limit reached",
    description: "You've hit the Claude Code usage limit.",
    action: {
      label: "View usage",
      onClick: () =>
        trpcClient.external.openExternal.mutate(
          "https://claude.ai/settings/usage",
        ),
    },
  },
  OVERLOADED_SDK: {
    title: "Claude is busy",
    description:
      "The service is overloaded. Please try again in a few moments.",
  },
  PROCESS_CRASH: {
    title: "Claude crashed",
    description:
      "The Claude process exited unexpectedly. Try sending your message again or rollback.",
  },
  SESSION_EXPIRED: {
    title: "Session expired",
    description:
      "Your previous chat session expired. Send your message again to start fresh.",
  },
  EXECUTABLE_NOT_FOUND: {
    title: "Claude binary missing",
    description:
      "The bundled Claude binary could not be found. Reinstalling 1Code should restore it.",
  },
  NETWORK_ERROR: {
    title: "Network error",
    description: "Check your internet connection and try again.",
  },
  AUTH_FAILURE: {
    title: "Authentication failed",
    description: "Your session may have expired. Try logging in again.",
  },
  USAGE_POLICY_VIOLATION: {
    title: "Anthropic API hiccup",
    description: "The request was rejected by Anthropic's servers. Please try again shortly.",
  },
  // SDK_ERROR and other unknown errors use chunk.errorText for description
}

type UIMessageChunk = any // Inferred from subscription

type IPCChatTransportConfig = {
  chatId: string
  subChatId: string
  cwd: string
  projectPath?: string // Original project path for MCP config lookup (when using worktrees)
  mode: "plan" | "agent"
  model?: string
}

// Image attachment type matching the tRPC schema
type ImageAttachment = {
  base64Data: string
  mediaType: string
  filename?: string
}

export class IPCChatTransport implements ChatTransport<UIMessage> {
  constructor(private config: IPCChatTransportConfig) {}

  async sendMessages(options: {
    messages: UIMessage[]
    abortSignal?: AbortSignal
  }): Promise<ReadableStream<UIMessageChunk>> {
    // Extract prompt and images from last user message
    const lastUser = [...options.messages]
      .reverse()
      .find((m) => m.role === "user")
    const prompt = this.extractText(lastUser)
    const images = this.extractImages(lastUser)

    // Get sessionId for resume (server preserves sessionId on abort so
    // the next message can resume with full conversation context)
    const lastAssistant = [...options.messages]
      .reverse()
      .find((m) => m.role === "assistant")
    const metadata = lastAssistant?.metadata as AgentMessageMetadata | undefined
    const sessionId = metadata?.sessionId

    // Read thinking effort per-subChat (mirrors the model selection)
    const claudeThinkingLevel = appStore.get(
      subChatClaudeThinkingAtomFamily(this.config.subChatId),
    )
    const effort =
      claudeThinkingLevel === "off" ? undefined : claudeThinkingLevel
    const historyEnabled = appStore.get(historyEnabledAtom)
    const enableTasks = appStore.get(enableTasksAtom)

    // Read model selection dynamically per sub-chat (so split panes stay independent)
    const selectedModelId = appStore.get(subChatModelIdAtomFamily(this.config.subChatId))
    const modelString = MODEL_ID_MAP[selectedModelId] || MODEL_ID_MAP["opus"]

    const storedCustomConfig = appStore.get(
      customClaudeConfigAtom,
    ) as CustomClaudeConfig
    const customConfig = normalizeCustomClaudeConfig(storedCustomConfig)

    // Get selected Ollama model for offline mode
    const selectedOllamaModel = appStore.get(selectedOllamaModelAtom)
    // Check if offline mode is enabled in settings
    const showOfflineFeatures = appStore.get(showOfflineModeFeaturesAtom)
    const autoOfflineMode = appStore.get(autoOfflineModeAtom)
    const offlineModeEnabled = showOfflineFeatures && autoOfflineMode

    const currentMode =
      useAgentSubChatStore
        .getState()
        .allSubChats.find((subChat) => subChat.id === this.config.subChatId)
        ?.mode || this.config.mode

    // Stream debug logging
    const subId = this.config.subChatId.slice(-8)
    let chunkCount = 0
    let lastChunkType = ""
    console.log(`[SD] R:START sub=${subId} cwd=${this.config.cwd} projectPath=${this.config.projectPath || "(not set)"} customConfig=${customConfig ? "set" : "not set"}`)

    return new ReadableStream({
      start: (controller) => {
        const sub = trpcClient.claude.chat.subscribe(
          {
            subChatId: this.config.subChatId,
            chatId: this.config.chatId,
            prompt,
            cwd: this.config.cwd,
            projectPath: this.config.projectPath, // Original project path for MCP config lookup
            mode: currentMode,
            sessionId,
            ...(effort && { effort }),
            ...(modelString && { model: modelString }),
            ...(customConfig && { customConfig }),
            ...(selectedOllamaModel && { selectedOllamaModel }),
            historyEnabled,
            offlineModeEnabled,
            enableTasks,
            ...(images.length > 0 && { images }),
          },
          {
            onData: (chunk: UIMessageChunk) => {
              chunkCount++
              lastChunkType = chunk.type

              // Handle AskUserQuestion - show question UI
              if (chunk.type === "ask-user-question") {
                const currentMap = appStore.get(pendingUserQuestionsAtom)
                const newMap = new Map(currentMap)
                newMap.set(this.config.subChatId, {
                  subChatId: this.config.subChatId,
                  parentChatId: this.config.chatId,
                  toolUseId: chunk.toolUseId,
                  questions: chunk.questions,
                })
                appStore.set(pendingUserQuestionsAtom, newMap)

                // Clear any expired question (new question replaces it)
                const currentExpired = appStore.get(expiredUserQuestionsAtom)
                if (currentExpired.has(this.config.subChatId)) {
                  const newExpiredMap = new Map(currentExpired)
                  newExpiredMap.delete(this.config.subChatId)
                  appStore.set(expiredUserQuestionsAtom, newExpiredMap)
                }
              }

              // Handle AskUserQuestion timeout - move to expired (keep UI visible)
              if (chunk.type === "ask-user-question-timeout") {
                const currentMap = appStore.get(pendingUserQuestionsAtom)
                const pending = currentMap.get(this.config.subChatId)
                if (pending && pending.toolUseId === chunk.toolUseId) {
                  // Remove from pending
                  const newPendingMap = new Map(currentMap)
                  newPendingMap.delete(this.config.subChatId)
                  appStore.set(pendingUserQuestionsAtom, newPendingMap)

                  // Move to expired (so UI keeps showing the question)
                  const currentExpired = appStore.get(expiredUserQuestionsAtom)
                  const newExpiredMap = new Map(currentExpired)
                  newExpiredMap.set(this.config.subChatId, pending)
                  appStore.set(expiredUserQuestionsAtom, newExpiredMap)
                }
              }

              // Handle AskUserQuestion result - store for real-time updates
              if (chunk.type === "ask-user-question-result") {
                const currentResults = appStore.get(askUserQuestionResultsAtom)
                const newResults = new Map(currentResults)
                newResults.set(chunk.toolUseId, chunk.result)
                appStore.set(askUserQuestionResultsAtom, newResults)
              }

              // Handle compacting status - track in atom for UI display
              if (
                (chunk.type === "tool-input-start" && chunk.toolName === "Compact") ||
                (chunk.type === "tool-input-available" && chunk.toolName === "Compact")
              ) {
                const compacting = appStore.get(compactingSubChatsAtom)
                const newCompacting = new Set(compacting)
                // Compacting started
                newCompacting.add(this.config.subChatId)
                appStore.set(compactingSubChatsAtom, newCompacting)
              }
              if (
                (chunk.type === "tool-output-available" && chunk.toolCallId?.startsWith("compact-")) ||
                (chunk.type === "tool-output-error" && chunk.toolCallId?.startsWith("compact-"))
              ) {
                const compacting = appStore.get(compactingSubChatsAtom)
                const newCompacting = new Set(compacting)
                // Compacting finished
                newCompacting.delete(this.config.subChatId)
                appStore.set(compactingSubChatsAtom, newCompacting)
              }

              // Handle session init - store MCP servers, plugins, tools info
              if (chunk.type === "session-init") {
                console.log("[MCP] Received session-init:", {
                  tools: chunk.tools?.length,
                  mcpServers: chunk.mcpServers,
                  plugins: chunk.plugins,
                  skills: chunk.skills?.length,
                  // Debug: show all tools to check for MCP tools (format: mcp__servername__toolname)
                  allTools: chunk.tools,
                })
                appStore.set(sessionInfoAtom, {
                  tools: chunk.tools,
                  mcpServers: chunk.mcpServers,
                  plugins: chunk.plugins,
                  skills: chunk.skills,
                })
              }

              // Clear pending questions ONLY when agent has moved on
              // Don't clear on tool-input-* chunks (still building the question input)
              // Clear when we get tool-output-* (answer received) or text-delta (agent moved on)
              const shouldClearOnChunk =
                chunk.type !== "ask-user-question" &&
                chunk.type !== "ask-user-question-timeout" &&
                chunk.type !== "ask-user-question-result" &&
                !chunk.type.startsWith("tool-input") && // Don't clear while input is being built
                chunk.type !== "start" &&
                chunk.type !== "start-step"

              if (shouldClearOnChunk) {
                const currentMap = appStore.get(pendingUserQuestionsAtom)
                if (currentMap.has(this.config.subChatId)) {
                  const newMap = new Map(currentMap)
                  newMap.delete(this.config.subChatId)
                  appStore.set(pendingUserQuestionsAtom, newMap)
                }
                // NOTE: Do NOT clear expired questions here. After a timeout,
                // the agent continues and emits new chunks — that's expected.
                // Expired questions should persist until the user answers,
                // dismisses, or sends a new message.
              }

              // Handle authentication errors - show Claude login modal
              if (chunk.type === "auth-error") {
                // Store the failed message for retry after successful auth
                // readyToRetry=false prevents immediate retry - modal sets it to true on OAuth success
                appStore.set(pendingAuthRetryMessageAtom, {
                  subChatId: this.config.subChatId,
                  provider: "claude-code",
                  prompt,
                  ...(images.length > 0 && { images }),
                  readyToRetry: false,
                })
                appStore.set(claudeLoginModalConfigAtom, {
                  hideCustomModelSettingsLink: false,
                  autoStartAuth: false,
                })
                // Show the Claude Code login modal
                appStore.set(agentsLoginModalOpenAtom, true)
                // Use controller.error() instead of controller.close() so that
                // the SDK Chat properly resets status from "streaming" to "ready"
                // This allows user to retry sending messages after failed auth
                console.log(`[SD] R:AUTH_ERR sub=${subId}`)
                controller.error(new Error("Authentication required"))
                return
              }

              // Handle retry notification - show friendly toast instead of scary error
              if (chunk.type === "retry-notification") {
                toast.info("Retrying request", {
                  description: chunk.message || "Request was unsuccessful, trying again...",
                  duration: 4000,
                })
                return // don't enqueue retry-notification as a stream chunk
              }

              // Handle errors - show toast to user FIRST before anything else
              if (chunk.type === "error") {
                const category = chunk.debugInfo?.category || "UNKNOWN"

                // Detailed SDK error logging for debugging
                console.error(`[SDK ERROR] ========================================`)
                console.error(`[SDK ERROR] Category: ${category}`)
                console.error(`[SDK ERROR] Error text: ${chunk.errorText}`)
                console.error(`[SDK ERROR] Chat ID: ${this.config.chatId}`)
                console.error(`[SDK ERROR] SubChat ID: ${this.config.subChatId}`)
                console.error(`[SDK ERROR] CWD: ${this.config.cwd}`)
                console.error(`[SDK ERROR] Mode: ${currentMode}`)
                if (chunk.debugInfo) {
                  console.error(`[SDK ERROR] Debug info:`, JSON.stringify(chunk.debugInfo, null, 2))
                }
                console.error(`[SDK ERROR] Full chunk:`, JSON.stringify(chunk, null, 2))
                console.error(`[SDK ERROR] ========================================`)

                // Track error in Sentry
                Sentry.captureException(
                  new Error(chunk.errorText || "Claude transport error"),
                  {
                    tags: {
                      errorCategory: category,
                      mode: currentMode,
                    },
                    extra: {
                      debugInfo: chunk.debugInfo,
                      cwd: this.config.cwd,
                      chatId: this.config.chatId,
                      subChatId: this.config.subChatId,
                    },
                  },
                )

                // Build detailed error string for copying (available for ALL errors)
                const errorDetails = [
                  `Error: ${chunk.errorText || "Unknown error"}`,
                  `Category: ${category}`,
                  `Chat ID: ${this.config.chatId}`,
                  `SubChat ID: ${this.config.subChatId}`,
                  `CWD: ${this.config.cwd}`,
                  `Mode: ${currentMode}`,
                  `Timestamp: ${new Date().toISOString()}`,
                  chunk.debugInfo ? `Debug Info: ${JSON.stringify(chunk.debugInfo, null, 2)}` : null,
                ].filter(Boolean).join("\n")

                // Show toast based on error category
                const config = ERROR_TOAST_CONFIG[category]
                const title = config?.title || "Claude error"
                // For auth/API key failures, prefer original backend error to aid debugging
                const preferOriginalError =
                  category === "AUTH_FAILURE" ||
                  category === "INVALID_API_KEY_SDK" ||
                  category === "INVALID_API_KEY"
                // Use config description if set, otherwise fall back to errorText
                const rawDescription = preferOriginalError
                  ? chunk.errorText || config?.description || "An unexpected error occurred"
                  : config?.description || chunk.errorText || "An unexpected error occurred"
                // Truncate long descriptions for toast (keep first 300 chars)
                const description = rawDescription.length > 300
                  ? rawDescription.slice(0, 300) + "..."
                  : rawDescription

                // Surface a clearer fallback action when a 1M-context model
                // hits a rate-limit / context error. Lets the user recover
                // with one click instead of digging through model settings.
                const erroredModel: string | undefined = chunk.debugInfo?.model
                const is1MModel =
                  typeof erroredModel === "string" && erroredModel.endsWith("[1m]")
                const isRateOrContextError =
                  category === "RATE_LIMIT" || category === "RATE_LIMIT_SDK"
                const subChatId = this.config.subChatId
                const offerFallback =
                  is1MModel && isRateOrContextError && Boolean(subChatId)
                const fallbackModelId = erroredModel?.replace(/\[1m\]$/, "")

                const action = offerFallback && fallbackModelId
                  ? {
                      label: `Switch to ${fallbackModelId}`,
                      onClick: () => {
                        setSubChatModel(subChatId, fallbackModelId)
                        toast.success(`Switched to ${fallbackModelId}`)
                      },
                    }
                  : {
                      label: "Copy Error",
                      onClick: () => {
                        navigator.clipboard.writeText(errorDetails)
                        toast.success("Error details copied to clipboard")
                      },
                    }

                const finalDescription = offerFallback
                  ? `${description} 1M-context models share a tighter quota — try the standard 200K model.`
                  : description

                toast.error(title, {
                  description: finalDescription,
                  duration: 12000,
                  action,
                })
              }

              // Try to enqueue, but don't crash if stream is already closed
              try {
                controller.enqueue(chunk)
              } catch (e) {
                // CRITICAL: Log when enqueue fails - this could explain missing chunks!
                console.log(`[SD] R:ENQUEUE_ERR sub=${subId} type=${chunk.type} n=${chunkCount} err=${e}`)
              }

              if (chunk.type === "finish") {
                console.log(`[SD] R:FINISH sub=${subId} n=${chunkCount}`)
                try {
                  controller.close()
                } catch {
                  // Already closed
                }
              }
            },
            onError: (err: Error) => {
              console.log(`[SD] R:ERROR sub=${subId} n=${chunkCount} last=${lastChunkType} err=${err.message}`)
              // Track transport errors in Sentry
              Sentry.captureException(err, {
                tags: {
                  errorCategory: "TRANSPORT_ERROR",
                  mode: currentMode,
                },
                extra: {
                  cwd: this.config.cwd,
                  chatId: this.config.chatId,
                  subChatId: this.config.subChatId,
                },
              })

              controller.error(err)
            },
            onComplete: () => {
              console.log(`[SD] R:COMPLETE sub=${subId} n=${chunkCount} last=${lastChunkType}`)
              // Note: Don't clear pending questions here - let active-chat.tsx handle it
              // via the stream stop detection effect. Clearing here causes race conditions
              // where sync effect immediately restores from messages.
              try {
                controller.close()
              } catch {
                // Already closed
              }
            },
          },
        )

        // Handle abort
        options.abortSignal?.addEventListener(
          "abort",
          () => {
            console.log(`[SD] R:ABORT sub=${subId} n=${chunkCount} last=${lastChunkType}`)
            sub.unsubscribe()
            // trpcClient.claude.cancel.mutate({ subChatId: this.config.subChatId })
            try {
              controller.close()
            } catch {
              // Already closed
            }
          },
          { once: true },
        )
      },
    })
  }

  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    return null // Not needed for local app
  }

  private extractText(msg: UIMessage | undefined): string {
    if (!msg) return ""
    if (msg.parts) {
      const textParts: string[] = []
      const fileContents: string[] = []

      for (const p of msg.parts) {
        const partType = (p as any).type as string
        if (partType === "text" && (p as any).text) {
          textParts.push((p as any).text)
        } else if (partType === "file-content") {
          // Hidden file content - add to prompt but not displayed in UI
          const fc = p as any
          const fileName = fc.filePath?.split("/").pop() || fc.filePath || "file"
          fileContents.push(`\n--- ${fileName} ---\n${fc.content}`)
        }
      }

      // Combine text and file contents
      return textParts.join("\n") + fileContents.join("")
    }
    return ""
  }

  /**
   * Extract images from message parts
   * Looks for parts with type "data-image" that have base64Data
   */
  private extractImages(msg: UIMessage | undefined): ImageAttachment[] {
    if (!msg || !msg.parts) return []

    const images: ImageAttachment[] = []

    for (const part of msg.parts) {
      // Check for data-image parts with base64 data
      if (part.type === "data-image" && (part as any).data) {
        const data = (part as any).data
        if (data.base64Data && data.mediaType) {
          images.push({
            base64Data: data.base64Data,
            mediaType: data.mediaType,
            filename: data.filename,
          })
        }
      }
    }

    return images
  }
}

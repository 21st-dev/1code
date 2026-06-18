import type { ChatTransport, UIMessage } from "ai"
import { toast } from "sonner"
import type { UIMessageChunk as ClaudeUIMessageChunk } from "../../../../main/lib/claude"
import { normalizeChatImageAttachmentPart } from "../../../../shared/chat-attachments"
import {
  type LongTextAttachmentPart,
  normalizeLongTextAttachmentPart,
} from "../../../../shared/long-text-attachments"
import {
  agentsLoginModalOpenAtom,
  autoOfflineModeAtom,
  claudeLoginModalConfigAtom,
  extendedThinkingEnabledAtom,
  historyEnabledAtom,
  selectedOllamaModelAtom,
  sessionInfoAtom,
  showOfflineModeFeaturesAtom,
} from "../../../lib/atoms"
import { en, type TranslationKey, zhCN } from "../../../lib/i18n/dictionaries"
import { appStore } from "../../../lib/jotai-store"
import { trpcClient } from "../../../lib/trpc"
import {
  approvedGuardedRunContractsAtom,
  compactingSubChatsAtom,
  MODEL_ID_MAP,
  pendingAuthRetryMessageAtom,
  type ClaudeModelSource,
  subChatClaudeModelSourceAtomFamily,
  subChatModelIdAtomFamily,
} from "../atoms"
import { useAgentSubChatStore } from "../stores/sub-chat-store"
import type { AgentMessageMetadata } from "../ui/agent-message-usage"
import {
  type AiSdkTransportChunk,
  getCanonicalMessageParts,
  isDataImageMessagePart,
  isFileContentMessagePart,
  isTextMessagePart,
  toAiSdkTransportChunk,
} from "./chat-message-ui-adapter"
import { normalizeClaudeModelSourceForRun } from "./models"
import {
  applyRuntimeEventStateChunk,
  clearPendingUserQuestionForRuntimeChunk,
} from "./runtime-event-state"

function tr(key: TranslationKey, values?: Record<string, string | number>) {
  const useZh =
    typeof navigator !== "undefined" &&
    (navigator.language || navigator.languages?.[0] || "")
      .toLowerCase()
      .startsWith("zh")
  const template = (useZh ? zhCN[key] : en[key]) || en[key] || key

  return template.replace(/\{(\w+)\}/g, (match, name) => {
    const value = values?.[name]
    return value === undefined ? match : String(value)
  })
}

type ClaudeErrorDebugInfo = {
  category?: string
  [key: string]: unknown
}

function getClaudeErrorDebugInfo(
  chunk: ClaudeUIMessageChunk,
): ClaudeErrorDebugInfo | undefined {
  if (chunk.type !== "error") {
    return undefined
  }

  const debugInfo = (chunk as { debugInfo?: ClaudeErrorDebugInfo }).debugInfo
  return debugInfo && typeof debugInfo === "object" ? debugInfo : undefined
}

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
    title: "Claude runtime missing",
    description:
      "The bundled Claude Code runtime is missing. Reinstall the app, or in development run bun run claude:download and restart.",
    action: {
      label: "Copy dev command",
      onClick: () => navigator.clipboard.writeText("bun run claude:download"),
    },
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
    description:
      "The request was rejected by Anthropic's servers. Please try again shortly.",
  },
  // SDK_ERROR and other unknown errors use chunk.errorText for description
}

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
  base64Data?: string
  localRef?: string
  attachmentId?: string
  mediaType: string
  filename?: string
  sizeBytes?: number
  width?: number
  height?: number
  sha256?: string
}

export class IPCChatTransport implements ChatTransport<UIMessage> {
  constructor(private config: IPCChatTransportConfig) {}

  async sendMessages(options: {
    messages: UIMessage[]
    abortSignal?: AbortSignal
  }): Promise<ReadableStream<AiSdkTransportChunk>> {
    // Extract prompt and images from last user message
    const lastUser = [...options.messages]
      .reverse()
      .find((m) => m.role === "user")
    const prompt = this.extractText(lastUser)
    const images = this.extractImages(lastUser)
    const longTextAttachments = this.extractLongTextAttachments(lastUser)

    // Get sessionId for resume (server preserves sessionId on abort so
    // the next message can resume with full conversation context)
    const lastAssistant = [...options.messages]
      .reverse()
      .find((m) => m.role === "assistant")
    const metadata = lastAssistant?.metadata as AgentMessageMetadata | undefined
    const sessionId = metadata?.sessionId

    // Read extended thinking setting dynamically (so toggle applies to existing chats)
    const thinkingEnabled = appStore.get(extendedThinkingEnabledAtom)
    // Max thinking tokens for extended thinking mode
    // SDK adds +1 internally, so 64000 becomes 64001 which exceeds the Opus limit
    // Using 32000 to stay safely under the 64000 max output tokens limit
    const maxThinkingTokens = thinkingEnabled ? 32_000 : undefined
    const historyEnabled = appStore.get(historyEnabledAtom)
    // TodoWrite/Task tools are always exposed. This was a persisted flag with no
    // settings control (default ON); inlined to the default to drop the orphan.
    const enableTasks = true

    // Read model selection dynamically per sub-chat (so split panes stay independent)
    const selectedModelId = appStore.get(
      subChatModelIdAtomFamily(this.config.subChatId),
    )
    const modelString =
      MODEL_ID_MAP[selectedModelId] ||
      MODEL_ID_MAP["fable"] ||
      MODEL_ID_MAP["opus"]
    const selectedModelSource = appStore.get(
      subChatClaudeModelSourceAtomFamily(this.config.subChatId),
    )
    let modelSource: string =
      selectedModelSource === "auto" ? "claude-oauth" : selectedModelSource
    if (
      selectedModelSource === "auto" ||
      selectedModelSource === "custom-provider"
    ) {
      const providerProfiles =
        selectedModelSource === "custom-provider"
          ? (await trpcClient.providerProfiles.listProfiles.query()).profiles
          : []
      const normalizedSource = normalizeClaudeModelSourceForRun({
        source: selectedModelSource,
        providerProfiles,
      })
      if (!normalizedSource.ok) {
        toast.error(normalizedSource.blocker.message, {
          description: normalizedSource.blocker.hint,
        })
        throw new Error(normalizedSource.blocker.message)
      }
      modelSource = normalizedSource.source
      if (normalizedSource.changed) {
        appStore.set(
          subChatClaudeModelSourceAtomFamily(this.config.subChatId),
          normalizedSource.source as ClaudeModelSource,
        )
      }
    }

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
    console.log(
      `[SD] R:START sub=${subId} cwd=${this.config.cwd} projectPath=${this.config.projectPath || "(not set)"}`,
    )

    return new ReadableStream({
      start: (controller) => {
        const sub = trpcClient.claude.chat.subscribe(
          {
            subChatId: this.config.subChatId,
            chatId: this.config.chatId,
            runId: crypto.randomUUID(),
            prompt,
            cwd: this.config.cwd,
            projectPath: this.config.projectPath, // Original project path for MCP config lookup
            mode: currentMode,
            sessionId,
            ...(modelSource && { modelSource }),
            ...(maxThinkingTokens && { maxThinkingTokens }),
            ...(modelString && { model: modelString }),
            ...(selectedOllamaModel && { selectedOllamaModel }),
            historyEnabled,
            offlineModeEnabled,
            enableTasks,
            ...(images.length > 0 && { images }),
            ...(longTextAttachments.length > 0 ? { longTextAttachments } : {}),
            ...(appStore
              .get(approvedGuardedRunContractsAtom)
              .get(this.config.subChatId)
              ? {
                  scopeContract: appStore
                    .get(approvedGuardedRunContractsAtom)
                    .get(this.config.subChatId),
                }
              : {}),
          },
          {
            onData: (chunk: ClaudeUIMessageChunk) => {
              chunkCount++
              lastChunkType = chunk.type

              applyRuntimeEventStateChunk(
                {
                  subChatId: this.config.subChatId,
                  parentChatId: this.config.chatId,
                },
                chunk,
              )

              // Handle compacting status - track in atom for UI display
              if (
                (chunk.type === "tool-input-start" &&
                  chunk.toolName === "Compact") ||
                (chunk.type === "tool-input-available" &&
                  chunk.toolName === "Compact")
              ) {
                const compacting = appStore.get(compactingSubChatsAtom)
                const newCompacting = new Set(compacting)
                // Compacting started
                newCompacting.add(this.config.subChatId)
                appStore.set(compactingSubChatsAtom, newCompacting)
              }
              if (
                (chunk.type === "tool-output-available" &&
                  chunk.toolCallId?.startsWith("compact-")) ||
                (chunk.type === "tool-output-error" &&
                  chunk.toolCallId?.startsWith("compact-"))
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

              clearPendingUserQuestionForRuntimeChunk({
                subChatId: this.config.subChatId,
                chunk,
              })

              // Handle authentication errors - show Claude login modal
              if (chunk.type === "auth-error") {
                // Store the failed message for retry after successful auth.
                // readyToRetry=false prevents immediate retry; modal sets it
                // to true on successful local Claude Code credential import.
                appStore.set(pendingAuthRetryMessageAtom, {
                  subChatId: this.config.subChatId,
                  provider: "claude-code",
                  prompt,
                  ...(images.length > 0 && { images }),
                  ...(longTextAttachments.length > 0 && {
                    longTextAttachments,
                  }),
                  readyToRetry: false,
                })
                appStore.set(claudeLoginModalConfigAtom, {
                  hideCustomModelSettingsLink: false,
                  autoStartAuth: true,
                })
                appStore.set(agentsLoginModalOpenAtom, true)
                console.log(`[SD] R:AUTH_ERR sub=${subId}`)
                controller.error(new Error("Authentication required"))
                return
              }

              if (chunk.type === "finish") {
                const approvedContracts = appStore.get(
                  approvedGuardedRunContractsAtom,
                )
                if (approvedContracts.has(this.config.subChatId)) {
                  const nextContracts = new Map(approvedContracts)
                  nextContracts.delete(this.config.subChatId)
                  appStore.set(approvedGuardedRunContractsAtom, nextContracts)
                }
              }

              // Handle retry notification - show friendly toast instead of scary error
              if (chunk.type === "retry-notification") {
                toast.info(tr("agent.transport.retryingRequest"), {
                  description:
                    chunk.message || tr("agent.transport.requestRetrying"),
                  duration: 4000,
                })
                return // don't enqueue retry-notification as a stream chunk
              }

              // Handle errors - show toast to user FIRST before anything else
              if (chunk.type === "error") {
                const debugInfo = getClaudeErrorDebugInfo(chunk)
                const category = debugInfo?.category || "UNKNOWN"

                // Detailed SDK error logging for debugging
                console.error(
                  `[SDK ERROR] ========================================`,
                )
                console.error(`[SDK ERROR] Category: ${category}`)
                console.error(`[SDK ERROR] Error text: ${chunk.errorText}`)
                console.error(`[SDK ERROR] Chat ID: ${this.config.chatId}`)
                console.error(
                  `[SDK ERROR] SubChat ID: ${this.config.subChatId}`,
                )
                console.error(`[SDK ERROR] CWD: ${this.config.cwd}`)
                console.error(`[SDK ERROR] Mode: ${currentMode}`)
                if (debugInfo) {
                  console.error(
                    `[SDK ERROR] Debug info:`,
                    JSON.stringify(debugInfo, null, 2),
                  )
                }
                console.error(
                  `[SDK ERROR] Full chunk:`,
                  JSON.stringify(chunk, null, 2),
                )
                console.error(
                  `[SDK ERROR] ========================================`,
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
                  debugInfo
                    ? `Debug Info: ${JSON.stringify(debugInfo, null, 2)}`
                    : null,
                ]
                  .filter(Boolean)
                  .join("\n")

                // Show toast based on error category
                const config = ERROR_TOAST_CONFIG[category]
                const title = config?.title || tr("agent.transport.claudeError")
                // For auth/API key failures, prefer original backend error to aid debugging
                const preferOriginalError =
                  category === "AUTH_FAILURE" ||
                  category === "INVALID_API_KEY_SDK" ||
                  category === "INVALID_API_KEY"
                // Use config description if set, otherwise fall back to errorText
                const rawDescription = preferOriginalError
                  ? chunk.errorText ||
                    config?.description ||
                    tr("agent.transport.unexpectedError")
                  : config?.description ||
                    chunk.errorText ||
                    tr("agent.transport.unexpectedError")
                // Truncate long descriptions for toast (keep first 300 chars)
                const description =
                  rawDescription.length > 300
                    ? rawDescription.slice(0, 300) + "..."
                    : rawDescription

                toast.error(title, {
                  description,
                  duration: 12000,
                  action: {
                    label: tr("agent.transport.copyError"),
                    onClick: () => {
                      navigator.clipboard.writeText(errorDetails)
                      toast.success(tr("agent.transport.errorDetailsCopied"))
                    },
                  },
                })
              }

              // Try to enqueue, but don't crash if stream is already closed
              try {
                controller.enqueue(toAiSdkTransportChunk(chunk))
              } catch (e) {
                // CRITICAL: Log when enqueue fails - this could explain missing chunks!
                console.log(
                  `[SD] R:ENQUEUE_ERR sub=${subId} type=${chunk.type} n=${chunkCount} err=${e}`,
                )
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
              console.log(
                `[SD] R:ERROR sub=${subId} n=${chunkCount} last=${lastChunkType} err=${err.message}`,
              )
              controller.error(err)
            },
            onComplete: () => {
              console.log(
                `[SD] R:COMPLETE sub=${subId} n=${chunkCount} last=${lastChunkType}`,
              )
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
        options.abortSignal?.addEventListener("abort", () => {
          console.log(
            `[SD] R:ABORT sub=${subId} n=${chunkCount} last=${lastChunkType}`,
          )
          sub.unsubscribe()
          // trpcClient.claude.cancel.mutate({ subChatId: this.config.subChatId })
          try {
            controller.close()
          } catch {
            // Already closed
          }
        })
      },
    })
  }

  async reconnectToStream(): Promise<ReadableStream<AiSdkTransportChunk> | null> {
    return null // Not needed for local app
  }

  private extractText(msg: UIMessage | undefined): string {
    if (!msg) return ""

    const textParts: string[] = []
    const fileContents: string[] = []

    for (const part of getCanonicalMessageParts(msg)) {
      if (isTextMessagePart(part)) {
        textParts.push(part.text)
      } else if (isFileContentMessagePart(part)) {
        // Hidden file content - add to prompt but not displayed in UI
        const fileName =
          part.filePath.split("/").pop() || part.filePath || "file"
        fileContents.push(`\n--- ${fileName} ---\n${part.content}`)
      }
    }

    return textParts.join("\n") + fileContents.join("")
  }

  /**
   * Extract images from message parts
   * Looks for parts with type "data-image" that have base64Data
   */
  private extractImages(msg: UIMessage | undefined): ImageAttachment[] {
    if (!msg) return []

    const images: ImageAttachment[] = []

    for (const part of getCanonicalMessageParts(msg)) {
      const attachment = normalizeChatImageAttachmentPart(part)
      if (attachment) {
        images.push({
          attachmentId: attachment.attachmentId,
          localRef: attachment.localRef,
          mediaType: attachment.mediaType,
          filename: attachment.filename,
          sizeBytes: attachment.sizeBytes,
          width: attachment.width,
          height: attachment.height,
          sha256: attachment.sha256,
        })
        continue
      }

      // Check for data-image parts with base64 data
      if (isDataImageMessagePart(part)) {
        if (part.data.base64Data && part.data.mediaType) {
          images.push({
            base64Data: part.data.base64Data,
            mediaType: part.data.mediaType,
            filename: part.data.filename,
          })
        }
      }
    }

    return images
  }

  private extractLongTextAttachments(
    msg: UIMessage | undefined,
  ): LongTextAttachmentPart[] {
    return getCanonicalMessageParts(msg).flatMap((part) => {
      const attachment = normalizeLongTextAttachmentPart(part)
      return attachment ? [attachment] : []
    })
  }
}

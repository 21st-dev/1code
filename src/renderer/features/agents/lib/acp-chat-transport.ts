import type { ChatTransport, UIMessage } from "ai"
import { toast } from "sonner"
import { normalizeCodexStreamChunk } from "../../../../shared/codex-tool-normalizer"
import {
  codexApiKeyAtom,
  codexLoginModalOpenAtom,
  codexOnboardingAuthMethodAtom,
  codexOnboardingCompletedAtom,
  normalizeCodexApiKey,
  sessionInfoAtom,
} from "../../../lib/atoms"
import { appStore } from "../../../lib/jotai-store"
import { trpcClient } from "../../../lib/trpc"
import {
  pendingAuthRetryMessageAtom,
  subChatCodexModelIdAtomFamily,
  subChatCodexThinkingAtomFamily,
} from "../atoms"
import { CODEX_MODELS, type CodexThinkingLevel } from "./models"
import { useAgentSubChatStore } from "../stores/sub-chat-store"
import type { AgentMessageMetadata } from "../ui/agent-message-usage"

type UIMessageChunk = any

type ACPChatTransportConfig = {
  chatId: string
  subChatId: string
  cwd: string
  projectPath?: string
  mode: "plan" | "agent"
  provider: "codex"
}

type ImageAttachment = {
  base64Data: string
  mediaType: string
  filename?: string
}

// When a sub-chat hits auth-error, force one fresh Codex ACP session on next send.
const forceFreshSessionSubChats = new Set<string>()
const DEFAULT_CODEX_MODEL = "gpt-5.3-codex/high"
function getStoredCodexCredentials(): {
  hasApiKey: boolean
  hasSubscription: boolean
  hasAny: boolean
} {
  const hasApiKey = Boolean(normalizeCodexApiKey(appStore.get(codexApiKeyAtom)))
  const hasSubscription =
    appStore.get(codexOnboardingCompletedAtom) &&
    appStore.get(codexOnboardingAuthMethodAtom) === "chatgpt"

  return {
    hasApiKey,
    hasSubscription,
    hasAny: hasApiKey || hasSubscription,
  }
}

async function resolveCodexCredentialsForAuthError(): Promise<{
  hasApiKey: boolean
  hasSubscription: boolean
  hasAny: boolean
}> {
  const snapshot = getStoredCodexCredentials()

  let hasSubscription = false
  try {
    const integration = await trpcClient.codex.getIntegration.query()
    hasSubscription = integration.state === "connected_chatgpt"
  } catch {
    hasSubscription = false
  }

  return {
    hasApiKey: snapshot.hasApiKey,
    hasSubscription,
    hasAny: snapshot.hasApiKey || hasSubscription,
  }
}

function getSelectedCodexModel(subChatId: string): string {
  const selectedModelId = appStore.get(subChatCodexModelIdAtomFamily(subChatId))
  const selectedThinking = appStore.get(subChatCodexThinkingAtomFamily(subChatId))
  const selectedModel =
    CODEX_MODELS.find((model) => model.id === selectedModelId) ||
    CODEX_MODELS.find((model) => model.id === "gpt-5.3-codex") ||
    CODEX_MODELS[0]

  if (!selectedModel) {
    return DEFAULT_CODEX_MODEL
  }

  const normalizedThinking = selectedModel.thinkings.includes(
    selectedThinking as CodexThinkingLevel,
  )
    ? (selectedThinking as CodexThinkingLevel)
    : selectedModel.thinkings.includes("high")
      ? "high"
      : selectedModel.thinkings[0]

  if (!normalizedThinking) {
    return DEFAULT_CODEX_MODEL
  }

  return `${selectedModel.id}/${normalizedThinking}`
}

export class ACPChatTransport implements ChatTransport<UIMessage> {
  constructor(private config: ACPChatTransportConfig) {}

  async sendMessages(options: {
    messages: UIMessage[]
    abortSignal?: AbortSignal
  }): Promise<ReadableStream<UIMessageChunk>> {
    const lastUser = [...options.messages]
      .reverse()
      .find((message) => message.role === "user")

    const prompt = this.extractText(lastUser)
    const images = this.extractImages(lastUser)

    const lastAssistant = [...options.messages]
      .reverse()
      .find((message) => message.role === "assistant")
    const metadata = lastAssistant?.metadata as AgentMessageMetadata | undefined
    const sessionId = metadata?.sessionId

    const currentMode =
      useAgentSubChatStore
        .getState()
        .allSubChats.find((subChat) => subChat.id === this.config.subChatId)
        ?.mode || this.config.mode
    const forceNewSession = forceFreshSessionSubChats.has(this.config.subChatId)
    if (forceNewSession) {
      forceFreshSessionSubChats.delete(this.config.subChatId)
    }
    const codexApiKey = normalizeCodexApiKey(appStore.get(codexApiKeyAtom))
    const selectedModel = getSelectedCodexModel(this.config.subChatId)

    return new ReadableStream({
      start: (controller) => {
        const runId = crypto.randomUUID()
        let sub: { unsubscribe: () => void } | null = null
        let didUnsubscribe = false
        let forcedUnsubscribeTimer: ReturnType<typeof setTimeout> | null = null

        const clearForcedUnsubscribeTimer = () => {
          if (!forcedUnsubscribeTimer) return
          clearTimeout(forcedUnsubscribeTimer)
          forcedUnsubscribeTimer = null
        }

        const safeUnsubscribe = () => {
          if (didUnsubscribe) return
          didUnsubscribe = true
          clearForcedUnsubscribeTimer()
          sub?.unsubscribe()
        }

        sub = trpcClient.codex.chat.subscribe(
          {
            subChatId: this.config.subChatId,
            chatId: this.config.chatId,
            runId,
            prompt,
            cwd: this.config.cwd,
            ...(this.config.projectPath
              ? { projectPath: this.config.projectPath }
              : {}),
            model: selectedModel,
            mode: currentMode,
            ...(sessionId ? { sessionId } : {}),
            ...(forceNewSession ? { forceNewSession: true } : {}),
            ...(images.length > 0 ? { images } : {}),
            ...(codexApiKey
              ? {
                  authConfig: {
                    apiKey: codexApiKey,
                  },
                }
              : {}),
          },
          {
            onData: (chunk: UIMessageChunk) => {
              if (chunk.type === "session-init") {
                appStore.set(sessionInfoAtom, {
                  tools: chunk.tools || [],
                  mcpServers: chunk.mcpServers || [],
                  plugins: chunk.plugins || [],
                  skills: chunk.skills || [],
                })
              }

              if (chunk.type === "auth-error") {
                forceFreshSessionSubChats.add(this.config.subChatId)

                void (async () => {
                  const credentials = await resolveCodexCredentialsForAuthError()
                  const shouldAutoRetryOnce = credentials.hasAny && !forceNewSession

                  appStore.set(pendingAuthRetryMessageAtom, {
                    subChatId: this.config.subChatId,
                    provider: "codex",
                    prompt,
                    ...(images.length > 0 && { images }),
                    readyToRetry: shouldAutoRetryOnce,
                  })

                  if (!credentials.hasAny) {
                    appStore.set(codexLoginModalOpenAtom, true)
                  } else if (!shouldAutoRetryOnce) {
                    toast.error("Codex authentication failed", {
                      description: credentials.hasApiKey
                        ? "Saved Codex API key was rejected. Update it in Settings."
                        : "Saved Codex subscription auth failed. Reconnect subscription in Settings.",
                    })
                  }
                })()

                void trpcClient.codex.cleanup
                  .mutate({ subChatId: this.config.subChatId })
                  .catch(() => {
                    // No-op
                  })

                // Force stream status reset so retry can start once auth succeeds.
                controller.error(new Error("Codex authentication required"))
                return
              }

              if (chunk.type === "error") {
                toast.error("Codex error", {
                  description: chunk.errorText || "An unexpected Codex error occurred.",
                })
              }

              try {
                const normalizedChunk = normalizeCodexStreamChunk(chunk) as UIMessageChunk
                controller.enqueue(normalizedChunk)
              } catch {
                // Stream already closed
              }

              if (chunk.type === "finish") {
                try {
                  controller.close()
                } catch {
                  // Stream already closed
                }
              }
            },
            onError: (error: Error) => {
              toast.error("Codex request failed", {
                description: error.message,
              })
              controller.error(error)
              safeUnsubscribe()
            },
            onComplete: () => {
              try {
                controller.close()
              } catch {
                // Stream already closed
              }
              safeUnsubscribe()
            },
          },
        )

        options.abortSignal?.addEventListener(
          "abort",
          () => {
            // Start server-side cancellation first so the router still has
            // active run ownership when processing cancel(runId).
            const cancelPromise = trpcClient.codex.cancel
              .mutate({ subChatId: this.config.subChatId, runId })
              .catch(() => {
                // No-op
              })

            // Keep stop UX immediate in the client.
            try {
              controller.close()
            } catch {
              // Stream already closed
            }

            // Keep subscription alive briefly so server-side onFinish can persist
            // interrupted response state before cleanup unsubscribe runs.
            void (async () => {
              try {
                await cancelPromise
              } finally {
                clearForcedUnsubscribeTimer()
                forcedUnsubscribeTimer = setTimeout(() => {
                  safeUnsubscribe()
                }, 10000)
              }
            })()
          },
          { once: true },
        )
      },
    })
  }

  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    return null
  }

  cleanup(): void {
    void trpcClient.codex.cleanup
      .mutate({ subChatId: this.config.subChatId })
      .catch(() => {
        // No-op
      })
  }

  private extractText(message: UIMessage | undefined): string {
    if (!message) return ""

    if (!message.parts) return ""

    const textParts: string[] = []
    const fileContents: string[] = []

    for (const part of message.parts) {
      if (part.type === "text" && (part as any).text) {
        textParts.push((part as any).text)
      } else if ((part as any).type === "file-content") {
        const filePart = part as any
        const fileName =
          filePart.filePath?.split("/").pop() || filePart.filePath || "file"
        fileContents.push(`\n--- ${fileName} ---\n${filePart.content}`)
      }
    }

    return textParts.join("\n") + fileContents.join("")
  }

  private extractImages(message: UIMessage | undefined): ImageAttachment[] {
    if (!message?.parts) return []

    const images: ImageAttachment[] = []

    for (const part of message.parts) {
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

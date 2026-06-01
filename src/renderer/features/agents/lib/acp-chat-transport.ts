import type { ChatTransport, UIMessage } from "ai"
import { toast } from "sonner"
import { normalizeCodexStreamChunk } from "../../../../shared/codex-tool-normalizer"
import {
  normalizeLongTextAttachmentPart,
  type LongTextAttachmentPart,
} from "../../../../shared/long-text-attachments"
import { normalizeChatImageAttachmentPart } from "../../../../shared/chat-attachments"
import { parseProviderProfileSource } from "../../../../shared/provider-profile-types"
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
import { en, zhCN, type TranslationKey } from "../../../lib/i18n/dictionaries"
import {
  approvedGuardedRunContractsAtom,
  askUserQuestionResultsAtom,
  expiredUserQuestionsAtom,
  guardedRunAuditsAtom,
  guardedRunEventsAtom,
  pendingUserQuestionsAtom,
  pendingAuthRetryMessageAtom,
  pendingScopeExpansionRequestsAtom,
  subChatCodexModelIdAtomFamily,
  subChatCodexModelSourceAtomFamily,
  subChatCodexThinkingAtomFamily,
} from "../atoms"
import { CODEX_MODELS, type CodexThinkingLevel } from "./models"
import { useAgentSubChatStore } from "../stores/sub-chat-store"
import type { AgentMessageMetadata } from "../ui/agent-message-usage"

type UIMessageChunk = any

function tr(key: TranslationKey, values?: Record<string, string | number>) {
  const useZh =
    typeof navigator !== "undefined" &&
    (navigator.language || navigator.languages?.[0] || "").toLowerCase().startsWith("zh")
  const template = (useZh ? zhCN[key] : en[key]) || en[key] || key

  return template.replace(/\{(\w+)\}/g, (match, name) => {
    const value = values?.[name]
    return value === undefined ? match : String(value)
  })
}

type ACPChatTransportConfig = {
  chatId: string
  subChatId: string
  cwd: string
  projectPath?: string
  mode: "plan" | "agent"
  provider: "codex"
}

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

// When a sub-chat hits auth-error, force one fresh Codex ACP session on next send.
const forceFreshSessionSubChats = new Set<string>()
const DEFAULT_CODEX_MODEL = "gpt-5.5/high"
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
    CODEX_MODELS.find((model) => model.id === "gpt-5.5") ||
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
    const longTextAttachments = this.extractLongTextAttachments(lastUser)

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
    const selectedCodexModelSource = appStore.get(
      subChatCodexModelSourceAtomFamily(this.config.subChatId),
    )
    const storedCodexApiKey = normalizeCodexApiKey(appStore.get(codexApiKeyAtom))
    const effectiveCodexModelSource =
      selectedCodexModelSource === "chatgpt" &&
      appStore.get(codexOnboardingAuthMethodAtom) === "api_key" &&
      storedCodexApiKey
        ? "openai-api-key"
        : selectedCodexModelSource
    const providerProfileId = parseProviderProfileSource(effectiveCodexModelSource)
    const codexApiKey =
      effectiveCodexModelSource === "openai-api-key" ? storedCodexApiKey : ""
    const selectedModel = getSelectedCodexModel(this.config.subChatId)

    return new ReadableStream({
      start: (controller) => {
        const runId = crypto.randomUUID()
        let sub: { unsubscribe: () => void } | null = null
        let didUnsubscribe = false
        let forcedUnsubscribeTimer: ReturnType<typeof setTimeout> | null = null
        let lastRuntimeStatusError: string | null = null

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
            ...(longTextAttachments.length > 0 ? { longTextAttachments } : {}),
            ...(appStore.get(approvedGuardedRunContractsAtom).get(this.config.subChatId)
              ? {
                  scopeContract: appStore
                    .get(approvedGuardedRunContractsAtom)
                    .get(this.config.subChatId),
                }
              : {}),
            ...(providerProfileId ? { providerProfileId } : {}),
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

                if (providerProfileId) {
                  const error = new Error("Provider Profile authentication failed")
                  toast.error(tr("agent.transport.codexRequestFailed"), {
                    description: error.message,
                  })
                  controller.error(error)
                  return
                }

                void (async () => {
                  const credentials = await resolveCodexCredentialsForAuthError()
                  const shouldAutoRetryOnce = credentials.hasAny && !forceNewSession

                  appStore.set(pendingAuthRetryMessageAtom, {
                    subChatId: this.config.subChatId,
                    provider: "codex",
                    prompt,
                    ...(images.length > 0 && { images }),
                    ...(longTextAttachments.length > 0 && { longTextAttachments }),
                    readyToRetry: shouldAutoRetryOnce,
                  })

                  if (!credentials.hasAny) {
                    appStore.set(codexLoginModalOpenAtom, true)
                  } else if (!shouldAutoRetryOnce) {
                    toast.error(tr("agent.transport.codexAuthFailed"), {
                      description: credentials.hasApiKey
                        ? tr("agent.transport.codexApiKeyRejected")
                        : tr("agent.transport.codexSubscriptionAuthFailed"),
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
                if (!chunk.errorText || chunk.errorText !== lastRuntimeStatusError) {
                  toast.error(tr("agent.transport.codexError"), {
                    description: chunk.errorText || tr("agent.transport.unexpectedCodexError"),
                  })
                }
              }

              if (chunk.type === "runtime-status" && chunk.ok === false) {
                lastRuntimeStatusError = chunk.blocker?.message || null
                const description =
                  chunk.blocker?.hint && chunk.blocker?.message
                    ? `${chunk.blocker.message} ${chunk.blocker.hint}`
                    : chunk.blocker?.message || tr("agent.transport.unexpectedCodexError")
                toast.error(tr("agent.transport.codexError"), {
                  description,
                })
              }

              if (chunk.type === "capability-error") {
                lastRuntimeStatusError = chunk.errorText || null
                toast.error(tr("agent.transport.codexError"), {
                  description:
                    chunk.errorText || tr("agent.transport.unexpectedCodexError"),
                })
              }

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

                const currentExpired = appStore.get(expiredUserQuestionsAtom)
                if (currentExpired.has(this.config.subChatId)) {
                  const newExpiredMap = new Map(currentExpired)
                  newExpiredMap.delete(this.config.subChatId)
                  appStore.set(expiredUserQuestionsAtom, newExpiredMap)
                }
              }

              if (chunk.type === "ask-user-question-timeout") {
                const currentMap = appStore.get(pendingUserQuestionsAtom)
                const pending = currentMap.get(this.config.subChatId)
                if (pending && pending.toolUseId === chunk.toolUseId) {
                  const newPendingMap = new Map(currentMap)
                  newPendingMap.delete(this.config.subChatId)
                  appStore.set(pendingUserQuestionsAtom, newPendingMap)

                  const currentExpired = appStore.get(expiredUserQuestionsAtom)
                  const newExpiredMap = new Map(currentExpired)
                  newExpiredMap.set(this.config.subChatId, pending)
                  appStore.set(expiredUserQuestionsAtom, newExpiredMap)
                }
              }

              if (chunk.type === "ask-user-question-result") {
                const currentResults = appStore.get(askUserQuestionResultsAtom)
                const newResults = new Map(currentResults)
                newResults.set(chunk.toolUseId, chunk.result)
                appStore.set(askUserQuestionResultsAtom, newResults)
              }

              if (chunk.type === "guard-event") {
                const currentEvents = appStore.get(guardedRunEventsAtom)
                const nextEvents = new Map(currentEvents)
                const events = nextEvents.get(this.config.subChatId) ?? []
                nextEvents.set(this.config.subChatId, [...events, chunk.event])
                appStore.set(guardedRunEventsAtom, nextEvents)

                if (chunk.event?.type === "scope-expansion-request") {
                  const currentRequests = appStore.get(pendingScopeExpansionRequestsAtom)
                  const nextRequests = new Map(currentRequests)
                  nextRequests.set(this.config.subChatId, {
                    subChatId: this.config.subChatId,
                    parentChatId: this.config.chatId,
                    toolUseId: chunk.event.toolUseId,
                    contractId: chunk.event.contractId,
                    path: chunk.event.path,
                    paths: chunk.event.paths,
                    toolName: chunk.event.toolName,
                    reason: chunk.event.reason,
                  })
                  appStore.set(pendingScopeExpansionRequestsAtom, nextRequests)
                }
              }

              if (chunk.type === "guard-audit") {
                const currentAudits = appStore.get(guardedRunAuditsAtom)
                const nextAudits = new Map(currentAudits)
                nextAudits.set(this.config.subChatId, chunk.audit)
                appStore.set(guardedRunAuditsAtom, nextAudits)
              }

              try {
                const normalizedChunk = normalizeCodexStreamChunk(chunk) as UIMessageChunk
                controller.enqueue(normalizedChunk)
              } catch {
                // Stream already closed
              }

              if (chunk.type === "finish") {
                const approvedContracts = appStore.get(approvedGuardedRunContractsAtom)
                if (approvedContracts.has(this.config.subChatId)) {
                  const nextContracts = new Map(approvedContracts)
                  nextContracts.delete(this.config.subChatId)
                  appStore.set(approvedGuardedRunContractsAtom, nextContracts)
                }
                try {
                  controller.close()
                } catch {
                  // Stream already closed
                }
              }
            },
            onError: (error: Error) => {
              toast.error(tr("agent.transport.codexRequestFailed"), {
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

        options.abortSignal?.addEventListener("abort", () => {
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
        })
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

  private extractLongTextAttachments(
    message: UIMessage | undefined
  ): LongTextAttachmentPart[] {
    if (!message?.parts) return []

    return message.parts.flatMap((part) => {
      const attachment = normalizeLongTextAttachmentPart(part)
      return attachment ? [attachment] : []
    })
  }
}

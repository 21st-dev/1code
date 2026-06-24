import type { ChatTransport, UIMessage } from "ai"
import { toast } from "sonner"
import { appStore } from "../../../lib/jotai-store"
import { trpcClient } from "../../../lib/trpc"
import { approvedGuardedRunContractsAtom } from "../atoms"
import {
  type AiSdkTransportChunk,
  getCanonicalMessageParts,
  isFileContentMessagePart,
  isTextMessagePart,
} from "./chat-message-ui-adapter"
import {
  createExperimentalRuntimeUiStreamState,
  finalizeExperimentalRuntimeUiStream,
  normalizeExperimentalRuntimeUiChunk,
} from "./qwen-ui-stream-normalizer"
import { applyRuntimeEventStateChunk } from "./runtime-event-state"

type ExperimentalRuntimeTransportId = "qwen-code" | "kun"

type QwenChatTransportConfig = {
  runtimeId?: ExperimentalRuntimeTransportId
  chatId: string
  subChatId: string
  cwd: string
  mode: "plan" | "agent"
  modelSource?: string | null
  providerProfileId?: string | null
}

type QwenTransportChunk = Record<string, unknown>

export class QwenChatTransport implements ChatTransport<UIMessage> {
  constructor(private config: QwenChatTransportConfig) {}

  get runtimeId(): ExperimentalRuntimeTransportId {
    return this.config.runtimeId ?? "qwen-code"
  }

  private get runtimeLabel(): string {
    return this.runtimeId === "kun" ? "Kun" : "Qwen Code"
  }

  async sendMessages(options: {
    messages: UIMessage[]
    abortSignal?: AbortSignal
  }): Promise<ReadableStream<AiSdkTransportChunk>> {
    const lastUser = [...options.messages]
      .reverse()
      .find((message) => message.role === "user")
    const lastAssistant = [...options.messages]
      .reverse()
      .find((message) => message.role === "assistant")
    const metadata = lastAssistant?.metadata as
      | { sessionId?: string | null }
      | undefined
    const prompt = this.extractText(lastUser)

    return new ReadableStream({
      start: (controller) => {
        const runId = crypto.randomUUID()
        let sub: { unsubscribe: () => void } | null = null
        let didUnsubscribe = false
        const uiStreamState = createExperimentalRuntimeUiStreamState()
        const approvedScopeContract =
          this.runtimeId === "kun"
            ? appStore
                .get(approvedGuardedRunContractsAtom)
                .get(this.config.subChatId)
            : undefined

        const safeUnsubscribe = () => {
          if (didUnsubscribe) return
          didUnsubscribe = true
          sub?.unsubscribe()
        }
        const clearApprovedScopeContract = () => {
          const approvedContracts = appStore.get(
            approvedGuardedRunContractsAtom,
          )
          if (!approvedContracts.has(this.config.subChatId)) return
          const nextContracts = new Map(approvedContracts)
          nextContracts.delete(this.config.subChatId)
          appStore.set(approvedGuardedRunContractsAtom, nextContracts)
        }

        sub = trpcClient.agentRuntime.chat.subscribe(
          {
            runtimeId: this.runtimeId,
            subChatId: this.config.subChatId,
            chatId: this.config.chatId,
            runId,
            prompt,
            cwd: this.config.cwd,
            mode: this.config.mode,
            ...(this.config.modelSource
              ? { modelSource: this.config.modelSource }
              : {}),
            ...(this.config.providerProfileId
              ? { providerProfileId: this.config.providerProfileId }
              : {}),
            ...(approvedScopeContract
              ? { scopeContract: approvedScopeContract }
              : {}),
            ...(metadata?.sessionId ? { sessionId: metadata.sessionId } : {}),
          },
          {
            onData: (chunk: QwenTransportChunk) => {
              if (chunk.type === "error" || chunk.type === "capability-error") {
                const errorText =
                  typeof chunk.errorText === "string"
                    ? chunk.errorText
                    : `The ${this.runtimeLabel} runtime stream failed.`
                toast.error(`${this.runtimeLabel} error`, {
                  description: errorText,
                })
              }

              applyRuntimeEventStateChunk(
                {
                  subChatId: this.config.subChatId,
                  parentChatId: this.config.chatId,
                },
                chunk,
              )

              try {
                for (const normalizedChunk of normalizeExperimentalRuntimeUiChunk(
                  uiStreamState,
                  chunk,
                )) {
                  controller.enqueue(normalizedChunk)
                }
              } catch {
                // Stream already closed.
              }
            },
            onError: (error: Error) => {
              toast.error(`${this.runtimeLabel} request failed`, {
                description: error.message,
              })
              controller.error(error)
              clearApprovedScopeContract()
              safeUnsubscribe()
            },
            onComplete: () => {
              try {
                for (const normalizedChunk of finalizeExperimentalRuntimeUiStream(
                  uiStreamState,
                )) {
                  controller.enqueue(normalizedChunk)
                }
              } catch {
                // Stream already closed.
              }
              try {
                controller.close()
              } catch {
                // Stream already closed.
              }
              clearApprovedScopeContract()
              safeUnsubscribe()
            },
          },
        )

        options.abortSignal?.addEventListener("abort", () => {
          try {
            controller.close()
          } catch {
            // Stream already closed.
          }
          clearApprovedScopeContract()
          safeUnsubscribe()
        })
      },
    })
  }

  async reconnectToStream(): Promise<ReadableStream<AiSdkTransportChunk> | null> {
    return null
  }

  cleanup(): void {}

  private extractText(message: UIMessage | undefined): string {
    if (!message) return ""

    const textParts: string[] = []
    const fileContents: string[] = []

    for (const part of getCanonicalMessageParts(message)) {
      if (isTextMessagePart(part)) {
        textParts.push(part.text)
      } else if (isFileContentMessagePart(part)) {
        const fileName =
          part.filePath.split("/").pop() || part.filePath || "file"
        fileContents.push(`\n--- ${fileName} ---\n${part.content}`)
      }
    }

    return textParts.join("\n") + fileContents.join("")
  }
}

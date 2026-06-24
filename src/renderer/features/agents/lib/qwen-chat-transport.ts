import type { ChatTransport, UIMessage } from "ai"
import { toast } from "sonner"
import { trpcClient } from "../../../lib/trpc"
import {
  type AiSdkTransportChunk,
  getCanonicalMessageParts,
  isFileContentMessagePart,
  isTextMessagePart,
  toAiSdkTransportChunk,
} from "./chat-message-ui-adapter"
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

type QwenTransportChunk = Record<string, any>

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

        const safeUnsubscribe = () => {
          if (didUnsubscribe) return
          didUnsubscribe = true
          sub?.unsubscribe()
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
            ...(metadata?.sessionId ? { sessionId: metadata.sessionId } : {}),
          },
          {
            onData: (chunk: QwenTransportChunk) => {
              if (chunk.type === "error" || chunk.type === "capability-error") {
                toast.error(`${this.runtimeLabel} error`, {
                  description:
                    chunk.errorText ||
                    `The ${this.runtimeLabel} runtime stream failed.`,
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
                controller.enqueue(toAiSdkTransportChunk(chunk))
              } catch {
                // Stream already closed.
              }
            },
            onError: (error: Error) => {
              toast.error(`${this.runtimeLabel} request failed`, {
                description: error.message,
              })
              controller.error(error)
              safeUnsubscribe()
            },
            onComplete: () => {
              try {
                controller.close()
              } catch {
                // Stream already closed.
              }
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

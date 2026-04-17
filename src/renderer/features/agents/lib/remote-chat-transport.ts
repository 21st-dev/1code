import type { ChatTransport, UIMessage } from "ai"
import { toast } from "sonner"

type UIMessageChunk = any

type RemoteChatTransportConfig = {
  chatId: string
  subChatId: string
  subChatName: string
  sandboxUrl: string
  mode: "plan" | "agent"
  model?: string
}

function generateStreamId(): string {
  return `stream_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export class RemoteChatTransport implements ChatTransport<UIMessage> {
  constructor(private config: RemoteChatTransportConfig) {}

  async sendMessages(options: {
    messages: UIMessage[]
    abortSignal?: AbortSignal
  }): Promise<ReadableStream<UIMessageChunk>> {
    void options
    toast.error("Remote cloud chat is unavailable", {
      description: "OpenCodex local-native mode removed the legacy remote sandbox transport.",
    })
    throw new Error(
      `Remote transport removed for chat ${this.config.chatId.slice(-8)}`,
    )
  }

  private createIPCStream(
    streamId: string,
    subId: string,
    abortSignal?: AbortSignal
  ): ReadableStream<UIMessageChunk> {
    const decoder = new TextDecoder()
    let buffer = ""
    let chunkCount = 0
    let cleanupChunk: (() => void) | null = null
    let cleanupDone: (() => void) | null = null
    let cleanupError: (() => void) | null = null
    let resolveNext: ((result: { done: boolean; chunk?: UIMessageChunk }) => void) | null = null
    let rejectNext: ((error: Error) => void) | null = null
    let pendingChunks: UIMessageChunk[] = []
    let streamDone = false
    let streamError: Error | null = null

    const processBytes = (bytes: Uint8Array) => {
      buffer += decoder.decode(bytes, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() || ""

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6).trim()

          if (data === "[DONE]") {
            console.log(`[RemoteTransport] FINISH sub=${subId} chunks=${chunkCount}`)
            streamDone = true
            if (resolveNext) {
              resolveNext({ done: true })
              resolveNext = null
            }
            return
          }

          try {
            const chunk = JSON.parse(data)
            chunkCount++
            if (chunkCount <= 3) {
              console.log(`[RemoteTransport] Chunk #${chunkCount}`, {
                subId,
                type: chunk.type,
                preview: JSON.stringify(chunk).slice(0, 200),
              })
            }

            if (resolveNext) {
              resolveNext({ done: false, chunk })
              resolveNext = null
            } else {
              pendingChunks.push(chunk)
            }
          } catch {
            console.warn(`[RemoteTransport] Failed to parse chunk`, { subId, data: data.slice(0, 100) })
          }
        }
      }
    }

    cleanupChunk = window.desktopApi.onStreamChunk(streamId, processBytes)
    cleanupDone = window.desktopApi.onStreamDone(streamId, () => {
      console.log(`[RemoteTransport] DONE sub=${subId} chunks=${chunkCount}`)
      streamDone = true
      if (resolveNext) {
        resolveNext({ done: true })
        resolveNext = null
      }
    })
    cleanupError = window.desktopApi.onStreamError(streamId, (error: string) => {
      console.error(`[RemoteTransport] Stream error sub=${subId}:`, error)
      streamError = new Error(error)
      if (rejectNext) {
        rejectNext(streamError)
        rejectNext = null
      }
    })

    if (abortSignal) {
      abortSignal.addEventListener("abort", () => {
        console.log(`[RemoteTransport] ABORT sub=${subId} chunks=${chunkCount}`)
        streamDone = true
        cleanup()
      })
    }

    const cleanup = () => {
      cleanupChunk?.()
      cleanupDone?.()
      cleanupError?.()
    }

    return new ReadableStream({
      pull: async (controller) => {
        if (pendingChunks.length > 0) {
          controller.enqueue(pendingChunks.shift()!)
          return
        }
        if (streamDone) {
          cleanup()
          controller.close()
          return
        }
        if (streamError) {
          cleanup()
          controller.error(streamError)
          return
        }
        const result = await new Promise<{ done: boolean; chunk?: UIMessageChunk }>((resolve, reject) => {
          resolveNext = resolve
          rejectNext = reject
        })
        if (result.done) {
          cleanup()
          controller.close()
        } else if (result.chunk) {
          controller.enqueue(result.chunk)
        }
      },
      cancel: () => {
        console.log(`[RemoteTransport] CANCEL sub=${subId} chunks=${chunkCount}`)
        cleanup()
      },
    })
  }

  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    return null
  }
}

import type { ChatTransport, UIMessage } from "ai"
import { toast } from "sonner"

// Cache the API base URL (fetched once from main process)
let cachedApiBase: string | null = null

async function getApiBase(): Promise<string> {
  if (!cachedApiBase) {
    // Uses MAIN_VITE_API_URL in dev, "https://21st.dev" in production
    cachedApiBase = await window.desktopApi?.getApiBaseUrl() || "https://21st.dev"
  }
  return cachedApiBase
}

type UIMessageChunk = any

type RemoteChatTransportConfig = {
  chatId: string
  subChatId: string
  subChatName: string
  sandboxUrl: string
  mode: "plan" | "agent" | "ask"
  model?: string // Claude model ID (e.g., "claude-sonnet-4-20250514")
}

/**
 * Generate a unique stream ID for IPC communication
 */
function generateStreamId(): string {
  return `stream_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Remote chat transport for sandbox chats
 * Uses IPC streaming to communicate with the web backend (bypasses CORS)
 */
export class RemoteChatTransport implements ChatTransport<UIMessage> {
  constructor(private config: RemoteChatTransportConfig) {}

  async sendMessages(options: {
    messages: UIMessage[]
    abortSignal?: AbortSignal
  }): Promise<ReadableStream<UIMessageChunk>> {
    if (!window.desktopApi?.streamFetch) {
      console.error("[RemoteTransport] Desktop API not available")
      toast.error("Desktop API not available", {
        description: "Please restart the application",
      })
      throw new Error("Desktop API not available")
    }

    const streamId = generateStreamId()
    const subId = this.config.subChatId.slice(-8)
    console.log(`[RemoteTransport] START`, {
      streamId,
      subId,
      chatId: this.config.chatId,
      sandboxUrl: this.config.sandboxUrl,
      mode: this.config.mode,
      model: this.config.model || "default",
      messageCount: options.messages.length,
    })

    // Build headers - only include x-model if model is specified
    const headers: Record<string, string> = {
      "sandbox-url": this.config.sandboxUrl,
      "parent-chat-id": this.config.chatId,
      "sub-chat-id": this.config.subChatId,
      "sub-chat-name": encodeURIComponent(this.config.subChatName),
      "sub-chat-mode": this.config.mode,
    }
    if (this.config.model) {
      headers["x-model"] = this.config.model
    }

    // Create a ReadableStream that receives chunks from IPC
    const stream = this.createIPCStream(streamId, subId, options.abortSignal)

    // Get API base URL (uses env var in dev, production URL in packaged app)
    const apiBase = await getApiBase()

    // Start the streaming fetch via IPC
    const result = await window.desktopApi.streamFetch(
      streamId,
      `${apiBase}/api/agents/chat`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          id: this.config.subChatId,
          messages: options.messages,
        }),
      }
    )

    console.log(`[RemoteTransport] Stream fetch started`, {
      streamId,
      subId,
      ok: result.ok,
      status: result.status,
    })

    if (!result.ok) {
      console.error(`[RemoteTransport] ERROR`, { subId, status: result.status, error: result.error })

      if (result.status === 401) {
        toast.error("Authentication failed", {
          description: "Please sign in again",
        })
        throw new Error("Authentication required")
      }

      if (result.status === 403) {
        toast.error("Usage limit reached", {
          description: "You've hit your sandbox usage limit",
        })
        throw new Error("Usage limit reached")
      }

      toast.error("Request failed", {
        description: result.error || `Server returned ${result.status}`,
      })
      throw new Error(`Remote chat failed: ${result.status}`)
    }

    return stream
  }

  /**
   * Create a ReadableStream that receives chunks from IPC events
   */
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

    // Process raw bytes into SSE chunks
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
          } catch (parseErr) {
            console.warn(`[RemoteTransport] Failed to parse chunk`, { subId, data: data.slice(0, 100) })
          }
        }
      }
    }

    // Set up IPC listeners
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

    // Handle abort
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
        // Check if we have pending chunks
        if (pendingChunks.length > 0) {
          controller.enqueue(pendingChunks.shift()!)
          return
        }

        // Check if stream is done
        if (streamDone) {
          cleanup()
          controller.close()
          return
        }

        // Check for error
        if (streamError) {
          cleanup()
          controller.error(streamError)
          return
        }

        // Wait for next chunk
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
    // TODO: Implement stream reconnection using stream_id from sub-chat
    return null
  }
}

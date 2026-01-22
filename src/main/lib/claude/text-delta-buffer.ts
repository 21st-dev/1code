import type { UIMessageChunk } from "./types"

/**
 * Buffers text-delta and tool-input-delta chunks to reduce IPC overhead.
 *
 * Key behaviors:
 * 1. Only buffers text-delta and tool-input-delta chunks (high frequency)
 * 2. All other chunks flush the buffer and emit immediately
 * 3. Time-based flush: 50ms (balance between responsiveness and performance)
 * 4. Immediate flush on critical chunks (error, finish, ask-user-question)
 *
 * Based on terminal DataBatcher pattern but adapted for typed chunks.
 */

const BUFFER_FLUSH_MS = 50 // 50ms = good balance for text streaming

const CRITICAL_CHUNK_TYPES = new Set([
  "error",
  "auth-error",
  "finish",
  "ask-user-question",
  "ask-user-question-timeout",
])

type BufferedDelta = {
  type: "text-delta" | "tool-input-delta" | "reasoning-delta"
  id?: string // For text-delta and reasoning-delta
  toolCallId?: string // For tool-input-delta
  accumulated: string
}

export class TextDeltaBuffer {
  private buffer: BufferedDelta | null = null
  private timeout: ReturnType<typeof setTimeout> | null = null
  private onEmit: (chunk: UIMessageChunk) => boolean
  private disposed = false

  constructor(onEmit: (chunk: UIMessageChunk) => boolean) {
    this.onEmit = onEmit
  }

  /**
   * Process a chunk. Buffers text deltas, flushes and emits others immediately.
   * Returns false if the emit callback returned false (observer closed).
   */
  write(chunk: UIMessageChunk): boolean {
    if (this.disposed) return false

    // Critical chunks: flush buffer and emit immediately
    if (CRITICAL_CHUNK_TYPES.has(chunk.type)) {
      this.flush()
      return this.onEmit(chunk)
    }

    // Buffer text-delta chunks
    if (chunk.type === "text-delta") {
      return this.bufferTextDelta(chunk)
    }

    // Buffer tool-input-delta chunks
    if (chunk.type === "tool-input-delta") {
      return this.bufferToolInputDelta(chunk)
    }

    // Buffer reasoning-delta chunks (Extended Thinking)
    if (chunk.type === "reasoning-delta") {
      return this.bufferReasoningDelta(chunk)
    }

    // All other chunks: flush buffer first, then emit
    this.flush()
    return this.onEmit(chunk)
  }

  private bufferTextDelta(chunk: Extract<UIMessageChunk, { type: "text-delta" }>): boolean {
    // If buffering different type or different id, flush first
    if (
      this.buffer &&
      (this.buffer.type !== "text-delta" || this.buffer.id !== chunk.id)
    ) {
      this.flush()
    }

    if (!this.buffer) {
      this.buffer = {
        type: "text-delta",
        id: chunk.id,
        accumulated: chunk.delta,
      }
      this.scheduleFlush()
    } else {
      this.buffer.accumulated += chunk.delta
    }

    return true
  }

  private bufferToolInputDelta(
    chunk: Extract<UIMessageChunk, { type: "tool-input-delta" }>
  ): boolean {
    // If buffering different type or different toolCallId, flush first
    if (
      this.buffer &&
      (this.buffer.type !== "tool-input-delta" ||
        this.buffer.toolCallId !== chunk.toolCallId)
    ) {
      this.flush()
    }

    if (!this.buffer) {
      this.buffer = {
        type: "tool-input-delta",
        toolCallId: chunk.toolCallId,
        accumulated: chunk.inputTextDelta,
      }
      this.scheduleFlush()
    } else {
      this.buffer.accumulated += chunk.inputTextDelta
    }

    return true
  }

  private bufferReasoningDelta(
    chunk: Extract<UIMessageChunk, { type: "reasoning-delta" }>
  ): boolean {
    // If buffering different type or different id, flush first
    if (
      this.buffer &&
      (this.buffer.type !== "reasoning-delta" || this.buffer.id !== chunk.id)
    ) {
      this.flush()
    }

    if (!this.buffer) {
      this.buffer = {
        type: "reasoning-delta",
        id: chunk.id,
        accumulated: chunk.delta,
      }
      this.scheduleFlush()
    } else {
      this.buffer.accumulated += chunk.delta
    }

    return true
  }

  private scheduleFlush(): void {
    if (this.timeout === null) {
      this.timeout = setTimeout(() => this.flush(), BUFFER_FLUSH_MS)
    }
  }

  /**
   * Flush any buffered content immediately.
   */
  flush(): void {
    if (this.timeout !== null) {
      clearTimeout(this.timeout)
      this.timeout = null
    }

    if (!this.buffer || this.disposed) return

    const { type, id, toolCallId, accumulated } = this.buffer
    this.buffer = null

    if (type === "text-delta" && id) {
      this.onEmit({
        type: "text-delta",
        id,
        delta: accumulated,
      })
    } else if (type === "tool-input-delta" && toolCallId) {
      this.onEmit({
        type: "tool-input-delta",
        toolCallId,
        inputTextDelta: accumulated,
      })
    } else if (type === "reasoning-delta" && id) {
      this.onEmit({
        type: "reasoning-delta",
        id,
        delta: accumulated,
      })
    }
  }

  /**
   * Dispose the buffer, flushing any remaining content.
   */
  dispose(): void {
    this.flush()
    this.disposed = true
  }
}

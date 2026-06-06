import { describe, expect, test } from "bun:test"
import { emitCodexAcpUiStream } from "../src/main/lib/codex/acp-ui-stream"

function streamFrom(chunks: any[]): ReadableStream<any> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk)
      }
      controller.close()
    },
  })
}

describe("Codex ACP runtime", () => {
  test("defers finish until usage metadata can be emitted", async () => {
    const emitted: any[] = []

    await emitCodexAcpUiStream({
      uiStream: streamFrom([
        { type: "text-delta", delta: "hello" },
        { type: "finish", finishReason: "stop" },
      ]),
      emit: (chunk) => emitted.push(chunk),
      normalizeError: () => ({ message: "unused" }),
      isAuthError: () => false,
      resolveUsageOnce: async () => ({ totalTokens: 12 }),
    })

    expect(emitted).toEqual([
      { type: "text-delta", delta: "hello" },
      { type: "message-metadata", messageMetadata: { totalTokens: 12 } },
      { type: "finish", finishReason: "stop" },
    ])
  })

  test("normalizes auth errors before emission", async () => {
    const emitted: any[] = []

    await emitCodexAcpUiStream({
      uiStream: streamFrom([{ type: "error", errorText: "raw" }]),
      emit: (chunk) => emitted.push(chunk),
      normalizeError: () => ({ message: "login required" }),
      isAuthError: () => true,
      resolveUsageOnce: async () => null,
    })

    expect(emitted).toEqual([
      { type: "auth-error", errorText: "login required" },
      { type: "finish" },
    ])
  })
})

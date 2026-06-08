import { describe, expect, test } from "bun:test"
import { join } from "node:path"
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

    const result = await emitCodexAcpUiStream({
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
    expect(result).toEqual({ status: "succeeded" })
  })

  test("normalizes auth errors before emission", async () => {
    const emitted: any[] = []

    const result = await emitCodexAcpUiStream({
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
    expect(result).toEqual({
      status: "failed",
      error: { message: "login required" },
    })
  })

  test("stops dynamic ACP tool streams when permission hook denies", async () => {
    const emitted: any[] = []
    const denied: any[] = []
    const dynamicToolChunk = {
      type: "tool-input-available",
      toolCallId: "ui-tool-1",
      toolName: "acp.acp_provider_agent_dynamic_tool",
      input: {
        toolCallId: "codex-tool-1",
        toolName: `Edit ${join(process.cwd(), ".env")}`,
        args: {
          changes: {
            [join(process.cwd(), ".env")]: {
              type: "add",
              content: "SECRET_TOKEN=should-not-land",
            },
          },
        },
      },
    }

    const result = await emitCodexAcpUiStream({
      uiStream: streamFrom([
        dynamicToolChunk,
        {
          type: "tool-output-available",
          toolCallId: "codex-tool-1",
          output: "should not emit",
        },
        { type: "finish", finishReason: "stop" },
      ]),
      emit: (chunk) => emitted.push(chunk),
      normalizeError: () => ({ message: "unused" }),
      isAuthError: () => false,
      resolveUsageOnce: async () => null,
      onDynamicToolPermission: (tool) => {
        expect(tool).toMatchObject({
          toolUseId: "codex-tool-1",
          toolName: "Edit",
        })
        return {
          decision: "deny",
          message: "Observed mode blocked Edit: sensitive path",
        }
      },
      onDynamicToolDenied: (tool, decision) => {
        denied.push({ tool, decision })
      },
    })

    expect(denied).toHaveLength(1)
    expect(emitted).toEqual([
      dynamicToolChunk,
      {
        type: "tool-output-error",
        toolCallId: "codex-tool-1",
        errorText: "Observed mode blocked Edit: sensitive path",
      },
      {
        type: "error",
        errorText: "Observed mode blocked Edit: sensitive path",
      },
      { type: "finish", finishReason: "error" },
    ])
    expect(result).toEqual({
      status: "failed",
      error: { message: "Observed mode blocked Edit: sensitive path" },
    })
  })

  test("returns when the abort signal fires while waiting for ACP chunks", async () => {
    const emitted: any[] = []
    let cancelReason: unknown = null
    const abortController = new AbortController()
    const stalledStream = new ReadableStream({
      cancel(reason) {
        cancelReason = reason
      },
    })

    const streamPromise = emitCodexAcpUiStream({
      uiStream: stalledStream,
      emit: (chunk) => emitted.push(chunk),
      normalizeError: () => ({ message: "unused" }),
      isAuthError: () => false,
      resolveUsageOnce: async () => null,
      abortSignal: abortController.signal,
    })

    abortController.abort()
    const result = await streamPromise
    await Promise.resolve()

    expect(cancelReason).toBe("Session cancelled.")
    expect(emitted).toEqual([{ type: "finish", finishReason: "stop" }])
    expect(result).toEqual({ status: "canceled" })
  })
})

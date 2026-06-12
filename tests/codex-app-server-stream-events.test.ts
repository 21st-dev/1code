import { describe, expect, test } from "bun:test"
import { mapDesktopStreamChunkToRunEvents } from "../src/main/lib/agent-runtime/stream-event-mapper"
import {
  createCodexAppServerRuntimeEventMapper,
  type CodexAppServerNotification,
} from "../src/main/lib/codex/app-server-stream-events"

function mapChunksToRunEvents(chunks: unknown[]) {
  return chunks.flatMap((chunk, index) =>
    mapDesktopStreamChunkToRunEvents({
      runtimeId: "codex",
      runId: "run-app-server",
      jobId: "job-app-server",
      sequence: index + 1,
      chunk,
    }),
  )
}

const usageNotification: CodexAppServerNotification = {
  method: "thread/tokenUsage/updated",
  params: {
    threadId: "thread-1",
    turnId: "turn-1",
    tokenUsage: {
      last: {
        inputTokens: 10,
        cachedInputTokens: 2,
        outputTokens: 5,
        reasoningOutputTokens: 1,
        totalTokens: 15,
      },
      total: {
        inputTokens: 30,
        cachedInputTokens: 4,
        outputTokens: 12,
        reasoningOutputTokens: 3,
        totalTokens: 42,
      },
      modelContextWindow: 128000,
    },
  },
}

describe("Codex app-server stream event mapper", () => {
  test("maps app-server text/reasoning deltas through normalized RunEvents", () => {
    const mapper = createCodexAppServerRuntimeEventMapper()
    const chunks = [
      ...mapper.map({
        method: "thread/started",
        params: {
          thread: {
            id: "thread-1",
            sessionId: "session-1",
            modelProvider: "locus_profile",
          },
        },
      }),
      ...mapper.map({
        method: "turn/started",
        params: {
          threadId: "thread-1",
          turn: {
            id: "turn-1",
            status: "inProgress",
            error: null,
          },
        },
      }),
      ...mapper.map({
        method: "item/agentMessage/delta",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          itemId: "item-text",
          delta: "hello",
        },
      }),
      ...mapper.map({
        method: "item/reasoning/textDelta",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          itemId: "item-reasoning",
          delta: "thinking",
        },
      }),
    ]

    expect(mapper.getSessionId()).toBe("session-1")
    expect(mapper.getThreadId()).toBe("thread-1")
    expect(mapper.getTurnId()).toBe("turn-1")
    expect(mapper.buildInterruptRequest()).toEqual({
      method: "turn/interrupt",
      params: { threadId: "thread-1", turnId: "turn-1" },
    })

    const events = mapChunksToRunEvents(chunks)
    expect(events.map((event) => event.type)).toEqual([
      "status",
      "status",
      "assistant_delta",
      "reasoning_delta",
    ])
    expect(events[2].payload).toEqual({
      id: "item-text",
      delta: "hello",
    })
    expect(events[3].payload).toEqual({
      id: "item-reasoning",
      delta: "thinking",
    })
  })

  test("preserves usage, session id, and successful terminal metadata", () => {
    const mapper = createCodexAppServerRuntimeEventMapper()
    const chunks = [
      ...mapper.map({
        method: "thread/started",
        params: {
          thread: {
            id: "thread-1",
            sessionId: "session-1",
          },
        },
      }),
      ...mapper.map(usageNotification),
      ...mapper.map({
        method: "turn/completed",
        params: {
          threadId: "thread-1",
          turn: {
            id: "turn-1",
            status: "completed",
            error: null,
            durationMs: 2000,
          },
        },
      }),
    ]

    expect(chunks[1]).toMatchObject({
      type: "message-metadata",
      messageMetadata: {
        provider: "codex",
        adapterSource: "codex-app-server",
        threadId: "thread-1",
        turnId: "turn-1",
        sessionId: "session-1",
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        modelContextWindow: 128000,
      },
    })
    expect(chunks[2]).toMatchObject({
      type: "finish",
      status: "succeeded",
      messageMetadata: {
        sessionId: "session-1",
        cumulativeTotalTokens: 42,
      },
    })

    const events = mapChunksToRunEvents(chunks)
    expect(events.map((event) => event.type)).toEqual([
      "status",
      "usage_update",
      "completed",
    ])
    expect(events[2].payload).toMatchObject({
      status: "succeeded",
      messageMetadata: {
        sessionId: "session-1",
        cumulativeTotalTokens: 42,
      },
    })
  })

  test("preserves interrupted and failed terminal statuses", () => {
    const mapper = createCodexAppServerRuntimeEventMapper()
    const interrupted = mapper.map({
      method: "turn/completed",
      params: {
        threadId: "thread-1",
        turn: {
          id: "turn-interrupted",
          status: "interrupted",
          error: null,
        },
      },
    })
    const failed = mapper.map({
      method: "turn/completed",
      params: {
        threadId: "thread-1",
        turn: {
          id: "turn-failed",
          status: "failed",
          error: { message: "model failed" },
        },
      },
    })

    expect(mapChunksToRunEvents(interrupted)[0].payload).toMatchObject({
      status: "interrupted",
      message: null,
    })
    expect(mapChunksToRunEvents(failed)[0].payload).toMatchObject({
      status: "failed",
      message: "model failed",
    })
  })

  test("maps file-change patch notifications through normalized status events", () => {
    const mapper = createCodexAppServerRuntimeEventMapper()
    const chunks = [
      ...mapper.map({
        method: "item/fileChange/patchUpdated",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          itemId: "patch-1",
          changes: [{ path: "canary.txt", unifiedDiff: "@@" }],
        },
      }),
      ...mapper.map({
        method: "turn/diff/updated",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          diff: "diff --git a/canary.txt b/canary.txt",
        },
      }),
      ...mapper.map({
        method: "item/fileChange/outputDelta",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          itemId: "patch-1",
          delta: "applying patch",
        },
      }),
    ]

    expect(chunks).toEqual([
      {
        type: "file-change-patch",
        id: "patch-1",
        changes: [{ path: "canary.txt", unifiedDiff: "@@" }],
        threadId: "thread-1",
        turnId: "turn-1",
      },
      {
        type: "file-change-diff",
        diff: "diff --git a/canary.txt b/canary.txt",
        threadId: "thread-1",
        turnId: "turn-1",
      },
      {
        type: "file-change-delta",
        id: "patch-1",
        delta: "applying patch",
        threadId: "thread-1",
        turnId: "turn-1",
      },
    ])

    const events = mapChunksToRunEvents(chunks)
    expect(events.map((event) => event.type)).toEqual([
      "status",
      "status",
      "status",
    ])
    expect(events[0].payload).toMatchObject({
      chunkType: "file-change-patch",
      data: {
        id: "patch-1",
        changes: [{ path: "canary.txt", unifiedDiff: "@@" }],
      },
    })
  })

  test("maps app-server error notifications without creating terminal success", () => {
    const mapper = createCodexAppServerRuntimeEventMapper()
    const chunks = mapper.map({
      method: "error",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        error: { message: "provider unavailable", code: "provider_error" },
        willRetry: false,
      },
    })

    expect(chunks).toEqual([
      {
        type: "error",
        errorText: "provider unavailable",
        threadId: "thread-1",
        turnId: "turn-1",
        willRetry: false,
      },
    ])
    expect(mapChunksToRunEvents(chunks)[0]).toMatchObject({
      type: "error",
      payload: {
        errorText: "provider unavailable",
        chunkType: "error",
      },
    })
  })
})

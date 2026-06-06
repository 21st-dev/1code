import { describe, expect, test } from "bun:test"
import { createClaudeAgentSdkStreamConsumer } from "../src/main/lib/claude/agent-sdk-stream-consumer"
import { createClaudeAgentSdkPolicyRetryState } from "../src/main/lib/claude/agent-sdk-policy-retry"
import type { UIMessageChunk } from "../src/main/lib/claude/types"

async function* streamFrom(messages: any[]) {
  for (const message of messages) {
    yield message
  }
}

function createState() {
  let metadata: any = {}
  let currentSessionId: string | null = null
  let currentText = ""
  let pendingFinishChunk: UIMessageChunk | null = null
  let chunkCount = 0
  let lastChunkType = ""
  let messageCount = 0

  return {
    state: {
      getMetadata: () => metadata,
      setMetadata: (value: any) => {
        metadata = value
      },
      getCurrentSessionId: () => currentSessionId,
      setCurrentSessionId: (value: string | null) => {
        currentSessionId = value
      },
      getCurrentText: () => currentText,
      setCurrentText: (value: string) => {
        currentText = value
      },
      getPendingFinishChunk: () => pendingFinishChunk,
      setPendingFinishChunk: (value: UIMessageChunk | null) => {
        pendingFinishChunk = value
      },
      getChunkCount: () => chunkCount,
      setChunkCount: (value: number) => {
        chunkCount = value
      },
      getLastChunkType: () => lastChunkType,
      setLastChunkType: (value: string) => {
        lastChunkType = value
      },
      getMessageCount: () => messageCount,
      setMessageCount: (value: number) => {
        messageCount = value
      },
    },
    snapshot: () => ({
      metadata,
      currentSessionId,
      currentText,
      pendingFinishChunk,
      chunkCount,
      lastChunkType,
      messageCount,
    }),
  }
}

describe("Claude Agent SDK stream consumer", () => {
  test("consumes SDK messages through the stream owner and updates route state", async () => {
    const emitted: UIMessageChunk[] = []
    const { state, snapshot } = createState()
    const consumer = createClaudeAgentSdkStreamConsumer({
      isUsingOllama: false,
      model: "claude-sonnet",
      baseUrl: undefined,
      prompt: "hello",
      cwd: "/repo",
      abortSignal: new AbortController().signal,
      isObservableActive: () => true,
      chatId: "chat-1",
      subChatId: "sub-1",
      policyRetry: createClaudeAgentSdkPolicyRetryState(),
      customConfig: null,
      hasExistingApiConfig: false,
      mode: "agent",
      resolvedModel: "claude-sonnet",
      oauthToken: "token",
      mcpServers: undefined,
      transform: () => [
        { type: "text-delta", id: "text-1", delta: "hello" },
        { type: "text-end", id: "text-1" },
      ],
      parts: [],
      historyEnabled: true,
      subId: "sub-1",
      stderrLines: [],
      db: null,
      messagesToSave: [],
      guardedContract: null,
      guardedPreRunStatus: null,
      guardEvents: [],
      guardedRunStartedAt: "2026-06-01T00:00:00.000Z",
      emit: (chunk) => {
        emitted.push(chunk)
        return true
      },
      complete: () => {},
      getContract: () => null,
      deleteContract: () => undefined,
      state,
    })

    await expect(
      consumer({
        request: {} as any,
        stream: streamFrom([
          {
            type: "assistant",
            uuid: "assistant-1",
            session_id: "session-1",
          },
        ]),
      }),
    ).resolves.toEqual({
      status: "succeeded",
      sessionId: "session-1",
    })

    expect(emitted).toEqual([
      { type: "text-delta", id: "text-1", delta: "hello" },
      { type: "text-end", id: "text-1" },
    ])
    expect(snapshot()).toMatchObject({
      metadata: { sessionId: "session-1" },
      currentSessionId: "session-1",
      currentText: "",
      chunkCount: 2,
      lastChunkType: "text-end",
      messageCount: 1,
    })
  })
})

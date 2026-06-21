import { describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { ClaudeAgentSdkStreamConsumer } from "../src/main/lib/claude/agent-sdk-adapter"
import { createClaudeAgentSdkPolicyRetryState } from "../src/main/lib/claude/agent-sdk-policy-retry"
import {
  createClaudeAgentSdkStreamConsumer,
  createClaudeAgentSdkStreamConsumerMutableState,
  createClaudeAgentSdkStreamConsumerStateAccess,
  resetClaudeAgentSdkStreamConsumerAttemptState,
} from "../src/main/lib/claude/agent-sdk-stream-consumer"
import type { UIMessageChunk } from "../src/main/lib/claude/types"
import { setElectronUserDataPathProviderForTest } from "../src/main/lib/electron-app"
import { getMcpRegistryVerificationRecord } from "../src/main/lib/mcp-registry/verification-state"

type ClaudeStreamRequest =
  Parameters<ClaudeAgentSdkStreamConsumer>[0]["request"]
const emptyDesktopRequest = {} as ClaudeStreamRequest

async function* streamFrom(messages: unknown[]) {
  for (const message of messages) {
    yield message
  }
}

function createState() {
  const mutableState = createClaudeAgentSdkStreamConsumerMutableState()
  return {
    mutableState,
    state: createClaudeAgentSdkStreamConsumerStateAccess(mutableState),
    snapshot: () => ({ ...mutableState }),
  }
}

describe("Claude Agent SDK stream consumer", () => {
  test("creates mutable state access and resets retry attempt state", () => {
    const mutableState = createClaudeAgentSdkStreamConsumerMutableState({
      metadata: { sessionId: "session-1" },
      pendingFinishChunk: { type: "finish" },
      messageCount: 2,
    })
    const access = createClaudeAgentSdkStreamConsumerStateAccess(mutableState)

    access.setCurrentSessionId("session-1")
    access.setCurrentText("hello")
    access.setChunkCount(3)
    access.setLastChunkType("text-delta")

    expect(access.getMetadata()).toEqual({ sessionId: "session-1" })
    expect(mutableState).toMatchObject({
      currentSessionId: "session-1",
      currentText: "hello",
      chunkCount: 3,
      lastChunkType: "text-delta",
      messageCount: 2,
    })

    resetClaudeAgentSdkStreamConsumerAttemptState(mutableState)
    expect(mutableState.messageCount).toBe(0)
    expect(mutableState.pendingFinishChunk).toBeNull()
  })

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
        request: emptyDesktopRequest,
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

  test("persists verified-local when a Claude MCP registry tool succeeds", async () => {
    const userDataDir = await mkdtemp(
      join(tmpdir(), "locus-claude-mcp-verified-"),
    )
    setElectronUserDataPathProviderForTest(() => userDataDir)
    try {
      const emitted: UIMessageChunk[] = []
      const { state } = createState()
      const verificationKey = {
        runtime: "claude-code" as const,
        serverName: "calculator-mcp-server",
        entryFingerprint: "sha256:entry",
        configFingerprint: "sha256:config",
      }
      const consumer = createClaudeAgentSdkStreamConsumer({
        isUsingOllama: false,
        model: "claude-sonnet",
        baseUrl: undefined,
        prompt: "call calculator",
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
        mcpServers: {
          "calculator-mcp-server": { type: "http", url: "https://mcp.example" },
        },
        mcpRegistryVerificationTargets: {
          "calculator-mcp-server": verificationKey,
        },
        transform: () => [
          {
            type: "tool-input-available",
            toolCallId: "toolu-1",
            toolName: "mcp__calculator-mcp-server__calculate",
            input: { expression: "2 + 2" },
          },
          {
            type: "tool-output-available",
            toolCallId: "toolu-1",
            output: { result: 4 },
          },
          { type: "text-delta", id: "text-1", delta: "4" },
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
          request: emptyDesktopRequest,
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

      expect(emitted.map((chunk) => chunk.type)).toEqual([
        "tool-input-available",
        "tool-output-available",
        "text-delta",
      ])
      await expect(
        getMcpRegistryVerificationRecord(verificationKey),
      ).resolves.toMatchObject({
        status: "verified-local",
        reason: "claude-tool-call-success:calculate",
      })
    } finally {
      setElectronUserDataPathProviderForTest(null)
      await rm(userDataDir, { recursive: true, force: true })
    }
  })
})

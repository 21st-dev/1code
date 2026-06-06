import { describe, expect, test } from "bun:test"
import { resolveDesktopPermissionPolicy } from "../src/main/lib/agent-runtime/permission-policy"
import type { DesktopRunRequest } from "../src/main/lib/agent-runtime/desktop-run-request"
import { createClaudeAgentSdkAdapter } from "../src/main/lib/claude/agent-sdk-adapter"

function createRequest(): DesktopRunRequest {
  return {
    identity: { runId: "run-1", jobId: "job-1" },
    context: {
      runtimeId: "claude-code",
      mode: "agent",
      projectId: "project-1",
      chatId: "chat-1",
      subChatId: "sub-1",
      cwd: "/repo",
    },
    prompt: "hello",
    permissionPolicy: resolveDesktopPermissionPolicy({
      runtimeId: "claude-code",
      mode: "agent",
    }),
    providerBinding: {},
    mcp: { status: "skipped", serverNames: [], blockers: [] },
    attachments: [],
    trace: { emit: () => {} },
    signal: new AbortController().signal,
    session: {},
  }
}

async function* createStream() {
  yield { type: "message", text: "hello" }
}

describe("Claude Agent SDK adapter", () => {
  test("starts the SDK query inside DesktopRuntimeAdapter.run and hands off the stream", async () => {
    const request = createRequest()
    const queryOptions = { prompt: "hello", options: {} } as any
    const queryCalls: any[] = []
    const consumedMessages: any[] = []
    const adapter = createClaudeAgentSdkAdapter({
      query: ((params: any) => {
        queryCalls.push(params)
        return createStream()
      }) as any,
      queryOptions,
      consumeStream: async ({ request: consumedRequest, stream }) => {
        expect(consumedRequest).toBe(request)
        for await (const message of stream) {
          consumedMessages.push(message)
        }
        return { status: "succeeded", sessionId: "session-1" }
      },
    })

    expect(adapter.metadata).toMatchObject({
      runtimeId: "claude-code",
      source: "claude-agent-sdk",
      temporaryFallback: false,
    })
    await expect(adapter.run(request)).resolves.toEqual({
      status: "succeeded",
      sessionId: "session-1",
    })
    expect(queryCalls).toEqual([queryOptions])
    expect(consumedMessages).toEqual([{ type: "message", text: "hello" }])
  })

  test("propagates SDK query startup failures to the route boundary", async () => {
    const adapter = createClaudeAgentSdkAdapter({
      query: (() => {
        throw new Error("query failed")
      }) as any,
      queryOptions: { prompt: "hello", options: {} } as any,
      consumeStream: async () => ({ status: "succeeded" }),
    })

    await expect(adapter.run(createRequest())).rejects.toThrow("query failed")
  })
})

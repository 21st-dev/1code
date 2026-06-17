import { describe, expect, test } from "bun:test"
import { normalizeAcpParts } from "../src/shared/acp-tool-normalizer"
import { normalizePersistedChatMessages } from "../src/shared/chat-message-normalizer"

describe("chat message hydration normalizer", () => {
  test("returns empty messages for malformed persisted JSON", () => {
    const errors: Array<{ error: unknown; sourceId?: string }> = []

    expect(
      normalizePersistedChatMessages("{not-json", {
        sourceId: "sub-1",
        onParseError: (error, sourceId) => errors.push({ error, sourceId }),
      }),
    ).toEqual([])
    expect(errors).toHaveLength(1)
    expect(errors[0]?.sourceId).toBe("sub-1")
  })

  test("migrates legacy tool-invocation parts", () => {
    const [message] = normalizePersistedChatMessages(
      JSON.stringify([
        {
          id: "msg-1",
          role: "assistant",
          createdAt: "2026-06-18T00:00:00.000Z",
          parts: [
            {
              type: "tool-invocation",
              toolName: "ExitPlanMode",
              toolInvocationId: "legacy-tool-1",
              args: { plan: "ship it" },
            },
          ],
        },
      ]),
    )

    expect(message?.createdAt).toBe("2026-06-18T00:00:00.000Z")
    expect(message?.parts?.[0]).toMatchObject({
      type: "tool-ExitPlanMode",
      toolCallId: "legacy-tool-1",
      input: { plan: "ship it" },
    })
  })

  test("normalizes Codex MCP wrapper parts and result state", () => {
    const [message] = normalizePersistedChatMessages([
      {
        id: "msg-2",
        role: "assistant",
        parts: [
          {
            type: "tool-Tool: notion/notion-search",
            toolName: "Tool: notion/notion-search",
            toolCallId: "mcp-tool-1",
            state: "result",
            input: {
              args: {
                arguments: {
                  query: "roadmap",
                },
              },
            },
            result: { success: true, content: [{ type: "text", text: "ok" }] },
          },
        ],
      },
    ])

    expect(message?.parts?.[0]).toMatchObject({
      type: "tool-mcp__notion__notion-search",
      toolCallId: "mcp-tool-1",
      state: "output-available",
      input: { query: "roadmap" },
      output: { success: true, content: [{ type: "text", text: "ok" }] },
    })
  })

  test("normalizes ACP title tools with string input without dropping args", () => {
    const [message] = normalizePersistedChatMessages([
      {
        id: "msg-3",
        role: "assistant",
        parts: [
          {
            type: "tool-Read README.md",
            toolCallId: "read-1",
            state: "result",
            input: JSON.stringify({
              toolName: "Read README.md",
              args: { limit: 20 },
            }),
            result: { success: true, text: "hello" },
          },
        ],
      },
    ])

    expect(message?.parts?.[0]).toMatchObject({
      type: "tool-Read",
      toolCallId: "read-1",
      state: "output-available",
      input: {
        limit: 20,
        file_path: "README.md",
        _acpTitle: "Read README.md",
        _acpDetail: "README.md",
      },
      output: { success: true, text: "hello" },
    })
  })

  test("normalizes ACP proxy tools and maps failed result state", () => {
    const [message] = normalizePersistedChatMessages([
      {
        id: "msg-4",
        role: "assistant",
        metadata: { sessionId: "codex-session-1" },
        parts: [
          {
            type: "tool-acp.acp_provider_agent_dynamic_tool",
            toolCallId: "bash-1",
            state: "result",
            input: JSON.stringify({
              toolName: "Run echo hi",
              args: { command: ["/bin/zsh", "-lc", "echo hi"] },
            }),
            result: { success: false, error: "failed" },
          },
        ],
      },
    ])

    expect(message?.metadata?.sessionId).toBe("codex-session-1")
    expect(message?.parts?.[0]).toMatchObject({
      type: "tool-Bash",
      toolCallId: "bash-1",
      state: "output-error",
      input: {
        command: "echo hi",
        _acpTitle: "Run echo hi",
        _acpDetail: "echo hi",
      },
      output: { success: false, error: "failed" },
    })
  })

  test("maps generic tool result state and preserves existing output precedence", () => {
    const [message] = normalizePersistedChatMessages([
      {
        id: "msg-5",
        role: "assistant",
        parts: [
          {
            type: "tool-Bash",
            toolCallId: "bash-2",
            state: "result",
            input: { command: "pwd" },
            output: { stdout: "/repo" },
            result: { success: false, stderr: "ignored" },
          },
        ],
      },
    ])

    expect(message?.parts?.[0]).toMatchObject({
      type: "tool-Bash",
      state: "output-error",
      output: { stdout: "/repo" },
    })
  })

  test("shared ACP primitive keeps render-time normalization available", () => {
    expect(
      normalizeAcpParts([
        {
          type: "tool-Search src in repo",
          toolCallId: "grep-1",
          input: { args: {} },
        },
      ]),
    ).toEqual([
      {
        type: "tool-Grep",
        toolCallId: "grep-1",
        input: {
          _acpTitle: "Search src in repo",
          _acpDetail: "src in repo",
          pattern: "src in repo",
        },
        output: undefined,
      },
    ])
  })

  test("normalizes representative Claude and Codex persisted blobs", () => {
    const messages = normalizePersistedChatMessages([
      {
        id: "claude-user-1",
        role: "user",
        createdAt: "2026-06-18T00:00:00.000Z",
        parts: [
          { type: "text", text: "look at this" },
          {
            type: "data-image",
            data: {
              base64Data: "legacy-data",
              mediaType: "image/jpeg",
              filename: "legacy.jpg",
            },
          },
        ],
      },
      {
        id: "codex-assistant-1",
        role: "assistant",
        metadata: { sessionId: "codex-session-2" },
        parts: [
          {
            type: "tool-List src",
            toolCallId: "glob-1",
            state: "result",
            input: { toolName: "List src", args: {} },
            result: { success: true, files: ["src/main.ts"] },
          },
        ],
      },
    ])

    expect(messages[0]?.createdAt).toBe("2026-06-18T00:00:00.000Z")
    expect(messages[0]?.parts?.[1]).toMatchObject({
      type: "data-image",
      data: { base64Data: "legacy-data" },
    })
    expect(messages[1]?.parts?.[0]).toMatchObject({
      type: "tool-Glob",
      state: "output-available",
      input: {
        pattern: "src",
        _acpTitle: "List src",
        _acpDetail: "src",
      },
      output: { success: true, files: ["src/main.ts"] },
    })
  })
})

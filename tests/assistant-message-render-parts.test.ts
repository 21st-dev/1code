import { describe, expect, test } from "bun:test"
import { normalizeAssistantMessagePartsForRender } from "../src/renderer/features/agents/main/assistant-message-render-parts"
import { normalizePersistedChatMessages } from "../src/shared/chat-message-normalizer"

describe("assistant message render parts", () => {
  test("normalizes legacy ACP-shaped persisted tool parts before rendering", () => {
    const [message] = normalizePersistedChatMessages([
      {
        id: "legacy-acp-assistant",
        role: "assistant",
        parts: [
          {
            type: "tool-Read README.md",
            toolCallId: "legacy-read-1",
            state: "result",
            input: JSON.stringify({
              toolName: "Read README.md",
              args: { limit: 20 },
            }),
            result: { success: true, text: "legacy render ok" },
          },
          {
            type: "tool-acp.acp_provider_agent_dynamic_tool",
            toolCallId: "legacy-bash-1",
            state: "result",
            input: JSON.stringify({
              toolName: "Run echo legacy-acp-render-ok",
              args: {
                command: ["/bin/zsh", "-lc", "echo legacy-acp-render-ok"],
              },
            }),
            result: { success: true, stdout: "legacy-acp-render-ok\n" },
          },
        ],
      },
    ])
    const parts = normalizeAssistantMessagePartsForRender(message?.parts)

    expect(parts[0]).toMatchObject({
      type: "tool-Read",
      toolCallId: "legacy-read-1",
      state: "output-available",
      input: {
        limit: 20,
        file_path: "README.md",
      },
      output: { success: true, text: "legacy render ok" },
    })
    expect(parts[1]).toMatchObject({
      type: "tool-Bash",
      toolCallId: "legacy-bash-1",
      state: "output-available",
      input: {
        command: "echo legacy-acp-render-ok",
      },
      output: { success: true, stdout: "legacy-acp-render-ok\n" },
    })
  })
})

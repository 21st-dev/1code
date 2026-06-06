import { describe, expect, test } from "bun:test"
import { notifyClaudeAgentSdkFileChanged } from "../src/main/lib/claude/agent-sdk-file-change-notification"

describe("Claude Agent SDK file change notification", () => {
  test("sends file-changed payload to every window", () => {
    const sent: Array<{ channel: string; payload: unknown; windowId: string }> = []
    const event = {
      filePath: "src/app.ts",
      type: "tool-Write",
      subChatId: "sub-1",
    }

    notifyClaudeAgentSdkFileChanged(event, () => [
      {
        webContents: {
          send: (channel, payload) =>
            sent.push({ channel, payload, windowId: "win-1" }),
        },
      },
      {
        webContents: {
          send: (channel, payload) =>
            sent.push({ channel, payload, windowId: "win-2" }),
        },
      },
    ])

    expect(sent).toEqual([
      { channel: "file-changed", payload: event, windowId: "win-1" },
      { channel: "file-changed", payload: event, windowId: "win-2" },
    ])
  })
})

import { describe, expect, test } from "bun:test"
import {
  createClaudeAgentSdkSystemPromptConfig,
  readClaudeAgentSdkProjectAgentsMd,
} from "../src/main/lib/claude/agent-sdk-project-context"

describe("Claude Agent SDK project context", () => {
  test("reads non-empty AGENTS.md content from the project cwd", async () => {
    const result = await readClaudeAgentSdkProjectAgentsMd(
      "/repo",
      (async (filePath: string) => {
        expect(filePath).toBe("/repo/AGENTS.md")
        return "Use repo rules."
      }) as any,
    )

    expect(result).toEqual({
      path: "/repo/AGENTS.md",
      content: "Use repo rules.",
    })
  })

  test("ignores missing or empty AGENTS.md content", async () => {
    expect(
      await readClaudeAgentSdkProjectAgentsMd(
        "/repo",
        (async () => "   ") as any,
      ),
    ).toBeNull()
    expect(
      await readClaudeAgentSdkProjectAgentsMd(
        "/repo",
        (async () => {
          throw new Error("missing")
        }) as any,
      ),
    ).toBeNull()
  })

  test("creates preset system prompt config with optional AGENTS.md appendix", () => {
    expect(createClaudeAgentSdkSystemPromptConfig(undefined)).toEqual({
      type: "preset",
      preset: "claude_code",
    })
    expect(createClaudeAgentSdkSystemPromptConfig("Use repo rules.")).toEqual({
      type: "preset",
      preset: "claude_code",
      append:
        "\n\n# AGENTS.md\nThe following are the project's AGENTS.md instructions:\n\nUse repo rules.",
    })
  })
})

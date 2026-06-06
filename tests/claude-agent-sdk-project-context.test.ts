import { describe, expect, test } from "bun:test"
import {
  createClaudeAgentSdkSystemPromptConfig,
  prepareClaudeAgentSdkPromptContext,
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

  test("prepares normal SDK prompt context with AGENTS.md system appendix", async () => {
    const logs: unknown[][] = []
    const result = await prepareClaudeAgentSdkPromptContext({
      prompt: "inspect",
      existingMessages: [],
      isUsingOllama: false,
      cwd: "/repo",
      readAgentsMd: async () => ({
        path: "/repo/AGENTS.md",
        content: "Use repo rules.",
      }),
      log: (...args) => {
        logs.push(args)
      },
    })

    expect(result.prompt).toBe("inspect")
    expect(result.agentsMdContent).toBe("Use repo rules.")
    expect(result.systemPrompt).toMatchObject({
      type: "preset",
      preset: "claude_code",
    })
    expect("append" in result.systemPrompt ? result.systemPrompt.append : "").toContain(
      "Use repo rules.",
    )
    expect(logs).toEqual([
      ["[claude] Found AGENTS.md at /repo/AGENTS.md (15 chars)"],
    ])
  })

  test("prepares Ollama prompt context with conversation history", async () => {
    const logs: unknown[][] = []
    const result = await prepareClaudeAgentSdkPromptContext({
      prompt: "continue",
      existingMessages: [
        {
          role: "user",
          parts: [{ type: "text", text: "open file" }],
        },
      ],
      isUsingOllama: true,
      resolvedModel: "qwen",
      projectPath: "/repo",
      cwd: "/repo/worktree",
      readAgentsMd: async () => null,
      log: (...args) => {
        logs.push(args)
      },
    })

    expect(String(result.prompt)).toContain(
      "OFFLINE mode (Ollama model: qwen)",
    )
    expect(String(result.prompt)).toContain("[CONVERSATION HISTORY]")
    expect(String(result.prompt)).toContain("[CURRENT REQUEST]\ncontinue")
    expect(result.systemPrompt).toEqual({
      type: "preset",
      preset: "claude_code",
    })
    expect(logs).toEqual([
      ["[Ollama] Added 1 messages to history (15 chars)"],
      ["[Ollama] Context prefix added to prompt"],
    ])
  })
})

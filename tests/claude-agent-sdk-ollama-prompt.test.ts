import { describe, expect, test } from "bun:test"
import { createClaudeOllamaPrompt } from "../src/main/lib/claude/agent-sdk-ollama-prompt"

describe("Claude Ollama prompt", () => {
  test("builds offline context with agents instructions and current request", () => {
    const result = createClaudeOllamaPrompt({
      prompt: "inspect the repo",
      existingMessages: [],
      resolvedModel: "qwen2.5-coder",
      projectPath: "/repo",
      cwd: "/repo/worktree",
      agentsMdContent: "Use repo rules.",
    })

    expect(result.historyMessageCount).toBe(0)
    expect(result.prompt).toContain(
      "OFFLINE mode (Ollama model: qwen2.5-coder)",
    )
    expect(result.prompt).toContain("Project: /repo")
    expect(result.prompt).toContain("Working directory: /repo/worktree")
    expect(result.prompt).toContain("[AGENTS.MD]\nUse repo rules.")
    expect(result.prompt).toContain("[CURRENT REQUEST]\ninspect the repo")
  })

  test("formats text and tool-call history for offline context", () => {
    const result = createClaudeOllamaPrompt({
      prompt: "continue",
      existingMessages: [
        {
          role: "user",
          parts: [{ type: "text", text: "open file" }],
        },
        {
          role: "assistant",
          parts: [
            { type: "text", text: "Reading now." },
            {
              type: "tool_use",
              name: "Read",
              input: { file_path: "/repo/src/app.ts" },
            },
            {
              type: "tool-use",
              tool: "Bash",
              input: {
                command:
                  "pnpm test --filter runtime-control-layer --reporter verbose",
              },
            },
          ],
        },
      ],
      cwd: "/repo",
    })

    expect(result.historyMessageCount).toBe(2)
    expect(result.prompt).toContain("[CONVERSATION HISTORY]")
    expect(result.prompt).toContain("User: open file")
    expect(result.prompt).toContain(
      "Assistant: Reading now.\n[Used Read: /repo/src/app.ts]",
    )
    expect(result.prompt).toContain(
      "[Used Bash: pnpm test --filter runtime-control-layer --reporte...]",
    )
  })

  test("truncates long offline history", () => {
    const result = createClaudeOllamaPrompt({
      prompt: "continue",
      existingMessages: [
        {
          role: "user",
          parts: [{ type: "text", text: "x".repeat(10050) }],
        },
      ],
      cwd: "/repo",
    })

    expect(result.historyMessageCount).toBe(1)
    expect(result.historyLength).toBeGreaterThan(10000)
    expect(result.prompt).toContain("...(earlier messages truncated)...")
  })
})

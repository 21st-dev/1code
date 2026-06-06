import { describe, expect, test } from "bun:test"
import { parseClaudePromptMentions } from "../src/main/lib/claude/mentions"

describe("Claude prompt mention parser", () => {
  test("extracts agent and skill mentions while preserving file and folder context", () => {
    const result = parseClaudePromptMentions(
      'Use @[agent:reviewer] and @[skill:security] on @[file:local:src/app.ts] plus @[folder:external:/tmp/logs].',
    )

    expect(result.agentMentions).toEqual(["reviewer"])
    expect(result.skillMentions).toEqual(["security"])
    expect(result.fileMentions).toEqual(["local:src/app.ts"])
    expect(result.folderMentions).toEqual(["external:/tmp/logs"])
    expect(result.cleanedPrompt).toBe(
      "Use  and  on src/app.ts plus /tmp/logs.",
    )
  })

  test("adds MCP usage hints only for safe server or tool mention names", () => {
    const result = parseClaudePromptMentions(
      "Check @[tool:github] and @[tool:mcp__filesystem__read_file] but ignore @[tool:bad/name].",
    )

    expect(result.toolMentions).toEqual([
      "github",
      "mcp__filesystem__read_file",
    ])
    expect(result.cleanedPrompt).toBe(
      "Use tools from the github MCP server for this request. Use the mcp__filesystem__read_file tool for this request.\n\nCheck  and  but ignore .",
    )
  })
})

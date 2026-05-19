import { describe, expect, test } from "bun:test"

import {
  BUILTIN_SLASH_COMMANDS,
  COMMAND_PROMPTS,
  getBuiltinCommandPrompt,
  isPromptCommand,
} from "../src/renderer/features/agents/commands/builtin-commands"

describe("built-in slash commands", () => {
  test("registers project workflow commands as prompt-backed chat commands", () => {
    const commandByName = new Map(
      BUILTIN_SLASH_COMMANDS.map((cmd) => [cmd.name, cmd]),
    )

    expect(commandByName.get("init")?.command).toBe("/init")
    expect(commandByName.get("doctor")?.command).toBe("/doctor")
    expect(commandByName.get("diff")?.command).toBe("/diff")
    expect(isPromptCommand("init")).toBe(true)
    expect(isPromptCommand("doctor")).toBe(true)
    expect(isPromptCommand("diff")).toBe(true)
    expect(COMMAND_PROMPTS.init).toContain("AGENTS.md")
    expect(COMMAND_PROMPTS.init).toContain("CLAUDE.md")
    expect(COMMAND_PROMPTS.init).toContain("Do not overwrite")
    expect(COMMAND_PROMPTS.doctor).toContain("Do not modify files")
    expect(COMMAND_PROMPTS.diff).toContain("Do not modify files")
  })

  test("expands built-in prompt commands and preserves arguments", () => {
    const expanded = getBuiltinCommandPrompt(
      "init",
      "focus on Bun and Electron setup",
    )

    expect(expanded).toContain("Initialize this project")
    expect(expanded).toContain("Additional user instructions:")
    expect(expanded).toContain("focus on Bun and Electron setup")
  })
})

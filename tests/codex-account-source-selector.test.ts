import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

describe("Codex account source selector", () => {
  test("keeps first-party account sources out of the model menu item union", () => {
    const selectorSource = readFileSync(
      join(
        process.cwd(),
        "src/renderer/features/agents/components/agent-model-selector.tsx",
      ),
      "utf8",
    )

    expect(selectorSource).toContain("function CodexAccountSourceControl")
    expect(selectorSource).toContain("aria-pressed={selected}")
    expect(selectorSource).toContain("agent.model.codexAccountSource")
    expect(selectorSource).not.toContain('type: "codex-source"')
    expect(selectorSource).not.toContain('"codexSource"')
    expect(selectorSource).not.toContain('case "codex-source"')
    expect(selectorSource).not.toContain('type: "custom"')
    expect(selectorSource).not.toContain('case "custom"')
    expect(selectorSource).not.toContain("hasCustomModelConfig")
    expect(selectorSource).toContain('type: "provider-profile"')
  })
})

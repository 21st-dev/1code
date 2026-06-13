import { describe, expect, test } from "bun:test"
import { CLAUDE_MODELS } from "../src/shared/custom-agent-models"
import {
  CODEX_MODELS,
  isCodexApiKeySupportedModel,
} from "../src/renderer/features/agents/lib/models"

describe("agent model catalog", () => {
  test("includes current Claude Code aliases", () => {
    expect(CLAUDE_MODELS.map((model) => model.id)).toEqual([
      "fable",
      "opus",
      "sonnet",
      "haiku",
    ])
  })

  test("shows current Codex recommendations without deprecated ChatGPT models", () => {
    const codexIds = CODEX_MODELS.map((model) => model.id)

    expect(codexIds).toEqual([
      "gpt-5.5",
      "gpt-5.4",
      "gpt-5.4-mini",
      "gpt-5.3-codex-spark",
    ])
    expect(codexIds).not.toContain("gpt-5.3-codex")
    expect(codexIds).not.toContain("gpt-5.2")
  })

  test("keeps Spark on ChatGPT auth only", () => {
    expect(isCodexApiKeySupportedModel("gpt-5.5")).toBe(true)
    expect(isCodexApiKeySupportedModel("gpt-5.3-codex-spark")).toBe(false)
  })
})

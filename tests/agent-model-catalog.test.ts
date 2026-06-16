import { describe, expect, test } from "bun:test"
import {
  CODEX_MODELS,
  getCodexModelsForSource,
  isCodexApiKeySupportedModel,
  isCodexModelSupportedBySource,
  isFirstPartyCodexModelSource,
  resolveCodexModelForSource,
} from "../src/renderer/features/agents/lib/models"
import { CLAUDE_MODELS } from "../src/shared/custom-agent-models"

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

  test("resolves Codex model compatibility by account source", () => {
    expect(isFirstPartyCodexModelSource("chatgpt")).toBe(true)
    expect(isFirstPartyCodexModelSource("openai-api-key")).toBe(true)
    expect(isFirstPartyCodexModelSource("provider-profile:abc")).toBe(false)
    expect(
      isCodexModelSupportedBySource("chatgpt", "gpt-5.3-codex-spark"),
    ).toBe(true)
    expect(
      isCodexModelSupportedBySource("openai-api-key", "gpt-5.3-codex-spark"),
    ).toBe(false)

    expect(
      getCodexModelsForSource(CODEX_MODELS, "openai-api-key").map(
        (model) => model.id,
      ),
    ).toEqual(["gpt-5.5", "gpt-5.4", "gpt-5.4-mini"])

    expect(
      resolveCodexModelForSource({
        models: CODEX_MODELS,
        selectedModelId: "gpt-5.3-codex-spark",
        source: "openai-api-key",
      }),
    ).toEqual({ model: CODEX_MODELS[0], changed: true })
  })
})

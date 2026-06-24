import { describe, expect, test } from "bun:test"

import {
  CODEX_MODELS,
  CODEX_DEFAULT_REASONING_EFFORT,
  CODEX_DEFAULT_MODEL_ID,
  CODEX_REASONING_EFFORTS,
  formatCodexThinkingLabel,
  getCodexDefaultThinkingLevel,
  isCodexThinkingLevel,
} from "./models"

describe("Codex model reasoning contract", () => {
  test("matches the Codex Desktop reasoning effort order exposed in the model picker", () => {
    expect(CODEX_DEFAULT_REASONING_EFFORT).toBe("medium")
    expect(CODEX_DEFAULT_MODEL_ID).toBe("gpt-5.5/medium")
    expect([...CODEX_REASONING_EFFORTS]).toEqual([
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ])

    for (const model of CODEX_MODELS) {
      expect(model.thinkings).toEqual([...CODEX_REASONING_EFFORTS])
      expect(getCodexDefaultThinkingLevel(model.thinkings)).toBe("medium")
    }
  })

  test("formats reasoning efforts with Codex Desktop picker labels", () => {
    expect(formatCodexThinkingLabel("minimal")).toBe("Minimal")
    expect(formatCodexThinkingLabel("low")).toBe("Low")
    expect(formatCodexThinkingLabel("medium")).toBe("Medium")
    expect(formatCodexThinkingLabel("high")).toBe("High")
    expect(formatCodexThinkingLabel("xhigh")).toBe("Extra High")
    expect(formatCodexThinkingLabel("max")).toBe("Max")
  })

  test("guards persisted reasoning preferences before transport model resolution", () => {
    for (const effort of CODEX_REASONING_EFFORTS) {
      expect(isCodexThinkingLevel(effort)).toBe(true)
    }

    expect(isCodexThinkingLevel("none")).toBe(false)
    expect(isCodexThinkingLevel("extra-high")).toBe(false)
    expect(isCodexThinkingLevel(null)).toBe(false)
  })
})

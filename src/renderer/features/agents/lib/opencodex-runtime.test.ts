import { describe, expect, it } from "bun:test"
import {
  getOpenCodexProviderLabel,
  getOpenCodexProviderPromptLabel,
  getOpenCodexRuntimeCatalog,
} from "./opencodex-runtime"

describe("OpenCodex runtime labeling", () => {
  it("maps legacy providers to OpenCodex-facing labels", () => {
    expect(getOpenCodexProviderLabel("claude-code")).toBe("OpenCodex Backend")
    expect(getOpenCodexProviderLabel("codex")).toBe("OpenCodex API Override")
  })

  it("uses OpenCodex-facing labels in provider switch prompts", () => {
    expect(getOpenCodexProviderPromptLabel("claude-code")).toBe(
      "OpenCodex Backend",
    )
    expect(getOpenCodexProviderPromptLabel("codex")).toBe(
      "OpenCodex API Override",
    )
  })

  it("surfaces a merged runtime catalog with medium as the default Codex thinking level", () => {
    const catalog = getOpenCodexRuntimeCatalog()
    const codex52 = catalog.find((item) => item.id === "gpt-5.2-codex")

    expect(catalog.some((item) => item.providerLabel === "OpenCodex Backend")).toBe(
      true,
    )
    expect(
      catalog.some((item) => item.providerLabel === "OpenCodex API Override"),
    ).toBe(true)
    expect(codex52?.defaultThinking).toBe("medium")
  })
})

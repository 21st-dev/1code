import { describe, expect, test } from "bun:test"
import {
  DEFAULT_CODEX_MODEL,
  extractCodexModelId,
  preprocessCodexModelName,
  resolveCodexSelectedModelId,
} from "../src/main/lib/codex/model-selection"

describe("Codex model selection", () => {
  test("normalizes request model ids and falls back to the default", () => {
    expect(extractCodexModelId(undefined)).toBeUndefined()
    expect(extractCodexModelId("")).toBeUndefined()
    expect(extractCodexModelId(" codex ")).toBeUndefined()
    expect(extractCodexModelId(" gpt-5/high ")).toBe("gpt-5/high")

    expect(resolveCodexSelectedModelId({ requestedModel: undefined })).toBe(
      DEFAULT_CODEX_MODEL,
    )
    expect(resolveCodexSelectedModelId({ requestedModel: "codex" })).toBe(
      DEFAULT_CODEX_MODEL,
    )
    expect(resolveCodexSelectedModelId({ requestedModel: "gpt-5/high" })).toBe(
      "gpt-5/high",
    )
  })

  test("keeps app-managed API key model ids as pass-through", () => {
    expect(
      preprocessCodexModelName({
        modelId: "gpt-5/high",
        hasAppManagedApiKey: true,
      }),
    ).toBe("gpt-5/high")
    expect(
      resolveCodexSelectedModelId({
        requestedModel: "gpt-5/high",
        hasAppManagedApiKey: true,
      }),
    ).toBe("gpt-5/high")
  })
})

import { describe, expect, test } from "bun:test"
import {
  DEFAULT_CODEX_MODEL,
  extractCodexModelId,
  normalizeCodexAppServerModelId,
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

  test("normalizes Codex app-server model ids to runtime-supported base ids", () => {
    expect(normalizeCodexAppServerModelId("gpt-5.5/high")).toBe("gpt-5.5")
    expect(normalizeCodexAppServerModelId("gpt-5.4/xhigh")).toBe("gpt-5.4")
    expect(normalizeCodexAppServerModelId("gpt-5.3-codex/low")).toBe(
      "gpt-5.3-codex",
    )
    expect(normalizeCodexAppServerModelId("deepseek-v4-flash")).toBe(
      "deepseek-v4-flash",
    )
    expect(normalizeCodexAppServerModelId("provider/high/custom")).toBe(
      "provider/high/custom",
    )
  })
})

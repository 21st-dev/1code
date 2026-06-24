import { describe, expect, test } from "bun:test"
import { normalizeProviderProfileTargetsForKunRuntimeGate } from "../src/main/lib/trpc/routers/provider-profiles"

describe("provider profile Kun runtime gate", () => {
  test("filters new Kun targets while Kun is disabled", () => {
    const normalized = normalizeProviderProfileTargetsForKunRuntimeGate({
      targetRuntimes: ["claude", "kun"],
      capabilities: { claude: true, kun: true },
      kunRuntimeEnabled: false,
    })

    expect(normalized.targetRuntimes).toEqual(["claude"])
    expect(normalized.capabilities?.kun).toBe(false)
  })

  test("preserves existing Kun targets while Kun is disabled", () => {
    const normalized = normalizeProviderProfileTargetsForKunRuntimeGate({
      targetRuntimes: ["claude"],
      existingTargetRuntimes: ["claude", "kun"],
      capabilities: { claude: true, kun: false },
      kunRuntimeEnabled: false,
    })

    expect(normalized.targetRuntimes).toEqual(["claude", "kun"])
    expect(normalized.capabilities?.kun).toBe(true)
  })

  test("leaves targets unchanged while Kun is enabled", () => {
    const normalized = normalizeProviderProfileTargetsForKunRuntimeGate({
      targetRuntimes: ["claude", "kun"],
      capabilities: { claude: true, kun: true },
      kunRuntimeEnabled: true,
    })

    expect(normalized.targetRuntimes).toEqual(["claude", "kun"])
    expect(normalized.capabilities?.kun).toBe(true)
  })
})

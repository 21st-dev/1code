import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { normalizeProviderProfileTargetsForKunRuntimeGate } from "../src/main/lib/provider-profiles/storage"

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

  test("storage owner enforces the Kun target gate for direct saves", () => {
    const storageSource = readFileSync(
      join(process.cwd(), "src/main/lib/provider-profiles/storage.ts"),
      "utf8",
    )
    const routerSource = readFileSync(
      join(process.cwd(), "src/main/lib/trpc/routers/provider-profiles.ts"),
      "utf8",
    )

    expect(storageSource).toContain(
      "normalizeProviderProfileTargetsForKunRuntimeGate({",
    )
    expect(storageSource).toContain("resolveKunRuntimeEnabledForSave(options)")
    expect(routerSource).toContain(
      "kunRuntimeEnabled: getKunRuntimeEnabledForProviderProfileSave()",
    )
    expect(routerSource).not.toContain(
      "export function normalizeProviderProfileTargetsForKunRuntimeGate",
    )
  })
})

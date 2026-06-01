import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

describe("provider routing UX source guards", () => {
  const modelsTabSource = readFileSync(
    join(
      process.cwd(),
      "src/renderer/components/dialogs/settings-tabs/agents-models-tab.tsx",
    ),
    "utf8",
  )
  const settingsContentSource = readFileSync(
    join(process.cwd(), "src/renderer/features/settings/settings-content.tsx"),
    "utf8",
  )

  test("Models settings uses a wide layout for provider routing controls", () => {
    expect(settingsContentSource).toContain('activeTab === "models"')
    expect(settingsContentSource).toContain("max-w-6xl")
    expect(settingsContentSource).toContain("max-w-2xl")
  })

  test("provider presets and target runtimes are accessible chip controls", () => {
    expect(modelsTabSource).toContain("presetHint")
    expect(modelsTabSource).toContain("aria-pressed={selected}")
    expect(modelsTabSource).toContain("aria-pressed={targetRuntimes.includes(target)}")
    expect(modelsTabSource).toContain("getProviderTargetLabel(target, t)")
  })

  test("diagnostics render localized labels instead of raw status ids", () => {
    expect(modelsTabSource).toContain("getDiagnosticCheckLabel(check.id, t)")
    expect(modelsTabSource).toContain("getDiagnosticStatusLabel(check.status, t)")
    expect(modelsTabSource).toContain("settings.models.providerProfiles.statusUntested")
    expect(modelsTabSource).not.toContain("{check.status}")
  })

  test("profile testing and sensitive destination edits are row-specific and explicit", () => {
    expect(modelsTabSource).toContain("testingProfileId")
    expect(modelsTabSource).toContain("isTestingProfile")
    expect(modelsTabSource).toContain("tokenRefreshRequired")
    expect(modelsTabSource).toContain(
      "settings.models.providerProfiles.tokenRefreshRequired",
    )
  })
})

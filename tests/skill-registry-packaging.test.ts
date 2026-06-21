import { describe, expect, test } from "bun:test"
import { readFileSync } from "fs"

describe("skill registry packaging", () => {
  test("keeps bundled registry text files on LF line endings for stable hashes", () => {
    const attributes = readFileSync(".gitattributes", "utf-8")
    const requiredPatterns = [
      "resources/skill-registry/**/*.csv text eol=lf",
      "resources/skill-registry/**/*.json text eol=lf",
      "resources/skill-registry/**/*.md text eol=lf",
      "resources/skill-registry/**/*.py text eol=lf",
      "resources/skill-registry/**/*.txt text eol=lf",
      "resources/skill-registry/**/*.xml text eol=lf",
      "resources/skill-registry/**/*.yaml text eol=lf",
      "resources/skill-registry/**/*.yml text eol=lf",
    ]

    for (const pattern of requiredPatterns) {
      expect(attributes).toContain(pattern)
    }
  })

  test("opens the skills settings view with installable registry skills visible", () => {
    const source = readFileSync(
      "src/renderer/components/dialogs/settings-tabs/agents-skills-tab.tsx",
      "utf-8",
    )

    expect(source).toContain('useState<SkillFilter>("all")')
    expect(source).not.toContain('useState<SkillFilter>("installed")')
  })

  test("shows runtime availability separately from registry install state", () => {
    const source = readFileSync(
      "src/renderer/components/dialogs/settings-tabs/agents-skills-tab.tsx",
      "utf-8",
    )
    const dictionaries = readFileSync(
      "src/renderer/lib/i18n/dictionaries.ts",
      "utf-8",
    )

    expect(source).toContain("runtimeState?.projection?.state")
    expect(source).toContain("settings.skills.installState")
    expect(source).toContain("settings.skills.runtimeAvailability")
    expect(source).toContain("availabilityDiagnostic.message")
    expect(dictionaries).toContain('"settings.skills.installState"')
    expect(dictionaries).toContain('"settings.skills.availabilityNotProjected"')
  })

  test("keeps plugin-owned and registry-owned skill protections visible in source", () => {
    const source = readFileSync(
      "src/renderer/components/dialogs/settings-tabs/agents-skills-tab.tsx",
      "utf-8",
    )

    expect(source).toContain('item.source !== "plugin"')
    expect(source).toContain('item.kind !== "registry-skill"')
    expect(source).toContain('item.kind !== "registry-collection"')
  })
})

import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

describe("provider profile onboarding", () => {
  test("creates Claude Provider Profiles instead of legacy Claude provider config", () => {
    const source = readFileSync(
      "src/renderer/features/onboarding/api-key-onboarding-page.tsx",
      "utf8",
    )

    expect(source).toContain("trpc.providerProfiles.saveProfile.useMutation")
    expect(source).toContain("providerProfileSource(profile.id)")
    expect(source).toContain("providerProfileSource(result.profile.id)")
    expect(source).not.toContain("claudeProviderConfig.save")
    expect(source).not.toContain(
      'setLastSelectedClaudeModelSource("custom-provider")',
    )
  })

  test("surfaces Provider Profile save failures during onboarding", () => {
    const source = readFileSync(
      "src/renderer/features/onboarding/api-key-onboarding-page.tsx",
      "utf8",
    )

    expect(source).toContain("const [submissionError, setSubmissionError]")
    expect(source).toContain("onError: (error) =>")
    expect(source).toContain("} catch (error) {")
    expect(source).toContain("toast.models.failedToSaveProviderProfile")
    expect(source).toContain("{submissionError && (")
  })

  test("supports no-auth custom model onboarding without token storage", () => {
    const source = readFileSync(
      "src/renderer/features/onboarding/api-key-onboarding-page.tsx",
      "utf8",
    )

    expect(source).toContain(
      'type OnboardingProviderAuthMode = "api_key" | "auth_token" | "none"',
    )
    expect(source).toContain('if (mode === "none") return "none"')
    expect(source).toContain("const customModelTokenRequired = authMode !==")
    expect(source).toContain(
      "token: customModelTokenRequired ? trimmedToken : undefined",
    )
    expect(source).toContain('setAuthMode("none")')
    expect(source).toContain("onboarding.customModel.authNone")
  })
})

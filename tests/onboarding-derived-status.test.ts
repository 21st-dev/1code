import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf-8")

// Consumers that previously OR'd a stored "completed" flag with the real owner.
const STATUS_CONSUMERS = [
  "src/renderer/App.tsx",
  "src/renderer/features/onboarding/onboarding-surface.tsx",
  "src/renderer/features/onboarding/components/ai-path-panel.tsx",
  "src/renderer/features/onboarding/components/panels/claude-code-action.tsx",
  "src/renderer/features/onboarding/components/panels/codex-action.tsx",
  "src/renderer/features/onboarding/components/panels/provider-profile-action.tsx",
  "src/renderer/features/agents/main/new-chat-form.tsx",
  "src/renderer/features/agents/main/chat-input-area.tsx",
  "src/renderer/features/agents/lib/acp-chat-transport.ts",
  "src/renderer/components/dialogs/claude-login-modal.tsx",
  "src/renderer/components/dialogs/codex-login-modal.tsx",
  "src/renderer/components/dialogs/settings-tabs/agents-models-tab.tsx",
]

describe("onboarding setup status is derived, not duplicated", () => {
  test("legacy completion atoms are removed from the atom store", () => {
    const atoms = read("src/renderer/lib/atoms/index.ts")
    expect(atoms).not.toContain("anthropicOnboardingCompletedAtom")
    expect(atoms).not.toContain("apiKeyOnboardingCompletedAtom")
    expect(atoms).not.toContain("codexOnboardingCompletedAtom")
    expect(atoms).not.toContain("codexOnboardingAuthMethodAtom")
  })

  test("no consumer reads or writes the removed completion atoms", () => {
    for (const file of STATUS_CONSUMERS) {
      const source = read(file)
      expect(source).not.toContain("OnboardingCompletedAtom")
      expect(source).not.toContain("codexOnboardingAuthMethodAtom")
    }
  })

  test("setup status derives connection from the provider/runtime owners", () => {
    const status = read(
      "src/renderer/features/onboarding/lib/use-setup-status.ts",
    )
    expect(status).toContain("trpc.claudeCode.getIntegration")
    expect(status).toContain("trpc.claudeCode.hasExistingCliConfig")
    expect(status).toContain("trpc.providerProfiles.listProfiles")
    expect(status).toContain("trpc.claudeProviderConfig.get")
    expect(status).toContain("trpc.codex.getIntegration")
    expect(status).toContain("trpc.codex.getCodexApiKeyStatus")
    // No new durable onboarding "completed" truth is introduced.
    expect(status).not.toContain("OnboardingCompletedAtom")
  })

  test("the completion gate requires a usable path, derived purely from owners", () => {
    // Behavioural coverage of the gate lives in onboarding-setup-status.test.ts;
    // here we just assert the pure derivation has no stored-flag escape hatch.
    const derive = read(
      "src/renderer/features/onboarding/lib/derive-setup-status.ts",
    )
    expect(derive).toContain("claude.usable || codex.usable")
    expect(derive).toContain("claudeCredentialUsable && claude.runtimeReady")
    expect(derive).not.toContain("OnboardingCompletedAtom")
    // The flow/surface gate on a usable path, not merely a stored credential.
    const flow = read(
      "src/renderer/features/onboarding/lib/use-onboarding-flow.ts",
    )
    expect(flow).toContain("!status.anyUsableAiPath")
  })

  test("onboarding does not auto-start external auth flows", () => {
    const claude = read(
      "src/renderer/features/onboarding/components/panels/claude-code-action.tsx",
    )
    const codex = read(
      "src/renderer/features/onboarding/components/panels/codex-action.tsx",
    )
    expect(claude).not.toContain("didAutoStartRef")
    expect(codex).not.toContain("didAutoStartRef")
    // Codex chatgpt connect is gated behind an explicit button, not a mount effect.
    expect(codex).toContain("showConnectButton")
  })

  test("onboarding panels show connected state only from healthy owner status", () => {
    const surface = read(
      "src/renderer/features/onboarding/onboarding-surface.tsx",
    )
    const claude = read(
      "src/renderer/features/onboarding/components/panels/claude-code-action.tsx",
    )
    const apiKey = read(
      "src/renderer/features/onboarding/components/panels/provider-profile-action.tsx",
    )

    expect(surface).toContain("md:hidden")
    expect(surface).toContain("<StatusRail")
    expect(claude).toContain("!integrationQuery.data?.isExpired")
    expect(apiKey).toContain("getUsableClaudeProviderProfile")
    expect(apiKey).toContain("claudeProviderConfig.get")
  })
})

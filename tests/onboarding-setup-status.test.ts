import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import {
  type ClaudeSourceProviderProfile,
  getUsableClaudeProviderProfile,
  normalizeClaudeModelSourceForRun,
} from "../src/renderer/features/agents/lib/models"
import {
  deriveSetupStatus,
  type SetupStatusInputs,
} from "../src/renderer/features/onboarding/lib/derive-setup-status"
import {
  pathStatus,
  recommendedPath,
} from "../src/renderer/features/onboarding/lib/onboarding-status"

const BASE: SetupStatusInputs = {
  claudeRuntimeReady: false,
  claudeOauthConnected: false,
  claudeOauthExpired: false,
  claudeDisplayName: null,
  hasCliConfig: false,
  hasClaudeApiProfile: false,
  codexRuntimeReady: false,
  codexState: undefined,
  codexApiKeyPresent: false,
  qwenAvailable: false,
  qwenCliReady: false,
  hasProject: false,
  statusQueriesLoading: false,
}

const inputs = (over: Partial<SetupStatusInputs>): SetupStatusInputs => ({
  ...BASE,
  ...over,
})

const failedProviderProfile: ClaudeSourceProviderProfile = {
  id: "failed",
  targetRuntimes: ["claude"],
  lastTestStatus: {
    ok: false,
    checkedAt: "2026-06-23T00:00:00.000Z",
    message: "auth failed",
  },
}

describe("deriveSetupStatus completion gate", () => {
  test("failed Claude Provider Profiles are not usable profile candidates", () => {
    expect(
      getUsableClaudeProviderProfile([failedProviderProfile]),
    ).toBeUndefined()
  })

  test("a credential without a ready runtime is connected but NOT usable", () => {
    const claudeProfileNoRuntime = deriveSetupStatus(
      inputs({ hasClaudeApiProfile: true, claudeRuntimeReady: false }),
    )
    expect(claudeProfileNoRuntime.claude.connected).toBe(true)
    expect(claudeProfileNoRuntime.claude.usable).toBe(false)
    expect(claudeProfileNoRuntime.anyUsableAiPath).toBe(false)

    const codexKeyNoRuntime = deriveSetupStatus(
      inputs({ codexApiKeyPresent: true, codexRuntimeReady: false }),
    )
    expect(codexKeyNoRuntime.codex.connected).toBe(true)
    expect(codexKeyNoRuntime.codex.usable).toBe(false)
    expect(codexKeyNoRuntime.anyUsableAiPath).toBe(false)
  })

  test("a credential WITH a ready runtime is usable", () => {
    expect(
      deriveSetupStatus(
        inputs({ hasClaudeApiProfile: true, claudeRuntimeReady: true }),
      ).anyUsableAiPath,
    ).toBe(true)
    expect(
      deriveSetupStatus(
        inputs({ codexApiKeyPresent: true, codexRuntimeReady: true }),
      ).anyUsableAiPath,
    ).toBe(true)
  })

  test("an expired-only OAuth credential is connected but not usable", () => {
    const expiredOnly = deriveSetupStatus(
      inputs({
        claudeOauthConnected: true,
        claudeOauthExpired: true,
        claudeRuntimeReady: true,
      }),
    )
    expect(expiredOnly.claude.connected).toBe(true)
    expect(expiredOnly.claude.usable).toBe(false)
    expect(expiredOnly.anyUsableAiPath).toBe(false)

    // …but an additional profile makes the path usable again.
    expect(
      deriveSetupStatus(
        inputs({
          claudeOauthConnected: true,
          claudeOauthExpired: true,
          hasClaudeApiProfile: true,
          claudeRuntimeReady: true,
        }),
      ).anyUsableAiPath,
    ).toBe(true)
  })

  test("isResolving only blocks while loading AND nothing is usable yet", () => {
    expect(
      deriveSetupStatus(inputs({ statusQueriesLoading: true })).isResolving,
    ).toBe(true)
    expect(
      deriveSetupStatus(
        inputs({
          statusQueriesLoading: true,
          claudeOauthConnected: true,
          claudeRuntimeReady: true,
        }),
      ).isResolving,
    ).toBe(false)
  })
})

describe("pathStatus reports runtime-missing before ready", () => {
  test("a credentialed path with a missing runtime is runtime-missing, not ready", () => {
    const noRuntime = deriveSetupStatus(
      inputs({
        claudeOauthConnected: true,
        hasClaudeApiProfile: true,
        claudeRuntimeReady: false,
        codexApiKeyPresent: true,
        codexRuntimeReady: false,
      }),
    )
    expect(pathStatus("claude", noRuntime)).toBe("runtime-missing")
    expect(pathStatus("custom-provider", noRuntime)).toBe("runtime-missing")
    expect(pathStatus("codex", noRuntime)).toBe("runtime-missing")
  })

  test("ready only when runtime is up and credential present", () => {
    const ready = deriveSetupStatus(
      inputs({
        claudeOauthConnected: true,
        hasClaudeApiProfile: true,
        claudeRuntimeReady: true,
        codexApiKeyPresent: true,
        codexRuntimeReady: true,
      }),
    )
    expect(pathStatus("claude", ready)).toBe("ready")
    expect(pathStatus("custom-provider", ready)).toBe("ready")
    expect(pathStatus("codex", ready)).toBe("ready")
  })

  test("Claude CLI config alone is detected but not treated as runnable", () => {
    const cliOnly = deriveSetupStatus(
      inputs({
        hasCliConfig: true,
        claudeRuntimeReady: true,
      }),
    )

    expect(cliOnly.claude.hasCliConfig).toBe(true)
    expect(cliOnly.claude.connected).toBe(false)
    expect(cliOnly.claude.usable).toBe(false)
    expect(cliOnly.anyUsableAiPath).toBe(false)
    expect(pathStatus("claude", cliOnly)).toBe("needs-sign-in")
    expect(pathStatus("custom-provider", cliOnly)).toBe("needs-api-key")
  })

  test("recommends a connected path", () => {
    expect(
      recommendedPath(
        deriveSetupStatus(
          inputs({ codexApiKeyPresent: true, codexRuntimeReady: true }),
        ),
      ),
    ).toBe("codex")
  })

  test("recommends a usable path over a broken one (expired Claude OAuth)", () => {
    const expiredClaudeWorkingCodex = deriveSetupStatus(
      inputs({
        claudeOauthConnected: true,
        claudeOauthExpired: true,
        claudeRuntimeReady: true,
        codexApiKeyPresent: true,
        codexRuntimeReady: true,
      }),
    )
    // Claude is connected-but-expired (repair-needed); Codex is actually usable.
    expect(pathStatus("claude", expiredClaudeWorkingCodex)).toBe("repair-needed")
    expect(recommendedPath(expiredClaudeWorkingCodex)).toBe("codex")
  })

  test("Qwen CLI detection does not satisfy the first-run completion gate", () => {
    const cliReadyButRuntimeDisabled = deriveSetupStatus(
      inputs({ qwenAvailable: false, qwenCliReady: true }),
    )
    expect(cliReadyButRuntimeDisabled.qwen.usable).toBe(false)
    expect(cliReadyButRuntimeDisabled.anyUsableAiPath).toBe(false)
    expect(pathStatus("qwen", cliReadyButRuntimeDisabled)).toBe(
      "runtime-missing",
    )

    const availableButCliMissing = deriveSetupStatus(
      inputs({ qwenAvailable: true, qwenCliReady: false }),
    )
    expect(availableButCliMissing.qwen.usable).toBe(false)
    expect(availableButCliMissing.anyUsableAiPath).toBe(false)
    expect(pathStatus("qwen", availableButCliMissing)).toBe("needs-cli")

    const cliDetected = deriveSetupStatus(
      inputs({ qwenAvailable: true, qwenCliReady: true }),
    )
    expect(cliDetected.qwen.cliReady).toBe(true)
    expect(cliDetected.qwen.usable).toBe(false)
    expect(cliDetected.anyUsableAiPath).toBe(false)
    expect(pathStatus("qwen", cliDetected)).toBe("needs-cli-auth")
    // Qwen status is setup guidance only; it is not a first-run completion path.
    expect(recommendedPath(cliDetected)).toBe("claude")
  })
})

describe("Claude model source never silently runs an unavailable OAuth path", () => {
  test("send surfaces require non-expired OAuth before using claude-oauth", () => {
    const newChatForm = readFileSync(
      "src/renderer/features/agents/main/new-chat-form.tsx",
      "utf8",
    )
    const chatInputArea = readFileSync(
      "src/renderer/features/agents/main/chat-input-area.tsx",
      "utf8",
    )

    for (const source of [newChatForm, chatInputArea]) {
      expect(source).toContain("setupStatus.claude.oauthConnected")
      expect(source).toContain("!setupStatus.claude.oauthExpired")
      expect(source).toContain("setupStatus.claude.runtimeReady")
    }
  })

  test("diverts claude-oauth to a usable profile when OAuth is unusable", () => {
    const result = normalizeClaudeModelSourceForRun({
      source: "claude-oauth",
      canUseClaudeOAuth: false,
      providerProfiles: [
        { id: "abc", targetRuntimes: ["claude"], lastTestStatus: null },
      ],
    })
    expect(result).toMatchObject({
      ok: true,
      source: "provider-profile:abc",
      reason: "provider-profile-fallback",
    })
  })

  test("keeps claude-oauth when OAuth is actually usable", () => {
    expect(
      normalizeClaudeModelSourceForRun({
        source: "claude-oauth",
        canUseClaudeOAuth: true,
        providerProfiles: [
          { id: "abc", targetRuntimes: ["claude"], lastTestStatus: null },
        ],
      }),
    ).toMatchObject({ ok: true, source: "claude-oauth", changed: false })
  })

  test("fails closed when OAuth is unusable and no usable profile exists", () => {
    expect(
      normalizeClaudeModelSourceForRun({
        source: "claude-oauth",
        canUseClaudeOAuth: false,
        providerProfiles: [],
      }),
    ).toMatchObject({
      ok: false,
      blocker: { code: "provider-profile-required" },
    })

    expect(
      normalizeClaudeModelSourceForRun({
        source: "claude-oauth",
        canUseClaudeOAuth: false,
        providerProfiles: [failedProviderProfile],
      }),
    ).toMatchObject({
      ok: false,
      blocker: { code: "provider-profile-required" },
    })
  })

  test("unspecified OAuth usability keeps the legacy claude-oauth default", () => {
    expect(
      normalizeClaudeModelSourceForRun({
        source: "auto",
        providerProfiles: [],
      }),
    ).toMatchObject({ ok: true, source: "claude-oauth" })
  })
})

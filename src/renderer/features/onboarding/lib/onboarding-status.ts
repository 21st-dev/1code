import type { OnboardingProviderMode } from "../../../lib/atoms"
import type { SetupStatus } from "./use-setup-status"

/**
 * The three AI paths offered on the first-run setup surface. "claude" covers
 * both Anthropic auth methods (subscription login and API key) — they are the
 * same provider, just different billing — selected via a toggle inside the card,
 * mirroring how "codex" handles ChatGPT login vs OpenAI API key.
 */
export type OnboardingPathId = "claude" | "codex" | "custom-provider"

export const ONBOARDING_PATHS: OnboardingPathId[] = [
  "claude",
  "codex",
  "custom-provider",
]

/** Plain status states shared by the rail and the panels. */
export type PathStatus =
  | "ready"
  | "needs-sign-in"
  | "needs-api-key"
  | "runtime-missing"
  | "repair-needed"
  | "not-started"

export function providerModeToPath(
  mode: OnboardingProviderMode,
): OnboardingPathId | null {
  switch (mode) {
    case "claude-subscription":
    case "api-key":
      return "claude"
    case "codex-subscription":
    case "codex-api-key":
      return "codex"
    case "custom-model":
      return "custom-provider"
    default:
      return null
  }
}

export function pathToProviderMode(
  path: OnboardingPathId,
): Exclude<OnboardingProviderMode, null> {
  switch (path) {
    case "claude":
      // Default Claude sub-mode is subscription login; the card toggle switches
      // to "api-key" when chosen.
      return "claude-subscription"
    case "codex":
      return "codex-subscription"
    case "custom-provider":
      return "custom-model"
  }
}

/**
 * Derived status for a single path. Runtime is checked first: a missing runtime
 * is never reported as "ready", even when a credential exists.
 */
export function pathStatus(
  path: OnboardingPathId,
  status: SetupStatus,
): PathStatus {
  switch (path) {
    case "claude": {
      if (!status.claude.runtimeReady) return "runtime-missing"
      const onlyExpiredOauth =
        status.claude.oauthConnected &&
        status.claude.oauthExpired &&
        !status.claude.hasApiProfile
      if (onlyExpiredOauth) return "repair-needed"
      if (status.claude.connected) return "ready"
      return "needs-sign-in"
    }
    case "custom-provider":
      // Provider profiles run through the bundled Claude runtime.
      if (!status.claude.runtimeReady) return "runtime-missing"
      return status.claude.hasApiProfile ? "ready" : "needs-api-key"
    case "codex":
      if (!status.codex.runtimeReady) return "runtime-missing"
      if (status.codex.connected) return "ready"
      return "needs-sign-in"
  }
}

/**
 * Recommend a path from detected state. Only meaningful before a path is
 * connected; defaults to Claude as the primary path.
 */
export function recommendedPath(status: SetupStatus): OnboardingPathId {
  if (status.claude.oauthConnected || status.claude.hasApiProfile) {
    return "claude"
  }
  if (status.codex.connected) return "codex"
  return "claude"
}

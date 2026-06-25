import type { OnboardingProviderMode } from "../../../lib/atoms"
import type { SetupStatus } from "./use-setup-status"

/**
 * The AI paths offered on the first-run setup surface. "claude" covers both
 * Anthropic auth methods (subscription login and API key) — the same provider,
 * just different billing — selected via a toggle inside the card, mirroring how
 * "codex" handles ChatGPT login vs OpenAI API key. "qwen" is a runtime-managed
 * engine (no in-app credential — the CLI handles its own auth) and is shown only
 * when its runtime is enabled (see {@link visibleOnboardingPaths}).
 */
export type OnboardingPathId = "claude" | "codex" | "qwen" | "custom-provider"

export const ONBOARDING_PATHS: OnboardingPathId[] = [
  "claude",
  "codex",
  "custom-provider",
  "qwen",
]

/**
 * The paths to actually render. Qwen is hidden unless its runtime is enabled, so
 * the common install never surfaces an experimental, unavailable engine.
 */
export function visibleOnboardingPaths(status: SetupStatus): OnboardingPathId[] {
  return ONBOARDING_PATHS.filter(
    (path) => path !== "qwen" || status.qwen.available,
  )
}

/** Plain status states shared by the rail and the panels. */
export type PathStatus =
  | "ready"
  | "needs-sign-in"
  | "needs-api-key"
  | "needs-cli"
  | "needs-cli-auth"
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
    case "qwen":
      return "qwen"
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
    case "qwen":
      return "qwen"
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
    case "qwen":
      // Runtime-managed: CLI availability is useful setup signal, but it does
      // not prove `/auth` or a successful run, so it is not a ready path.
      if (!status.qwen.available) return "runtime-missing"
      return status.qwen.cliReady ? "needs-cli-auth" : "needs-cli"
  }
}

/**
 * Recommend a path from detected state. Prefers a path that is actually `usable`
 * (credential/CLI + runtime) so we never steer the user at a broken path while a
 * working one exists; otherwise falls back to a partially-set-up path, then to
 * Claude as the default primary path. Qwen is not recommended as a first-run
 * completion path because current CLI status does not prove auth/run readiness.
 */
export function recommendedPath(status: SetupStatus): OnboardingPathId {
  if (status.claude.usable) return "claude"
  if (status.codex.usable) return "codex"
  if (status.claude.oauthConnected || status.claude.hasApiProfile) {
    return "claude"
  }
  if (status.codex.connected) return "codex"
  return "claude"
}

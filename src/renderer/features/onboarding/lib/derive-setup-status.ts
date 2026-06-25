/**
 * Pure, dependency-free derivation of the first-run setup status from the
 * provider/runtime/project owners. Kept free of React/tRPC imports so the gate
 * logic is unit-testable. Consumed by {@link useSetupStatus}.
 */

export type SetupClaudeStatus = {
  runtimeReady: boolean
  oauthConnected: boolean
  /** OAuth credential present but expired/invalid — needs repair, not "ready". */
  oauthExpired: boolean
  /** Ambient shell/CLI config was detected, but desktop runs do not consume it. */
  hasCliConfig: boolean
  hasApiProfile: boolean
  /** A Locus-managed credential/profile exists (may not be runnable — see `usable`). */
  connected: boolean
  /** A non-expired credential exists AND the runtime is available. */
  usable: boolean
  displayName: string | null
}

export type SetupCodexStatus = {
  runtimeReady: boolean
  oauthConnected: boolean
  apiKeyConnected: boolean
  authMethod: "chatgpt" | "api_key" | null
  /** A credential exists (may not be runnable — see `usable`). */
  connected: boolean
  /** A credential exists AND the runtime is available. */
  usable: boolean
}

/**
 * Qwen Code is a runtime-managed engine: there is no in-app OAuth or API key —
 * the CLI handles its own auth (`run qwen` then `/auth`). The app can detect
 * executable availability, but that does not prove `/auth` or a successful run.
 */
export type SetupQwenStatus = {
  /** The Qwen runtime is enabled (its capability manifest is present). */
  available: boolean
  /** The Qwen CLI executable was detected and version-probed. */
  cliReady: boolean
  /** Qwen status is setup guidance only; it is not a first-run completion gate. */
  usable: boolean
}

export type SetupStatus = {
  /** A status query is still resolving AND nothing is usable yet. */
  isResolving: boolean
  claude: SetupClaudeStatus
  codex: SetupCodexStatus
  qwen: SetupQwenStatus
  anyProviderConnected: boolean
  /** At least one path has a credential AND a ready runtime — the completion gate. */
  anyUsableAiPath: boolean
  hasProject: boolean
}

/** Owner-derived inputs for {@link deriveSetupStatus}. */
export type SetupStatusInputs = {
  claudeRuntimeReady: boolean
  claudeOauthConnected: boolean
  claudeOauthExpired: boolean
  claudeDisplayName: string | null
  hasCliConfig: boolean
  hasClaudeApiProfile: boolean
  codexRuntimeReady: boolean
  codexState: string | undefined
  codexApiKeyPresent: boolean
  /** The Qwen runtime is enabled (capability manifest present). */
  qwenAvailable: boolean
  /** The Qwen CLI executable was detected and version-probed. */
  qwenCliReady: boolean
  hasProject: boolean
  statusQueriesLoading: boolean
}

/**
 * A path is only `usable` (the completion gate) when a non-expired credential
 * exists AND its runtime is ready — a stored credential with a missing runtime
 * never counts.
 */
export function deriveSetupStatus(input: SetupStatusInputs): SetupStatus {
  const claude: SetupClaudeStatus = {
    runtimeReady: input.claudeRuntimeReady,
    oauthConnected: input.claudeOauthConnected,
    oauthExpired: input.claudeOauthExpired,
    hasCliConfig: input.hasCliConfig,
    hasApiProfile: input.hasClaudeApiProfile,
    connected: input.claudeOauthConnected || input.hasClaudeApiProfile,
    usable: false,
    displayName: input.claudeDisplayName,
  }
  const claudeCredentialUsable =
    (claude.oauthConnected && !claude.oauthExpired) || claude.hasApiProfile
  claude.usable = claudeCredentialUsable && claude.runtimeReady

  const codexOauthConnected = input.codexState === "connected_chatgpt"
  const codexApiKeyConnected =
    input.codexApiKeyPresent || input.codexState === "connected_api_key"
  const codex: SetupCodexStatus = {
    runtimeReady: input.codexRuntimeReady,
    oauthConnected: codexOauthConnected,
    apiKeyConnected: codexApiKeyConnected,
    authMethod: codexOauthConnected
      ? "chatgpt"
      : codexApiKeyConnected
        ? "api_key"
        : null,
    connected: codexOauthConnected || codexApiKeyConnected,
    usable:
      (codexOauthConnected || codexApiKeyConnected) && input.codexRuntimeReady,
  }

  const qwen: SetupQwenStatus = {
    available: input.qwenAvailable,
    cliReady: input.qwenCliReady,
    usable: false,
  }

  const anyProviderConnected = claude.connected || codex.connected
  const anyUsableAiPath = claude.usable || codex.usable

  return {
    // Only block routing while we genuinely don't know yet. As soon as one path
    // resolves usable we stop waiting (fast local Claude metadata short-circuits
    // the slower Codex CLI status check).
    isResolving: input.statusQueriesLoading && !anyUsableAiPath,
    claude,
    codex,
    qwen,
    anyProviderConnected,
    anyUsableAiPath,
    hasProject: input.hasProject,
  }
}

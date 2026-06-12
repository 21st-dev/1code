import type { CodexDesktopAdapterSource } from "./adapter-types"

export const LOCUS_CODEX_USE_ACP_TEMPORARY_COMPAT_ENV =
  "LOCUS_CODEX_USE_ACP_TEMPORARY_COMPAT"

export const LEGACY_LOCUS_CODEX_APP_SERVER_ADAPTER_ENV =
  "LOCUS_CODEX_APP_SERVER_ADAPTER"

type EnvLike = Record<string, string | undefined>

export type CodexDesktopAdapterSelection = {
  source: CodexDesktopAdapterSource
  useAppServer: boolean
  acpFallbackAvailable: boolean
  reason: string
  fallbackEnvVar: typeof LOCUS_CODEX_USE_ACP_TEMPORARY_COMPAT_ENV
  legacyAppServerEnvVar: typeof LEGACY_LOCUS_CODEX_APP_SERVER_ADAPTER_ENV
}

function isEnabled(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true"
}

function isDisabled(value: string | undefined): boolean {
  return value === "0" || value?.toLowerCase() === "false"
}

export function resolveCodexDesktopAdapterSelection(
  env: EnvLike = process.env,
): CodexDesktopAdapterSelection {
  if (isEnabled(env[LOCUS_CODEX_USE_ACP_TEMPORARY_COMPAT_ENV])) {
    return {
      source: "codex-acp-temporary-compat",
      useAppServer: false,
      acpFallbackAvailable: true,
      reason:
        "Codex ACP temporary-compat fallback selected by LOCUS_CODEX_USE_ACP_TEMPORARY_COMPAT.",
      fallbackEnvVar: LOCUS_CODEX_USE_ACP_TEMPORARY_COMPAT_ENV,
      legacyAppServerEnvVar: LEGACY_LOCUS_CODEX_APP_SERVER_ADAPTER_ENV,
    }
  }

  if (isDisabled(env[LEGACY_LOCUS_CODEX_APP_SERVER_ADAPTER_ENV])) {
    return {
      source: "codex-acp-temporary-compat",
      useAppServer: false,
      acpFallbackAvailable: true,
      reason:
        "Codex ACP temporary-compat fallback selected by legacy LOCUS_CODEX_APP_SERVER_ADAPTER=0.",
      fallbackEnvVar: LOCUS_CODEX_USE_ACP_TEMPORARY_COMPAT_ENV,
      legacyAppServerEnvVar: LEGACY_LOCUS_CODEX_APP_SERVER_ADAPTER_ENV,
    }
  }

  return {
    source: "codex-app-server",
    useAppServer: true,
    acpFallbackAvailable: true,
    reason: isEnabled(env[LEGACY_LOCUS_CODEX_APP_SERVER_ADAPTER_ENV])
      ? "Codex app-server selected by legacy explicit adapter gate."
      : "Codex app-server selected by default.",
    fallbackEnvVar: LOCUS_CODEX_USE_ACP_TEMPORARY_COMPAT_ENV,
    legacyAppServerEnvVar: LEGACY_LOCUS_CODEX_APP_SERVER_ADAPTER_ENV,
  }
}

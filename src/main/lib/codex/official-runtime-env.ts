type EnvSource = Record<string, string | undefined>

export const CODEX_OFFICIAL_RUNTIME_ENV_ALLOWLIST = [
  "APPDATA",
  "CODEX_HOME",
  "COMSPEC",
  "HOME",
  "LOCALAPPDATA",
  "LOGNAME",
  "PATH",
  "PATHEXT",
  "PROGRAMDATA",
  "SHELL",
  "SystemRoot",
  "TEMP",
  "TMP",
  "TMPDIR",
  "USER",
  "USERPROFILE",
  "WINDIR",
] as const

const CODEX_OFFICIAL_RUNTIME_ENV_ALLOWLIST_SET = new Set<string>(
  CODEX_OFFICIAL_RUNTIME_ENV_ALLOWLIST.map((name) => name.toUpperCase()),
)

export type BuildCodexOfficialRuntimeEnvInput = {
  processEnv?: EnvSource
  shellEnv?: EnvSource
  appManagedApiKey?: string | null
  providerGatewayToken?: string | null
}

function allowlistedEnvKey(name: string): string | null {
  const trimmed = name.trim()
  if (!trimmed) return null
  return CODEX_OFFICIAL_RUNTIME_ENV_ALLOWLIST_SET.has(trimmed.toUpperCase())
    ? trimmed
    : null
}

function mergeAllowlistedEnv(
  target: Record<string, string>,
  source?: EnvSource,
): void {
  if (!source) return
  for (const [key, value] of Object.entries(source)) {
    if (typeof value !== "string") continue
    const allowlistedKey = allowlistedEnvKey(key)
    if (!allowlistedKey) continue
    target[allowlistedKey] = value
  }
}

export function buildCodexOfficialRuntimeEnv({
  processEnv,
  shellEnv,
  appManagedApiKey,
  providerGatewayToken,
}: BuildCodexOfficialRuntimeEnvInput = {}): Record<string, string> {
  const env: Record<string, string> = {}
  mergeAllowlistedEnv(env, processEnv)
  mergeAllowlistedEnv(env, shellEnv)

  const gatewayToken = providerGatewayToken?.trim()
  if (gatewayToken) {
    env.LOCUS_CODEX_PROVIDER_GATEWAY_TOKEN = gatewayToken
    return env
  }

  const apiKey = appManagedApiKey?.trim()
  if (apiKey) {
    env.CODEX_API_KEY = apiKey
  }

  return env
}

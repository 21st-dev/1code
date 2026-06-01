type EnvSource = Record<string, string | undefined>

export type CodexAuthMethodId = "chatgpt" | "codex-api-key"

export type CodexProviderProfileBinding = {
  id: string
  name: string
  baseUrl: string
  token: string
}

const SENSITIVE_ENV_NAMES = new Set([
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
  "CODEX_API_KEY",
  "CODEX_AUTH_TOKEN",
  "CODEX_BASE_URL",
  "LOCUS_CODEX_PROVIDER_GATEWAY_TOKEN",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
])

const SENSITIVE_ENV_NAME_REGEX =
  /(^|_)(API_?KEY|AUTH_?TOKEN|ACCESS_?TOKEN|REFRESH_?TOKEN|ID_?TOKEN|TOKEN|SECRET|PASSWORD|CREDENTIAL|CREDENTIALS|PRIVATE_?KEY)(_|$)/i

function shouldForwardCodexEnv(name: string): boolean {
  const normalized = name.trim().toUpperCase()
  if (!normalized) return false
  if (SENSITIVE_ENV_NAMES.has(normalized)) return false
  return !SENSITIVE_ENV_NAME_REGEX.test(normalized)
}

function mergeNonSecretEnv(target: Record<string, string>, source?: EnvSource): void {
  if (!source) return
  for (const [key, value] of Object.entries(source)) {
    if (typeof value !== "string") continue
    if (!shouldForwardCodexEnv(key)) continue
    target[key] = value
  }
}

export function buildCodexProviderEnv(params?: {
  processEnv?: EnvSource
  shellEnv?: EnvSource
  appManagedApiKey?: string | null
  providerGatewayToken?: string | null
}): Record<string, string> {
  const env: Record<string, string> = {}
  mergeNonSecretEnv(env, params?.processEnv)
  mergeNonSecretEnv(env, params?.shellEnv)

  const gatewayToken = params?.providerGatewayToken?.trim()
  if (gatewayToken) {
    env.LOCUS_CODEX_PROVIDER_GATEWAY_TOKEN = gatewayToken
    return env
  }

  const apiKey = params?.appManagedApiKey?.trim()
  if (apiKey) {
    env.CODEX_API_KEY = apiKey
  }

  return env
}

export function getCodexAuthMethodId(params?: {
  appManagedApiKey?: string | null
  providerProfile?: { id: string } | null
}): CodexAuthMethodId | undefined {
  if (params?.providerProfile) {
    return undefined
  }

  const apiKey = params?.appManagedApiKey?.trim()

  // codex-acp advertises auth methods:
  // - chatgpt
  // - codex-api-key
  // - openai-api-key
  // Official ChatGPT and app-managed API key paths are explicit so stale
  // provider profile state cannot affect the next ACP session.
  return apiKey ? "codex-api-key" : "chatgpt"
}

export function buildCodexProviderProfileArgs(
  providerProfile: Pick<CodexProviderProfileBinding, "name" | "baseUrl">,
): string[] {
  return [
    "-c",
    `model_provider=${JSON.stringify("locus_profile")}`,
    "-c",
    `model_providers.locus_profile.name=${JSON.stringify(providerProfile.name)}`,
    "-c",
    `model_providers.locus_profile.base_url=${JSON.stringify(providerProfile.baseUrl)}`,
    "-c",
    `model_providers.locus_profile.env_key=${JSON.stringify("LOCUS_CODEX_PROVIDER_GATEWAY_TOKEN")}`,
    "-c",
    `model_providers.locus_profile.wire_api=${JSON.stringify("responses")}`,
  ]
}

export function redactCodexProviderProfileArgs(args: string[]): string[] {
  return args.map((arg) =>
    arg.includes("model_providers.locus_profile.name=")
      ? "model_providers.locus_profile.name=<configured>"
      : arg.includes("model_providers.locus_profile.base_url=")
        ? "model_providers.locus_profile.base_url=<configured>"
        : arg,
  )
}

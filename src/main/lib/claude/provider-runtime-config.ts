import { redactProviderSecrets } from "../../../shared/provider-profile-security"

export type ClaudeProviderAuthMode = "api_key" | "auth_token"

export type ClaudeProviderRuntimeConfig = {
  model: string
  baseUrl: string
  token: string
  authMode: ClaudeProviderAuthMode
}

export function buildClaudeProviderEnv(
  config: ClaudeProviderRuntimeConfig,
): Record<string, string> {
  const env: Record<string, string> = {
    ANTHROPIC_BASE_URL: config.baseUrl,
  }

  if (config.authMode === "api_key") {
    env.ANTHROPIC_API_KEY = config.token
    env.ANTHROPIC_AUTH_TOKEN = ""
  } else {
    env.ANTHROPIC_AUTH_TOKEN = config.token
    env.ANTHROPIC_API_KEY = ""
  }

  return env
}

export function normalizeClaudeProviderRuntimeConfig(config: {
  model: string
  token: string
  baseUrl: string
  authMode?: ClaudeProviderAuthMode
}): ClaudeProviderRuntimeConfig {
  return {
    model: config.model,
    token: config.token,
    baseUrl: config.baseUrl,
    authMode: config.authMode ?? "auth_token",
  }
}

export function redactClaudeProviderEnvValueForLog(
  value: string | undefined,
): string {
  return value ? redactProviderSecrets(value) : "(default)"
}

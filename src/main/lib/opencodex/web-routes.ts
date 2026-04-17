import { getOpenCodexWebBaseUrl } from "./app-identity"

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "")
}

export function getOpenCodexAgentsApiBaseUrl(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): string {
  return getOpenCodexWebBaseUrl(env)
}

export function getOpenCodexAutomationsUrl(baseUrl: string): string {
  return `${normalizeBaseUrl(baseUrl)}/agents/app/automations`
}

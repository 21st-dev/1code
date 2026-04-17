const DEFAULT_OPENCODEX_UPDATE_FEED_BASE_URL = "https://updates.opencodex.invalid/releases/desktop"

export function getOpenCodexUpdateFeedBaseUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  const configuredBaseUrl = env.OPENCODEX_UPDATE_BASE_URL?.trim()

  if (!configuredBaseUrl) {
    return DEFAULT_OPENCODEX_UPDATE_FEED_BASE_URL
  }

  return configuredBaseUrl.replace(/\/+$/, "")
}

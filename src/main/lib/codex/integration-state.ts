export type CodexIntegrationState =
  | "connected_chatgpt"
  | "connected_api_key"
  | "not_logged_in"
  | "unknown"

export function normalizeCodexIntegrationState(
  rawOutput: string,
): CodexIntegrationState {
  const normalizedOutput = rawOutput.toLowerCase()

  if (normalizedOutput.includes("logged in using chatgpt")) {
    return "connected_chatgpt"
  }

  if (
    normalizedOutput.includes("logged in using an api key") ||
    normalizedOutput.includes("logged in using api key")
  ) {
    return "connected_api_key"
  }

  if (normalizedOutput.includes("not logged in")) {
    return "not_logged_in"
  }

  return "unknown"
}

export function isCodexIntegrationConnected(
  state: CodexIntegrationState,
): boolean {
  return state === "connected_chatgpt" || state === "connected_api_key"
}

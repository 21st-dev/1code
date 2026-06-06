export type ClaudeAgentSdkQuery =
  typeof import("@anthropic-ai/claude-agent-sdk").query

let cachedClaudeQuery: ClaudeAgentSdkQuery | null = null

export async function getClaudeAgentSdkQuery(): Promise<ClaudeAgentSdkQuery> {
  if (cachedClaudeQuery) {
    return cachedClaudeQuery
  }
  const sdk = await import("@anthropic-ai/claude-agent-sdk")
  cachedClaudeQuery = sdk.query
  return cachedClaudeQuery
}

export function clearClaudeAgentSdkQueryCache(): void {
  cachedClaudeQuery = null
}

export type CodexMcpSessionServerCandidate = {
  name: string
} | null

export type CodexMcpSettingsServerCandidate = {
  status: "connected" | "failed" | "pending" | "needs-auth"
  needsAuth?: boolean
  tools?: unknown[]
}

export function shouldAttachCodexMcpServerToSession(params: {
  sessionServer: CodexMcpSessionServerCandidate
  settingsServer: CodexMcpSettingsServerCandidate
  toolsWereResolved: boolean
}): boolean {
  if (!params.sessionServer) return false
  if (params.settingsServer.needsAuth) return false
  if (params.settingsServer.status !== "connected") return false

  if (params.toolsWereResolved && (params.settingsServer.tools?.length ?? 0) === 0) {
    return false
  }

  return true
}

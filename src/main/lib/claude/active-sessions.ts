export type ClaudeActiveSession = {
  controller: AbortController
  runId: string
}

const activeSessions = new Map<string, ClaudeActiveSession>()

export function getActiveClaudeSession(
  subChatId: string,
): ClaudeActiveSession | undefined {
  return activeSessions.get(subChatId)
}

export function setActiveClaudeSession(
  subChatId: string,
  session: ClaudeActiveSession,
): void {
  activeSessions.set(subChatId, session)
}

export function hasActiveClaudeSession(subChatId: string): boolean {
  return activeSessions.has(subChatId)
}

export function hasActiveClaudeSessions(): boolean {
  return activeSessions.size > 0
}

export function deleteActiveClaudeSession(subChatId: string): boolean {
  return activeSessions.delete(subChatId)
}

export function deleteActiveClaudeSessionIfController(
  subChatId: string,
  controller: AbortController,
): boolean {
  const session = activeSessions.get(subChatId)
  if (session?.controller !== controller) return false
  activeSessions.delete(subChatId)
  return true
}

export function abortAllClaudeSessions(): void {
  for (const [subChatId, session] of activeSessions) {
    console.log(`[claude] Aborting session ${subChatId} before reload`)
    session.controller.abort()
  }
  activeSessions.clear()
}

export function clearClaudeActiveSessionsForTest(): void {
  activeSessions.clear()
}

export type AgentStreamSubChatState = {
  id: string
  engine: string
  streamId?: string | null
}

export type AgentStreamActivityLookup = {
  isActiveCodexStream: (subChatId: string, streamId: string) => boolean
  isActiveHermesStream: (subChatId: string, streamId: string) => boolean
}

export function shouldClearStaleAgentStreamId(
  subChat: AgentStreamSubChatState,
  activity: AgentStreamActivityLookup,
): boolean {
  const streamId = subChat.streamId
  if (!streamId) return false

  if (subChat.engine === "codex") {
    return !activity.isActiveCodexStream(subChat.id, streamId)
  }

  if (subChat.engine === "hermes") {
    return !activity.isActiveHermesStream(subChat.id, streamId)
  }

  return false
}

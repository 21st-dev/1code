import { randomUUID } from "node:crypto"

export type PrepareClaudeAgentSdkAssistantPersistenceInput = {
  messagesToSave: any[]
  parts: any[]
  metadata: any
  createId?: () => string
  now?: () => Date
}

export type ClaudeAgentSdkAssistantPersistence = {
  assistantMessage: any | null
  messages: any[]
  sessionId: string | null
}

export function prepareClaudeAgentSdkAssistantPersistence({
  messagesToSave,
  parts,
  metadata,
  createId = randomUUID,
  now = () => new Date(),
}: PrepareClaudeAgentSdkAssistantPersistenceInput): ClaudeAgentSdkAssistantPersistence {
  const sessionId = metadata?.sessionId ?? null
  if (parts.length === 0) {
    return {
      assistantMessage: null,
      messages: messagesToSave,
      sessionId,
    }
  }

  const assistantMessage = {
    id: createId(),
    role: "assistant",
    createdAt: now().toISOString(),
    parts,
    metadata,
  }

  return {
    assistantMessage,
    messages: [...messagesToSave, assistantMessage],
    sessionId,
  }
}

export function shouldCreateClaudeAgentSdkRollbackStash(input: {
  historyEnabled: boolean
  metadata: any
  cwd?: string | null
}): input is {
  historyEnabled: true
  metadata: { sdkMessageUuid: string }
  cwd: string
} {
  return Boolean(
    input.historyEnabled && input.metadata?.sdkMessageUuid && input.cwd,
  )
}

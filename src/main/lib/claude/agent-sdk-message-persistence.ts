import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { chats, subChats } from "../db/schema"
import { createRollbackStash } from "../git/stash"

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

export type PersistClaudeAgentSdkAssistantResponseInput = {
  db: any
  chatId: string
  subChatId: string
  messagesToSave: any[]
  parts: any[]
  metadata: any
  historyEnabled: boolean
  cwd?: string | null
  clearStreamWhenEmpty?: boolean
  touchChatWhenEmpty?: boolean
  createId?: () => string
  now?: () => Date
  createRollbackStashFn?: typeof createRollbackStash
}

export type PersistClaudeAgentSdkAssistantResponseResult = {
  persistence: ClaudeAgentSdkAssistantPersistence
  rollbackStashCreated: boolean
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

export async function persistClaudeAgentSdkAssistantResponse({
  db,
  chatId,
  subChatId,
  messagesToSave,
  parts,
  metadata,
  historyEnabled,
  cwd,
  clearStreamWhenEmpty = true,
  touchChatWhenEmpty = true,
  createId,
  now = () => new Date(),
  createRollbackStashFn = createRollbackStash,
}: PersistClaudeAgentSdkAssistantResponseInput): Promise<PersistClaudeAgentSdkAssistantResponseResult> {
  const persistence = prepareClaudeAgentSdkAssistantPersistence({
    messagesToSave,
    parts,
    metadata,
    createId,
    now,
  })
  const updatedAt = now()

  if (persistence.assistantMessage) {
    db.update(subChats)
      .set({
        messages: JSON.stringify(persistence.messages),
        sessionId: persistence.sessionId,
        streamId: null,
        updatedAt,
      })
      .where(eq(subChats.id, subChatId))
      .run()
    db.update(chats)
      .set({ updatedAt })
      .where(eq(chats.id, chatId))
      .run()
  } else if (clearStreamWhenEmpty) {
    db.update(subChats)
      .set({
        sessionId: persistence.sessionId,
        streamId: null,
        updatedAt,
      })
      .where(eq(subChats.id, subChatId))
      .run()

    if (touchChatWhenEmpty) {
      db.update(chats)
        .set({ updatedAt })
        .where(eq(chats.id, chatId))
        .run()
    }
  }

  let rollbackStashCreated = false
  if (
    shouldCreateClaudeAgentSdkRollbackStash({
      historyEnabled,
      metadata,
      cwd,
    })
  ) {
    const rollbackCwd = cwd
    const sdkMessageUuid = metadata.sdkMessageUuid
    if (typeof rollbackCwd === "string" && typeof sdkMessageUuid === "string") {
      await createRollbackStashFn(rollbackCwd, sdkMessageUuid)
      rollbackStashCreated = true
    }
  }

  return {
    persistence,
    rollbackStashCreated,
  }
}

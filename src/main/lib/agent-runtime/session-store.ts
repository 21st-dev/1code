import { eq } from "drizzle-orm"
import { getDatabase, subChats } from "../db"
import type { AgentEngineId, AgentPermissionMode } from "./types"

type RuntimeMetadata = Record<string, unknown>

export type PersistAgentRuntimeSessionInput = {
  subChatId: string
  engine: AgentEngineId
  nativeSessionId?: string | null
  configDir?: string | null
  modelId?: string | null
  permissionMode?: AgentPermissionMode
  metadata?: RuntimeMetadata
  updateLegacySessionId?: boolean
}

function serializeMetadata(
  input: PersistAgentRuntimeSessionInput,
): string {
  return JSON.stringify({
    ...(input.metadata ?? {}),
    ...(input.permissionMode ? { permissionMode: input.permissionMode } : {}),
    updatedAt: new Date().toISOString(),
  })
}

export function persistAgentRuntimeSession(
  input: PersistAgentRuntimeSessionInput,
): void {
  const db = getDatabase()
  const values = {
    engine: input.engine,
    engineSessionId: input.nativeSessionId ?? null,
    engineConfigDir: input.configDir ?? null,
    modelId: input.modelId ?? null,
    runtimeMetadata: serializeMetadata(input),
    updatedAt: new Date(),
    ...(input.updateLegacySessionId
      ? { sessionId: input.nativeSessionId ?? null }
      : {}),
  }

  db.update(subChats)
    .set(values)
    .where(eq(subChats.id, input.subChatId))
    .run()
}

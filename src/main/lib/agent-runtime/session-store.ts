import { eq } from "drizzle-orm"
import { getDatabase, subChats } from "../db"
import type { AgentEngineId, AgentPermissionMode } from "./types"
import {
  mergeAgentRuntimeLaunchPlanMetadata,
  type AgentRuntimeLaunchPlan,
} from "./launch-plan"

type RuntimeMetadata = Record<string, unknown>

export type PersistAgentRuntimeSessionInput = {
  subChatId: string
  engine: AgentEngineId
  nativeSessionId?: string | null
  configDir?: string | null
  providerInstanceId?: string | null
  modelId?: string | null
  modelSelection?: {
    instanceId: string
    modelId: string
    options?: Record<string, unknown>
  } | null
  permissionMode?: AgentPermissionMode
  metadata?: RuntimeMetadata
  launchPlan?: AgentRuntimeLaunchPlan
  updateLegacySessionId?: boolean
}

function serializeMetadata(
  input: PersistAgentRuntimeSessionInput,
): string {
  const metadata = {
    ...(input.metadata ?? {}),
    ...(input.providerInstanceId
      ? { providerInstanceId: input.providerInstanceId }
      : {}),
    ...(input.modelSelection ? { modelSelection: input.modelSelection } : {}),
    ...(input.permissionMode ? { permissionMode: input.permissionMode } : {}),
    updatedAt: new Date().toISOString(),
  }

  return JSON.stringify(
    input.launchPlan
      ? mergeAgentRuntimeLaunchPlanMetadata(metadata, input.launchPlan)
      : metadata,
  )
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

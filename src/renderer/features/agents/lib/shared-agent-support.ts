import {
  AGENT_ENGINE_UI_DEFINITIONS,
  isRunnableAgentEngineId,
  type RunnableAgentEngineId,
} from "./agent-runtime"

export const SHARED_RUNNABLE_AGENT_IDS = [
  "hermes",
  "claude-code",
  "codex",
  "custom-acp",
] as const satisfies readonly RunnableAgentEngineId[]

export const SHARED_RUNNABLE_AGENT_SUPPORT_KEY =
  SHARED_RUNNABLE_AGENT_IDS.join(",")

const SHARED_AGENT_LABELS_BY_ID = new Map(
  AGENT_ENGINE_UI_DEFINITIONS
    .filter((engine) => isRunnableAgentEngineId(engine.id))
    .map((engine) => [engine.id, engine.name]),
)

export function getSharedRunnableAgentLabels(): string[] {
  return SHARED_RUNNABLE_AGENT_IDS.map(
    (engineId) => SHARED_AGENT_LABELS_BY_ID.get(engineId) ?? engineId,
  )
}

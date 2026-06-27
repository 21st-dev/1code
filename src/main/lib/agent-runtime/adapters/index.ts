import { claudeCodeAdapter } from "./claude-code"
import { codexAdapter } from "./codex"
import { customAcpAdapter } from "./custom-acp"
import { hermesAdapter } from "./hermes"
import type { AgentEngineId, AgentRuntimeAdapter } from "../types"

export const agentRuntimeAdapters: Record<
  AgentEngineId,
  AgentRuntimeAdapter
> = {
  "claude-code": claudeCodeAdapter,
  codex: codexAdapter,
  hermes: hermesAdapter,
  "custom-acp": customAcpAdapter,
}

export function getAgentRuntimeAdapter(
  engineId: AgentEngineId,
): AgentRuntimeAdapter {
  return agentRuntimeAdapters[engineId]
}

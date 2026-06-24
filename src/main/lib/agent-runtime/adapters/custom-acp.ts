import { getAgentRuntimeManifest } from "../manifests"
import type {
  AgentRuntimeAdapter,
  AgentRuntimeAvailability,
  AgentRuntimeHealth,
  AgentRuntimeSessionRef,
} from "../types"

async function inspectCustomAcpRuntime(): Promise<AgentRuntimeHealth> {
  const manifest = getAgentRuntimeManifest("custom-acp")

  return {
    availability: "unsupported",
    statusReason:
      "Configure a Moss Custom ACP endpoint or command adapter before starting sessions.",
    authMethod: "unsupported",
    models: manifest.models?.map((model) => ({
      ...model,
      availability: "unsupported",
      reason: "Custom ACP does not have a configured adapter yet.",
    })),
  }
}

export const customAcpAdapter: AgentRuntimeAdapter = {
  manifest: getAgentRuntimeManifest("custom-acp"),
  async inspect(
    _session: AgentRuntimeSessionRef,
  ): Promise<AgentRuntimeHealth> {
    return inspectCustomAcpRuntime()
  },
  async canStart(
    _session: AgentRuntimeSessionRef,
  ): Promise<AgentRuntimeAvailability> {
    return (await inspectCustomAcpRuntime()).availability
  },
}

import { getAgentRuntimeManifest } from "../manifests"
import {
  createUnsupportedAgentRuntimeControlResult,
  createUnsupportedAgentRuntimeReceipt,
  streamUnsupportedAgentRuntimeRun,
} from "../runtime-run-ledger"
import type {
  AgentRuntimeAdapter,
  AgentRuntimeAvailability,
  AgentRuntimeHealth,
  AgentRuntimeSessionRef,
  AgentRuntimeStartRequest,
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

function unsupportedCustomAcpRun(
  action: "start" | "resume",
  request: AgentRuntimeStartRequest,
) {
  return createUnsupportedAgentRuntimeReceipt({
    action,
    request,
    reason:
      "Configure a Moss Custom ACP endpoint or command adapter before starting sessions.",
  })
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
  async start(request) {
    return unsupportedCustomAcpRun("start", request)
  },
  async resume(request) {
    return unsupportedCustomAcpRun("resume", request)
  },
  stream(request) {
    return streamUnsupportedAgentRuntimeRun(unsupportedCustomAcpRun("start", request))
  },
  async stop(request) {
    return createUnsupportedAgentRuntimeControlResult(
      request,
      "Custom ACP stop requires a configured endpoint or command adapter.",
    )
  },
  async submitToolResult(request) {
    return createUnsupportedAgentRuntimeControlResult(
      request,
      "Custom ACP tool result submission requires a configured endpoint or command adapter.",
    )
  },
}

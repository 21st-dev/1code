import { getAgentRuntimeManifest } from "../manifests"
import type {
  AgentRuntimeAdapter,
  AgentRuntimeAvailability,
  AgentRuntimeHealth,
  AgentRuntimeSessionRef,
} from "../types"
import { resolveHermesRuntime } from "../../hermes/runtime"

async function inspectHermesRuntime(): Promise<AgentRuntimeHealth> {
  const manifest = getAgentRuntimeManifest("hermes")
  const runtime = resolveHermesRuntime()

  if (!runtime.executable && !runtime.sourceRoot) {
    return {
      availability: "not-installed",
      statusReason: "Hermes CLI and source root were not found.",
      authMethod: "unknown",
      models: manifest.models?.map((model) => ({
        ...model,
        availability: "not-installed",
        reason: "Hermes is not installed.",
      })),
    }
  }

  if ((runtime.acpExecutable || runtime.executable) && runtime.acpAdapterPath) {
    const launchPath = runtime.acpExecutable || `${runtime.executable} acp`
    return {
      availability: "available",
      statusReason:
        `Hermes ACP transport is available via ${launchPath}.`,
      authMethod: "shell-config",
      models: manifest.models?.map((model) => ({
        ...model,
        availability: "available",
        reason: "Hermes uses the current ACP runtime model unless a concrete ACP model is selected.",
      })),
    }
  }

  return {
    availability: "unsupported",
    statusReason:
      `Hermes source detected at ${runtime.sourceRoot || "unknown"}, but executable or ACP adapter is missing.`,
    authMethod: "unknown",
    models: manifest.models?.map((model) => ({
      ...model,
      availability: "unsupported",
      reason: "Hermes executable or ACP adapter is missing.",
    })),
  }
}

export const hermesAdapter: AgentRuntimeAdapter = {
  manifest: getAgentRuntimeManifest("hermes"),
  async inspect(
    _session: AgentRuntimeSessionRef,
  ): Promise<AgentRuntimeHealth> {
    return inspectHermesRuntime()
  },
  async canStart(
    _session: AgentRuntimeSessionRef,
  ): Promise<AgentRuntimeAvailability> {
    return (await inspectHermesRuntime()).availability
  },
}

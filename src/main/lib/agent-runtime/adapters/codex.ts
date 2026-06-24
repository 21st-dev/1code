import { getCodexIntegrationStatus } from "../../trpc/routers/codex"
import { getAgentRuntimeManifest } from "../manifests"
import type {
  AgentRuntimeAdapter,
  AgentRuntimeAvailability,
  AgentRuntimeHealth,
  AgentRuntimeSessionRef,
} from "../types"

async function inspectCodexRuntime(): Promise<AgentRuntimeHealth> {
  const manifest = getAgentRuntimeManifest("codex")

  try {
    const integration = await getCodexIntegrationStatus()
    const authMethod = integration.state === "connected_api_key"
      ? "api-key"
      : integration.state === "connected_chatgpt"
        ? "oauth"
        : "not-authenticated"

    if (integration.isConnected) {
      return {
        availability: "available",
        statusReason: `Codex auth detected via ${integration.state}.`,
        authMethod,
        models: manifest.models?.map((model) => ({
          ...model,
          availability: "available",
        })),
      }
    }

    return {
      availability: "needs-auth",
      statusReason:
        integration.rawOutput ||
        "Codex CLI is installed but no login was found.",
      authMethod,
      models: manifest.models?.map((model) => ({
        ...model,
        availability: "needs-auth",
        reason: "Codex authentication is required.",
      })),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const missingBinary = message.includes("Bundled Codex CLI not found")
    return {
      availability: missingBinary ? "not-installed" : "error",
      statusReason: message,
      authMethod: "unknown",
      models: manifest.models?.map((model) => ({
        ...model,
        availability: missingBinary ? "not-installed" : "error",
        reason: message,
      })),
    }
  }
}

export const codexAdapter: AgentRuntimeAdapter = {
  manifest: getAgentRuntimeManifest("codex"),
  async inspect(
    _session: AgentRuntimeSessionRef,
  ): Promise<AgentRuntimeHealth> {
    return inspectCodexRuntime()
  },
  async canStart(
    _session: AgentRuntimeSessionRef,
  ): Promise<AgentRuntimeAvailability> {
    return (await inspectCodexRuntime()).availability
  },
}

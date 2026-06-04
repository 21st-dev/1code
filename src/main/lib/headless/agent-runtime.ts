import {
  checkAgentRuntimeCapability,
  getAgentRunRequiredCapabilityIds,
  getAgentRuntimeCapabilityManifest,
  type AgentRuntimeCapabilityManifest,
  type AgentRuntimeId,
} from "../../../shared/agent-runtime-capabilities"
import type {
  AgentRuntimeObserver,
  AgentRuntimeRunRequest,
  AgentRuntimeRunResult,
} from "./agent-runtime-contract"
import { runClaudeCodeHeadlessTask } from "./adapters/claude-code"
import { runCodexHeadlessTask } from "./adapters/codex"

export type AgentRuntimeAdapter = {
  id: AgentRuntimeId
  manifest: AgentRuntimeCapabilityManifest
  run(
    request: AgentRuntimeRunRequest,
    observer: AgentRuntimeObserver,
  ): Promise<AgentRuntimeRunResult>
}

const adapters: Record<AgentRuntimeId, AgentRuntimeAdapter> = {
  "claude-code": {
    id: "claude-code",
    manifest: getAgentRuntimeCapabilityManifest("claude-code"),
    run: runClaudeCodeHeadlessTask,
  },
  codex: {
    id: "codex",
    manifest: getAgentRuntimeCapabilityManifest("codex"),
    run: runCodexHeadlessTask,
  },
}

function checkRunCapabilities(
  request: AgentRuntimeRunRequest,
): AgentRuntimeRunResult | null {
  const required = getAgentRunRequiredCapabilityIds({
    mode: request.mode,
    hasScopeContract: false,
  })

  for (const capabilityId of required) {
    const gate = checkAgentRuntimeCapability({
      runtime: request.runtime,
      capabilityId,
    })
    if (!gate.ok) {
      return {
        status: "failed",
        exitCode: 1,
        errorCode: "unsupported_capability",
        errorMessage: gate.diagnostic.message,
      }
    }
  }

  return null
}

export function getAgentRuntimeAdapter(
  runtime: AgentRuntimeId,
): AgentRuntimeAdapter {
  return adapters[runtime]
}

export async function runAgentTask(
  request: AgentRuntimeRunRequest,
  observer: AgentRuntimeObserver,
): Promise<AgentRuntimeRunResult> {
  const capabilityFailure = checkRunCapabilities(request)
  if (capabilityFailure) return capabilityFailure

  const adapter = getAgentRuntimeAdapter(request.runtime)
  observer.appendEvent("status", {
    status: "runtime_selected",
    runtime: adapter.id,
    label: adapter.manifest.label,
  })
  return adapter.run(request, observer)
}

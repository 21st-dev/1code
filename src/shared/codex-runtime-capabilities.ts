import {
  buildAgentRuntimeCapabilityDiagnostic,
  getAgentRunRequiredCapabilityIds,
  getAgentRuntimeCapability,
  getAgentRuntimeCapabilityManifest,
  type AgentRuntimeCapability,
  type AgentRuntimeCapabilityId,
  type AgentRuntimeCapabilityStatus,
} from "./agent-runtime-capabilities"

export type CodexRuntimeCapabilityStatus = AgentRuntimeCapabilityStatus
export type CodexRuntimeCapabilityId = AgentRuntimeCapabilityId
export type CodexRuntimeCapability = AgentRuntimeCapability

export type CodexRuntimeCapabilityBlocker = {
  capability: CodexRuntimeCapabilityId
  status: CodexRuntimeCapabilityStatus
  message: string
  hint: string | null
  reason: string
}

export type CodexCapabilityErrorChunk = {
  type: "capability-error"
  runtime: "codex"
  capability: CodexRuntimeCapabilityId
  errorText: string
  blocker: CodexRuntimeCapabilityBlocker
}

export function getCodexRuntimeCapabilities(): CodexRuntimeCapability[] {
  return getAgentRuntimeCapabilityManifest("codex").capabilities
}

export function getCodexRuntimeCapability(
  id: CodexRuntimeCapabilityId,
): CodexRuntimeCapability {
  return getAgentRuntimeCapability("codex", id)
}

export function buildCodexRuntimeCapabilityErrorChunk(input: {
  capability: CodexRuntimeCapability
  message?: string
  hint?: string | null
}): CodexCapabilityErrorChunk {
  const diagnostic = buildAgentRuntimeCapabilityDiagnostic({
    runtime: "codex",
    capabilityId: input.capability.id,
    message: input.message,
    hint: input.hint,
  })
  const blocker: CodexRuntimeCapabilityBlocker = {
    capability: input.capability.id,
    status: input.capability.status,
    message: diagnostic.message,
    hint: diagnostic.hint,
    reason: diagnostic.reason,
  }

  return {
    type: "capability-error",
    runtime: "codex",
    capability: input.capability.id,
    errorText: blocker.hint ? `${blocker.message} ${blocker.hint}` : blocker.message,
    blocker,
  }
}

export function getCodexRunRequiredCapability(input: {
  mode?: "plan" | "agent"
  hasScopeContract?: boolean
}): CodexRuntimeCapability | null {
  const [capabilityId] = getAgentRunRequiredCapabilityIds(input)
  return capabilityId ? getCodexRuntimeCapability(capabilityId) : null
}

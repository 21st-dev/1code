import {
  checkAgentRuntimeCapability,
  getAgentRuntimeCapabilityManifest,
  getAgentRuntimeCapabilityManifests,
  resolveAgentRuntimeCapability,
  resolveAgentRuntimeCapabilityManifest,
  toAgentRuntimeId,
  type AgentRuntimeAlias,
  type AgentRuntimeCapabilityGate,
  type AgentRuntimeCapabilityId,
  type AgentRuntimeCapabilityLookup,
  type AgentRuntimeCapabilityManifest,
  type AgentRuntimeManifestLookup,
  type AgentRuntimeId,
} from "../../../shared/agent-runtime-capabilities"

export function listRegisteredAgentRuntimeManifests(): AgentRuntimeCapabilityManifest[] {
  return getAgentRuntimeCapabilityManifests()
}

export function getRegisteredAgentRuntimeManifest(
  runtime: AgentRuntimeAlias,
): AgentRuntimeCapabilityManifest {
  return getAgentRuntimeCapabilityManifest(runtime)
}

export function getRegisteredAgentRuntimeId(
  runtime: AgentRuntimeAlias | string | null | undefined,
): AgentRuntimeId | null {
  return toAgentRuntimeId(runtime)
}

export function checkRegisteredAgentRuntimeCapability(input: {
  runtime: AgentRuntimeAlias
  capabilityId: AgentRuntimeCapabilityId
}): AgentRuntimeCapabilityGate {
  return checkAgentRuntimeCapability(input)
}

export function resolveRegisteredAgentRuntimeManifest(
  runtime: string,
): AgentRuntimeManifestLookup {
  return resolveAgentRuntimeCapabilityManifest(runtime)
}

export function resolveRegisteredAgentRuntimeCapability(input: {
  runtime: string
  capabilityId: AgentRuntimeCapabilityId
}): AgentRuntimeCapabilityLookup {
  return resolveAgentRuntimeCapability(input)
}

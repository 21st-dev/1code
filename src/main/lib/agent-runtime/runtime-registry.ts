import {
  checkAgentRuntimeCapability,
  getAgentRuntimeCapabilityManifest,
  getAgentRuntimeCapabilityManifests,
  resolveAgentRuntimeCapability,
  resolveAgentRuntimeCapabilityManifest,
  shouldEnableQwenCodeRuntime,
  toAgentRuntimeId,
  type AgentRuntimeAlias,
  type AgentRuntimeCapabilityGate,
  type AgentRuntimeCapabilityId,
  type AgentRuntimeCapabilityLookup,
  type AgentRuntimeCapabilityManifest,
  type AgentRuntimeManifestLookup,
  type AgentRuntimeFeatureEnv,
  type AgentRuntimeId,
} from "../../../shared/agent-runtime-capabilities"

export type AgentRuntimeRegistryScope = "contract" | "desktop"

export type AgentRuntimeRegistryOptions = {
  scope?: AgentRuntimeRegistryScope
  env?: AgentRuntimeFeatureEnv
}

function includesExperimentalRuntimes(
  options: AgentRuntimeRegistryOptions = {},
): boolean {
  if ((options.scope ?? "contract") !== "desktop") return false
  return shouldEnableQwenCodeRuntime(options.env ?? process.env)
}

export function listRegisteredAgentRuntimeManifests(
  options: AgentRuntimeRegistryOptions = {},
): AgentRuntimeCapabilityManifest[] {
  return getAgentRuntimeCapabilityManifests({
    includeExperimental: includesExperimentalRuntimes(options),
  })
}

export function getRegisteredAgentRuntimeManifest(
  runtime: AgentRuntimeAlias,
  options: AgentRuntimeRegistryOptions = {},
): AgentRuntimeCapabilityManifest {
  const runtimeId = toAgentRuntimeId(runtime)
  if (
    runtimeId === "qwen-code" &&
    !includesExperimentalRuntimes(options)
  ) {
    throw new Error(`Unknown agent runtime: ${runtime}`)
  }
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
  options?: AgentRuntimeRegistryOptions
}): AgentRuntimeCapabilityGate {
  const runtimeId = toAgentRuntimeId(input.runtime)
  if (
    runtimeId === "qwen-code" &&
    !includesExperimentalRuntimes(input.options)
  ) {
    throw new Error(`Unknown agent runtime: ${input.runtime}`)
  }
  return checkAgentRuntimeCapability(input)
}

export function resolveRegisteredAgentRuntimeManifest(
  runtime: string,
  options: AgentRuntimeRegistryOptions = {},
): AgentRuntimeManifestLookup {
  const runtimeId = toAgentRuntimeId(runtime)
  if (
    runtimeId === "qwen-code" &&
    !includesExperimentalRuntimes(options)
  ) {
    return {
      ok: false,
      runtimeId,
      diagnostic: {
        type: "unavailable-runtime",
        runtimeId,
        message: `Agent runtime ${runtimeId} is not registered.`,
        hint: "Choose a registered runtime and retry.",
      },
    }
  }
  return resolveAgentRuntimeCapabilityManifest(runtime)
}

export function resolveRegisteredAgentRuntimeCapability(input: {
  runtime: string
  capabilityId: AgentRuntimeCapabilityId
  options?: AgentRuntimeRegistryOptions
}): AgentRuntimeCapabilityLookup {
  const runtimeId = toAgentRuntimeId(input.runtime)
  if (
    runtimeId === "qwen-code" &&
    !includesExperimentalRuntimes(input.options)
  ) {
    return {
      ok: false,
      runtimeId,
      diagnostic: {
        type: "unavailable-runtime",
        runtimeId,
        message: `Agent runtime ${runtimeId} is not registered.`,
        hint: "Choose a registered runtime and retry.",
      },
    }
  }
  return resolveAgentRuntimeCapability(input)
}

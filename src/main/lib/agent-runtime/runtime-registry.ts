import {
  CONTRACT_RUNTIME_IDS,
  EXPERIMENTAL_RUNTIME_IDS,
  checkAgentRuntimeCapability,
  getAgentRuntimeCapabilityManifest,
  isExperimentalAgentRuntimeId,
  resolveAgentRuntimeCapability,
  resolveAgentRuntimeCapabilityManifest,
  shouldEnableExperimentalAgentRuntime,
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
  runtimeFeatureSettings?: {
    qwenRuntimeEnabled?: boolean
    kunRuntimeEnabled?: boolean
  }
}

function includesExperimentalRuntimes(
  options: AgentRuntimeRegistryOptions = {},
): boolean {
  return (
    (options.scope ?? "contract") === "desktop" &&
    EXPERIMENTAL_RUNTIME_IDS.some((runtimeId) => {
      if (
        runtimeId === "qwen-code" &&
        typeof options.runtimeFeatureSettings?.qwenRuntimeEnabled === "boolean"
      ) {
        return options.runtimeFeatureSettings.qwenRuntimeEnabled
      }
      if (
        runtimeId === "kun" &&
        typeof options.runtimeFeatureSettings?.kunRuntimeEnabled === "boolean"
      ) {
        return options.runtimeFeatureSettings.kunRuntimeEnabled
      }
      return shouldEnableExperimentalAgentRuntime(
        runtimeId,
        options.env ?? process.env,
      )
    })
  )
}

function isRegisteredAgentRuntimeId(
  runtimeId: AgentRuntimeId,
  options: AgentRuntimeRegistryOptions = {},
): boolean {
  if (!isExperimentalAgentRuntimeId(runtimeId)) return true
  if ((options.scope ?? "contract") !== "desktop") return false
  if (
    runtimeId === "qwen-code" &&
    typeof options.runtimeFeatureSettings?.qwenRuntimeEnabled === "boolean"
  ) {
    return options.runtimeFeatureSettings.qwenRuntimeEnabled
  }
  if (
    runtimeId === "kun" &&
    typeof options.runtimeFeatureSettings?.kunRuntimeEnabled === "boolean"
  ) {
    return options.runtimeFeatureSettings.kunRuntimeEnabled
  }
  return shouldEnableExperimentalAgentRuntime(
    runtimeId,
    options.env ?? process.env,
  )
}

function buildUnregisteredRuntimeLookup(
  runtimeId: AgentRuntimeId,
): AgentRuntimeManifestLookup {
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

export function listRegisteredAgentRuntimeManifests(
  options: AgentRuntimeRegistryOptions = {},
): AgentRuntimeCapabilityManifest[] {
  const runtimeIds: AgentRuntimeId[] = includesExperimentalRuntimes(options)
    ? [
        ...CONTRACT_RUNTIME_IDS,
        ...EXPERIMENTAL_RUNTIME_IDS.filter((runtimeId) =>
          isRegisteredAgentRuntimeId(runtimeId, options),
        ),
      ]
    : [...CONTRACT_RUNTIME_IDS]

  return runtimeIds.map((runtimeId) =>
    getAgentRuntimeCapabilityManifest(runtimeId),
  )
}

export function getRegisteredAgentRuntimeManifest(
  runtime: AgentRuntimeAlias,
  options: AgentRuntimeRegistryOptions = {},
): AgentRuntimeCapabilityManifest {
  const runtimeId = toAgentRuntimeId(runtime)
  if (!runtimeId || !isRegisteredAgentRuntimeId(runtimeId, options)) {
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
  if (!runtimeId || !isRegisteredAgentRuntimeId(runtimeId, input.options)) {
    throw new Error(`Unknown agent runtime: ${input.runtime}`)
  }
  return checkAgentRuntimeCapability(input)
}

export function resolveRegisteredAgentRuntimeManifest(
  runtime: string,
  options: AgentRuntimeRegistryOptions = {},
): AgentRuntimeManifestLookup {
  const runtimeId = toAgentRuntimeId(runtime)
  if (runtimeId && !isRegisteredAgentRuntimeId(runtimeId, options)) {
    return buildUnregisteredRuntimeLookup(runtimeId)
  }
  return resolveAgentRuntimeCapabilityManifest(runtime)
}

export function resolveRegisteredAgentRuntimeCapability(input: {
  runtime: string
  capabilityId: AgentRuntimeCapabilityId
  options?: AgentRuntimeRegistryOptions
}): AgentRuntimeCapabilityLookup {
  const runtimeId = toAgentRuntimeId(input.runtime)
  if (runtimeId && !isRegisteredAgentRuntimeId(runtimeId, input.options)) {
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

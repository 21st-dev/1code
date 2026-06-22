import type {
  McpRegistryEntry,
  McpRegistryInstallTarget,
  McpRegistryRuntimeSupport,
  McpRegistrySetupField,
} from "./normalize"
import {
  classifyMcpRegistrySetup,
  type McpRegistrySetupResolutionInput,
} from "./setup"

export type McpRegistryRuntimeId = "claude-code" | "codex"

export type McpRegistryRuntimeInstallabilityStatus =
  | "declared-compatible"
  | "installable-config"
  | "needs-setup"
  | "installed-unverified"
  | "installed-needs-setup"
  | "ready-to-verify"
  | "failed-check"
  | "verified-local"
  | "connected-unverified"
  | "unsupported"

export type McpRegistryDeclaredCompatibility =
  | "declared"
  | "runtime-neutral"
  | "unknown"
  | "not-declared"

export type McpRegistryRuntimeLocalState = {
  runtime: McpRegistryRuntimeId
  status:
    | "installed-unverified"
    | "installed-needs-setup"
    | "ready-to-verify"
    | "failed-check"
    | "connected-unverified"
    | "verified-local"
  reason?: string
}

export type McpRegistryRuntimeInstallability = {
  runtime: McpRegistryRuntimeId
  status: McpRegistryRuntimeInstallabilityStatus
  declaredCompatibility: McpRegistryDeclaredCompatibility
  installableConfig: boolean
  requiredSetupKeys: string[]
  reasons: string[]
}

export type McpRegistryRuntimeSetupResolutions = Partial<
  Record<McpRegistryRuntimeId, McpRegistrySetupResolutionInput>
>

function declaredCompatibilityFor(input: {
  runtime: McpRegistryRuntimeId
  support: McpRegistryRuntimeSupport[]
}): McpRegistryDeclaredCompatibility {
  if (input.support.includes(input.runtime)) return "declared"
  if (input.support.includes("runtime-neutral")) return "runtime-neutral"
  if (input.support.includes("unknown")) return "unknown"
  return "not-declared"
}

function setupKeys(
  source: "env" | "header" | "variable",
  fields: McpRegistrySetupField[],
): string[] {
  return fields
    .filter((field) => field.required)
    .map((field) => `${source}:${field.name}`)
}

function requiredSetupKeys(target: McpRegistryInstallTarget): string[] {
  const keys = [
    ...setupKeys("env", target.envSchema),
    ...setupKeys("header", target.headerSchema),
    ...setupKeys("variable", target.variableSchema),
  ]
  return [...new Set(keys)].sort()
}

function transportHasExecutableConfig(target: McpRegistryInstallTarget): boolean {
  if (target.transport === "stdio") {
    return Boolean(target.commandTemplate)
  }
  if (
    target.transport === "http" ||
    target.transport === "sse" ||
    target.transport === "streamable_http"
  ) {
    return Boolean(target.urlTemplate)
  }
  return false
}

export function claudeCanMaterialize(
  target: McpRegistryInstallTarget,
): boolean {
  return transportHasExecutableConfig(target)
}

export function codexCanMaterialize(
  target: McpRegistryInstallTarget,
): boolean {
  return transportHasExecutableConfig(target)
}

function materializationReasons(input: {
  runtime: McpRegistryRuntimeId
  target: McpRegistryInstallTarget
}): string[] {
  if (input.target.transport === "unknown") return ["unsupported-transport"]
  if (input.target.transport === "stdio" && !input.target.commandTemplate) {
    return ["adapter-config-missing-command"]
  }
  if (
    (input.target.transport === "http" ||
      input.target.transport === "sse" ||
      input.target.transport === "streamable_http") &&
    !input.target.urlTemplate
  ) {
    return ["adapter-config-missing-url"]
  }
  return ["adapter-config-incomplete"]
}

function setupMissingReasons(missingKeys: string[]): string[] {
  if (missingKeys.length === 0) return []
  return [
    "required-setup-missing",
    ...missingKeys.map((key) => `missing:${key}`),
  ]
}

function statusFromLocalState(
  localState: McpRegistryRuntimeLocalState | undefined,
): McpRegistryRuntimeInstallabilityStatus | null {
  return localState?.status ?? null
}

export function previewMcpRegistryRuntimeInstallability(input: {
  entry: McpRegistryEntry
  target: McpRegistryInstallTarget
  runtime: McpRegistryRuntimeId
  localState?: McpRegistryRuntimeLocalState
  resolvedSetup?: McpRegistrySetupResolutionInput
}): McpRegistryRuntimeInstallability {
  const declaredCompatibility = declaredCompatibilityFor({
    runtime: input.runtime,
    support: input.target.declaredRuntimeSupport,
  })
  const requiredKeys = requiredSetupKeys(input.target)
  const localStatus = statusFromLocalState(input.localState)
  const installableConfig =
    input.runtime === "codex"
      ? codexCanMaterialize(input.target)
      : claudeCanMaterialize(input.target)
  if (localStatus) {
    return {
      runtime: input.runtime,
      status: localStatus,
      declaredCompatibility,
      installableConfig,
      requiredSetupKeys: requiredKeys,
      reasons: input.localState?.reason ? [input.localState.reason] : [],
    }
  }

  if (!installableConfig) {
    return {
      runtime: input.runtime,
      status:
        declaredCompatibility === "declared" ||
        declaredCompatibility === "runtime-neutral"
          ? "declared-compatible"
          : "unsupported",
      declaredCompatibility,
      installableConfig: false,
      requiredSetupKeys: requiredKeys,
      reasons: materializationReasons({
        runtime: input.runtime,
        target: input.target,
      }),
    }
  }

  const setup = classifyMcpRegistrySetup({
    runtime: input.runtime,
    target: input.target,
    resolved: input.resolvedSetup,
  })
  const setupMissingKeys = setup.missingKeys

  if (setupMissingKeys.length > 0) {
    return {
      runtime: input.runtime,
      status: "needs-setup",
      declaredCompatibility,
      installableConfig: true,
      requiredSetupKeys: setupMissingKeys,
      reasons: setupMissingReasons(setupMissingKeys),
    }
  }

  return {
    runtime: input.runtime,
    status: "installable-config",
    declaredCompatibility,
    installableConfig: true,
    requiredSetupKeys: [],
    reasons: [],
  }
}

export function previewDefaultMcpRegistryRuntimeInstallability(input: {
  entry: McpRegistryEntry
  target: McpRegistryInstallTarget
  localStates?: McpRegistryRuntimeLocalState[]
  resolvedSetup?: McpRegistryRuntimeSetupResolutions
}): McpRegistryRuntimeInstallability[] {
  return (["claude-code", "codex"] as const).map((runtime) =>
    previewMcpRegistryRuntimeInstallability({
      entry: input.entry,
      target: input.target,
      runtime,
      localState: input.localStates?.find((state) => state.runtime === runtime),
      resolvedSetup: input.resolvedSetup?.[runtime],
    }),
  )
}

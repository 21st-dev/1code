import type {
  McpRegistryEntry,
  McpRegistryInstallTarget,
  McpRegistryRuntimeSupport,
  McpRegistrySetupField,
} from "./normalize"

export type McpRegistryRuntimeId = "claude-code" | "codex"

export type McpRegistryRuntimeInstallabilityStatus =
  | "declared-compatible"
  | "installable-config"
  | "needs-setup"
  | "installed-unverified"
  | "installed-needs-setup"
  | "failed-check"
  | "verified-local"
  | "codex-deferred"
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
    | "failed-check"
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

function claudeCanMaterialize(target: McpRegistryInstallTarget): boolean {
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
}): McpRegistryRuntimeInstallability {
  const declaredCompatibility = declaredCompatibilityFor({
    runtime: input.runtime,
    support: input.target.declaredRuntimeSupport,
  })
  const requiredKeys = requiredSetupKeys(input.target)
  const localStatus = statusFromLocalState(input.localState)

  if (input.runtime === "codex") {
    return {
      runtime: input.runtime,
      status: "codex-deferred",
      declaredCompatibility,
      installableConfig: false,
      requiredSetupKeys: requiredKeys,
      reasons: [
        "codex-registry-support-deferred",
        "codex-config-writes-do-not-cover-registry-fields",
        "codex-runtime-proof-missing",
        ...(input.localState?.reason ? [input.localState.reason] : []),
      ],
    }
  }

  const installableConfig = claudeCanMaterialize(input.target)
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
      reasons: ["adapter-config-incomplete"],
    }
  }

  if (requiredKeys.length > 0 || input.target.authMetadata.required) {
    return {
      runtime: input.runtime,
      status: "needs-setup",
      declaredCompatibility,
      installableConfig: true,
      requiredSetupKeys: requiredKeys,
      reasons: ["required-setup-missing"],
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
}): McpRegistryRuntimeInstallability[] {
  return (["claude-code", "codex"] as const).map((runtime) =>
    previewMcpRegistryRuntimeInstallability({
      entry: input.entry,
      target: input.target,
      runtime,
      localState: input.localStates?.find((state) => state.runtime === runtime),
    }),
  )
}

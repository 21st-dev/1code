import type { McpRegistryRuntimeId } from "./installability"
import type {
  McpRegistryInstallTarget,
  McpRegistrySetupField,
} from "./normalize"

export type McpRegistrySetupResolutionInput = {
  env?: Record<string, McpRegistryResolvedSetupValue>
  headers?: Record<string, McpRegistryResolvedSetupValue>
  variables?: Record<string, McpRegistryResolvedSetupValue>
  bearerTokenEnvRefs?: Record<string, string | undefined>
  localDependencies?: Record<string, boolean>
  oauthAuthenticated?: boolean
  runtimeAuthenticated?: boolean
}

export type McpRegistryResolvedSetupValue =
  | boolean
  | string
  | {
      value?: string
      envVar?: string
    }

export type McpRegistrySetupKeySummary = {
  required: string[]
  optional: string[]
  missing: string[]
}

export type McpRegistryBearerTokenEnvRef = {
  headerName: string
  envName?: string
  missing: boolean
}

export type McpRegistryLocalDependency = {
  key: string
  missing: boolean
}

export type McpRegistrySetupClassification = {
  runtime: McpRegistryRuntimeId
  env: McpRegistrySetupKeySummary
  headers: McpRegistrySetupKeySummary
  variables: McpRegistrySetupKeySummary
  bearerTokenEnvRefs: McpRegistryBearerTokenEnvRef[]
  oauthRequired: boolean
  oauthMissing: boolean
  runtimeAuthRequired: boolean
  runtimeAuthMissing: boolean
  localDependencies: McpRegistryLocalDependency[]
  missingKeys: string[]
  adapterCanKeepIncompleteInactive: boolean
  missingSetupBehavior: "none" | "save-needs-setup" | "block-install"
}

function classifyFields(
  fields: McpRegistrySetupField[],
  resolved: Record<string, McpRegistryResolvedSetupValue> | undefined,
  isResolved: (field: McpRegistrySetupField) => boolean = (field) =>
    isResolvedSetupValue(resolved?.[field.name]),
): McpRegistrySetupKeySummary {
  const required = fields
    .filter((field) => field.required)
    .map((field) => field.name)
    .sort()
  const optional = fields
    .filter((field) => !field.required)
    .map((field) => field.name)
    .sort()
  const missing = required
    .filter((key) => {
      const field = fields.find((candidate) => candidate.name === key)
      return !field || !isResolved(field)
    })
    .sort()
  return { required, optional, missing }
}

function trimmed(value: string | undefined): string | undefined {
  const next = value?.trim()
  return next ? next : undefined
}

export function getResolvedSetupPlainValue(
  value: McpRegistryResolvedSetupValue | undefined,
): string | undefined {
  if (typeof value === "string") return trimmed(value)
  if (!value || typeof value !== "object") return undefined
  return trimmed(value.value)
}

export function getResolvedSetupEnvVar(
  value: McpRegistryResolvedSetupValue | undefined,
): string | undefined {
  if (!value || typeof value !== "object") return undefined
  return trimmed(value.envVar)
}

export function isResolvedSetupValue(
  value: McpRegistryResolvedSetupValue | undefined,
): boolean {
  if (value === true) return true
  if (typeof value === "string") return Boolean(trimmed(value))
  if (!value || typeof value !== "object") return false
  return Boolean(trimmed(value.value) || trimmed(value.envVar))
}

function bearerHeaderNames(target: McpRegistryInstallTarget): string[] {
  if (target.authMetadata.kind !== "bearer") return []
  return target.authMetadata.headerNames
    .filter((name) => name.toLowerCase() === "authorization")
    .sort()
}

function localDependencyKeys(target: McpRegistryInstallTarget): string[] {
  if (target.source !== "package") return []
  const registryType = target.packageDistribution?.registryType
  const identifier = target.packageDistribution?.identifier
  if (!registryType && !identifier) return []
  return [`package:${registryType ?? "unknown"}:${identifier ?? "unknown"}`]
}

function adapterCanKeepInactive(runtime: McpRegistryRuntimeId): boolean {
  if (runtime === "claude-code") return true
  if (runtime === "codex") return false
  return false
}

export function classifyMcpRegistrySetup(input: {
  runtime: McpRegistryRuntimeId
  target: McpRegistryInstallTarget
  resolved?: McpRegistrySetupResolutionInput
}): McpRegistrySetupClassification {
  const env = classifyFields(input.target.envSchema, input.resolved?.env)
  const headers = classifyFields(
    input.target.headerSchema,
    input.resolved?.headers,
    (field) =>
      isResolvedSetupValue(input.resolved?.headers?.[field.name]) ||
      Boolean(input.resolved?.bearerTokenEnvRefs?.[field.name]?.trim()),
  )
  const variables = classifyFields(
    input.target.variableSchema,
    input.resolved?.variables,
  )
  const bearerTokenEnvRefs = bearerHeaderNames(input.target).map(
    (headerName) => {
      const envName = input.resolved?.bearerTokenEnvRefs?.[headerName]?.trim()
      return {
        headerName,
        ...(envName ? { envName } : {}),
        missing:
          !envName &&
          !isResolvedSetupValue(input.resolved?.headers?.[headerName]),
      }
    },
  )
  const oauthRequired =
    input.target.authMetadata.kind === "oauth" &&
    input.target.authMetadata.required
  const runtimeAuthRequired = input.runtime === "codex"
  const localDependencies = localDependencyKeys(input.target).map((key) => ({
    key,
    missing: input.resolved?.localDependencies?.[key] !== true,
  }))
  const missingKeys = [
    ...env.missing.map((key) => `env:${key}`),
    ...headers.missing.map((key) => `header:${key}`),
    ...variables.missing.map((key) => `variable:${key}`),
    ...bearerTokenEnvRefs
      .filter((ref) => ref.missing)
      .map((ref) => `bearer-token-env:${ref.headerName}`),
    ...(oauthRequired && input.resolved?.oauthAuthenticated !== true
      ? ["oauth"]
      : []),
    ...(runtimeAuthRequired && input.resolved?.runtimeAuthenticated !== true
      ? [`runtime-auth:${input.runtime}`]
      : []),
    ...localDependencies
      .filter((dependency) => dependency.missing)
      .map((dependency) => `local-dependency:${dependency.key}`),
  ].sort()
  const adapterCanKeepIncompleteInactive = adapterCanKeepInactive(input.runtime)
  const missingSetupBehavior =
    missingKeys.length === 0
      ? "none"
      : adapterCanKeepIncompleteInactive
        ? "save-needs-setup"
        : "block-install"

  return {
    runtime: input.runtime,
    env,
    headers,
    variables,
    bearerTokenEnvRefs,
    oauthRequired,
    oauthMissing: oauthRequired && input.resolved?.oauthAuthenticated !== true,
    runtimeAuthRequired,
    runtimeAuthMissing:
      runtimeAuthRequired && input.resolved?.runtimeAuthenticated !== true,
    localDependencies,
    missingKeys,
    adapterCanKeepIncompleteInactive,
    missingSetupBehavior,
  }
}

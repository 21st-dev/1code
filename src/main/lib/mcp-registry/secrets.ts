import type { McpServerConfig } from "../claude-config"
import {
  decryptStringFromStorage,
  encryptStringForStorage,
} from "../secure-storage"
import type { McpRegistryRuntimeLocalState } from "./installability"
import type { McpRegistryVerificationKeyInput } from "./verification-state"

const SECRET_PLACEHOLDER_PREFIX = "locus:mcp-registry-secret:v1"
const ENV_REF_PLACEHOLDER_PREFIX = "locus:mcp-registry-env-ref:v1"

export type McpRegistrySecretKind = "env" | "header" | "variable"

export type McpRegistryEncryptedSetup = {
  version: 1
  env?: Record<string, string>
  headers?: Record<string, string>
  variables?: Record<string, string>
}

export type McpRegistryEnvVarRefs = {
  env?: Record<string, string>
  headers?: Record<string, string>
  variables?: Record<string, string>
  bearerTokenEnvRefs?: Record<string, string>
}

export type McpRegistryTemplateValues = {
  url?: string
  args?: string[]
  cwd?: string
}

export type McpRegistryConfigMetadata = {
  providerId: string
  entryId: string
  targetId: string
  runtime: string
  status: string
  entryFingerprint: string
  configFingerprint: string
  installedAt: string
  missingSetupKeys?: string[]
  encryptedSetup?: McpRegistryEncryptedSetup
  envVarRefs?: McpRegistryEnvVarRefs
  templates?: McpRegistryTemplateValues
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function nonEmptyRecord(
  value: Record<string, string>,
): Record<string, string> | undefined {
  return Object.keys(value).length > 0 ? value : undefined
}

function placeholder(kind: McpRegistrySecretKind, key: string): string {
  return `${SECRET_PLACEHOLDER_PREFIX}:${kind}:${encodeURIComponent(key)}`
}

function envRefPlaceholder(kind: "env" | "header", key: string): string {
  return `${ENV_REF_PLACEHOLDER_PREFIX}:${kind}:${encodeURIComponent(key)}`
}

function getMcpRegistryMetadata(
  config: McpServerConfig,
): McpRegistryConfigMetadata | undefined {
  const metadata = config._locusMcpRegistry
  if (!isRecord(metadata)) return undefined
  if (
    typeof metadata.providerId !== "string" ||
    typeof metadata.entryId !== "string" ||
    typeof metadata.targetId !== "string" ||
    typeof metadata.runtime !== "string" ||
    typeof metadata.status !== "string" ||
    typeof metadata.entryFingerprint !== "string" ||
    typeof metadata.configFingerprint !== "string" ||
    typeof metadata.installedAt !== "string"
  ) {
    return undefined
  }
  return metadata as unknown as McpRegistryConfigMetadata
}

export function isMcpRegistryServerInactiveForRuntime(
  config: McpServerConfig,
): boolean {
  return (
    resolveMcpRegistryRuntimeLocalStateFromConfig({ config })?.status ===
    "installed-needs-setup"
  )
}

export function encryptedMcpRegistrySetupValue(input: {
  kind: McpRegistrySecretKind
  key: string
  value: string
}): { configValue: string; encryptedValue: string } {
  return {
    configValue: placeholder(input.kind, input.key),
    encryptedValue: encryptStringForStorage(input.value),
  }
}

export function mcpRegistryEnvRefSetupValue(input: {
  kind: "env" | "header"
  key: string
}): string {
  return envRefPlaceholder(input.kind, input.key)
}

function decryptSetupMap(
  value: Record<string, string> | undefined,
): Record<string, string> {
  if (!value) return {}
  const decrypted: Record<string, string> = {}
  for (const [key, encrypted] of Object.entries(value)) {
    const plain = decryptStringFromStorage(encrypted)
    if (plain) decrypted[key] = plain
  }
  return decrypted
}

function resolveEnvVarRefs(
  refs: Record<string, string> | undefined,
  env: NodeJS.ProcessEnv,
): Record<string, string> {
  if (!refs) return {}
  const resolved: Record<string, string> = {}
  for (const [targetKey, envName] of Object.entries(refs)) {
    const value = env[envName]?.trim()
    if (value) resolved[targetKey] = value
  }
  return resolved
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function applyVariablesToTemplate(
  value: string | undefined,
  variables: Record<string, string>,
  options: { urlEncode: boolean },
): string | undefined {
  if (!value) return undefined
  let next = value
  for (const [key, rawValue] of Object.entries(variables)) {
    const replacement = options.urlEncode
      ? encodeURIComponent(rawValue)
      : rawValue
    const escaped = escapeRegExp(key)
    next = next.replace(new RegExp(`\\{\\{${escaped}\\}\\}`, "g"), replacement)
    next = next.replace(new RegExp(`\\{${escaped}\\}`, "g"), replacement)
    next = next.replace(new RegExp(`\\$\\{${escaped}\\}`, "g"), replacement)
  }
  return next
}

function stripLocusRegistryMetadata(config: McpServerConfig): McpServerConfig {
  const { _locusMcpRegistry: _metadata, ...rest } = config
  return rest
}

export function materializeMcpRegistryServerConfigForRuntime(
  config: McpServerConfig,
  options: {
    env?: NodeJS.ProcessEnv
    stripMetadata?: boolean
  } = {},
): McpServerConfig {
  const metadata = getMcpRegistryMetadata(config)
  if (!metadata)
    return options.stripMetadata ? stripLocusRegistryMetadata(config) : config

  const processEnv = options.env ?? process.env
  const encryptedSetup = metadata.encryptedSetup
  const encryptedEnv = decryptSetupMap(encryptedSetup?.env)
  const encryptedHeaders = decryptSetupMap(encryptedSetup?.headers)
  const encryptedVariables = decryptSetupMap(encryptedSetup?.variables)
  const envRefs = resolveEnvVarRefs(metadata.envVarRefs?.env, processEnv)
  const headerRefs = resolveEnvVarRefs(metadata.envVarRefs?.headers, processEnv)
  const variableRefs = resolveEnvVarRefs(
    metadata.envVarRefs?.variables,
    processEnv,
  )
  const bearerRefs = resolveEnvVarRefs(
    metadata.envVarRefs?.bearerTokenEnvRefs,
    processEnv,
  )
  const bearerHeaders = Object.fromEntries(
    Object.entries(bearerRefs).map(([headerName, token]) => [
      headerName,
      `Bearer ${token}`,
    ]),
  )
  const resolvedVariables = {
    ...variableRefs,
    ...encryptedVariables,
  }

  const next: McpServerConfig = {
    ...config,
    ...(metadata.templates?.url
      ? {
          url: applyVariablesToTemplate(
            metadata.templates.url,
            resolvedVariables,
            {
              urlEncode: true,
            },
          ),
        }
      : {}),
    ...(metadata.templates?.args
      ? {
          args: metadata.templates.args.map(
            (arg) =>
              applyVariablesToTemplate(arg, resolvedVariables, {
                urlEncode: false,
              }) ?? arg,
          ),
        }
      : {}),
    ...(metadata.templates?.cwd
      ? {
          cwd: applyVariablesToTemplate(
            metadata.templates.cwd,
            resolvedVariables,
            {
              urlEncode: false,
            },
          ),
        }
      : {}),
  }

  const mergedEnv = {
    ...((isRecord(config.env) ? config.env : {}) as Record<string, string>),
    ...envRefs,
    ...encryptedEnv,
  }
  const mergedHeaders = {
    ...((isRecord(config.headers) ? config.headers : {}) as Record<
      string,
      string
    >),
    ...headerRefs,
    ...bearerHeaders,
    ...encryptedHeaders,
  }

  if (Object.keys(mergedEnv).length > 0) next.env = mergedEnv
  if (Object.keys(mergedHeaders).length > 0) next.headers = mergedHeaders

  if (options.stripMetadata) {
    return stripLocusRegistryMetadata(next)
  }

  return next
}

function registryRuntimeFromMetadata(
  metadata: McpRegistryConfigMetadata,
): McpRegistryRuntimeLocalState["runtime"] {
  return metadata.runtime === "codex" ? "codex" : "claude-code"
}

export function getMcpRegistryVerificationKeyFromConfig(
  config: McpServerConfig,
  serverName: string,
): McpRegistryVerificationKeyInput | undefined {
  const metadata = getMcpRegistryMetadata(config)
  if (!metadata) return undefined
  return {
    runtime: registryRuntimeFromMetadata(metadata),
    serverName,
    entryFingerprint: metadata.entryFingerprint,
    configFingerprint: metadata.configFingerprint,
  }
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort()
}

function hasUnresolvedTemplateToken(value: string): boolean {
  return (
    /\{\{[A-Za-z_][A-Za-z0-9_]*\}\}/.test(value) ||
    /\{[A-Za-z_][A-Za-z0-9_]*\}/.test(value) ||
    /\$\{[A-Za-z_][A-Za-z0-9_]*\}/.test(value)
  )
}

function isUnresolvedSetupPlaceholder(value: unknown): boolean {
  return (
    typeof value === "string" &&
    (value.startsWith(SECRET_PLACEHOLDER_PREFIX) ||
      value.startsWith(ENV_REF_PLACEHOLDER_PREFIX))
  )
}

function unresolvedPlaceholderKeys(input: {
  config: McpServerConfig
  metadata: McpRegistryConfigMetadata
}): string[] {
  const missing: string[] = []
  for (const [key, value] of Object.entries(input.config.env ?? {})) {
    if (isUnresolvedSetupPlaceholder(value)) missing.push(`env:${key}`)
  }
  for (const [key, value] of Object.entries(input.config.headers ?? {})) {
    if (isUnresolvedSetupPlaceholder(value)) missing.push(`header:${key}`)
  }
  if (isUnresolvedSetupPlaceholder(input.config.bearerTokenEnvVar)) {
    missing.push("bearer-token-env:Authorization")
  }
  if (
    input.metadata.templates?.url &&
    typeof input.config.url === "string" &&
    input.config.url === input.metadata.templates.url &&
    hasUnresolvedTemplateToken(input.config.url)
  ) {
    missing.push("variable:url")
  }
  if (input.metadata.templates?.args && Array.isArray(input.config.args)) {
    input.config.args.forEach((arg, index) => {
      if (
        typeof arg === "string" &&
        arg === input.metadata.templates?.args?.[index] &&
        hasUnresolvedTemplateToken(arg)
      ) {
        missing.push(`variable:args:${index}`)
      }
    })
  }
  if (
    input.metadata.templates?.cwd &&
    typeof input.config.cwd === "string" &&
    input.config.cwd === input.metadata.templates.cwd &&
    hasUnresolvedTemplateToken(input.config.cwd)
  ) {
    missing.push("variable:cwd")
  }
  return uniqueSorted(missing)
}

export function resolveMcpRegistryRuntimeLocalStateFromConfig(input: {
  config: McpServerConfig
  env?: NodeJS.ProcessEnv
}): McpRegistryRuntimeLocalState | undefined {
  const metadata = getMcpRegistryMetadata(input.config)
  if (!metadata) return undefined
  if (
    metadata.status !== "installed-unverified" &&
    metadata.status !== "installed-needs-setup" &&
    metadata.status !== "ready-to-verify" &&
    metadata.status !== "connected-unverified" &&
    metadata.status !== "failed-check" &&
    metadata.status !== "verified-local"
  ) {
    return undefined
  }

  const runtime = registryRuntimeFromMetadata(metadata)
  if (metadata.status !== "installed-needs-setup") {
    return { runtime, status: metadata.status }
  }

  const materialized = materializeMcpRegistryServerConfigForRuntime(
    input.config,
    { env: input.env },
  )
  const missingKeys = uniqueSorted([
    ...(metadata.missingSetupKeys ?? []),
    ...unresolvedPlaceholderKeys({ config: materialized, metadata }),
    ...(input.config.disabled === true ? ["disabled"] : []),
  ])

  return {
    runtime,
    status:
      missingKeys.length > 0 ? "installed-needs-setup" : "ready-to-verify",
    ...(missingKeys.length > 0
      ? { reason: `missing setup: ${missingKeys.join(", ")}` }
      : {}),
  }
}

export function createMcpRegistrySetupMetadata(input: {
  encryptedSetup?: Omit<McpRegistryEncryptedSetup, "version">
  envVarRefs?: McpRegistryEnvVarRefs
  templates?: McpRegistryTemplateValues
}): Pick<
  McpRegistryConfigMetadata,
  "encryptedSetup" | "envVarRefs" | "templates"
> {
  const encryptedEnv = nonEmptyRecord(input.encryptedSetup?.env ?? {})
  const encryptedHeaders = nonEmptyRecord(input.encryptedSetup?.headers ?? {})
  const encryptedVariables = nonEmptyRecord(
    input.encryptedSetup?.variables ?? {},
  )
  const envVarRefs = {
    ...(input.envVarRefs?.env && Object.keys(input.envVarRefs.env).length > 0
      ? { env: input.envVarRefs.env }
      : {}),
    ...(input.envVarRefs?.headers &&
    Object.keys(input.envVarRefs.headers).length > 0
      ? { headers: input.envVarRefs.headers }
      : {}),
    ...(input.envVarRefs?.variables &&
    Object.keys(input.envVarRefs.variables).length > 0
      ? { variables: input.envVarRefs.variables }
      : {}),
    ...(input.envVarRefs?.bearerTokenEnvRefs &&
    Object.keys(input.envVarRefs.bearerTokenEnvRefs).length > 0
      ? { bearerTokenEnvRefs: input.envVarRefs.bearerTokenEnvRefs }
      : {}),
  }
  return {
    ...(encryptedEnv || encryptedHeaders || encryptedVariables
      ? {
          encryptedSetup: {
            version: 1,
            ...(encryptedEnv ? { env: encryptedEnv } : {}),
            ...(encryptedHeaders ? { headers: encryptedHeaders } : {}),
            ...(encryptedVariables ? { variables: encryptedVariables } : {}),
          },
        }
      : {}),
    ...(Object.keys(envVarRefs).length > 0 ? { envVarRefs } : {}),
    ...(input.templates &&
    (input.templates.url || input.templates.args?.length || input.templates.cwd)
      ? { templates: input.templates }
      : {}),
  }
}

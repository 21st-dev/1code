import {
  OFFICIAL_MCP_REGISTRY_PROVIDER_ID,
  type OfficialMcpRegistryServerResponse,
} from "./official-provider"

export type McpRegistryTransportType =
  | "stdio"
  | "streamable_http"
  | "sse"
  | "http"
  | "unknown"

export type McpRegistryRuntimeSupport =
  | "claude-code"
  | "codex"
  | "runtime-neutral"
  | "unknown"

export type McpRegistrySetupFieldSource = "env" | "header" | "variable"

export type McpRegistrySetupField = {
  name: string
  source: McpRegistrySetupFieldSource
  description?: string
  required: boolean
  secret: boolean
  format?: string
  defaultValue?: string
  placeholder?: string
  choices: string[]
}

export type McpRegistryAuthMetadata = {
  kind: "none" | "header" | "bearer" | "oauth" | "unknown"
  required: boolean
  headerNames: string[]
  envNames: string[]
}

export type McpRegistryPackageDistribution = {
  registryType?: string
  registryBaseUrl?: string
  identifier?: string
  version?: string
  fileSha256?: string
  runtimeHint?: string
}

export type McpRegistryInstallTarget = {
  id: string
  source: "package" | "remote"
  transport: McpRegistryTransportType
  commandTemplate?: string
  urlTemplate?: string
  args: string[]
  runtimeArguments: string[]
  packageArguments: string[]
  cwd?: string
  packageDistribution?: McpRegistryPackageDistribution
  envSchema: McpRegistrySetupField[]
  headerSchema: McpRegistrySetupField[]
  variableSchema: McpRegistrySetupField[]
  authMetadata: McpRegistryAuthMetadata
  declaredRuntimeSupport: McpRegistryRuntimeSupport[]
}

export type McpRegistryEntry = {
  providerId: typeof OFFICIAL_MCP_REGISTRY_PROVIDER_ID
  entryId: string
  name: string
  title?: string
  description?: string
  versionRef: string
  sourceUrl?: string
  websiteUrl?: string
  repository?: {
    url?: string
    source?: string
    id?: string
    subfolder?: string
  }
  officialMetadata?: Record<string, unknown>
  publisherMetadata?: Record<string, unknown>
  declaredRuntimeSupport: McpRegistryRuntimeSupport[]
  installTargets: McpRegistryInstallTarget[]
}

type AnyRecord = Record<string, unknown>

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function stringValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function booleanValue(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value
  return undefined
}

function recordArray(value: unknown): AnyRecord[] {
  if (!Array.isArray(value)) return []
  return value.filter(isRecord)
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => stringValue(item))
    .filter((item): item is string => Boolean(item))
}

function normalizeTransport(value: unknown): McpRegistryTransportType {
  const normalized = stringValue(value)?.toLowerCase().replaceAll("-", "_")
  if (normalized === "stdio") return "stdio"
  if (normalized === "streamable_http") return "streamable_http"
  if (normalized === "sse") return "sse"
  if (normalized === "http") return "http"
  return "unknown"
}

function normalizeRuntimeSupportValue(
  value: string,
): McpRegistryRuntimeSupport | null {
  const normalized = value.toLowerCase().replaceAll("_", "-")
  if (normalized === "claude" || normalized === "claude-code") {
    return "claude-code"
  }
  if (normalized === "codex" || normalized === "codex-cli") return "codex"
  if (normalized === "all" || normalized === "any") return "runtime-neutral"
  return null
}

function normalizeDeclaredRuntimeSupport(
  server: AnyRecord,
): McpRegistryRuntimeSupport[] {
  const compatibility = isRecord(server.compatibility)
    ? server.compatibility
    : undefined
  const values = [
    ...stringArray(compatibility?.runtimes),
    ...stringArray(server.runtimes),
    ...stringArray(server.runtimeSupport),
    ...stringArray(server.runtime_support),
  ]
    .map(normalizeRuntimeSupportValue)
    .filter((value): value is McpRegistryRuntimeSupport => Boolean(value))

  return values.length > 0 ? [...new Set(values)].sort() : ["unknown"]
}

function isSensitiveName(value: string): boolean {
  return /(?:^|[_-])(api[_-]?key|auth|authorization|bearer|password|secret|token)(?:$|[_-])/i.test(
    value,
  )
}

function normalizeSetupFields(
  value: unknown,
  source: McpRegistrySetupFieldSource,
): McpRegistrySetupField[] {
  return recordArray(value)
    .map((field) => {
      const name = stringValue(field.name)
      if (!name) return null
      const secret = booleanValue(field.isSecret) ?? isSensitiveName(name)
      const required = booleanValue(field.isRequired) ?? false
      return {
        name,
        source,
        ...(stringValue(field.description)
          ? { description: stringValue(field.description) }
          : {}),
        required,
        secret,
        ...(stringValue(field.format)
          ? { format: stringValue(field.format) }
          : {}),
        ...(stringValue(field.value) || stringValue(field.default)
          ? {
              defaultValue:
                stringValue(field.value) ?? stringValue(field.default),
            }
          : {}),
        ...(stringValue(field.placeholder)
          ? { placeholder: stringValue(field.placeholder) }
          : {}),
        choices: stringArray(field.choices),
      }
    })
    .filter((field): field is McpRegistrySetupField => Boolean(field))
}

function normalizeArgumentValues(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (typeof item === "string") return stringValue(item)
      if (isRecord(item)) {
        return (
          stringValue(item.value) ??
          stringValue(item.default) ??
          stringValue(item.name)
        )
      }
      return undefined
    })
    .filter((item): item is string => Boolean(item))
}

function metadataRecord(
  value: unknown,
  key: string,
): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined
  const nested = value[key]
  return isRecord(nested) ? nested : undefined
}

function inferAuthMetadata(input: {
  headerSchema: McpRegistrySetupField[]
  envSchema: McpRegistrySetupField[]
  raw?: AnyRecord
}): McpRegistryAuthMetadata {
  const headerNames = input.headerSchema.map((field) => field.name)
  const envNames = input.envSchema.map((field) => field.name)
  const required =
    input.headerSchema.some((field) => field.required) ||
    input.envSchema.some((field) => field.required)
  const authType =
    stringValue(input.raw?.authType) ??
    stringValue(input.raw?.auth_type) ??
    stringValue(input.raw?.auth)
  const normalizedAuthType = authType?.toLowerCase()

  if (normalizedAuthType?.includes("oauth")) {
    return { kind: "oauth", required: true, headerNames, envNames }
  }
  if (
    headerNames.some((name) => name.toLowerCase() === "authorization") ||
    headerNames.some((name) => /bearer/i.test(name))
  ) {
    return { kind: "bearer", required, headerNames, envNames }
  }
  if (headerNames.length > 0) {
    return { kind: "header", required, headerNames, envNames }
  }
  if (required) {
    return { kind: "unknown", required, headerNames, envNames }
  }
  return { kind: "none", required: false, headerNames, envNames }
}

function normalizePackageDistribution(
  value: AnyRecord,
): McpRegistryPackageDistribution {
  return {
    ...(stringValue(value.registryType)
      ? { registryType: stringValue(value.registryType) }
      : {}),
    ...(stringValue(value.registryBaseUrl)
      ? { registryBaseUrl: stringValue(value.registryBaseUrl) }
      : {}),
    ...(stringValue(value.identifier)
      ? { identifier: stringValue(value.identifier) }
      : {}),
    ...(stringValue(value.version)
      ? { version: stringValue(value.version) }
      : {}),
    ...(stringValue(value.fileSha256)
      ? { fileSha256: stringValue(value.fileSha256) }
      : {}),
    ...(stringValue(value.runtimeHint)
      ? { runtimeHint: stringValue(value.runtimeHint) }
      : {}),
  }
}

function normalizePackageTargets(input: {
  server: AnyRecord
  declaredRuntimeSupport: McpRegistryRuntimeSupport[]
}): McpRegistryInstallTarget[] {
  return recordArray(input.server.packages).map((pkg, index) => {
    const transport = isRecord(pkg.transport) ? pkg.transport : {}
    const runtimeArguments = normalizeArgumentValues(pkg.runtimeArguments)
    const packageArguments = normalizeArgumentValues(pkg.packageArguments)
    const envSchema = normalizeSetupFields(pkg.environmentVariables, "env")
    const packageDistribution = normalizePackageDistribution(pkg)
    const packageId =
      packageDistribution.identifier ??
      packageDistribution.registryType ??
      `package-${index}`

    return {
      id: `package:${packageId}:${index}`,
      source: "package",
      transport: normalizeTransport(transport.type),
      ...(packageDistribution.runtimeHint
        ? { commandTemplate: packageDistribution.runtimeHint }
        : {}),
      args: [...runtimeArguments, ...packageArguments],
      runtimeArguments,
      packageArguments,
      ...(stringValue(pkg.cwd) ? { cwd: stringValue(pkg.cwd) } : {}),
      packageDistribution,
      envSchema,
      headerSchema: [],
      variableSchema: [],
      authMetadata: inferAuthMetadata({
        headerSchema: [],
        envSchema,
        raw: pkg,
      }),
      declaredRuntimeSupport: input.declaredRuntimeSupport,
    }
  })
}

function normalizeRemoteTargets(input: {
  server: AnyRecord
  declaredRuntimeSupport: McpRegistryRuntimeSupport[]
}): McpRegistryInstallTarget[] {
  return recordArray(input.server.remotes).map((remote, index) => {
    const headerSchema = normalizeSetupFields(remote.headers, "header")
    const variableSchema = normalizeSetupFields(remote.variables, "variable")
    const envSchema: McpRegistrySetupField[] = []

    return {
      id: `remote:${normalizeTransport(remote.type)}:${index}`,
      source: "remote",
      transport: normalizeTransport(remote.type),
      ...(stringValue(remote.url)
        ? { urlTemplate: stringValue(remote.url) }
        : {}),
      args: [],
      runtimeArguments: [],
      packageArguments: [],
      envSchema,
      headerSchema,
      variableSchema,
      authMetadata: inferAuthMetadata({ headerSchema, envSchema, raw: remote }),
      declaredRuntimeSupport: input.declaredRuntimeSupport,
    }
  })
}

export function normalizeOfficialMcpRegistryEntry(
  response: OfficialMcpRegistryServerResponse,
): McpRegistryEntry {
  const server = response.server
  const name = stringValue(server.name)
  if (!name) {
    throw new Error("Official MCP registry entry is missing server.name.")
  }

  const repository = isRecord(server.repository) ? server.repository : undefined
  const serverMeta = isRecord(server._meta) ? server._meta : undefined
  const officialMetadata = metadataRecord(
    response._meta,
    "io.modelcontextprotocol.registry/official",
  )
  const publisherMetadata = metadataRecord(
    serverMeta,
    "io.modelcontextprotocol.registry/publisher-provided",
  )
  const declaredRuntimeSupport = normalizeDeclaredRuntimeSupport(server)
  const installTargets = [
    ...normalizePackageTargets({ server, declaredRuntimeSupport }),
    ...normalizeRemoteTargets({ server, declaredRuntimeSupport }),
  ]

  return {
    providerId: OFFICIAL_MCP_REGISTRY_PROVIDER_ID,
    entryId: name,
    name,
    ...(stringValue(server.title) ? { title: stringValue(server.title) } : {}),
    ...(stringValue(server.description)
      ? { description: stringValue(server.description) }
      : {}),
    versionRef: stringValue(server.version) ?? "latest",
    ...(stringValue(repository?.url) || stringValue(server.websiteUrl)
      ? {
          sourceUrl:
            stringValue(repository?.url) ?? stringValue(server.websiteUrl),
        }
      : {}),
    ...(stringValue(server.websiteUrl)
      ? { websiteUrl: stringValue(server.websiteUrl) }
      : {}),
    ...(repository
      ? {
          repository: {
            ...(stringValue(repository.url)
              ? { url: stringValue(repository.url) }
              : {}),
            ...(stringValue(repository.source)
              ? { source: stringValue(repository.source) }
              : {}),
            ...(stringValue(repository.id)
              ? { id: stringValue(repository.id) }
              : {}),
            ...(stringValue(repository.subfolder)
              ? { subfolder: stringValue(repository.subfolder) }
              : {}),
          },
        }
      : {}),
    ...(officialMetadata ? { officialMetadata } : {}),
    ...(publisherMetadata ? { publisherMetadata } : {}),
    declaredRuntimeSupport,
    installTargets,
  }
}

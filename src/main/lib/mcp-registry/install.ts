import type { McpServerConfig } from "../claude-config"
import type { McpRegistryRuntimeId } from "./installability"
import { previewMcpRegistryRuntimeInstallability } from "./installability"
import type {
  McpRegistryEntry,
  McpRegistryInstallTarget,
  McpRegistrySetupField,
} from "./normalize"
import { buildMcpRegistryInstallPreview } from "./preview"
import {
  createMcpRegistrySetupMetadata,
  encryptedMcpRegistrySetupValue,
  type McpRegistryEncryptedSetup,
  type McpRegistryEnvVarRefs,
  type McpRegistryTemplateValues,
  mcpRegistryEnvRefSetupValue,
} from "./secrets"
import {
  classifyMcpRegistrySetup,
  getResolvedSetupEnvVar,
  getResolvedSetupPlainValue,
  type McpRegistrySetupResolutionInput,
} from "./setup"
import { upsertMcpRegistryVerificationRecord } from "./verification-state"

type ClaudeMcpConfigWriter = (input: {
  name: string
  scope: "global" | "project"
  projectPath?: string
  config: McpServerConfig
}) => Promise<{ success: true; name: string }>

type CodexMcpConfigWriter = (input: {
  name: string
  scope: "global" | "project"
  projectPath?: string
  config: McpServerConfig
}) => Promise<{ success: true; name: string }>

async function defaultWriteClaudeConfig(
  input: Parameters<ClaudeMcpConfigWriter>[0],
): ReturnType<ClaudeMcpConfigWriter> {
  const { writeClaudeMcpServerConfig } = await import(
    "../runtime-mcp-config/claude"
  )
  const result = await writeClaudeMcpServerConfig(input)
  return { success: true, name: result.name }
}

async function defaultWriteCodexConfig(
  input: Parameters<CodexMcpConfigWriter>[0],
): ReturnType<CodexMcpConfigWriter> {
  const { writeCodexMcpServerConfig } = await import(
    "../runtime-mcp-config/codex"
  )
  const result = await writeCodexMcpServerConfig(input)
  return { success: true, name: result.name }
}

export type McpRegistryInstallInput = {
  entry: McpRegistryEntry
  target: McpRegistryInstallTarget
  runtime: McpRegistryRuntimeId
  scope: "global" | "project"
  projectPath?: string
  installName?: string
  resolvedSetup?: McpRegistrySetupResolutionInput
  writeClaudeConfig?: ClaudeMcpConfigWriter
  writeCodexConfig?: CodexMcpConfigWriter
}

export type McpRegistryInstallResult = {
  success: true
  runtime: McpRegistryRuntimeId
  serverName: string
  status: "installed-unverified" | "installed-needs-setup"
  entryFingerprint: string
  configFingerprint: string
}

function suggestMcpServerName(entry: McpRegistryEntry): string {
  const candidate = entry.name.split("/").at(-1) || entry.entryId
  const normalized = candidate
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
  return normalized || "registry_server"
}

function nonEmptyRecord<T>(
  value: Record<string, T>,
): Record<string, T> | undefined {
  return Object.keys(value).length > 0 ? value : undefined
}

function fieldByName(
  fields: McpRegistrySetupField[],
): Map<string, McpRegistrySetupField> {
  return new Map(fields.map((field) => [field.name, field]))
}

function resolvedSetupValueForField(input: {
  field: McpRegistrySetupField
  resolvedSetup: McpRegistrySetupResolutionInput | undefined
  source: "env" | "header" | "variable"
}): {
  value?: string
  envVar?: string
} {
  const resolved =
    input.source === "env"
      ? input.resolvedSetup?.env?.[input.field.name]
      : input.source === "header"
        ? input.resolvedSetup?.headers?.[input.field.name]
        : input.resolvedSetup?.variables?.[input.field.name]
  const value = getResolvedSetupPlainValue(resolved)
  const envVar = getResolvedSetupEnvVar(resolved)
  return {
    ...(value ? { value } : {}),
    ...(envVar ? { envVar } : {}),
  }
}

function resolveSetupMap(input: {
  fields: McpRegistrySetupField[]
  resolvedSetup: McpRegistrySetupResolutionInput | undefined
  source: "env" | "header"
  encryptedKind: "env" | "header"
}): {
  configValues: Record<string, string>
  encryptedValues: Record<string, string>
  envVarRefs: Record<string, string>
} {
  const configValues: Record<string, string> = {}
  const encryptedValues: Record<string, string> = {}
  const envVarRefs: Record<string, string> = {}

  for (const field of input.fields) {
    const resolved = resolvedSetupValueForField({
      field,
      resolvedSetup: input.resolvedSetup,
      source: input.source,
    })
    if (resolved.envVar) {
      configValues[field.name] = mcpRegistryEnvRefSetupValue({
        kind: input.source,
        key: field.name,
      })
      envVarRefs[field.name] = resolved.envVar
      continue
    }
    if (!resolved.value) continue

    if (field.secret) {
      const encrypted = encryptedMcpRegistrySetupValue({
        kind: input.encryptedKind,
        key: field.name,
        value: resolved.value,
      })
      configValues[field.name] = encrypted.configValue
      encryptedValues[field.name] = encrypted.encryptedValue
      continue
    }

    configValues[field.name] = resolved.value
  }

  return { configValues, encryptedValues, envVarRefs }
}

function resolveCodexSetupMap(input: {
  fields: McpRegistrySetupField[]
  resolvedSetup: McpRegistrySetupResolutionInput | undefined
  source: "env" | "header"
}): {
  configValues: Record<string, string>
  envVarRefs: Record<string, string>
} {
  const configValues: Record<string, string> = {}
  const envVarRefs: Record<string, string> = {}

  for (const field of input.fields) {
    const resolved = resolvedSetupValueForField({
      field,
      resolvedSetup: input.resolvedSetup,
      source: input.source,
    })
    if (resolved.envVar) {
      envVarRefs[field.name] = resolved.envVar
      continue
    }
    if (resolved.value) {
      configValues[field.name] = resolved.value
    }
  }

  return { configValues, envVarRefs }
}

function resolveVariableValues(input: {
  target: McpRegistryInstallTarget
  resolvedSetup: McpRegistrySetupResolutionInput | undefined
}): {
  plainVariables: Record<string, string>
  encryptedVariables: Record<string, string>
  envVarRefs: Record<string, string>
  hasRuntimeVariables: boolean
} {
  const plainVariables: Record<string, string> = {}
  const encryptedVariables: Record<string, string> = {}
  const envVarRefs: Record<string, string> = {}

  for (const field of input.target.variableSchema) {
    const resolved = resolvedSetupValueForField({
      field,
      resolvedSetup: input.resolvedSetup,
      source: "variable",
    })
    if (resolved.envVar) {
      envVarRefs[field.name] = resolved.envVar
      continue
    }
    if (!resolved.value) continue
    if (field.secret) {
      const encrypted = encryptedMcpRegistrySetupValue({
        kind: "variable",
        key: field.name,
        value: resolved.value,
      })
      encryptedVariables[field.name] = encrypted.encryptedValue
    } else {
      plainVariables[field.name] = resolved.value
    }
  }

  return {
    plainVariables,
    encryptedVariables,
    envVarRefs,
    hasRuntimeVariables:
      Object.keys(encryptedVariables).length > 0 ||
      Object.keys(envVarRefs).length > 0,
  }
}

function resolveCodexVariableValues(input: {
  target: McpRegistryInstallTarget
  resolvedSetup: McpRegistrySetupResolutionInput | undefined
}): {
  plainVariables: Record<string, string>
  envVarRefs: Record<string, string>
} {
  const plainVariables: Record<string, string> = {}
  const envVarRefs: Record<string, string> = {}

  for (const field of input.target.variableSchema) {
    const resolved = resolvedSetupValueForField({
      field,
      resolvedSetup: input.resolvedSetup,
      source: "variable",
    })
    if (resolved.envVar) {
      envVarRefs[field.name] = resolved.envVar
      continue
    }
    if (resolved.value) {
      plainVariables[field.name] = resolved.value
    }
  }

  return { plainVariables, envVarRefs }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function applyVariablesToTemplate(input: {
  value: string | undefined
  variables: Record<string, string>
  urlEncode: boolean
}): string | undefined {
  if (!input.value) return undefined
  let next = input.value
  for (const [key, rawValue] of Object.entries(input.variables)) {
    const replacement = input.urlEncode
      ? encodeURIComponent(rawValue)
      : rawValue
    const escaped = escapeRegExp(key)
    next = next.replace(new RegExp(`\\{\\{${escaped}\\}\\}`, "g"), replacement)
    next = next.replace(new RegExp(`\\{${escaped}\\}`, "g"), replacement)
    next = next.replace(new RegExp(`\\$\\{${escaped}\\}`, "g"), replacement)
  }
  return next
}

function materializeClaudeMcpConfig(input: {
  target: McpRegistryInstallTarget
  resolvedSetup?: McpRegistrySetupResolutionInput
}): {
  config: McpServerConfig
  encryptedSetup?: Omit<McpRegistryEncryptedSetup, "version">
  envVarRefs?: McpRegistryEnvVarRefs
  templates?: McpRegistryTemplateValues
} {
  const target = input.target
  const envSetup = resolveSetupMap({
    fields: target.envSchema,
    resolvedSetup: input.resolvedSetup,
    source: "env",
    encryptedKind: "env",
  })
  const headerSetup = resolveSetupMap({
    fields: target.headerSchema,
    resolvedSetup: input.resolvedSetup,
    source: "header",
    encryptedKind: "header",
  })
  const variableSetup = resolveVariableValues({
    target,
    resolvedSetup: input.resolvedSetup,
  })
  const templates: McpRegistryTemplateValues = {}

  let urlTemplate = target.urlTemplate
  let args = target.args
  let cwd = target.cwd
  urlTemplate = applyVariablesToTemplate({
    value: urlTemplate,
    variables: variableSetup.plainVariables,
    urlEncode: true,
  })
  args = args.map(
    (arg) =>
      applyVariablesToTemplate({
        value: arg,
        variables: variableSetup.plainVariables,
        urlEncode: false,
      }) ?? arg,
  )
  cwd = applyVariablesToTemplate({
    value: cwd,
    variables: variableSetup.plainVariables,
    urlEncode: false,
  })

  if (variableSetup.hasRuntimeVariables) {
    if (urlTemplate) templates.url = urlTemplate
    if (args.length > 0) templates.args = args
    if (cwd) templates.cwd = cwd
  }

  if (target.transport === "stdio") {
    if (!target.commandTemplate) {
      throw new Error("Registry target is missing a stdio command.")
    }
    return {
      config: {
        command: target.commandTemplate,
        ...(args.length > 0 ? { args } : {}),
        ...(cwd ? { cwd } : {}),
        ...(Object.keys(envSetup.configValues).length > 0
          ? { env: envSetup.configValues }
          : {}),
        transportType: target.transport,
      },
      encryptedSetup: {
        ...(nonEmptyRecord(envSetup.encryptedValues)
          ? { env: envSetup.encryptedValues }
          : {}),
        ...(nonEmptyRecord(variableSetup.encryptedVariables)
          ? { variables: variableSetup.encryptedVariables }
          : {}),
      },
      envVarRefs: {
        ...(nonEmptyRecord(envSetup.envVarRefs)
          ? { env: envSetup.envVarRefs }
          : {}),
        ...(nonEmptyRecord(variableSetup.envVarRefs)
          ? { variables: variableSetup.envVarRefs }
          : {}),
      },
      templates,
    }
  }

  if (
    target.transport === "http" ||
    target.transport === "sse" ||
    target.transport === "streamable_http"
  ) {
    if (!urlTemplate) {
      throw new Error("Registry target is missing a remote URL.")
    }
    const headerFields = fieldByName(target.headerSchema)
    const bearerTokenEnvRefs: Record<string, string> = {}
    for (const [headerName, envName] of Object.entries(
      input.resolvedSetup?.bearerTokenEnvRefs ?? {},
    )) {
      if (!envName?.trim()) continue
      if (!headerFields.has(headerName)) continue
      bearerTokenEnvRefs[headerName] = envName.trim()
    }
    return {
      config: {
        url: urlTemplate,
        ...(target.authMetadata.kind === "oauth" ? { authType: "oauth" } : {}),
        ...(target.authMetadata.kind === "bearer"
          ? { authType: "bearer" }
          : {}),
        ...(Object.keys(headerSetup.configValues).length > 0
          ? { headers: headerSetup.configValues }
          : {}),
        ...(bearerTokenEnvRefs.Authorization
          ? { bearerTokenEnvVar: bearerTokenEnvRefs.Authorization }
          : {}),
        transportType: target.transport,
      },
      encryptedSetup: {
        ...(nonEmptyRecord(headerSetup.encryptedValues)
          ? { headers: headerSetup.encryptedValues }
          : {}),
        ...(nonEmptyRecord(variableSetup.encryptedVariables)
          ? { variables: variableSetup.encryptedVariables }
          : {}),
      },
      envVarRefs: {
        ...(nonEmptyRecord(headerSetup.envVarRefs)
          ? { headers: headerSetup.envVarRefs }
          : {}),
        ...(nonEmptyRecord(variableSetup.envVarRefs)
          ? { variables: variableSetup.envVarRefs }
          : {}),
        ...(nonEmptyRecord(bearerTokenEnvRefs) ? { bearerTokenEnvRefs } : {}),
      },
      templates,
    }
  }

  throw new Error(`Unsupported registry target transport: ${target.transport}`)
}

function materializeCodexMcpConfig(input: {
  target: McpRegistryInstallTarget
  resolvedSetup?: McpRegistrySetupResolutionInput
}): McpServerConfig {
  const target = input.target
  const envSetup = resolveCodexSetupMap({
    fields: target.envSchema,
    resolvedSetup: input.resolvedSetup,
    source: "env",
  })
  const headerSetup = resolveCodexSetupMap({
    fields: target.headerSchema,
    resolvedSetup: input.resolvedSetup,
    source: "header",
  })
  const variableSetup = resolveCodexVariableValues({
    target,
    resolvedSetup: input.resolvedSetup,
  })
  if (Object.keys(variableSetup.envVarRefs).length > 0) {
    throw new Error(
      "Codex MCP registry install cannot materialize variable env references.",
    )
  }

  let urlTemplate = target.urlTemplate
  let args = target.args
  let cwd = target.cwd
  urlTemplate = applyVariablesToTemplate({
    value: urlTemplate,
    variables: variableSetup.plainVariables,
    urlEncode: true,
  })
  args = args.map(
    (arg) =>
      applyVariablesToTemplate({
        value: arg,
        variables: variableSetup.plainVariables,
        urlEncode: false,
      }) ?? arg,
  )
  cwd = applyVariablesToTemplate({
    value: cwd,
    variables: variableSetup.plainVariables,
    urlEncode: false,
  })

  if (target.transport === "stdio") {
    if (!target.commandTemplate) {
      throw new Error("Registry target is missing a stdio command.")
    }
    return {
      command: target.commandTemplate,
      ...(args.length > 0 ? { args } : {}),
      ...(cwd ? { cwd } : {}),
      ...(nonEmptyRecord(envSetup.configValues)
        ? { env: envSetup.configValues }
        : {}),
      ...(nonEmptyRecord(envSetup.envVarRefs)
        ? { envVars: Object.values(envSetup.envVarRefs).sort() }
        : {}),
      transportType: target.transport,
    }
  }

  if (
    target.transport === "http" ||
    target.transport === "sse" ||
    target.transport === "streamable_http"
  ) {
    if (!urlTemplate) {
      throw new Error("Registry target is missing a remote URL.")
    }
    const headerFields = fieldByName(target.headerSchema)
    const bearerTokenEnvRefs: Record<string, string> = {}
    for (const [headerName, envName] of Object.entries(
      input.resolvedSetup?.bearerTokenEnvRefs ?? {},
    )) {
      if (!envName?.trim()) continue
      if (!headerFields.has(headerName)) continue
      bearerTokenEnvRefs[headerName] = envName.trim()
    }
    return {
      url: urlTemplate,
      ...(nonEmptyRecord(headerSetup.configValues)
        ? { headers: headerSetup.configValues }
        : {}),
      ...(nonEmptyRecord(headerSetup.envVarRefs)
        ? { envHttpHeaders: headerSetup.envVarRefs }
        : {}),
      ...(bearerTokenEnvRefs.Authorization
        ? { bearerTokenEnvVar: bearerTokenEnvRefs.Authorization }
        : {}),
      transportType: target.transport,
    }
  }

  throw new Error(`Unsupported registry target transport: ${target.transport}`)
}

export async function installMcpRegistryTarget(
  input: McpRegistryInstallInput,
): Promise<McpRegistryInstallResult> {
  const installability = previewMcpRegistryRuntimeInstallability({
    entry: input.entry,
    target: input.target,
    runtime: input.runtime,
    resolvedSetup: input.resolvedSetup,
  })
  if (!installability.installableConfig) {
    throw new Error("Registry target cannot be materialized for this runtime.")
  }

  const setup = classifyMcpRegistrySetup({
    runtime: input.runtime,
    target: input.target,
    resolved: input.resolvedSetup,
  })
  if (setup.missingSetupBehavior === "block-install") {
    throw new Error(
      `MCP registry target requires setup: ${setup.missingKeys.join(", ")}`,
    )
  }
  if (input.runtime === "codex" && setup.missingSetupBehavior !== "none") {
    throw new Error(
      `MCP registry target requires setup: ${setup.missingKeys.join(", ")}`,
    )
  }
  const installStatus =
    setup.missingSetupBehavior === "save-needs-setup"
      ? "installed-needs-setup"
      : "installed-unverified"

  const preview = buildMcpRegistryInstallPreview({
    entry: input.entry,
    target: input.target,
  })
  const serverName =
    input.installName?.trim() || suggestMcpServerName(input.entry)

  if (input.runtime === "codex") {
    const config = materializeCodexMcpConfig({
      target: input.target,
      resolvedSetup: input.resolvedSetup,
    })
    await (input.writeCodexConfig ?? defaultWriteCodexConfig)({
      name: serverName,
      scope: input.scope,
      projectPath: input.projectPath,
      config,
    })
    await upsertMcpRegistryVerificationRecord({
      runtime: input.runtime,
      serverName,
      status: "installed-unverified",
      entryFingerprint: preview.entryFingerprint,
      configFingerprint: preview.configFingerprint,
      reason: "installed-unverified",
    })
    return {
      success: true,
      runtime: input.runtime,
      serverName,
      status: "installed-unverified",
      entryFingerprint: preview.entryFingerprint,
      configFingerprint: preview.configFingerprint,
    }
  }

  const materialized = materializeClaudeMcpConfig({
    target: input.target,
    resolvedSetup: input.resolvedSetup,
  })
  const config: McpServerConfig = {
    ...materialized.config,
    ...(installStatus === "installed-needs-setup"
      ? {
          disabled: true,
          disabledReason: `MCP registry setup required: ${setup.missingKeys.join(", ")}`,
        }
      : {}),
    _locusMcpRegistry: {
      providerId: input.entry.providerId,
      entryId: input.entry.entryId,
      targetId: input.target.id,
      runtime: input.runtime,
      status: installStatus,
      entryFingerprint: preview.entryFingerprint,
      configFingerprint: preview.configFingerprint,
      installedAt: new Date().toISOString(),
      ...(setup.missingKeys.length > 0
        ? { missingSetupKeys: setup.missingKeys }
        : {}),
      ...createMcpRegistrySetupMetadata({
        encryptedSetup: materialized.encryptedSetup,
        envVarRefs: materialized.envVarRefs,
        templates: materialized.templates,
      }),
    },
  }

  await (input.writeClaudeConfig ?? defaultWriteClaudeConfig)({
    name: serverName,
    scope: input.scope,
    projectPath: input.projectPath,
    config,
  })

  return {
    success: true,
    runtime: input.runtime,
    serverName,
    status: installStatus,
    entryFingerprint: preview.entryFingerprint,
    configFingerprint: preview.configFingerprint,
  }
}

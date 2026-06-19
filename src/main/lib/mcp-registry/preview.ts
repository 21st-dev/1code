import {
  type McpImportPreviewArg,
  sanitizeMcpCommandArgs,
  sanitizeMcpUrlForPreview,
} from "../../../shared/mcp-import-preview"
import {
  classifyMcpRegistryProvenance,
  fingerprintMcpRegistryEntry,
  fingerprintMcpRegistryInstallTarget,
  type McpRegistryProvenanceClassification,
} from "./fingerprints"
import {
  type McpRegistryRuntimeId,
  type McpRegistryRuntimeInstallability,
  type McpRegistryRuntimeLocalState,
  previewDefaultMcpRegistryRuntimeInstallability,
} from "./installability"
import type {
  McpRegistryEntry,
  McpRegistryInstallTarget,
  McpRegistryRuntimeSupport,
  McpRegistrySetupField,
  McpRegistrySetupFieldSource,
  McpRegistryTransportType,
} from "./normalize"
import {
  classifyMcpRegistrySetup,
  type McpRegistrySetupClassification,
} from "./setup"

export type McpRegistryInstallPreviewSetupField = {
  key: string
  source: McpRegistrySetupFieldSource
  required: boolean
  secret: boolean
  hasDefaultValue: boolean
  redacted: true
  valuePreview: "<redacted>"
  description?: string
  format?: string
  placeholder?: string
  choices: string[]
}

export type McpRegistryInstallPreviewAuth = {
  kind: McpRegistryInstallTarget["authMetadata"]["kind"]
  required: boolean
  headerNames: string[]
  envNames: string[]
}

export type McpRegistryInstallPreview = {
  kind: "mcp-registry-install-preview"
  version: 1
  state: "pending"
  providerId: string
  entryId: string
  targetId: string
  serverName: string
  title?: string
  description?: string
  versionRef: string
  sourceUrl?: string
  targetSource: McpRegistryInstallTarget["source"]
  transport: McpRegistryTransportType
  command?: string
  url?: string
  args: McpImportPreviewArg[]
  cwd?: string
  env: McpRegistryInstallPreviewSetupField[]
  headers: McpRegistryInstallPreviewSetupField[]
  variables: McpRegistryInstallPreviewSetupField[]
  auth: McpRegistryInstallPreviewAuth
  declaredRuntimeSupport: McpRegistryRuntimeSupport[]
  provenance: McpRegistryProvenanceClassification
  entryFingerprint: string
  configFingerprint: string
  runtimeInstallability: McpRegistryRuntimeInstallability[]
  setupClassifications: McpRegistrySetupClassification[]
  wouldWritePaths: string[]
  warnings: string[]
}

function redactedSetupField(
  field: McpRegistrySetupField,
): McpRegistryInstallPreviewSetupField {
  return {
    key: field.name,
    source: field.source,
    required: field.required,
    secret: field.secret,
    hasDefaultValue: Boolean(field.defaultValue),
    redacted: true,
    valuePreview: "<redacted>",
    ...(field.description ? { description: field.description } : {}),
    ...(field.format ? { format: field.format } : {}),
    ...(field.placeholder ? { placeholder: field.placeholder } : {}),
    choices: field.choices,
  }
}

function buildWarnings(input: {
  entry: McpRegistryEntry
  provenance: McpRegistryProvenanceClassification
}): string[] {
  const warnings: string[] = []
  if (input.provenance.provenance === "mutable") {
    warnings.push("mutable-provenance")
  }
  if (input.provenance.provenance === "unknown") {
    warnings.push("unknown-provenance")
  }
  if (input.provenance.integrity === "missing") {
    warnings.push("integrity-missing")
  }
  if (input.provenance.reasons.includes("mutable-version-ref")) {
    warnings.push("mutable-version-ref")
  }
  if (input.provenance.reasons.includes("unknown-version-ref")) {
    warnings.push("unknown-version-ref")
  }
  if (input.entry.declaredRuntimeSupport.includes("unknown")) {
    warnings.push("declared-runtime-support-unknown")
  }
  return warnings
}

function sanitizeCommand(value: string | undefined): string | undefined {
  if (!value) return undefined
  return sanitizeMcpCommandArgs([value])[0]?.value
}

function previewDefaultMcpRegistrySetupClassifications(
  target: McpRegistryInstallTarget,
): McpRegistrySetupClassification[] {
  return (["claude-code", "codex"] as McpRegistryRuntimeId[]).map((runtime) =>
    classifyMcpRegistrySetup({ runtime, target }),
  )
}

export function buildMcpRegistryInstallPreview(input: {
  entry: McpRegistryEntry
  target: McpRegistryInstallTarget
  localStates?: McpRegistryRuntimeLocalState[]
}): McpRegistryInstallPreview {
  const provenance = classifyMcpRegistryProvenance(input.entry)
  const command = sanitizeCommand(input.target.commandTemplate)
  const url = sanitizeMcpUrlForPreview(input.target.urlTemplate)

  return {
    kind: "mcp-registry-install-preview",
    version: 1,
    state: "pending",
    providerId: input.entry.providerId,
    entryId: input.entry.entryId,
    targetId: input.target.id,
    serverName: input.entry.name,
    ...(input.entry.title ? { title: input.entry.title } : {}),
    ...(input.entry.description
      ? { description: input.entry.description }
      : {}),
    versionRef: input.entry.versionRef,
    ...(input.entry.sourceUrl ? { sourceUrl: input.entry.sourceUrl } : {}),
    targetSource: input.target.source,
    transport: input.target.transport,
    ...(command ? { command } : {}),
    ...(url ? { url } : {}),
    args: sanitizeMcpCommandArgs(input.target.args),
    ...(input.target.cwd ? { cwd: input.target.cwd } : {}),
    env: input.target.envSchema.map(redactedSetupField),
    headers: input.target.headerSchema.map(redactedSetupField),
    variables: input.target.variableSchema.map(redactedSetupField),
    auth: {
      kind: input.target.authMetadata.kind,
      required: input.target.authMetadata.required,
      headerNames: input.target.authMetadata.headerNames,
      envNames: input.target.authMetadata.envNames,
    },
    declaredRuntimeSupport: input.target.declaredRuntimeSupport,
    provenance,
    entryFingerprint: fingerprintMcpRegistryEntry(input.entry),
    configFingerprint: fingerprintMcpRegistryInstallTarget(input),
    runtimeInstallability: previewDefaultMcpRegistryRuntimeInstallability({
      entry: input.entry,
      target: input.target,
      localStates: input.localStates,
    }),
    setupClassifications: previewDefaultMcpRegistrySetupClassifications(
      input.target,
    ),
    wouldWritePaths: [],
    warnings: buildWarnings({ entry: input.entry, provenance }),
  }
}

export function buildMcpRegistryInstallPreviews(input: {
  entry: McpRegistryEntry
  localStates?: McpRegistryRuntimeLocalState[]
}): McpRegistryInstallPreview[] {
  return input.entry.installTargets.map((target) =>
    buildMcpRegistryInstallPreview({
      entry: input.entry,
      target,
      localStates: input.localStates,
    }),
  )
}

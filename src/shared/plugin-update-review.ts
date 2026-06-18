import type {
  PluginExecutionStatus,
  PluginRuntime,
  PluginTargetMode,
  PluginUpdatePosture,
} from "./plugin-target-modes"
import type { PluginControlledUiReviewDocument } from "./plugin-controlled-ui"
import type { PluginDeveloperTrustedReviewDocument } from "./plugin-developer-trusted"

export type PluginUpdateReviewStatus =
  | "new"
  | "unchanged"
  | "changed"
  | "reviewed"

export type PluginSourcePinKind =
  | "cache-version"
  | "lock-source-ref"
  | "store-git-commit"
  | "store-package-sha256"

export interface PluginSourcePin {
  kind: PluginSourcePinKind
  value: string
  label?: string
  repo?: string
  path?: string
}

export interface PluginManifestReviewDocument {
  schemaVersion: 1
  runtime: PluginRuntime
  source: string
  marketplace: string
  name: string
  version: string
  targetMode: PluginTargetMode
  executionStatus: PluginExecutionStatus
  updatePosture: PluginUpdatePosture
  category?: string
  homepage?: string
  tags: string[]
  componentPaths: {
    commands?: string
    skills?: string
    agents?: string
    mcpServers?: string
  }
  components: {
    commands: number
    skills: number
    agents: number
    mcpServers: string[]
  }
  controlledUi: PluginControlledUiReviewDocument
  developerTrusted: PluginDeveloperTrustedReviewDocument
  sourcePins: PluginSourcePin[]
}

export interface PluginReviewChange {
  field: string
  previous?: string
  current?: string
}

export type PluginRuntimeNativeActivationMissingIdentityField =
  | "package-identity"
  | "package-version"
  | "drift-detection-field"

export type PluginRuntimeNativeActivationIdentityStatus =
  | "complete"
  | "identity-incomplete"

export type PluginRuntimeNativeActivationReviewStatus =
  | "reviewed"
  | "identity-unreviewed"
  | "identity-incomplete"
  | "identity-drifted"

export interface PluginRuntimeNativeActivationReviewMetadata {
  identityFingerprint: string
  identityStatus: PluginRuntimeNativeActivationIdentityStatus
  reviewStatus: PluginRuntimeNativeActivationReviewStatus
  lastReviewedIdentityFingerprint?: string
  missingFields: PluginRuntimeNativeActivationMissingIdentityField[]
}

export interface PluginUpdateReviewMetadata {
  fingerprint: string
  status: PluginUpdateReviewStatus
  firstSeenAt?: string
  lastSeenAt?: string
  lastReviewedAt?: string
  lastReviewedFingerprint?: string
  runtimeNativeActivation?: PluginRuntimeNativeActivationReviewMetadata
  sourcePins: PluginSourcePin[]
  changes: PluginReviewChange[]
}

export function stableJsonStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value))
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue)
  }

  if (value && typeof value === "object") {
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(value).sort()) {
      const nested = (value as Record<string, unknown>)[key]
      if (nested !== undefined) {
        sorted[key] = sortJsonValue(nested)
      }
    }
    return sorted
  }

  return value
}

function normalizeList(values: string[] | undefined): string[] {
  return [...(values ?? [])].filter(Boolean).sort()
}

function normalizePins(pins: PluginSourcePin[] | undefined): PluginSourcePin[] {
  return [...(pins ?? [])]
    .filter((pin) => pin.value.trim().length > 0)
    .sort((a, b) => {
      const byKind = a.kind.localeCompare(b.kind)
      if (byKind !== 0) return byKind
      return a.value.localeCompare(b.value)
    })
}

export function buildPluginManifestReviewDocument(
  input: Omit<PluginManifestReviewDocument, "schemaVersion" | "tags" | "components" | "controlledUi" | "developerTrusted" | "sourcePins"> & {
    tags?: string[]
    components?: Partial<PluginManifestReviewDocument["components"]>
    controlledUi?: PluginControlledUiReviewDocument
    developerTrusted?: PluginDeveloperTrustedReviewDocument
    sourcePins?: PluginSourcePin[]
  },
): PluginManifestReviewDocument {
  return {
    schemaVersion: 1,
    runtime: input.runtime,
    source: input.source,
    marketplace: input.marketplace,
    name: input.name,
    version: input.version,
    targetMode: input.targetMode,
    executionStatus: input.executionStatus,
    updatePosture: input.updatePosture,
    category: input.category,
    homepage: input.homepage,
    tags: normalizeList(input.tags),
    componentPaths: {
      commands: input.componentPaths.commands,
      skills: input.componentPaths.skills,
      agents: input.componentPaths.agents,
      mcpServers: input.componentPaths.mcpServers,
    },
    components: {
      commands: input.components?.commands ?? 0,
      skills: input.components?.skills ?? 0,
      agents: input.components?.agents ?? 0,
      mcpServers: normalizeList(input.components?.mcpServers),
    },
    controlledUi: normalizeControlledUi(input.controlledUi),
    developerTrusted: normalizeDeveloperTrusted(input.developerTrusted),
    sourcePins: normalizePins(input.sourcePins),
  }
}

export function diffPluginManifestReviewDocuments(
  previous: PluginManifestReviewDocument | undefined,
  current: PluginManifestReviewDocument,
): PluginReviewChange[] {
  if (!previous) return []

  const changes: PluginReviewChange[] = []
  const addChange = (field: string, before: unknown, after: unknown) => {
    const previousValue = formatReviewValue(before)
    const currentValue = formatReviewValue(after)
    if (previousValue !== currentValue) {
      changes.push({ field, previous: previousValue, current: currentValue })
    }
  }

  addChange("version", previous.version, current.version)
  addChange("targetMode", previous.targetMode, current.targetMode)
  addChange("executionStatus", previous.executionStatus, current.executionStatus)
  addChange("updatePosture", previous.updatePosture, current.updatePosture)
  addChange("commands", previous.components.commands, current.components.commands)
  addChange("skills", previous.components.skills, current.components.skills)
  addChange("agents", previous.components.agents, current.components.agents)
  addChange("mcpServers", previous.components.mcpServers, current.components.mcpServers)
  addChange("controlledUi", previous.controlledUi, current.controlledUi)
  addChange("developerTrusted", previous.developerTrusted, current.developerTrusted)
  addChange("sourcePins", previous.sourcePins, current.sourcePins)

  return changes
}

function normalizeDeveloperTrusted(
  value: PluginDeveloperTrustedReviewDocument | undefined,
): PluginDeveloperTrustedReviewDocument {
  if (!value) {
    return {
      manifestPresent: false,
      permissions: [],
      capabilities: [],
      diagnostics: [],
      ignoredUnknownFields: [],
    }
  }
  return {
    manifestPresent: value.manifestPresent,
    id: value.id,
    name: value.name,
    version: value.version,
    entry: value.entry,
    entryContentHash: value.entryContentHash,
    entryRealPath: value.entryRealPath,
    bundleContentHash: value.bundleContentHash,
    bundleFileCount: value.bundleFileCount,
    bundleByteCount: value.bundleByteCount,
    permissions: normalizeList(value.permissions),
    capabilities: normalizeList(value.capabilities),
    diagnostics: [...value.diagnostics]
      .map((diagnostic) => ({
        code: diagnostic.code,
        severity: diagnostic.severity,
        path: diagnostic.path,
      }))
      .sort((a, b) => {
        const byCode = a.code.localeCompare(b.code)
        if (byCode !== 0) return byCode
        return (a.path ?? "").localeCompare(b.path ?? "")
      }),
    ignoredUnknownFields: normalizeList(value.ignoredUnknownFields),
  }
}

function normalizeControlledUi(
  value: PluginControlledUiReviewDocument | undefined,
): PluginControlledUiReviewDocument {
  if (!value) {
    return {
      manifestPresent: false,
      surfaces: [],
      diagnostics: [],
      ignoredUnknownFields: [],
    }
  }
  return {
    manifestPresent: value.manifestPresent,
    surfaces: [...value.surfaces]
      .map((surface) => ({
        id: surface.id,
        type: surface.type,
        title: surface.title,
        description: surface.description,
        fieldIds: normalizeList(surface.fieldIds),
        itemCount: surface.itemCount,
        action: surface.action
          ? {
              id: surface.action.id,
              type: surface.action.type,
              prompt: surface.action.prompt,
            }
          : undefined,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    diagnostics: [...value.diagnostics]
      .map((diagnostic) => ({
        code: diagnostic.code,
        severity: diagnostic.severity,
        path: diagnostic.path,
      }))
      .sort((a, b) => {
        const byCode = a.code.localeCompare(b.code)
        if (byCode !== 0) return byCode
        return (a.path ?? "").localeCompare(b.path ?? "")
      }),
    ignoredUnknownFields: normalizeList(value.ignoredUnknownFields),
  }
}

function formatReviewValue(value: unknown): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return "none"
    return value
      .map((item) => typeof item === "string" ? item : stableJsonStringify(item))
      .join(", ")
  }
  if (value === undefined || value === null || value === "") return "none"
  if (typeof value === "object") return stableJsonStringify(value)
  return String(value)
}

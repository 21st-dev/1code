import type {
  PluginRuntime,
  PluginTargetMode,
} from "./plugin-target-modes"
import type { PluginUpdateReviewStatus } from "./plugin-update-review"

export type PluginDeveloperTrustedDiagnosticSeverity = "info" | "warning" | "blocked"

export type PluginDeveloperTrustedDiagnosticCode =
  | "developer-manifest-invalid"
  | "developer-manifest-unknown-field"
  | "developer-manifest-unsafe-field"
  | "developer-manifest-limit-exceeded"
  | "developer-entry-remote"
  | "developer-entry-outside-root"
  | "developer-unsupported-target-mode"

export interface PluginDeveloperTrustedDiagnostic {
  code: PluginDeveloperTrustedDiagnosticCode
  severity: PluginDeveloperTrustedDiagnosticSeverity
  path?: string
  message?: string
}

export interface PluginDeveloperTrustedManifest {
  schemaVersion: 1
  id: string
  name: string
  version: string
  entry: string
  description?: string
  author?: string
  minLocusVersion?: string
  permissions: string[]
  capabilities: string[]
}

export interface PluginDeveloperTrustedParseResult {
  manifest?: PluginDeveloperTrustedManifest
  diagnostics: PluginDeveloperTrustedDiagnostic[]
  ignoredUnknownFields: string[]
}

export interface PluginDeveloperTrustedReviewDocument {
  manifestPresent: boolean
  id?: string
  name?: string
  version?: string
  entry?: string
  entryContentHash?: string
  entryRealPath?: string
  permissions: string[]
  capabilities: string[]
  diagnostics: Array<{
    code: PluginDeveloperTrustedDiagnosticCode
    severity: PluginDeveloperTrustedDiagnosticSeverity
    path?: string
  }>
  ignoredUnknownFields: string[]
}

export interface PluginDeveloperModeState {
  enabled: boolean
  updatedAt?: string
}

export type PluginDeveloperTrustedGateReason =
  | "developer-mode-disabled"
  | "safe-mode"
  | "review-required"
  | "review-changed"
  | "review-unreviewed"
  | "trust-missing"
  | "trust-stale"
  | "invalid-developer-manifest"
  | "entry-outside-root"
  | "unsupported-source"
  | "unsupported-runtime"
  | "unsupported-target-mode"
  | "codex-read-only-cache"

export interface PluginDeveloperTrustedGate {
  canTrustCurrentFingerprint: boolean
  canLoadTrustedCode: boolean
  reasons: PluginDeveloperTrustedGateReason[]
}

export interface PluginDeveloperTrustedAcknowledgement {
  pluginReviewKey: string
  pluginFingerprint: string
  manifestId: string
  entryPath: string
  entryContentHash: string
  sourcePath: string
  trustedAt: string
}

export type PluginDeveloperTrustedStatus =
  | "current"
  | "stale"
  | "missing"
  | "mismatch"

const MAX_ID_LENGTH = 96
const MAX_NAME_LENGTH = 120
const MAX_VERSION_LENGTH = 64
const MAX_DESCRIPTION_LENGTH = 480
const MAX_ENTRY_LENGTH = 260
const MAX_PERMISSION_LENGTH = 96
const MAX_PERMISSION_COUNT = 32
const MAX_CAPABILITY_COUNT = 32
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i
const RELATIVE_ENTRY_PATTERN = /^[a-z0-9._/-]+$/i
const MANIFEST_KEYS = new Set([
  "schemaVersion",
  "id",
  "name",
  "version",
  "description",
  "author",
  "entry",
  "minLocusVersion",
  "permissions",
  "capabilities",
])
const UNSAFE_FIELD_NAMES = new Set([
  "args",
  "command",
  "env",
  "headers",
  "mcp",
  "native",
  "oauth",
  "script",
  "shell",
  "token",
  "url",
])

export function parseDeveloperTrustedManifest(
  value: unknown,
): PluginDeveloperTrustedParseResult {
  const diagnostics: PluginDeveloperTrustedDiagnostic[] = []
  const ignoredUnknownFields: string[] = []

  if (!isRecord(value)) {
    return invalidResult("manifest", "Developer plugin manifest must be an object.")
  }

  collectUnknownFields(value, diagnostics, ignoredUnknownFields)
  if (hasUnsafeFields(value, diagnostics)) {
    return { diagnostics, ignoredUnknownFields }
  }

  if (value.schemaVersion !== 1) {
    diagnostics.push({
      code: "developer-manifest-invalid",
      severity: "blocked",
      path: "schemaVersion",
      message: "Developer plugin manifest schemaVersion must be 1.",
    })
  }

  const id = getBoundedId(value.id, "id", diagnostics)
  const name = getBoundedString(value.name, "name", MAX_NAME_LENGTH, diagnostics)
  const version = getBoundedString(value.version, "version", MAX_VERSION_LENGTH, diagnostics)
  const description = getOptionalBoundedString(
    value.description,
    "description",
    MAX_DESCRIPTION_LENGTH,
    diagnostics,
  )
  const author = getOptionalBoundedString(value.author, "author", MAX_NAME_LENGTH, diagnostics)
  const minLocusVersion = getOptionalBoundedString(
    value.minLocusVersion,
    "minLocusVersion",
    MAX_VERSION_LENGTH,
    diagnostics,
  )
  const entry = parseEntry(value.entry, diagnostics)
  const permissions = parseStringList(
    value.permissions,
    "permissions",
    MAX_PERMISSION_COUNT,
    diagnostics,
  )
  const capabilities = parseStringList(
    value.capabilities,
    "capabilities",
    MAX_CAPABILITY_COUNT,
    diagnostics,
  )

  if (hasBlockedDiagnostics(diagnostics) || !id || !name || !version || !entry) {
    return { diagnostics, ignoredUnknownFields }
  }

  return {
    manifest: {
      schemaVersion: 1,
      id,
      name,
      version,
      description,
      author,
      minLocusVersion,
      entry,
      permissions,
      capabilities,
    },
    diagnostics,
    ignoredUnknownFields,
  }
}

export function buildDeveloperTrustedReviewDocument(input: {
  parseResult: PluginDeveloperTrustedParseResult
  entryContentHash?: string
  entryRealPath?: string
}): PluginDeveloperTrustedReviewDocument {
  const manifest = input.parseResult.manifest
  return {
    manifestPresent: Boolean(manifest),
    id: manifest?.id,
    name: manifest?.name,
    version: manifest?.version,
    entry: manifest?.entry,
    entryContentHash: input.entryContentHash,
    entryRealPath: input.entryRealPath,
    permissions: [...(manifest?.permissions ?? [])].sort(),
    capabilities: [...(manifest?.capabilities ?? [])].sort(),
    diagnostics: input.parseResult.diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      severity: diagnostic.severity,
      path: diagnostic.path,
    })),
    ignoredUnknownFields: [...input.parseResult.ignoredUnknownFields].sort(),
  }
}

export function buildPluginDeveloperTrustedGate(input: {
  runtime: PluginRuntime
  targetMode: PluginTargetMode
  updateReviewStatus?: PluginUpdateReviewStatus
  safeModeEnabled: boolean
  developerModeEnabled: boolean
  isLocalDeveloperSource: boolean
  hasValidManifest: boolean
  entryContained: boolean
  trustStatus?: PluginDeveloperTrustedStatus
}): PluginDeveloperTrustedGate {
  const reasons: PluginDeveloperTrustedGateReason[] = []
  const isReviewed = input.updateReviewStatus === "reviewed"
  const trustStatus = input.trustStatus ?? "missing"

  if (!input.developerModeEnabled) reasons.push("developer-mode-disabled")
  if (input.safeModeEnabled) reasons.push("safe-mode")
  if (input.runtime === "codex") reasons.push("codex-read-only-cache")
  if (input.runtime !== "claude") reasons.push("unsupported-runtime")
  if (input.targetMode !== "developer-trusted-code") reasons.push("unsupported-target-mode")
  if (!input.isLocalDeveloperSource) reasons.push("unsupported-source")
  if (!input.hasValidManifest) reasons.push("invalid-developer-manifest")
  if (!input.entryContained) reasons.push("entry-outside-root")
  if (!isReviewed) reasons.push(getReviewGateReason(input.updateReviewStatus))
  if (trustStatus === "stale") reasons.push("trust-stale")
  if (trustStatus === "missing" || trustStatus === "mismatch") reasons.push("trust-missing")

  const canTrustCurrentFingerprint =
    input.runtime === "claude" &&
    input.targetMode === "developer-trusted-code" &&
    input.developerModeEnabled &&
    !input.safeModeEnabled &&
    input.isLocalDeveloperSource &&
    input.hasValidManifest &&
    input.entryContained &&
    isReviewed

  return {
    canTrustCurrentFingerprint,
    canLoadTrustedCode: canTrustCurrentFingerprint && trustStatus === "current",
    reasons: uniqueReasons(reasons),
  }
}

export function buildDeveloperTrustedAcknowledgement(input: {
  pluginReviewKey: string
  pluginFingerprint: string
  manifestId: string
  entryPath: string
  entryContentHash: string
  sourcePath: string
  trustedAt?: string
}): PluginDeveloperTrustedAcknowledgement {
  return {
    pluginReviewKey: input.pluginReviewKey,
    pluginFingerprint: input.pluginFingerprint,
    manifestId: input.manifestId,
    entryPath: input.entryPath,
    entryContentHash: input.entryContentHash,
    sourcePath: input.sourcePath,
    trustedAt: input.trustedAt ?? new Date().toISOString(),
  }
}

export function getDeveloperTrustedStatus(
  acknowledgement: PluginDeveloperTrustedAcknowledgement | undefined,
  input: {
    pluginReviewKey: string
    pluginFingerprint: string
    manifestId: string
    entryPath: string
    entryContentHash: string
    sourcePath: string
  },
): PluginDeveloperTrustedStatus {
  if (!acknowledgement) return "missing"
  if (
    acknowledgement.pluginReviewKey !== input.pluginReviewKey ||
    acknowledgement.manifestId !== input.manifestId ||
    acknowledgement.entryPath !== input.entryPath ||
    acknowledgement.sourcePath !== input.sourcePath
  ) {
    return "mismatch"
  }
  return acknowledgement.pluginFingerprint === input.pluginFingerprint &&
    acknowledgement.entryContentHash === input.entryContentHash
    ? "current"
    : "stale"
}

function parseEntry(
  value: unknown,
  diagnostics: PluginDeveloperTrustedDiagnostic[],
): string | undefined {
  const entry = getBoundedString(value, "entry", MAX_ENTRY_LENGTH, diagnostics)
  if (!entry) return undefined
  if (isRemoteEntry(entry)) {
    diagnostics.push({
      code: "developer-entry-remote",
      severity: "blocked",
      path: "entry",
      message: "Developer plugin entry must be a local relative path, not a remote URL.",
    })
    return undefined
  }
  if (
    entry.startsWith("/") ||
    entry.startsWith("\\") ||
    entry.includes("..") ||
    !RELATIVE_ENTRY_PATTERN.test(entry)
  ) {
    diagnostics.push({
      code: "developer-entry-outside-root",
      severity: "blocked",
      path: "entry",
      message: "Developer plugin entry must be a relative path inside the plugin root.",
    })
    return undefined
  }
  return entry.startsWith("./") ? entry.slice(2) : entry
}

function parseStringList(
  value: unknown,
  path: string,
  maxCount: number,
  diagnostics: PluginDeveloperTrustedDiagnostic[],
): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    diagnostics.push({
      code: "developer-manifest-invalid",
      severity: "blocked",
      path,
      message: "Developer plugin manifest list fields must be arrays.",
    })
    return []
  }
  if (value.length > maxCount) {
    diagnostics.push({
      code: "developer-manifest-limit-exceeded",
      severity: "blocked",
      path,
      message: `Developer plugin manifest may declare at most ${maxCount} ${path}.`,
    })
    return []
  }
  return value.flatMap((item, index) => {
    const parsed = getBoundedString(
      item,
      `${path}.${index}`,
      MAX_PERMISSION_LENGTH,
      diagnostics,
    )
    if (!parsed) return []
    if (!ID_PATTERN.test(parsed)) {
      diagnostics.push({
        code: "developer-manifest-invalid",
        severity: "blocked",
        path: `${path}.${index}`,
        message: "Developer plugin permission and capability ids may contain letters, numbers, dots, underscores, and dashes.",
      })
      return []
    }
    return [parsed]
  }).sort()
}

function getBoundedId(
  value: unknown,
  path: string,
  diagnostics: PluginDeveloperTrustedDiagnostic[],
): string | undefined {
  const id = getBoundedString(value, path, MAX_ID_LENGTH, diagnostics)
  if (!id) return undefined
  if (!ID_PATTERN.test(id)) {
    diagnostics.push({
      code: "developer-manifest-invalid",
      severity: "blocked",
      path,
      message: "Developer plugin ids may contain letters, numbers, dots, underscores, and dashes.",
    })
    return undefined
  }
  return id
}

function getOptionalBoundedString(
  value: unknown,
  path: string,
  maxLength: number,
  diagnostics: PluginDeveloperTrustedDiagnostic[],
): string | undefined {
  if (value === undefined) return undefined
  return getBoundedString(value, path, maxLength, diagnostics)
}

function getBoundedString(
  value: unknown,
  path: string,
  maxLength: number,
  diagnostics: PluginDeveloperTrustedDiagnostic[],
): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    diagnostics.push({
      code: "developer-manifest-invalid",
      severity: "blocked",
      path,
      message: "Developer plugin manifest value must be a non-empty string.",
    })
    return undefined
  }
  const trimmed = value.trim()
  if (trimmed.length > maxLength) {
    diagnostics.push({
      code: "developer-manifest-limit-exceeded",
      severity: "blocked",
      path,
      message: `Developer plugin manifest value must be ${maxLength} characters or less.`,
    })
    return undefined
  }
  return trimmed
}

function collectUnknownFields(
  value: Record<string, unknown>,
  diagnostics: PluginDeveloperTrustedDiagnostic[],
  ignoredUnknownFields: string[],
) {
  for (const key of Object.keys(value)) {
    if (MANIFEST_KEYS.has(key) || UNSAFE_FIELD_NAMES.has(key)) continue
    const fieldPath = `manifest.${key}`
    ignoredUnknownFields.push(fieldPath)
    diagnostics.push({
      code: "developer-manifest-unknown-field",
      severity: "warning",
      path: fieldPath,
      message: "Developer plugin manifest ignored an unknown field.",
    })
  }
}

function hasUnsafeFields(
  value: Record<string, unknown>,
  diagnostics: PluginDeveloperTrustedDiagnostic[],
): boolean {
  let unsafe = false
  for (const key of Object.keys(value)) {
    if (!UNSAFE_FIELD_NAMES.has(key)) continue
    unsafe = true
    diagnostics.push({
      code: "developer-manifest-unsafe-field",
      severity: "blocked",
      path: `manifest.${key}`,
      message: "Developer plugin manifests cannot smuggle direct command, env, token, or remote execution fields.",
    })
  }
  return unsafe
}

function getReviewGateReason(
  status: PluginUpdateReviewStatus | undefined,
): PluginDeveloperTrustedGateReason {
  if (status === "changed") return "review-changed"
  if (status === "new") return "review-required"
  return "review-unreviewed"
}

function uniqueReasons(reasons: PluginDeveloperTrustedGateReason[]): PluginDeveloperTrustedGateReason[] {
  return Array.from(new Set(reasons))
}

function hasBlockedDiagnostics(diagnostics: PluginDeveloperTrustedDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "blocked")
}

function invalidResult(path: string, message: string): PluginDeveloperTrustedParseResult {
  return {
    diagnostics: [{
      code: "developer-manifest-invalid",
      severity: "blocked",
      path,
      message,
    }],
    ignoredUnknownFields: [],
  }
}

function isRemoteEntry(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

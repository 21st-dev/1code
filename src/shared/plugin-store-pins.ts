import type { PluginControlledUiReviewDocument } from "./plugin-controlled-ui"
import type {
  PluginRuntime,
  PluginTargetMode,
} from "./plugin-target-modes"
import {
  stableJsonStringify,
  type PluginReviewChange,
  type PluginSourcePin,
} from "./plugin-update-review"

export type PluginStoreSourcePinType = "git"

export type PluginStoreTargetMode = Extract<
  PluginTargetMode,
  "manifest-only" | "controlled-ui"
>

export type PluginStoreCandidateStatus =
  | "not-installed"
  | "installed-current"
  | "update-available"
  | "pin-changed"
  | "package-hash-changed"
  | "review-required"
  | "blocked-invalid-pin"
  | "blocked-missing-package-hash"
  | "blocked-target-mode"

export type PluginStoreApprovalStatus =
  | "missing"
  | "current"
  | "stale"

export type PluginStoreValidationSeverity = "warning" | "blocked"

export type PluginStoreValidationCode =
  | "invalid-store-entry"
  | "immutable-commit-required"
  | "invalid-package-hash"
  | "missing-package-hash"
  | "invalid-source-path"
  | "remote-developer-trusted-code"
  | "invalid-target-mode"
  | "invalid-permission"
  | "invalid-mcp-server"
  | "invalid-controlled-ui"

export interface PluginStoreValidationIssue {
  code: PluginStoreValidationCode
  severity: PluginStoreValidationSeverity
  field: string
  message: string
}

export interface PluginStoreGitSourcePin {
  type: "git"
  repo: string
  commit: string
  path?: string
}

export interface PluginStorePackagePin {
  sha256?: string
  sizeBytes?: number
}

export interface PluginStoreCatalogEntry {
  schemaVersion: 1
  id: string
  runtime: PluginRuntime
  name: string
  version: string
  source: PluginStoreGitSourcePin
  package?: PluginStorePackagePin
  targetMode: PluginTargetMode
  declaredPermissions: string[]
  declaredMcpServers: string[]
  controlledUi?: PluginControlledUiReviewDocument
}

export interface PluginStoreCandidateReviewDocument {
  schemaVersion: 1
  storeEntryId: string
  runtime: PluginRuntime
  name: string
  version: string
  source: PluginStoreGitSourcePin
  package: PluginStorePackagePin
  targetMode: PluginTargetMode
  declaredPermissions: string[]
  declaredMcpServers: string[]
  controlledUi?: PluginControlledUiReviewDocument
  sourcePins: PluginSourcePin[]
}

export interface PluginStoreCandidateReview {
  document: PluginStoreCandidateReviewDocument
  status: PluginStoreCandidateStatus
  approvalStatus: PluginStoreApprovalStatus
  issues: PluginStoreValidationIssue[]
  changes: PluginReviewChange[]
}

export interface PluginStoreCandidateApproval {
  schemaVersion: 1
  storeEntryId: string
  commit: string
  packageHash?: string
  candidateFingerprint: string
  approvedAt: string
}

export interface PluginStoreInstalledPackageRecord {
  schemaVersion: 1
  pluginReviewKey: string
  storeEntryId: string
  commit: string
  packageHash?: string
  candidateFingerprint: string
  installedAt: string
  targetMode: PluginTargetMode
}

export interface PluginStoreBackupRecord {
  schemaVersion: 1
  id: string
  pluginReviewKey: string
  storeEntryId: string
  backupPath: string
  previousPath: string
  previousFingerprint?: string
  previousCommit?: string
  previousPackageHash?: string
  createdAt: string
  restoredAt?: string
}

const FULL_COMMIT_SHA_PATTERN = /^[a-f0-9]{40}$/i
const SHA256_PATTERN = /^[a-f0-9]{64}$/i
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/i
const NAME_MAX_LENGTH = 120
const VERSION_MAX_LENGTH = 80
const REPO_MAX_LENGTH = 200
const PATH_MAX_LENGTH = 240
const PERMISSION_MAX_LENGTH = 96
const MCP_SERVER_MAX_LENGTH = 96
const MAX_PERMISSIONS = 48
const MAX_MCP_SERVERS = 32
const MAX_CONTROLLED_UI_SURFACES = 16
const SAFE_RELATIVE_PATH_SEGMENT_PATTERN = /^[^/\\]+$/
const MUTABLE_REF_HINTS = new Set([
  "head",
  "latest",
  "main",
  "master",
  "next",
  "stable",
  "trunk",
])

export function isImmutableGitCommitPin(value: string): boolean {
  return FULL_COMMIT_SHA_PATTERN.test(value.trim())
}

export function isSha256PackageHash(value: string): boolean {
  return SHA256_PATTERN.test(value.trim())
}

export function normalizePluginStoreCatalogEntry(
  entry: PluginStoreCatalogEntry,
): PluginStoreCatalogEntry {
  return {
    schemaVersion: 1,
    id: entry.id.trim(),
    runtime: entry.runtime,
    name: trimBounded(entry.name, NAME_MAX_LENGTH),
    version: trimBounded(entry.version, VERSION_MAX_LENGTH),
    source: {
      type: "git",
      repo: trimBounded(entry.source.repo, REPO_MAX_LENGTH),
      commit: entry.source.commit.trim(),
      path: normalizeOptionalPath(entry.source.path),
    },
    package: normalizePackagePin(entry.package),
    targetMode: entry.targetMode,
    declaredPermissions: normalizeBoundedList(
      entry.declaredPermissions,
      MAX_PERMISSIONS,
      PERMISSION_MAX_LENGTH,
    ),
    declaredMcpServers: normalizeBoundedList(
      entry.declaredMcpServers,
      MAX_MCP_SERVERS,
      MCP_SERVER_MAX_LENGTH,
    ),
    controlledUi: normalizeControlledUiReview(entry.controlledUi),
  }
}

export function validatePluginStoreCatalogEntry(
  entry: PluginStoreCatalogEntry,
  options: { requirePackageHashForWrite?: boolean } = {},
): PluginStoreValidationIssue[] {
  const normalized = normalizePluginStoreCatalogEntry(entry)
  const issues: PluginStoreValidationIssue[] = []

  if (normalized.schemaVersion !== 1) {
    issues.push(blocked(
      "invalid-store-entry",
      "schemaVersion",
      "Store catalog entry schemaVersion must be 1.",
    ))
  }
  if (!ID_PATTERN.test(normalized.id)) {
    issues.push(blocked(
      "invalid-store-entry",
      "id",
      "Store entry id must be a bounded dotted identifier.",
    ))
  }
  if (!["claude", "codex"].includes(normalized.runtime)) {
    issues.push(blocked(
      "invalid-store-entry",
      "runtime",
      "Store entry runtime must be claude or codex.",
    ))
  }
  if (!normalized.name) {
    issues.push(blocked("invalid-store-entry", "name", "Store entry name is required."))
  }
  if (!normalized.version) {
    issues.push(blocked("invalid-store-entry", "version", "Store entry version is required."))
  }
  if (normalized.source.type !== "git") {
    issues.push(blocked(
      "invalid-store-entry",
      "source.type",
      "Store source type must be git.",
    ))
  }
  if (!normalized.source.repo || normalized.source.repo.length > REPO_MAX_LENGTH) {
    issues.push(blocked(
      "invalid-store-entry",
      "source.repo",
      "Store git source repo is required and must be bounded.",
    ))
  }
  if (!isImmutableGitCommitPin(normalized.source.commit)) {
    const hint = normalized.source.commit.toLowerCase()
    const mutableHint = MUTABLE_REF_HINTS.has(hint) || !hint
      ? " Mutable refs such as latest, main, branches, and unresolved tags are not accepted."
      : ""
    issues.push(blocked(
      "immutable-commit-required",
      "source.commit",
      `Store git source must use a full 40-character commit SHA.${mutableHint}`,
    ))
  }
  if (normalized.source.path && !isSafeRelativePath(normalized.source.path)) {
    issues.push(blocked(
      "invalid-source-path",
      "source.path",
      "Store source path must stay inside the repository and cannot use traversal.",
    ))
  }
  if (normalized.package?.sha256 && !isSha256PackageHash(normalized.package.sha256)) {
    issues.push(blocked(
      "invalid-package-hash",
      "package.sha256",
      "Store package sha256 must be a 64-character hex digest.",
    ))
  }
  if (options.requirePackageHashForWrite && !normalized.package?.sha256) {
    issues.push(blocked(
      "missing-package-hash",
      "package.sha256",
      "Store install and update writes require a package sha256.",
    ))
  }
  if (normalized.targetMode === "developer-trusted-code") {
    issues.push(blocked(
      "remote-developer-trusted-code",
      "targetMode",
      "Remote store entries cannot request developer trusted-code mode.",
    ))
  } else if (!["manifest-only", "controlled-ui"].includes(normalized.targetMode)) {
    issues.push(blocked(
      "invalid-target-mode",
      "targetMode",
      "Store target mode must be manifest-only or controlled-ui.",
    ))
  }
  if (normalized.declaredPermissions.length > MAX_PERMISSIONS) {
    issues.push(blocked(
      "invalid-permission",
      "declaredPermissions",
      "Store entries may declare only a bounded number of permissions.",
    ))
  }
  for (const permission of normalized.declaredPermissions) {
    if (!ID_PATTERN.test(permission) || permission.length > PERMISSION_MAX_LENGTH) {
      issues.push(blocked(
        "invalid-permission",
        "declaredPermissions",
        "Store permission ids must be bounded identifiers.",
      ))
      break
    }
  }
  if (normalized.declaredMcpServers.length > MAX_MCP_SERVERS) {
    issues.push(blocked(
      "invalid-mcp-server",
      "declaredMcpServers",
      "Store entries may declare only a bounded number of MCP servers.",
    ))
  }
  for (const server of normalized.declaredMcpServers) {
    if (!ID_PATTERN.test(server) || server.length > MCP_SERVER_MAX_LENGTH) {
      issues.push(blocked(
        "invalid-mcp-server",
        "declaredMcpServers",
        "Store MCP server names must be bounded identifiers.",
      ))
      break
    }
  }
  if (
    normalized.controlledUi &&
    normalized.controlledUi.surfaces.length > MAX_CONTROLLED_UI_SURFACES
  ) {
    issues.push(blocked(
      "invalid-controlled-ui",
      "controlledUi.surfaces",
      "Store controlled UI declarations must stay within bounded preview limits.",
    ))
  }

  return dedupeIssues(issues)
}

export function buildPluginStoreCandidateReviewDocument(
  entry: PluginStoreCatalogEntry,
): PluginStoreCandidateReviewDocument {
  const normalized = normalizePluginStoreCatalogEntry(entry)
  return {
    schemaVersion: 1,
    storeEntryId: normalized.id,
    runtime: normalized.runtime,
    name: normalized.name,
    version: normalized.version,
    source: normalized.source,
    package: normalized.package ?? {},
    targetMode: normalized.targetMode,
    declaredPermissions: normalized.declaredPermissions,
    declaredMcpServers: normalized.declaredMcpServers,
    controlledUi: normalized.controlledUi,
    sourcePins: buildPluginStoreSourcePins(normalized),
  }
}

export function buildPluginStoreSourcePins(
  entry: PluginStoreCatalogEntry,
): PluginSourcePin[] {
  const normalized = normalizePluginStoreCatalogEntry(entry)
  const pins: PluginSourcePin[] = [{
    kind: "store-git-commit",
    label: "Store reviewed commit",
    value: normalized.source.commit,
    repo: normalized.source.repo,
    path: normalized.source.path,
  }]
  if (normalized.package?.sha256) {
    pins.push({
      kind: "store-package-sha256",
      label: "Store package sha256",
      value: normalized.package.sha256,
      repo: normalized.source.repo,
      path: normalized.source.path,
    })
  }
  return pins
}

export function diffPluginStoreCandidateDocuments(
  previous: PluginStoreCandidateReviewDocument | undefined,
  current: PluginStoreCandidateReviewDocument,
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
  addChange("source.commit", previous.source.commit, current.source.commit)
  addChange("source.path", previous.source.path, current.source.path)
  addChange("package.sha256", previous.package.sha256, current.package.sha256)
  addChange("package.sizeBytes", previous.package.sizeBytes, current.package.sizeBytes)
  addChange("targetMode", previous.targetMode, current.targetMode)
  addChange("declaredPermissions", previous.declaredPermissions, current.declaredPermissions)
  addChange("declaredMcpServers", previous.declaredMcpServers, current.declaredMcpServers)
  addChange("controlledUi", previous.controlledUi, current.controlledUi)

  return changes
}

export function buildPluginStoreCandidateReview(input: {
  entry: PluginStoreCatalogEntry
  installed?: PluginStoreInstalledPackageRecord
  previousCandidate?: PluginStoreCandidateReviewDocument
  approval?: PluginStoreCandidateApproval
  candidateFingerprint: string
  requirePackageHashForWrite?: boolean
}): PluginStoreCandidateReview {
  const document = buildPluginStoreCandidateReviewDocument(input.entry)
  const issues = validatePluginStoreCatalogEntry(input.entry, {
    requirePackageHashForWrite: input.requirePackageHashForWrite,
  })
  const approvalStatus = getPluginStoreApprovalStatus(input.approval, {
    document,
    candidateFingerprint: input.candidateFingerprint,
  })
  const changes = diffPluginStoreCandidateDocuments(input.previousCandidate, document).slice(0, 12)

  return {
    document,
    status: getPluginStoreCandidateStatus({
      document,
      installed: input.installed,
      issues,
      approvalStatus,
      candidateFingerprint: input.candidateFingerprint,
    }),
    approvalStatus,
    issues,
    changes,
  }
}

export function getPluginStoreApprovalStatus(
  approval: PluginStoreCandidateApproval | undefined,
  current: {
    document: PluginStoreCandidateReviewDocument
    candidateFingerprint: string
  },
): PluginStoreApprovalStatus {
  if (!approval) return "missing"
  if (
    approval.storeEntryId === current.document.storeEntryId &&
    approval.commit === current.document.source.commit &&
    approval.packageHash === current.document.package.sha256 &&
    approval.candidateFingerprint === current.candidateFingerprint
  ) {
    return "current"
  }
  return "stale"
}

export function buildPluginStoreCandidateApproval(input: {
  document: PluginStoreCandidateReviewDocument
  candidateFingerprint: string
  approvedAt?: string
}): PluginStoreCandidateApproval {
  return {
    schemaVersion: 1,
    storeEntryId: input.document.storeEntryId,
    commit: input.document.source.commit,
    packageHash: input.document.package.sha256,
    candidateFingerprint: input.candidateFingerprint,
    approvedAt: input.approvedAt ?? new Date().toISOString(),
  }
}

export function getPluginStoreCandidateStatus(input: {
  document: PluginStoreCandidateReviewDocument
  installed?: PluginStoreInstalledPackageRecord
  issues?: PluginStoreValidationIssue[]
  approvalStatus?: PluginStoreApprovalStatus
  candidateFingerprint?: string
}): PluginStoreCandidateStatus {
  const issues = input.issues ?? []
  if (issues.some((issue) => issue.code === "remote-developer-trusted-code")) {
    return "blocked-target-mode"
  }
  if (issues.some((issue) => issue.code === "missing-package-hash")) {
    return "blocked-missing-package-hash"
  }
  if (issues.some((issue) => issue.severity === "blocked")) {
    return "blocked-invalid-pin"
  }

  const installed = input.installed
  if (!installed) {
    return input.approvalStatus === "current" ? "not-installed" : "review-required"
  }
  if (
    installed.storeEntryId === input.document.storeEntryId &&
    installed.commit === input.document.source.commit &&
    installed.packageHash === input.document.package.sha256 &&
    installed.candidateFingerprint === input.candidateFingerprint
  ) {
    return "installed-current"
  }
  if (installed.commit !== input.document.source.commit) {
    return "pin-changed"
  }
  if (installed.packageHash !== input.document.package.sha256) {
    return "package-hash-changed"
  }
  return input.approvalStatus === "current" ? "update-available" : "review-required"
}

export function isSafeRelativePath(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > PATH_MAX_LENGTH) return false
  if (trimmed.startsWith("/") || trimmed.startsWith("\\") || trimmed.includes("\0")) return false
  const segments = trimmed.split(/[\\/]+/).filter(Boolean)
  if (segments.length === 0) return false
  return segments.every((segment) =>
    segment !== "." &&
    segment !== ".." &&
    SAFE_RELATIVE_PATH_SEGMENT_PATTERN.test(segment)
  )
}

function normalizePackagePin(value: PluginStorePackagePin | undefined): PluginStorePackagePin | undefined {
  if (!value) return undefined
  return {
    sha256: value.sha256?.trim().toLowerCase(),
    sizeBytes: typeof value.sizeBytes === "number" && Number.isFinite(value.sizeBytes) && value.sizeBytes >= 0
      ? Math.floor(value.sizeBytes)
      : undefined,
  }
}

function normalizeControlledUiReview(
  value: PluginControlledUiReviewDocument | undefined,
): PluginControlledUiReviewDocument | undefined {
  if (!value) return undefined
  return {
    manifestPresent: value.manifestPresent === true,
    surfaces: [...(value.surfaces ?? [])]
      .map((surface) => ({
        id: trimBounded(surface.id, 96),
        type: surface.type,
        title: trimBounded(surface.title, 120),
        description: surface.description ? trimBounded(surface.description, 320) : undefined,
        fieldIds: normalizeBoundedList(surface.fieldIds, 32, 96),
        itemCount: typeof surface.itemCount === "number" && Number.isFinite(surface.itemCount)
          ? Math.max(0, Math.floor(surface.itemCount))
          : undefined,
        action: surface.action
          ? {
              id: trimBounded(surface.action.id, 96),
              type: surface.action.type,
              prompt: trimBounded(surface.action.prompt, 4000),
            }
          : undefined,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    diagnostics: [...(value.diagnostics ?? [])]
      .map((diagnostic) => ({
        code: diagnostic.code,
        severity: diagnostic.severity,
        path: diagnostic.path ? trimBounded(diagnostic.path, PATH_MAX_LENGTH) : undefined,
      }))
      .sort((a, b) => {
        const byCode = a.code.localeCompare(b.code)
        if (byCode !== 0) return byCode
        return (a.path ?? "").localeCompare(b.path ?? "")
      }),
    ignoredUnknownFields: normalizeBoundedList(value.ignoredUnknownFields, 64, 120),
  }
}

function normalizeOptionalPath(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimBounded(trimmed, PATH_MAX_LENGTH) : undefined
}

function normalizeBoundedList(
  values: string[] | undefined,
  maxItems: number,
  maxLength: number,
): string[] {
  return [...(values ?? [])]
    .filter((value): value is string => typeof value === "string")
    .map((value) => trimBounded(value, maxLength))
    .filter(Boolean)
    .slice(0, maxItems)
    .sort()
}

function trimBounded(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength)
}

function blocked(
  code: PluginStoreValidationCode,
  field: string,
  message: string,
): PluginStoreValidationIssue {
  return {
    code,
    severity: "blocked",
    field,
    message,
  }
}

function dedupeIssues(issues: PluginStoreValidationIssue[]): PluginStoreValidationIssue[] {
  const byKey = new Map<string, PluginStoreValidationIssue>()
  for (const issue of issues) {
    byKey.set(`${issue.code}:${issue.field}`, issue)
  }
  return Array.from(byKey.values())
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

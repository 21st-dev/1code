import { createHash } from "crypto"
import { app } from "electron"
import * as fs from "fs/promises"
import * as path from "path"
import {
  buildPluginStoreCandidateApproval,
  buildPluginStoreCandidateReview,
  buildPluginStoreCandidateReviewDocument,
  validatePluginStoreCatalogEntry,
  type PluginStoreBackupRecord,
  type PluginStoreCandidateApproval,
  type PluginStoreCandidateReview,
  type PluginStoreCatalogEntry,
  type PluginStoreInstalledPackageRecord,
  type PluginStorePackagePin,
  type PluginStoreValidationIssue,
} from "../../../shared/plugin-store-pins"
import { stableJsonStringify } from "../../../shared/plugin-update-review"
import type { PluginRuntime } from "../../../shared/plugin-target-modes"
import {
  approvePluginStoreCandidateFingerprint,
  getPluginReviewStatePath,
  getPluginStoreStateSnapshot,
  recordInstalledPluginStorePackage,
  recordPluginStoreCandidatePreview,
} from "./update-review-state"

const PLUGIN_STORE_CATALOG_FILE = "plugin-store-catalog.json"
const PLUGIN_STORE_PACKAGES_DIR = "plugin-store-packages"
const PLUGIN_STORE_BACKUPS_DIR = "plugin-store-backups"

export interface PluginStoreCatalog {
  schemaVersion: 1
  entries: PluginStoreCatalogEntry[]
}

export interface PluginStoreCandidatePreview {
  entry: PluginStoreCatalogEntry
  review: PluginStoreCandidateReview
  candidateFingerprint: string
  approval?: PluginStoreCandidateApproval
  installed?: PluginStoreInstalledPackageRecord
}

export interface PluginStoreInstallResult {
  preview: PluginStoreCandidatePreview
  installed: PluginStoreInstalledPackageRecord
  backup?: PluginStoreBackupRecord
  targetPath: string
}

interface PluginStorePackageHash {
  sha256: string
  sizeBytes: number
  fileCount: number
}

interface PluginStorePreviewOptions {
  catalogPath?: string
  statePath?: string
  requirePackageHashForWrite?: boolean
  recordPreview?: boolean
  now?: Date
  userDataPath?: string
}

export function getPluginStoreCatalogPath(userDataPath = app.getPath("userData")): string {
  return path.join(userDataPath, PLUGIN_STORE_CATALOG_FILE)
}

export function getPluginStorePackagesRoot(userDataPath = app.getPath("userData")): string {
  return path.join(userDataPath, PLUGIN_STORE_PACKAGES_DIR)
}

export function getPluginStoreBackupsRoot(userDataPath = app.getPath("userData")): string {
  return path.join(userDataPath, PLUGIN_STORE_BACKUPS_DIR)
}

export function hashPluginStoreCandidateReviewDocument(
  document: ReturnType<typeof buildPluginStoreCandidateReviewDocument>,
): string {
  return createHash("sha256")
    .update(stableJsonStringify(document))
    .digest("hex")
}

export async function readPluginStoreCatalog(
  catalogPath = getPluginStoreCatalogPath(),
): Promise<PluginStoreCatalog> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await fs.readFile(catalogPath, "utf-8")) as unknown
  } catch {
    return { schemaVersion: 1, entries: [] }
  }

  const entriesValue = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.entries)
      ? parsed.entries
      : []
  return {
    schemaVersion: 1,
    entries: entriesValue
      .map(coercePluginStoreCatalogEntry)
      .filter((entry): entry is PluginStoreCatalogEntry => Boolean(entry))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }
}

export async function listPluginStoreEntries(
  options: { catalogPath?: string } = {},
): Promise<PluginStoreCatalogEntry[]> {
  const catalog = await readPluginStoreCatalog(options.catalogPath)
  return catalog.entries.map(stripLocalPackagePath)
}

export async function previewPluginStoreCandidate(
  storeEntryId: string,
  options: PluginStorePreviewOptions = {},
): Promise<PluginStoreCandidatePreview> {
  const entry = await getPluginStoreEntry(storeEntryId, options.catalogPath)
  const document = buildPluginStoreCandidateReviewDocument(entry)
  const candidateFingerprint = hashPluginStoreCandidateReviewDocument(document)
  const state = await getPluginStoreStateSnapshot(options.statePath ?? getPluginReviewStatePath())
  const packageIssues = await getPackageVerificationIssues(entry, {
    requirePackageForWrite: options.requirePackageHashForWrite === true,
  })
  const review = buildPluginStoreCandidateReview({
    entry,
    installed: state.installedPackages[entry.id],
    previousCandidate: state.candidates[entry.id]?.document,
    approval: state.approvals[entry.id],
    extraIssues: packageIssues,
    candidateFingerprint,
    requirePackageHashForWrite: options.requirePackageHashForWrite,
  })

  if (options.recordPreview !== false) {
    await recordPluginStoreCandidatePreview({
      storeEntryId: entry.id,
      candidateFingerprint,
      document: review.document,
      status: review.status,
      issues: review.issues,
    }, options.statePath ?? getPluginReviewStatePath(), options.now ?? new Date())
  }

  return {
    entry: stripLocalPackagePath(entry),
    review,
    candidateFingerprint,
    approval: state.approvals[entry.id],
    installed: state.installedPackages[entry.id],
  }
}

export async function approveCurrentPluginStoreCandidate(
  storeEntryId: string,
  options: PluginStorePreviewOptions = {},
): Promise<{
  preview: PluginStoreCandidatePreview
  approval: PluginStoreCandidateApproval
}> {
  const preview = await previewPluginStoreCandidate(storeEntryId, {
    ...options,
    requirePackageHashForWrite: true,
  })
  if (preview.review.issues.some((issue) => issue.severity === "blocked")) {
    throw new Error("Store candidate cannot be approved until blocked review issues are resolved.")
  }
  const approval = buildPluginStoreCandidateApproval({
    document: preview.review.document,
    candidateFingerprint: preview.candidateFingerprint,
    approvedAt: (options.now ?? new Date()).toISOString(),
  })
  await approvePluginStoreCandidateFingerprint(
    approval,
    options.statePath ?? getPluginReviewStatePath(),
  )
  return { preview, approval }
}

export async function installOrUpdateApprovedPluginStoreCandidate(
  storeEntryId: string,
  options: PluginStorePreviewOptions = {},
): Promise<PluginStoreInstallResult> {
  const entry = await getPluginStoreEntry(storeEntryId, options.catalogPath)
  const preview = await previewPluginStoreCandidate(storeEntryId, {
    ...options,
    requirePackageHashForWrite: true,
  })
  if (preview.review.issues.some((issue) => issue.severity === "blocked")) {
    throw new Error("Store candidate cannot be installed until blocked review issues are resolved.")
  }
  if (preview.review.approvalStatus !== "current") {
    throw new Error("Store candidate approval is missing or stale.")
  }
  if (!entry.package?.localPath || !entry.package.sha256) {
    throw new Error("Store candidate writes require a local package path and package sha256.")
  }

  const packageHash = await hashPluginStorePackageDirectory(entry.package.localPath)
  if (packageHash.sha256 !== entry.package.sha256) {
    throw new Error("Store package hash does not match the approved candidate.")
  }

  const now = options.now ?? new Date()
  const userDataPath = options.userDataPath ?? app.getPath("userData")
  const targetRoot = getPluginStorePackagesRoot(userDataPath)
  const backupRoot = getPluginStoreBackupsRoot(userDataPath)
  const targetPath = path.join(targetRoot, entry.id)
  assertPathInside(targetRoot, targetPath)
  await fs.mkdir(targetRoot, { recursive: true })

  const state = await getPluginStoreStateSnapshot(options.statePath ?? getPluginReviewStatePath())
  const previousInstall = state.installedPackages[entry.id]
  const backup = await backupExistingStorePackage({
    targetPath,
    backupRoot,
    entry,
    previousInstall,
    now,
  })

  const stagingPath = `${targetPath}.staging-${process.pid}-${Date.now()}`
  await fs.rm(stagingPath, { recursive: true, force: true })
  await fs.cp(entry.package.localPath, stagingPath, {
    recursive: true,
    force: false,
    errorOnExist: true,
    dereference: false,
  })
  try {
    const stagedHash = await hashPluginStorePackageDirectory(stagingPath)
    if (stagedHash.sha256 !== entry.package.sha256) {
      throw new Error("Staged store package hash does not match the approved candidate.")
    }
    await fs.rm(targetPath, { recursive: true, force: true })
    await fs.rename(stagingPath, targetPath)
  } catch (error) {
    await fs.rm(stagingPath, { recursive: true, force: true })
    throw error
  }

  const installed: PluginStoreInstalledPackageRecord = {
    schemaVersion: 1,
    pluginReviewKey: `store:${entry.runtime}:${entry.id}`,
    storeEntryId: entry.id,
    commit: entry.source.commit,
    packageHash: entry.package.sha256,
    candidateFingerprint: preview.candidateFingerprint,
    installedAt: now.toISOString(),
    targetMode: entry.targetMode,
  }
  await recordInstalledPluginStorePackage(
    { installed, backup },
    options.statePath ?? getPluginReviewStatePath(),
  )
  return {
    preview,
    installed,
    backup,
    targetPath,
  }
}

export async function hashPluginStorePackageDirectory(
  packagePath: string,
): Promise<PluginStorePackageHash> {
  const rootPath = path.resolve(packagePath)
  const realRoot = await fs.realpath(rootPath)
  const rootStat = await fs.lstat(realRoot)
  if (!rootStat.isDirectory()) {
    throw new Error("Store package path must be a directory.")
  }

  const files = new Map<string, { realPath: string; relativePath: string; size: number }>()
  await collectPackageFiles(realRoot, realRoot, files)
  const fileEntries = Array.from(files.values())
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath))
  const hash = createHash("sha256")
  let sizeBytes = 0
  for (const file of fileEntries) {
    const content = await fs.readFile(file.realPath)
    sizeBytes += file.size
    hash.update(file.relativePath)
    hash.update("\0")
    hash.update(createHash("sha256").update(content).digest("hex"))
    hash.update("\0")
  }
  return {
    sha256: hash.digest("hex"),
    sizeBytes,
    fileCount: fileEntries.length,
  }
}

async function getPluginStoreEntry(
  storeEntryId: string,
  catalogPath = getPluginStoreCatalogPath(),
): Promise<PluginStoreCatalogEntry> {
  const catalog = await readPluginStoreCatalog(catalogPath)
  const entry = catalog.entries.find((candidate) => candidate.id === storeEntryId)
  if (!entry) {
    throw new Error("Store entry is not registered in the local catalog.")
  }
  return entry
}

async function getPackageVerificationIssues(
  entry: PluginStoreCatalogEntry,
  options: { requirePackageForWrite: boolean },
): Promise<PluginStoreValidationIssue[]> {
  const issues: PluginStoreValidationIssue[] = [
    ...validatePluginStoreCatalogEntry(entry, {
      requirePackageHashForWrite: options.requirePackageForWrite,
    }).filter((issue) => issue.code === "missing-package-hash"),
  ]
  if (options.requirePackageForWrite && !entry.package?.localPath) {
    issues.push(blockedIssue(
      "missing-package-local-path",
      "package.localPath",
      "Store install and update writes require a main-owned local package path.",
    ))
  }
  if (!entry.package?.localPath) return issues

  try {
    const packageHash = await hashPluginStorePackageDirectory(entry.package.localPath)
    if (entry.package.sha256 && packageHash.sha256 !== entry.package.sha256) {
      issues.push(blockedIssue(
        "package-hash-mismatch",
        "package.sha256",
        "Store package contents do not match the catalog sha256.",
      ))
    }
    if (
      typeof entry.package.sizeBytes === "number" &&
      packageHash.sizeBytes !== entry.package.sizeBytes
    ) {
      issues.push(blockedIssue(
        "package-hash-mismatch",
        "package.sizeBytes",
        "Store package size does not match the catalog size.",
      ))
    }
  } catch (error) {
    issues.push(blockedIssue(
      "package-containment-failed",
      "package.localPath",
      error instanceof Error
        ? error.message
        : "Store package directory could not be validated.",
    ))
  }
  return issues
}

async function backupExistingStorePackage(input: {
  targetPath: string
  backupRoot: string
  entry: PluginStoreCatalogEntry
  previousInstall?: PluginStoreInstalledPackageRecord
  now: Date
}): Promise<PluginStoreBackupRecord | undefined> {
  let targetStat
  try {
    targetStat = await fs.lstat(input.targetPath)
  } catch {
    return undefined
  }
  if (!targetStat.isDirectory() || targetStat.isSymbolicLink()) {
    throw new Error("Existing store package target is not a contained directory.")
  }
  await hashPluginStorePackageDirectory(input.targetPath)
  await fs.mkdir(input.backupRoot, { recursive: true })
  const id = `${input.entry.id}-${input.now.toISOString().replace(/[:.]/g, "-")}`
  const backupPath = path.join(input.backupRoot, id)
  assertPathInside(input.backupRoot, backupPath)
  await fs.rm(backupPath, { recursive: true, force: true })
  await fs.cp(input.targetPath, backupPath, {
    recursive: true,
    force: false,
    errorOnExist: true,
    dereference: false,
  })
  return {
    schemaVersion: 1,
    id,
    pluginReviewKey: input.previousInstall?.pluginReviewKey ?? `store:${input.entry.runtime}:${input.entry.id}`,
    storeEntryId: input.entry.id,
    backupPath,
    previousPath: input.targetPath,
    previousFingerprint: input.previousInstall?.candidateFingerprint,
    previousCommit: input.previousInstall?.commit,
    previousPackageHash: input.previousInstall?.packageHash,
    createdAt: input.now.toISOString(),
  }
}

async function collectPackageFiles(
  realRoot: string,
  dir: string,
  files: Map<string, { realPath: string; relativePath: string; size: number }>,
): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === "." || entry.name === ".." || entry.name.includes("\0")) {
      throw new Error("Store package contains an invalid path entry.")
    }
    const candidate = path.join(dir, entry.name)
    const stat = await fs.lstat(candidate)
    if (stat.isSymbolicLink()) {
      throw new Error("Store package contains a symlink and cannot be installed.")
    }
    const realCandidate = await fs.realpath(candidate)
    assertPathInside(realRoot, realCandidate)
    if (stat.isDirectory()) {
      await collectPackageFiles(realRoot, realCandidate, files)
      continue
    }
    if (!stat.isFile()) {
      throw new Error("Store package contains a non-file entry.")
    }
    if (stat.nlink > 1) {
      throw new Error("Store package contains hardlinked files and cannot be installed.")
    }
    files.set(realCandidate, {
      realPath: realCandidate,
      relativePath: normalizeRelativePath(path.relative(realRoot, realCandidate)),
      size: stat.size,
    })
  }
}

function coercePluginStoreCatalogEntry(value: unknown): PluginStoreCatalogEntry | undefined {
  if (!isRecord(value)) return undefined
  const source = isRecord(value.source) ? value.source : {}
  const packagePin = isRecord(value.package) ? value.package : undefined
  const id = stringValue(value.id)
  if (!id) return undefined
  return {
    schemaVersion: 1,
    id,
    runtime: pluginRuntimeValue(value.runtime),
    name: stringValue(value.name) ?? id,
    version: stringValue(value.version) ?? "0.0.0",
    source: {
      type: "git",
      repo: stringValue(source.repo) ?? "",
      commit: stringValue(source.commit) ?? "",
      path: stringValue(source.path),
    },
    package: packagePin
      ? {
          sha256: stringValue(packagePin.sha256),
          sizeBytes: numberValue(packagePin.sizeBytes),
          localPath: stringValue(packagePin.localPath),
        }
      : undefined,
    targetMode: (stringValue(value.targetMode) ?? "manifest-only") as PluginStoreCatalogEntry["targetMode"],
    declaredPermissions: stringArrayValue(value.declaredPermissions),
    declaredMcpServers: stringArrayValue(value.declaredMcpServers),
    controlledUi: isRecord(value.controlledUi)
      ? value.controlledUi as PluginStoreCatalogEntry["controlledUi"]
      : undefined,
  }
}

function stripLocalPackagePath(entry: PluginStoreCatalogEntry): PluginStoreCatalogEntry {
  const packagePin: PluginStorePackagePin | undefined = entry.package
    ? {
        sha256: entry.package.sha256,
        sizeBytes: entry.package.sizeBytes,
      }
    : undefined
  return {
    ...entry,
    package: packagePin,
  }
}

function normalizeRelativePath(value: string): string {
  return value.split(path.sep).join("/")
}

function assertPathInside(basePath: string, candidatePath: string): void {
  const relativePath = path.relative(basePath, candidatePath)
  if (relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))) {
    return
  }
  throw new Error("Store package path escapes the intended directory.")
}

function blockedIssue(
  code: PluginStoreValidationIssue["code"],
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : undefined
}

function stringArrayValue(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string")
}

function pluginRuntimeValue(value: unknown): PluginRuntime {
  return value === "codex" ? "codex" : "claude"
}

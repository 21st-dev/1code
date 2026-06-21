import { createHash } from "node:crypto"
import * as fssync from "node:fs"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import * as electron from "electron"
import { getElectronUserDataPath } from "../electron-app"
import { assertOfficialCloudAllowed } from "../local-only"

const SKILL_ID_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/
const STATE_VERSION = 1
const MANAGED_STATE_FILE_NAME = "skill-registry-managed-state.json"
const DEFAULT_REMOTE_REGISTRY_URL = process.env.ONECODE_SKILL_REGISTRY_URL
const SKIP_NAMES = new Set([".DS_Store", ".git", "__pycache__"])

export type SkillRuntime = "claude" | "codex"

let runtimeRootProviderForTest: ((runtime: SkillRuntime) => string) | null =
  null

export function setSkillRegistryRuntimeRootProviderForTest(
  provider: ((runtime: SkillRuntime) => string) | null,
): void {
  runtimeRootProviderForTest = provider
}

function getElectronApp(): Electron.App | undefined {
  const electronModule = electron as unknown as {
    app?: Electron.App
    default?: { app?: Electron.App }
  }
  return electronModule.app ?? electronModule.default?.app
}

export type RegistrySkillStatus =
  | "not-installed"
  | "installed"
  | "update-available"
  | "modified"
  | "user-owned"
  | "missing-source"
  | "integrity-error"

export interface SkillRegistryManifest {
  schemaVersion: 1
  registryId: string
  generatedAt: string
  skills: RegistrySkillManifestEntry[]
  collections?: RegistryCollectionManifestEntry[]
}

export interface RegistrySkillManifestEntry {
  id: string
  displayName: string
  version: string
  description: string
  source: string
  sha256: string
  compatibility?: {
    minAppVersion?: string
    runtimes?: string[]
  }
  license?: string
}

export interface RegistryCollectionManifestEntry {
  id: string
  displayName: string
  description: string
  sourceUrl: string
  installHint?: string
  recommendedAction?: string
  compatibility?: {
    runtimes?: string[]
  }
  license?: string
}

interface InstalledSkillState {
  id: string
  registryId: string
  version: string
  contentHash: string
  installPath: string
  installedAt: string
  lastCheckedAt: string
  sourceType: "bundled" | "remote"
  lastBackup?: {
    path: string
    createdAt: string
    previousState?: Omit<InstalledSkillState, "lastBackup">
  }
}

interface SkillRegistryState {
  schemaVersion: 1
  installed: Record<string, InstalledSkillState>
}

export interface ManagedSkillRuntimeInstallRecord {
  runtime: SkillRuntime
  installPath: string
  installedAt: string
  lastCheckedAt: string
  lastBackupPath?: string
  lastBackupCreatedAt?: string
}

export interface ManagedSkillInstallRecord {
  id: string
  registryId: string
  version: string
  contentHash: string
  sourceType: "bundled" | "remote"
  source?: string
  eligibleRuntimes: SkillRuntime[]
  installedAt: string
  updatedAt: string
  runtimes: Partial<Record<SkillRuntime, ManagedSkillRuntimeInstallRecord>>
}

interface ManagedSkillRegistryState {
  schemaVersion: 1
  installed: Record<string, ManagedSkillInstallRecord>
}

export interface RegistrySkillView {
  id: string
  displayName: string
  version: string
  description: string
  registryId: string
  registrySource: "bundled" | "remote"
  runtime: SkillRuntime
  source: string
  sha256: string
  status: RegistrySkillStatus
  installedVersion?: string
  installedHash?: string
  currentHash?: string
  installPath: string
  lastCheckedAt?: string
  lastBackupPath?: string
  hasRollback: boolean
  statusMessage?: string
}

export interface RegistryCollectionView {
  id: string
  displayName: string
  description: string
  registryId: string
  registrySource: "bundled" | "remote"
  sourceUrl: string
  installHint?: string
  recommendedAction?: string
  runtimes?: SkillRuntime[]
  license?: string
}

export interface InstallRegistrySkillInput {
  id: string
  runtime?: SkillRuntime
  force?: boolean
}

export interface RollbackRegistrySkillInput {
  id: string
  runtime?: SkillRuntime
}

function assertValidSkillId(id: string): void {
  if (!SKILL_ID_RE.test(id)) {
    throw new Error("Invalid registry skill id")
  }
}

function getRegistryRoot(): string {
  const electronApp = getElectronApp()
  if (electronApp?.isPackaged) {
    return path.join(process.resourcesPath, "skill-registry")
  }
  return path.resolve(process.cwd(), "resources", "skill-registry")
}

function getClaudeRoot(): string {
  return path.join(os.homedir(), ".claude")
}

function getCodexRoot(): string {
  return path.join(os.homedir(), ".codex")
}

function getRuntimeRoot(runtime: SkillRuntime): string {
  if (runtimeRootProviderForTest) return runtimeRootProviderForTest(runtime)
  return runtime === "codex" ? getCodexRoot() : getClaudeRoot()
}

function getSkillsRoot(runtime: SkillRuntime = "claude"): string {
  return path.join(getRuntimeRoot(runtime), "skills")
}

function getStatePath(runtime: SkillRuntime = "claude"): string {
  return path.join(getRuntimeRoot(runtime), "skill-registry-state.json")
}

function getBackupRoot(runtime: SkillRuntime = "claude"): string {
  return path.join(getRuntimeRoot(runtime), "skill-registry-backups")
}

export function getManagedSkillRegistryStatePath(
  userDataPath = getElectronUserDataPath(),
): string {
  return path.join(userDataPath, MANAGED_STATE_FILE_NAME)
}

function normalizeRelativePath(filePath: string): string {
  return filePath.split(path.sep).join("/")
}

function isPathInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child)
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  )
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, "utf-8")) as T
}

async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, "utf-8")
  await fs.rename(tmpPath, filePath)
}

async function readState(
  runtime: SkillRuntime = "claude",
): Promise<SkillRegistryState> {
  try {
    const state = await readJsonFile<SkillRegistryState>(getStatePath(runtime))
    if (state.schemaVersion !== STATE_VERSION || !state.installed) {
      return { schemaVersion: STATE_VERSION, installed: {} }
    }
    return state
  } catch {
    return { schemaVersion: STATE_VERSION, installed: {} }
  }
}

function emptyManagedState(): ManagedSkillRegistryState {
  return { schemaVersion: STATE_VERSION, installed: {} }
}

function getManagedStatePathOrNull(): string | null {
  try {
    return getManagedSkillRegistryStatePath()
  } catch {
    return null
  }
}

function normalizeSkillRuntime(value: unknown): SkillRuntime | null {
  return value === "claude" || value === "codex" ? value : null
}

function normalizeManagedSkillRuntimeInstallRecord(
  value: unknown,
): ManagedSkillRuntimeInstallRecord | null {
  if (!value || typeof value !== "object") return null
  const record = value as Partial<ManagedSkillRuntimeInstallRecord>
  const runtime = normalizeSkillRuntime(record.runtime)
  if (
    !runtime ||
    typeof record.installPath !== "string" ||
    typeof record.installedAt !== "string" ||
    typeof record.lastCheckedAt !== "string"
  ) {
    return null
  }

  return {
    runtime,
    installPath: record.installPath,
    installedAt: record.installedAt,
    lastCheckedAt: record.lastCheckedAt,
    ...(typeof record.lastBackupPath === "string" && record.lastBackupPath
      ? { lastBackupPath: record.lastBackupPath }
      : {}),
    ...(typeof record.lastBackupCreatedAt === "string" &&
    record.lastBackupCreatedAt
      ? { lastBackupCreatedAt: record.lastBackupCreatedAt }
      : {}),
  }
}

function normalizeManagedSkillInstallRecord(
  id: string,
  value: unknown,
): ManagedSkillInstallRecord | null {
  if (!value || typeof value !== "object") return null
  const record = value as Partial<ManagedSkillInstallRecord>
  if (
    record.id !== id ||
    typeof record.registryId !== "string" ||
    typeof record.version !== "string" ||
    typeof record.contentHash !== "string" ||
    (record.sourceType !== "bundled" && record.sourceType !== "remote") ||
    typeof record.installedAt !== "string" ||
    typeof record.updatedAt !== "string" ||
    !record.runtimes ||
    typeof record.runtimes !== "object"
  ) {
    return null
  }

  const runtimes: Partial<
    Record<SkillRuntime, ManagedSkillRuntimeInstallRecord>
  > = {}
  for (const [runtimeKey, runtimeValue] of Object.entries(record.runtimes)) {
    const runtime = normalizeSkillRuntime(runtimeKey)
    const runtimeRecord =
      normalizeManagedSkillRuntimeInstallRecord(runtimeValue)
    if (!runtime || !runtimeRecord || runtimeRecord.runtime !== runtime)
      continue
    runtimes[runtime] = runtimeRecord
  }

  const eligibleRuntimes = Array.from(
    new Set(
      (Array.isArray(record.eligibleRuntimes) ? record.eligibleRuntimes : [])
        .map(normalizeSkillRuntime)
        .filter((runtime): runtime is SkillRuntime => !!runtime),
    ),
  ).sort()

  return {
    id,
    registryId: record.registryId,
    version: record.version,
    contentHash: record.contentHash,
    sourceType: record.sourceType,
    ...(typeof record.source === "string" && record.source
      ? { source: record.source }
      : {}),
    eligibleRuntimes,
    installedAt: record.installedAt,
    updatedAt: record.updatedAt,
    runtimes,
  }
}

async function readManagedState(): Promise<ManagedSkillRegistryState> {
  const statePath = getManagedStatePathOrNull()
  if (!statePath) return emptyManagedState()

  try {
    const parsed =
      await readJsonFile<Partial<ManagedSkillRegistryState>>(statePath)
    const installed: Record<string, ManagedSkillInstallRecord> = {}
    if (parsed.schemaVersion !== STATE_VERSION || !parsed.installed) {
      return emptyManagedState()
    }
    for (const [id, value] of Object.entries(parsed.installed)) {
      if (!SKILL_ID_RE.test(id)) continue
      const record = normalizeManagedSkillInstallRecord(id, value)
      if (record) installed[id] = record
    }
    return { schemaVersion: STATE_VERSION, installed }
  } catch {
    return emptyManagedState()
  }
}

async function writeManagedState(
  state: ManagedSkillRegistryState,
): Promise<void> {
  const statePath = getManagedStatePathOrNull()
  if (!statePath) return
  await writeJsonAtomic(statePath, state)
}

async function writeState(
  state: SkillRegistryState,
  runtime: SkillRuntime = "claude",
): Promise<void> {
  await writeJsonAtomic(getStatePath(runtime), state)
}

function getManifestRuntimes(
  skill: Pick<RegistrySkillManifestEntry, "compatibility">,
  runtime: SkillRuntime,
): SkillRuntime[] {
  const manifestRuntimes =
    skill.compatibility?.runtimes?.filter(
      (value): value is SkillRuntime => value === "claude" || value === "codex",
    ) ?? []
  return Array.from(new Set([...manifestRuntimes, runtime])).sort()
}

function managedRecordToInstalledSkillState(
  record: ManagedSkillInstallRecord | undefined,
  runtime: SkillRuntime,
): InstalledSkillState | undefined {
  const runtimeRecord = record?.runtimes[runtime]
  if (!record || !runtimeRecord) return undefined

  return {
    id: record.id,
    registryId: record.registryId,
    version: record.version,
    contentHash: record.contentHash,
    installPath: runtimeRecord.installPath,
    installedAt: runtimeRecord.installedAt,
    lastCheckedAt: runtimeRecord.lastCheckedAt,
    sourceType: record.sourceType,
    ...(runtimeRecord.lastBackupPath
      ? {
          lastBackup: {
            path: runtimeRecord.lastBackupPath,
            createdAt:
              runtimeRecord.lastBackupCreatedAt ?? runtimeRecord.lastCheckedAt,
          },
        }
      : {}),
  }
}

async function upsertManagedSkillInstallRecord(input: {
  skill?: RegistrySkillManifestEntry & {
    registryId: string
    registrySource: "bundled" | "remote"
  }
  runtime: SkillRuntime
  install: InstalledSkillState
  now: string
}): Promise<void> {
  const managedState = await readManagedState()
  const existing = managedState.installed[input.install.id]
  const eligibleRuntimes = Array.from(
    new Set([
      ...(existing?.eligibleRuntimes ?? []),
      ...(input.skill
        ? getManifestRuntimes(input.skill, input.runtime)
        : [input.runtime]),
    ]),
  ).sort()
  const runtimes = {
    ...(existing?.runtimes ?? {}),
    [input.runtime]: {
      runtime: input.runtime,
      installPath: input.install.installPath,
      installedAt: input.install.installedAt,
      lastCheckedAt: input.install.lastCheckedAt,
      ...(input.install.lastBackup?.path
        ? {
            lastBackupPath: input.install.lastBackup.path,
            lastBackupCreatedAt: input.install.lastBackup.createdAt,
          }
        : {}),
    },
  }

  managedState.installed[input.install.id] = {
    id: input.install.id,
    registryId: input.install.registryId,
    version: input.install.version,
    contentHash: input.install.contentHash,
    sourceType: input.install.sourceType,
    ...((input.skill?.source ?? existing?.source)
      ? { source: input.skill?.source ?? existing?.source }
      : {}),
    eligibleRuntimes,
    installedAt: existing?.installedAt ?? input.install.installedAt,
    updatedAt: input.now,
    runtimes,
  }
  await writeManagedState(managedState)
}

async function removeManagedSkillRuntime(input: {
  id: string
  runtime: SkillRuntime
  now: string
}): Promise<void> {
  const managedState = await readManagedState()
  const existing = managedState.installed[input.id]
  if (!existing) return

  const runtimes = { ...existing.runtimes }
  delete runtimes[input.runtime]
  if (Object.keys(runtimes).length === 0) {
    delete managedState.installed[input.id]
  } else {
    managedState.installed[input.id] = {
      ...existing,
      updatedAt: input.now,
      runtimes,
    }
  }
  await writeManagedState(managedState)
}

export async function listManagedSkillInstallRecords(): Promise<
  ManagedSkillInstallRecord[]
> {
  const state = await readManagedState()
  return Object.values(state.installed).sort((a, b) => a.id.localeCompare(b.id))
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function collectFiles(root: string): Promise<string[]> {
  const files: string[] = []

  async function walk(current: string, relativeBase: string): Promise<void> {
    const entries = await fs.readdir(current, { withFileTypes: true })

    for (const entry of entries) {
      if (SKIP_NAMES.has(entry.name)) continue

      const absolutePath = path.join(current, entry.name)
      const relativePath = path.join(relativeBase, entry.name)

      if (entry.isSymbolicLink()) {
        throw new Error(
          `Registry packages cannot contain symlinks: ${relativePath}`,
        )
      }

      if (entry.isDirectory()) {
        await walk(absolutePath, relativePath)
      } else if (entry.isFile()) {
        files.push(normalizeRelativePath(relativePath))
      }
    }
  }

  await walk(root, "")
  files.sort()
  return files
}

export async function hashSkillDirectory(root: string): Promise<string | null> {
  if (!(await pathExists(root))) return null

  const hash = createHash("sha256")
  const files = await collectFiles(root)

  for (const file of files) {
    hash.update(file)
    hash.update("\0")
    hash.update(await fs.readFile(path.join(root, file)))
    hash.update("\0")
  }

  return hash.digest("hex")
}

function validateManifest(
  manifest: SkillRegistryManifest,
): SkillRegistryManifest {
  if (manifest.schemaVersion !== STATE_VERSION) {
    throw new Error("Unsupported skill registry manifest version")
  }
  if (!manifest.registryId || !Array.isArray(manifest.skills)) {
    throw new Error("Invalid skill registry manifest")
  }

  for (const skill of manifest.skills) {
    assertValidSkillId(skill.id)
    if (
      !skill.version ||
      !skill.source ||
      !/^[a-f0-9]{64}$/i.test(skill.sha256)
    ) {
      throw new Error(`Invalid registry skill entry: ${skill.id}`)
    }
  }

  for (const collection of manifest.collections ?? []) {
    assertValidSkillId(collection.id)
    if (!collection.displayName || !collection.sourceUrl) {
      throw new Error(`Invalid registry collection entry: ${collection.id}`)
    }
    const sourceUrl = new URL(collection.sourceUrl)
    if (sourceUrl.protocol !== "https:") {
      throw new Error(
        `Invalid registry collection source URL: ${collection.id}`,
      )
    }
  }

  return manifest
}

export async function loadBundledRegistryManifest(): Promise<SkillRegistryManifest> {
  const manifestPath = path.join(getRegistryRoot(), "manifest.json")
  return validateManifest(
    await readJsonFile<SkillRegistryManifest>(manifestPath),
  )
}

async function fetchRemoteRegistryManifest(): Promise<SkillRegistryManifest | null> {
  if (!DEFAULT_REMOTE_REGISTRY_URL) return null

  const url = new URL(DEFAULT_REMOTE_REGISTRY_URL)
  const electronApp = getElectronApp()
  if (url.protocol !== "https:" && electronApp?.isPackaged) {
    throw new Error("Remote skill registry must use HTTPS in packaged builds")
  }

  assertOfficialCloudAllowed("fetch remote skill registry", url.toString())
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Remote skill registry check failed: ${response.status}`)
  }

  return validateManifest((await response.json()) as SkillRegistryManifest)
}

function mergeRegistries(
  bundled: SkillRegistryManifest,
  remote: SkillRegistryManifest | null,
): Array<
  RegistrySkillManifestEntry & {
    registryId: string
    registrySource: "bundled" | "remote"
  }
> {
  const merged = new Map<
    string,
    RegistrySkillManifestEntry & {
      registryId: string
      registrySource: "bundled" | "remote"
    }
  >()

  for (const skill of bundled.skills) {
    merged.set(skill.id, {
      ...skill,
      registryId: bundled.registryId,
      registrySource: "bundled",
    })
  }

  if (remote) {
    for (const skill of remote.skills) {
      merged.set(skill.id, {
        ...skill,
        registryId: remote.registryId,
        registrySource: "remote",
      })
    }
  }

  return Array.from(merged.values()).sort((a, b) => a.id.localeCompare(b.id))
}

function mergeRegistryCollections(
  bundled: SkillRegistryManifest,
  remote: SkillRegistryManifest | null,
): Array<
  RegistryCollectionManifestEntry & {
    registryId: string
    registrySource: "bundled" | "remote"
  }
> {
  const merged = new Map<
    string,
    RegistryCollectionManifestEntry & {
      registryId: string
      registrySource: "bundled" | "remote"
    }
  >()

  for (const collection of bundled.collections ?? []) {
    merged.set(collection.id, {
      ...collection,
      registryId: bundled.registryId,
      registrySource: "bundled",
    })
  }

  if (remote) {
    for (const collection of remote.collections ?? []) {
      merged.set(collection.id, {
        ...collection,
        registryId: remote.registryId,
        registrySource: "remote",
      })
    }
  }

  return Array.from(merged.values()).sort((a, b) => a.id.localeCompare(b.id))
}

function getInstallPath(id: string, runtime: SkillRuntime = "claude"): string {
  assertValidSkillId(id)
  return path.join(getSkillsRoot(runtime), id)
}

function resolveBundledSourceDir(source: string): string {
  const registryRoot = getRegistryRoot()
  const sourcePath = path.resolve(registryRoot, source)
  if (!isPathInside(registryRoot, sourcePath)) {
    throw new Error("Invalid registry source path")
  }
  return sourcePath
}

async function readSkillStatus(
  skill: RegistrySkillManifestEntry & {
    registryId: string
    registrySource: "bundled" | "remote"
  },
  legacyState: SkillRegistryState,
  managedState: ManagedSkillRegistryState,
  now: string,
  runtime: SkillRuntime,
): Promise<RegistrySkillView> {
  const installPath = getInstallPath(skill.id, runtime)
  const installed =
    managedRecordToInstalledSkillState(
      managedState.installed[skill.id],
      runtime,
    ) ?? legacyState.installed[skill.id]
  const currentHash = await hashSkillDirectory(installPath)

  let status: RegistrySkillStatus = "not-installed"
  let statusMessage: string | undefined

  if (skill.registrySource === "bundled") {
    const sourceDir = resolveBundledSourceDir(skill.source)
    const sourceHash = await hashSkillDirectory(sourceDir)
    if (!sourceHash) {
      status = "missing-source"
      statusMessage = "Bundled source is missing."
    } else if (sourceHash !== skill.sha256) {
      status = "integrity-error"
      statusMessage = "Bundled source hash does not match the manifest."
    }
  }

  if (status === "not-installed") {
    if (installed) {
      if (!currentHash) {
        status = "not-installed"
        statusMessage = "Installed state exists, but files are missing."
      } else if (currentHash !== installed.contentHash) {
        status = "modified"
        statusMessage = "Installed files were modified locally."
      } else if (
        installed.version !== skill.version ||
        installed.contentHash !== skill.sha256
      ) {
        status = "update-available"
      } else {
        status = "installed"
      }
    } else if (currentHash) {
      status = "user-owned"
      statusMessage = "A user-created skill already exists with this id."
    }
  }

  return {
    id: skill.id,
    displayName: skill.displayName || skill.id,
    version: skill.version,
    description: skill.description || "",
    registryId: skill.registryId,
    registrySource: skill.registrySource,
    runtime,
    source: skill.source,
    sha256: skill.sha256,
    status,
    installedVersion: installed?.version,
    installedHash: installed?.contentHash,
    currentHash: currentHash ?? undefined,
    installPath,
    lastCheckedAt: installed?.lastCheckedAt ?? now,
    lastBackupPath: installed?.lastBackup?.path,
    hasRollback:
      !!installed?.lastBackup?.path &&
      fssync.existsSync(installed.lastBackup.path),
    statusMessage,
  }
}

export async function listRegistrySkills(options?: {
  checkRemote?: boolean
  runtime?: SkillRuntime
}): Promise<RegistrySkillView[]> {
  const runtime = options?.runtime ?? "claude"
  const now = new Date().toISOString()
  const [bundled, legacyState, managedState] = await Promise.all([
    loadBundledRegistryManifest(),
    readState(runtime),
    readManagedState(),
  ])
  const remote = options?.checkRemote
    ? await fetchRemoteRegistryManifest()
    : null
  const entries = mergeRegistries(bundled, remote)

  return Promise.all(
    entries.map((skill) =>
      readSkillStatus(skill, legacyState, managedState, now, runtime),
    ),
  )
}

export async function listRegistryCollections(options?: {
  checkRemote?: boolean
}): Promise<RegistryCollectionView[]> {
  const [bundled, remote] = await Promise.all([
    loadBundledRegistryManifest(),
    options?.checkRemote
      ? fetchRemoteRegistryManifest()
      : Promise.resolve(null),
  ])
  const collections = mergeRegistryCollections(bundled, remote)

  return collections.map((collection) => ({
    id: collection.id,
    displayName: collection.displayName || collection.id,
    description: collection.description || "",
    registryId: collection.registryId,
    registrySource: collection.registrySource,
    sourceUrl: collection.sourceUrl,
    installHint: collection.installHint,
    recommendedAction: collection.recommendedAction,
    runtimes: collection.compatibility?.runtimes?.filter(
      (runtime): runtime is SkillRuntime =>
        runtime === "claude" || runtime === "codex",
    ),
    license: collection.license,
  }))
}

async function getRegistryEntry(id: string): Promise<
  RegistrySkillManifestEntry & {
    registryId: string
    registrySource: "bundled" | "remote"
  }
> {
  assertValidSkillId(id)
  const skills = mergeRegistries(await loadBundledRegistryManifest(), null)
  const skill = skills.find((entry) => entry.id === id)
  if (!skill) {
    throw new Error(`Registry skill "${id}" not found`)
  }
  return skill
}

async function validateBundledPackage(
  skill: RegistrySkillManifestEntry & { registrySource: "bundled" | "remote" },
): Promise<string> {
  if (skill.registrySource !== "bundled") {
    throw new Error("Remote registry package install is not enabled yet")
  }
  const sourceDir = resolveBundledSourceDir(skill.source)
  const sourceHash = await hashSkillDirectory(sourceDir)
  if (!sourceHash) {
    throw new Error(`Bundled source for "${skill.id}" is missing`)
  }
  if (sourceHash !== skill.sha256) {
    throw new Error(`Integrity check failed for "${skill.id}"`)
  }
  if (!(await pathExists(path.join(sourceDir, "SKILL.md")))) {
    throw new Error(`Registry skill "${skill.id}" is missing SKILL.md`)
  }
  return sourceDir
}

function copyFilter(source: string): boolean {
  return !SKIP_NAMES.has(path.basename(source))
}

async function backupExistingSkill(
  id: string,
  targetDir: string,
  runtime: SkillRuntime,
  previousState?: InstalledSkillState,
): Promise<InstalledSkillState["lastBackup"] | undefined> {
  if (!(await pathExists(targetDir))) return undefined

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const backupDir = path.join(getBackupRoot(runtime), id, timestamp)
  await fs.mkdir(path.dirname(backupDir), { recursive: true })
  await fs.rm(backupDir, { recursive: true, force: true })
  await fs.cp(targetDir, backupDir, {
    recursive: true,
    force: true,
    filter: copyFilter,
  })

  let previous: Omit<InstalledSkillState, "lastBackup"> | undefined
  if (previousState) {
    const { lastBackup: _lastBackup, ...rest } = previousState
    previous = rest
  }

  return {
    path: backupDir,
    createdAt: new Date().toISOString(),
    previousState: previous,
  }
}

export async function installRegistrySkill(
  input: InstallRegistrySkillInput,
): Promise<RegistrySkillView> {
  const { id, runtime = "claude", force = false } = input
  const skill = await getRegistryEntry(id)
  if (skill.registrySource !== "bundled") {
    throw new Error("Remote registry package install is not enabled yet")
  }

  const sourceDir = await validateBundledPackage(skill)
  const state = await readState(runtime)
  const targetDir = getInstallPath(id, runtime)
  const previousState = state.installed[id]
  const currentHash = await hashSkillDirectory(targetDir)

  if (currentHash && !previousState && !force) {
    throw new Error(
      `Skill "${id}" already exists as a user skill. Confirm restore before replacing it.`,
    )
  }
  if (
    currentHash &&
    previousState &&
    currentHash !== previousState.contentHash &&
    !force
  ) {
    throw new Error(
      `Skill "${id}" was modified locally. Confirm restore before replacing it.`,
    )
  }

  const lastBackup = await backupExistingSkill(
    id,
    targetDir,
    runtime,
    previousState,
  )
  await fs.rm(targetDir, { recursive: true, force: true })
  await fs.mkdir(path.dirname(targetDir), { recursive: true })
  await fs.cp(sourceDir, targetDir, {
    recursive: true,
    force: true,
    filter: copyFilter,
  })

  const now = new Date().toISOString()
  const installState: InstalledSkillState = {
    id,
    registryId: skill.registryId,
    version: skill.version,
    contentHash: skill.sha256,
    installPath: targetDir,
    installedAt: previousState?.installedAt ?? now,
    lastCheckedAt: now,
    sourceType: skill.registrySource,
    lastBackup,
  }
  state.installed[id] = installState
  await writeState(state, runtime)
  await upsertManagedSkillInstallRecord({
    skill,
    runtime,
    install: installState,
    now,
  })

  return (await listRegistrySkills({ runtime })).find((item) => item.id === id)!
}

export async function rollbackRegistrySkill(
  input: RollbackRegistrySkillInput,
): Promise<RegistrySkillView | null> {
  const { id, runtime = "claude" } = input
  assertValidSkillId(id)

  const state = await readState(runtime)
  const installed = state.installed[id]
  const backup = installed?.lastBackup
  if (!installed || !backup?.path || !(await pathExists(backup.path))) {
    throw new Error(`No registry backup available for "${id}"`)
  }

  const backupRoot = path.join(getBackupRoot(runtime), id)
  const backupPath = path.resolve(backup.path)
  if (!isPathInside(backupRoot, backupPath)) {
    throw new Error("Invalid registry backup path")
  }

  const targetDir = getInstallPath(id, runtime)
  await fs.rm(targetDir, { recursive: true, force: true })
  await fs.mkdir(path.dirname(targetDir), { recursive: true })
  await fs.cp(backupPath, targetDir, {
    recursive: true,
    force: true,
    filter: copyFilter,
  })

  if (backup.previousState) {
    state.installed[id] = {
      ...backup.previousState,
      lastCheckedAt: new Date().toISOString(),
    }
  } else {
    delete state.installed[id]
  }

  await writeState(state, runtime)
  const now = new Date().toISOString()
  if (state.installed[id]) {
    await upsertManagedSkillInstallRecord({
      runtime,
      install: state.installed[id],
      now,
    })
  } else {
    await removeManagedSkillRuntime({ id, runtime, now })
  }
  return (
    (await listRegistrySkills({ runtime })).find((item) => item.id === id) ??
    null
  )
}

export async function getRegistryMetadataForSkillId(id: string): Promise<{
  id: string
  status: RegistrySkillStatus
  version: string
  registryId: string
} | null> {
  if (!SKILL_ID_RE.test(id)) return null
  const skill = (await listRegistrySkills()).find((entry) => entry.id === id)
  if (!skill) return null
  if (!["installed", "modified", "update-available"].includes(skill.status)) {
    return null
  }
  return {
    id: skill.id,
    status: skill.status,
    version: skill.version,
    registryId: skill.registryId,
  }
}

import { createHash } from "crypto"
import * as electron from "electron"
import * as fs from "fs/promises"
import * as fssync from "fs"
import * as os from "os"
import * as path from "path"

const SKILL_ID_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/
const STATE_VERSION = 1
const DEFAULT_REMOTE_REGISTRY_URL = process.env.ONECODE_SKILL_REGISTRY_URL
const SKIP_NAMES = new Set([".DS_Store", ".git", "__pycache__"])

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

export interface RegistrySkillView {
  id: string
  displayName: string
  version: string
  description: string
  registryId: string
  registrySource: "bundled" | "remote"
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

export interface InstallRegistrySkillInput {
  id: string
  force?: boolean
}

export interface RollbackRegistrySkillInput {
  id: string
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

function getSkillsRoot(): string {
  return path.join(getClaudeRoot(), "skills")
}

function getStatePath(): string {
  return path.join(getClaudeRoot(), "skill-registry-state.json")
}

function getBackupRoot(): string {
  return path.join(getClaudeRoot(), "skill-registry-backups")
}

function normalizeRelativePath(filePath: string): string {
  return filePath.split(path.sep).join("/")
}

function isPathInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child)
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
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

async function readState(): Promise<SkillRegistryState> {
  try {
    const state = await readJsonFile<SkillRegistryState>(getStatePath())
    if (state.schemaVersion !== STATE_VERSION || !state.installed) {
      return { schemaVersion: STATE_VERSION, installed: {} }
    }
    return state
  } catch {
    return { schemaVersion: STATE_VERSION, installed: {} }
  }
}

async function writeState(state: SkillRegistryState): Promise<void> {
  await writeJsonAtomic(getStatePath(), state)
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
        throw new Error(`Registry packages cannot contain symlinks: ${relativePath}`)
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

function validateManifest(manifest: SkillRegistryManifest): SkillRegistryManifest {
  if (manifest.schemaVersion !== STATE_VERSION) {
    throw new Error("Unsupported skill registry manifest version")
  }
  if (!manifest.registryId || !Array.isArray(manifest.skills)) {
    throw new Error("Invalid skill registry manifest")
  }

  for (const skill of manifest.skills) {
    assertValidSkillId(skill.id)
    if (!skill.version || !skill.source || !/^[a-f0-9]{64}$/i.test(skill.sha256)) {
      throw new Error(`Invalid registry skill entry: ${skill.id}`)
    }
  }

  return manifest
}

export async function loadBundledRegistryManifest(): Promise<SkillRegistryManifest> {
  const manifestPath = path.join(getRegistryRoot(), "manifest.json")
  return validateManifest(await readJsonFile<SkillRegistryManifest>(manifestPath))
}

async function fetchRemoteRegistryManifest(): Promise<SkillRegistryManifest | null> {
  if (!DEFAULT_REMOTE_REGISTRY_URL) return null

  const url = new URL(DEFAULT_REMOTE_REGISTRY_URL)
  const electronApp = getElectronApp()
  if (url.protocol !== "https:" && electronApp?.isPackaged) {
    throw new Error("Remote skill registry must use HTTPS in packaged builds")
  }

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Remote skill registry check failed: ${response.status}`)
  }

  return validateManifest((await response.json()) as SkillRegistryManifest)
}

function mergeRegistries(
  bundled: SkillRegistryManifest,
  remote: SkillRegistryManifest | null,
): Array<RegistrySkillManifestEntry & { registryId: string; registrySource: "bundled" | "remote" }> {
  const merged = new Map<string, RegistrySkillManifestEntry & { registryId: string; registrySource: "bundled" | "remote" }>()

  for (const skill of bundled.skills) {
    merged.set(skill.id, { ...skill, registryId: bundled.registryId, registrySource: "bundled" })
  }

  if (remote) {
    for (const skill of remote.skills) {
      merged.set(skill.id, { ...skill, registryId: remote.registryId, registrySource: "remote" })
    }
  }

  return Array.from(merged.values()).sort((a, b) => a.id.localeCompare(b.id))
}

function getInstallPath(id: string): string {
  assertValidSkillId(id)
  return path.join(getSkillsRoot(), id)
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
  skill: RegistrySkillManifestEntry & { registryId: string; registrySource: "bundled" | "remote" },
  state: SkillRegistryState,
  now: string,
): Promise<RegistrySkillView> {
  const installPath = getInstallPath(skill.id)
  const installed = state.installed[skill.id]
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
      } else if (installed.version !== skill.version || installed.contentHash !== skill.sha256) {
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
    source: skill.source,
    sha256: skill.sha256,
    status,
    installedVersion: installed?.version,
    installedHash: installed?.contentHash,
    currentHash: currentHash ?? undefined,
    installPath,
    lastCheckedAt: installed?.lastCheckedAt ?? now,
    lastBackupPath: installed?.lastBackup?.path,
    hasRollback: !!installed?.lastBackup?.path && fssync.existsSync(installed.lastBackup.path),
    statusMessage,
  }
}

export async function listRegistrySkills(options?: { checkRemote?: boolean }): Promise<RegistrySkillView[]> {
  const now = new Date().toISOString()
  const [bundled, state] = await Promise.all([
    loadBundledRegistryManifest(),
    readState(),
  ])
  const remote = options?.checkRemote ? await fetchRemoteRegistryManifest() : null
  const entries = mergeRegistries(bundled, remote)

  return Promise.all(entries.map((skill) => readSkillStatus(skill, state, now)))
}

async function getRegistryEntry(
  id: string,
): Promise<RegistrySkillManifestEntry & { registryId: string; registrySource: "bundled" | "remote" }> {
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

async function backupExistingSkill(id: string, targetDir: string, previousState?: InstalledSkillState): Promise<InstalledSkillState["lastBackup"] | undefined> {
  if (!(await pathExists(targetDir))) return undefined

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const backupDir = path.join(getBackupRoot(), id, timestamp)
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

export async function installRegistrySkill(input: InstallRegistrySkillInput): Promise<RegistrySkillView> {
  const { id, force = false } = input
  const skill = await getRegistryEntry(id)
  if (skill.registrySource !== "bundled") {
    throw new Error("Remote registry package install is not enabled yet")
  }

  const sourceDir = await validateBundledPackage(skill)
  const state = await readState()
  const targetDir = getInstallPath(id)
  const previousState = state.installed[id]
  const currentHash = await hashSkillDirectory(targetDir)

  if (currentHash && !previousState && !force) {
    throw new Error(`Skill "${id}" already exists as a user skill. Confirm restore before replacing it.`)
  }
  if (currentHash && previousState && currentHash !== previousState.contentHash && !force) {
    throw new Error(`Skill "${id}" was modified locally. Confirm restore before replacing it.`)
  }

  const lastBackup = await backupExistingSkill(id, targetDir, previousState)
  await fs.rm(targetDir, { recursive: true, force: true })
  await fs.mkdir(path.dirname(targetDir), { recursive: true })
  await fs.cp(sourceDir, targetDir, {
    recursive: true,
    force: true,
    filter: copyFilter,
  })

  const now = new Date().toISOString()
  state.installed[id] = {
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
  await writeState(state)

  return (await listRegistrySkills()).find((item) => item.id === id)!
}

export async function rollbackRegistrySkill(input: RollbackRegistrySkillInput): Promise<RegistrySkillView | null> {
  const { id } = input
  assertValidSkillId(id)

  const state = await readState()
  const installed = state.installed[id]
  const backup = installed?.lastBackup
  if (!installed || !backup?.path || !(await pathExists(backup.path))) {
    throw new Error(`No registry backup available for "${id}"`)
  }

  const backupRoot = path.join(getBackupRoot(), id)
  const backupPath = path.resolve(backup.path)
  if (!isPathInside(backupRoot, backupPath)) {
    throw new Error("Invalid registry backup path")
  }

  const targetDir = getInstallPath(id)
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

  await writeState(state)
  return (await listRegistrySkills()).find((item) => item.id === id) ?? null
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

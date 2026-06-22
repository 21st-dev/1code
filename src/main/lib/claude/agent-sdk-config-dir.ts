import * as fs from "node:fs/promises"
import * as os from "node:os"
import path from "node:path"
import type { RuntimeNativePluginActivationScopeContext } from "../plugins/update-review-state"
import {
  type ClaudeNativePluginStagingFailureInput,
  replaceClaudeNativePluginStagingFailures,
} from "./plugin-staging-state"

type ClaudeAgentSdkConfigDirFs = {
  mkdir: typeof fs.mkdir
  readFile: typeof fs.readFile
  readdir: typeof fs.readdir
  writeFile: typeof fs.writeFile
  stat: typeof fs.stat
  lstat: typeof fs.lstat
  symlink: typeof fs.symlink
  unlink: typeof fs.unlink
  rm: typeof fs.rm
}

export type ClaudeAgentSdkIsolatedConfig = {
  isolatedConfigDir: string
  cacheKey: string
}

export type ClaudeAgentSdkConfigDirDependencies = {
  fs: ClaudeAgentSdkConfigDirFs
  homeDir: () => string
  platform: NodeJS.Platform
  getPluginSafeModeState: () => Promise<{ enabled: boolean }>
  getClaudePluginStagingEntries: (
    scopeContext?: RuntimeNativePluginActivationScopeContext,
  ) => Promise<ClaudePluginStagingEntry[]>
  logger: Pick<Console, "warn">
}

export interface ClaudePluginStagingEntry {
  pluginSource: string
  marketplace: string
  name: string
  version: string
  path: string
  description?: string
  category?: string
  homepage?: string
  tags?: string[]
}

export interface ClaudeStagedNativePluginEntry
  extends ClaudePluginStagingEntry {
  stagedPath: string
}

export interface ClaudeAgentSdkNativePluginConfig {
  type: "local"
  path: string
  skipMcpDiscovery: true
}

export interface ClaudeAgentSdkIsolatedConfigDirResult {
  nativePluginConfigs: ClaudeAgentSdkNativePluginConfig[]
}

const symlinksCreated = new Set<string>()
const CLAUDE_PLUGIN_METADATA_DIR = ".claude-plugin"

const defaultDependencies: ClaudeAgentSdkConfigDirDependencies = {
  fs,
  homeDir: os.homedir,
  platform: process.platform,
  getPluginSafeModeState: async () => {
    const state = await import("../plugins/update-review-state")
    return state.getPluginSafeModeState()
  },
  getClaudePluginStagingEntries: async (scopeContext) => {
    const [{ getEnabledPlugins, getApprovedPluginMcpServers }, gates] =
      await Promise.all([
        import("../trpc/routers/claude-settings"),
        import("../plugins/runtime-gates"),
      ])
    return gates.discoverAllowedClaudeNativePluginRuntimeComponents({
      enabledPluginSources: await getEnabledPlugins(),
      approvedPluginMcpServerIdentifiers: await getApprovedPluginMcpServers(),
      scopeContext,
    })
  },
  logger: console,
}

function withDefaultDependencies(
  dependencies: Partial<ClaudeAgentSdkConfigDirDependencies> | undefined,
): ClaudeAgentSdkConfigDirDependencies {
  return {
    ...defaultDependencies,
    ...dependencies,
    fs: {
      ...defaultDependencies.fs,
      ...dependencies?.fs,
    },
  }
}

export function resolveClaudeAgentSdkIsolatedConfig(input: {
  userDataDir: string
  chatId: string
  subChatId: string
  isUsingOllama: boolean
}): ClaudeAgentSdkIsolatedConfig {
  const ownerId = input.isUsingOllama ? input.chatId : input.subChatId
  return {
    isolatedConfigDir: path.join(input.userDataDir, "claude-sessions", ownerId),
    cacheKey: ownerId,
  }
}

export function clearClaudeAgentSdkIsolatedConfigDirCache(): void {
  symlinksCreated.clear()
}

async function removeManagedPath(input: {
  targetPath: string
  label: string
  dependencies: ClaudeAgentSdkConfigDirDependencies
  markIncomplete: () => void
  markError: () => void
}): Promise<boolean> {
  try {
    await input.dependencies.fs.rm(input.targetPath, {
      recursive: true,
      force: true,
    })
    return true
  } catch (err) {
    input.markIncomplete()
    input.markError()
    input.dependencies.logger.warn(
      `[claude] Failed to remove managed ${input.label}:`,
      (err as Error).message,
    )
    return false
  }
}

async function ensureSymlink(input: {
  sourcePath: string
  targetPath: string
  label: string
  targetKind: "dir" | "file"
  symlinkType: "dir" | "junction"
  dependencies: ClaudeAgentSdkConfigDirDependencies
  markIncomplete: () => void
  markError: () => void
}): Promise<boolean> {
  try {
    const sourceExists = await input.dependencies.fs
      .stat(input.sourcePath)
      .then(() => true)
      .catch(() => false)
    const targetExists = await input.dependencies.fs
      .lstat(input.targetPath)
      .then(() => true)
      .catch(() => false)

    if (!sourceExists) {
      input.markIncomplete()
      return false
    }

    if (!targetExists) {
      if (input.targetKind === "dir") {
        await input.dependencies.fs.symlink(
          input.sourcePath,
          input.targetPath,
          input.symlinkType,
        )
      } else {
        await input.dependencies.fs.symlink(input.sourcePath, input.targetPath)
      }
    }

    return true
  } catch (symlinkErr) {
    input.markIncomplete()
    input.markError()
    input.dependencies.logger.warn(
      `[claude] Failed to symlink ${input.label}:`,
      (symlinkErr as Error).message,
    )
    return false
  }
}

async function hasClaudePluginManifest(input: {
  sourcePath: string
  dependencies: ClaudeAgentSdkConfigDirDependencies
}): Promise<boolean> {
  for (const manifestName of ["plugin.json", "marketplace.json"]) {
    const manifestPath = path.join(
      input.sourcePath,
      CLAUDE_PLUGIN_METADATA_DIR,
      manifestName,
    )
    const exists = await input.dependencies.fs
      .stat(manifestPath)
      .then((stat) => stat.isFile())
      .catch(() => false)
    if (exists) return true
  }
  return false
}

async function stageClaudeNonPluginAssetDirectory(input: {
  sourcePath: string
  targetPath: string
  label: string
  symlinkType: "dir" | "junction"
  dependencies: ClaudeAgentSdkConfigDirDependencies
  markIncomplete: () => void
  markError: () => void
}): Promise<boolean> {
  const removedPreviousTarget = await removeManagedPath({
    targetPath: input.targetPath,
    label: input.label,
    dependencies: input.dependencies,
    markIncomplete: input.markIncomplete,
    markError: input.markError,
  })
  if (!removedPreviousTarget) return false

  const sourceStat = await input.dependencies.fs
    .stat(input.sourcePath)
    .catch(() => undefined)
  if (!sourceStat?.isDirectory()) {
    input.markIncomplete()
    return false
  }

  let entryNames: string[]
  try {
    await input.dependencies.fs.mkdir(input.targetPath, { recursive: true })
    const entries = await input.dependencies.fs.readdir(input.sourcePath, {
      withFileTypes: true,
    })
    entryNames = entries.map((entry) => String(entry.name))
  } catch (err) {
    input.markIncomplete()
    input.markError()
    input.dependencies.logger.warn(
      `[claude] Failed to stage ${input.label}:`,
      (err as Error).message,
    )
    return false
  }
  let stagedAllAssets = true
  for (const entryName of entryNames) {
    if (entryName === CLAUDE_PLUGIN_METADATA_DIR) continue

    const sourceEntryPath = path.join(input.sourcePath, entryName)
    const targetEntryPath = path.join(input.targetPath, entryName)
    const entryStat = await input.dependencies.fs
      .stat(sourceEntryPath)
      .catch(() => undefined)
    if (!entryStat) {
      input.markIncomplete()
      stagedAllAssets = false
      continue
    }
    if (
      entryStat.isDirectory() &&
      (await hasClaudePluginManifest({
        sourcePath: sourceEntryPath,
        dependencies: input.dependencies,
      }))
    ) {
      continue
    }

    const linked = await ensureSymlink({
      sourcePath: sourceEntryPath,
      targetPath: targetEntryPath,
      label: `${input.label} entry ${entryName}`,
      targetKind: entryStat.isDirectory() ? "dir" : "file",
      symlinkType: input.symlinkType,
      dependencies: input.dependencies,
      markIncomplete: input.markIncomplete,
      markError: input.markError,
    })
    if (!linked) stagedAllAssets = false
  }

  return stagedAllAssets
}

async function writeFilteredSettings(input: {
  settingsSource: string
  settingsTarget: string
  enabledPluginSources: string[]
  dependencies: ClaudeAgentSdkConfigDirDependencies
  markError: () => void
}): Promise<void> {
  let settings: Record<string, unknown> = {}
  try {
    settings = JSON.parse(
      await input.dependencies.fs.readFile(input.settingsSource, "utf-8"),
    ) as Record<string, unknown>
  } catch {
    settings = {}
  }

  const enabledSources = new Set(input.enabledPluginSources)
  const approvedPluginMcpServers = Array.isArray(
    settings.approvedPluginMcpServers,
  )
    ? (settings.approvedPluginMcpServers as unknown[]).filter(
        (identifier): identifier is string =>
          typeof identifier === "string" &&
          input.enabledPluginSources.some((source) =>
            identifier.startsWith(`${source}:`),
          ),
      )
    : undefined

  settings.enabledPlugins = Array.from(enabledSources).sort()
  if (approvedPluginMcpServers) {
    settings.approvedPluginMcpServers = approvedPluginMcpServers
  }

  try {
    const existing = await input.dependencies.fs
      .lstat(input.settingsTarget)
      .catch(() => undefined)
    if (existing?.isSymbolicLink() || existing?.isDirectory()) {
      await input.dependencies.fs.rm(input.settingsTarget, {
        recursive: true,
        force: true,
      })
    }
    await input.dependencies.fs.writeFile(
      input.settingsTarget,
      `${JSON.stringify(settings, null, 2)}\n`,
      "utf-8",
    )
  } catch (err) {
    input.markError()
    input.dependencies.logger.warn(
      "[claude] Failed to write filtered settings.json:",
      (err as Error).message,
    )
  }
}

async function stageClaudePlugins(input: {
  pluginsTarget: string
  entries: ClaudePluginStagingEntry[]
  dependencies: ClaudeAgentSdkConfigDirDependencies
  markIncomplete: () => void
  markError: () => void
}): Promise<{
  stagedEntries: ClaudeStagedNativePluginEntry[]
  failedEntries: ClaudeNativePluginStagingFailureInput[]
}> {
  const removedPreviousPlugins = await removeManagedPath({
    targetPath: input.pluginsTarget,
    label: "plugins directory",
    dependencies: input.dependencies,
    markIncomplete: input.markIncomplete,
    markError: input.markError,
  })
  if (!removedPreviousPlugins) {
    return {
      stagedEntries: [],
      failedEntries: input.entries.map((entry) =>
        toStagingFailure(entry, "stage-failed"),
      ),
    }
  }

  if (input.entries.length === 0) {
    return { stagedEntries: [], failedEntries: [] }
  }

  const marketplaces = new Map<string, ClaudePluginStagingEntry[]>()
  for (const entry of input.entries) {
    const existing = marketplaces.get(entry.marketplace) ?? []
    existing.push(entry)
    marketplaces.set(entry.marketplace, existing)
  }

  const collidingMarketplaceSegments = findDuplicatePathSegments(
    Array.from(marketplaces.keys()),
  )
  const symlinkType =
    input.dependencies.platform === "win32" ? "junction" : "dir"
  const stagedEntries: ClaudeStagedNativePluginEntry[] = []
  const failedEntries: ClaudeNativePluginStagingFailureInput[] = []
  for (const [marketplace, entries] of marketplaces) {
    const marketplaceSegment = sanitizePathSegment(marketplace)
    if (collidingMarketplaceSegments.has(marketplaceSegment)) {
      input.markIncomplete()
      failedEntries.push(
        ...entries.map((entry) => toStagingFailure(entry, "stage-failed")),
      )
      input.dependencies.logger.warn(
        `[claude] Refusing to stage marketplace ${marketplace}: sanitized marketplace path collision`,
      )
      continue
    }

    const marketplaceRoot = path.join(
      input.pluginsTarget,
      "marketplaces",
      marketplaceSegment,
    )
    const marketplaceMetaDir = path.join(marketplaceRoot, ".claude-plugin")
    const collidingPluginSourcePaths = findDuplicatePluginSourcePaths(entries)

    const linkedEntries: ClaudeStagedNativePluginEntry[] = []
    for (const entry of entries) {
      const sourcePath = path.join("plugins", sanitizePathSegment(entry.name))
      if (collidingPluginSourcePaths.has(sourcePath)) {
        input.markIncomplete()
        failedEntries.push(toStagingFailure(entry, "stage-failed"))
        input.dependencies.logger.warn(
          `[claude] Refusing to stage plugin ${entry.pluginSource}: sanitized plugin path collision`,
        )
        continue
      }

      const targetPath = path.join(marketplaceRoot, sourcePath)
      try {
        const sourceExists = await input.dependencies.fs
          .stat(entry.path)
          .then(() => true)
          .catch(() => false)
        if (!sourceExists) {
          input.markIncomplete()
          failedEntries.push(toStagingFailure(entry, "source-missing"))
          continue
        }
        await input.dependencies.fs.mkdir(path.dirname(targetPath), {
          recursive: true,
        })
        const linked = await ensureSymlink({
          sourcePath: entry.path,
          targetPath,
          label: `plugin ${entry.pluginSource}`,
          targetKind: "dir",
          symlinkType,
          dependencies: input.dependencies,
          markIncomplete: input.markIncomplete,
          markError: input.markError,
        })
        if (linked) {
          linkedEntries.push({
            ...entry,
            stagedPath: targetPath,
          })
        } else {
          failedEntries.push(toStagingFailure(entry, "symlink-failed"))
        }
      } catch (err) {
        input.markIncomplete()
        input.markError()
        failedEntries.push(toStagingFailure(entry, "stage-failed"))
        input.dependencies.logger.warn(
          `[claude] Failed to stage plugin ${entry.pluginSource}:`,
          (err as Error).message,
        )
      }
    }

    if (linkedEntries.length === 0) continue

    const plugins = linkedEntries.map((entry) => {
      const sourcePath = path.join("plugins", sanitizePathSegment(entry.name))
      return {
        name: entry.name,
        version: entry.version,
        description: entry.description,
        source: sourcePath,
        category: entry.category,
        homepage: entry.homepage,
        tags: entry.tags,
      }
    })

    try {
      await input.dependencies.fs.mkdir(marketplaceMetaDir, { recursive: true })
      await input.dependencies.fs.writeFile(
        path.join(marketplaceMetaDir, "marketplace.json"),
        `${JSON.stringify({ name: marketplace, plugins }, null, 2)}\n`,
        "utf-8",
      )
      stagedEntries.push(...linkedEntries)
    } catch (err) {
      input.markIncomplete()
      input.markError()
      failedEntries.push(
        ...linkedEntries.map((entry) =>
          toStagingFailure(entry, "marketplace-manifest-failed"),
        ),
      )
      input.dependencies.logger.warn(
        `[claude] Failed to write staged marketplace ${marketplace}:`,
        (err as Error).message,
      )
      await input.dependencies.fs
        .rm(marketplaceRoot, { recursive: true, force: true })
        .catch(() => undefined)
    }
  }

  return { stagedEntries, failedEntries }
}

function toStagingFailure(
  entry: ClaudePluginStagingEntry,
  reason: ClaudeNativePluginStagingFailureInput["reason"],
): ClaudeNativePluginStagingFailureInput {
  return {
    pluginSource: entry.pluginSource,
    marketplace: entry.marketplace,
    name: entry.name,
    path: entry.path,
    reason,
  }
}

function sanitizePathSegment(value: string): string {
  const normalized = value.replace(/[^a-zA-Z0-9._-]/g, "_")
  return normalized.length > 0 ? normalized : "plugin"
}

function findDuplicatePathSegments(values: string[]): Set<string> {
  const counts = new Map<string, number>()
  for (const value of values) {
    const segment = sanitizePathSegment(value)
    counts.set(segment, (counts.get(segment) ?? 0) + 1)
  }
  return new Set(
    Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([segment]) => segment),
  )
}

function findDuplicatePluginSourcePaths(
  entries: ClaudePluginStagingEntry[],
): Set<string> {
  const counts = new Map<string, number>()
  for (const entry of entries) {
    const sourcePath = path.join("plugins", sanitizePathSegment(entry.name))
    counts.set(sourcePath, (counts.get(sourcePath) ?? 0) + 1)
  }
  return new Set(
    Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([sourcePath]) => sourcePath),
  )
}

export async function ensureClaudeAgentSdkIsolatedConfigDir(input: {
  isolatedConfigDir: string
  cacheKey: string
  pluginScopeContext?: RuntimeNativePluginActivationScopeContext
  dependencies?: Partial<ClaudeAgentSdkConfigDirDependencies>
}): Promise<ClaudeAgentSdkIsolatedConfigDirResult> {
  const dependencies = withDefaultDependencies(input.dependencies)
  await dependencies.fs.mkdir(input.isolatedConfigDir, { recursive: true })

  const pluginSafeMode = await dependencies.getPluginSafeModeState()

  const homeClaudeDir = path.join(dependencies.homeDir(), ".claude")
  const symlinkType = dependencies.platform === "win32" ? "junction" : "dir"

  const skillsSource = path.join(homeClaudeDir, "skills")
  const skillsTarget = path.join(input.isolatedConfigDir, "skills")
  const commandsSource = path.join(homeClaudeDir, "commands")
  const commandsTarget = path.join(input.isolatedConfigDir, "commands")
  const agentsSource = path.join(homeClaudeDir, "agents")
  const agentsTarget = path.join(input.isolatedConfigDir, "agents")
  const pluginsTarget = path.join(input.isolatedConfigDir, "plugins")
  const settingsSource = path.join(homeClaudeDir, "settings.json")
  const settingsTarget = path.join(input.isolatedConfigDir, "settings.json")

  let symlinkSetupComplete = true
  let symlinkSetupHadErrors = false
  const markIncomplete = () => {
    symlinkSetupComplete = false
  }
  const markError = () => {
    symlinkSetupHadErrors = true
  }

  const stageManagedAssetDirectory = (
    sourcePath: string,
    targetPath: string,
    label: string,
  ) =>
    stageClaudeNonPluginAssetDirectory({
      sourcePath,
      targetPath,
      label,
      symlinkType,
      dependencies,
      markIncomplete,
      markError,
    })

  await stageManagedAssetDirectory(
    skillsSource,
    skillsTarget,
    "skills directory",
  )
  await stageManagedAssetDirectory(
    commandsSource,
    commandsTarget,
    "commands directory",
  )
  await stageManagedAssetDirectory(
    agentsSource,
    agentsTarget,
    "agents directory",
  )
  const pluginStagingEntries = pluginSafeMode.enabled
    ? []
    : await dependencies.getClaudePluginStagingEntries(input.pluginScopeContext)
  const pluginStaging = await stageClaudePlugins({
    pluginsTarget,
    entries: pluginStagingEntries,
    dependencies,
    markIncomplete,
    markError,
  })
  replaceClaudeNativePluginStagingFailures(pluginStaging.failedEntries)
  await writeFilteredSettings({
    settingsSource,
    settingsTarget,
    enabledPluginSources: pluginStaging.stagedEntries.map(
      (entry) => entry.pluginSource,
    ),
    dependencies,
    markError,
  })

  if (symlinkSetupComplete) {
    symlinksCreated.add(input.cacheKey)
  } else if (symlinkSetupHadErrors) {
    dependencies.logger.warn(
      "[claude] Symlink setup incomplete, will retry on next request",
    )
  }

  return {
    nativePluginConfigs: pluginStaging.stagedEntries.map((entry) => ({
      type: "local",
      path: entry.stagedPath,
      skipMcpDiscovery: true,
    })),
  }
}

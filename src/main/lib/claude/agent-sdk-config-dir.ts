import * as fs from "node:fs/promises"
import * as os from "node:os"
import path from "node:path"

type ClaudeAgentSdkConfigDirFs = {
  mkdir: typeof fs.mkdir
  readFile: typeof fs.readFile
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
  getClaudePluginStagingEntries: () => Promise<ClaudePluginStagingEntry[]>
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

const symlinksCreated = new Set<string>()

const defaultDependencies: ClaudeAgentSdkConfigDirDependencies = {
  fs,
  homeDir: os.homedir,
  platform: process.platform,
  getPluginSafeModeState: async () => {
    const state = await import("../plugins/update-review-state")
    return state.getPluginSafeModeState()
  },
  getClaudePluginStagingEntries: async () => {
    const [{ getEnabledPlugins, getApprovedPluginMcpServers }, gates] =
      await Promise.all([
        import("../trpc/routers/claude-settings"),
        import("../plugins/runtime-gates"),
      ])
    return gates.discoverAllowedClaudeNativePluginRuntimeComponents({
      enabledPluginSources: await getEnabledPlugins(),
      approvedPluginMcpServerIdentifiers: await getApprovedPluginMcpServers(),
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
  markError: () => void
}): Promise<void> {
  try {
    await input.dependencies.fs.rm(input.targetPath, {
      recursive: true,
      force: true,
    })
  } catch (err) {
    input.markError()
    input.dependencies.logger.warn(
      `[claude] Failed to remove managed ${input.label}:`,
      (err as Error).message,
    )
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
}): Promise<{ stagedEntries: ClaudePluginStagingEntry[] }> {
  await removeManagedPath({
    targetPath: input.pluginsTarget,
    label: "plugins directory",
    dependencies: input.dependencies,
    markError: input.markError,
  })

  if (input.entries.length === 0) return { stagedEntries: [] }

  const marketplaces = new Map<string, ClaudePluginStagingEntry[]>()
  for (const entry of input.entries) {
    const existing = marketplaces.get(entry.marketplace) ?? []
    existing.push(entry)
    marketplaces.set(entry.marketplace, existing)
  }

  const symlinkType =
    input.dependencies.platform === "win32" ? "junction" : "dir"
  const stagedEntries: ClaudePluginStagingEntry[] = []
  for (const [marketplace, entries] of marketplaces) {
    const marketplaceRoot = path.join(
      input.pluginsTarget,
      "marketplaces",
      sanitizePathSegment(marketplace),
    )
    const marketplaceMetaDir = path.join(marketplaceRoot, ".claude-plugin")

    const linkedEntries: ClaudePluginStagingEntry[] = []
    for (const entry of entries) {
      const sourcePath = path.join("plugins", sanitizePathSegment(entry.name))
      const targetPath = path.join(marketplaceRoot, sourcePath)
      try {
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
        if (linked) linkedEntries.push(entry)
      } catch (err) {
        input.markIncomplete()
        input.markError()
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
      input.dependencies.logger.warn(
        `[claude] Failed to write staged marketplace ${marketplace}:`,
        (err as Error).message,
      )
      await input.dependencies.fs
        .rm(marketplaceRoot, { recursive: true, force: true })
        .catch(() => undefined)
    }
  }

  return { stagedEntries }
}

function sanitizePathSegment(value: string): string {
  const normalized = value.replace(/[^a-zA-Z0-9._-]/g, "_")
  return normalized.length > 0 ? normalized : "plugin"
}

export async function ensureClaudeAgentSdkIsolatedConfigDir(input: {
  isolatedConfigDir: string
  cacheKey: string
  dependencies?: Partial<ClaudeAgentSdkConfigDirDependencies>
}): Promise<void> {
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

  const ensureManagedSymlink = (
    sourcePath: string,
    targetPath: string,
    label: string,
    targetKind: "dir" | "file",
  ) =>
    ensureSymlink({
      sourcePath,
      targetPath,
      label,
      targetKind,
      symlinkType,
      dependencies,
      markIncomplete,
      markError,
    })

  await ensureManagedSymlink(
    skillsSource,
    skillsTarget,
    "skills directory",
    "dir",
  )
  await ensureManagedSymlink(
    commandsSource,
    commandsTarget,
    "commands directory",
    "dir",
  )
  await ensureManagedSymlink(
    agentsSource,
    agentsTarget,
    "agents directory",
    "dir",
  )
  const pluginStagingEntries = pluginSafeMode.enabled
    ? []
    : await dependencies.getClaudePluginStagingEntries()
  const pluginStaging = await stageClaudePlugins({
    pluginsTarget,
    entries: pluginStagingEntries,
    dependencies,
    markIncomplete,
    markError,
  })
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
}

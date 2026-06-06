import * as fs from "fs/promises"
import * as os from "os"
import path from "path"

type ClaudeAgentSdkConfigDirFs = {
  mkdir: typeof fs.mkdir
  stat: typeof fs.stat
  lstat: typeof fs.lstat
  symlink: typeof fs.symlink
  unlink: typeof fs.unlink
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
  logger: Pick<Console, "warn">
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
  logger: console,
}

function withDefaultDependencies(
  dependencies:
    | Partial<ClaudeAgentSdkConfigDirDependencies>
    | undefined,
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
    isolatedConfigDir: path.join(
      input.userDataDir,
      "claude-sessions",
      ownerId,
    ),
    cacheKey: ownerId,
  }
}

export function clearClaudeAgentSdkIsolatedConfigDirCache(): void {
  symlinksCreated.clear()
}

async function removeManagedSymlink(input: {
  targetPath: string
  label: string
  dependencies: ClaudeAgentSdkConfigDirDependencies
  markError: () => void
}): Promise<void> {
  try {
    const stat = await input.dependencies.fs
      .lstat(input.targetPath)
      .catch(() => undefined)
    if (stat?.isSymbolicLink()) {
      await input.dependencies.fs.unlink(input.targetPath)
    }
  } catch (symlinkErr) {
    input.markError()
    input.dependencies.logger.warn(
      `[claude] Failed to remove ${input.label} symlink for plugin safe mode:`,
      (symlinkErr as Error).message,
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
}): Promise<void> {
  try {
    const sourceExists = await input.dependencies.fs
      .stat(input.sourcePath)
      .then(() => true)
      .catch(() => false)
    const targetExists = await input.dependencies.fs
      .lstat(input.targetPath)
      .then(() => true)
      .catch(() => false)

    if (sourceExists && !targetExists) {
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

    if (!sourceExists && !targetExists) {
      input.markIncomplete()
    }
  } catch (symlinkErr) {
    input.markIncomplete()
    input.markError()
    input.dependencies.logger.warn(
      `[claude] Failed to symlink ${input.label}:`,
      (symlinkErr as Error).message,
    )
  }
}

export async function ensureClaudeAgentSdkIsolatedConfigDir(input: {
  isolatedConfigDir: string
  cacheKey: string
  dependencies?: Partial<ClaudeAgentSdkConfigDirDependencies>
}): Promise<void> {
  const dependencies = withDefaultDependencies(input.dependencies)
  await dependencies.fs.mkdir(input.isolatedConfigDir, { recursive: true })

  const pluginSafeMode = await dependencies.getPluginSafeModeState()
  if (symlinksCreated.has(input.cacheKey) && !pluginSafeMode.enabled) {
    return
  }

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
  // Do not expose the whole Claude plugin directory to Locus-managed runs.
  // Reviewed plugin MCP servers are injected explicitly by the runtime route.
  await removeManagedSymlink({
    targetPath: pluginsTarget,
    label: "plugins directory",
    dependencies,
    markError,
  })
  await ensureManagedSymlink(
    settingsSource,
    settingsTarget,
    "settings.json",
    "file",
  )

  if (symlinkSetupComplete) {
    symlinksCreated.add(input.cacheKey)
  } else if (symlinkSetupHadErrors) {
    dependencies.logger.warn(
      "[claude] Symlink setup incomplete, will retry on next request",
    )
  }
}

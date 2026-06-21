import * as fs from "node:fs/promises"
import * as os from "node:os"
import path from "node:path"
import type { DesktopRunMcpSessionServer } from "../agent-runtime/desktop-run-request"
import { getElectronUserDataPath } from "../electron-app"
import {
  CODEX_SKILL_PROJECTION_RUNTIME_ID,
  createCodexSkillProjectionAdapter,
  createRuntimeCapabilityProjectionService,
  type RuntimeCapabilityProjectionResult,
  SKILL_PROJECTION_KIND,
  type SkillProjectionCandidate,
  type SkillProjectionKind,
} from "../runtime-capability-projection"
import {
  listManagedSkillInstallRecords,
  type ManagedSkillInstallRecord,
} from "../skills/registry"
import type {
  CodexAppServerResolvedPluginConfigEntry,
  CodexAppServerResolvedPluginConfigOverrides,
} from "./app-server-plugin-config"

type CodexAppServerPluginHomeFs = {
  mkdir: typeof fs.mkdir
  stat: typeof fs.stat
  symlink: typeof fs.symlink
  rm: typeof fs.rm
  copyFile: typeof fs.copyFile
  writeFile: typeof fs.writeFile
}

type EnvSource = Record<string, string | undefined>

export interface CodexAppServerIsolatedPluginHome {
  codexHome: string
  ownerId: string
}

export interface CodexAppServerPluginHomeStagedEntry {
  pluginId: string
  pluginSource: string
  sourcePath: string
  stagedPath: string
}

export interface CodexAppServerPluginHomeBlockedEntry {
  pluginId: string
  pluginSource: string
  reason:
    | "disabled"
    | "invalid-source"
    | "source-missing"
    | "symlink-failed"
    | "stage-failed"
}

export interface CodexAppServerPluginHomeResult {
  codexHome: string
  runtimeEnv: Record<string, string>
  pluginConfigOverrides: Record<string, boolean>
  stagedEntries: CodexAppServerPluginHomeStagedEntry[]
  blockedEntries: CodexAppServerPluginHomeBlockedEntry[]
  skillProjection: RuntimeCapabilityProjectionResult<SkillProjectionKind>
}

export type CodexAppServerPluginHomeDependencies = {
  fs: CodexAppServerPluginHomeFs
  homeDir: () => string
  platform: NodeJS.Platform
  userDataDir: () => string
  listManagedSkillInstallRecords: typeof listManagedSkillInstallRecords
  logger: Pick<Console, "warn">
}

const AUTH_FILES_TO_COPY = ["auth.json", "installation_id"] as const

const defaultDependencies: CodexAppServerPluginHomeDependencies = {
  fs,
  homeDir: os.homedir,
  platform: process.platform,
  userDataDir: getElectronUserDataPath,
  listManagedSkillInstallRecords,
  logger: console,
}

function withDefaultDependencies(
  dependencies: Partial<CodexAppServerPluginHomeDependencies> | undefined,
): CodexAppServerPluginHomeDependencies {
  return {
    ...defaultDependencies,
    ...dependencies,
    fs: {
      ...defaultDependencies.fs,
      ...dependencies?.fs,
    },
  }
}

export function resolveCodexAppServerIsolatedPluginHome(input: {
  userDataDir: string
  chatId: string
  subChatId?: string | null
}): CodexAppServerIsolatedPluginHome {
  const ownerId = sanitizePathSegment(input.subChatId ?? input.chatId)
  return {
    ownerId,
    codexHome: path.join(input.userDataDir, "codex-sessions", ownerId),
  }
}

export async function prepareCodexAppServerIsolatedPluginHome(input: {
  chatId: string
  subChatId?: string | null
  runtimeEnv: EnvSource
  pluginConfig: CodexAppServerResolvedPluginConfigOverrides
  mcpServers?: DesktopRunMcpSessionServer[]
  dependencies?: Partial<CodexAppServerPluginHomeDependencies>
}): Promise<CodexAppServerPluginHomeResult> {
  const dependencies = withDefaultDependencies(input.dependencies)
  const isolatedHome = resolveCodexAppServerIsolatedPluginHome({
    userDataDir: dependencies.userDataDir(),
    chatId: input.chatId,
    subChatId: input.subChatId,
  })
  const codexHome = isolatedHome.codexHome

  await dependencies.fs.mkdir(codexHome, { recursive: true })
  await copyCodexAuthFiles({
    sourceCodexHome: resolveSourceCodexHome(input.runtimeEnv, dependencies),
    targetCodexHome: codexHome,
    dependencies,
  })

  const pluginsRoot = path.join(codexHome, "plugins")
  await dependencies.fs.rm(pluginsRoot, { recursive: true, force: true })

  const stagedEntries: CodexAppServerPluginHomeStagedEntry[] = []
  const blockedEntries: CodexAppServerPluginHomeBlockedEntry[] = []
  const config = { ...input.pluginConfig.config }
  const symlinkType = dependencies.platform === "win32" ? "junction" : "dir"

  for (const entry of input.pluginConfig.entries) {
    const configKey = codexPluginEnabledConfigKey(entry.pluginId)
    if (!entry.enabled || !entry.nativeActivationPolicy.canActivateNative) {
      config[configKey] = false
      blockedEntries.push(toBlockedEntry(entry, "disabled"))
      continue
    }

    const coordinates = entry.cacheCoordinates
    if (!coordinates || !entry.pluginPath) {
      config[configKey] = false
      blockedEntries.push(toBlockedEntry(entry, "invalid-source"))
      continue
    }

    const targetPath = path.join(
      pluginsRoot,
      "cache",
      coordinates.marketplace,
      coordinates.name,
      coordinates.version,
    )

    try {
      const sourceStat = await dependencies.fs.stat(entry.pluginPath)
      if (!sourceStat.isDirectory()) {
        config[configKey] = false
        blockedEntries.push(toBlockedEntry(entry, "source-missing"))
        continue
      }
      await dependencies.fs.mkdir(path.dirname(targetPath), { recursive: true })
      await dependencies.fs.symlink(entry.pluginPath, targetPath, symlinkType)
      config[configKey] = true
      stagedEntries.push({
        pluginId: entry.pluginId,
        pluginSource: entry.pluginSource,
        sourcePath: entry.pluginPath,
        stagedPath: targetPath,
      })
    } catch (error) {
      config[configKey] = false
      const reason =
        error instanceof Error && "code" in error && error.code === "ENOENT"
          ? "source-missing"
          : "stage-failed"
      blockedEntries.push(toBlockedEntry(entry, reason))
      dependencies.logger.warn(
        `[codex] Failed to stage plugin ${entry.pluginSource}:`,
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  const skillProjectionService = createRuntimeCapabilityProjectionService([
    createCodexSkillProjectionAdapter({
      fs: dependencies.fs,
      platform: dependencies.platform,
    }),
  ])
  const managedSkillRecords =
    await dependencies.listManagedSkillInstallRecords()
  const skillProjection = await skillProjectionService.project({
    kind: SKILL_PROJECTION_KIND,
    runtimeId: CODEX_SKILL_PROJECTION_RUNTIME_ID,
    payload: {
      runtimeId: CODEX_SKILL_PROJECTION_RUNTIME_ID,
      targetHome: codexHome,
      targetSkillsDir: path.join(codexHome, "skills"),
      skills:
        managedSkillRecordsToCodexProjectionCandidates(managedSkillRecords),
    },
  })

  await dependencies.fs.writeFile(
    path.join(codexHome, "config.toml"),
    buildCodexAppServerConfigToml({
      pluginConfig: config,
      mcpServers: input.mcpServers ?? [],
    }),
    "utf-8",
  )

  const runtimeEnv: Record<string, string> = {}
  for (const [key, value] of Object.entries(input.runtimeEnv)) {
    if (typeof value === "string") runtimeEnv[key] = value
  }
  runtimeEnv.CODEX_HOME = codexHome

  return {
    codexHome,
    runtimeEnv,
    pluginConfigOverrides: config,
    stagedEntries,
    blockedEntries,
    skillProjection,
  }
}

export function buildCodexAppServerPluginConfigToml(
  config: Record<string, boolean>,
): string {
  return buildCodexAppServerConfigToml({
    pluginConfig: config,
    mcpServers: [],
  })
}

export function buildCodexAppServerConfigToml(input: {
  pluginConfig: Record<string, boolean>
  mcpServers: DesktopRunMcpSessionServer[]
}): string {
  const lines = [
    "# Managed by Locus. This file is rebuilt before each run.",
    "",
  ]
  const mcpServers = [...input.mcpServers].sort((a, b) =>
    a.name.localeCompare(b.name),
  )

  for (const server of mcpServers) {
    lines.push(`[mcp_servers."${escapeTomlBasicString(server.name)}"]`)
    if (server.type === "stdio") {
      lines.push(`command = "${escapeTomlBasicString(server.command)}"`)
      lines.push(
        `args = [${server.args
          .map((arg) => `"${escapeTomlBasicString(arg)}"`)
          .join(", ")}]`,
      )
      lines.push("")
      if (server.env.length > 0) {
        lines.push(`[mcp_servers."${escapeTomlBasicString(server.name)}".env]`)
        for (const entry of [...server.env].sort((a, b) =>
          a.name.localeCompare(b.name),
        )) {
          lines.push(
            `"${escapeTomlBasicString(entry.name)}" = "${escapeTomlBasicString(
              entry.value,
            )}"`,
          )
        }
        lines.push("")
      }
      continue
    }

    lines.push(`url = "${escapeTomlBasicString(server.url)}"`)
    if (server.headers.length > 0) {
      const headers = [...server.headers]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(
          (entry) =>
            `"${escapeTomlBasicString(entry.name)}" = "${escapeTomlBasicString(
              entry.value,
            )}"`,
        )
        .join(", ")
      lines.push(`http_headers = { ${headers} }`)
    }
    lines.push("")
  }

  const entries = Object.entries(input.pluginConfig)
    .map(([key, enabled]) => {
      const match = /^plugins\.(.+)\.enabled$/.exec(key)
      return match ? { pluginId: match[1], enabled } : null
    })
    .filter((entry): entry is { pluginId: string; enabled: boolean } =>
      Boolean(entry),
    )
    .sort((a, b) => a.pluginId.localeCompare(b.pluginId))

  for (const entry of entries) {
    lines.push(`[plugins."${escapeTomlBasicString(entry.pluginId)}"]`)
    lines.push(`enabled = ${entry.enabled ? "true" : "false"}`)
    lines.push("")
  }

  return `${lines.join("\n").trimEnd()}\n`
}

function codexPluginEnabledConfigKey(pluginId: string): string {
  return `plugins.${pluginId}.enabled`
}

function toBlockedEntry(
  entry: CodexAppServerResolvedPluginConfigEntry,
  reason: CodexAppServerPluginHomeBlockedEntry["reason"],
): CodexAppServerPluginHomeBlockedEntry {
  return {
    pluginId: entry.pluginId,
    pluginSource: entry.pluginSource,
    reason,
  }
}

function managedSkillRecordsToCodexProjectionCandidates(
  records: ManagedSkillInstallRecord[],
): SkillProjectionCandidate[] {
  return records.flatMap((record) => {
    const runtimeRecord = record.runtimes.codex
    if (!runtimeRecord) return []

    return [
      {
        skillId: record.id,
        registryId: record.registryId,
        version: record.version,
        contentHash: record.contentHash,
        sourcePath: runtimeRecord.installPath,
        installPath: runtimeRecord.installPath,
        eligibleRuntimes: record.eligibleRuntimes.map((runtime) =>
          runtime === "codex" ? "codex" : "claude-code",
        ),
        installStatus: "installed",
      },
    ]
  })
}

async function copyCodexAuthFiles(input: {
  sourceCodexHome: string
  targetCodexHome: string
  dependencies: CodexAppServerPluginHomeDependencies
}): Promise<void> {
  if (
    path.resolve(input.sourceCodexHome) === path.resolve(input.targetCodexHome)
  ) {
    return
  }

  for (const filename of AUTH_FILES_TO_COPY) {
    const sourcePath = path.join(input.sourceCodexHome, filename)
    const targetPath = path.join(input.targetCodexHome, filename)
    const sourceExists = await input.dependencies.fs
      .stat(sourcePath)
      .then((stat) => stat.isFile())
      .catch(() => false)
    if (!sourceExists) continue

    try {
      await input.dependencies.fs.copyFile(sourcePath, targetPath)
    } catch (error) {
      input.dependencies.logger.warn(
        `[codex] Failed to copy ${filename} into isolated CODEX_HOME:`,
        error instanceof Error ? error.message : String(error),
      )
    }
  }
}

function resolveSourceCodexHome(
  runtimeEnv: EnvSource,
  dependencies: CodexAppServerPluginHomeDependencies,
): string {
  const explicit = runtimeEnv.CODEX_HOME?.trim()
  if (explicit) return explicit

  const home = runtimeEnv.HOME?.trim() || runtimeEnv.USERPROFILE?.trim()
  return path.join(home || dependencies.homeDir(), ".codex")
}

function sanitizePathSegment(value: string): string {
  const normalized = value.replace(/[^a-zA-Z0-9._-]/g, "_")
  return normalized.length > 0 ? normalized : "session"
}

function escapeTomlBasicString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

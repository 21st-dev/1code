import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"
import matter from "gray-matter"
import type { AgentEngineId } from "../agent-runtime"
import { ensureMossSource } from "../moss-source/bootstrap"
import { discoverMossSourceResources } from "../moss-source/registry"
import type { McpServerConfig } from "../claude-config"
import {
  discoverInstalledPlugins,
  discoverPluginMcpServers,
  getPluginComponentPaths,
} from "../plugins"
import {
  getApprovedPluginMcpServers,
  getEnabledPlugins,
} from "../claude-plugin-settings"
import {
  type SharedResource,
  type SharedResourceSnapshot,
} from "./types"
import { buildGovernedResourceProjection } from "./governance"
import { collectCodexNativeResources } from "./codex-native-resources"

const home = os.homedir()

function toDisplayPath(filePath: string, projectPath?: string): string {
  if (projectPath && filePath.startsWith(projectPath)) {
    return path.relative(projectPath, filePath)
  }
  return filePath.startsWith(home) ? `~${filePath.slice(home.length)}` : filePath
}

function resourceId(parts: Array<string | undefined | null>): string {
  return parts.filter(Boolean).join(":")
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

function isSafeEntryName(name: string): boolean {
  return !name.includes("..") && !name.includes("/") && !name.includes("\\")
}

async function readFrontmatter(filePath: string): Promise<{
  name?: string
  description?: string
  body: string
}> {
  const raw = await fs.readFile(filePath, "utf-8")
  const parsed = matter(raw)
  return {
    name: typeof parsed.data.name === "string" ? parsed.data.name : undefined,
    description:
      typeof parsed.data.description === "string"
        ? parsed.data.description
        : undefined,
    body: parsed.content.trim(),
  }
}

async function scanAgentFiles(
  dir: string,
  scope: "project" | "user" | "plugin",
  projectPath?: string,
  pluginSource?: string,
): Promise<SharedResource[]> {
  if (!(await pathExists(dir))) return []
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const resources: SharedResource[] = []

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md") || !isSafeEntryName(entry.name)) {
      continue
    }

    const filePath = path.join(dir, entry.name)
    try {
      const parsed = await readFrontmatter(filePath)
      const name = parsed.name || entry.name.replace(/\.md$/, "")
      resources.push({
        id: resourceId(["agent", scope, pluginSource, name]),
        kind: "agent",
        name,
        scope,
        pluginSource,
        path: toDisplayPath(filePath, projectPath),
        description: parsed.description,
        enabled: scope !== "plugin" || Boolean(pluginSource),
      })
    } catch {
      continue
    }
  }

  return resources
}

async function scanSkillDirs(
  dir: string,
  scope: "project" | "user" | "plugin",
  projectPath?: string,
  pluginSource?: string,
): Promise<SharedResource[]> {
  if (!(await pathExists(dir))) return []
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const resources: SharedResource[] = []

  for (const entry of entries) {
    if (!entry.isDirectory() || !isSafeEntryName(entry.name)) continue
    const filePath = path.join(dir, entry.name, "SKILL.md")
    if (!(await pathExists(filePath))) continue

    try {
      const parsed = await readFrontmatter(filePath)
      const name = parsed.name || entry.name
      resources.push({
        id: resourceId(["skill", scope, pluginSource, name]),
        kind: "skill",
        name,
        scope,
        pluginSource,
        path: toDisplayPath(filePath, projectPath),
        description: parsed.description,
        enabled: scope !== "plugin" || Boolean(pluginSource),
      })
    } catch {
      continue
    }
  }

  return resources
}

async function scanCommandFiles(
  dir: string,
  scope: "project" | "user" | "plugin",
  projectPath?: string,
  pluginSource?: string,
  prefix = "",
): Promise<SharedResource[]> {
  if (!(await pathExists(dir))) return []
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const resources: SharedResource[] = []

  for (const entry of entries) {
    if (!isSafeEntryName(entry.name)) continue
    const filePath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      const nextPrefix = prefix ? `${prefix}:${entry.name}` : entry.name
      resources.push(
        ...(await scanCommandFiles(
          filePath,
          scope,
          projectPath,
          pluginSource,
          nextPrefix,
        )),
      )
      continue
    }

    if (!entry.isFile() || !entry.name.endsWith(".md")) continue
    try {
      const parsed = await readFrontmatter(filePath)
      const fallback = entry.name.replace(/\.md$/, "")
      const name = parsed.name || (prefix ? `${prefix}:${fallback}` : fallback)
      resources.push({
        id: resourceId(["command", scope, pluginSource, name]),
        kind: "command",
        name,
        scope,
        pluginSource,
        path: toDisplayPath(filePath, projectPath),
        description: parsed.description,
        enabled: scope !== "plugin" || Boolean(pluginSource),
      })
    } catch {
      continue
    }
  }

  return resources
}

function mcpResourcesFromRecord(params: {
  servers: Record<string, McpServerConfig>
  scope: "project" | "user" | "plugin" | "engine"
  engine?: AgentEngineId
  group: string
  pluginSource?: string
}): SharedResource[] {
  return Object.entries(params.servers).map(([name, config]) => ({
    id: resourceId(["mcp", params.engine, params.scope, params.pluginSource, params.group, name]),
    kind: "mcp" as const,
    name,
    scope: params.scope,
    engine: params.engine,
    pluginSource: params.pluginSource,
    enabled: true,
    metadata: {
      group: params.group,
      transport: config.command ? "stdio" : config.url ? "http" : "unknown",
      hasOAuth: Boolean(config._oauth),
      authType: config.authType,
    },
  }))
}

async function collectClaudeMcpResources(projectPath?: string): Promise<SharedResource[]> {
  try {
    const {
      getMergedGlobalMcpServers,
      getMergedLocalProjectMcpServers,
      readClaudeConfig,
      readClaudeDirConfig,
      readProjectMcpJson,
      resolveProjectPathFromWorktree,
    } = await import("../claude-config")
    const [claudeConfig, claudeDirConfig] = await Promise.all([
      readClaudeConfig(),
      readClaudeDirConfig(),
    ])
    const globalServers = await getMergedGlobalMcpServers(
      claudeConfig,
      claudeDirConfig,
    )
    const resources = mcpResourcesFromRecord({
      servers: globalServers,
      scope: "user",
      engine: "claude-code",
      group: "global",
    })

    if (projectPath) {
      const resolvedProjectPath = resolveProjectPathFromWorktree(projectPath) || projectPath
      const projectServers = await getMergedLocalProjectMcpServers(
        resolvedProjectPath,
        claudeConfig,
        claudeDirConfig,
      )
      const projectMcpJsonServers = await readProjectMcpJson(resolvedProjectPath)
      resources.push(
        ...mcpResourcesFromRecord({
          servers: { ...projectMcpJsonServers, ...projectServers },
          scope: "project",
          engine: "claude-code",
          group: resolvedProjectPath,
        }),
      )
    }

    return resources
  } catch (error) {
    return [{
      id: "mcp:claude-code:error",
      kind: "mcp",
      name: "Claude MCP discovery failed",
      scope: "engine",
      engine: "claude-code",
      enabled: false,
      metadata: {
        error: error instanceof Error ? error.message : String(error),
      },
    }]
  }
}

async function collectCodexMcpResources(): Promise<SharedResource[]> {
  try {
    const { getAllCodexMcpConfigHandler } = await import("../trpc/routers/codex")
    const snapshot = await getAllCodexMcpConfigHandler()
    return snapshot.groups.flatMap((group) =>
      group.mcpServers.map((server) => ({
        id: resourceId(["mcp", "codex", group.projectPath || "global", server.name]),
        kind: "mcp" as const,
        name: server.name,
        scope: group.projectPath ? "project" : "engine",
        engine: "codex" as const,
        enabled: server.status === "connected",
        metadata: {
          group: group.groupName,
          projectPath: group.projectPath,
          status: server.status,
          needsAuth: server.needsAuth,
          toolCount: server.tools.length,
          config: server.config,
        },
      })),
    )
  } catch (error) {
    return [{
      id: "mcp:codex:error",
      kind: "mcp",
      name: "Codex MCP discovery failed",
      scope: "engine",
      engine: "codex",
      enabled: false,
      metadata: {
        error: error instanceof Error ? error.message : String(error),
      },
    }]
  }
}

async function collectMemoryResources(projectPath?: string): Promise<SharedResource[]> {
  const resources: SharedResource[] = []

  const addMemoryResource = async (params: {
    filePath: string | null
    name: string
    scope: "project" | "user"
    engine?: AgentEngineId
    description: string
    memoryRole: string
  }) => {
    if (!params.filePath || !(await pathExists(params.filePath))) return

    let entryType: "file" | "directory" = "file"
    try {
      const stat = await fs.stat(params.filePath)
      entryType = stat.isDirectory() ? "directory" : "file"
    } catch {
      return
    }

    resources.push({
      id: resourceId(["memory", params.engine, params.scope, params.filePath]),
      kind: "memory",
      name: params.name,
      scope: params.scope,
      engine: params.engine,
      path: toDisplayPath(params.filePath, projectPath),
      description: params.description,
      enabled: true,
      metadata: {
        entryType,
        memoryRole: params.memoryRole,
      },
    })
  }

  const codexMemoryRoot = path.join(home, ".codex", "memories")
  await addMemoryResource({
    filePath: codexMemoryRoot,
    name: "Codex memories",
    scope: "user",
    engine: "codex",
    description: "Codex user memory root.",
    memoryRole: "codex-user-root",
  })
  await addMemoryResource({
    filePath: path.join(codexMemoryRoot, "MEMORY.md"),
    name: "MEMORY.md",
    scope: "user",
    engine: "codex",
    description: "Codex memory registry.",
    memoryRole: "codex-registry",
  })
  await addMemoryResource({
    filePath: path.join(codexMemoryRoot, "memory_summary.md"),
    name: "memory_summary.md",
    scope: "user",
    engine: "codex",
    description: "Codex compact memory summary.",
    memoryRole: "codex-summary",
  })
  await addMemoryResource({
    filePath: path.join(codexMemoryRoot, "raw_memories.md"),
    name: "raw_memories.md",
    scope: "user",
    engine: "codex",
    description: "Codex raw memory notes.",
    memoryRole: "codex-raw",
  })
  await addMemoryResource({
    filePath: path.join(codexMemoryRoot, "extensions"),
    name: "memory extensions",
    scope: "user",
    engine: "codex",
    description: "Codex memory extension queue.",
    memoryRole: "codex-extensions",
  })
  await addMemoryResource({
    filePath: path.join(codexMemoryRoot, "rollout_summaries"),
    name: "rollout_summaries",
    scope: "user",
    engine: "codex",
    description: "Codex memory evidence summaries.",
    memoryRole: "codex-rollouts",
  })

  await addMemoryResource({
    filePath: path.join(home, ".claude", "CLAUDE.md"),
    name: "CLAUDE.md",
    scope: "user",
    engine: "claude-code",
    description: "Claude Code user memory file.",
    memoryRole: "claude-user-memory",
  })
  await addMemoryResource({
    filePath: path.join(home, ".claude", "memory"),
    name: "Claude memory",
    scope: "user",
    engine: "claude-code",
    description: "Claude Code user memory directory.",
    memoryRole: "claude-user-memory-dir",
  })
  await addMemoryResource({
    filePath: path.join(home, ".claude", "memories"),
    name: "Claude memories",
    scope: "user",
    engine: "claude-code",
    description: "Claude Code user memories directory.",
    memoryRole: "claude-user-memories-dir",
  })

  if (projectPath) {
    await addMemoryResource({
      filePath: path.join(projectPath, "CLAUDE.md"),
      name: "CLAUDE.md",
      scope: "project",
      engine: "claude-code",
      description: "Claude Code project memory and instruction file.",
      memoryRole: "claude-project-memory",
    })
    await addMemoryResource({
      filePath: path.join(projectPath, ".claude", "memory"),
      name: "Claude project memory",
      scope: "project",
      engine: "claude-code",
      description: "Claude Code project memory directory.",
      memoryRole: "claude-project-memory-dir",
    })
    await addMemoryResource({
      filePath: path.join(projectPath, ".claude", "memories"),
      name: "Claude project memories",
      scope: "project",
      engine: "claude-code",
      description: "Claude Code project memories directory.",
      memoryRole: "claude-project-memories-dir",
    })
    await addMemoryResource({
      filePath: path.join(projectPath, ".codex", "memories"),
      name: "Codex project memories",
      scope: "project",
      engine: "codex",
      description: "Codex project memory directory.",
      memoryRole: "codex-project-memory-dir",
    })
    await addMemoryResource({
      filePath: path.join(projectPath, ".1code", "memory"),
      name: "1Code shared memory",
      scope: "project",
      description: "1Code shared memory projection root.",
      memoryRole: "onecode-shared-memory",
    })

    const agentsPath = path.join(projectPath, "AGENTS.md")
    if (await pathExists(agentsPath)) {
      resources.push({
        id: "instruction:project:AGENTS.md",
        kind: "instruction",
        name: "AGENTS.md",
        scope: "project",
        path: "AGENTS.md",
        enabled: true,
      })
    }
  }

  return resources
}

export async function buildSharedResourceSnapshot(params: {
  projectPath?: string
  codexRoot?: string
  codexPluginCacheRoot?: string
  codexCacheRoot?: string
} = {}): Promise<SharedResourceSnapshot> {
  const projectPath = params.projectPath
  if (projectPath) {
    await ensureMossSource({ projectPath })
  }

  const enabledPluginSources = await getEnabledPlugins()
  const [installedPlugins, pluginMcpConfigs] = await Promise.all([
    discoverInstalledPlugins(),
    discoverPluginMcpServers(),
  ])
  const approvedPluginMcpServers = new Set(await getApprovedPluginMcpServers())
  const enabledPlugins = installedPlugins.filter((plugin) =>
    enabledPluginSources.includes(plugin.source),
  )

  const userClaudeRoot = path.join(home, ".claude")
  const projectClaudeRoot = projectPath ? path.join(projectPath, ".claude") : null

  const resources: SharedResource[] = [
    ...(projectPath ? await discoverMossSourceResources(projectPath) : []),
    ...(await scanAgentFiles(path.join(userClaudeRoot, "agents"), "user")),
    ...(await scanSkillDirs(path.join(userClaudeRoot, "skills"), "user")),
    ...(await scanCommandFiles(path.join(userClaudeRoot, "commands"), "user")),
    ...(projectClaudeRoot
      ? [
          ...(await scanAgentFiles(path.join(projectClaudeRoot, "agents"), "project", projectPath)),
          ...(await scanSkillDirs(path.join(projectClaudeRoot, "skills"), "project", projectPath)),
          ...(await scanCommandFiles(path.join(projectClaudeRoot, "commands"), "project", projectPath)),
        ]
      : []),
    ...(await collectClaudeMcpResources(projectPath)),
    ...(await collectCodexNativeResources({
      projectPath,
      codexRoot: params.codexRoot,
      pluginCacheRoot: params.codexPluginCacheRoot,
      codexCacheRoot: params.codexCacheRoot,
    })),
    ...(await collectCodexMcpResources()),
    ...(await collectMemoryResources(projectPath)),
  ]

  for (const plugin of installedPlugins) {
    const enabled = enabledPluginSources.includes(plugin.source)
    resources.push({
      id: resourceId(["plugin", plugin.source]),
      kind: "plugin",
      name: plugin.name,
      scope: "plugin",
      pluginSource: plugin.source,
      path: toDisplayPath(plugin.path),
      description: plugin.description,
      enabled,
      metadata: {
        marketplace: plugin.marketplace,
        version: plugin.version,
        category: plugin.category,
        homepage: plugin.homepage,
        tags: plugin.tags,
      },
    })
  }

  for (const plugin of enabledPlugins) {
    const paths = getPluginComponentPaths(plugin)
    resources.push(
      ...(await scanAgentFiles(paths.agents, "plugin", undefined, plugin.source)),
      ...(await scanSkillDirs(paths.skills, "plugin", undefined, plugin.source)),
      ...(await scanCommandFiles(paths.commands, "plugin", undefined, plugin.source)),
    )
  }

  for (const pluginConfig of pluginMcpConfigs) {
    for (const [serverName, serverConfig] of Object.entries(pluginConfig.mcpServers)) {
      const approved = approvedPluginMcpServers.has(`${pluginConfig.pluginSource}:${serverName}`)
      resources.push(...mcpResourcesFromRecord({
        servers: { [serverName]: serverConfig },
        scope: "plugin",
        engine: "claude-code",
        group: pluginConfig.pluginSource,
        pluginSource: pluginConfig.pluginSource,
      }).map((resource) => ({
        ...resource,
        enabled: enabledPluginSources.includes(pluginConfig.pluginSource) && approved,
        metadata: {
          ...resource.metadata,
          approved,
        },
      })))
    }
  }

  const governed = buildGovernedResourceProjection({
    resources,
    projectPath,
  })

  return {
    generatedAt: new Date().toISOString(),
    projectPath,
    resources: governed.resources,
    conflicts: governed.conflicts,
    projections: governed.projections,
  }
}

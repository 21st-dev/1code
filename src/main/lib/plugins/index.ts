import * as fs from "fs/promises"
import type { Dirent } from "fs"
import * as path from "path"
import * as os from "os"
import type { McpServerConfig } from "../claude-config"
import { isDirentDirectory } from "../fs/dirent"

export type PluginRuntime = "claude" | "codex"
export type PluginSourceKind = "local-marketplace" | "cache"
export type PluginSourceTrust = "official" | "local" | "external"
export type PluginSourceStatus = "available" | "empty" | "missing"

interface PluginComponentPaths {
  commands?: string
  skills?: string
  agents?: string
  mcpServers?: string
}

export interface PluginInfo {
  runtime: PluginRuntime
  name: string
  version: string
  description?: string
  path: string
  installRoot: string
  sourceRoot?: string
  source: string // e.g., "marketplace:plugin-name"
  marketplace: string // e.g., "claude-plugins-official"
  category?: string
  homepage?: string
  tags?: string[]
  componentPaths?: PluginComponentPaths
}

export interface PluginSourceInfo {
  id: string
  runtime: PluginRuntime
  name: string
  description: string
  kind: PluginSourceKind
  trust: PluginSourceTrust
  status: PluginSourceStatus
  path: string
  pluginCount: number
  installHint: string
  homepage?: string
}

interface MarketplacePlugin {
  name: string
  version?: string
  description?: string
  source: string | { source: string; url: string }
  category?: string
  homepage?: string
  tags?: string[]
}

interface MarketplaceJson {
  name: string
  plugins: MarketplacePlugin[]
}

interface CodexPluginJson {
  name?: string
  version?: string
  description?: string
  homepage?: string
  repository?: string
  keywords?: unknown
  commands?: unknown
  skills?: unknown
  agents?: unknown
  mcpServers?: unknown
  interface?: {
    displayName?: string
    shortDescription?: string
    category?: string
    websiteURL?: string
  }
}

export interface PluginMcpConfig {
  runtime: PluginRuntime
  pluginSource: string // e.g., "ccsetup:ccsetup"
  mcpServers: Record<string, McpServerConfig>
}

// Cache for plugin discovery results
let pluginCache: { plugins: PluginInfo[]; timestamp: number } | null = null
let codexPluginCache: { plugins: PluginInfo[]; timestamp: number } | null = null
let mcpCache: { configs: PluginMcpConfig[]; timestamp: number } | null = null
const CACHE_TTL_MS = 30000 // 30 seconds - plugins don't change often during a session
const CLAUDE_MARKETPLACES_DIR = path.join(os.homedir(), ".claude", "plugins", "marketplaces")
const CODEX_PLUGIN_CACHE_DIR = path.join(os.homedir(), ".codex", "plugins", "cache")

/**
 * Clear plugin caches (for testing/manual invalidation)
 */
export function clearPluginCache() {
  pluginCache = null
  codexPluginCache = null
  mcpCache = null
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined
}

function getStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const values = value.filter((item): item is string => typeof item === "string")
  return values.length > 0 ? values : undefined
}

function resolveComponentPath(pluginRoot: string, value: unknown): string | undefined {
  const componentPath = getString(value)
  if (!componentPath) return undefined
  return path.resolve(pluginRoot, componentPath)
}

async function getDirectoryStatus(targetPath: string): Promise<PluginSourceStatus> {
  let entries: Dirent[]
  try {
    entries = await fs.readdir(targetPath, { withFileTypes: true })
  } catch {
    return "missing"
  }

  return entries.some((entry) => !entry.name.startsWith(".")) ? "available" : "empty"
}

function formatSourceName(name: string): string {
  return name
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\bOpenai\b/g, "OpenAI")
}

function getSourceTrust(runtime: PluginRuntime, marketplace: string): PluginSourceTrust {
  if (runtime === "codex" && marketplace.startsWith("openai-")) return "official"
  return "local"
}

function getSourceDescription(runtime: PluginRuntime): string {
  return runtime === "claude"
    ? "Local Claude Code plugin marketplace source."
    : "Codex plugin cache collection managed by Codex."
}

function getSourceInstallHint(runtime: PluginRuntime): string {
  return runtime === "claude"
    ? "Install Claude plugin marketplaces under ~/.claude/plugins/marketplaces/."
    : "Codex manages this cache; install or update plugins through Codex, then refresh."
}

function getSourceKind(runtime: PluginRuntime): PluginSourceKind {
  return runtime === "claude" ? "local-marketplace" : "cache"
}

/**
 * Discover all installed plugins from ~/.claude/plugins/marketplaces/
 * Returns array of plugin info with paths to their component directories
 * Results are cached for 30 seconds to avoid repeated filesystem scans
 */
export async function discoverInstalledPlugins(): Promise<PluginInfo[]> {
  // Return cached result if still valid
  if (pluginCache && Date.now() - pluginCache.timestamp < CACHE_TTL_MS) {
    return pluginCache.plugins
  }

  const plugins: PluginInfo[] = []
  const marketplacesDir = CLAUDE_MARKETPLACES_DIR

  try {
    await fs.access(marketplacesDir)
  } catch {
    pluginCache = { plugins, timestamp: Date.now() }
    return plugins
  }

  let marketplaces: Dirent[]
  try {
    marketplaces = await fs.readdir(marketplacesDir, { withFileTypes: true })
  } catch {
    pluginCache = { plugins, timestamp: Date.now() }
    return plugins
  }

  for (const marketplace of marketplaces) {
    if (marketplace.name.startsWith(".")) continue

    const isMarketplaceDir = await isDirentDirectory(
      marketplacesDir,
      marketplace,
    )
    if (!isMarketplaceDir) continue

    const marketplacePath = path.join(marketplacesDir, marketplace.name)
    const marketplaceJsonPath = path.join(marketplacePath, ".claude-plugin", "marketplace.json")

    try {
      const content = await fs.readFile(marketplaceJsonPath, "utf-8")

      let marketplaceJson: MarketplaceJson
      try {
        marketplaceJson = JSON.parse(content)
      } catch {
        continue
      }

      if (!Array.isArray(marketplaceJson.plugins)) {
        continue
      }

      for (const plugin of marketplaceJson.plugins) {
        // Validate plugin.source exists
        if (!plugin.source) continue

        // source can be a string path or an object { source: "url", url: "..." }
        const sourcePath = typeof plugin.source === "string" ? plugin.source : null
        if (!sourcePath) continue

        const pluginPath = path.resolve(marketplacePath, sourcePath)
        try {
          const pluginStat = await fs.stat(pluginPath)
          if (!pluginStat.isDirectory()) continue
          plugins.push({
            runtime: "claude",
            name: plugin.name,
            version: plugin.version || "0.0.0",
            description: plugin.description,
            path: pluginPath,
            installRoot: marketplacesDir,
            sourceRoot: marketplacePath,
            source: `${marketplaceJson.name}:${plugin.name}`,
            marketplace: marketplaceJson.name,
            category: plugin.category,
            homepage: plugin.homepage,
            tags: plugin.tags,
          })
        } catch {
          // Plugin directory not found, skip
        }
      }
    } catch {
      // No marketplace.json, skip silently (expected for non-plugin directories)
    }
  }

  pluginCache = { plugins, timestamp: Date.now() }
  return plugins
}

/**
 * Discover installed Codex plugins from ~/.codex/plugins/cache/
 * These are listed for visibility only; this app does not own Codex plugin
 * enablement state.
 */
export async function discoverCodexInstalledPlugins(): Promise<PluginInfo[]> {
  if (codexPluginCache && Date.now() - codexPluginCache.timestamp < CACHE_TTL_MS) {
    return codexPluginCache.plugins
  }

  const plugins: PluginInfo[] = []
  const cacheRoot = CODEX_PLUGIN_CACHE_DIR

  try {
    await fs.access(cacheRoot)
  } catch {
    codexPluginCache = { plugins, timestamp: Date.now() }
    return plugins
  }

  let collections: Dirent[]
  try {
    collections = await fs.readdir(cacheRoot, { withFileTypes: true })
  } catch {
    codexPluginCache = { plugins, timestamp: Date.now() }
    return plugins
  }

  for (const collection of collections) {
    if (collection.name.startsWith(".")) continue
    if (!(await isDirentDirectory(cacheRoot, collection))) continue

    const collectionPath = path.join(cacheRoot, collection.name)
    let pluginEntries: Dirent[]
    try {
      pluginEntries = await fs.readdir(collectionPath, { withFileTypes: true })
    } catch {
      continue
    }

    for (const pluginEntry of pluginEntries) {
      if (pluginEntry.name.startsWith(".")) continue
      if (!(await isDirentDirectory(collectionPath, pluginEntry))) continue

      const pluginFamilyPath = path.join(collectionPath, pluginEntry.name)
      let versionEntries: Dirent[]
      try {
        versionEntries = await fs.readdir(pluginFamilyPath, { withFileTypes: true })
      } catch {
        continue
      }

      for (const versionEntry of versionEntries) {
        if (versionEntry.name.startsWith(".")) continue
        if (!(await isDirentDirectory(pluginFamilyPath, versionEntry))) continue

        const pluginPath = path.join(pluginFamilyPath, versionEntry.name)
        const pluginJsonPath = path.join(pluginPath, ".codex-plugin", "plugin.json")

        let parsed: CodexPluginJson
        try {
          const content = await fs.readFile(pluginJsonPath, "utf-8")
          parsed = JSON.parse(content) as CodexPluginJson
        } catch {
          continue
        }

        const displayName =
          getString(parsed.interface?.displayName) ??
          getString(parsed.name) ??
          pluginEntry.name
        const description =
          getString(parsed.interface?.shortDescription) ??
          getString(parsed.description)
        const homepage =
          getString(parsed.homepage) ??
          getString(parsed.interface?.websiteURL) ??
          getString(parsed.repository)

        plugins.push({
          runtime: "codex",
          name: displayName,
          version: getString(parsed.version) ?? versionEntry.name,
          description,
          path: pluginPath,
          installRoot: cacheRoot,
          sourceRoot: collectionPath,
          source: `${collection.name}:${pluginEntry.name}@${versionEntry.name}`,
          marketplace: collection.name,
          category: getString(parsed.interface?.category),
          homepage,
          tags: getStringArray(parsed.keywords),
          componentPaths: {
            commands:
              resolveComponentPath(pluginPath, parsed.commands) ??
              path.join(pluginPath, "commands"),
            skills:
              resolveComponentPath(pluginPath, parsed.skills) ??
              path.join(pluginPath, "skills"),
            agents:
              resolveComponentPath(pluginPath, parsed.agents) ??
              path.join(pluginPath, "agents"),
            mcpServers:
              resolveComponentPath(pluginPath, parsed.mcpServers) ??
              path.join(pluginPath, ".mcp.json"),
          },
        })
      }
    }
  }

  codexPluginCache = { plugins, timestamp: Date.now() }
  return plugins
}

export async function discoverAllRuntimePlugins(): Promise<PluginInfo[]> {
  const [claudePlugins, codexPlugins] = await Promise.all([
    discoverInstalledPlugins(),
    discoverCodexInstalledPlugins(),
  ])
  return [...claudePlugins, ...codexPlugins]
}

export async function discoverPluginSources(): Promise<PluginSourceInfo[]> {
  const [plugins, claudeRootStatus, codexRootStatus] = await Promise.all([
    discoverAllRuntimePlugins(),
    getDirectoryStatus(CLAUDE_MARKETPLACES_DIR),
    getDirectoryStatus(CODEX_PLUGIN_CACHE_DIR),
  ])

  const bySource = new Map<string, {
    runtime: PluginRuntime
    marketplace: string
    path: string
    pluginCount: number
  }>()

  for (const plugin of plugins) {
    const key = `${plugin.runtime}:${plugin.marketplace}`
    const existing = bySource.get(key)
    if (existing) {
      existing.pluginCount += 1
      continue
    }
    bySource.set(key, {
      runtime: plugin.runtime,
      marketplace: plugin.marketplace,
      path: plugin.sourceRoot ?? plugin.installRoot,
      pluginCount: 1,
    })
  }

  const sources = Array.from(bySource.values()).map((source): PluginSourceInfo => ({
    id: `${source.runtime}:${source.marketplace}`,
    runtime: source.runtime,
    name: formatSourceName(source.marketplace),
    description: getSourceDescription(source.runtime),
    kind: getSourceKind(source.runtime),
    trust: getSourceTrust(source.runtime, source.marketplace),
    status: "available",
    path: source.path,
    pluginCount: source.pluginCount,
    installHint: getSourceInstallHint(source.runtime),
  }))

  if (!sources.some((source) => source.runtime === "claude")) {
    sources.push({
      id: "claude:local-marketplaces",
      runtime: "claude",
      name: "Claude Local Marketplaces",
      description: getSourceDescription("claude"),
      kind: "local-marketplace",
      trust: "local",
      status: claudeRootStatus === "available" ? "empty" : claudeRootStatus,
      path: CLAUDE_MARKETPLACES_DIR,
      pluginCount: 0,
      installHint: getSourceInstallHint("claude"),
    })
  }

  if (!sources.some((source) => source.runtime === "codex")) {
    sources.push({
      id: "codex:plugin-cache",
      runtime: "codex",
      name: "Codex Plugin Cache",
      description: getSourceDescription("codex"),
      kind: "cache",
      trust: "local",
      status: codexRootStatus === "available" ? "empty" : codexRootStatus,
      path: CODEX_PLUGIN_CACHE_DIR,
      pluginCount: 0,
      installHint: getSourceInstallHint("codex"),
    })
  }

  return sources.sort((a, b) => {
    if (a.runtime !== b.runtime) return a.runtime.localeCompare(b.runtime)
    return a.name.localeCompare(b.name)
  })
}

/**
 * Get component paths for a plugin (commands, skills, agents directories)
 */
export function getPluginComponentPaths(plugin: PluginInfo) {
  return {
    commands: plugin.componentPaths?.commands ?? path.join(plugin.path, "commands"),
    skills: plugin.componentPaths?.skills ?? path.join(plugin.path, "skills"),
    agents: plugin.componentPaths?.agents ?? path.join(plugin.path, "agents"),
    mcpServers: plugin.componentPaths?.mcpServers ?? path.join(plugin.path, ".mcp.json"),
  }
}

/**
 * Discover MCP server configs from all installed plugins
 * Reads .mcp.json from each plugin directory
 * Results are cached for 30 seconds to avoid repeated filesystem scans
 */
export async function discoverPluginMcpServers(): Promise<PluginMcpConfig[]> {
  // Return cached result if still valid
  if (mcpCache && Date.now() - mcpCache.timestamp < CACHE_TTL_MS) {
    return mcpCache.configs
  }

  const plugins = await discoverInstalledPlugins()
  const configs: PluginMcpConfig[] = []

  for (const plugin of plugins) {
    const mcpJsonPath = path.join(plugin.path, ".mcp.json")
    try {
      const content = await fs.readFile(mcpJsonPath, "utf-8")
      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(content)
      } catch {
        continue
      }

      // Support two formats:
      // Format A (flat): { "server-name": { "command": "...", ... } }
      // Format B (nested): { "mcpServers": { "server-name": { ... } } }
      const serversObj =
        parsed.mcpServers &&
        typeof parsed.mcpServers === "object" &&
        !Array.isArray(parsed.mcpServers)
          ? (parsed.mcpServers as Record<string, unknown>)
          : parsed

      const validServers: Record<string, McpServerConfig> = {}
      for (const [name, config] of Object.entries(serversObj)) {
        if (config && typeof config === "object" && !Array.isArray(config)) {
          validServers[name] = config as McpServerConfig
        }
      }

      if (Object.keys(validServers).length > 0) {
        configs.push({
          runtime: plugin.runtime,
          pluginSource: plugin.source,
          mcpServers: validServers,
        })
      }
    } catch {
      // No .mcp.json file, skip silently (this is expected for most plugins)
    }
  }

  // Cache the result
  mcpCache = { configs, timestamp: Date.now() }
  return configs
}

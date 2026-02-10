import * as fs from "fs/promises"
import type { Dirent } from "fs"
import * as path from "path"
import * as os from "os"
import * as semver from "semver"
import type { McpServerConfig } from "../claude-config"
import { isDirentDirectory } from "../fs/dirent"

export interface PluginInfo {
  name: string
  version: string
  description?: string
  path: string
  source: string // e.g., "marketplace:plugin-name"
  marketplace: string // e.g., "claude-plugins-official"
  category?: string
  homepage?: string
  tags?: string[]
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

export interface PluginMcpConfig {
  pluginSource: string // e.g., "ccsetup:ccsetup"
  mcpServers: Record<string, McpServerConfig>
}

// Cache for plugin discovery results
let pluginCache: { plugins: PluginInfo[]; timestamp: number } | null = null
let mcpCache: { configs: PluginMcpConfig[]; timestamp: number } | null = null
const CACHE_TTL_MS = 30000 // 30 seconds - plugins don't change often during a session

/**
 * Safely parse a version string, returning a valid semver or "0.0.0" as fallback.
 * Uses semver.coerce() to handle non-standard formats like "v1.2" or "1.2".
 */
function safeParseVersion(version: string): string {
  if (!version) return "0.0.0"

  // Try to coerce non-standard versions to valid semver
  const coerced = semver.coerce(version)
  if (coerced) {
    return coerced.version
  }

  // If coercion fails, check if it's already valid
  if (semver.valid(version)) {
    return version
  }

  // Log warning for debugging
  console.warn(`Invalid plugin version format: "${version}", defaulting to 0.0.0`)
  return "0.0.0"
}

/**
 * Deduplicates plugins by keeping only the highest version of each plugin
 * per marketplace. Uses composite key `marketplace:name` for grouping.
 *
 * @param plugins - Array of discovered plugins (may contain duplicates)
 * @returns Array with only the highest version of each plugin per marketplace
 */
function deduplicatePluginsByVersion(plugins: PluginInfo[]): PluginInfo[] {
  // Group plugins by composite key (marketplace:name)
  const pluginMap = new Map<string, PluginInfo>()

  for (const plugin of plugins) {
    const key = `${plugin.marketplace}:${plugin.name}`
    const existing = pluginMap.get(key)

    if (!existing) {
      // First occurrence of this plugin
      pluginMap.set(key, plugin)
      continue
    }

    // Compare versions and keep the higher one
    const existingVersion = safeParseVersion(existing.version)
    const currentVersion = safeParseVersion(plugin.version)

    try {
      if (semver.gt(currentVersion, existingVersion)) {
        pluginMap.set(key, plugin)
      }
    } catch (error) {
      // semver.gt can throw for truly invalid versions after coercion
      // In this case, keep the existing one (first wins for invalid versions)
      console.warn(
        `Version comparison failed for ${key}: "${plugin.version}" vs "${existing.version}"`
      )
    }
  }

  return Array.from(pluginMap.values())
}

/**
 * Clear plugin caches (for testing/manual invalidation)
 */
export function clearPluginCache() {
  pluginCache = null
  mcpCache = null
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
  const marketplacesDir = path.join(os.homedir(), ".claude", "plugins", "marketplaces")

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
            name: plugin.name,
            version: plugin.version || "0.0.0",
            description: plugin.description,
            path: pluginPath,
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

  // Deduplicate: keep only highest version of each plugin per marketplace
  const deduplicatedPlugins = deduplicatePluginsByVersion(plugins)

  pluginCache = { plugins: deduplicatedPlugins, timestamp: Date.now() }
  return deduplicatedPlugins
}

/**
 * Get component paths for a plugin (commands, skills, agents directories)
 */
export function getPluginComponentPaths(plugin: PluginInfo) {
  return {
    commands: path.join(plugin.path, "commands"),
    skills: path.join(plugin.path, "skills"),
    agents: path.join(plugin.path, "agents"),
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

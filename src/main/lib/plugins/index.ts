import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import type { McpServerConfig } from "../claude-config"

export interface PluginInfo {
  name: string
  version: string
  path: string
  source: string // e.g., "marketplace:plugin-name"
}

interface MarketplacePlugin {
  name: string
  version: string
  source: string
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
const CACHE_TTL_MS = 5000 // 5 seconds

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
 * Results are cached for 5 seconds to avoid repeated filesystem scans
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
    // No plugins directory exists
    pluginCache = { plugins, timestamp: Date.now() }
    return plugins
  }

  let marketplaces: fs.Dirent[]
  try {
    marketplaces = await fs.readdir(marketplacesDir, { withFileTypes: true })
  } catch {
    pluginCache = { plugins, timestamp: Date.now() }
    return plugins
  }

  for (const marketplace of marketplaces) {
    if (!marketplace.isDirectory() || marketplace.name.startsWith(".")) continue

    const marketplacePath = path.join(marketplacesDir, marketplace.name)
    const marketplaceJsonPath = path.join(marketplacePath, ".claude-plugin", "marketplace.json")

    try {
      const content = await fs.readFile(marketplaceJsonPath, "utf-8")

      let marketplaceJson: MarketplaceJson
      try {
        marketplaceJson = JSON.parse(content)
      } catch {
        console.warn(`[plugins] Invalid JSON in ${marketplaceJsonPath}`)
        continue
      }

      // Validate plugins array exists
      if (!Array.isArray(marketplaceJson.plugins)) {
        console.warn(`[plugins] Missing plugins array in ${marketplaceJsonPath}`)
        continue
      }

      for (const plugin of marketplaceJson.plugins) {
        // Validate plugin.source exists
        if (!plugin.source) {
          console.debug(`[plugins] Skipped plugin without source in ${marketplaceJsonPath}`)
          continue
        }

        const pluginPath = path.resolve(marketplacePath, plugin.source)
        try {
          await fs.access(pluginPath)
          plugins.push({
            name: plugin.name,
            version: plugin.version,
            path: pluginPath,
            source: `${marketplaceJson.name}:${plugin.name}`,
          })
        } catch {
          console.debug(`[plugins] Skipped plugin "${plugin.name}" - directory not found: ${pluginPath}`)
        }
      }
    } catch {
      // No marketplace.json, skip silently (expected for non-plugin directories)
    }
  }

  // Cache the result
  pluginCache = { plugins, timestamp: Date.now() }
  return plugins
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
 * Results are cached for 5 seconds to avoid repeated filesystem scans
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
      let mcpConfig: { mcpServers?: unknown }
      try {
        mcpConfig = JSON.parse(content)
      } catch {
        console.warn(`[plugins] Invalid JSON in ${mcpJsonPath}`)
        continue
      }

      // Validate mcpServers is an object with valid server configs
      if (
        mcpConfig.mcpServers &&
        typeof mcpConfig.mcpServers === "object" &&
        !Array.isArray(mcpConfig.mcpServers)
      ) {
        // Filter to only include valid server config objects
        const validServers: Record<string, McpServerConfig> = {}
        for (const [name, config] of Object.entries(mcpConfig.mcpServers)) {
          if (config && typeof config === "object" && !Array.isArray(config)) {
            validServers[name] = config as McpServerConfig
          } else {
            console.debug(`[plugins] Skipped invalid MCP server config "${name}" in ${mcpJsonPath}`)
          }
        }

        if (Object.keys(validServers).length > 0) {
          configs.push({
            pluginSource: plugin.source,
            mcpServers: validServers,
          })
        }
      }
    } catch {
      // No .mcp.json file, skip silently (this is expected for most plugins)
    }
  }

  // Cache the result
  mcpCache = { configs, timestamp: Date.now() }
  return configs
}

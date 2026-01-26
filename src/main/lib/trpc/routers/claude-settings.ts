import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import { z } from "zod"
import { router, publicProcedure } from "../index"

const CLAUDE_SETTINGS_PATH = path.join(os.homedir(), ".claude", "settings.json")

// Cache for disabled plugins to avoid repeated filesystem reads
let disabledPluginsCache: { plugins: string[]; timestamp: number } | null = null
const DISABLED_PLUGINS_CACHE_TTL_MS = 5000 // 5 seconds

// Cache for approved plugin MCP servers
let approvedMcpCache: { servers: string[]; timestamp: number } | null = null
const APPROVED_MCP_CACHE_TTL_MS = 5000 // 5 seconds

/**
 * Invalidate the disabled plugins cache
 * Call this when disabledPlugins setting changes
 */
export function invalidateDisabledPluginsCache(): void {
  disabledPluginsCache = null
}

/**
 * Invalidate the approved MCP servers cache
 * Call this when approvedPluginMcpServers setting changes
 */
export function invalidateApprovedMcpCache(): void {
  approvedMcpCache = null
}

/**
 * Read Claude settings.json file
 * Returns empty object if file doesn't exist
 */
async function readClaudeSettings(): Promise<Record<string, unknown>> {
  try {
    const content = await fs.readFile(CLAUDE_SETTINGS_PATH, "utf-8")
    return JSON.parse(content)
  } catch (error) {
    // File doesn't exist or is invalid JSON
    return {}
  }
}

/**
 * Get list of disabled plugin identifiers from settings.json
 * Returns empty array if no disabled plugins
 * Results are cached for 5 seconds to reduce filesystem reads
 */
export async function getDisabledPlugins(): Promise<string[]> {
  // Return cached result if still valid
  if (disabledPluginsCache && Date.now() - disabledPluginsCache.timestamp < DISABLED_PLUGINS_CACHE_TTL_MS) {
    return disabledPluginsCache.plugins
  }

  const settings = await readClaudeSettings()
  const plugins = Array.isArray(settings.disabledPlugins) ? settings.disabledPlugins as string[] : []

  disabledPluginsCache = { plugins, timestamp: Date.now() }
  return plugins
}

/**
 * Get list of approved plugin MCP server identifiers from settings.json
 * Format: "{pluginSource}:{serverName}" e.g., "ccsetup:ccsetup:context7"
 * Returns empty array if no approved servers
 * Results are cached for 5 seconds to reduce filesystem reads
 */
export async function getApprovedPluginMcpServers(): Promise<string[]> {
  // Return cached result if still valid
  if (approvedMcpCache && Date.now() - approvedMcpCache.timestamp < APPROVED_MCP_CACHE_TTL_MS) {
    return approvedMcpCache.servers
  }

  const settings = await readClaudeSettings()
  const servers = Array.isArray(settings.approvedPluginMcpServers)
    ? settings.approvedPluginMcpServers as string[]
    : []

  approvedMcpCache = { servers, timestamp: Date.now() }
  return servers
}

/**
 * Check if a plugin MCP server is approved
 */
export async function isPluginMcpApproved(pluginSource: string, serverName: string): Promise<boolean> {
  const approved = await getApprovedPluginMcpServers()
  const identifier = `${pluginSource}:${serverName}`
  return approved.includes(identifier)
}

/**
 * Write Claude settings.json file
 * Creates the .claude directory if it doesn't exist
 */
async function writeClaudeSettings(settings: Record<string, unknown>): Promise<void> {
  const dir = path.dirname(CLAUDE_SETTINGS_PATH)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf-8")
}

export const claudeSettingsRouter = router({
  /**
   * Get the includeCoAuthoredBy setting
   * Returns true if setting is not explicitly set to false
   */
  getIncludeCoAuthoredBy: publicProcedure.query(async () => {
    const settings = await readClaudeSettings()
    // Default is true (include co-authored-by)
    // Only return false if explicitly set to false
    return settings.includeCoAuthoredBy !== false
  }),

  /**
   * Set the includeCoAuthoredBy setting
   */
  setIncludeCoAuthoredBy: publicProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ input }) => {
      const settings = await readClaudeSettings()

      if (input.enabled) {
        // Remove the setting to use default (true)
        delete settings.includeCoAuthoredBy
      } else {
        // Explicitly set to false to disable
        settings.includeCoAuthoredBy = false
      }

      await writeClaudeSettings(settings)
      return { success: true }
    }),

  /**
   * Get list of disabled plugins
   */
  getDisabledPlugins: publicProcedure.query(async () => {
    return await getDisabledPlugins()
  }),

  /**
   * Set a plugin's disabled state
   */
  setPluginDisabled: publicProcedure
    .input(
      z.object({
        pluginSource: z.string(),
        disabled: z.boolean(),
      })
    )
    .mutation(async ({ input }) => {
      const settings = await readClaudeSettings()
      const disabledPlugins = Array.isArray(settings.disabledPlugins)
        ? (settings.disabledPlugins as string[])
        : []

      if (input.disabled && !disabledPlugins.includes(input.pluginSource)) {
        disabledPlugins.push(input.pluginSource)
      } else if (!input.disabled) {
        const index = disabledPlugins.indexOf(input.pluginSource)
        if (index > -1) disabledPlugins.splice(index, 1)
      }

      settings.disabledPlugins = disabledPlugins
      await writeClaudeSettings(settings)
      invalidateDisabledPluginsCache()
      return { success: true }
    }),

  /**
   * Get list of approved plugin MCP servers
   */
  getApprovedPluginMcpServers: publicProcedure.query(async () => {
    return await getApprovedPluginMcpServers()
  }),

  /**
   * Approve a plugin MCP server
   * Identifier format: "{pluginSource}:{serverName}"
   */
  approvePluginMcpServer: publicProcedure
    .input(z.object({ identifier: z.string() }))
    .mutation(async ({ input }) => {
      const settings = await readClaudeSettings()
      const approved = Array.isArray(settings.approvedPluginMcpServers)
        ? (settings.approvedPluginMcpServers as string[])
        : []

      if (!approved.includes(input.identifier)) {
        approved.push(input.identifier)
      }

      settings.approvedPluginMcpServers = approved
      await writeClaudeSettings(settings)
      invalidateApprovedMcpCache()
      return { success: true }
    }),

  /**
   * Revoke approval for a plugin MCP server
   * Identifier format: "{pluginSource}:{serverName}"
   */
  revokePluginMcpServer: publicProcedure
    .input(z.object({ identifier: z.string() }))
    .mutation(async ({ input }) => {
      const settings = await readClaudeSettings()
      const approved = Array.isArray(settings.approvedPluginMcpServers)
        ? (settings.approvedPluginMcpServers as string[])
        : []

      const index = approved.indexOf(input.identifier)
      if (index > -1) {
        approved.splice(index, 1)
      }

      settings.approvedPluginMcpServers = approved
      await writeClaudeSettings(settings)
      invalidateApprovedMcpCache()
      return { success: true }
    }),

  /**
   * Approve all MCP servers from a plugin
   * Takes the pluginSource (e.g., "ccsetup:ccsetup") and list of server names
   */
  approveAllPluginMcpServers: publicProcedure
    .input(z.object({
      pluginSource: z.string(),
      serverNames: z.array(z.string()),
    }))
    .mutation(async ({ input }) => {
      const settings = await readClaudeSettings()
      const approved = Array.isArray(settings.approvedPluginMcpServers)
        ? (settings.approvedPluginMcpServers as string[])
        : []

      for (const serverName of input.serverNames) {
        const identifier = `${input.pluginSource}:${serverName}`
        if (!approved.includes(identifier)) {
          approved.push(identifier)
        }
      }

      settings.approvedPluginMcpServers = approved
      await writeClaudeSettings(settings)
      invalidateApprovedMcpCache()
      return { success: true }
    }),
})

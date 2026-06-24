import { z } from "zod"
import { router, publicProcedure } from "../index"
export {
  getApprovedPluginMcpServers,
  getEnabledPlugins,
  invalidateApprovedMcpCache,
  invalidateEnabledPluginsCache,
  isPluginMcpApproved,
} from "../../claude-plugin-settings"
import {
  getApprovedPluginMcpServers,
  getEnabledPlugins,
  invalidateApprovedMcpCache,
  invalidateEnabledPluginsCache,
  readClaudeSettings,
  writeClaudeSettings,
} from "../../claude-plugin-settings"

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
   * Get list of enabled plugins
   * Plugins are disabled by default — only explicitly enabled ones are active.
   */
  getEnabledPlugins: publicProcedure.query(async () => {
    return await getEnabledPlugins()
  }),

  /**
   * Set a plugin's enabled state
   * Plugins are disabled by default — adding to enabledPlugins activates them.
   */
  setPluginEnabled: publicProcedure
    .input(
      z.object({
        pluginSource: z.string(),
        enabled: z.boolean(),
      })
    )
    .mutation(async ({ input }) => {
      const settings = await readClaudeSettings()
      const enabledPlugins = Array.isArray(settings.enabledPlugins)
        ? (settings.enabledPlugins as string[])
        : []

      if (input.enabled && !enabledPlugins.includes(input.pluginSource)) {
        enabledPlugins.push(input.pluginSource)
      } else if (!input.enabled) {
        const index = enabledPlugins.indexOf(input.pluginSource)
        if (index > -1) enabledPlugins.splice(index, 1)
      }

      settings.enabledPlugins = enabledPlugins
      await writeClaudeSettings(settings)
      invalidateEnabledPluginsCache()
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

  /**
   * Revoke all MCP servers from a plugin
   * Removes all identifiers matching "{pluginSource}:*"
   */
  revokeAllPluginMcpServers: publicProcedure
    .input(z.object({
      pluginSource: z.string(),
    }))
    .mutation(async ({ input }) => {
      const settings = await readClaudeSettings()
      const approved = Array.isArray(settings.approvedPluginMcpServers)
        ? (settings.approvedPluginMcpServers as string[])
        : []

      const prefix = `${input.pluginSource}:`
      settings.approvedPluginMcpServers = approved.filter((id) => !id.startsWith(prefix))
      await writeClaudeSettings(settings)
      invalidateApprovedMcpCache()
      return { success: true }
    }),
})

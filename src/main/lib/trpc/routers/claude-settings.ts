import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import { z } from "zod"
import { router, publicProcedure } from "../index"

const CLAUDE_SETTINGS_PATH = path.join(os.homedir(), ".claude", "settings.json")

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
 */
export async function getDisabledPlugins(): Promise<string[]> {
  const settings = await readClaudeSettings()
  return Array.isArray(settings.disabledPlugins) ? settings.disabledPlugins as string[] : []
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
      return { success: true }
    }),
})

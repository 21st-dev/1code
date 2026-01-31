import { router, publicProcedure } from "../index"
import * as fs from "fs/promises"
import * as path from "path"
import matter from "gray-matter"
import {
  discoverInstalledPlugins,
  getPluginComponentPaths,
  discoverPluginMcpServers,
  clearPluginCache,
} from "../../plugins"
import { getEnabledPlugins } from "./claude-settings"

interface PluginComponent {
  name: string
  description?: string
}

interface PluginWithComponents {
  name: string
  version: string
  description?: string
  path: string
  source: string // e.g., "ccsetup:ccsetup"
  marketplace: string
  category?: string
  homepage?: string
  tags?: string[]
  isDisabled: boolean
  components: {
    commands: PluginComponent[]
    skills: PluginComponent[]
    agents: PluginComponent[]
    mcpServers: string[]
  }
}

/**
 * Validate entry name for security (prevent path traversal)
 */
function isValidEntryName(name: string): boolean {
  return !name.includes("..") && !name.includes("/") && !name.includes("\\")
}

/**
 * Scan commands directory and return component info
 */
async function scanPluginCommands(dir: string): Promise<PluginComponent[]> {
  const components: PluginComponent[] = []

  try {
    await fs.access(dir)
  } catch {
    return components
  }

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      if (!isValidEntryName(entry.name)) continue

      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        // Recursively scan nested directories for namespaced commands
        const nested = await scanPluginCommands(fullPath)
        components.push(...nested)
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        try {
          const content = await fs.readFile(fullPath, "utf-8")
          const { data } = matter(content)
          const baseName = entry.name.replace(/\.md$/, "")
          components.push({
            name: typeof data.name === "string" ? data.name : baseName,
            description:
              typeof data.description === "string" ? data.description : undefined,
          })
        } catch {
          // Skip files that can't be read
        }
      }
    }
  } catch {
    // Directory read failed
  }

  return components
}

/**
 * Scan skills directory and return component info
 */
async function scanPluginSkills(dir: string): Promise<PluginComponent[]> {
  const components: PluginComponent[] = []

  try {
    await fs.access(dir)
  } catch {
    return components
  }

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory() || !isValidEntryName(entry.name)) continue

      const skillMdPath = path.join(dir, entry.name, "SKILL.md")
      try {
        const content = await fs.readFile(skillMdPath, "utf-8")
        const { data } = matter(content)
        components.push({
          name: typeof data.name === "string" ? data.name : entry.name,
          description:
            typeof data.description === "string" ? data.description : undefined,
        })
      } catch {
        // Skill directory doesn't have SKILL.md - skip
      }
    }
  } catch {
    // Directory read failed
  }

  return components
}

/**
 * Scan agents directory and return component info
 */
async function scanPluginAgents(dir: string): Promise<PluginComponent[]> {
  const components: PluginComponent[] = []

  try {
    await fs.access(dir)
  } catch {
    return components
  }

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".md") || !isValidEntryName(entry.name))
        continue

      const fullPath = path.join(dir, entry.name)
      try {
        const content = await fs.readFile(fullPath, "utf-8")
        const { data } = matter(content)
        const baseName = entry.name.replace(/\.md$/, "")
        components.push({
          name: typeof data.name === "string" ? data.name : baseName,
          description:
            typeof data.description === "string" ? data.description : undefined,
        })
      } catch {
        // Skip files that can't be read
      }
    }
  } catch {
    // Directory read failed
  }

  return components
}

export const pluginsRouter = router({
  /**
   * List all installed plugins with their components and disabled status
   */
  list: publicProcedure.query(async (): Promise<PluginWithComponents[]> => {
    const [installedPlugins, enabledPlugins, mcpConfigs] = await Promise.all([
      discoverInstalledPlugins(),
      getEnabledPlugins(),
      discoverPluginMcpServers(),
    ])

    // Build a map of plugin source -> MCP server names
    const pluginMcpMap = new Map<string, string[]>()
    for (const config of mcpConfigs) {
      pluginMcpMap.set(config.pluginSource, Object.keys(config.mcpServers))
    }

    // Scan components for each plugin in parallel
    const pluginsWithComponents = await Promise.all(
      installedPlugins.map(async (plugin) => {
        const paths = getPluginComponentPaths(plugin)

        const [commands, skills, agents] = await Promise.all([
          scanPluginCommands(paths.commands),
          scanPluginSkills(paths.skills),
          scanPluginAgents(paths.agents),
        ])

        return {
          name: plugin.name,
          version: plugin.version,
          description: plugin.description,
          path: plugin.path,
          source: plugin.source,
          marketplace: plugin.marketplace,
          category: plugin.category,
          homepage: plugin.homepage,
          tags: plugin.tags,
          isDisabled: !enabledPlugins.includes(plugin.source),
          components: {
            commands,
            skills,
            agents,
            mcpServers: pluginMcpMap.get(plugin.source) || [],
          },
        }
      })
    )

    return pluginsWithComponents
  }),

  /**
   * Clear plugin cache (forces re-scan on next list)
   */
  clearCache: publicProcedure.mutation(async () => {
    clearPluginCache()
    return { success: true }
  }),
})

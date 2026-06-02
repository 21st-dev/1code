import { router, publicProcedure } from "../index"
import * as fs from "fs/promises"
import * as path from "path"
import { resolveDirentType } from "../../fs/dirent"
import { parseMarkdownFrontmatter } from "../../markdown/frontmatter"
import {
  discoverAllRuntimePlugins,
  discoverPluginSources,
  getPluginComponentPaths,
  clearPluginCache,
  type PluginSourceInfo,
  type PluginRuntime,
  type PluginSourceKind,
  type PluginSourceTrust,
} from "../../plugins"
import {
  getPluginReviewStatus,
  type PluginExecutionStatus,
  type PluginReviewStatus,
  type PluginTargetMode,
  type PluginUpdatePosture,
} from "../../../../shared/plugin-target-modes"
import { getEnabledPlugins } from "./claude-settings"

export interface PluginComponent {
  name: string
  description?: string
}

export interface PluginWithComponents {
  runtime: PluginRuntime
  name: string
  version: string
  description?: string
  path: string
  installRoot: string
  source: string // e.g., "ccsetup:ccsetup"
  marketplace: string
  category?: string
  homepage?: string
  tags?: string[]
  sourceKind: PluginSourceKind
  sourceTrust: PluginSourceTrust
  targetMode: PluginTargetMode
  executionStatus: PluginExecutionStatus
  reviewStatus: PluginReviewStatus
  updatePosture: PluginUpdatePosture
  isDisabled: boolean
  canToggle: boolean
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
      const { isDirectory, isFile } = await resolveDirentType(dir, entry)

      if (isDirectory) {
        // Recursively scan nested directories for namespaced commands
        const nested = await scanPluginCommands(fullPath)
        components.push(...nested)
      } else if (isFile && entry.name.endsWith(".md")) {
        try {
          const content = await fs.readFile(fullPath, "utf-8")
          const { data } = parseMarkdownFrontmatter(content)
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
      if (!isValidEntryName(entry.name)) continue

      const { isDirectory } = await resolveDirentType(dir, entry)
      if (!isDirectory) continue

      const skillMdPath = path.join(dir, entry.name, "SKILL.md")
      try {
        const content = await fs.readFile(skillMdPath, "utf-8")
        const { data } = parseMarkdownFrontmatter(content)
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
      if (!entry.name.endsWith(".md") || !isValidEntryName(entry.name)) continue

      const { isFile } = await resolveDirentType(dir, entry)
      if (!isFile) continue

      const fullPath = path.join(dir, entry.name)
      try {
        const content = await fs.readFile(fullPath, "utf-8")
        const { data } = parseMarkdownFrontmatter(content)
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

/**
 * Scan a plugin .mcp.json file and return server names.
 */
async function scanPluginMcpServers(mcpJsonPath: string): Promise<string[]> {
  try {
    await fs.access(mcpJsonPath)
  } catch {
    return []
  }

  try {
    const content = await fs.readFile(mcpJsonPath, "utf-8")
    const parsed = JSON.parse(content) as Record<string, unknown>
    const serversObj =
      parsed.mcpServers &&
      typeof parsed.mcpServers === "object" &&
      !Array.isArray(parsed.mcpServers)
        ? (parsed.mcpServers as Record<string, unknown>)
        : parsed

    return Object.entries(serversObj)
      .filter(([, config]) => config && typeof config === "object" && !Array.isArray(config))
      .map(([name]) => name)
  } catch {
    return []
  }
}

export const pluginsRouter = router({
  /**
   * List local/cache plugin sources by runtime.
   */
  sources: publicProcedure.query(async (): Promise<PluginSourceInfo[]> => {
    return discoverPluginSources()
  }),

  /**
   * List all installed runtime plugins with their components and disabled status.
   */
  list: publicProcedure.query(async (): Promise<PluginWithComponents[]> => {
    const [installedPlugins, enabledPlugins] = await Promise.all([
      discoverAllRuntimePlugins(),
      getEnabledPlugins(),
    ])

    // Scan components for each plugin in parallel
    const pluginsWithComponents = await Promise.all(
      installedPlugins.map(async (plugin) => {
        const paths = getPluginComponentPaths(plugin)

        const [commands, skills, agents, mcpServers] = await Promise.all([
          scanPluginCommands(paths.commands),
          scanPluginSkills(paths.skills),
          scanPluginAgents(paths.agents),
          scanPluginMcpServers(paths.mcpServers),
        ])

        return {
          runtime: plugin.runtime,
          name: plugin.name,
          version: plugin.version,
          description: plugin.description,
          path: plugin.path,
          installRoot: plugin.installRoot,
          source: plugin.source,
          marketplace: plugin.marketplace,
          category: plugin.category,
          homepage: plugin.homepage,
          tags: plugin.tags,
          sourceKind: plugin.sourceKind,
          sourceTrust: plugin.sourceTrust,
          targetMode: plugin.targetMode,
          executionStatus: plugin.executionStatus,
          reviewStatus: getPluginReviewStatus({
            runtime: plugin.runtime,
            hasMcpServers: mcpServers.length > 0,
          }),
          updatePosture: plugin.updatePosture,
          isDisabled: plugin.runtime === "claude" ? !enabledPlugins.includes(plugin.source) : false,
          canToggle: plugin.runtime === "claude",
          components: {
            commands,
            skills,
            agents,
            mcpServers,
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

import { z } from "zod"
import { router, publicProcedure } from "../index"
import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import {
  parseAgentMd,
  generateAgentMd,
  scanAgentsDirectory,
  VALID_AGENT_MODELS,
  type FileAgent,
} from "./agent-utils"
import { discoverInstalledPlugins, getPluginComponentPaths } from "../../plugins"
import { getEnabledPlugins } from "./claude-settings"
import { removeMossProjectionResource } from "../../moss-source"

// Shared procedure for listing agents
const listAgentsProcedure = publicProcedure
  .input(
    z
      .object({
        cwd: z.string().optional(),
      })
      .optional(),
  )
  .query(async ({ input }) => {
    const userAgentsDir = path.join(os.homedir(), ".claude", "agents")
    const userAgentsPromise = scanAgentsDirectory(userAgentsDir, "user")

    let mossAgentsPromise = Promise.resolve<FileAgent[]>([])
    let projectAgentsPromise = Promise.resolve<FileAgent[]>([])
    if (input?.cwd) {
      const mossSubagentsDir = path.join(input.cwd, ".moss", "subagents")
      const projectAgentsDir = path.join(input.cwd, ".claude", "agents")
      mossAgentsPromise = scanAgentsDirectory(mossSubagentsDir, "moss", input.cwd)
      projectAgentsPromise = scanAgentsDirectory(projectAgentsDir, "project", input.cwd)
    }

    // Discover plugin agents
    const [enabledPluginSources, installedPlugins] = await Promise.all([
      getEnabledPlugins(),
      discoverInstalledPlugins(),
    ])
    const enabledPlugins = installedPlugins.filter(
      (p) => enabledPluginSources.includes(p.source),
    )
    const pluginAgentsPromises = enabledPlugins.map(async (plugin) => {
      const paths = getPluginComponentPaths(plugin)
      try {
        const agents = await scanAgentsDirectory(paths.agents, "plugin")
        return agents.map((agent) => ({ ...agent, pluginName: plugin.source }))
      } catch {
        return []
      }
    })

    // Scan all directories in parallel
    const [mossAgents, userAgents, projectAgents, ...pluginAgentsArrays] =
      await Promise.all([
        mossAgentsPromise,
        userAgentsPromise,
        projectAgentsPromise,
        ...pluginAgentsPromises,
      ])
    const pluginAgents = pluginAgentsArrays.flat()

    return [...mossAgents, ...projectAgents, ...userAgents, ...pluginAgents]
  })

async function resolveMossSubagentSymlinkSource(
  agentPath: string,
  projectPath: string,
): Promise<string | null> {
  try {
    const stat = await fs.lstat(agentPath)
    if (!stat.isSymbolicLink()) return null
    const linkTarget = await fs.readlink(agentPath)
    const resolvedTarget = path.resolve(path.dirname(agentPath), linkTarget)
    const mossSubagentsRoot = path.resolve(projectPath, ".moss", "subagents")
    if (
      resolvedTarget === mossSubagentsRoot ||
      resolvedTarget.startsWith(`${mossSubagentsRoot}${path.sep}`)
    ) {
      return resolvedTarget
    }
  } catch {
    return null
  }
  return null
}

export const agentsRouter = router({
  /**
   * List all agents from filesystem
   * - User agents: ~/.claude/agents/
   * - Project agents: .claude/agents/ (relative to cwd)
   */
  list: listAgentsProcedure,

  /**
   * Alias for list - used by @ mention
   */
  listEnabled: listAgentsProcedure,

  /**
   * Get single agent by name
   */
  get: publicProcedure
    .input(z.object({ name: z.string(), cwd: z.string().optional() }))
    .query(async ({ input }) => {
      const locations = [
        ...(input.cwd
          ? [
              {
                dir: path.join(input.cwd, ".moss", "subagents"),
                source: "moss" as const,
              },
            ]
          : []),
        {
          dir: path.join(os.homedir(), ".claude", "agents"),
          source: "user" as const,
        },
        ...(input.cwd
          ? [
              {
                dir: path.join(input.cwd, ".claude", "agents"),
                source: "project" as const,
              },
            ]
          : []),
      ]

      for (const { dir, source } of locations) {
        const agentPath = path.join(dir, `${input.name}.md`)
        try {
          const content = await fs.readFile(agentPath, "utf-8")
          const parsed = parseAgentMd(content, `${input.name}.md`)
          return {
            ...parsed,
            source,
            path: agentPath,
          }
        } catch {
          continue
        }
      }

      // Search in plugin directories
      const [enabledPluginSources, installedPlugins] = await Promise.all([
        getEnabledPlugins(),
        discoverInstalledPlugins(),
      ])
      const enabledPlugins = installedPlugins.filter(
        (p) => enabledPluginSources.includes(p.source),
      )
      for (const plugin of enabledPlugins) {
        const paths = getPluginComponentPaths(plugin)
        const agentPath = path.join(paths.agents, `${input.name}.md`)
        try {
          const content = await fs.readFile(agentPath, "utf-8")
          const parsed = parseAgentMd(content, `${input.name}.md`)
          return {
            ...parsed,
            source: "plugin" as const,
            pluginName: plugin.source,
            path: agentPath,
          }
        } catch {
          continue
        }
      }
      return null
    }),

  /**
   * Create a new agent
   */
  create: publicProcedure
    .input(
      z.object({
        name: z.string(),
        description: z.string(),
        prompt: z.string(),
        tools: z.array(z.string()).optional(),
        disallowedTools: z.array(z.string()).optional(),
        model: z.enum(VALID_AGENT_MODELS).optional(),
        source: z.enum(["user", "project"]),
        cwd: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      // Validate name (kebab-case, no special chars)
      const safeName = input.name.toLowerCase().replace(/[^a-z0-9-]/g, "-")
      if (!safeName || safeName.includes("..")) {
        throw new Error("Invalid agent name")
      }

      // Determine target directory
      let targetDir: string
      if (input.source === "project") {
        if (!input.cwd) {
          throw new Error("Project path (cwd) required for project agents")
        }
        targetDir = path.join(input.cwd, ".claude", "agents")
      } else {
        targetDir = path.join(os.homedir(), ".claude", "agents")
      }

      // Ensure directory exists
      await fs.mkdir(targetDir, { recursive: true })

      const agentPath = path.join(targetDir, `${safeName}.md`)

      // Check if already exists
      try {
        await fs.access(agentPath)
        throw new Error(`Agent "${safeName}" already exists`)
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
          throw err
        }
      }

      // Generate and write file
      const content = generateAgentMd({
        name: safeName,
        description: input.description,
        prompt: input.prompt,
        tools: input.tools,
        disallowedTools: input.disallowedTools,
        model: input.model,
      })

      await fs.writeFile(agentPath, content, "utf-8")

      return {
        name: safeName,
        path: agentPath,
        source: input.source,
      }
    }),

  /**
   * Update an existing agent
   */
  update: publicProcedure
    .input(
      z.object({
        originalName: z.string(),
        name: z.string(),
        description: z.string(),
        prompt: z.string(),
        tools: z.array(z.string()).optional(),
        disallowedTools: z.array(z.string()).optional(),
        model: z.enum(VALID_AGENT_MODELS).optional(),
        source: z.enum(["user", "project"]),
        cwd: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      // Validate names
      const safeOriginalName = input.originalName.toLowerCase().replace(/[^a-z0-9-]/g, "-")
      const safeName = input.name.toLowerCase().replace(/[^a-z0-9-]/g, "-")
      if (!safeOriginalName || !safeName || safeName.includes("..")) {
        throw new Error("Invalid agent name")
      }

      // Determine target directory
      let targetDir: string
      if (input.source === "project") {
        if (!input.cwd) {
          throw new Error("Project path (cwd) required for project agents")
        }
        targetDir = path.join(input.cwd, ".claude", "agents")
      } else {
        targetDir = path.join(os.homedir(), ".claude", "agents")
      }

      const originalPath = path.join(targetDir, `${safeOriginalName}.md`)
      const newPath = path.join(targetDir, `${safeName}.md`)

      // Check original exists
      try {
        await fs.access(originalPath)
      } catch {
        throw new Error(`Agent "${safeOriginalName}" not found`)
      }

      // If renaming, check new name doesn't exist
      if (safeOriginalName !== safeName) {
        try {
          await fs.access(newPath)
          throw new Error(`Agent "${safeName}" already exists`)
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
            throw err
          }
        }
      }

      // Generate and write file
      const content = generateAgentMd({
        name: safeName,
        description: input.description,
        prompt: input.prompt,
        tools: input.tools,
        disallowedTools: input.disallowedTools,
        model: input.model,
      })

      // Delete old file if renaming
      if (safeOriginalName !== safeName) {
        await fs.unlink(originalPath)
      }

      await fs.writeFile(newPath, content, "utf-8")

      return {
        name: safeName,
        path: newPath,
        source: input.source,
      }
    }),

  /**
   * Delete an agent
   */
  delete: publicProcedure
    .input(
      z.object({
        name: z.string(),
        source: z.enum(["user", "project"]),
        cwd: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const safeName = input.name.toLowerCase().replace(/[^a-z0-9-]/g, "-")
      if (!safeName || safeName.includes("..")) {
        throw new Error("Invalid agent name")
      }

      let targetDir: string
      let projectPath: string | undefined
      if (input.source === "project") {
        if (!input.cwd) {
          throw new Error("Project path (cwd) required for project agents")
        }
        projectPath = input.cwd
        targetDir = path.join(input.cwd, ".claude", "agents")
      } else {
        targetDir = path.join(os.homedir(), ".claude", "agents")
      }

      const agentPath = path.join(targetDir, `${safeName}.md`)

      const mossSourcePath = projectPath
        ? await resolveMossSubagentSymlinkSource(agentPath, projectPath)
        : null

      if (mossSourcePath && projectPath) {
        try {
          await fs.unlink(mossSourcePath)
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
        }
        await removeMossProjectionResource({
          projectPath,
          resourceId: `moss:subagent:${safeName}`,
          sourcePath: path.relative(projectPath, mossSourcePath),
          targetPaths: [
            path.join(".claude", "agents", `${safeName}.md`),
            path.join(".codex", "agents", `${safeName}.md`),
          ],
          removeTargets: true,
        })
        await fs.rm(agentPath, { force: true })
        return { deleted: true }
      }

      await fs.unlink(agentPath)

      return { deleted: true }
    }),
})

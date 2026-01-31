import { z } from "zod"
import { router, publicProcedure } from "../index"
import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import matter from "gray-matter"
import { discoverInstalledPlugins, getPluginComponentPaths } from "../../plugins"
import { getEnabledPlugins } from "./claude-settings"

export interface FileCommand {
  name: string
  description: string
  argumentHint?: string
  source: "user" | "project" | "plugin"
  pluginName?: string
  path: string
}

/**
 * Parse command .md frontmatter to extract description and argument-hint
 */
function parseCommandMd(content: string): {
  description?: string
  argumentHint?: string
  name?: string
} {
  try {
    const { data } = matter(content)
    return {
      description:
        typeof data.description === "string" ? data.description : undefined,
      argumentHint:
        typeof data["argument-hint"] === "string"
          ? data["argument-hint"]
          : undefined,
      name: typeof data.name === "string" ? data.name : undefined,
    }
  } catch (err) {
    console.error("[commands] Failed to parse frontmatter:", err)
    return {}
  }
}

/**
 * Validate entry name for security (prevent path traversal)
 */
function isValidEntryName(name: string): boolean {
  return !name.includes("..") && !name.includes("/") && !name.includes("\\")
}

/**
 * Recursively scan a directory for .md command files
 * Supports namespaces via nested folders: git/commit.md → git:commit
 */
async function scanCommandsDirectory(
  dir: string,
  source: "user" | "project" | "plugin",
  prefix = "",
): Promise<FileCommand[]> {
  const commands: FileCommand[] = []

  try {
    // Check if directory exists
    try {
      await fs.access(dir)
    } catch {
      return commands
    }

    const entries = await fs.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      if (!isValidEntryName(entry.name)) {
        console.warn(`[commands] Skipping invalid entry name: ${entry.name}`)
        continue
      }

      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        // Recursively scan nested directories
        const nestedCommands = await scanCommandsDirectory(
          fullPath,
          source,
          prefix ? `${prefix}:${entry.name}` : entry.name,
        )
        commands.push(...nestedCommands)
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        const baseName = entry.name.replace(/\.md$/, "")
        const fallbackName = prefix ? `${prefix}:${baseName}` : baseName

        try {
          const content = await fs.readFile(fullPath, "utf-8")
          const parsed = parseCommandMd(content)
          const commandName = parsed.name || fallbackName

          commands.push({
            name: commandName,
            description: parsed.description || "",
            argumentHint: parsed.argumentHint,
            source,
            path: fullPath,
          })
        } catch (err) {
          console.warn(`[commands] Failed to read ${fullPath}:`, err)
        }
      }
    }
  } catch (err) {
    console.error(`[commands] Failed to scan directory ${dir}:`, err)
  }

  return commands
}

export const commandsRouter = router({
  /**
   * List all commands from filesystem
   * - User commands: ~/.claude/commands/
   * - Project commands: .claude/commands/ (relative to projectPath)
   */
  list: publicProcedure
    .input(
      z
        .object({
          projectPath: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const userCommandsDir = path.join(os.homedir(), ".claude", "commands")
      const userCommandsPromise = scanCommandsDirectory(userCommandsDir, "user")

      let projectCommandsPromise = Promise.resolve<FileCommand[]>([])
      if (input?.projectPath) {
        const projectCommandsDir = path.join(
          input.projectPath,
          ".claude",
          "commands",
        )
        projectCommandsPromise = scanCommandsDirectory(
          projectCommandsDir,
          "project",
        )
      }

      // Discover plugin commands
      const [enabledPluginSources, installedPlugins] = await Promise.all([
        getEnabledPlugins(),
        discoverInstalledPlugins(),
      ])
      const enabledPlugins = installedPlugins.filter(
        (p) => enabledPluginSources.includes(p.source),
      )
      const pluginCommandsPromises = enabledPlugins.map(async (plugin) => {
        const paths = getPluginComponentPaths(plugin)
        try {
          const commands = await scanCommandsDirectory(paths.commands, "plugin")
          return commands.map((cmd) => ({ ...cmd, pluginName: plugin.source }))
        } catch {
          return []
        }
      })

      // Scan all directories in parallel
      const [userCommands, projectCommands, ...pluginCommandsArrays] =
        await Promise.all([
          userCommandsPromise,
          projectCommandsPromise,
          ...pluginCommandsPromises,
        ])
      const pluginCommands = pluginCommandsArrays.flat()

      // Project commands first (more specific), then user commands, then plugin commands
      return [...projectCommands, ...userCommands, ...pluginCommands]
    }),

  /**
   * Get content of a specific command file (without frontmatter)
   */
  getContent: publicProcedure
    .input(z.object({ path: z.string() }))
    .query(async ({ input }) => {
      // Security: prevent path traversal
      if (input.path.includes("..")) {
        throw new Error("Invalid path")
      }

      try {
        const content = await fs.readFile(input.path, "utf-8")
        const { content: body } = matter(content)
        return { content: body.trim() }
      } catch (err) {
        console.error(`[commands] Failed to read command content:`, err)
        return { content: "" }
      }
    }),
})

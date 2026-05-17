import { z } from "zod"
import { router, publicProcedure } from "../index"
import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import { discoverInstalledPlugins, getPluginComponentPaths } from "../../plugins"
import { resolveDirentType } from "../../fs/dirent"
import { parseMarkdownFrontmatter } from "../../markdown/frontmatter"
import { getEnabledPlugins } from "./claude-settings"

export interface FileCommand {
  name: string
  description: string
  argumentHint?: string
  source: "user" | "project" | "plugin"
  pluginName?: string
  path: string
  content: string
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
    const { data } = parseMarkdownFrontmatter(content)
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
  basePath?: string,
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
      const { isDirectory, isFile } = await resolveDirentType(dir, entry)

      if (isDirectory) {
        // Recursively scan nested directories
        const nestedCommands = await scanCommandsDirectory(
          fullPath,
          source,
          prefix ? `${prefix}:${entry.name}` : entry.name,
          basePath,
        )
        commands.push(...nestedCommands)
      } else if (isFile && entry.name.endsWith(".md")) {
        const baseName = entry.name.replace(/\.md$/, "")
        const fallbackName = prefix ? `${prefix}:${baseName}` : baseName

        try {
          const rawContent = await fs.readFile(fullPath, "utf-8")
          const parsed = parseCommandMd(rawContent)
          const { content: body } = parseMarkdownFrontmatter(rawContent)
          const commandName = parsed.name || fallbackName

          // Format display path: ~/... for user, relative for project
          let displayPath: string
          if (source === "project" && basePath) {
            displayPath = path.relative(basePath, fullPath)
          } else {
            const homeDir = os.homedir()
            displayPath = fullPath.startsWith(homeDir)
              ? "~" + fullPath.slice(homeDir.length)
              : fullPath
          }

          commands.push({
            name: commandName,
            description: parsed.description || "",
            argumentHint: parsed.argumentHint,
            source,
            path: displayPath,
            content: body.trim(),
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

/**
 * Generate command .md content from name, description, and body
 */
function generateCommandMd(command: { name: string; description: string; content: string; argumentHint?: string }): string {
  const frontmatter: string[] = []
  if (command.description) {
    frontmatter.push(`description: ${command.description}`)
  }
  if (command.argumentHint) {
    frontmatter.push(`argument-hint: ${command.argumentHint}`)
  }
  if (frontmatter.length === 0) {
    return command.content
  }
  return `---\n${frontmatter.join("\n")}\n---\n\n${command.content}`
}

/**
 * Resolve the absolute filesystem path of a command given its display path
 */
function resolveCommandPath(displayPath: string, projectPath?: string): string {
  if (displayPath.startsWith("~")) {
    return path.join(os.homedir(), displayPath.slice(1))
  }
  if (projectPath && !displayPath.startsWith("/")) {
    return path.join(projectPath, displayPath)
  }
  return displayPath
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
          "",
          input.projectPath,
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
    .input(z.object({ path: z.string(), projectPath: z.string().optional() }))
    .query(async ({ input }) => {
      // Security: prevent path traversal
      if (input.path.includes("..")) {
        throw new Error("Invalid path")
      }

      try {
        const absolutePath = resolveCommandPath(input.path, input.projectPath)
        const content = await fs.readFile(absolutePath, "utf-8")
        const { content: body } = parseMarkdownFrontmatter(content)
        return { content: body.trim() }
      } catch (err) {
        console.error(`[commands] Failed to read command content:`, err)
        return { content: "" }
      }
    }),

  create: publicProcedure
    .input(
      z.object({
        name: z.string(),
        description: z.string(),
        content: z.string(),
        argumentHint: z.string().optional(),
        source: z.enum(["user", "project"]),
        projectPath: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const safeName = input.name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
      if (!safeName) {
        throw new Error("Command name must contain at least one alphanumeric character")
      }

      let targetDir: string
      if (input.source === "project") {
        if (!input.projectPath) {
          throw new Error("Project path required for project commands")
        }
        targetDir = path.join(input.projectPath, ".claude", "commands")
      } else {
        targetDir = path.join(os.homedir(), ".claude", "commands")
      }

      const commandPath = path.join(targetDir, `${safeName}.md`)

      // Check if already exists
      try {
        await fs.access(commandPath)
        throw new Error(`Command "${safeName}" already exists`)
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
          throw err
        }
      }

      // Create directory and write command file
      await fs.mkdir(targetDir, { recursive: true })
      const fileContent = generateCommandMd({
        name: safeName,
        description: input.description,
        content: input.content,
        argumentHint: input.argumentHint,
      })
      await fs.writeFile(commandPath, fileContent, "utf-8")

      return {
        name: safeName,
        path: commandPath,
        source: input.source,
      }
    }),

  update: publicProcedure
    .input(
      z.object({
        path: z.string(),
        name: z.string(),
        description: z.string(),
        content: z.string(),
        argumentHint: z.string().optional(),
        projectPath: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      // Security: prevent path traversal
      if (input.path.includes("..")) {
        throw new Error("Invalid path")
      }

      const absolutePath = resolveCommandPath(input.path, input.projectPath)

      // Verify file exists before writing
      await fs.access(absolutePath)

      const fileContent = generateCommandMd({
        name: input.name,
        description: input.description,
        content: input.content,
        argumentHint: input.argumentHint,
      })
      await fs.writeFile(absolutePath, fileContent, "utf-8")

      return { success: true }
    }),

  delete: publicProcedure
    .input(
      z.object({
        path: z.string(),
        projectPath: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      if (input.path.includes("..")) {
        throw new Error("Invalid path")
      }

      const absolutePath = resolveCommandPath(input.path, input.projectPath)
      await fs.access(absolutePath)
      await fs.unlink(absolutePath)

      return { success: true }
    }),
})

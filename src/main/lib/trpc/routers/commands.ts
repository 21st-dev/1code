import { z } from "zod"
import { router, publicProcedure } from "../index"
import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import matter from "gray-matter"

interface FileCommand {
  name: string
  description: string
  argumentHint?: string
  source: "user" | "project"
  path: string
}

function parseCommandMd(content: string): { description?: string; argumentHint?: string } {
  try {
    const { data } = matter(content)
    return {
      description: typeof data.description === "string" ? data.description : undefined,
      argumentHint: typeof data["argument-hint"] === "string" ? data["argument-hint"] : undefined,
    }
  } catch (err) {
    console.error("[commands] Failed to parse frontmatter:", err)
    return {}
  }
}

function isValidEntryName(name: string): boolean {
  return !name.includes("..") && !name.includes("/") && !name.includes("\\")
}

async function scanCommandsDirectory(
  dir: string,
  source: "user" | "project",
  prefix = "",
): Promise<FileCommand[]> {
  const commands: FileCommand[] = []

  try {
    await fs.access(dir)
  } catch {
    return commands
  }

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      if (!isValidEntryName(entry.name)) {
        console.warn(`[commands] Skipping invalid entry name: ${entry.name}`)
        continue
      }

      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        const nestedCommands = await scanCommandsDirectory(
          fullPath,
          source,
          prefix ? `${prefix}:${entry.name}` : entry.name,
        )
        commands.push(...nestedCommands)
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        const baseName = entry.name.replace(/\.md$/, "")
        const commandName = prefix ? `${prefix}:${baseName}` : baseName

        try {
          const content = await fs.readFile(fullPath, "utf-8")
          const parsed = parseCommandMd(content)

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

const listCommandsProcedure = publicProcedure
  .input(
    z
      .object({
        cwd: z.string().optional(),
      })
      .optional(),
  )
  .query(async ({ input }) => {
    const userCommandsDir = path.join(os.homedir(), ".claude", "commands")
    const userCommandsPromise = scanCommandsDirectory(userCommandsDir, "user")

    let projectCommandsPromise = Promise.resolve<FileCommand[]>([])
    if (input?.cwd) {
      const projectCommandsDir = path.join(input.cwd, ".claude", "commands")
      projectCommandsPromise = scanCommandsDirectory(projectCommandsDir, "project")
    }

    const [userCommands, projectCommands] = await Promise.all([
      userCommandsPromise,
      projectCommandsPromise,
    ])

    return [...projectCommands, ...userCommands]
  })

export const commandsRouter = router({
  /**
   * List all commands from filesystem
   * - User commands: ~/.claude/commands/
   * - Project commands: .claude/commands/ (relative to cwd)
   */
  list: listCommandsProcedure,

  /**
   * Get content of a specific command file
   */
  getContent: publicProcedure
    .input(z.object({ path: z.string() }))
    .query(async ({ input }) => {
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

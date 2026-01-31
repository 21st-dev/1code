import { z } from "zod"
import { router, publicProcedure } from "../index"
import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import matter from "gray-matter"
import { discoverInstalledPlugins, getPluginComponentPaths } from "../../plugins"
import { getEnabledPlugins } from "./claude-settings"

export interface FileSkill {
  name: string
  description: string
  source: "user" | "project" | "plugin"
  pluginName?: string
  path: string
  content: string
}

/**
 * Parse SKILL.md frontmatter to extract name and description
 */
function parseSkillMd(rawContent: string): { name?: string; description?: string; content: string } {
  try {
    const { data, content } = matter(rawContent)
    return {
      name: typeof data.name === "string" ? data.name : undefined,
      description: typeof data.description === "string" ? data.description : undefined,
      content: content.trim(),
    }
  } catch (err) {
    console.error("[skills] Failed to parse frontmatter:", err)
    return { content: rawContent.trim() }
  }
}

/**
 * Scan a directory for SKILL.md files
 */
async function scanSkillsDirectory(
  dir: string,
  source: "user" | "project" | "plugin",
  basePath?: string, // For project skills, the cwd to make paths relative to
): Promise<FileSkill[]> {
  const skills: FileSkill[] = []

  try {
    // Check if directory exists
    try {
      await fs.access(dir)
    } catch {
      return skills
    }

    const entries = await fs.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      // Check if entry is a directory or a symlink pointing to a directory
      let isDir = entry.isDirectory()
      if (!isDir && entry.isSymbolicLink()) {
        try {
          const targetPath = path.join(dir, entry.name)
          const stat = await fs.stat(targetPath) // stat() follows symlinks
          isDir = stat.isDirectory()
        } catch {
          // Symlink target doesn't exist or is inaccessible - skip it
          continue
        }
      }
      if (!isDir) continue

      // Validate entry name for security (prevent path traversal)
      if (entry.name.includes("..") || entry.name.includes("/") || entry.name.includes("\\")) {
        console.warn(`[skills] Skipping invalid directory name: ${entry.name}`)
        continue
      }

      const skillMdPath = path.join(dir, entry.name, "SKILL.md")

      try {
        await fs.access(skillMdPath)
        const content = await fs.readFile(skillMdPath, "utf-8")
        const parsed = parseSkillMd(content)

        // For project skills, show relative path; for user skills, show ~/.claude/... path
        let displayPath: string
        if (source === "project" && basePath) {
          displayPath = path.relative(basePath, skillMdPath)
        } else {
          // For user skills, show ~/.claude/skills/... format
          const homeDir = os.homedir()
          displayPath = skillMdPath.startsWith(homeDir)
            ? "~" + skillMdPath.slice(homeDir.length)
            : skillMdPath
        }

        skills.push({
          name: parsed.name || entry.name,
          description: parsed.description || "",
          source,
          path: displayPath,
          content: parsed.content,
        })
      } catch (err) {
        // Skill directory doesn't have SKILL.md or read failed - skip it
      }
    }
  } catch (err) {
    console.error(`[skills] Failed to scan directory ${dir}:`, err)
  }

  return skills
}

// Shared procedure for listing skills
const listSkillsProcedure = publicProcedure
  .input(
    z
      .object({
        cwd: z.string().optional(),
      })
      .optional(),
  )
  .query(async ({ input }) => {
    const userSkillsDir = path.join(os.homedir(), ".claude", "skills")
    const userSkillsPromise = scanSkillsDirectory(userSkillsDir, "user")

    let projectSkillsPromise = Promise.resolve<FileSkill[]>([])
    if (input?.cwd) {
      const projectSkillsDir = path.join(input.cwd, ".claude", "skills")
      projectSkillsPromise = scanSkillsDirectory(projectSkillsDir, "project", input.cwd)
    }

    // Discover plugin skills
    const [enabledPluginSources, installedPlugins] = await Promise.all([
      getEnabledPlugins(),
      discoverInstalledPlugins(),
    ])
    const enabledPlugins = installedPlugins.filter(
      (p) => enabledPluginSources.includes(p.source),
    )
    const pluginSkillsPromises = enabledPlugins.map(async (plugin) => {
      const paths = getPluginComponentPaths(plugin)
      try {
        const skills = await scanSkillsDirectory(paths.skills, "plugin")
        return skills.map((skill) => ({ ...skill, pluginName: plugin.source }))
      } catch {
        return []
      }
    })

    // Scan all directories in parallel
    const [userSkills, projectSkills, ...pluginSkillsArrays] =
      await Promise.all([
        userSkillsPromise,
        projectSkillsPromise,
        ...pluginSkillsPromises,
      ])
    const pluginSkills = pluginSkillsArrays.flat()

    return [...projectSkills, ...userSkills, ...pluginSkills]
  })

/**
 * Generate SKILL.md content from name, description, and body
 */
function generateSkillMd(skill: { name: string; description: string; content: string }): string {
  const frontmatter: string[] = []
  frontmatter.push(`name: ${skill.name}`)
  if (skill.description) {
    frontmatter.push(`description: ${skill.description}`)
  }
  return `---\n${frontmatter.join("\n")}\n---\n\n${skill.content}`
}

/**
 * Resolve the absolute filesystem path of a skill given its display path
 */
function resolveSkillPath(displayPath: string): string {
  if (displayPath.startsWith("~")) {
    return path.join(os.homedir(), displayPath.slice(1))
  }
  return displayPath
}

export const skillsRouter = router({
  /**
   * List all skills from filesystem
   * - User skills: ~/.claude/skills/
   * - Project skills: .claude/skills/ (relative to cwd)
   */
  list: listSkillsProcedure,

  /**
   * Alias for list - used by @ mention
   */
  listEnabled: listSkillsProcedure,

  /**
   * Create a new skill
   */
  create: publicProcedure
    .input(
      z.object({
        name: z.string(),
        description: z.string(),
        content: z.string(),
        source: z.enum(["user", "project"]),
        cwd: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const safeName = input.name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
      if (!safeName) {
        throw new Error("Skill name must contain at least one alphanumeric character")
      }

      let targetDir: string
      if (input.source === "project") {
        if (!input.cwd) {
          throw new Error("Project path (cwd) required for project skills")
        }
        targetDir = path.join(input.cwd, ".claude", "skills")
      } else {
        targetDir = path.join(os.homedir(), ".claude", "skills")
      }

      const skillDir = path.join(targetDir, safeName)
      const skillMdPath = path.join(skillDir, "SKILL.md")

      // Check if already exists
      try {
        await fs.access(skillMdPath)
        throw new Error(`Skill "${safeName}" already exists`)
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
          throw err
        }
      }

      // Create directory and write SKILL.md
      await fs.mkdir(skillDir, { recursive: true })

      const fileContent = generateSkillMd({
        name: safeName,
        description: input.description,
        content: input.content,
      })

      await fs.writeFile(skillMdPath, fileContent, "utf-8")

      return {
        name: safeName,
        path: skillMdPath,
        source: input.source,
      }
    }),

  /**
   * Update a skill's SKILL.md content
   */
  update: publicProcedure
    .input(
      z.object({
        path: z.string(),
        name: z.string(),
        description: z.string(),
        content: z.string(),
        cwd: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const absolutePath = input.cwd && !input.path.startsWith("~") && !input.path.startsWith("/")
        ? path.join(input.cwd, input.path)
        : resolveSkillPath(input.path)

      // Verify file exists before writing
      await fs.access(absolutePath)

      const fileContent = generateSkillMd({
        name: input.name,
        description: input.description,
        content: input.content,
      })

      await fs.writeFile(absolutePath, fileContent, "utf-8")

      return { success: true }
    }),
})

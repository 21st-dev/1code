import { z } from "zod"
import { router, publicProcedure } from "../index"
import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import matter from "gray-matter"
import { discoverInstalledPlugins, getPluginComponentPaths } from "../../plugins"
import { isDirentDirectory } from "../../fs/dirent"
import { getEnabledPlugins } from "./claude-settings"
import {
  installRegistrySkill,
  listRegistryCollections,
  listRegistrySkills,
  rollbackRegistrySkill,
  type RegistrySkillStatus,
  type SkillRuntime,
} from "../../skills/registry"

const skillRuntimeSchema = z.enum(["claude", "codex"]) satisfies z.ZodType<SkillRuntime>

export interface FileSkill {
  name: string
  description: string
  source: "user" | "project" | "plugin" | "registry"
  pluginName?: string
  path: string
  content: string
  directoryName?: string
  registry?: {
    id: string
    status: RegistrySkillStatus
    version: string
    installedVersion?: string
    registryId: string
    hasRollback: boolean
  }
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
      // Check if entry is a directory (follows symlinks)
      const isDir = await isDirentDirectory(dir, entry)
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
          directoryName: entry.name,
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
    const [userSkills, projectSkills, registrySkills, ...pluginSkillsArrays] =
      await Promise.all([
        userSkillsPromise,
        projectSkillsPromise,
        listRegistrySkills().catch((err) => {
          console.warn("[skills] Failed to load registry state:", err)
          return []
        }),
        ...pluginSkillsPromises,
      ])
    const pluginSkills = pluginSkillsArrays.flat()
    const registryById = new Map(
      registrySkills
        .filter((skill) =>
          ["installed", "modified", "update-available"].includes(skill.status),
        )
        .map((skill) => [skill.id, skill]),
    )
    const userSkillsWithRegistry = userSkills.map((skill) => {
      const registry = skill.directoryName
        ? registryById.get(skill.directoryName)
        : undefined

      if (!registry) return skill

      return {
        ...skill,
        source: "registry" as const,
        registry: {
          id: registry.id,
          status: registry.status,
          version: registry.version,
          installedVersion: registry.installedVersion,
          registryId: registry.registryId,
          hasRollback: registry.hasRollback,
        },
      }
    })

    return [...projectSkills, ...userSkillsWithRegistry, ...pluginSkills]
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
   * List bundled/remote registry skills and install/update status.
   */
  registryList: publicProcedure
    .input(
      z.object({
        checkRemote: z.boolean().optional(),
        runtime: skillRuntimeSchema.optional(),
      }).optional(),
    )
    .query(async ({ input }) => {
      return listRegistrySkills({
        checkRemote: input?.checkRemote,
        runtime: input?.runtime,
      })
    }),

  /**
   * List browse-only external skill collections.
   */
  registryCollections: publicProcedure
    .input(
      z.object({
        checkRemote: z.boolean().optional(),
      }).optional(),
    )
    .query(async ({ input }) => {
      return listRegistryCollections({
        checkRemote: input?.checkRemote,
      })
    }),

  /**
   * Install, update, or restore a registry-managed skill.
   */
  registryInstall: publicProcedure
    .input(
      z.object({
        id: z.string(),
        runtime: skillRuntimeSchema.optional(),
        force: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return installRegistrySkill(input)
    }),

  /**
   * Roll back the most recent registry install/update for a skill.
   */
  registryRollback: publicProcedure
    .input(
      z.object({
        id: z.string(),
        runtime: skillRuntimeSchema.optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return rollbackRegistrySkill(input)
    }),

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

  /**
   * Delete a skill directory
   */
  delete: publicProcedure
    .input(
      z.object({
        path: z.string(),
        cwd: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      if (input.path.includes("..")) {
        throw new Error("Invalid path")
      }

      const absolutePath = input.cwd && !input.path.startsWith("~") && !input.path.startsWith("/")
        ? path.join(input.cwd, input.path)
        : resolveSkillPath(input.path)

      // Skills are directories containing SKILL.md — delete the parent directory
      const skillDir = path.dirname(absolutePath)
      await fs.access(skillDir)
      await fs.rm(skillDir, { recursive: true })

      return { success: true }
    }),
})

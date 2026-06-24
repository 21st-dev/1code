import { z } from "zod"
import { router, publicProcedure } from "../index"
import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import { discoverInstalledPlugins, getPluginComponentPaths } from "../../plugins"
import { isDirentDirectory } from "../../fs/dirent"
import { getEnabledPlugins } from "./claude-settings"
import {
  ensureMossSource,
  getMossSourceLayout,
  materializeMossWorkspaceProjections,
  removeMossProjectionResource,
} from "../../moss-source"
import { generateSkillMd, parseSkillMd } from "./skill-md"

type SkillSource = "moss" | "user" | "project" | "plugin"

export interface FileSkill {
  name: string
  description: string
  source: SkillSource
  pluginName?: string
  path: string
  content: string
}

/**
 * Scan a directory for SKILL.md files
 */
async function scanSkillsDirectory(
  dir: string,
  source: SkillSource,
  basePath?: string, // For project skills, the cwd to make paths relative to
  options?: {
    skipResolvedUnder?: string
  },
): Promise<FileSkill[]> {
  const skills: FileSkill[] = []
  const skipResolvedRoot = options?.skipResolvedUnder
    ? path.resolve(options.skipResolvedUnder)
    : undefined

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
        if (skipResolvedRoot) {
          const realSkillDir = await fs.realpath(path.dirname(skillMdPath))
          if (
            realSkillDir === skipResolvedRoot ||
            realSkillDir.startsWith(`${skipResolvedRoot}${path.sep}`)
          ) {
            continue
          }
        }

        const content = await fs.readFile(skillMdPath, "utf-8")
        const parsed = parseSkillMd(content)

        // For project/Moss skills, show relative path; for user skills, show ~/.claude/... path
        let displayPath: string
        if ((source === "project" || source === "moss") && basePath) {
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

    let mossSkillsPromise = Promise.resolve<FileSkill[]>([])
    let projectSkillsPromise = Promise.resolve<FileSkill[]>([])
    if (input?.cwd) {
      const mossSkillsDir = path.join(input.cwd, ".moss", "skills")
      mossSkillsPromise = scanSkillsDirectory(mossSkillsDir, "moss", input.cwd)
      const projectSkillsDir = path.join(input.cwd, ".claude", "skills")
      projectSkillsPromise = scanSkillsDirectory(projectSkillsDir, "project", input.cwd, {
        skipResolvedUnder: mossSkillsDir,
      })
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
    const [userSkills, mossSkills, projectSkills, ...pluginSkillsArrays] =
      await Promise.all([
        userSkillsPromise,
        mossSkillsPromise,
        projectSkillsPromise,
        ...pluginSkillsPromises,
      ])
    const pluginSkills = pluginSkillsArrays.flat()

    return [...mossSkills, ...projectSkills, ...userSkills, ...pluginSkills]
  })

/**
 * Resolve the absolute filesystem path of a skill given its display path
 */
function resolveSkillPath(displayPath: string, cwd?: string): string {
  if (displayPath.startsWith("~")) {
    return path.join(os.homedir(), displayPath.slice(1))
  }
  if (!path.isAbsolute(displayPath)) {
    if (!cwd) throw new Error("Project path (cwd) required for project-relative skills")
    return path.join(cwd, displayPath)
  }
  return displayPath
}

function safeSkillName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
}

function assertSafeSkillName(name: string): string {
  const safeName = safeSkillName(name)
  if (!safeName || safeName.includes("..")) {
    throw new Error("Skill name must contain at least one alphanumeric character")
  }
  return safeName
}

function isUnderPath(filePath: string, rootPath: string): boolean {
  const resolvedFile = path.resolve(filePath)
  const resolvedRoot = path.resolve(rootPath)
  return resolvedFile === resolvedRoot || resolvedFile.startsWith(`${resolvedRoot}${path.sep}`)
}

async function resolveWritableSkill(
  displayPath: string,
  cwd?: string,
): Promise<{
  absolutePath: string
  skillDir: string
  skillName: string
  isMoss: boolean
}> {
  const absolutePath = resolveSkillPath(displayPath, cwd)
  let writablePath = absolutePath
  let isMoss = false

  if (cwd) {
    const mossSkillsRoot = getMossSourceLayout(cwd).skillsRoot
    if (isUnderPath(absolutePath, mossSkillsRoot)) {
      isMoss = true
    } else {
      try {
        const realPath = await fs.realpath(absolutePath)
        if (isUnderPath(realPath, mossSkillsRoot)) {
          writablePath = realPath
          isMoss = true
        }
      } catch {
        // The caller will handle missing files through fs.access below.
      }
    }
  }

  const skillDir = path.dirname(writablePath)
  return {
    absolutePath: writablePath,
    skillDir,
    skillName: path.basename(skillDir),
    isMoss,
  }
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
        source: z.enum(["moss", "user", "project"]),
        cwd: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const safeName = assertSafeSkillName(input.name)

      let targetDir: string
      if (input.source === "moss") {
        if (!input.cwd) {
          throw new Error("Project path (cwd) required for Moss skills")
        }
        await ensureMossSource({ projectPath: input.cwd })
        targetDir = getMossSourceLayout(input.cwd).skillsRoot
      } else if (input.source === "project") {
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

      if (input.source === "moss" && input.cwd) {
        await materializeMossWorkspaceProjections({
          projectPath: input.cwd,
          expectedResourceIds: [`moss:skill:${safeName}`],
        })
      }

      return {
        name: safeName,
        path: input.source === "moss" && input.cwd
          ? path.relative(input.cwd, skillMdPath)
          : skillMdPath,
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
      const skill = await resolveWritableSkill(input.path, input.cwd)

      // Verify file exists before writing
      await fs.access(skill.absolutePath)

      const fileContent = generateSkillMd({
        name: input.name,
        description: input.description,
        content: input.content,
      })

      await fs.writeFile(skill.absolutePath, fileContent, "utf-8")

      if (skill.isMoss && input.cwd) {
        await materializeMossWorkspaceProjections({
          projectPath: input.cwd,
          expectedResourceIds: [`moss:skill:${skill.skillName}`],
        })
      }

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

      const skill = await resolveWritableSkill(input.path, input.cwd)

      // Skills are directories containing SKILL.md - delete the parent directory.
      await fs.access(skill.skillDir)
      await fs.rm(skill.skillDir, { recursive: true, force: true })

      if (skill.isMoss && input.cwd) {
        await removeMossProjectionResource({
          projectPath: input.cwd,
          resourceId: `moss:skill:${skill.skillName}`,
          sourcePath: path.join(".moss", "skills", skill.skillName),
          targetPaths: [
            path.join(".claude", "skills", skill.skillName),
            path.join(".codex", "skills", skill.skillName),
          ],
          removeTargets: true,
        })
        await materializeMossWorkspaceProjections({ projectPath: input.cwd })
      }

      return { success: true }
    }),
})

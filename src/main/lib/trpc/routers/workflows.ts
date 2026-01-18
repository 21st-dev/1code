import { z } from "zod"
import { router, publicProcedure } from "../index"
import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import matter from "gray-matter"
import { getDatabase, claudeCodeSettings } from "../../db"
import { eq } from "drizzle-orm"

// ============ TYPES ============

interface AgentMetadata {
  id: string
  name: string
  description: string
  tools: string[]
  model: string
  sourcePath: string
}

interface CommandMetadata {
  id: string
  name: string
  description: string
  sourcePath: string
}

interface SkillMetadata {
  id: string
  name: string
  description: string
  sourcePath: string
}

// ============ HELPER FUNCTIONS ============

/**
 * Get the Claude config directory, preferring customConfigDir from settings
 */
async function getClaudeConfigDir(): Promise<string> {
  const db = getDatabase()
  const settings = db
    .select()
    .from(claudeCodeSettings)
    .where(eq(claudeCodeSettings.id, "default"))
    .get()

  return settings?.customConfigDir || path.join(os.homedir(), ".claude")
}

/**
 * Validate a path is within the allowed base directory (prevent path traversal)
 */
function validatePath(baseDir: string, targetPath: string): boolean {
  const resolvedBase = path.resolve(baseDir)
  const resolvedTarget = path.resolve(targetPath)
  return resolvedTarget.startsWith(resolvedBase)
}

/**
 * Parse agent .md file frontmatter
 */
function parseAgentMd(content: string, filename: string): AgentMetadata {
  try {
    const { data } = matter(content)
    return {
      id: filename.replace(/\.md$/, ""),
      name: typeof data.name === "string" ? data.name : filename.replace(/\.md$/, ""),
      description: typeof data.description === "string" ? data.description : "",
      tools: Array.isArray(data.tools) ? (data.tools as string[]) : [],
      model: typeof data.model === "string" ? data.model : "",
      sourcePath: "", // Will be set by caller
    }
  } catch (err) {
    console.error("[workflows] Failed to parse agent frontmatter:", err)
    return {
      id: filename.replace(/\.md$/, ""),
      name: filename.replace(/\.md$/, ""),
      description: "",
      tools: [],
      model: "",
      sourcePath: "",
    }
  }
}

/**
 * Parse command .md file frontmatter
 */
function parseCommandMd(content: string, filename: string): CommandMetadata {
  try {
    const { data } = matter(content)
    return {
      id: filename.replace(/\.md$/, ""),
      name: filename.replace(/\.md$/, ""),
      description: typeof data.description === "string" ? data.description : "",
      sourcePath: "", // Will be set by caller
    }
  } catch (err) {
    console.error("[workflows] Failed to parse command frontmatter:", err)
    return {
      id: filename.replace(/\.md$/, ""),
      name: filename.replace(/\.md$/, ""),
      description: "",
      sourcePath: "",
    }
  }
}

/**
 * Parse SKILL.md frontmatter
 */
function parseSkillMd(content: string, dirName: string): SkillMetadata {
  try {
    const { data } = matter(content)
    return {
      id: dirName,
      name: typeof data.name === "string" ? data.name : dirName,
      description: typeof data.description === "string" ? data.description : "",
      sourcePath: "", // Will be set by caller
    }
  } catch (err) {
    console.error("[workflows] Failed to parse skill frontmatter:", err)
    return {
      id: dirName,
      name: dirName,
      description: "",
      sourcePath: "",
    }
  }
}

/**
 * Scan agents directory for .md files
 */
async function scanAgentsDir(baseDir: string): Promise<AgentMetadata[]> {
  const agentsDir = path.join(baseDir, "agents")
  const agents: AgentMetadata[] = []

  try {
    await fs.access(agentsDir)
  } catch {
    // Directory doesn't exist, return empty
    return agents
  }

  const entries = await fs.readdir(agentsDir, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue

    // Security: validate filename doesn't contain path traversal
    if (entry.name.includes("..") || entry.name.includes("/") || entry.name.includes("\\")) {
      console.warn(`[workflows] Skipping invalid agent filename: ${entry.name}`)
      continue
    }

    const filePath = path.join(agentsDir, entry.name)
    const content = await fs.readFile(filePath, "utf-8")
    const parsed = parseAgentMd(content, entry.name)
    parsed.sourcePath = filePath
    agents.push(parsed)
  }

  return agents
}

/**
 * Scan commands directory for .md files
 */
async function scanCommandsDir(baseDir: string): Promise<CommandMetadata[]> {
  const commandsDir = path.join(baseDir, "commands")
  const commands: CommandMetadata[] = []

  try {
    await fs.access(commandsDir)
  } catch {
    // Directory doesn't exist, return empty
    return commands
  }

  const entries = await fs.readdir(commandsDir, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue

    // Security: validate filename doesn't contain path traversal
    if (entry.name.includes("..") || entry.name.includes("/") || entry.name.includes("\\")) {
      console.warn(`[workflows] Skipping invalid command filename: ${entry.name}`)
      continue
    }

    const filePath = path.join(commandsDir, entry.name)
    const content = await fs.readFile(filePath, "utf-8")
    const parsed = parseCommandMd(content, entry.name)
    parsed.sourcePath = filePath
    commands.push(parsed)
  }

  return commands
}

/**
 * Scan skills directory for SKILL.md files
 */
async function scanSkillsDir(baseDir: string): Promise<SkillMetadata[]> {
  const skillsDir = path.join(baseDir, "skills")
  const skills: SkillMetadata[] = []

  try {
    await fs.access(skillsDir)
  } catch {
    // Directory doesn't exist, return empty
    return skills
  }

  const entries = await fs.readdir(skillsDir, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    // Security: validate directory name doesn't contain path traversal
    if (entry.name.includes("..") || entry.name.includes("/") || entry.name.includes("\\")) {
      console.warn(`[workflows] Skipping invalid skill directory name: ${entry.name}`)
      continue
    }

    const skillMdPath = path.join(skillsDir, entry.name, "SKILL.md")

    try {
      await fs.access(skillMdPath)
      const content = await fs.readFile(skillMdPath, "utf-8")
      const parsed = parseSkillMd(content, entry.name)
      parsed.sourcePath = skillMdPath
      skills.push(parsed)
    } catch {
      // SKILL.md doesn't exist, skip
    }
  }

  return skills
}

// ============ ROUTER ============

export const workflowsRouter = router({
  /**
   * List all agents from the Claude config directory
   * Scans ~/.claude/agents/ (or customConfigDir/agents/) for .md files
   */
  listAgents: publicProcedure.query(async () => {
    const baseDir = await getClaudeConfigDir()
    return await scanAgentsDir(baseDir)
  }),

  /**
   * List all commands from the Claude config directory
   * Scans ~/.claude/commands/ (or customConfigDir/commands/) for .md files
   */
  listCommands: publicProcedure.query(async () => {
    const baseDir = await getClaudeConfigDir()
    return await scanCommandsDir(baseDir)
  }),

  /**
   * List all skills from the Claude config directory
   * Scans ~/.claude/skills/*/SKILL.md (or customConfigDir/skills/)
   */
  listSkills: publicProcedure.query(async () => {
    const baseDir = await getClaudeConfigDir()
    return await scanSkillsDir(baseDir)
  }),
})

import * as fs from "fs/promises"
import * as path from "path"
import { buildPluginManifestReviewDocument } from "../../../shared/plugin-update-review"
import type { PluginInfo } from "."
import { resolveDirentType } from "../fs/dirent"
import { parseMarkdownFrontmatter } from "../markdown/frontmatter"

export interface PluginComponent {
  name: string
  description?: string
}

export interface PluginDeclaredComponents {
  commands: PluginComponent[]
  skills: PluginComponent[]
  agents: PluginComponent[]
  mcpServers: string[]
}

export interface ScannedPluginReviewDocument {
  components: PluginDeclaredComponents
  reviewDocument: ReturnType<typeof buildPluginManifestReviewDocument>
}

function getPluginComponentPaths(plugin: PluginInfo) {
  return {
    commands: plugin.componentPaths?.commands ?? path.join(plugin.path, "commands"),
    skills: plugin.componentPaths?.skills ?? path.join(plugin.path, "skills"),
    agents: plugin.componentPaths?.agents ?? path.join(plugin.path, "agents"),
    mcpServers: plugin.componentPaths?.mcpServers ?? path.join(plugin.path, ".mcp.json"),
  }
}

function isValidEntryName(name: string): boolean {
  return !name.includes("..") && !name.includes("/") && !name.includes("\\")
}

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
        components.push(...await scanPluginCommands(fullPath))
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
          // Skip files that cannot be read as command metadata.
        }
      }
    }
  } catch {
    // Directory read failed.
  }

  return components
}

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
        // Skill directory does not expose SKILL.md metadata.
      }
    }
  } catch {
    // Directory read failed.
  }

  return components
}

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
        // Skip unreadable agent metadata.
      }
    }
  } catch {
    // Directory read failed.
  }

  return components
}

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

export async function scanPluginReviewDocument(
  plugin: PluginInfo,
): Promise<ScannedPluginReviewDocument> {
  const paths = getPluginComponentPaths(plugin)
  const [commands, skills, agents, mcpServers] = await Promise.all([
    scanPluginCommands(paths.commands),
    scanPluginSkills(paths.skills),
    scanPluginAgents(paths.agents),
    scanPluginMcpServers(paths.mcpServers),
  ])

  const components = {
    commands,
    skills,
    agents,
    mcpServers,
  }

  return {
    components,
    reviewDocument: buildPluginManifestReviewDocument({
      runtime: plugin.runtime,
      source: plugin.source,
      marketplace: plugin.marketplace,
      name: plugin.name,
      version: plugin.version,
      targetMode: plugin.targetMode,
      executionStatus: plugin.executionStatus,
      updatePosture: plugin.updatePosture,
      category: plugin.category,
      homepage: plugin.homepage,
      tags: plugin.tags,
      componentPaths: plugin.componentPaths ?? {},
      components: {
        commands: commands.length,
        skills: skills.length,
        agents: agents.length,
        mcpServers,
      },
      sourcePins: plugin.sourcePins,
    }),
  }
}

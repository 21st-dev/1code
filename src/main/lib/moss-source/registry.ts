import * as fs from "fs/promises"
import * as path from "path"
import matter from "gray-matter"
import type { SharedResource } from "../shared-resources/types"
import { getMossSourceLayout, toMossProjectPath } from "./layout"

function resourceId(parts: Array<string | undefined | null>): string {
  return parts.filter(Boolean).join(":")
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

function isSafeEntryName(name: string): boolean {
  return !name.includes("..") && !name.includes("/") && !name.includes("\\")
}

async function readFrontmatter(filePath: string): Promise<{
  name?: string
  description?: string
  data: Record<string, unknown>
}> {
  const raw = await fs.readFile(filePath, "utf-8")
  const parsed = matter(raw)
  return {
    name: typeof parsed.data.name === "string" ? parsed.data.name : undefined,
    description:
      typeof parsed.data.description === "string"
        ? parsed.data.description
        : undefined,
    data: parsed.data as Record<string, unknown>,
  }
}

function withMossMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...metadata,
    sourceSystem: "moss-unified-source",
  }
}

async function addFileResource(
  resources: SharedResource[],
  params: {
    projectPath: string
    filePath: string
    kind: SharedResource["kind"]
    name: string
    description: string
    metadata: Record<string, unknown>
  },
) {
  if (!(await pathExists(params.filePath))) return

  resources.push({
    id: resourceId(["moss", params.kind, params.name]),
    kind: params.kind,
    name: params.name,
    scope: "moss",
    path: toMossProjectPath(params.projectPath, params.filePath),
    description: params.description,
    enabled: true,
    metadata: withMossMetadata(params.metadata),
  })
}

async function scanMossSkills(
  projectPath: string,
  skillsRoot: string,
): Promise<SharedResource[]> {
  if (!(await pathExists(skillsRoot))) return []
  const entries = await fs.readdir(skillsRoot, { withFileTypes: true })
  const resources: SharedResource[] = []

  for (const entry of entries) {
    if (!entry.isDirectory() || !isSafeEntryName(entry.name)) continue
    const skillPath = path.join(skillsRoot, entry.name, "SKILL.md")
    if (!(await pathExists(skillPath))) continue

    try {
      const parsed = await readFrontmatter(skillPath)
      const name = parsed.name || entry.name
      resources.push({
        id: resourceId(["moss", "skill", name]),
        kind: "skill",
        name,
        scope: "moss",
        path: toMossProjectPath(projectPath, skillPath),
        description: parsed.description,
        enabled: true,
        metadata: withMossMetadata({
          mossRole: "skill",
          entryName: entry.name,
          projectionUnit: "directory",
        }),
      })
    } catch {
      continue
    }
  }

  return resources
}

async function scanMossMemoryEntries(
  projectPath: string,
  memoryRoot: string,
): Promise<SharedResource[]> {
  if (!(await pathExists(memoryRoot))) return []
  const entries = await fs.readdir(memoryRoot, { withFileTypes: true })
  const resources: SharedResource[] = []

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md") || !isSafeEntryName(entry.name)) {
      continue
    }

    const filePath = path.join(memoryRoot, entry.name)
    try {
      const parsed = await readFrontmatter(filePath)
      const fallbackName = entry.name.replace(/\.md$/, "")
      const name = parsed.name || fallbackName
      resources.push({
        id: resourceId(["moss", "memory", name]),
        kind: "memory",
        name,
        scope: "moss",
        path: toMossProjectPath(projectPath, filePath),
        description: parsed.description,
        enabled: true,
        metadata: withMossMetadata({
          mossRole: "memory-entry",
          entryName: entry.name,
          projectionUnit: "file",
        }),
      })
    } catch {
      continue
    }
  }

  return resources
}

async function scanMossMarkdownEntries(
  projectPath: string,
  root: string,
  kind: "subagent" | "hook" | "plugin",
  role: string,
): Promise<SharedResource[]> {
  if (!(await pathExists(root))) return []
  const entries = await fs.readdir(root, { withFileTypes: true })
  const resources: SharedResource[] = []

  for (const entry of entries) {
    if (!isSafeEntryName(entry.name)) continue
    const entryPath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      resources.push({
        id: resourceId(["moss", kind, entry.name]),
        kind,
        name: entry.name,
        scope: "moss",
        path: toMossProjectPath(projectPath, entryPath),
        enabled: true,
        metadata: withMossMetadata({
          mossRole: role,
          entryName: entry.name,
          projectionUnit: "directory",
        }),
      })
      continue
    }

    if (!entry.isFile() || !entry.name.endsWith(".md")) continue
    try {
      const parsed = await readFrontmatter(entryPath)
      const fallbackName = entry.name.replace(/\.md$/, "")
      const name = parsed.name || fallbackName
      const hookMetadata =
        kind === "hook"
          ? {
              event:
                typeof parsed.data.event === "string"
                  ? parsed.data.event
                  : undefined,
              command:
                typeof parsed.data.command === "string"
                  ? parsed.data.command
                  : undefined,
              hookEnabled: parsed.data.enabled !== false,
            }
          : {}
      const subagentMetadata =
        kind === "subagent"
          ? {
              command:
                typeof parsed.data.command === "string"
                  ? parsed.data.command
                  : undefined,
              subagentEnabled: parsed.data.enabled !== false,
            }
          : {}
      resources.push({
        id: resourceId(["moss", kind, name]),
        kind,
        name,
        scope: "moss",
        path: toMossProjectPath(projectPath, entryPath),
        description: parsed.description,
        enabled:
          kind === "hook" || kind === "subagent"
            ? parsed.data.enabled !== false
            : true,
        metadata: withMossMetadata({
          mossRole: role,
          entryName: entry.name,
          projectionUnit: "file",
          ...hookMetadata,
          ...subagentMetadata,
        }),
      })
    } catch {
      continue
    }
  }

  return resources
}

async function readMossMcpResources(
  projectPath: string,
  mcpConfigPath: string,
): Promise<SharedResource[]> {
  if (!(await pathExists(mcpConfigPath))) return []

  try {
    const raw = await fs.readFile(mcpConfigPath, "utf-8")
    const parsed = JSON.parse(raw) as {
      mcpServers?: Record<string, unknown>
      servers?: Record<string, unknown>
    }
    const servers = parsed.mcpServers ?? parsed.servers ?? {}
    const entries = Object.entries(servers)

    if (entries.length === 0) {
      return [{
        id: "moss:mcp:config",
        kind: "mcp",
        name: "Moss MCP config",
        scope: "moss",
        path: toMossProjectPath(projectPath, mcpConfigPath),
        description: "Moss Unified Source MCP config.",
        enabled: true,
        metadata: withMossMetadata({
          mossRole: "mcp-config",
          serverCount: 0,
        }),
      }]
    }

    return entries.map(([serverName, serverConfig]) => ({
      id: resourceId(["moss", "mcp", serverName]),
      kind: "mcp" as const,
      name: serverName,
      scope: "moss" as const,
      path: toMossProjectPath(projectPath, mcpConfigPath),
      description: "Moss Unified Source MCP server.",
      enabled: true,
      metadata: withMossMetadata({
        mossRole: "mcp-config",
        serverConfig,
      }),
    }))
  } catch (error) {
    return [{
      id: "moss:mcp:config-error",
      kind: "mcp",
      name: "Moss MCP config parse error",
      scope: "moss",
      path: toMossProjectPath(projectPath, mcpConfigPath),
      description: "Moss MCP config exists but could not be parsed.",
      enabled: false,
      metadata: withMossMetadata({
        mossRole: "mcp-config",
        error: error instanceof Error ? error.message : String(error),
      }),
    }]
  }
}

export async function discoverMossSourceResources(
  projectPath: string,
): Promise<SharedResource[]> {
  const layout = getMossSourceLayout(projectPath)
  if (!(await pathExists(layout.root))) return []

  const resources: SharedResource[] = []
  await addFileResource(resources, {
    projectPath,
    filePath: layout.sourceInstruction,
    kind: "instruction",
    name: "moss.md",
    description: "Moss canonical project rules and operating instructions.",
    metadata: {
      mossRole: "source-instruction",
      projectionTarget: "CLAUDE.md and AGENTS.md",
    },
  })
  await addFileResource(resources, {
    projectPath,
    filePath: layout.workspaceConfig,
    kind: "instruction",
    name: "workspace.yaml",
    description: "Moss canonical workspace configuration.",
    metadata: {
      mossRole: "workspace-config",
    },
  })
  await addFileResource(resources, {
    projectPath,
    filePath: layout.memoryRoot,
    kind: "memory",
    name: "Moss memory",
    description: "Moss canonical memory root shared by all engines.",
    metadata: {
      mossRole: "memory-root",
      projectionTarget: "Claude, Codex, and Hermes memory roots",
    },
  })
  await addFileResource(resources, {
    projectPath,
    filePath: layout.providersConfig,
    kind: "provider",
    name: "providers.yaml",
    description: "Moss canonical provider routing and credentials mapping.",
    metadata: {
      mossRole: "provider-config",
      projectionTarget: "engine-native auth/config bridges",
    },
  })

  resources.push(
    ...(await scanMossMemoryEntries(projectPath, layout.memoryRoot)),
    ...(await scanMossSkills(projectPath, layout.skillsRoot)),
    ...(await readMossMcpResources(projectPath, layout.mcpConfig)),
    ...(await scanMossMarkdownEntries(projectPath, layout.pluginsRoot, "plugin", "plugin")),
    ...(await scanMossMarkdownEntries(projectPath, layout.hooksRoot, "hook", "hook")),
    ...(await scanMossMarkdownEntries(projectPath, layout.subagentsRoot, "subagent", "subagent")),
  )

  return resources
}

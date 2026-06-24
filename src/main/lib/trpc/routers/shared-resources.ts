import { z } from "zod"
import * as fs from "fs/promises"
import * as path from "path"
import { buildSharedResourceSnapshot } from "../../shared-resources"
import {
  ensureMossSource,
  getMossSourceLayout,
  materializeMossWorkspaceProjections,
  removeMossProjectionResource,
} from "../../moss-source"
import {
  parseMossFrontmatter,
  stringifyMossFrontmatter,
} from "../../moss-source/frontmatter"
import { generateAgentMd, VALID_AGENT_MODELS } from "./agent-utils"
import { publicProcedure, router } from "../index"

const mossMcpServerInput = z.object({
  projectPath: z.string().min(1),
  name: z
    .string()
    .min(1)
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      "Name must contain only letters, numbers, underscores, and hyphens",
    ),
  transport: z.enum(["stdio", "http"]),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  url: z.string().url().optional(),
})

const mossSubagentInput = z.object({
  projectPath: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  prompt: z.string().min(1),
  tools: z.array(z.string()).optional(),
  disallowedTools: z.array(z.string()).optional(),
  model: z.enum(VALID_AGENT_MODELS).optional(),
})

const mossMemoryEntryInput = z.object({
  projectPath: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  content: z.string().optional(),
})

const mossHookInput = z.object({
  projectPath: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  event: z.string().optional(),
  command: z.string().optional(),
  content: z.string().optional(),
  enabled: z.boolean().optional(),
})

type MossMcpServerConfig = {
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
}

type MossMcpConfig = {
  mcpServers?: Record<string, MossMcpServerConfig>
  servers?: Record<string, MossMcpServerConfig>
}

function safeSubagentName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
}

function safeMemoryEntryName(name: string): string {
  return name
    .replace(/\.md$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

function safeHookName(name: string): string {
  return name
    .replace(/\.md$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

function assertSafeSubagentName(name: string): string {
  const safeName = safeSubagentName(name)
  if (!safeName || safeName.includes("..")) {
    throw new Error("Invalid subagent name")
  }
  return safeName
}

function assertSafeMemoryEntryName(name: string): string {
  const safeName = safeMemoryEntryName(name)
  if (!safeName || safeName.includes("..")) {
    throw new Error("Invalid memory entry name")
  }
  return safeName
}

function assertSafeHookName(name: string): string {
  const safeName = safeHookName(name)
  if (!safeName || safeName.includes("..")) {
    throw new Error("Invalid hook name")
  }
  return safeName
}

function buildMossMemoryEntryMd(input: {
  name: string
  description?: string
  content?: string
}): string {
  const content = input.content?.trimEnd() ?? ""
  return stringifyMossFrontmatter(`${content}${content ? "\n" : ""}`, {
    name: input.name,
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
  })
}

function buildMossHookMd(input: {
  name: string
  description?: string
  event?: string
  command?: string
  content?: string
  enabled?: boolean
}): string {
  const content = input.content?.trimEnd() ?? ""
  return stringifyMossFrontmatter(`${content}${content ? "\n" : ""}`, {
    name: input.name,
    enabled: input.enabled !== false,
    event: input.event?.trim() || "Stop",
    ...(input.command?.trim() ? { command: input.command.trim() } : {}),
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
  })
}

async function readMossMemoryEntryFile(sourcePath: string): Promise<{
  name: string
  description: string
  content: string
}> {
  const raw = await fs.readFile(sourcePath, "utf-8")
  const parsed = parseMossFrontmatter(raw)
  return {
    name:
      typeof parsed.data.name === "string" && parsed.data.name.trim()
        ? parsed.data.name
        : path.basename(sourcePath, ".md"),
    description:
      typeof parsed.data.description === "string"
        ? parsed.data.description
        : "",
    content: parsed.content.trimEnd(),
  }
}

async function readMossHookFile(sourcePath: string): Promise<{
  name: string
  description: string
  event: string
  command: string
  enabled: boolean
  content: string
}> {
  const raw = await fs.readFile(sourcePath, "utf-8")
  const parsed = parseMossFrontmatter(raw)
  return {
    name:
      typeof parsed.data.name === "string" && parsed.data.name.trim()
        ? parsed.data.name
        : path.basename(sourcePath, ".md"),
    description:
      typeof parsed.data.description === "string"
        ? parsed.data.description
        : "",
    event:
      typeof parsed.data.event === "string" && parsed.data.event.trim()
        ? parsed.data.event
        : "Stop",
    command:
      typeof parsed.data.command === "string"
        ? parsed.data.command
        : "",
    enabled: parsed.data.enabled !== false,
    content: parsed.content.trimEnd(),
  }
}

async function mossMemoryEntryPath(projectPath: string, name: string): Promise<{
  safeName: string
  sourcePath: string
}> {
  await ensureMossSource({ projectPath })
  const safeName = assertSafeMemoryEntryName(name)
  return {
    safeName,
    sourcePath: path.join(
      getMossSourceLayout(projectPath).memoryRoot,
      `${safeName}.md`,
    ),
  }
}

async function mossHookPath(projectPath: string, name: string): Promise<{
  safeName: string
  sourcePath: string
}> {
  await ensureMossSource({ projectPath })
  const safeName = assertSafeHookName(name)
  return {
    safeName,
    sourcePath: path.join(
      getMossSourceLayout(projectPath).hooksRoot,
      `${safeName}.md`,
    ),
  }
}

function buildMossMcpServerConfig(input: z.infer<typeof mossMcpServerInput>): MossMcpServerConfig {
  if (input.transport === "stdio") {
    const command = input.command?.trim()
    if (!command) throw new Error("Command is required for stdio servers")
    return {
      command,
      ...(input.args && input.args.length > 0 ? { args: input.args } : {}),
      ...(input.env && Object.keys(input.env).length > 0 ? { env: input.env } : {}),
    }
  }

  const url = input.url?.trim()
  if (!url) throw new Error("URL is required for HTTP servers")
  return { url }
}

async function readMossMcpConfig(projectPath: string): Promise<{
  sourcePath: string
  config: MossMcpConfig
}> {
  await ensureMossSource({ projectPath })
  const sourcePath = getMossSourceLayout(projectPath).mcpConfig

  try {
    const raw = await fs.readFile(sourcePath, "utf-8")
    const parsed = JSON.parse(raw) as MossMcpConfig
    const mcpServers = parsed.mcpServers ?? parsed.servers ?? {}
    return {
      sourcePath,
      config: {
        ...parsed,
        mcpServers,
      },
    }
  } catch (error) {
    throw new Error(
      `Unable to read Moss MCP source: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
}

async function writeMossMcpConfig(
  projectPath: string,
  config: MossMcpConfig,
): Promise<string> {
  const sourcePath = getMossSourceLayout(projectPath).mcpConfig
  const nextConfig: MossMcpConfig = {
    ...config,
    mcpServers: config.mcpServers ?? {},
  }
  delete nextConfig.servers
  await fs.mkdir(path.dirname(sourcePath), { recursive: true })
  await fs.writeFile(sourcePath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf-8")
  return sourcePath
}

async function materializeProject(
  projectPath: string,
  options?: { expectedResourceIds?: readonly string[] },
) {
  return materializeMossWorkspaceProjections({
    projectPath,
    createIfMissing: true,
    expectedResourceIds: options?.expectedResourceIds,
  })
}

async function unlinkProjectedSubagentIfManaged(params: {
  projectPath: string
  sourcePath: string
  targetPath: string
}) {
  try {
    const stat = await fs.lstat(params.targetPath)
    if (!stat.isSymbolicLink()) return
    const linkTarget = await fs.readlink(params.targetPath)
    const resolvedTarget = path.resolve(path.dirname(params.targetPath), linkTarget)
    if (resolvedTarget !== path.resolve(params.sourcePath)) return
    await fs.unlink(params.targetPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
}

async function removeProjectedSubagentResource(params: {
  projectPath: string
  safeName: string
  sourcePath: string
}) {
  await removeMossProjectionResource({
    projectPath: params.projectPath,
    resourceId: `moss:subagent:${params.safeName}`,
    sourcePath: path.relative(params.projectPath, params.sourcePath),
    targetPaths: [
      path.join(".claude", "agents", `${params.safeName}.md`),
      path.join(".codex", "agents", `${params.safeName}.md`),
    ],
    removeTargets: true,
  })
}

async function removeProjectedHookAdapters(params: {
  projectPath: string
  safeName: string
  sourcePath: string
}) {
  await removeMossProjectionResource({
    projectPath: params.projectPath,
    resourceId: `moss:hook:${params.safeName}`,
    sourcePath: path.relative(params.projectPath, params.sourcePath),
    targetPaths: [
      path.join(".claude", "hooks", ".moss-adapter.json"),
      path.join(".codex", "hooks", ".moss-adapter.json"),
    ],
    removeTargets: true,
  })
}

export const sharedResourcesRouter = router({
  snapshot: publicProcedure
    .input(
      z
        .object({
          projectPath: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      return buildSharedResourceSnapshot({
        projectPath: input?.projectPath,
      })
    }),

  readMemoryEntry: publicProcedure
    .input(
      z.object({
        projectPath: z.string().min(1),
        name: z.string().min(1),
      }),
    )
    .query(async ({ input }) => {
      const { safeName, sourcePath } = await mossMemoryEntryPath(
        input.projectPath,
        input.name,
      )
      const entry = await readMossMemoryEntryFile(sourcePath)
      return {
        ...entry,
        safeName,
        sourcePath,
      }
    }),

  createMemoryEntry: publicProcedure
    .input(mossMemoryEntryInput)
    .mutation(async ({ input }) => {
      const { safeName, sourcePath } = await mossMemoryEntryPath(
        input.projectPath,
        input.name,
      )

      try {
        await fs.access(sourcePath)
        throw new Error(`Memory entry "${safeName}" already exists in Moss Unified Source`)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      }

      await fs.mkdir(path.dirname(sourcePath), { recursive: true })
      await fs.writeFile(
        sourcePath,
        buildMossMemoryEntryMd({
          name: safeName,
          description: input.description,
          content: input.content,
        }),
        "utf-8",
      )

      return {
        success: true as const,
        name: safeName,
        sourcePath,
        projections: await materializeProject(input.projectPath, {
          expectedResourceIds: [`moss:memory:${safeName}`],
        }),
      }
    }),

  updateMemoryEntry: publicProcedure
    .input(mossMemoryEntryInput)
    .mutation(async ({ input }) => {
      const { safeName, sourcePath } = await mossMemoryEntryPath(
        input.projectPath,
        input.name,
      )

      await fs.writeFile(
        sourcePath,
        buildMossMemoryEntryMd({
          name: safeName,
          description: input.description,
          content: input.content,
        }),
        "utf-8",
      )

      return {
        success: true as const,
        name: safeName,
        sourcePath,
        projections: await materializeProject(input.projectPath, {
          expectedResourceIds: [`moss:memory:${safeName}`],
        }),
      }
    }),

  removeMemoryEntry: publicProcedure
    .input(
      z.object({
        projectPath: z.string().min(1),
        name: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const { safeName, sourcePath } = await mossMemoryEntryPath(
        input.projectPath,
        input.name,
      )

      let deleted = false
      try {
        await fs.unlink(sourcePath)
        deleted = true
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      }

      return {
        success: true as const,
        deleted,
        name: safeName,
        sourcePath,
        projections: await materializeProject(input.projectPath),
      }
    }),

  readHook: publicProcedure
    .input(
      z.object({
        projectPath: z.string().min(1),
        name: z.string().min(1),
      }),
    )
    .query(async ({ input }) => {
      const { safeName, sourcePath } = await mossHookPath(
        input.projectPath,
        input.name,
      )
      const hook = await readMossHookFile(sourcePath)
      return {
        ...hook,
        safeName,
        sourcePath,
      }
    }),

  createHook: publicProcedure
    .input(mossHookInput)
    .mutation(async ({ input }) => {
      const { safeName, sourcePath } = await mossHookPath(
        input.projectPath,
        input.name,
      )

      try {
        await fs.access(sourcePath)
        throw new Error(`Hook "${safeName}" already exists in Moss Unified Source`)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      }

      await fs.mkdir(path.dirname(sourcePath), { recursive: true })
      await fs.writeFile(
        sourcePath,
        buildMossHookMd({
          name: safeName,
          description: input.description,
          event: input.event,
          command: input.command,
          content: input.content,
          enabled: input.enabled,
        }),
        "utf-8",
      )

      return {
        success: true as const,
        name: safeName,
        sourcePath,
        projections: await materializeProject(input.projectPath, {
          expectedResourceIds: [`moss:hook:${safeName}`],
        }),
      }
    }),

  updateHook: publicProcedure
    .input(mossHookInput)
    .mutation(async ({ input }) => {
      const { safeName, sourcePath } = await mossHookPath(
        input.projectPath,
        input.name,
      )

      await fs.writeFile(
        sourcePath,
        buildMossHookMd({
          name: safeName,
          description: input.description,
          event: input.event,
          command: input.command,
          content: input.content,
          enabled: input.enabled,
        }),
        "utf-8",
      )

      return {
        success: true as const,
        name: safeName,
        sourcePath,
        projections: await materializeProject(input.projectPath, {
          expectedResourceIds: [`moss:hook:${safeName}`],
        }),
      }
    }),

  removeHook: publicProcedure
    .input(
      z.object({
        projectPath: z.string().min(1),
        name: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const { safeName, sourcePath } = await mossHookPath(
        input.projectPath,
        input.name,
      )

      let deleted = false
      try {
        await fs.unlink(sourcePath)
        deleted = true
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      }

      await removeProjectedHookAdapters({
        projectPath: input.projectPath,
        safeName,
        sourcePath,
      })

      return {
        success: true as const,
        deleted,
        name: safeName,
        sourcePath,
        projections: await materializeProject(input.projectPath),
      }
    }),

  createMcpServer: publicProcedure
    .input(mossMcpServerInput)
    .mutation(async ({ input }) => {
      const { sourcePath, config } = await readMossMcpConfig(input.projectPath)
      const serverName = input.name.trim()
      const mcpServers = config.mcpServers ?? {}

      if (mcpServers[serverName]) {
        throw new Error(`MCP server "${serverName}" already exists in Moss Unified Source`)
      }

      mcpServers[serverName] = buildMossMcpServerConfig(input)
      await writeMossMcpConfig(input.projectPath, {
        ...config,
        mcpServers,
      })

      return {
        success: true as const,
        name: serverName,
        sourcePath,
        projections: await materializeProject(input.projectPath, {
          expectedResourceIds: [`moss:mcp:${serverName}`],
        }),
      }
    }),

  updateMcpServer: publicProcedure
    .input(mossMcpServerInput)
    .mutation(async ({ input }) => {
      const { sourcePath, config } = await readMossMcpConfig(input.projectPath)
      const serverName = input.name.trim()
      const mcpServers = config.mcpServers ?? {}

      if (!mcpServers[serverName]) {
        throw new Error(`MCP server "${serverName}" was not found in Moss Unified Source`)
      }

      mcpServers[serverName] = buildMossMcpServerConfig(input)
      await writeMossMcpConfig(input.projectPath, {
        ...config,
        mcpServers,
      })

      return {
        success: true as const,
        name: serverName,
        sourcePath,
        projections: await materializeProject(input.projectPath),
      }
    }),

  removeMcpServer: publicProcedure
    .input(
      z.object({
        projectPath: z.string().min(1),
        name: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const { sourcePath, config } = await readMossMcpConfig(input.projectPath)
      const serverName = input.name.trim()
      const mcpServers = config.mcpServers ?? {}

      if (!mcpServers[serverName]) {
        return {
          success: true as const,
          deleted: false,
          name: serverName,
          sourcePath,
          projections: await materializeProject(input.projectPath),
        }
      }

      delete mcpServers[serverName]
      await writeMossMcpConfig(input.projectPath, {
        ...config,
        mcpServers,
      })

      return {
        success: true as const,
        deleted: true,
        name: serverName,
        sourcePath,
        projections: await materializeProject(input.projectPath),
      }
    }),

  createSubagent: publicProcedure
    .input(mossSubagentInput)
    .mutation(async ({ input }) => {
      await ensureMossSource({ projectPath: input.projectPath })
      const safeName = assertSafeSubagentName(input.name)
      const sourcePath = path.join(
        getMossSourceLayout(input.projectPath).subagentsRoot,
        `${safeName}.md`,
      )

      try {
        await fs.access(sourcePath)
        throw new Error(`Subagent "${safeName}" already exists in Moss Unified Source`)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      }

      await fs.mkdir(path.dirname(sourcePath), { recursive: true })
      await fs.writeFile(
        sourcePath,
        generateAgentMd({
          name: safeName,
          description: input.description,
          prompt: input.prompt,
          tools: input.tools,
          disallowedTools: input.disallowedTools,
          model: input.model,
        }),
        "utf-8",
      )

      return {
        success: true as const,
        name: safeName,
        sourcePath,
        projections: await materializeProject(input.projectPath, {
          expectedResourceIds: [`moss:subagent:${safeName}`],
        }),
      }
    }),

  updateSubagent: publicProcedure
    .input(mossSubagentInput)
    .mutation(async ({ input }) => {
      await ensureMossSource({ projectPath: input.projectPath })
      const safeName = assertSafeSubagentName(input.name)
      const sourcePath = path.join(
        getMossSourceLayout(input.projectPath).subagentsRoot,
        `${safeName}.md`,
      )

      await fs.writeFile(
        sourcePath,
        generateAgentMd({
          name: safeName,
          description: input.description,
          prompt: input.prompt,
          tools: input.tools,
          disallowedTools: input.disallowedTools,
          model: input.model,
        }),
        "utf-8",
      )

      return {
        success: true as const,
        name: safeName,
        sourcePath,
        projections: await materializeProject(input.projectPath),
      }
    }),

  removeSubagent: publicProcedure
    .input(
      z.object({
        projectPath: z.string().min(1),
        name: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      await ensureMossSource({ projectPath: input.projectPath })
      const safeName = assertSafeSubagentName(input.name)
      const sourcePath = path.join(
        getMossSourceLayout(input.projectPath).subagentsRoot,
        `${safeName}.md`,
      )

      let deleted = false
      try {
        await fs.unlink(sourcePath)
        deleted = true
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      }

      await unlinkProjectedSubagentIfManaged({
        projectPath: input.projectPath,
        sourcePath,
        targetPath: path.join(input.projectPath, ".claude", "agents", `${safeName}.md`),
      })
      await removeProjectedSubagentResource({
        projectPath: input.projectPath,
        safeName,
        sourcePath,
      })

      return {
        success: true as const,
        deleted,
        name: safeName,
        sourcePath,
        projections: await materializeProject(input.projectPath),
      }
    }),
})

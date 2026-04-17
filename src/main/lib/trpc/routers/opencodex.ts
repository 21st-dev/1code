import { app } from "electron"
import { z } from "zod"
import {
  readOpenCodexBackendConfig,
  type OpenCodexBackendConfigRecord,
} from "../../opencodex/backend-config"
import {
  getOpenCodexBackendHostState,
  resolveOpenCodexBackendHostPaths,
} from "../../opencodex/backend-host"
import { publicProcedure, router, type Context } from "../index"
import { claudeRouter } from "./claude"
import { codexRouter } from "./codex"
import {
  getOpenCodexBackendProviderFamily,
  getOpenCodexBackendRouteTitle,
  getOpenCodexBackendRuntimeKind,
} from "../../../../shared/opencodex-backend-route"

type OpenCodexBackendRuntimeKind = "codex" | "claude"

function getBackendConfig(): OpenCodexBackendConfigRecord | null {
  return readOpenCodexBackendConfig({
    userDataPath: app.getPath("userData"),
  })
}

function getCapabilities(config: OpenCodexBackendConfigRecord) {
  return getOpenCodexBackendRuntimeKind(config) === "codex"
    ? {
        projectScope: false,
        toggleServer: false,
        logout: config.kind === "codex-subscription",
      }
    : {
        projectScope: true,
        toggleServer: true,
        logout: false,
      }
}

function getCallers(ctx: Context) {
  return {
    claude: claudeRouter.createCaller(ctx),
    codex: codexRouter.createCaller(ctx),
  }
}

function getActiveBackendRoute(ctx: Context) {
  const config = getBackendConfig()
  if (!config) {
    return null
  }

  const runtimeKind = getOpenCodexBackendRuntimeKind(config)

  return {
    config,
    routeKind: runtimeKind as OpenCodexBackendRuntimeKind,
    providerFamily: getOpenCodexBackendProviderFamily(config),
    title: getOpenCodexBackendRouteTitle(config),
    capabilities: getCapabilities(config),
    callers: getCallers(ctx),
  }
}

async function getRuntimeIntegration(ctx: Context) {
  const route = getActiveBackendRoute(ctx)
  if (!route) {
    return null
  }

  if (route.config.kind === "codex-subscription") {
    const integration = await route.callers.codex.getIntegration()
    return {
      state: integration.state,
      isConnected: integration.isConnected,
      rawOutput: integration.rawOutput,
      exitCode: integration.exitCode,
      canDisconnect: route.capabilities.logout,
    }
  }

  if (route.config.kind === "openai-compatible-api") {
    return {
      state: "configured_api_key" as const,
      isConnected: true,
      rawOutput: null,
      exitCode: 0,
      canDisconnect: false,
    }
  }

  return {
    state:
      route.config.kind === "claude-subscription"
        ? ("configured_subscription" as const)
        : ("configured_api_key" as const),
    isConnected: true,
    rawOutput: null,
    exitCode: 0,
    canDisconnect: false,
  }
}

function mergeCodexProjectServers(params: {
  groups: Array<{
    groupName: string
    projectPath: string | null
    mcpServers: Array<Record<string, unknown>>
  }>
  projectPath?: string
}) {
  const { groups, projectPath } = params
  const globalGroup = groups.find((group) => group.projectPath === null)
  const projectGroup = projectPath
    ? groups.find((group) => group.projectPath === projectPath)
    : undefined

  const merged = new Map<string, Record<string, unknown>>()

  for (const server of globalGroup?.mcpServers || []) {
    const name = typeof server.name === "string" ? server.name : null
    if (name) {
      merged.set(name, server)
    }
  }

  for (const server of projectGroup?.mcpServers || []) {
    const name = typeof server.name === "string" ? server.name : null
    if (name) {
      merged.set(name, server)
    }
  }

  return Array.from(merged.values())
}

const imageAttachmentSchema = z.object({
  base64Data: z.string(),
  mediaType: z.string(),
  filename: z.string().optional(),
})

export const openCodexRouter = router({
  getBackendSurface: publicProcedure.query(async ({ ctx }) => {
    const route = getActiveBackendRoute(ctx)
    const integration = await getRuntimeIntegration(ctx)
    const backendHostPaths = resolveOpenCodexBackendHostPaths({
      userDataPath: app.getPath("userData"),
    })
    return {
      backendConfig: route?.config ?? null,
      backendHost: getOpenCodexBackendHostState(),
      backendHostPaths,
      runtime:
        route === null
          ? null
          : {
              routeKind: route.routeKind,
              providerFamily: route.providerFamily,
              title: route.title,
              capabilities: route.capabilities,
            },
      integration,
    }
  }),

  getAllMcpConfig: publicProcedure.query(async ({ ctx }) => {
    const route = getActiveBackendRoute(ctx)
    if (!route) {
      return {
        backendConfig: null,
        backendHost: getOpenCodexBackendHostState(),
        runtime: null,
        groups: [],
        error: "OpenCodex backend is not configured yet.",
      }
    }

    const data =
      route.routeKind === "codex"
        ? await route.callers.codex.getAllMcpConfig()
        : await route.callers.claude.getAllMcpConfig()

    return {
      backendConfig: route.config,
      backendHost: getOpenCodexBackendHostState(),
      runtime: {
        routeKind: route.routeKind,
        providerFamily: route.providerFamily,
        title: route.title,
        capabilities: route.capabilities,
      },
      groups: data.groups,
      error: "error" in data ? data.error ?? null : null,
    }
  }),

  getMcpConfig: publicProcedure
    .input(
      z.object({
        projectPath: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const route = getActiveBackendRoute(ctx)
      if (!route) {
        return {
          backendConfig: null,
          backendHost: getOpenCodexBackendHostState(),
          runtime: null,
          mcpServers: [],
          projectPath: input.projectPath,
          error: "OpenCodex backend is not configured yet.",
        }
      }

      if (route.routeKind === "codex") {
        const data = await route.callers.codex.getAllMcpConfig()
        return {
          backendConfig: route.config,
          backendHost: getOpenCodexBackendHostState(),
          runtime: {
            routeKind: route.routeKind,
            providerFamily: route.providerFamily,
            title: route.title,
            capabilities: route.capabilities,
          },
          mcpServers: mergeCodexProjectServers({
            groups: data.groups as Array<{
              groupName: string
              projectPath: string | null
              mcpServers: Array<Record<string, unknown>>
            }>,
            projectPath: input.projectPath,
          }),
          projectPath: input.projectPath,
          error: "error" in data ? data.error ?? null : null,
        }
      }

      const data = await route.callers.claude.getMcpConfig({
        projectPath: input.projectPath ?? "__global__",
      })

      return {
        backendConfig: route.config,
        backendHost: getOpenCodexBackendHostState(),
        runtime: {
          routeKind: route.routeKind,
          providerFamily: route.providerFamily,
          title: route.title,
          capabilities: route.capabilities,
        },
        ...data,
      }
    }),

  refreshMcpConfig: publicProcedure.mutation(async ({ ctx }) => {
    const route = getActiveBackendRoute(ctx)
    if (!route) {
      return { success: false as const, error: "OpenCodex backend is not configured yet." }
    }

    return route.routeKind === "codex"
      ? await route.callers.codex.refreshMcpConfig()
      : await route.callers.claude.refreshMcpConfig()
  }),

  addMcpServer: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        scope: z.enum(["global", "project"]).default("global"),
        projectPath: z.string().optional(),
        transport: z.enum(["stdio", "http"]),
        command: z.string().optional(),
        args: z.array(z.string()).optional(),
        env: z.record(z.string()).optional(),
        url: z.string().url().optional(),
        authType: z.enum(["none", "oauth", "bearer"]).optional(),
        bearerToken: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const route = getActiveBackendRoute(ctx)
      if (!route) {
        throw new Error("OpenCodex backend is not configured yet.")
      }

      if (route.routeKind === "codex") {
        return await route.callers.codex.addMcpServer({
          name: input.name,
          scope: "global",
          transport: input.transport,
          command: input.command,
          args: input.args,
          url: input.url,
        })
      }

      return await route.callers.claude.addMcpServer(input)
    }),

  removeMcpServer: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        scope: z.enum(["global", "project"]).default("global"),
        projectPath: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const route = getActiveBackendRoute(ctx)
      if (!route) {
        throw new Error("OpenCodex backend is not configured yet.")
      }

      return route.routeKind === "codex"
        ? await route.callers.codex.removeMcpServer({
            name: input.name,
            scope: "global",
          })
        : await route.callers.claude.removeMcpServer(input)
    }),

  startMcpOAuth: publicProcedure
    .input(
      z.object({
        serverName: z.string().min(1),
        projectPath: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const route = getActiveBackendRoute(ctx)
      if (!route) {
        return { success: false as const, error: "OpenCodex backend is not configured yet." }
      }

      return route.routeKind === "codex"
        ? await route.callers.codex.startMcpOAuth(input)
        : await route.callers.claude.startMcpOAuth({
            serverName: input.serverName,
            projectPath: input.projectPath ?? "__global__",
          })
    }),

  logoutMcpServer: publicProcedure
    .input(
      z.object({
        serverName: z.string().min(1),
        projectPath: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const route = getActiveBackendRoute(ctx)
      if (!route) {
        return { success: false as const, error: "OpenCodex backend is not configured yet." }
      }

      if (route.routeKind !== "codex") {
        return {
          success: false as const,
          error: "The active OpenCodex backend route does not support MCP logout.",
        }
      }

      return await route.callers.codex.logoutMcpServer(input)
    }),

  updateMcpServer: publicProcedure
    .input(
      z.object({
        name: z.string(),
        newName: z.string().optional(),
        scope: z.enum(["global", "project"]),
        projectPath: z.string().optional(),
        command: z.string().optional(),
        args: z.array(z.string()).optional(),
        env: z.record(z.string()).optional(),
        url: z.string().optional(),
        disabled: z.boolean().optional(),
        bearerToken: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const route = getActiveBackendRoute(ctx)
      if (!route) {
        throw new Error("OpenCodex backend is not configured yet.")
      }

      if (route.routeKind !== "claude") {
        throw new Error("The active OpenCodex backend route does not support editing MCP servers.")
      }

      return await route.callers.claude.updateMcpServer(input)
    }),

  disconnectRuntime: publicProcedure.mutation(async ({ ctx }) => {
    const route = getActiveBackendRoute(ctx)
    if (!route) {
      return {
        success: false as const,
        error: "OpenCodex backend is not configured yet.",
      }
    }

    if (route.routeKind !== "codex") {
      return {
        success: false as const,
        error:
          "The active OpenCodex backend route does not expose a disconnectable local session.",
      }
    }

    return await route.callers.codex.logout()
  }),

  respondToolApproval: publicProcedure
    .input(
      z.object({
        toolUseId: z.string(),
        approved: z.boolean(),
        message: z.string().optional(),
        updatedInput: z.unknown().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const route = getActiveBackendRoute(ctx)
      if (!route) {
        return {
          ok: false as const,
          error: "OpenCodex backend is not configured yet.",
        }
      }

      if (route.routeKind !== "claude") {
        return {
          ok: false as const,
          error:
            "The active OpenCodex backend route does not currently expose interactive tool approvals.",
        }
      }

      return await route.callers.claude.respondToolApproval(input)
    }),

  chat: publicProcedure
    .input(
      z.object({
        subChatId: z.string(),
        chatId: z.string(),
        prompt: z.string(),
        cwd: z.string(),
        projectPath: z.string().optional(),
        mode: z.enum(["plan", "agent"]).default("agent"),
        sessionId: z.string().optional(),
        model: z.string().optional(),
        images: z.array(imageAttachmentSchema).optional(),
        runId: z.string().optional(),
        forceNewSession: z.boolean().optional(),
        authConfig: z
          .object({
            apiKey: z.string().min(1),
          })
          .optional(),
        customConfig: z
          .object({
            model: z.string().min(1),
            token: z.string().min(1),
            baseUrl: z.string().min(1),
          })
          .optional(),
        maxThinkingTokens: z.number().optional(),
        historyEnabled: z.boolean().optional(),
        offlineModeEnabled: z.boolean().optional(),
        enableTasks: z.boolean().optional(),
      }),
    )
    .subscription(({ ctx, input }) => {
      const route = getActiveBackendRoute(ctx)
      if (!route) {
        throw new Error("OpenCodex backend is not configured yet.")
      }

      if (route.routeKind === "codex") {
        return route.callers.codex.chat({
          subChatId: input.subChatId,
          chatId: input.chatId,
          runId: input.runId ?? crypto.randomUUID(),
          prompt: input.prompt,
          model: input.model,
          cwd: input.cwd,
          projectPath: input.projectPath,
          mode: input.mode,
          sessionId: input.sessionId,
          forceNewSession: input.forceNewSession,
          images: input.images,
          authConfig: input.authConfig,
        })
      }

      return route.callers.claude.chat({
        subChatId: input.subChatId,
        chatId: input.chatId,
        prompt: input.prompt,
        cwd: input.cwd,
        projectPath: input.projectPath,
        mode: input.mode,
        sessionId: input.sessionId,
        model: input.model,
        customConfig: input.customConfig,
        maxThinkingTokens: input.maxThinkingTokens,
        images: input.images,
        historyEnabled: input.historyEnabled,
        offlineModeEnabled: input.offlineModeEnabled,
        enableTasks: input.enableTasks,
      })
    }),

  cancel: publicProcedure
    .input(
      z.object({
        subChatId: z.string(),
        runId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const route = getActiveBackendRoute(ctx)
      if (!route) {
        return {
          cancelled: false as const,
          error: "OpenCodex backend is not configured yet.",
        }
      }

      if (route.routeKind === "codex") {
        if (!input.runId) {
          return {
            cancelled: false as const,
            error: "A runId is required to cancel the active OpenCodex codex route.",
          }
        }
        return await route.callers.codex.cancel({
          subChatId: input.subChatId,
          runId: input.runId,
        })
      }

      return await route.callers.claude.cancel({
        subChatId: input.subChatId,
      })
    }),

  cleanup: publicProcedure
    .input(
      z.object({
        subChatId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const route = getActiveBackendRoute(ctx)
      if (!route) {
        return {
          success: false as const,
          error: "OpenCodex backend is not configured yet.",
        }
      }

      if (route.routeKind === "codex") {
        return await route.callers.codex.cleanup({
          subChatId: input.subChatId,
        })
      }

      const result = await route.callers.claude.cancel({
        subChatId: input.subChatId,
      })
      return {
        success: result.cancelled,
      }
    }),
})

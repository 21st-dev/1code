import { z } from "zod"
import {
  createMcpRegistryService,
  type McpRegistryService,
} from "../../mcp-registry/service"
import { publicProcedure, router } from "../index"

const optionalTrimmedStringSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}, z.string().min(1).optional())

const registryListInputSchema = z
  .object({
    cursor: optionalTrimmedStringSchema,
    limit: z.number().int().min(1).max(100).optional(),
    search: optionalTrimmedStringSchema,
    updatedSince: optionalTrimmedStringSchema,
    version: optionalTrimmedStringSchema,
    includeDeleted: z.boolean().optional(),
  })
  .optional()

const registryDetailInputSchema = z.object({
  serverName: z.string().trim().min(1),
  version: optionalTrimmedStringSchema,
  includeDeleted: z.boolean().optional(),
})

const registryPreviewInstallInputSchema = registryDetailInputSchema.extend({
  targetId: z.string().trim().min(1),
})

const registrySetupValueSchema = z.union([
  z.boolean(),
  z.string().trim().min(1),
  z.object({
    value: z.string().trim().min(1).optional(),
    envVar: optionalTrimmedStringSchema,
  }),
])

const registrySetupResolutionSchema = z
  .object({
    env: z.record(z.string(), registrySetupValueSchema).optional(),
    headers: z.record(z.string(), registrySetupValueSchema).optional(),
    variables: z.record(z.string(), registrySetupValueSchema).optional(),
    bearerTokenEnvRefs: z.record(z.string(), z.string().optional()).optional(),
    localDependencies: z.record(z.string(), z.boolean()).optional(),
    oauthAuthenticated: z.boolean().optional(),
    runtimeAuthenticated: z.boolean().optional(),
  })
  .optional()

const registryInstallInputSchema = registryPreviewInstallInputSchema.extend({
  runtime: z.enum(["claude-code", "codex"]),
  scope: z.enum(["global", "project"]),
  projectPath: optionalTrimmedStringSchema,
  installName: optionalTrimmedStringSchema,
  resolvedSetup: registrySetupResolutionSchema,
})

export function createMcpRegistryRouter(
  service: McpRegistryService = createMcpRegistryService(),
) {
  return router({
    list: publicProcedure
      .input(registryListInputSchema)
      .query(async ({ input }) => {
        if (input?.search) {
          return service.searchEntries({
            ...input,
            search: input.search,
          })
        }
        return service.listEntries(input)
      }),

    detail: publicProcedure
      .input(registryDetailInputSchema)
      .query(async ({ input }) => {
        return service.getEntryDetail(input)
      }),

    previewInstall: publicProcedure
      .input(registryPreviewInstallInputSchema)
      .query(async ({ input }) => {
        return service.previewEntryInstall(input)
      }),

    install: publicProcedure
      .input(registryInstallInputSchema)
      .mutation(async ({ input }) => {
        return service.installEntry(input)
      }),
  })
}

export const mcpRegistryRouter = createMcpRegistryRouter()

import { z } from "zod"
import {
  claudeProviderAuthModeSchema,
  clearClaudeProviderConfig,
  getClaudeProviderConfigMetadata,
  importLegacyClaudeProviderConfig,
  saveClaudeProviderConfig,
  type ClaudeProviderAuthMode,
  type ClaudeProviderRuntimeConfig,
} from "../../claude/provider-config-store"
import { publicProcedure, router } from "../index"

export { claudeProviderAuthModeSchema }
export type { ClaudeProviderAuthMode, ClaudeProviderRuntimeConfig }

const saveInputSchema = z.object({
  model: z.string().min(1),
  baseUrl: z.string().min(1),
  authMode: claudeProviderAuthModeSchema,
  token: z.string().optional(),
})

export const claudeProviderConfigRouter = router({
  get: publicProcedure.query(() => getClaudeProviderConfigMetadata()),

  save: publicProcedure
    .input(saveInputSchema)
    .mutation(({ input }) => saveClaudeProviderConfig(input)),

  clear: publicProcedure.mutation(() => clearClaudeProviderConfig()),

  importLegacy: publicProcedure
    .input(saveInputSchema.extend({ token: z.string().min(1) }))
    .mutation(({ input }) => importLegacyClaudeProviderConfig(input)),
})

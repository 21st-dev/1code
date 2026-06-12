import { z } from "zod"
import {
  AGENT_RUNTIME_CAPABILITY_IDS,
} from "../../../../shared/agent-runtime-capabilities"
import {
  listRegisteredAgentRuntimeManifests,
  resolveRegisteredAgentRuntimeCapability,
  resolveRegisteredAgentRuntimeManifest,
} from "../../agent-runtime/runtime-registry"
import {
  desktopScopeExpansionResponseInputSchema,
  respondDesktopScopeExpansion,
} from "../../agent-runtime/scope-expansion"
import { publicProcedure, router } from "../index"

const capabilityIdSchema = z.enum(AGENT_RUNTIME_CAPABILITY_IDS)

export const agentRuntimeRouter = router({
  listManifests: publicProcedure.query(() => {
    return listRegisteredAgentRuntimeManifests()
  }),

  getManifest: publicProcedure
    .input(z.object({ runtimeId: z.string().min(1) }))
    .query(({ input }) => {
      return resolveRegisteredAgentRuntimeManifest(input.runtimeId)
    }),

  checkCapability: publicProcedure
    .input(
      z.object({
        runtimeId: z.string().min(1),
        capabilityId: capabilityIdSchema,
      }),
    )
    .query(({ input }) => {
      return resolveRegisteredAgentRuntimeCapability({
        runtime: input.runtimeId,
        capabilityId: input.capabilityId,
      })
    }),

  respondScopeExpansion: publicProcedure
    .input(desktopScopeExpansionResponseInputSchema)
    .mutation(({ input }) => {
      return respondDesktopScopeExpansion(input)
    }),
})

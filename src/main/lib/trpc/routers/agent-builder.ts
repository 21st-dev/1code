import { z } from "zod"
import { listAgentBuilderEntries } from "../../agent-builder/read-model"
import { publicProcedure, router } from "../index"

export const agentBuilderRouter = router({
  list: publicProcedure
    .input(z.object({ cwd: z.string().optional() }).optional())
    .query(async ({ input }) => {
      return listAgentBuilderEntries({ cwd: input?.cwd })
    }),
})

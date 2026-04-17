import { z } from "zod"
import { publicProcedure, router } from "../index"

const CLOUD_SANDBOX_IMPORT_REMOVED_MESSAGE =
  "OpenCodex local-native mode removed cloud sandbox import. Clone the repository locally and open it as a project instead."

export const sandboxImportRouter = router({
  importSandboxChat: publicProcedure
    .input(
      z.object({
        sandboxId: z.string(),
        remoteChatId: z.string(),
        remoteSubChatId: z.string().optional(),
        projectId: z.string(),
        chatName: z.string().optional(),
      }),
    )
    .mutation(() => {
      throw new Error(CLOUD_SANDBOX_IMPORT_REMOVED_MESSAGE)
    }),

  listRemoteSandboxChats: publicProcedure
    .input(
      z.object({
        teamId: z.string(),
      }),
    )
    .query(() => {
      throw new Error(CLOUD_SANDBOX_IMPORT_REMOVED_MESSAGE)
    }),

  cloneFromSandbox: publicProcedure
    .input(
      z.object({
        sandboxId: z.string(),
        remoteChatId: z.string(),
        remoteSubChatId: z.string().optional(),
        chatName: z.string().optional(),
        targetPath: z.string(),
      }),
    )
    .mutation(() => {
      throw new Error(CLOUD_SANDBOX_IMPORT_REMOVED_MESSAGE)
    }),
})

import { z } from "zod"
import {
  deleteChatImageAttachment,
  getChatImageAttachmentDataUrl,
  stageChatImageAttachment,
} from "../../chat-attachments"
import { publicProcedure, router } from "../index"

export const chatAttachmentsRouter = router({
  stageImage: publicProcedure
    .input(
      z.object({
        chatId: z.string().optional(),
        subChatId: z.string(),
        base64Data: z.string(),
        filename: z.string().optional(),
        mediaType: z.string(),
        source: z
          .enum(["file-picker", "drag-drop", "clipboard", "screenshot"])
          .optional(),
        width: z.number().optional(),
        height: z.number().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return stageChatImageAttachment(input)
    }),

  getImageDataUrl: publicProcedure
    .input(
      z.object({
        localRef: z.string(),
        mediaType: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      return getChatImageAttachmentDataUrl(input.localRef, input.mediaType)
    }),

  deleteImage: publicProcedure
    .input(z.object({ localRef: z.string() }))
    .mutation(async ({ input }) => {
      return deleteChatImageAttachment(input.localRef)
    }),
})


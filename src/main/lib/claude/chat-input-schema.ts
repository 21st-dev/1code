import { z } from "zod"

export const imageAttachmentSchema = z.object({
  base64Data: z.string().optional(),
  localRef: z.string().optional(),
  attachmentId: z.string().optional(),
  mediaType: z.string(),
  filename: z.string().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  sha256: z.string().optional(),
})

export type ImageAttachment = z.infer<typeof imageAttachmentSchema>

export const longTextAttachmentSchema = z.object({
  type: z.literal("long-text-attachment").optional(),
  attachmentId: z.string(),
  localRef: z.string(),
  filename: z.string(),
  byteLength: z.number().int().nonnegative(),
  preview: z.string().optional(),
  kind: z.enum(["pasted", "chatHistory"]),
})

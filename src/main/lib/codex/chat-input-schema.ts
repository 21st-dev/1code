import { z } from "zod"
import { agentScopeContractInputSchema } from "../agent-guard"

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

export const longTextAttachmentSchema = z.object({
  type: z.literal("long-text-attachment").optional(),
  attachmentId: z.string(),
  localRef: z.string(),
  filename: z.string(),
  byteLength: z.number().int().nonnegative(),
  preview: z.string().optional(),
  kind: z.enum(["pasted", "chatHistory"]),
})

export const codexChatInputSchema = z
  .object({
    subChatId: z.string(),
    chatId: z.string(),
    runId: z.string(),
    prompt: z.string(),
    model: z.string().optional(),
    cwd: z.string(),
    projectPath: z.string().optional(),
    mode: z.enum(["plan", "agent"]).default("agent"),
    sessionId: z.string().optional(),
    forceNewSession: z.boolean().optional(),
    images: z.array(imageAttachmentSchema).optional(),
    longTextAttachments: z.array(longTextAttachmentSchema).optional(),
    codexAuthMethod: z.enum(["chatgpt", "api_key"]).optional(),
    providerProfileId: z.string().optional(),
    scopeContract: agentScopeContractInputSchema.optional(),
  })
  .strict()

export type CodexChatInput = z.infer<typeof codexChatInputSchema>

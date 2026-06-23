import type {
  FileUIPart,
  ReasoningUIPart,
  SourceDocumentUIPart,
  SourceUrlUIPart,
  StepStartUIPart,
  TextUIPart,
  UIMessage,
} from "ai"
import { z } from "zod"
import type { AgentChatMessageMetadata } from "./agent-chat-provider"
import {
  supportedChatImageMediaTypes,
  type ChatImageAttachmentPart,
} from "./chat-attachments"
import {
  longTextAttachmentKinds,
  type LongTextAttachmentPart,
} from "./long-text-attachments"

export const canonicalToolStates = [
  "input-streaming",
  "input-available",
  "approval-requested",
  "approval-responded",
  "output-available",
  "output-error",
  "output-denied",
  "call",
  "result",
  "pending",
  "error",
] as const

export type CanonicalToolState = (typeof canonicalToolStates)[number]

export type ChatMessageMetadata = AgentChatMessageMetadata & {
  sessionId?: string
  sdkMessageUuid?: string
  shouldForkResume?: boolean
  inputTokens?: number
  outputTokens?: number
  cacheReadInputTokens?: number
  cacheCreationInputTokens?: number
  reasoningTokens?: number
  totalTokens?: number
  guardedRun?: unknown
  [key: string]: unknown
}

type CommonMessagePartFields = {
  id?: string
  text?: string
  toolCallId?: string
  toolName?: string
  title?: string
  state?: CanonicalToolState | "streaming" | "done"
  input?: unknown
  output?: unknown
  result?: unknown
  error?: unknown
  errorText?: string
  providerMetadata?: unknown
  callProviderMetadata?: unknown
  [key: string]: unknown
}

export type DataImageMessagePart = {
  type: "data-image"
  data: {
    url?: string
    mediaType?: string
    filename?: string
    base64Data?: string
  }
}

export type DataFileMessagePart = {
  type: "data-file"
  data: {
    url: string
    mediaType?: string
    filename: string
    size?: number
  }
}

export type FileContentMessagePart = {
  type: "file-content"
  filePath: string
  content: string
}

export type CanonicalToolMessagePart = {
  type: `tool-${string}`
  toolCallId?: string
  toolName?: string
  title?: string
  state?: CanonicalToolState
  input?: unknown
  output?: unknown
  result?: unknown
  error?: unknown
  errorText?: string
  providerExecuted?: boolean
  preliminary?: boolean
  rawInput?: unknown
  approval?: unknown
  callProviderMetadata?: unknown
  providerMetadata?: unknown
}

export type CanonicalDynamicToolMessagePart = {
  type: "dynamic-tool"
  toolName: string
  toolCallId: string
  title?: string
  state?: CanonicalToolState
  input?: unknown
  output?: unknown
  result?: unknown
  errorText?: string
  providerExecuted?: boolean
  preliminary?: boolean
  rawInput?: unknown
  approval?: unknown
  callProviderMetadata?: unknown
  providerMetadata?: unknown
}

type AiSdkBaseMessagePart =
  | TextUIPart
  | ReasoningUIPart
  | StepStartUIPart
  | CanonicalToolMessagePart
  | CanonicalDynamicToolMessagePart
  | SourceUrlUIPart
  | SourceDocumentUIPart
  | FileUIPart

export type CanonicalAgentUserMessagePart =
  | Extract<AiSdkBaseMessagePart, { type: "text" }>
  | ChatImageAttachmentPart
  | DataImageMessagePart
  | DataFileMessagePart
  | FileContentMessagePart
  | LongTextAttachmentPart

export type CanonicalChatMessagePart = CommonMessagePartFields &
  (
    | AiSdkBaseMessagePart
    | ChatImageAttachmentPart
    | DataImageMessagePart
    | DataFileMessagePart
    | FileContentMessagePart
    | LongTextAttachmentPart
  )

export type ExploringGroupMessagePart = CommonMessagePartFields & {
  type: "exploring-group"
  parts: CanonicalChatMessagePart[]
}

export type TaskGroupMessagePart = CommonMessagePartFields & {
  type: "task-group"
  parts: CanonicalChatMessagePart[]
}

export type RenderableMessagePart =
  | CanonicalChatMessagePart
  | ExploringGroupMessagePart
  | TaskGroupMessagePart

export type CanonicalChatMessage = Omit<UIMessage, "metadata" | "parts"> & {
  metadata?: ChatMessageMetadata
  parts?: CanonicalChatMessagePart[]
  createdAt?: string | Date
}

const passthroughObject = <Shape extends z.ZodRawShape>(shape: Shape) =>
  z.object(shape).passthrough()

const providerMetadataSchema = z.unknown().optional()
const toolStateSchema = z.enum(canonicalToolStates)

export const textMessagePartSchema = passthroughObject({
  type: z.literal("text"),
  text: z.string(),
  state: z.enum(["streaming", "done"]).optional(),
  providerMetadata: providerMetadataSchema,
})

export const reasoningMessagePartSchema = passthroughObject({
  type: z.literal("reasoning"),
  text: z.string(),
  state: z.enum(["streaming", "done"]).optional(),
  providerMetadata: providerMetadataSchema,
})

export const stepStartMessagePartSchema = passthroughObject({
  type: z.literal("step-start"),
})

export const toolMessagePartSchema = passthroughObject({
  type: z.string().regex(/^tool-/),
  toolCallId: z.string().optional(),
  toolName: z.string().optional(),
  title: z.string().optional(),
  state: toolStateSchema.optional(),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  result: z.unknown().optional(),
  error: z.unknown().optional(),
  errorText: z.string().optional(),
  providerExecuted: z.boolean().optional(),
  preliminary: z.boolean().optional(),
  rawInput: z.unknown().optional(),
  approval: z.unknown().optional(),
  callProviderMetadata: providerMetadataSchema,
  providerMetadata: providerMetadataSchema,
})

export const dynamicToolMessagePartSchema = passthroughObject({
  type: z.literal("dynamic-tool"),
  toolName: z.string(),
  toolCallId: z.string(),
  title: z.string().optional(),
  state: toolStateSchema.optional(),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  result: z.unknown().optional(),
  errorText: z.string().optional(),
  providerExecuted: z.boolean().optional(),
  preliminary: z.boolean().optional(),
  rawInput: z.unknown().optional(),
  approval: z.unknown().optional(),
  callProviderMetadata: providerMetadataSchema,
  providerMetadata: providerMetadataSchema,
})

export const sourceUrlMessagePartSchema = passthroughObject({
  type: z.literal("source-url"),
  sourceId: z.string(),
  url: z.string(),
  title: z.string().optional(),
  providerMetadata: providerMetadataSchema,
})

export const sourceDocumentMessagePartSchema = passthroughObject({
  type: z.literal("source-document"),
  sourceId: z.string(),
  mediaType: z.string(),
  title: z.string(),
  filename: z.string().optional(),
  providerMetadata: providerMetadataSchema,
})

export const fileMessagePartSchema = passthroughObject({
  type: z.literal("file"),
  mediaType: z.string(),
  filename: z.string().optional(),
  url: z.string(),
  providerMetadata: providerMetadataSchema,
})

export const chatImageAttachmentMessagePartSchema = passthroughObject({
  type: z.literal("attachment-image"),
  attachmentId: z.string(),
  localRef: z.string(),
  filename: z.string(),
  mediaType: z.enum(supportedChatImageMediaTypes),
  sizeBytes: z.number().int().nonnegative(),
  width: z.number().optional(),
  height: z.number().optional(),
  sha256: z.string().optional(),
})

export const dataImageMessagePartSchema = passthroughObject({
  type: z.literal("data-image"),
  data: z.object({
    url: z.string().optional(),
    mediaType: z.string().optional(),
    filename: z.string().optional(),
    base64Data: z.string().optional(),
  }),
})

export const dataFileMessagePartSchema = passthroughObject({
  type: z.literal("data-file"),
  data: z.object({
    url: z.string(),
    mediaType: z.string().optional(),
    filename: z.string(),
    size: z.number().optional(),
  }),
})

export const longTextAttachmentMessagePartSchema = passthroughObject({
  type: z.literal("long-text-attachment"),
  attachmentId: z.string(),
  localRef: z.string(),
  filename: z.string(),
  byteLength: z.number().int().nonnegative(),
  preview: z.string(),
  kind: z.enum(longTextAttachmentKinds),
})

export const fileContentMessagePartSchema = passthroughObject({
  type: z.literal("file-content"),
  filePath: z.string(),
  content: z.string(),
})

export const agentUserMessagePartSchema = z.union([
  textMessagePartSchema,
  chatImageAttachmentMessagePartSchema,
  dataImageMessagePartSchema,
  dataFileMessagePartSchema,
  longTextAttachmentMessagePartSchema,
  fileContentMessagePartSchema,
])

export const canonicalChatMessagePartSchema = z.union([
  textMessagePartSchema,
  reasoningMessagePartSchema,
  stepStartMessagePartSchema,
  toolMessagePartSchema,
  dynamicToolMessagePartSchema,
  sourceUrlMessagePartSchema,
  sourceDocumentMessagePartSchema,
  fileMessagePartSchema,
  chatImageAttachmentMessagePartSchema,
  dataImageMessagePartSchema,
  dataFileMessagePartSchema,
  longTextAttachmentMessagePartSchema,
  fileContentMessagePartSchema,
])

export const renderableMessagePartSchema = z.union([
  canonicalChatMessagePartSchema,
  passthroughObject({
    type: z.literal("exploring-group"),
    parts: z.array(canonicalChatMessagePartSchema),
  }),
  passthroughObject({
    type: z.literal("task-group"),
    parts: z.array(canonicalChatMessagePartSchema),
  }),
])

export const chatMessageMetadataSchema = z
  .object({
    model: z.string().optional(),
    provider: z.enum(["claude-code", "codex", "qwen-code", "kun"]).optional(),
    modelSource: z.string().optional(),
    providerProfileId: z.string().optional(),
    sessionId: z.string().optional(),
    sdkMessageUuid: z.string().optional(),
    shouldForkResume: z.boolean().optional(),
    inputTokens: z.number().optional(),
    outputTokens: z.number().optional(),
    cacheReadInputTokens: z.number().optional(),
    cacheCreationInputTokens: z.number().optional(),
    reasoningTokens: z.number().optional(),
    totalTokens: z.number().optional(),
    guardedRun: z.unknown().optional(),
  })
  .passthrough()

export const canonicalChatMessageSchema = z
  .object({
    id: z.string(),
    role: z.enum(["system", "user", "assistant"]),
    metadata: chatMessageMetadataSchema.optional(),
    parts: z.array(canonicalChatMessagePartSchema).optional(),
    createdAt: z.union([z.string(), z.date()]).optional(),
  })
  .passthrough()

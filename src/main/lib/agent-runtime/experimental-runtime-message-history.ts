import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import type { AgentRuntimeId } from "../../../shared/agent-runtime-capabilities"
import type {
  CanonicalChatMessage,
  CanonicalChatMessagePart,
  ChatMessageMetadata,
} from "../../../shared/chat-message"
import type { getDatabase } from "../db"
import { chats, subChats } from "../db/schema"

type MessageDb = ReturnType<typeof getDatabase>

type RuntimeMessageMetadataInput = {
  runtimeId: AgentRuntimeId
  modelSource?: string | null
  providerProfileId?: string | null
}

type RuntimeAssistantPart = Extract<
  CanonicalChatMessagePart,
  { type: "text" | "reasoning" }
> & {
  id: string
  text: string
  state: "streaming" | "done"
}

export type ExperimentalRuntimeAssistantAccumulator = {
  parts: RuntimeAssistantPart[]
  partsByKey: Map<string, RuntimeAssistantPart>
}

export function createExperimentalRuntimeAssistantAccumulator(): ExperimentalRuntimeAssistantAccumulator {
  return {
    parts: [],
    partsByKey: new Map(),
  }
}

export function readExperimentalRuntimeSubChatMessages(
  db: MessageDb,
  subChatId: string,
): CanonicalChatMessage[] {
  const row = db
    .select({ messages: subChats.messages })
    .from(subChats)
    .where(eq(subChats.id, subChatId))
    .get()
  return parseMessages(row?.messages)
}

export function prepareExperimentalRuntimeUserMessages(input: {
  existingMessages: CanonicalChatMessage[]
  prompt: string
  metadata: RuntimeMessageMetadataInput
  now?: () => Date
  createId?: () => string
}): CanonicalChatMessage[] {
  const lastMessage = input.existingMessages[input.existingMessages.length - 1]
  if (
    lastMessage?.role === "user" &&
    extractText(lastMessage) === input.prompt &&
    lastMessage.metadata?.provider === input.metadata.runtimeId
  ) {
    return input.existingMessages
  }

  return [
    ...input.existingMessages,
    {
      id: input.createId?.() ?? randomUUID(),
      role: "user",
      createdAt: (input.now?.() ?? new Date()).toISOString(),
      parts: [{ type: "text", text: input.prompt }],
      metadata: runtimeMessageMetadata(input.metadata),
    },
  ]
}

export function collectExperimentalRuntimeAssistantChunk(
  accumulator: ExperimentalRuntimeAssistantAccumulator,
  chunk: Record<string, unknown>,
): void {
  switch (chunk.type) {
    case "text-start":
      getOrCreatePart(accumulator, "text", stringId(chunk.id, "text"))
      return
    case "text-delta":
      getOrCreatePart(accumulator, "text", stringId(chunk.id, "text")).text +=
        typeof chunk.delta === "string" ? chunk.delta : ""
      return
    case "text-end":
      getOrCreatePart(accumulator, "text", stringId(chunk.id, "text")).state =
        "done"
      return
    case "reasoning-start":
      getOrCreatePart(accumulator, "reasoning", stringId(chunk.id, "reasoning"))
      return
    case "reasoning":
    case "reasoning-delta":
      getOrCreatePart(
        accumulator,
        "reasoning",
        stringId(chunk.id, "reasoning"),
      ).text +=
        typeof chunk.delta === "string"
          ? chunk.delta
          : typeof chunk.text === "string"
            ? chunk.text
            : ""
      return
    case "reasoning-end":
      getOrCreatePart(
        accumulator,
        "reasoning",
        stringId(chunk.id, "reasoning"),
      ).state = "done"
      return
  }
}

export function prepareExperimentalRuntimeAssistantMessages(input: {
  messagesToSave: CanonicalChatMessage[]
  accumulator: ExperimentalRuntimeAssistantAccumulator
  metadata: RuntimeMessageMetadataInput
  now?: () => Date
  createId?: () => string
}): CanonicalChatMessage[] {
  const parts = input.accumulator.parts
    .filter((part) => part.text.length > 0)
    .map((part) => ({ ...part, state: "done" as const }))
  if (parts.length === 0) return input.messagesToSave

  return [
    ...input.messagesToSave,
    {
      id: input.createId?.() ?? randomUUID(),
      role: "assistant",
      createdAt: (input.now?.() ?? new Date()).toISOString(),
      parts,
      metadata: runtimeMessageMetadata(input.metadata),
    },
  ]
}

export function persistExperimentalRuntimeSubChatMessages(input: {
  db: MessageDb
  chatId: string
  subChatId: string
  messages: CanonicalChatMessage[]
  now?: () => Date
}): void {
  const updatedAt = input.now?.() ?? new Date()
  input.db
    .update(subChats)
    .set({
      messages: JSON.stringify(input.messages),
      updatedAt,
    })
    .where(eq(subChats.id, input.subChatId))
    .run()
  input.db
    .update(chats)
    .set({ updatedAt })
    .where(eq(chats.id, input.chatId))
    .run()
}

function runtimeMessageMetadata(
  input: RuntimeMessageMetadataInput,
): ChatMessageMetadata {
  return {
    model: input.runtimeId,
    provider: input.runtimeId,
    ...(input.modelSource ? { modelSource: input.modelSource } : {}),
    ...(input.providerProfileId
      ? { providerProfileId: input.providerProfileId }
      : {}),
  }
}

function parseMessages(rawMessages: unknown): CanonicalChatMessage[] {
  if (Array.isArray(rawMessages)) {
    return rawMessages as CanonicalChatMessage[]
  }
  if (typeof rawMessages !== "string") return []
  try {
    const parsed = JSON.parse(rawMessages)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function extractText(message: CanonicalChatMessage): string {
  return (message.parts ?? [])
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n")
}

function getOrCreatePart(
  accumulator: ExperimentalRuntimeAssistantAccumulator,
  type: "text" | "reasoning",
  id: string,
): RuntimeAssistantPart {
  const key = `${type}:${id}`
  const existing = accumulator.partsByKey.get(key)
  if (existing) return existing

  const part: RuntimeAssistantPart = {
    type,
    id,
    text: "",
    state: "streaming",
  }
  accumulator.partsByKey.set(key, part)
  accumulator.parts.push(part)
  return part
}

function stringId(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback
}

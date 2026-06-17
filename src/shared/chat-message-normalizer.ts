import { normalizeAcpParts } from "./acp-tool-normalizer"
import type {
  CanonicalChatMessage,
  CanonicalChatMessagePart,
} from "./chat-message"
import { normalizeCodexToolPart } from "./codex-tool-normalizer"

type AnyRecord = Record<string, any>

export type NormalizePersistedChatMessagesOptions = {
  sourceId?: string
  onParseError?: (error: unknown, sourceId?: string) => void
}

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === "object" && value !== null
}

function parseObjectJson(value: string): AnyRecord | null {
  try {
    const parsed = JSON.parse(value)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function parsePersistedMessages(
  rawMessages: unknown,
  options?: NormalizePersistedChatMessagesOptions,
): unknown[] {
  if (Array.isArray(rawMessages)) return rawMessages
  if (!rawMessages) return []

  if (typeof rawMessages !== "string") return []

  try {
    const parsed = JSON.parse(rawMessages)
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    options?.onParseError?.(error, options.sourceId)
    return []
  }
}

function normalizeLegacyToolInvocationPart(part: AnyRecord): AnyRecord | null {
  if (part.type !== "tool-invocation" || !part.toolName) return null

  return {
    ...part,
    type: `tool-${part.toolName}`,
    toolCallId: part.toolCallId || part.toolInvocationId,
    input: part.input || part.args,
  }
}

function normalizeToolStateAndOutput(part: AnyRecord): AnyRecord {
  if (!part.type?.startsWith("tool-") || !part.state) return part

  let normalizedState = part.state
  if (part.state === "result") {
    normalizedState =
      part.result?.success === false ? "output-error" : "output-available"
  }

  return {
    ...part,
    state: normalizedState,
    output: part.output || part.result,
  }
}

function isCodexMcpWrapperPart(part: AnyRecord): boolean {
  return (
    part.type?.startsWith("tool-Tool:") ||
    part.toolName?.startsWith("Tool:") ||
    part.input?.toolName?.startsWith("Tool:")
  )
}

function normalizeCodexMcpWrapperPart(part: AnyRecord): AnyRecord | null {
  if (!isCodexMcpWrapperPart(part)) return null

  const normalizedMcpPart = normalizeCodexToolPart(part) as AnyRecord
  if (normalizedMcpPart === part) return null
  if (normalizedMcpPart.state) {
    return normalizeToolStateAndOutput(normalizedMcpPart)
  }
  return normalizedMcpPart
}

function isAcpToolPart(part: AnyRecord): boolean {
  return (
    part.type?.startsWith("tool-") &&
    (part.input?.toolName ||
      part.type.includes(" ") ||
      part.type === "tool-acp.acp_provider_agent_dynamic_tool")
  )
}

function normalizeAcpHydrationPart(part: AnyRecord): AnyRecord | null {
  if (!isAcpToolPart(part)) return null

  const inputForSharedPrimitive =
    typeof part.input === "string"
      ? parseObjectJson(part.input) ?? part.input
      : part.input
  const candidate =
    inputForSharedPrimitive !== part.input
      ? { ...part, input: inputForSharedPrimitive }
      : part
  const normalized = normalizeAcpParts([candidate])[0] as AnyRecord
  if (normalized === candidate) return null

  const outputWasAddedAsUndefined =
    normalized.output === undefined &&
    !Object.prototype.hasOwnProperty.call(part, "output")
  const normalizedPart = outputWasAddedAsUndefined
    ? { ...normalized }
    : normalized
  if (outputWasAddedAsUndefined) {
    delete normalizedPart.output
  }

  if (normalizedPart.state) {
    return normalizeToolStateAndOutput(normalizedPart)
  }
  return normalizedPart
}

export function normalizePersistedChatMessagePart(
  part: unknown,
): CanonicalChatMessagePart {
  if (!isRecord(part)) return part as CanonicalChatMessagePart

  const legacyToolPart = normalizeLegacyToolInvocationPart(part)
  if (legacyToolPart) return legacyToolPart as CanonicalChatMessagePart

  const codexMcpPart = normalizeCodexMcpWrapperPart(part)
  if (codexMcpPart) return codexMcpPart as CanonicalChatMessagePart

  const acpPart = normalizeAcpHydrationPart(part)
  if (acpPart) return acpPart as CanonicalChatMessagePart

  return normalizeToolStateAndOutput(part) as CanonicalChatMessagePart
}

export function normalizePersistedChatMessage(
  message: unknown,
): CanonicalChatMessage {
  if (!isRecord(message)) return message as CanonicalChatMessage
  if (!Array.isArray(message.parts)) return message as CanonicalChatMessage

  return {
    ...message,
    parts: message.parts.map(normalizePersistedChatMessagePart),
  } as CanonicalChatMessage
}

export function normalizePersistedChatMessages(
  rawMessages: unknown,
  options?: NormalizePersistedChatMessagesOptions,
): CanonicalChatMessage[] {
  return parsePersistedMessages(rawMessages, options).map(
    normalizePersistedChatMessage,
  )
}

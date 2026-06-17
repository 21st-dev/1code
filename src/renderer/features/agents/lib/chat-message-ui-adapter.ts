import type { UIMessageChunk as AiSdkUIMessageChunk, UIMessage } from "ai"
import type {
  CanonicalChatMessage,
  CanonicalChatMessagePart,
  ChatMessageMetadata,
  DataImageMessagePart,
  FileContentMessagePart,
} from "../../../../shared/chat-message"
import type { MCPServer, SessionInfo } from "../../../lib/atoms"

export type AiSdkTransportChunk = AiSdkUIMessageChunk<ChatMessageMetadata>

export type CodexSessionInitChunk = {
  type: "session-init"
  tools?: string[]
  mcpServers?: MCPServer[]
  plugins?: SessionInfo["plugins"]
  skills?: string[]
}

export type CodexAuthErrorChunk = {
  type: "auth-error"
  errorText?: string
}

export type CodexRuntimeStatusChunk = {
  type: "runtime-status"
  ok?: boolean
  blocker?: {
    message?: string
    hint?: string
  }
}

export type CodexCapabilityErrorChunk = {
  type: "capability-error"
  errorText?: string
}

export type CodexTransportChunk =
  | AiSdkTransportChunk
  | CodexSessionInitChunk
  | CodexAuthErrorChunk
  | CodexRuntimeStatusChunk
  | CodexCapabilityErrorChunk

export function toAiSdkTransportChunk(chunk: unknown): AiSdkTransportChunk {
  return chunk as AiSdkTransportChunk
}

export function getCanonicalMessageParts(
  message: UIMessage | CanonicalChatMessage | undefined,
): CanonicalChatMessagePart[] {
  return (message?.parts ?? []) as CanonicalChatMessagePart[]
}

export function isTextMessagePart(
  part: CanonicalChatMessagePart,
): part is CanonicalChatMessagePart & { type: "text"; text: string } {
  return part.type === "text" && typeof part.text === "string"
}

export function isFileContentMessagePart(
  part: CanonicalChatMessagePart,
): part is FileContentMessagePart {
  return (
    part.type === "file-content" &&
    typeof part.filePath === "string" &&
    typeof part.content === "string"
  )
}

export function isDataImageMessagePart(
  part: CanonicalChatMessagePart,
): part is DataImageMessagePart {
  return (
    part.type === "data-image" &&
    typeof part.data === "object" &&
    part.data !== null
  )
}

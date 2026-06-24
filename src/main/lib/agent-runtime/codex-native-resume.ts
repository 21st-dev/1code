import { stripCodexRuntimeNoticeText } from "../../../shared/codex-runtime-notices"

export const CODEX_NATIVE_RESUME_MAX_STORED_MESSAGES_BYTES = 8 * 1024 * 1024

export type CodexNativeResumeSkipReason =
  | "force-new-session"
  | "oversized-transcript"
  | "runtime-notice-only-terminal"

export type CodexStoredMessage = {
  role?: unknown
  parts?: unknown
  metadata?: unknown
  [key: string]: unknown
}

type CodexStoredPart = {
  type?: unknown
  text?: unknown
  [key: string]: unknown
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function parseRuntimeMetadata(
  runtimeMetadata: string | Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!runtimeMetadata) return {}
  if (typeof runtimeMetadata === "object") return runtimeMetadata
  try {
    const parsed = JSON.parse(runtimeMetadata)
    return asRecord(parsed) ?? {}
  } catch {
    return {}
  }
}

function isRuntimeNoticeTextPart(part: unknown): boolean {
  const record = asRecord(part) as CodexStoredPart | null
  if (!record) return false
  if (record.type !== "text") return false
  const stripped = stripCodexRuntimeNoticeText(record.text)
  return stripped.changed && stripped.text.trim().length === 0
}

export function isCodexNativeRuntimeNoticeOnlyAssistantMessage(
  message: CodexStoredMessage,
): boolean {
  if (message.role !== "assistant") return false
  if (!Array.isArray(message.parts) || message.parts.length === 0) return false
  return message.parts.every(isRuntimeNoticeTextPart)
}

export function stripCodexNativeRuntimeNoticeMessages(
  messages: CodexStoredMessage[],
): {
  messages: CodexStoredMessage[]
  removedCount: number
  removedPartCount: number
} {
  let removedCount = 0
  let removedPartCount = 0
  const cleanedMessages: CodexStoredMessage[] = []

  for (const message of messages) {
    if (message.role !== "assistant" || !Array.isArray(message.parts)) {
      cleanedMessages.push(message)
      continue
    }

    const cleanedParts: unknown[] = []
    let messageChanged = false

    for (const part of message.parts) {
      const record = asRecord(part) as CodexStoredPart | null
      if (!record || record.type !== "text") {
        cleanedParts.push(part)
        continue
      }

      const stripped = stripCodexRuntimeNoticeText(record.text)
      if (!stripped.changed) {
        cleanedParts.push(part)
        continue
      }

      removedPartCount += 1
      messageChanged = true
      if (stripped.text.trim().length === 0) continue

      cleanedParts.push({
        ...record,
        text: stripped.text,
      })
    }

    if (cleanedParts.length === 0) {
      removedCount += 1
      continue
    }

    cleanedMessages.push(
      !messageChanged && cleanedParts.length === message.parts.length
        ? message
        : {
            ...message,
            parts: cleanedParts,
          },
    )
  }

  return {
    messages: cleanedMessages,
    removedCount,
    removedPartCount,
  }
}

export function shouldStartFreshCodexNativeSession(params: {
  storedMessagesByteLength: number
  runtimeMetadata: string | Record<string, unknown> | null | undefined
  candidateSessionId?: string | null
  forceNewSession?: boolean
  messages: CodexStoredMessage[]
}): {
  startFresh: boolean
  reason?: CodexNativeResumeSkipReason
} {
  if (params.forceNewSession) {
    return { startFresh: true, reason: "force-new-session" }
  }

  if (!params.candidateSessionId) {
    return { startFresh: false }
  }

  if (
    params.storedMessagesByteLength >
    CODEX_NATIVE_RESUME_MAX_STORED_MESSAGES_BYTES
  ) {
    return { startFresh: true, reason: "oversized-transcript" }
  }

  const lastAssistantMessage = [...params.messages]
    .reverse()
    .find((message) => message.role === "assistant")

  if (
    lastAssistantMessage &&
    isCodexNativeRuntimeNoticeOnlyAssistantMessage(lastAssistantMessage)
  ) {
    return { startFresh: true, reason: "runtime-notice-only-terminal" }
  }

  const runtimeMetadata = parseRuntimeMetadata(params.runtimeMetadata)
  if (
    runtimeMetadata.resultSubtype === "running" &&
    !params.messages.some((message) => message.role === "assistant")
  ) {
    return { startFresh: true, reason: "runtime-notice-only-terminal" }
  }

  return { startFresh: false }
}

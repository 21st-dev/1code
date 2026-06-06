import type { CodexUsageMetadata } from "./usage-metadata"

export type CodexAcpNormalizedError = { message: string; code?: string }

export type EmitCodexAcpUiStreamInput = {
  uiStream: ReadableStream<any>
  emit: (chunk: any) => void
  normalizeError: (error: unknown) => CodexAcpNormalizedError
  isAuthError: (error: CodexAcpNormalizedError) => boolean
  resolveUsageOnce: () => Promise<CodexUsageMetadata | null>
}

export async function emitCodexAcpUiStream({
  uiStream,
  emit,
  normalizeError,
  isAuthError,
  resolveUsageOnce,
}: EmitCodexAcpUiStreamInput): Promise<void> {
  const reader = uiStream.getReader()
  let pendingFinishChunk: any | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    if (value?.type === "error") {
      const normalized = normalizeError(value)

      if (isAuthError(normalized)) {
        emit({ ...value, type: "auth-error", errorText: normalized.message })
      } else {
        emit({ ...value, errorText: normalized.message })
      }
      continue
    }

    if (value?.type === "finish") {
      pendingFinishChunk = value
      continue
    }

    emit(value)
  }

  if (pendingFinishChunk) {
    const usageMetadata = await resolveUsageOnce()
    if (usageMetadata) {
      emit({
        type: "message-metadata",
        messageMetadata: usageMetadata,
      })
    }
    emit(pendingFinishChunk)
  } else {
    emit({ type: "finish" })
  }
}

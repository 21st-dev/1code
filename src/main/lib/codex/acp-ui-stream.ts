import { ACP_PROVIDER_AGENT_DYNAMIC_TOOL_NAME } from "@mcpc-tech/acp-ai-provider"
import type { CodexUsageMetadata } from "./usage-metadata"
import {
  normalizeCodexDynamicPermissionTool,
  type CodexAcpPermissionTool,
  type CodexAcpToolPermissionDecision,
} from "./acp-permission"

export type CodexAcpNormalizedError = { message: string; code?: string }

export type CodexAcpDynamicToolPermissionHook = (
  tool: CodexAcpPermissionTool,
) => Promise<CodexAcpToolPermissionDecision> | CodexAcpToolPermissionDecision

export type EmitCodexAcpUiStreamInput = {
  uiStream: ReadableStream<any>
  emit: (chunk: any) => void
  normalizeError: (error: unknown) => CodexAcpNormalizedError
  isAuthError: (error: CodexAcpNormalizedError) => boolean
  resolveUsageOnce: () => Promise<CodexUsageMetadata | null>
  abortSignal?: AbortSignal
  onDynamicToolPermission?: CodexAcpDynamicToolPermissionHook
  onDynamicToolDenied?: (
    tool: CodexAcpPermissionTool,
    decision: CodexAcpToolPermissionDecision,
  ) => void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function getString(value: Record<string, unknown>, key: string): string | null {
  const candidate = value[key]
  return typeof candidate === "string" && candidate.trim().length > 0
    ? candidate
    : null
}

function getDynamicToolFromStreamChunk(
  chunk: unknown,
): CodexAcpPermissionTool | null {
  if (!isRecord(chunk)) return null
  if (chunk.type !== "tool-input-available") return null

  const chunkToolName = getString(chunk, "toolName")
  const chunkInput = chunk.input
  const inputRecord = isRecord(chunkInput) ? chunkInput : null
  const isProviderDynamicTool =
    chunkToolName === ACP_PROVIDER_AGENT_DYNAMIC_TOOL_NAME ||
    getString(inputRecord ?? {}, "toolName") !== null

  if (!isProviderDynamicTool) return null

  return normalizeCodexDynamicPermissionTool({
    toolCallId: getString(chunk, "toolCallId") ?? getString(chunk, "id"),
    toolName: chunkToolName,
    input: chunkInput,
  })
}

function cancelReaderQuietly(
  reader: ReadableStreamDefaultReader<any>,
  reason: string,
): void {
  try {
    void reader.cancel(reason).catch(() => {
      // The underlying ACP stream can already be closed after provider cleanup.
    })
  } catch {
    // The underlying ACP stream can already be closed after provider cleanup.
  }
}

type AbortedRead = { aborted: true }

function readChunk(
  reader: ReadableStreamDefaultReader<any>,
  abortSignal?: AbortSignal,
): Promise<ReadableStreamReadResult<any> | AbortedRead> {
  if (!abortSignal) return reader.read()
  if (abortSignal.aborted) return Promise.resolve({ aborted: true })

  return new Promise((resolve, reject) => {
    let settled = false
    const cleanup = () => {
      abortSignal.removeEventListener("abort", onAbort)
    }
    const onAbort = () => {
      if (settled) return
      settled = true
      cleanup()
      resolve({ aborted: true })
    }

    abortSignal.addEventListener("abort", onAbort, { once: true })
    reader.read().then(
      (result) => {
        if (settled) return
        settled = true
        cleanup()
        resolve(result)
      },
      (error) => {
        if (settled) return
        settled = true
        cleanup()
        reject(error)
      },
    )
  })
}

export async function emitCodexAcpUiStream({
  uiStream,
  emit,
  normalizeError,
  isAuthError,
  resolveUsageOnce,
  abortSignal,
  onDynamicToolPermission,
  onDynamicToolDenied,
}: EmitCodexAcpUiStreamInput): Promise<void> {
  const reader = uiStream.getReader()
  let pendingFinishChunk: any | null = null

  while (true) {
    const readResult = await readChunk(reader, abortSignal)
    if ("aborted" in readResult) {
      cancelReaderQuietly(reader, "Session cancelled.")
      pendingFinishChunk = { type: "finish", finishReason: "stop" }
      break
    }

    const { done, value } = readResult
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

    const dynamicTool = getDynamicToolFromStreamChunk(value)
    if (dynamicTool && onDynamicToolPermission) {
      emit(value)

      let permissionDecision: CodexAcpToolPermissionDecision
      try {
        permissionDecision = await onDynamicToolPermission(dynamicTool)
      } catch (error) {
        const normalized = normalizeError(error)
        emit({ type: "error", errorText: normalized.message })
        cancelReaderQuietly(reader, normalized.message)
        pendingFinishChunk = { type: "finish", finishReason: "error" }
        break
      }

      if (permissionDecision.decision === "deny") {
        const message =
          permissionDecision.message ||
          `Codex ACP blocked ${dynamicTool.toolName} before execution.`
        onDynamicToolDenied?.(dynamicTool, permissionDecision)
        emit({
          type: "tool-output-error",
          toolCallId: dynamicTool.toolUseId,
          errorText: message,
        })
        emit({ type: "error", errorText: message })
        cancelReaderQuietly(reader, message)
        pendingFinishChunk = { type: "finish", finishReason: "error" }
        break
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

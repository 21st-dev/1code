import { eq } from "drizzle-orm"
import { subChats } from "../db/schema"
import { flushClaudeAgentSdkTextAccumulator } from "./agent-sdk-chunk-processor"
import { classifyClaudeAgentSdkStreamError } from "./agent-sdk-errors"
import {
  finalizeClaudeAgentSdkGuardMetadata,
  type FinalizeClaudeAgentSdkGuardMetadataInput,
} from "./agent-sdk-guard-metadata"
import { persistClaudeAgentSdkAssistantResponse } from "./agent-sdk-message-persistence"
import { logClaudeOllamaStreamError } from "./agent-sdk-ollama-diagnostics"
import type { UIMessageChunk } from "./types"

export type FinalizeClaudeAgentSdkStreamErrorInput = {
  streamError: unknown
  stderrLines: string[]
  isUsingOllama: boolean
  messageCount: number
  db: any
  chatId: string
  subChatId: string
  messagesToSave: any[]
  parts: Array<Record<string, any>>
  metadata: any
  currentText: string
  historyEnabled: boolean
  cwd: string
  mode: string
  aborted: boolean
  guardedContract: FinalizeClaudeAgentSdkGuardMetadataInput["guardedContract"]
  guardedPreRunStatus: FinalizeClaudeAgentSdkGuardMetadataInput["guardedPreRunStatus"]
  guardEvents: FinalizeClaudeAgentSdkGuardMetadataInput["guardEvents"]
  guardedRunStartedAt: string
  subId: string
  chunkCount: number
  lastChunkType: string
  emit: (chunk: UIMessageChunk) => void
  complete: () => void
  getContract: FinalizeClaudeAgentSdkGuardMetadataInput["getContract"]
  deleteContract: FinalizeClaudeAgentSdkGuardMetadataInput["deleteContract"]
  log?: (...args: any[]) => void
}

export type FinalizeClaudeAgentSdkStreamErrorResult = {
  status: "failed"
  currentText: string
  metadata: any
  error: {
    message: string
    code: string
  }
}

export async function finalizeClaudeAgentSdkStreamError({
  streamError,
  stderrLines,
  isUsingOllama,
  messageCount,
  db,
  chatId,
  subChatId,
  messagesToSave,
  parts,
  metadata,
  currentText,
  historyEnabled,
  cwd,
  mode,
  aborted,
  guardedContract,
  guardedPreRunStatus,
  guardEvents,
  guardedRunStartedAt,
  subId,
  chunkCount,
  lastChunkType,
  emit,
  complete,
  getContract,
  deleteContract,
  log = console.log,
}: FinalizeClaudeAgentSdkStreamErrorInput): Promise<FinalizeClaudeAgentSdkStreamErrorResult> {
  const err = streamError as Error
  const stderrOutput = stderrLines.join("\n")

  if (isUsingOllama) {
    logClaudeOllamaStreamError({
      error: err,
      messageCount,
      stderrOutput,
    })
  }

  const streamDiagnostic = classifyClaudeAgentSdkStreamError({
    error: err,
    stderrOutput,
  })
  const errorContext = streamDiagnostic.context
  const errorCategory = streamDiagnostic.category

  if (streamDiagnostic.isSessionNotFound) {
    log("[claude] Session not found - clearing invalid sessionId from database")
    db.update(subChats)
      .set({ sessionId: null })
      .where(eq(subChats.id, subChatId))
      .run()
  }

  if (!aborted) {
    emit({
      type: "error",
      errorText: stderrOutput
        ? `${errorContext}: ${err.message}\n\nProcess output:\n${stderrOutput}`
        : `${errorContext}: ${err.message}`,
      debugInfo: {
        context: errorContext,
        category: errorCategory,
        cwd,
        mode,
        stderr: stderrOutput || "(no stderr captured)",
      },
    } as UIMessageChunk)
  }

  log(`[SD] M:CATCH_SAVE sub=${subId} aborted=${aborted} parts=${parts.length}`)
  const flushedCurrentText = flushClaudeAgentSdkTextAccumulator({
    currentText,
    parts,
  })
  const finalizedMetadata = await finalizeClaudeAgentSdkGuardMetadata({
    currentMetadata: metadata,
    guardedContract,
    guardedPreRunStatus,
    runtimeCwd: cwd,
    guardEvents,
    startedAt: guardedRunStartedAt,
    options: {
      failed: !aborted,
      stopped: aborted,
    },
    emit,
    getContract,
    deleteContract,
  })
  await persistClaudeAgentSdkAssistantResponse({
    db,
    chatId,
    subChatId,
    messagesToSave,
    parts,
    metadata: finalizedMetadata,
    historyEnabled,
    cwd,
    clearStreamWhenEmpty: false,
    touchChatWhenEmpty: false,
  })

  log(
    `[SD] M:END sub=${subId} reason=stream_error cat=${errorCategory} n=${chunkCount} last=${lastChunkType}`,
  )
  emit({ type: "finish" })
  complete()

  return {
    status: "failed",
    currentText: flushedCurrentText,
    metadata: finalizedMetadata,
    error: {
      message: errorContext,
      code: errorCategory,
    },
  }
}

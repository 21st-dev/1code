import type { UIMessageChunk } from "./types"
import type { ClaudeAgentSdkStreamConsumerMutableState } from "./agent-sdk-stream-consumer"
import {
  startActiveClaudeSessionForDesktopRun,
} from "./active-sessions"
import {
  createClaudeAgentSdkDesktopRunState,
  type ClaudeAgentSdkDesktopRunState,
} from "./agent-sdk-desktop-run-state"
import { createClaudeAgentSdkRuntimeErrorHandlers } from "./agent-sdk-runtime-errors"
import {
  createClaudeAgentSdkRuntimeStreamState,
} from "./agent-sdk-runtime-state"
import {
  createRuntimeRendererChunkEmitter,
} from "../agent-runtime/stream-event-mapper"
import type { DesktopRunPreflightBlocker } from "../agent-runtime/preflight"

export type ClaudeAgentSdkDesktopRunEnvelope = {
  abortController: AbortController
  streamId: string
  activeRunId: string
  subId: string
  streamStart: number
  streamState: ClaudeAgentSdkStreamConsumerMutableState
  desktopRunState: ClaudeAgentSdkDesktopRunState
  emit: (chunk: UIMessageChunk) => boolean
  complete: () => void
  emitError: (error: unknown, context: string) => void
  emitPreflightBlocker: (blocker: DesktopRunPreflightBlocker) => void
}

export function createClaudeAgentSdkDesktopRunEnvelope(input: {
  subChatId: string
  requestedRunId?: string | null
  cwd: string
  mode: "plan" | "agent"
  emitNext: (chunk: UIMessageChunk) => void
  emitComplete: () => void
  createId?: () => string
  nowMs?: () => number
  log?: (...args: any[]) => void
}): ClaudeAgentSdkDesktopRunEnvelope {
  const activeSessionStartup = startActiveClaudeSessionForDesktopRun({
    subChatId: input.subChatId,
    requestedRunId: input.requestedRunId,
    createId: input.createId,
  })
  const streamState = createClaudeAgentSdkRuntimeStreamState()
  const desktopRunState = createClaudeAgentSdkDesktopRunState()
  const subId = input.subChatId.slice(-8)
  const streamStart = input.nowMs?.() ?? Date.now()
  const log = input.log ?? console.log
  log(
    `[SD] M:START sub=${subId} stream=${activeSessionStartup.streamId.slice(-8)} mode=${input.mode}`,
  )

  const emitRuntimeChunk = createRuntimeRendererChunkEmitter({
    runtimeId: "claude-code",
    runId: activeSessionStartup.runId,
    getJobId: desktopRunState.getJobId,
    getDb: desktopRunState.getDb,
    getMapper: desktopRunState.getStreamEventMapper,
    isActive: desktopRunState.isObservableActive,
    markInactive: desktopRunState.markInactive,
    markFailed: desktopRunState.markFailed,
    emitNext: (chunk) => {
      input.emitNext(chunk as UIMessageChunk)
    },
    warningLabel: "[claude]",
  })

  const complete = () => {
    try {
      input.emitComplete()
    } catch {
      // Already completed or closed.
    }
  }

  const { emitError, emitPreflightBlocker } =
    createClaudeAgentSdkRuntimeErrorHandlers({
      cwd: input.cwd,
      mode: input.mode,
      emit: (chunk) => emitRuntimeChunk(chunk),
      complete,
    })

  return {
    abortController: activeSessionStartup.controller,
    streamId: activeSessionStartup.streamId,
    activeRunId: activeSessionStartup.runId,
    subId,
    streamStart,
    streamState,
    desktopRunState,
    emit: (chunk) => emitRuntimeChunk(chunk),
    complete,
    emitError,
    emitPreflightBlocker,
  }
}

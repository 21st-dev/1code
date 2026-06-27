import {
  createAgentRuntimeRunId,
  createUnsupportedAgentRuntimeControlResult,
} from "./runtime-run-ledger"
import type {
  AgentRuntimeControlResult,
  AgentRuntimeRunAction,
  AgentRuntimeSessionRef,
  AgentRuntimeStopRequest,
  AgentRuntimeToolResultRequest,
} from "./types"

export type AgentRuntimeProcessState = "running" | "stopping"

export type AgentRuntimeToolResultSink = (
  request: AgentRuntimeToolResultRequest,
) => AgentRuntimeControlResult | Promise<AgentRuntimeControlResult>

export type AgentRuntimeStopSink = (
  request: AgentRuntimeStopRequest,
) => void | Promise<void>

export interface AgentRuntimeProcessHandle {
  runId: string
  action: AgentRuntimeRunAction
  session: AgentRuntimeSessionRef
  abortController: AbortController
  state: AgentRuntimeProcessState
  createdAt: string
  updatedAt: string
  stopReason?: string
  submitToolResult?: AgentRuntimeToolResultSink
  onStop?: AgentRuntimeStopSink
}

const processHandles = new Map<string, AgentRuntimeProcessHandle>()

export function createAgentRuntimeProcessHandle(params: {
  action: AgentRuntimeRunAction
  session: AgentRuntimeSessionRef
  runId?: string
  now?: Date | string
  submitToolResult?: AgentRuntimeToolResultSink
  onStop?: AgentRuntimeStopSink
}): AgentRuntimeProcessHandle {
  const createdAt = isoString(params.now)
  return {
    runId:
      params.runId ??
      createAgentRuntimeRunId(params.session, params.action, Date.parse(createdAt)),
    action: params.action,
    session: params.session,
    abortController: new AbortController(),
    state: "running",
    createdAt,
    updatedAt: createdAt,
    submitToolResult: params.submitToolResult,
    onStop: params.onStop,
  }
}

export function registerAgentRuntimeProcessHandle(
  handle: AgentRuntimeProcessHandle,
): AgentRuntimeProcessHandle {
  processHandles.set(handle.runId, handle)
  return handle
}

export function getAgentRuntimeProcessHandle(
  runId: string,
): AgentRuntimeProcessHandle | null {
  return processHandles.get(runId) ?? null
}

export function unregisterAgentRuntimeProcessHandle(
  runId: string,
): AgentRuntimeProcessHandle | null {
  const handle = getAgentRuntimeProcessHandle(runId)
  if (!handle) return null
  processHandles.delete(runId)
  return handle
}

export function stopAgentRuntimeProcess(
  request: AgentRuntimeStopRequest,
): AgentRuntimeControlResult {
  const handle = getAgentRuntimeProcessHandle(request.runId)
  if (!handle) {
    return {
      ...createUnsupportedAgentRuntimeControlResult(
        request,
        "No active runtime process is registered for this run id.",
      ),
      status: "not-found",
    }
  }

  if (handle.session.engineId !== request.session.engineId) {
    return {
      runId: request.runId,
      status: "error",
      message: `Run ${request.runId} belongs to ${handle.session.engineId}, not ${request.session.engineId}.`,
      updatedAt: new Date().toISOString(),
    }
  }

  const updatedAt = new Date().toISOString()
  handle.state = "stopping"
  handle.updatedAt = updatedAt
  handle.stopReason = request.reason
  try {
    const stopResult = handle.onStop?.(request)
    if (stopResult) {
      void Promise.resolve(stopResult).catch(() => undefined)
    }
  } catch {
    // Stop is best-effort. The abort signal below remains the authoritative local stop.
  }
  if (!handle.abortController.signal.aborted) {
    handle.abortController.abort(request.reason ?? "Runtime stop requested.")
  }

  return {
    runId: request.runId,
    status: "accepted",
    message: "Runtime stop signal accepted.",
    updatedAt,
    metadata: {
      engineId: handle.session.engineId,
      subChatId: handle.session.subChatId,
      state: handle.state,
      reason: request.reason ?? null,
    },
  }
}

export async function submitAgentRuntimeToolResult(
  request: AgentRuntimeToolResultRequest,
): Promise<AgentRuntimeControlResult> {
  const handle = getAgentRuntimeProcessHandle(request.runId)
  if (!handle) {
    return {
      ...createUnsupportedAgentRuntimeControlResult(
        request,
        "No active runtime process is registered for this run id.",
      ),
      status: "not-found",
    }
  }

  if (handle.session.engineId !== request.session.engineId) {
    return {
      runId: request.runId,
      status: "error",
      message: `Run ${request.runId} belongs to ${handle.session.engineId}, not ${request.session.engineId}.`,
      updatedAt: new Date().toISOString(),
    }
  }

  if (!handle.submitToolResult) {
    return createUnsupportedAgentRuntimeControlResult(
      request,
      "Active runtime process does not accept out-of-band tool result submission.",
    )
  }

  try {
    const result = await handle.submitToolResult(request)
    handle.updatedAt = result.updatedAt
    return result
  } catch (error) {
    const updatedAt = new Date().toISOString()
    handle.updatedAt = updatedAt
    return {
      runId: request.runId,
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      updatedAt,
    }
  }
}

export function listAgentRuntimeProcessHandles(): AgentRuntimeProcessHandle[] {
  return [...processHandles.values()].sort((left, right) =>
    left.runId.localeCompare(right.runId),
  )
}

export function clearAgentRuntimeProcessHandlesForTests(): void {
  processHandles.clear()
}

function isoString(value: Date | string | undefined): string {
  if (!value) return new Date().toISOString()
  return typeof value === "string" ? value : value.toISOString()
}

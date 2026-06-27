import type {
  AgentRuntimeControlResult,
  AgentRuntimeRunAction,
  AgentRuntimeRunReceipt,
  AgentRuntimeRunStatus,
  AgentRuntimeSessionRef,
  AgentRuntimeStartRequest,
  AgentRuntimeStopRequest,
  AgentRuntimeStreamEvent,
  AgentRuntimeToolResultRequest,
} from "./types"

export type AgentRuntimeLedgerEventKind =
  | "run-started"
  | "stream-event"
  | "tool-result-submitted"
  | "run-stopped"
  | "run-finished"

export interface AgentRuntimeLedgerEvent {
  id: string
  runId: string
  engineId: AgentRuntimeSessionRef["engineId"]
  kind: AgentRuntimeLedgerEventKind
  sequence: number
  createdAt: string
  commandId?: string | null
  causationEventId?: string | null
  correlationId?: string | null
  metadata?: Record<string, unknown>
  payload?: Record<string, unknown>
}

export type AgentRuntimeCommandReceiptStatus = "accepted" | "rejected"

export interface AgentRuntimeCommandReceipt {
  commandId: string
  runId: string
  engineId: AgentRuntimeSessionRef["engineId"]
  acceptedAt: string
  resultSequence: number
  status: AgentRuntimeCommandReceiptStatus
  error?: string | null
}

export type AgentRuntimeLedgerAppendEvent = Omit<
  AgentRuntimeLedgerEvent,
  "id" | "createdAt" | "sequence"
> &
  Partial<Pick<AgentRuntimeLedgerEvent, "id" | "createdAt" | "sequence">>

export interface AgentRuntimeRunLedgerSnapshot {
  runId: string
  receipt: AgentRuntimeRunReceipt
  events: AgentRuntimeLedgerEvent[]
}

export interface AgentRuntimeRunReplayOptions {
  fromSequenceExclusive?: number
  limit?: number
}

export interface AgentRuntimeRunProjection {
  runId: string
  engineId: AgentRuntimeSessionRef["engineId"]
  status: AgentRuntimeRunStatus
  resultSubtype: AgentRuntimeRunReceipt["resultSubtype"]
  startedAt: string
  updatedAt: string
  completedAt?: string | null
  nativeSessionId?: string | null
  eventCount: number
  eventKinds: Partial<Record<AgentRuntimeLedgerEventKind, number>>
  latestEventSequence?: number
  latestEventKind?: AgentRuntimeLedgerEventKind
  latestEventAt?: string
  commandIds: string[]
  correlationIds: string[]
  causationEventIds: string[]
  errors: string[]
}

export interface AgentRuntimeRunLedger {
  upsertReceipt(receipt: AgentRuntimeRunReceipt): AgentRuntimeRunReceipt
  upsertCommandReceipt(
    receipt: AgentRuntimeCommandReceipt,
  ): AgentRuntimeCommandReceipt
  getCommandReceipt(commandId: string): AgentRuntimeCommandReceipt | null
  listCommandReceipts(): AgentRuntimeCommandReceipt[]
  appendEvent(event: AgentRuntimeLedgerAppendEvent): AgentRuntimeLedgerEvent
  finishRun(params: {
    runId: string
    status: Exclude<AgentRuntimeRunStatus, "running">
    resultSubtype?: AgentRuntimeRunReceipt["resultSubtype"]
    commandId?: string | null
    causationEventId?: string | null
    correlationId?: string | null
    error?: string
    metadata?: Record<string, unknown>
  }): AgentRuntimeRunReceipt | null
  snapshot(runId: string): AgentRuntimeRunLedgerSnapshot | null
  replayEvents(
    runId: string,
    options?: AgentRuntimeRunReplayOptions,
  ): AgentRuntimeLedgerEvent[] | null
  list(): AgentRuntimeRunLedgerSnapshot[]
}

export function createAgentRuntimeRunId(
  session: Pick<AgentRuntimeSessionRef, "engineId" | "subChatId">,
  action: AgentRuntimeRunAction,
  now = Date.now(),
): string {
  return `${session.engineId}:${session.subChatId}:${action}:${now}`
}

export function createAgentRuntimeRunReceipt(params: {
  runId?: string
  action: AgentRuntimeRunAction
  session: AgentRuntimeSessionRef
  status?: AgentRuntimeRunStatus
  nativeSessionId?: string | null
  resultSubtype?: AgentRuntimeRunReceipt["resultSubtype"]
  now?: Date | string
  completedAt?: Date | string | null
  error?: string
  metadata?: Record<string, unknown>
}): AgentRuntimeRunReceipt {
  const now = isoString(params.now)
  return {
    version: 1,
    runId: params.runId ?? createAgentRuntimeRunId(params.session, params.action),
    action: params.action,
    engineId: params.session.engineId,
    subChatId: params.session.subChatId,
    chatId: params.session.chatId,
    status: params.status ?? "running",
    nativeSessionId: params.nativeSessionId ?? params.session.nativeSessionId ?? null,
    resultSubtype: params.resultSubtype ?? null,
    startedAt: now,
    updatedAt: now,
    completedAt: params.completedAt === undefined
      ? null
      : params.completedAt === null
        ? null
        : isoString(params.completedAt),
    ...(params.error ? { error: params.error } : {}),
    ...(params.metadata ? { metadata: params.metadata } : {}),
  }
}

export function createUnsupportedAgentRuntimeReceipt(params: {
  action: AgentRuntimeRunAction
  request: AgentRuntimeStartRequest
  reason: string
  metadata?: Record<string, unknown>
}): AgentRuntimeRunReceipt {
  const now = new Date()
  return createAgentRuntimeRunReceipt({
    runId: params.request.runId,
    action: params.action,
    session: params.request.session,
    status: "unsupported",
    resultSubtype: "error",
    now,
    completedAt: now,
    error: params.reason,
    metadata: params.metadata,
  })
}

export function createUnsupportedAgentRuntimeControlResult(
  request: AgentRuntimeStopRequest | AgentRuntimeToolResultRequest,
  message: string,
): AgentRuntimeControlResult {
  return {
    runId: request.runId,
    status: "unsupported",
    message,
    updatedAt: new Date().toISOString(),
  }
}

export async function* streamUnsupportedAgentRuntimeRun(
  receipt: AgentRuntimeRunReceipt,
): AsyncIterable<AgentRuntimeStreamEvent> {
  yield {
    type: "error",
    message: receipt.error ?? "This runtime does not support streamed execution.",
  }
  yield {
    type: "finish",
    nativeSessionId: receipt.nativeSessionId,
    resultSubtype: "error",
  }
}

export function createInMemoryAgentRuntimeRunLedger(): AgentRuntimeRunLedger {
  const receipts = new Map<string, AgentRuntimeRunReceipt>()
  const events = new Map<string, AgentRuntimeLedgerEvent[]>()
  const commandReceipts = new Map<string, AgentRuntimeCommandReceipt>()

  return {
    upsertReceipt(receipt) {
      receipts.set(receipt.runId, receipt)
      if (!events.has(receipt.runId)) events.set(receipt.runId, [])
      return receipt
    },
    upsertCommandReceipt(receipt) {
      commandReceipts.set(receipt.commandId, receipt)
      return receipt
    },
    getCommandReceipt(commandId) {
      return commandReceipts.get(commandId) ?? null
    },
    listCommandReceipts() {
      return [...commandReceipts.values()].sort((left, right) =>
        left.commandId.localeCompare(right.commandId),
      )
    },
    appendEvent(event) {
      const sequence = event.sequence ?? ((events.get(event.runId)?.length ?? 0) + 1)
      const entry = {
        ...event,
        sequence,
        id: event.id ?? `${event.runId}:${event.kind}:${sequence}`,
        createdAt: event.createdAt ?? new Date().toISOString(),
      }
      const current = events.get(event.runId) ?? []
      current.push(entry)
      events.set(event.runId, current)
      return entry
    },
    finishRun(params) {
      const receipt = receipts.get(params.runId)
      if (!receipt) return null
      const now = new Date().toISOString()
      const updated = {
        ...receipt,
        status: params.status,
        resultSubtype: params.resultSubtype ?? receipt.resultSubtype,
        updatedAt: now,
        completedAt: now,
        ...(params.error ? { error: params.error } : {}),
        metadata: {
          ...(receipt.metadata ?? {}),
          ...(params.metadata ?? {}),
        },
      }
      receipts.set(params.runId, updated)
      const finishedEvent = this.appendEvent({
        runId: params.runId,
        engineId: receipt.engineId,
        kind: "run-finished",
        commandId: params.commandId,
        causationEventId: params.causationEventId,
        correlationId: params.correlationId,
        payload: {
          status: updated.status,
          resultSubtype: updated.resultSubtype,
          error: updated.error,
        },
      })
      if (params.commandId) {
        this.upsertCommandReceipt({
          commandId: params.commandId,
          runId: params.runId,
          engineId: receipt.engineId,
          acceptedAt: finishedEvent.createdAt,
          resultSequence: finishedEvent.sequence,
          status: "accepted",
          error: updated.error ?? null,
        })
      }
      return updated
    },
    snapshot(runId) {
      const receipt = receipts.get(runId)
      if (!receipt) return null
      return {
        runId,
        receipt,
        events: [...(events.get(runId) ?? [])],
      }
    },
    replayEvents(runId, options) {
      const snapshot = this.snapshot(runId)
      if (!snapshot) return null
      return replayAgentRuntimeRunLedgerEvents(snapshot, options)
    },
    list() {
      return [...receipts.keys()]
        .sort()
        .map((runId) => this.snapshot(runId))
        .filter(Boolean) as AgentRuntimeRunLedgerSnapshot[]
    },
  }
}

export function orderAgentRuntimeLedgerEvents(
  events: ReadonlyArray<AgentRuntimeLedgerEvent>,
): AgentRuntimeLedgerEvent[] {
  return [...events].sort((left, right) => {
    if (left.sequence !== right.sequence) return left.sequence - right.sequence
    const createdAt = left.createdAt.localeCompare(right.createdAt)
    if (createdAt !== 0) return createdAt
    return left.id.localeCompare(right.id)
  })
}

export function replayAgentRuntimeRunLedgerEvents(
  snapshot: AgentRuntimeRunLedgerSnapshot,
  options: AgentRuntimeRunReplayOptions = {},
): AgentRuntimeLedgerEvent[] {
  const fromSequenceExclusive = options.fromSequenceExclusive ?? 0
  const events = orderAgentRuntimeLedgerEvents(snapshot.events).filter(
    (event) => event.sequence > fromSequenceExclusive,
  )
  if (options.limit === undefined) return events
  return events.slice(0, Math.max(0, options.limit))
}

export function projectAgentRuntimeRunLedgerSnapshot(
  snapshot: AgentRuntimeRunLedgerSnapshot,
): AgentRuntimeRunProjection {
  const orderedEvents = replayAgentRuntimeRunLedgerEvents(snapshot)
  const eventKinds: Partial<Record<AgentRuntimeLedgerEventKind, number>> = {}
  const commandIds = new Set<string>()
  const correlationIds = new Set<string>()
  const causationEventIds = new Set<string>()
  const errors: string[] = []
  let status = snapshot.receipt.status
  let resultSubtype = snapshot.receipt.resultSubtype
  let updatedAt = snapshot.receipt.updatedAt
  let completedAt = snapshot.receipt.completedAt
  let nativeSessionId = snapshot.receipt.nativeSessionId

  for (const event of orderedEvents) {
    eventKinds[event.kind] = (eventKinds[event.kind] ?? 0) + 1
    if (event.commandId) commandIds.add(event.commandId)
    if (event.correlationId) correlationIds.add(event.correlationId)
    if (event.causationEventId) causationEventIds.add(event.causationEventId)
    updatedAt = event.createdAt

    const eventNativeSessionId = readString(event.payload?.nativeSessionId)
    if (eventNativeSessionId) nativeSessionId = eventNativeSessionId

    if (event.kind === "stream-event" && event.payload?.type === "error") {
      const message = readString(event.payload.message)
      if (message) errors.push(message)
    }

    if (event.kind === "run-finished") {
      const finishedStatus = readRunStatus(event.payload?.status)
      const finishedSubtype = readRunResultSubtype(event.payload?.resultSubtype)
      status = finishedStatus ?? status
      resultSubtype = finishedSubtype ?? resultSubtype
      completedAt = event.createdAt
      const error = readString(event.payload?.error)
      if (error) errors.push(error)
    }
  }

  const latestEvent = orderedEvents.at(-1)

  return {
    runId: snapshot.runId,
    engineId: snapshot.receipt.engineId,
    status,
    resultSubtype,
    startedAt: snapshot.receipt.startedAt,
    updatedAt,
    completedAt,
    nativeSessionId,
    eventCount: orderedEvents.length,
    eventKinds,
    ...(latestEvent
      ? {
          latestEventSequence: latestEvent.sequence,
          latestEventKind: latestEvent.kind,
          latestEventAt: latestEvent.createdAt,
        }
      : {}),
    commandIds: [...commandIds],
    correlationIds: [...correlationIds],
    causationEventIds: [...causationEventIds],
    errors,
  }
}

export function projectAgentRuntimeRunLedgerSnapshots(
  snapshots: ReadonlyArray<AgentRuntimeRunLedgerSnapshot>,
): AgentRuntimeRunProjection[] {
  return snapshots.map(projectAgentRuntimeRunLedgerSnapshot)
}

function isoString(value: Date | string | undefined): string {
  if (!value) return new Date().toISOString()
  return typeof value === "string" ? value : value.toISOString()
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

function readRunStatus(value: unknown): AgentRuntimeRunStatus | null {
  return value === "running" ||
    value === "success" ||
    value === "error" ||
    value === "cancelled" ||
    value === "unsupported"
    ? value
    : null
}

function readRunResultSubtype(
  value: unknown,
): AgentRuntimeRunReceipt["resultSubtype"] | null {
  return value === "success" || value === "error" || value === "cancelled"
    ? value
    : null
}

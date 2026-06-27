import type { AgentRuntimeThreadReadResult } from "./types"

export type NativeThreadConsistencyStatus =
  | "consistent"
  | "diverged"
  | "unknown"

export interface NativeThreadReadSummary {
  status: AgentRuntimeThreadReadResult["status"]
  threadId: string | null
  includeTurns: boolean
  turnCount?: number
  firstTurnId?: string
  lastTurnId?: string
  turnIds?: string[]
  turnIdsTruncated?: boolean
  itemCount?: number
  checkpointCount?: number
  readyCheckpointCount?: number
  checkpoints?: NativeThreadCheckpointSummary[]
  checkpointsTruncated?: boolean
  latestReadyCheckpoint?: NativeThreadCheckpointSummary
  localUserTurnCount?: number
  consistencyStatus?: NativeThreadConsistencyStatus
  consistencyReason?: string
  message?: string
  updatedAt: string
  bridge?: string
  method?: string
}

export type NativeThreadCheckpointStatus = "ready" | "missing" | "error"

export interface NativeThreadCheckpointFileSummary {
  path: string
  kind?: string
  additions: number
  deletions: number
}

export interface NativeThreadCheckpointSummary {
  turnId: string
  checkpointTurnCount: number
  checkpointRef: string
  status: NativeThreadCheckpointStatus
  fileCount: number
  additions: number
  deletions: number
  assistantMessageId?: string | null
  completedAt?: string
  files?: NativeThreadCheckpointFileSummary[]
  filesTruncated?: boolean
}

const DEFAULT_MAX_TURN_IDS = 64
const DEFAULT_MAX_CHECKPOINTS = 64
const DEFAULT_MAX_CHECKPOINT_FILES = 24

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function readRecord(value: unknown, key: string): Record<string, unknown> | null {
  if (!isRecord(value)) return null
  const nested = value[key]
  return isRecord(nested) ? nested : null
}

function readArray(value: unknown, key: string): unknown[] | null {
  if (!isRecord(value)) return null
  const nested = value[key]
  return Array.isArray(nested) ? nested : null
}

function readStringArray(value: unknown, key: string): string[] | undefined {
  if (!isRecord(value)) return undefined
  const nested = value[key]
  if (!Array.isArray(nested)) return undefined
  return nested.filter((entry): entry is string => typeof entry === "string")
}

function readNativeThreadCheckpointStatus(
  value: unknown,
): NativeThreadCheckpointStatus | undefined {
  if (value === "ready" || value === "missing" || value === "error") {
    return value
  }
  return undefined
}

function readNonNegativeNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined
  }
  return value
}

function parseMessageArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value !== "string") return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function countLocalTranscriptUserTurns(messages: unknown): number {
  return parseMessageArray(messages).filter(
    (message) => isRecord(message) && message.role === "user",
  ).length
}

function readTurnId(turn: unknown): string | undefined {
  if (!isRecord(turn)) return undefined
  return cleanString(turn.id) ?? cleanString(turn.turnId)
}

function compactSummary<T extends Record<string, unknown>>(summary: T): T {
  return Object.fromEntries(
    Object.entries(summary).filter(([, value]) => value !== undefined),
  ) as T
}

function summarizeNativeCheckpointFile(
  file: unknown,
): NativeThreadCheckpointFileSummary | null {
  if (!isRecord(file)) return null
  const path = cleanString(file.path)
  if (!path) return null
  const kind = cleanString(file.kind)
  return compactSummary({
    path,
    ...(kind ? { kind } : {}),
    additions: readNonNegativeNumber(file.additions) ?? 0,
    deletions: readNonNegativeNumber(file.deletions) ?? 0,
  })
}

function readCheckpointTurnCount(checkpoint: Record<string, unknown>): number | undefined {
  return (
    readNonNegativeNumber(checkpoint.checkpointTurnCount) ??
    readNonNegativeNumber(checkpoint.turnCount)
  )
}

function checkpointOrder(
  left: NativeThreadCheckpointSummary,
  right: NativeThreadCheckpointSummary,
): number {
  return left.checkpointTurnCount - right.checkpointTurnCount
}

function summarizeNativeCheckpoint(
  checkpoint: unknown,
  options: { maxCheckpointFiles: number },
): NativeThreadCheckpointSummary | null {
  if (!isRecord(checkpoint)) return null
  const turnId = cleanString(checkpoint.turnId) ?? cleanString(checkpoint.id)
  const checkpointTurnCount = readCheckpointTurnCount(checkpoint)
  const checkpointRef = cleanString(checkpoint.checkpointRef)
  const status = readNativeThreadCheckpointStatus(checkpoint.status)
  if (!turnId || checkpointTurnCount === undefined || !checkpointRef || !status) {
    return null
  }

  const rawFiles: unknown[] = Array.isArray(checkpoint.files)
    ? checkpoint.files
    : []
  const hasRawFiles = Array.isArray(checkpoint.files)
  const allFiles = rawFiles
    .map(summarizeNativeCheckpointFile)
    .filter((file): file is NativeThreadCheckpointFileSummary => Boolean(file))
  const files = allFiles.slice(0, Math.max(0, options.maxCheckpointFiles))
  const fileCount = hasRawFiles
    ? allFiles.length
    : readNonNegativeNumber(checkpoint.fileCount) ?? allFiles.length
  const additions = hasRawFiles
    ? allFiles.reduce((sum, file) => sum + file.additions, 0)
    : readNonNegativeNumber(checkpoint.additions) ?? 0
  const deletions = hasRawFiles
    ? allFiles.reduce((sum, file) => sum + file.deletions, 0)
    : readNonNegativeNumber(checkpoint.deletions) ?? 0
  const assistantMessageId = cleanString(checkpoint.assistantMessageId)
  const completedAt = cleanString(checkpoint.completedAt)

  return compactSummary({
    turnId,
    checkpointTurnCount,
    checkpointRef,
    status,
    fileCount,
    additions,
    deletions,
    ...(assistantMessageId
      ? { assistantMessageId }
      : checkpoint.assistantMessageId === null
        ? { assistantMessageId: null }
        : {}),
    ...(completedAt ? { completedAt } : {}),
    ...(files.length > 0 ? { files } : {}),
    ...(allFiles.length > files.length ? { filesTruncated: true } : {}),
  })
}

function summarizeNativeCheckpoints(
  payload: unknown,
  options: { maxCheckpoints: number; maxCheckpointFiles: number },
): Pick<
  NativeThreadReadSummary,
  | "checkpointCount"
  | "readyCheckpointCount"
  | "checkpoints"
  | "checkpointsTruncated"
  | "latestReadyCheckpoint"
> {
  const root = isRecord(payload) ? payload : {}
  const thread = readRecord(root, "thread") ?? root
  const rawCheckpoints =
    readArray(thread, "checkpoints") ?? readArray(root, "checkpoints")
  if (!rawCheckpoints) return {}

  const allCheckpoints = rawCheckpoints
    .map((checkpoint) =>
      summarizeNativeCheckpoint(checkpoint, {
        maxCheckpointFiles: options.maxCheckpointFiles,
      }),
    )
    .filter((checkpoint): checkpoint is NativeThreadCheckpointSummary =>
      Boolean(checkpoint),
    )
    .sort(checkpointOrder)
  const readyCheckpoints = allCheckpoints.filter(
    (checkpoint) => checkpoint.status === "ready",
  )
  const maxCheckpoints = Math.max(0, options.maxCheckpoints)
  const retainedCheckpoints =
    maxCheckpoints === 0
      ? []
      : allCheckpoints.slice(Math.max(0, allCheckpoints.length - maxCheckpoints))

  return compactSummary({
    checkpointCount: allCheckpoints.length,
    readyCheckpointCount: readyCheckpoints.length,
    ...(retainedCheckpoints.length > 0 ? { checkpoints: retainedCheckpoints } : {}),
    ...(allCheckpoints.length > retainedCheckpoints.length
      ? { checkpointsTruncated: true }
      : {}),
    ...(readyCheckpoints.at(-1)
      ? { latestReadyCheckpoint: readyCheckpoints.at(-1) }
      : {}),
  })
}

function readNativeCheckpointSummary(
  value: unknown,
): NativeThreadCheckpointSummary | null {
  return summarizeNativeCheckpoint(value, {
    maxCheckpointFiles: DEFAULT_MAX_CHECKPOINT_FILES,
  })
}

function readNativeCheckpointSummaries(value: unknown): NativeThreadCheckpointSummary[] {
  if (!Array.isArray(value)) return []
  return value
    .map(readNativeCheckpointSummary)
    .filter((checkpoint): checkpoint is NativeThreadCheckpointSummary =>
      Boolean(checkpoint),
    )
}

function resolveConsistency(params: {
  status: AgentRuntimeThreadReadResult["status"]
  turnCount?: number
  localUserTurnCount?: number
}): {
  consistencyStatus?: NativeThreadConsistencyStatus
  consistencyReason?: string
} {
  if (params.status !== "success") {
    return {
      consistencyStatus: "unknown",
      consistencyReason: "Native thread read did not succeed.",
    }
  }
  if (params.turnCount === undefined) {
    return {
      consistencyStatus: "unknown",
      consistencyReason: "Native thread read did not include turn history.",
    }
  }
  if (params.localUserTurnCount === undefined) {
    return {
      consistencyStatus: "unknown",
      consistencyReason: "Local transcript turn count was not provided.",
    }
  }
  if (params.turnCount === params.localUserTurnCount) {
    return {
      consistencyStatus: "consistent",
      consistencyReason: "Native turns match local user turns.",
    }
  }
  return {
    consistencyStatus: "diverged",
    consistencyReason: `Native turns (${params.turnCount}) differ from local user turns (${params.localUserTurnCount}).`,
  }
}

export function summarizeNativeThreadPayload(
  payload: unknown,
  options: {
    maxTurnIds?: number
    maxCheckpoints?: number
    maxCheckpointFiles?: number
  } = {},
): {
  threadId: string | null
  turnCount?: number
  firstTurnId?: string
  lastTurnId?: string
  turnIds?: string[]
  turnIdsTruncated?: boolean
  itemCount?: number
  checkpointCount?: number
  readyCheckpointCount?: number
  checkpoints?: NativeThreadCheckpointSummary[]
  checkpointsTruncated?: boolean
  latestReadyCheckpoint?: NativeThreadCheckpointSummary
} {
  const root = isRecord(payload) ? payload : {}
  const thread = readRecord(root, "thread") ?? root
  const turns = readArray(thread, "turns") ?? readArray(root, "turns")
  const rootItems = readArray(thread, "items") ?? readArray(root, "items")
  const turnItemCount = turns?.reduce<number>((count, turn) => {
    const items = readArray(turn, "items")
    return count + (items?.length ?? 0)
  }, 0)
  const itemCount =
    rootItems?.length ?? (typeof turnItemCount === "number" ? turnItemCount : undefined)
  const maxTurnIds = Math.max(0, options.maxTurnIds ?? DEFAULT_MAX_TURN_IDS)
  const allTurnIds =
    turns?.map(readTurnId).filter((turnId): turnId is string => Boolean(turnId)) ??
    []
  const turnIds = allTurnIds.slice(0, maxTurnIds)
  const checkpointSummary = summarizeNativeCheckpoints(payload, {
    maxCheckpoints: options.maxCheckpoints ?? DEFAULT_MAX_CHECKPOINTS,
    maxCheckpointFiles:
      options.maxCheckpointFiles ?? DEFAULT_MAX_CHECKPOINT_FILES,
  })

  return {
    threadId:
      cleanString(thread.id) ??
      cleanString(root.threadId) ??
      cleanString(root.id) ??
      null,
    ...(turns ? { turnCount: turns.length } : {}),
    ...(allTurnIds[0] ? { firstTurnId: allTurnIds[0] } : {}),
    ...(allTurnIds.at(-1) ? { lastTurnId: allTurnIds.at(-1) } : {}),
    ...(turns && turnIds.length > 0 ? { turnIds } : {}),
    ...(turns && allTurnIds.length > maxTurnIds
      ? { turnIdsTruncated: true }
      : {}),
    ...(typeof itemCount === "number" ? { itemCount } : {}),
    ...checkpointSummary,
  }
}

export function summarizeNativeThreadReadResult(
  result: AgentRuntimeThreadReadResult,
  options: {
    includeTurns?: boolean
    localMessages?: unknown
    localUserTurnCount?: number
  } = {},
): NativeThreadReadSummary {
  const payload = summarizeNativeThreadPayload(result.thread)
  const metadata = isRecord(result.metadata) ? result.metadata : {}
  const localUserTurnCount =
    options.localUserTurnCount ??
    (options.localMessages !== undefined
      ? countLocalTranscriptUserTurns(options.localMessages)
      : undefined)
  const consistency = resolveConsistency({
    status: result.status,
    turnCount: payload.turnCount,
    localUserTurnCount,
  })

  return compactSummary({
    status: result.status,
    threadId: result.threadId ?? payload.threadId,
    includeTurns: options.includeTurns ?? true,
    ...(payload.turnCount !== undefined ? { turnCount: payload.turnCount } : {}),
    ...(payload.firstTurnId !== undefined ? { firstTurnId: payload.firstTurnId } : {}),
    ...(payload.lastTurnId !== undefined ? { lastTurnId: payload.lastTurnId } : {}),
    ...(payload.turnIds !== undefined ? { turnIds: payload.turnIds } : {}),
    ...(payload.turnIdsTruncated !== undefined
      ? { turnIdsTruncated: payload.turnIdsTruncated }
      : {}),
    ...(payload.itemCount !== undefined ? { itemCount: payload.itemCount } : {}),
    ...(payload.checkpointCount !== undefined
      ? { checkpointCount: payload.checkpointCount }
      : {}),
    ...(payload.readyCheckpointCount !== undefined
      ? { readyCheckpointCount: payload.readyCheckpointCount }
      : {}),
    ...(payload.checkpoints !== undefined ? { checkpoints: payload.checkpoints } : {}),
    ...(payload.checkpointsTruncated !== undefined
      ? { checkpointsTruncated: payload.checkpointsTruncated }
      : {}),
    ...(payload.latestReadyCheckpoint !== undefined
      ? { latestReadyCheckpoint: payload.latestReadyCheckpoint }
      : {}),
    ...(localUserTurnCount !== undefined ? { localUserTurnCount } : {}),
    ...consistency,
    ...(result.message ? { message: result.message } : {}),
    updatedAt: result.updatedAt,
    bridge: cleanString(metadata.bridge),
    method: cleanString(metadata.method),
  })
}

export function readNativeThreadReadSummaryFromMetadata(
  runtimeMetadata: string | null | undefined,
): NativeThreadReadSummary | null {
  if (!runtimeMetadata) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(runtimeMetadata)
  } catch {
    return null
  }

  const control = readRecord(parsed, "mossSessionControl")
  const summary = readRecord(control, "nativeThreadRead")
  if (!summary) return null

  const rawStatus = cleanString(summary.status)
  const updatedAt = cleanString(summary.updatedAt)
  if (
    rawStatus !== "success" &&
    rawStatus !== "unsupported" &&
    rawStatus !== "error"
  ) {
    return null
  }
  if (!updatedAt) return null
  const status: NativeThreadReadSummary["status"] = rawStatus
  const consistencyStatus: NativeThreadConsistencyStatus | undefined =
    summary.consistencyStatus === "consistent" ||
    summary.consistencyStatus === "diverged" ||
    summary.consistencyStatus === "unknown"
      ? summary.consistencyStatus
      : undefined
  const consistencyReason = cleanString(summary.consistencyReason)
  const checkpoints = readNativeCheckpointSummaries(summary.checkpoints)
  const latestReadyCheckpoint = readNativeCheckpointSummary(
    summary.latestReadyCheckpoint,
  )

  return compactSummary({
    status,
    threadId: cleanString(summary.threadId) ?? null,
    includeTurns:
      typeof summary.includeTurns === "boolean" ? summary.includeTurns : true,
    ...(typeof summary.turnCount === "number"
      ? { turnCount: summary.turnCount }
      : {}),
    ...(cleanString(summary.firstTurnId)
      ? { firstTurnId: cleanString(summary.firstTurnId) }
      : {}),
    ...(cleanString(summary.lastTurnId)
      ? { lastTurnId: cleanString(summary.lastTurnId) }
      : {}),
    ...(readStringArray(summary, "turnIds")
      ? { turnIds: readStringArray(summary, "turnIds") }
      : {}),
    ...(typeof summary.turnIdsTruncated === "boolean"
      ? { turnIdsTruncated: summary.turnIdsTruncated }
      : {}),
    ...(typeof summary.itemCount === "number"
      ? { itemCount: summary.itemCount }
      : {}),
    ...(typeof summary.checkpointCount === "number"
      ? { checkpointCount: summary.checkpointCount }
      : {}),
    ...(typeof summary.readyCheckpointCount === "number"
      ? { readyCheckpointCount: summary.readyCheckpointCount }
      : {}),
    ...(checkpoints.length > 0 ? { checkpoints } : {}),
    ...(typeof summary.checkpointsTruncated === "boolean"
      ? { checkpointsTruncated: summary.checkpointsTruncated }
      : {}),
    ...(latestReadyCheckpoint ? { latestReadyCheckpoint } : {}),
    ...(typeof summary.localUserTurnCount === "number"
      ? { localUserTurnCount: summary.localUserTurnCount }
      : {}),
    ...(consistencyStatus ? { consistencyStatus } : {}),
    ...(consistencyReason ? { consistencyReason } : {}),
    ...(cleanString(summary.message) ? { message: cleanString(summary.message) } : {}),
    updatedAt,
    bridge: cleanString(summary.bridge),
    method: cleanString(summary.method),
  }) as NativeThreadReadSummary
}

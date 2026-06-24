import type { AgentEngineId, AgentRuntimeFeature } from "./types"

export const MOSS_SESSION_ACTION_IDS = [
  "resume",
  "fork",
  "rollback",
] as const

export type MossSessionActionId = (typeof MOSS_SESSION_ACTION_IDS)[number]

export type MossSessionActionStatus =
  | "ready"
  | "unavailable"
  | "unsupported"
  | "needs-native-session"
  | "needs-target"

export type MossSessionActionMode =
  | "native"
  | "moss-transcript"
  | "message-history"

export type MossSessionNativeBridge =
  | "claude-code-session"
  | "codex-exec-resume"
  | "hermes-cli-resume"
  | "hermes-acp-session-control"

export interface MossSessionMessage {
  id?: string
  role?: string
  content?: unknown
  parts?: unknown
  metadata?: Record<string, unknown>
  [key: string]: unknown
}

export interface MossSessionActionState {
  status: MossSessionActionStatus
  mode?: MossSessionActionMode
  nativeBridge?: MossSessionNativeBridge
  canRunHeadless?: boolean
  reason?: string
  targetMessageId?: string
  targetSdkMessageUuid?: string
  targetLabel?: string
}

export interface MossSessionActionPlan {
  subChatId: string
  engine: AgentEngineId
  messageCount: number
  latestMessageId?: string
  latestAssistantMessageId?: string
  latestAssistantSdkMessageUuid?: string
  rollbackTargetMessageId?: string
  rollbackTargetSdkMessageUuid?: string
  actions: Record<MossSessionActionId, MossSessionActionState>
}

export interface BuildMossSessionActionPlanInput {
  subChatId: string
  engine: AgentEngineId
  nativeSessionId?: string | null
  messages: string | MossSessionMessage[] | null | undefined
  features?: AgentRuntimeFeature[]
}

export interface MossForkSnapshot {
  messages: MossSessionMessage[]
  messageCount: number
  forkAtSdkUuid: string | null
  mode: MossSessionActionMode
  nativeSessionLinked: boolean
}

export interface BuildMossForkSnapshotInput {
  engine: AgentEngineId
  nativeSessionId?: string | null
  messages: string | MossSessionMessage[] | null | undefined
  features?: AgentRuntimeFeature[]
  targetMessageId?: string
  targetMessageIndex?: number
}

export interface MossRollbackSnapshot {
  messages: MossSessionMessage[]
  messageCount: number
  targetMessageId: string | null
  targetSdkMessageUuid: string | null
  mode: MossSessionActionMode
  nativeSessionLinked: boolean
}

export interface BuildMossRollbackSnapshotInput {
  engine: AgentEngineId
  nativeSessionId?: string | null
  messages: string | MossSessionMessage[] | null | undefined
  features?: AgentRuntimeFeature[]
  targetMessageId?: string
  targetSdkMessageUuid?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function cleanMetadata(
  value: unknown,
  extra?: Record<string, unknown>,
  options?: { clearNativeSession?: boolean },
): Record<string, unknown> {
  const metadata = isRecord(value) ? { ...value } : {}
  delete metadata.shouldResume
  delete metadata.shouldForkResume
  if (options?.clearNativeSession) {
    delete metadata.sessionId
    delete metadata.sdkMessageUuid
  }
  return {
    ...metadata,
    ...(extra ?? {}),
  }
}

function messageId(message: MossSessionMessage): string | undefined {
  return typeof message.id === "string" ? message.id : undefined
}

function messageRole(message: MossSessionMessage): string | undefined {
  return typeof message.role === "string" ? message.role : undefined
}

function messageSdkUuid(message: MossSessionMessage): string | undefined {
  const metadata = isRecord(message.metadata) ? message.metadata : {}
  const value = metadata.sdkMessageUuid
  return typeof value === "string" && value ? value : undefined
}

function messageLabel(message: MossSessionMessage, fallback: string): string {
  const parts = Array.isArray(message.parts) ? message.parts : []
  for (const part of parts) {
    if (!isRecord(part)) continue
    const text = part.text
    if (typeof text === "string" && text.trim()) {
      return text.trim().replace(/\s+/g, " ").slice(0, 80)
    }
  }

  if (typeof message.content === "string" && message.content.trim()) {
    return message.content.trim().replace(/\s+/g, " ").slice(0, 80)
  }

  return fallback
}

function hasFeature(
  features: AgentRuntimeFeature[] | undefined,
  feature: AgentRuntimeFeature,
): boolean {
  return !features || features.includes(feature)
}

function findLastIndex<T>(
  values: T[],
  predicate: (value: T, index: number) => boolean,
): number {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (predicate(values[index], index)) return index
  }
  return -1
}

function supportsNativeForkBridge(
  engine: AgentEngineId,
  nativeSessionId: string | null | undefined,
  features: AgentRuntimeFeature[] | undefined,
  forkAtSdkUuid: string | null,
): boolean {
  if (engine === "hermes") {
    return Boolean(nativeSessionId && hasFeature(features, "fork"))
  }

  return Boolean(
    engine === "claude-code" &&
      nativeSessionId &&
      forkAtSdkUuid &&
      hasFeature(features, "fork"),
  )
}

function supportsNativeRollbackBridge(
  engine: AgentEngineId,
  nativeSessionId: string | null | undefined,
  features: AgentRuntimeFeature[] | undefined,
  targetSdkUuid: string | null,
  hasTarget: boolean,
): boolean {
  if (engine === "hermes") {
    return Boolean(nativeSessionId && hasTarget && hasFeature(features, "rollback"))
  }

  return Boolean(
    engine === "claude-code" &&
      nativeSessionId &&
      targetSdkUuid &&
      hasFeature(features, "rollback"),
  )
}

export function parseMossSessionMessages(
  value: string | MossSessionMessage[] | null | undefined,
): MossSessionMessage[] {
  if (!value) return []
  let parsed: unknown
  try {
    parsed = typeof value === "string" ? JSON.parse(value || "[]") : value
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed.filter(isRecord) as MossSessionMessage[]
}

export function buildMossSessionActionPlan(
  input: BuildMossSessionActionPlanInput,
): MossSessionActionPlan {
  const messages = parseMossSessionMessages(input.messages)
  const latestMessage = messages[messages.length - 1]
  const latestAssistantIndex = findLastIndex(
    messages,
    (message) => messageRole(message) === "assistant",
  )
  const latestAssistant =
    latestAssistantIndex >= 0 ? messages[latestAssistantIndex] : undefined
  const latestAssistantWithSdkIndex = findLastIndex(
    messages,
    (message) =>
      messageRole(message) === "assistant" && Boolean(messageSdkUuid(message)),
  )
  const latestAssistantWithSdk =
    latestAssistantWithSdkIndex >= 0
      ? messages[latestAssistantWithSdkIndex]
      : undefined
  const rollbackTarget = latestAssistantWithSdk ?? latestAssistant ?? latestMessage
  const rollbackTargetSdkUuid = rollbackTarget
    ? messageSdkUuid(rollbackTarget) ?? null
    : null
  const rollbackTargetMessageId = rollbackTarget
    ? messageId(rollbackTarget) ?? null
    : null
  const nativeSessionLinked = Boolean(input.nativeSessionId)
  const latestAssistantSdkMessageUuid = latestAssistant
    ? messageSdkUuid(latestAssistant)
    : undefined
  const forkAtSdkUuid = latestAssistant ? messageSdkUuid(latestAssistant) ?? null : null
  const nativeFork = supportsNativeForkBridge(
    input.engine,
    input.nativeSessionId,
    input.features,
    forkAtSdkUuid,
  )
  const nativeRollback = supportsNativeRollbackBridge(
    input.engine,
    input.nativeSessionId,
    input.features,
    rollbackTargetSdkUuid,
    Boolean(rollbackTarget),
  )

  const resume: MossSessionActionState = !hasFeature(input.features, "resume")
    ? {
        status: "unsupported",
        reason: `${input.engine} does not advertise native resume support.`,
      }
    : nativeSessionLinked
      ? {
          status: "ready",
          mode: "native",
          ...(input.engine === "codex"
            ? { nativeBridge: "codex-exec-resume" as const }
            : input.engine === "claude-code"
              ? { nativeBridge: "claude-code-session" as const }
              : input.engine === "hermes"
                ? { nativeBridge: "hermes-cli-resume" as const }
              : {}),
          canRunHeadless: input.engine === "codex" || input.engine === "hermes",
          reason:
            input.engine === "codex"
              ? "Codex native session id is linked through codex exec resume."
              : input.engine === "hermes"
                ? "Hermes native session id is linked through hermes --resume."
                : "Native session id is linked.",
        }
      : messages.length > 0
        ? {
            status: "needs-native-session",
            mode: "message-history",
            reason: "Transcript exists, but no native engine session has been linked yet.",
          }
        : {
            status: "unavailable",
            reason: "No transcript is available to resume.",
          }

  const fork: MossSessionActionState = messages.length === 0
    ? {
        status: "unavailable",
        reason: "No transcript is available to fork.",
      }
    : nativeFork
      ? {
          status: "ready",
          mode: "native",
          nativeBridge:
            input.engine === "hermes"
              ? "hermes-acp-session-control"
              : "claude-code-session",
          targetMessageId: latestAssistant ? messageId(latestAssistant) : undefined,
          targetSdkMessageUuid: forkAtSdkUuid ?? undefined,
          targetLabel: latestAssistant
            ? messageLabel(latestAssistant, "Latest assistant message")
            : undefined,
          reason:
            input.engine === "hermes"
              ? "Hermes fork stays linked to the Moss-owned Hermes session and starts from the selected Moss transcript boundary."
              : "Claude Code native fork bridge can resume at the selected assistant turn.",
        }
      : {
          status: "ready",
          mode: "moss-transcript",
          targetMessageId: latestMessage ? messageId(latestMessage) : undefined,
          targetLabel: latestMessage
            ? messageLabel(latestMessage, "Latest message")
            : undefined,
          reason: "Moss will clone the transcript and start a fresh native engine session.",
        }

  const rollback: MossSessionActionState = messages.length === 0
    ? {
        status: "unavailable",
        reason: "No transcript is available to roll back.",
      }
    : !rollbackTarget
      ? {
          status: "needs-target",
          reason: "No rollback target message was found.",
        }
      : nativeRollback
        ? {
            status: "ready",
            mode: "native",
            nativeBridge:
              input.engine === "hermes"
                ? "hermes-acp-session-control"
                : "claude-code-session",
            targetMessageId: rollbackTargetMessageId ?? undefined,
            targetSdkMessageUuid: rollbackTargetSdkUuid ?? undefined,
            targetLabel: messageLabel(rollbackTarget, "Rollback target"),
            reason:
              input.engine === "hermes"
                ? "Hermes rollback stays linked to the Moss-owned Hermes session and truncates to the selected Moss transcript boundary."
                : "Claude Code rollback can resume at the target assistant turn.",
          }
        : messages.length > 1
          ? {
              status: "ready",
              mode: "message-history",
              targetMessageId: rollbackTargetMessageId ?? undefined,
              targetSdkMessageUuid: rollbackTargetSdkUuid ?? undefined,
              targetLabel: messageLabel(rollbackTarget, "Rollback target"),
              reason: "Moss will truncate the transcript and clear stale native session ids.",
            }
          : {
              status: "needs-target",
              mode: "message-history",
              reason: "At least two messages are needed for message-history rollback.",
            }

  return {
    subChatId: input.subChatId,
    engine: input.engine,
    messageCount: messages.length,
    latestMessageId: latestMessage ? messageId(latestMessage) : undefined,
    latestAssistantMessageId: latestAssistant
      ? messageId(latestAssistant)
      : undefined,
    latestAssistantSdkMessageUuid,
    rollbackTargetMessageId: rollbackTargetMessageId ?? undefined,
    rollbackTargetSdkMessageUuid: rollbackTargetSdkUuid ?? undefined,
    actions: {
      resume,
      fork,
      rollback,
    },
  }
}

function resolveForkCutoffIndex(
  messages: MossSessionMessage[],
  targetMessageId: string | undefined,
  targetMessageIndex: number | undefined,
): number {
  if (messages.length === 0) return -1
  if (targetMessageId) {
    const byId = messages.findIndex((message) => messageId(message) === targetMessageId)
    if (byId >= 0) return byId
  }
  if (
    typeof targetMessageIndex === "number" &&
    targetMessageIndex >= 0 &&
    targetMessageIndex < messages.length
  ) {
    return targetMessageIndex
  }
  return messages.length - 1
}

function createForkMessageId(index: number): string {
  return `fork-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`
}

export function buildMossForkSnapshot(
  input: BuildMossForkSnapshotInput,
): MossForkSnapshot {
  const messages = parseMossSessionMessages(input.messages)
  const cutoffIndex = resolveForkCutoffIndex(
    messages,
    input.targetMessageId,
    input.targetMessageIndex,
  )
  if (cutoffIndex < 0) {
    throw new Error("No transcript is available to fork.")
  }

  const messagesToFork = messages.slice(0, cutoffIndex + 1)
  const lastAssistantIndex = findLastIndex(
    messagesToFork,
    (message) => messageRole(message) === "assistant",
  )
  const lastAssistant =
    lastAssistantIndex >= 0 ? messagesToFork[lastAssistantIndex] : undefined
  const forkAtSdkUuid = lastAssistant ? messageSdkUuid(lastAssistant) ?? null : null
  const nativeFork = supportsNativeForkBridge(
    input.engine,
    input.nativeSessionId,
    input.features,
    forkAtSdkUuid,
  )

  return {
    messages: messagesToFork.map((message, index) => ({
      ...message,
      id: createForkMessageId(index),
      metadata: cleanMetadata(
        message.metadata,
        input.engine === "claude-code" &&
          nativeFork &&
          index === lastAssistantIndex &&
          forkAtSdkUuid
          ? { shouldForkResume: true }
          : undefined,
        { clearNativeSession: !nativeFork },
      ),
    })),
    messageCount: messagesToFork.length,
    forkAtSdkUuid,
    mode: nativeFork ? "native" : "moss-transcript",
    nativeSessionLinked: nativeFork,
  }
}

function resolveRollbackTargetIndex(
  messages: MossSessionMessage[],
  targetMessageId: string | undefined,
  targetSdkMessageUuid: string | undefined,
): number {
  if (messages.length === 0) return -1
  if (targetMessageId) {
    const byId = messages.findIndex((message) => messageId(message) === targetMessageId)
    if (byId >= 0) return byId
  }
  if (targetSdkMessageUuid) {
    const bySdkUuid = messages.findIndex(
      (message) => messageSdkUuid(message) === targetSdkMessageUuid,
    )
    if (bySdkUuid >= 0) return bySdkUuid
  }
  const lastAssistantWithSdk = findLastIndex(
    messages,
    (message) =>
      messageRole(message) === "assistant" && Boolean(messageSdkUuid(message)),
  )
  if (lastAssistantWithSdk >= 0) return lastAssistantWithSdk
  const lastAssistant = findLastIndex(
    messages,
    (message) => messageRole(message) === "assistant",
  )
  if (lastAssistant >= 0) return lastAssistant
  return messages.length - 1
}

export function buildMossRollbackSnapshot(
  input: BuildMossRollbackSnapshotInput,
): MossRollbackSnapshot {
  const messages = parseMossSessionMessages(input.messages)
  const targetIndex = resolveRollbackTargetIndex(
    messages,
    input.targetMessageId,
    input.targetSdkMessageUuid,
  )
  if (targetIndex < 0) {
    throw new Error("No transcript is available to roll back.")
  }

  const target = messages[targetIndex]
  const targetSdkUuid = messageSdkUuid(target) ?? null
  const nativeRollback = supportsNativeRollbackBridge(
    input.engine,
    input.nativeSessionId,
    input.features,
    targetSdkUuid,
    true,
  )
  const truncated = messages.slice(0, targetIndex + 1)

  return {
    messages: truncated.map((message, index) => ({
      ...message,
      metadata: cleanMetadata(
        message.metadata,
        input.engine === "claude-code" &&
          nativeRollback &&
          index === truncated.length - 1
          ? { shouldResume: true }
          : undefined,
        { clearNativeSession: !nativeRollback },
      ),
    })),
    messageCount: truncated.length,
    targetMessageId: messageId(target) ?? null,
    targetSdkMessageUuid: targetSdkUuid,
    mode: nativeRollback ? "native" : "message-history",
    nativeSessionLinked: nativeRollback,
  }
}

export function shouldIgnoreMossStoredMessageSessionIds(
  runtimeMetadata: string | null | undefined,
): boolean {
  if (!runtimeMetadata) return false

  let parsed: unknown
  try {
    parsed = JSON.parse(runtimeMetadata)
  } catch {
    return false
  }
  if (!isRecord(parsed) || !isRecord(parsed.mossSessionControl)) {
    return false
  }

  const control = parsed.mossSessionControl
  const action = control.action
  const mode = control.mode
  if (mode === "native") return false

  return (
    (action === "fork" && mode === "moss-transcript") ||
    (action === "rollback" && mode === "message-history")
  )
}

export function mergeMossSessionControlMetadata(
  runtimeMetadata: string | null | undefined,
  controlMetadata: Record<string, unknown>,
): string {
  let parsed: Record<string, unknown> = {}
  if (runtimeMetadata) {
    try {
      const value = JSON.parse(runtimeMetadata)
      if (isRecord(value)) parsed = value
    } catch {
      parsed = {}
    }
  }

  return JSON.stringify({
    ...parsed,
    mossSessionControl: {
      ...(isRecord(parsed.mossSessionControl)
        ? parsed.mossSessionControl
        : {}),
      ...controlMetadata,
      updatedAt: new Date().toISOString(),
    },
  })
}

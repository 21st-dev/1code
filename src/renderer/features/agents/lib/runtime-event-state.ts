import type {
  AgentGuardEvent,
  GuardedRunAudit,
} from "../../../../shared/agent-scope-contracts"
import { appStore } from "../../../lib/jotai-store"
import {
  askUserQuestionResultsAtom,
  expiredUserQuestionsAtom,
  guardedRunAuditsAtom,
  guardedRunEventsAtom,
  pendingScopeExpansionRequestsAtom,
  pendingUserQuestionsAtom,
  type PendingUserQuestion,
} from "../atoms"

type RuntimeEventStateContext = {
  subChatId: string
  parentChatId: string
}

type AskUserQuestionChunk = {
  type: "ask-user-question"
  toolUseId: string
  questions: PendingUserQuestion["questions"]
}

type AskUserQuestionTimeoutChunk = {
  type: "ask-user-question-timeout"
  toolUseId: string
}

type AskUserQuestionResultChunk = {
  type: "ask-user-question-result"
  toolUseId: string
  result: unknown
}

type GuardEventChunk = {
  type: "guard-event"
  event: AgentGuardEvent
}

type GuardAuditChunk = {
  type: "guard-audit"
  audit: GuardedRunAudit
}

type RuntimeEventStateChunk =
  | AskUserQuestionChunk
  | AskUserQuestionTimeoutChunk
  | AskUserQuestionResultChunk
  | GuardEventChunk
  | GuardAuditChunk

export function applyRuntimeEventStateChunk(
  context: RuntimeEventStateContext,
  chunk: { type?: string },
): boolean {
  if (!isRuntimeEventStateChunk(chunk)) {
    return false
  }

  switch (chunk.type) {
    case "ask-user-question":
      applyAskUserQuestion(context, chunk)
      return true
    case "ask-user-question-timeout":
      applyAskUserQuestionTimeout(context, chunk)
      return true
    case "ask-user-question-result":
      applyAskUserQuestionResult(chunk)
      return true
    case "guard-event":
      applyGuardEvent(context, chunk)
      return true
    case "guard-audit":
      applyGuardAudit(context, chunk)
      return true
  }
}

export function clearPendingUserQuestionForRuntimeChunk({
  subChatId,
  chunk,
}: {
  subChatId: string
  chunk: { type?: string }
}) {
  const chunkType = chunk.type
  const shouldClearOnChunk =
    typeof chunkType === "string" &&
    chunkType !== "ask-user-question" &&
    chunkType !== "ask-user-question-timeout" &&
    chunkType !== "ask-user-question-result" &&
    !chunkType.startsWith("tool-input") &&
    chunkType !== "start" &&
    chunkType !== "start-step"

  if (!shouldClearOnChunk) {
    return
  }

  const currentMap = appStore.get(pendingUserQuestionsAtom)
  if (!currentMap.has(subChatId)) {
    return
  }

  const newMap = new Map(currentMap)
  newMap.delete(subChatId)
  appStore.set(pendingUserQuestionsAtom, newMap)
}

function isRuntimeEventStateChunk(
  chunk: { type?: string },
): chunk is RuntimeEventStateChunk {
  return (
    chunk.type === "ask-user-question" ||
    chunk.type === "ask-user-question-timeout" ||
    chunk.type === "ask-user-question-result" ||
    chunk.type === "guard-event" ||
    chunk.type === "guard-audit"
  )
}

function applyAskUserQuestion(
  context: RuntimeEventStateContext,
  chunk: AskUserQuestionChunk,
) {
  const currentMap = appStore.get(pendingUserQuestionsAtom)
  const newMap = new Map(currentMap)
  newMap.set(context.subChatId, {
    subChatId: context.subChatId,
    parentChatId: context.parentChatId,
    toolUseId: chunk.toolUseId,
    questions: chunk.questions,
  })
  appStore.set(pendingUserQuestionsAtom, newMap)

  const currentExpired = appStore.get(expiredUserQuestionsAtom)
  if (currentExpired.has(context.subChatId)) {
    const newExpiredMap = new Map(currentExpired)
    newExpiredMap.delete(context.subChatId)
    appStore.set(expiredUserQuestionsAtom, newExpiredMap)
  }
}

function applyAskUserQuestionTimeout(
  context: RuntimeEventStateContext,
  chunk: AskUserQuestionTimeoutChunk,
) {
  const currentMap = appStore.get(pendingUserQuestionsAtom)
  const pending = currentMap.get(context.subChatId)
  if (!pending || pending.toolUseId !== chunk.toolUseId) {
    return
  }

  const newPendingMap = new Map(currentMap)
  newPendingMap.delete(context.subChatId)
  appStore.set(pendingUserQuestionsAtom, newPendingMap)

  const currentExpired = appStore.get(expiredUserQuestionsAtom)
  const newExpiredMap = new Map(currentExpired)
  newExpiredMap.set(context.subChatId, pending)
  appStore.set(expiredUserQuestionsAtom, newExpiredMap)
}

function applyAskUserQuestionResult(chunk: AskUserQuestionResultChunk) {
  const currentResults = appStore.get(askUserQuestionResultsAtom)
  const newResults = new Map(currentResults)
  newResults.set(chunk.toolUseId, chunk.result)
  appStore.set(askUserQuestionResultsAtom, newResults)
}

function applyGuardEvent(
  context: RuntimeEventStateContext,
  chunk: GuardEventChunk,
) {
  const currentEvents = appStore.get(guardedRunEventsAtom)
  const nextEvents = new Map(currentEvents)
  const events = nextEvents.get(context.subChatId) ?? []
  nextEvents.set(context.subChatId, [...events, chunk.event])
  appStore.set(guardedRunEventsAtom, nextEvents)

  if (chunk.event.type !== "scope-expansion-request" || !chunk.event.toolUseId) {
    return
  }

  const currentRequests = appStore.get(pendingScopeExpansionRequestsAtom)
  const nextRequests = new Map(currentRequests)
  nextRequests.set(context.subChatId, {
    subChatId: context.subChatId,
    parentChatId: context.parentChatId,
    toolUseId: chunk.event.toolUseId,
    contractId: chunk.event.contractId,
    path: chunk.event.path,
    paths: chunk.event.paths,
    toolName: chunk.event.toolName,
    reason: chunk.event.reason,
  })
  appStore.set(pendingScopeExpansionRequestsAtom, nextRequests)
}

function applyGuardAudit(
  context: RuntimeEventStateContext,
  chunk: GuardAuditChunk,
) {
  const currentAudits = appStore.get(guardedRunAuditsAtom)
  const nextAudits = new Map(currentAudits)
  nextAudits.set(context.subChatId, chunk.audit)
  appStore.set(guardedRunAuditsAtom, nextAudits)
}

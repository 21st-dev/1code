import { normalizeCodexAssistantMessage } from "../../../shared/codex-tool-normalizer"
import type { AgentGuardEvent } from "../../../shared/agent-scope-contracts"
import {
  buildGuardedRunAudit,
  captureGuardedGitStatus,
  type GuardedGitStatusSnapshot,
} from "../agent-guard/audit"
import type { ValidatedAgentScopeContract } from "../agent-guard/contract"
import type { CodexUsageMetadata } from "./usage-metadata"

export type CodexAcpGuardedPersistenceContext = {
  contract: ValidatedAgentScopeContract
  preRunStatus: GuardedGitStatusSnapshot
  cwd: string
  guardEvents: AgentGuardEvent[]
  startedAt: string
  stopped: boolean
}

export type PersistCodexAcpResponseMessageInput = {
  responseMessage: any
  isContinuation: boolean
  messagesForStream: any[]
  usageMetadata: CodexUsageMetadata | null
  guardedRun?: CodexAcpGuardedPersistenceContext | null
  emit: (chunk: any) => void
  persistMessages: (messages: any[]) => unknown
}

export function cleanCodexAssistantMessageForPersistence(message: any) {
  if (!message || message.role !== "assistant") return message
  if (!Array.isArray(message.parts)) return message

  const cleanedParts = message.parts.filter(
    (part: any) => part?.state !== "input-streaming",
  )

  if (cleanedParts.length === 0) {
    return null
  }

  return normalizeCodexAssistantMessage(
    {
      ...message,
      parts: cleanedParts,
    },
    { normalizeState: true },
  )
}

export async function persistCodexAcpResponseMessage({
  responseMessage,
  isContinuation,
  messagesForStream,
  usageMetadata,
  guardedRun,
  emit,
  persistMessages,
}: PersistCodexAcpResponseMessageInput): Promise<void> {
  const guardedRunAudit = guardedRun
    ? buildGuardedRunAudit({
        contract: guardedRun.contract,
        runtime: "codex",
        enforcementMode: "hard",
        preRunStatus: guardedRun.preRunStatus,
        postRunStatus: await captureGuardedGitStatus(guardedRun.cwd),
        guardEvents: guardedRun.guardEvents,
        startedAt: guardedRun.startedAt,
        stopped: guardedRun.stopped,
      })
    : null

  if (guardedRunAudit) {
    emit({ type: "guard-audit", audit: guardedRunAudit })
  }

  const responseWithUsage = {
    ...responseMessage,
    createdAt:
      (responseMessage as any)?.createdAt ?? new Date().toISOString(),
    metadata: {
      ...((responseMessage as any)?.metadata || {}),
      ...(usageMetadata || {}),
      ...(guardedRunAudit
        ? {
            guardedRun: {
              contractId: guardedRunAudit.contractId,
              runId: guardedRunAudit.runId,
              runtime: "codex",
              enforcementMode: guardedRunAudit.enforcementMode,
              audit: guardedRunAudit,
            },
          }
        : {}),
    },
  }
  const cleanedResponseMessage =
    cleanCodexAssistantMessageForPersistence(responseWithUsage)

  if (!cleanedResponseMessage) {
    persistMessages(messagesForStream)
    return
  }

  persistMessages([
    ...(isContinuation ? messagesForStream.slice(0, -1) : messagesForStream),
    cleanedResponseMessage,
  ])
}

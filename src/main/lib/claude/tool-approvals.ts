import type {
  ClaudeAskUserQuestionDecision,
  ClaudeAskUserQuestionPending,
} from "./agent-sdk-tool-permission"

const pendingToolApprovals = new Map<string, ClaudeAskUserQuestionPending>()

export function getClaudePendingToolApprovalStore(): Map<
  string,
  ClaudeAskUserQuestionPending
> {
  return pendingToolApprovals
}

export function clearClaudePendingToolApprovals(
  message: string,
  subChatId?: string,
): void {
  for (const [toolUseId, pending] of pendingToolApprovals) {
    if (subChatId && pending.subChatId !== subChatId) continue
    pending.resolve({ approved: false, message })
    pendingToolApprovals.delete(toolUseId)
  }
}

export function resolveClaudePendingToolApproval(input: {
  toolUseId: string
  decision: ClaudeAskUserQuestionDecision
}): boolean {
  const pending = pendingToolApprovals.get(input.toolUseId)
  if (!pending) return false
  pending.resolve(input.decision)
  pendingToolApprovals.delete(input.toolUseId)
  return true
}

export function clearClaudePendingToolApprovalsForTest(): void {
  pendingToolApprovals.clear()
}

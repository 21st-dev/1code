export type SubChatStatus = "draft" | "in-progress" | "needs-input" | "done"

interface WorkspaceStatusDependencies {
  workspacesLoading: Set<string>
  workspacesWithPendingQuestions: Set<string>
  workspacesWithPendingApprovals: Set<string>
}

export function deriveWorkspaceStatus(
  chatId: string,
  deps: WorkspaceStatusDependencies
): SubChatStatus {
  const { workspacesLoading, workspacesWithPendingQuestions, workspacesWithPendingApprovals } = deps

  // 1. Needs Input - has pending question or plan approval (highest priority - user action required)
  if (workspacesWithPendingQuestions.has(chatId) || workspacesWithPendingApprovals.has(chatId)) {
    return "needs-input"
  }

  // 2. In Progress - any sub-chat is loading
  if (workspacesLoading.has(chatId)) {
    return "in-progress"
  }

  // 3. Done - everything else (workspaces are never "draft" - they always have at least one sub-chat)
  return "done"
}

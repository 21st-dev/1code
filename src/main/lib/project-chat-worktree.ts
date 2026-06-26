import {
  createWorktreeForChat as defaultCreateWorktreeForChat,
  sanitizeProjectName,
  type WorktreeResult,
  type WorktreeSetupApprovalRequired,
} from "./git"
import type { WorktreeSetupResult } from "./git/worktree-config"

export type ProjectChatWorktreeProject = {
  id: string
  name: string
  path: string
}

export type ProjectChatWorktreeFailurePayload = {
  kind: "create-failed" | "create-timeout" | "setup-failed"
  message: string
  projectId: string
  fallback?: {
    mode: "project-directory"
    path: string
  }
}

export type CreateProjectChatWorktree = (
  projectPath: string,
  projectSlug: string,
  chatId: string,
  selectedBaseBranch?: string,
  branchType?: "local" | "remote",
  options?: {
    projectId?: string
    onSetupComplete?: (result: WorktreeSetupResult) => void
    onSetupApprovalRequired?: (request: WorktreeSetupApprovalRequired) => void
  },
) => Promise<WorktreeResult>

export type ResolveProjectChatWorktreeInput = {
  chatId: string
  project: ProjectChatWorktreeProject
  useWorktree: boolean
  baseBranch?: string
  branchType?: "local" | "remote"
  createWorktreeForChat?: CreateProjectChatWorktree
  onWorktreeFailure?: (payload: ProjectChatWorktreeFailurePayload) => void
  onWorktreeSetupApprovalRequired?: (
    request: WorktreeSetupApprovalRequired,
  ) => void
}

export type ResolvedProjectChatWorktree = {
  worktreePath?: string
  branch?: string
  baseBranch?: string
}

export async function resolveProjectChatWorktree(
  input: ResolveProjectChatWorktreeInput,
): Promise<ResolvedProjectChatWorktree> {
  const {
    chatId,
    project,
    useWorktree,
    baseBranch,
    branchType,
    onWorktreeFailure,
    onWorktreeSetupApprovalRequired,
  } = input

  if (!useWorktree) {
    return { worktreePath: project.path }
  }

  const createWorktreeForChat =
    input.createWorktreeForChat ?? defaultCreateWorktreeForChat
  const result = await createWorktreeForChat(
    project.path,
    sanitizeProjectName(project.name),
    chatId,
    baseBranch,
    branchType,
    {
      projectId: project.id,
      onSetupComplete: (setupResult: WorktreeSetupResult) => {
        if (setupResult.success) return
        const message =
          setupResult.errors[0] ||
          "Worktree setup failed. Check your setup commands."
        onWorktreeFailure?.({
          kind: "setup-failed",
          message,
          projectId: project.id,
        })
      },
      onSetupApprovalRequired: onWorktreeSetupApprovalRequired,
    },
  )

  if (result.success && result.worktreePath) {
    return {
      worktreePath: result.worktreePath,
      branch: result.branch,
      baseBranch: result.baseBranch,
    }
  }

  const isTimeout = result.failureReason === "checkout-timeout"
  onWorktreeFailure?.({
    kind: isTimeout ? "create-timeout" : "create-failed",
    message: result.error || "Worktree creation failed.",
    projectId: project.id,
    fallback: {
      mode: "project-directory",
      path: project.path,
    },
  })

  return { worktreePath: project.path }
}

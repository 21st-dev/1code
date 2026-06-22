import type { Chat, Project } from "../db/schema"
import { removeWorktree as defaultRemoveWorktree } from "../git"
import { gitCache } from "../git/cache"
import { terminalManager } from "../terminal/manager"

export type WorkspaceCleanupResult = {
  success: boolean
  workspaceId: string | null
  worktreeRemoved: boolean
  terminalKilled: number
  terminalFailed: number
  errors: string[]
}

export type WorkspaceCleanupDeps = {
  removeWorktree?: typeof defaultRemoveWorktree
  killByWorkspaceId?: (
    workspaceId: string,
  ) => Promise<{ killed: number; failed: number }>
  invalidateStatus?: (worktreePath: string) => void
  invalidateParsedDiff?: (worktreePath: string) => void
}

export async function cleanupChatWorkspaceForDelete(
  chat: Chat | null | undefined,
  project: Project | null | undefined,
  deps: WorkspaceCleanupDeps = {},
): Promise<WorkspaceCleanupResult> {
  const errors: string[] = []
  const removeWorktree = deps.removeWorktree ?? defaultRemoveWorktree
  const killByWorkspaceId =
    deps.killByWorkspaceId ??
    terminalManager.killByWorkspaceId.bind(terminalManager)
  const invalidateStatus =
    deps.invalidateStatus ?? gitCache.invalidateStatus.bind(gitCache)
  const invalidateParsedDiff =
    deps.invalidateParsedDiff ?? gitCache.invalidateParsedDiff.bind(gitCache)

  if (!chat) {
    return {
      success: true,
      workspaceId: null,
      worktreeRemoved: false,
      terminalKilled: 0,
      terminalFailed: 0,
      errors,
    }
  }

  let terminalKilled = 0
  let terminalFailed = 0
  let worktreeRemoved = false

  if (chat.branch) {
    try {
      const result = await killByWorkspaceId(chat.id)
      terminalKilled = result.killed
      terminalFailed = result.failed
      if (result.failed > 0) {
        errors.push(
          `Failed to kill ${result.failed} terminal session(s) for workspace ${chat.id}`,
        )
      }
    } catch (error) {
      errors.push(
        error instanceof Error
          ? error.message
          : `Failed to kill terminal sessions for workspace ${chat.id}`,
      )
    }
  }

  if (chat.worktreePath && chat.branch && project) {
    const result = await removeWorktree(project.path, chat.worktreePath)
    if (result.success) {
      worktreeRemoved = true
    } else {
      errors.push(
        result.error ?? `Failed to remove worktree ${chat.worktreePath}`,
      )
    }
  }

  if (chat.worktreePath) {
    invalidateStatus(chat.worktreePath)
    invalidateParsedDiff(chat.worktreePath)
  }

  return {
    success: errors.length === 0,
    workspaceId: chat.id,
    worktreeRemoved,
    terminalKilled,
    terminalFailed,
    errors,
  }
}

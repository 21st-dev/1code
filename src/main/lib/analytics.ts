/**
 * Local-first analytics boundary.
 *
 * Hosted telemetry has been removed from the default desktop build. The exported
 * helpers remain as no-ops so feature code can keep calling tracking hooks
 * without pulling in hosted telemetry or upstream account-plan state.
 */

let currentUserId: string | null = null

/**
 * Set opt-out status (called from renderer when user preference changes)
 */
export function setOptOut(optedOut: boolean) {
  void optedOut
}

/**
 * Set subscription plan (called after fetching from API)
 */
export function setSubscriptionPlan(plan: string) {
  void plan
}

/**
 * Set connection method (called from renderer via IPC)
 * Values: "claude-subscription" | "api-key" | "custom-model"
 */
export function setConnectionMethod(method: string) {
  void method
}

/**
 * Initialize analytics for main process
 */
export function initAnalytics() {
  console.log("[Analytics] Hosted telemetry removed from local-first build")
}

/**
 * Capture an analytics event
 */
export function capture(
  eventName: string,
  properties?: Record<string, any>,
) {
  void eventName
  void properties
}

/**
 * Identify a user
 */
export function identify(
  userId: string,
  traits?: Record<string, any>,
) {
  currentUserId = userId
  void traits
}

/**
 * Get current user ID
 */
export function getCurrentUserId(): string | null {
  return currentUserId
}

/**
 * Reset user identification (on logout)
 */
export function reset() {
  currentUserId = null
}

/**
 * Shutdown analytics
 */
export async function shutdown() {
  return Promise.resolve()
}

// ============================================================================
// Specific event helpers
// ============================================================================

/**
 * Track app opened event
 */
export function trackAppOpened() {
  capture("desktop_opened")
}

/**
 * Track successful authentication
 */
export function trackAuthCompleted(userId: string, email?: string) {
  identify(userId, email ? { email } : undefined)
  capture("auth_completed", {
    user_id: userId,
  })
}

/**
 * Track project opened
 */
export function trackProjectOpened(project: {
  id: string
  hasGitRemote: boolean
}) {
  capture("project_opened", {
    project_id: project.id,
    has_git_remote: project.hasGitRemote,
  })
}

/**
 * Track workspace/chat created
 */
export function trackWorkspaceCreated(workspace: {
  id: string
  projectId: string | null
  useWorktree: boolean
  repository?: string
}) {
  capture("workspace_created", {
    workspace_id: workspace.id,
    project_id: workspace.projectId,
    use_worktree: workspace.useWorktree,
    repository: workspace.repository,
  })
}

/**
 * Track workspace archived
 */
export function trackWorkspaceArchived(workspaceId: string) {
  capture("workspace_archived", {
    workspace_id: workspaceId,
  })
}

/**
 * Track workspace deleted
 */
export function trackWorkspaceDeleted(workspaceId: string) {
  capture("workspace_deleted", {
    workspace_id: workspaceId,
  })
}

/**
 * Track message sent
 */
export function trackMessageSent(data: {
  workspaceId: string
  subChatId?: string
  mode: "plan" | "agent"
}) {
  capture("message_sent", {
    workspace_id: data.workspaceId,
    sub_chat_id: data.subChatId,
    mode: data.mode,
  })
}

/**
 * Track PR created
 */
export function trackPRCreated(data: {
  workspaceId: string
  prNumber: number
  repository?: string
  mode?: "worktree" | "local"
}) {
  capture("pr_created", {
    workspace_id: data.workspaceId,
    pr_number: data.prNumber,
    repository: data.repository,
    mode: data.mode,
  })
}

/**
 * Track commit created
 */
export function trackCommitCreated(data: {
  workspaceId: string
  filesChanged: number
  mode: "worktree" | "local"
}) {
  capture("commit_created", {
    workspace_id: data.workspaceId,
    files_changed: data.filesChanged,
    mode: data.mode,
  })
}

/**
 * Track sub-chat created
 */
export function trackSubChatCreated(data: {
  workspaceId: string
  subChatId: string
}) {
  capture("sub_chat_created", {
    workspace_id: data.workspaceId,
    sub_chat_id: data.subChatId,
  })
}

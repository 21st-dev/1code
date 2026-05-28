import type {
  GitHubChecksSummary,
  GitHubDraftPullRequestUnavailableReason,
  GitHubPrState,
  GitHubReviewCommentsContext,
  GitHubWorkflowCheck,
  GitHubWorkflowUnavailableReason,
  GitHubWriteBackAction,
  GitHubWriteBackUnavailableReason,
} from "./github-workflow-context"

export type GitHubWorkflowStatusUiReason =
  | GitHubWorkflowUnavailableReason
  | "no_pr"
  | "invalid_url"

export type GitHubWorkflowStatusTitleKey =
  | "githubWorkflow.status.ghMissing"
  | "githubWorkflow.status.notAuthenticated"
  | "githubWorkflow.status.notGithubRepo"
  | "githubWorkflow.status.noPr"
  | "githubWorkflow.status.invalidUrl"
  | "githubWorkflow.status.unavailable"

export type GitHubWorkflowStatusMessageKey =
  | "githubWorkflow.status.ghMissingMessage"
  | "githubWorkflow.status.notAuthenticatedMessage"
  | "githubWorkflow.status.notGithubRepoMessage"
  | "githubWorkflow.status.noPrMessage"
  | "githubWorkflow.status.invalidUrlMessage"
  | "githubWorkflow.status.unavailableMessage"

export type GitHubDraftPrUnavailableMessageKey =
  | "githubWorkflow.draftPr.noWorktreeMessage"
  | "githubWorkflow.draftPr.notGithubRepoMessage"
  | "githubWorkflow.draftPr.ghMissingMessage"
  | "githubWorkflow.draftPr.ghNotAuthenticatedMessage"
  | "githubWorkflow.draftPr.githubUnavailableMessage"
  | "githubWorkflow.draftPr.dirtyWorktreeMessage"
  | "githubWorkflow.draftPr.branchMismatchMessage"
  | "githubWorkflow.draftPr.noCommittedChangesMessage"
  | "githubWorkflow.draftPr.baseBranchMessage"
  | "githubWorkflow.draftPr.existingPrMessage"

export type GitHubWriteBackActionLabelKey =
  | "githubWorkflow.writeBack.action.prComment"
  | "githubWorkflow.writeBack.action.reviewThreadReply"
  | "githubWorkflow.writeBack.action.markReady"
  | "githubWorkflow.writeBack.action.requestReviewers"

export type GitHubWriteBackConfirmTitleKey =
  | "githubWorkflow.writeBack.confirmTitle.prComment"
  | "githubWorkflow.writeBack.confirmTitle.reviewThreadReply"
  | "githubWorkflow.writeBack.confirmTitle.markReady"
  | "githubWorkflow.writeBack.confirmTitle.requestReviewers"

export type GitHubWriteBackConfirmDescriptionKey =
  | "githubWorkflow.writeBack.confirmDescription.prComment"
  | "githubWorkflow.writeBack.confirmDescription.reviewThreadReply"
  | "githubWorkflow.writeBack.confirmDescription.markReady"
  | "githubWorkflow.writeBack.confirmDescription.requestReviewers"

export type GitHubWriteBackConfirmButtonKey =
  | "githubWorkflow.writeBack.confirmButton.prComment"
  | "githubWorkflow.writeBack.confirmButton.reviewThreadReply"
  | "githubWorkflow.writeBack.confirmButton.markReady"
  | "githubWorkflow.writeBack.confirmButton.requestReviewers"

export type GitHubWriteBackDisabledMessageKey =
  | "githubWorkflow.writeBack.disabled.ghMissing"
  | "githubWorkflow.writeBack.disabled.notAuthenticated"
  | "githubWorkflow.writeBack.disabled.notGithubRepo"
  | "githubWorkflow.writeBack.disabled.githubUnavailable"
  | "githubWorkflow.writeBack.disabled.noPr"
  | "githubWorkflow.writeBack.disabled.missingPrNumber"
  | "githubWorkflow.writeBack.disabled.prMismatch"
  | "githubWorkflow.writeBack.disabled.emptyBody"
  | "githubWorkflow.writeBack.disabled.missingThreadId"
  | "githubWorkflow.writeBack.disabled.emptyReviewers"
  | "githubWorkflow.writeBack.disabled.unsupportedPrState"
  | "githubWorkflow.writeBack.disabled.writeFailed"

export interface GitHubWriteBackConfirmationStateInput {
  action: GitHubWriteBackAction
  hasCurrentPr: boolean
  prState?: GitHubPrState | null
  body?: string | null
  threadId?: string | null
  reviewers?: string[] | null
  unavailableReason?: GitHubWorkflowUnavailableReason | null
}

export function getGitHubStatusTitleKey(
  reason: GitHubWorkflowStatusUiReason,
): GitHubWorkflowStatusTitleKey {
  if (reason === "gh_missing") return "githubWorkflow.status.ghMissing"
  if (reason === "gh_not_authenticated") {
    return "githubWorkflow.status.notAuthenticated"
  }
  if (reason === "not_github_repo") {
    return "githubWorkflow.status.notGithubRepo"
  }
  if (reason === "no_pr") return "githubWorkflow.status.noPr"
  if (reason === "invalid_url") return "githubWorkflow.status.invalidUrl"
  return "githubWorkflow.status.unavailable"
}

export function getGitHubStatusMessageKey(
  reason: GitHubWorkflowStatusUiReason | undefined,
): GitHubWorkflowStatusMessageKey {
  if (reason === "gh_missing") return "githubWorkflow.status.ghMissingMessage"
  if (reason === "gh_not_authenticated") {
    return "githubWorkflow.status.notAuthenticatedMessage"
  }
  if (reason === "not_github_repo") {
    return "githubWorkflow.status.notGithubRepoMessage"
  }
  if (reason === "no_pr") return "githubWorkflow.status.noPrMessage"
  if (reason === "invalid_url") return "githubWorkflow.status.invalidUrlMessage"
  return "githubWorkflow.status.unavailableMessage"
}

export function shouldOfferGitHubAuthLogin(
  reason: GitHubWorkflowStatusUiReason | undefined,
): boolean {
  return reason === "gh_not_authenticated"
}

export function getFailedGitHubChecks(
  checks: GitHubWorkflowCheck[] | null | undefined,
): GitHubWorkflowCheck[] {
  return (checks ?? []).filter((check) => check.status === "failure")
}

export function shouldShowNoFailedGitHubChecks(
  summary: GitHubChecksSummary | null | undefined,
  failedCheckCount: number,
): boolean {
  return !!summary && summary.total > 0 && failedCheckCount === 0
}

export function canSendGitHubReviewComments(
  context: GitHubReviewCommentsContext | null | undefined,
): boolean {
  return !!context && context.threads.length > 0
}

export function getGitHubDraftPrUnavailableMessageKey(
  reason: GitHubDraftPullRequestUnavailableReason,
): GitHubDraftPrUnavailableMessageKey | null {
  if (reason === "no_worktree") {
    return "githubWorkflow.draftPr.noWorktreeMessage"
  }
  if (reason === "not_github_repo") {
    return "githubWorkflow.draftPr.notGithubRepoMessage"
  }
  if (reason === "gh_missing") {
    return "githubWorkflow.draftPr.ghMissingMessage"
  }
  if (reason === "gh_not_authenticated") {
    return "githubWorkflow.draftPr.ghNotAuthenticatedMessage"
  }
  if (reason === "github_unavailable") {
    return "githubWorkflow.draftPr.githubUnavailableMessage"
  }
  if (reason === "dirty_worktree") {
    return "githubWorkflow.draftPr.dirtyWorktreeMessage"
  }
  if (reason === "branch_mismatch") {
    return "githubWorkflow.draftPr.branchMismatchMessage"
  }
  if (reason === "no_changes") {
    return "githubWorkflow.draftPr.noCommittedChangesMessage"
  }
  if (reason === "base_branch") {
    return "githubWorkflow.draftPr.baseBranchMessage"
  }
  if (reason === "existing_pr") {
    return "githubWorkflow.draftPr.existingPrMessage"
  }
  return null
}

export function getGitHubWriteBackActionLabelKey(
  action: GitHubWriteBackAction,
): GitHubWriteBackActionLabelKey {
  if (action === "pr_comment") {
    return "githubWorkflow.writeBack.action.prComment"
  }
  if (action === "review_thread_reply") {
    return "githubWorkflow.writeBack.action.reviewThreadReply"
  }
  if (action === "mark_ready_for_review") {
    return "githubWorkflow.writeBack.action.markReady"
  }
  return "githubWorkflow.writeBack.action.requestReviewers"
}

export function getGitHubWriteBackConfirmTitleKey(
  action: GitHubWriteBackAction,
): GitHubWriteBackConfirmTitleKey {
  if (action === "pr_comment") {
    return "githubWorkflow.writeBack.confirmTitle.prComment"
  }
  if (action === "review_thread_reply") {
    return "githubWorkflow.writeBack.confirmTitle.reviewThreadReply"
  }
  if (action === "mark_ready_for_review") {
    return "githubWorkflow.writeBack.confirmTitle.markReady"
  }
  return "githubWorkflow.writeBack.confirmTitle.requestReviewers"
}

export function getGitHubWriteBackConfirmDescriptionKey(
  action: GitHubWriteBackAction,
): GitHubWriteBackConfirmDescriptionKey {
  if (action === "pr_comment") {
    return "githubWorkflow.writeBack.confirmDescription.prComment"
  }
  if (action === "review_thread_reply") {
    return "githubWorkflow.writeBack.confirmDescription.reviewThreadReply"
  }
  if (action === "mark_ready_for_review") {
    return "githubWorkflow.writeBack.confirmDescription.markReady"
  }
  return "githubWorkflow.writeBack.confirmDescription.requestReviewers"
}

export function getGitHubWriteBackConfirmButtonKey(
  action: GitHubWriteBackAction,
): GitHubWriteBackConfirmButtonKey {
  if (action === "pr_comment") {
    return "githubWorkflow.writeBack.confirmButton.prComment"
  }
  if (action === "review_thread_reply") {
    return "githubWorkflow.writeBack.confirmButton.reviewThreadReply"
  }
  if (action === "mark_ready_for_review") {
    return "githubWorkflow.writeBack.confirmButton.markReady"
  }
  return "githubWorkflow.writeBack.confirmButton.requestReviewers"
}

export function getGitHubWriteBackDisabledMessageKey(
  reason: GitHubWriteBackUnavailableReason,
): GitHubWriteBackDisabledMessageKey {
  if (reason === "gh_missing") return "githubWorkflow.writeBack.disabled.ghMissing"
  if (reason === "gh_not_authenticated") {
    return "githubWorkflow.writeBack.disabled.notAuthenticated"
  }
  if (reason === "not_github_repo") {
    return "githubWorkflow.writeBack.disabled.notGithubRepo"
  }
  if (reason === "no_pr") return "githubWorkflow.writeBack.disabled.noPr"
  if (reason === "missing_pr_number") {
    return "githubWorkflow.writeBack.disabled.missingPrNumber"
  }
  if (reason === "pr_mismatch") {
    return "githubWorkflow.writeBack.disabled.prMismatch"
  }
  if (reason === "empty_body") {
    return "githubWorkflow.writeBack.disabled.emptyBody"
  }
  if (reason === "missing_thread_id") {
    return "githubWorkflow.writeBack.disabled.missingThreadId"
  }
  if (reason === "empty_reviewers") {
    return "githubWorkflow.writeBack.disabled.emptyReviewers"
  }
  if (reason === "unsupported_pr_state") {
    return "githubWorkflow.writeBack.disabled.unsupportedPrState"
  }
  if (reason === "write_failed") {
    return "githubWorkflow.writeBack.disabled.writeFailed"
  }
  return "githubWorkflow.writeBack.disabled.githubUnavailable"
}

export function normalizeGitHubWriteBackReviewerLogins(
  reviewers: string[] | null | undefined,
): string[] {
  const seen = new Set<string>()
  const normalized: string[] = []

  for (const reviewer of reviewers ?? []) {
    for (const value of reviewer.split(",")) {
      const login = value.trim().replace(/^@/, "")
      if (!login || seen.has(login)) continue
      seen.add(login)
      normalized.push(login)
    }
  }

  return normalized
}

export function getGitHubWriteBackConfirmationDisabledReason(
  input: GitHubWriteBackConfirmationStateInput,
): GitHubWriteBackUnavailableReason | null {
  if (input.unavailableReason) return input.unavailableReason
  if (!input.hasCurrentPr) return "no_pr"

  if (input.action === "mark_ready_for_review") {
    return input.prState === "draft" ? null : "unsupported_pr_state"
  }

  if (input.action === "review_thread_reply" && !input.threadId?.trim()) {
    return "missing_thread_id"
  }

  if (
    (input.action === "pr_comment" ||
      input.action === "review_thread_reply") &&
    !input.body?.trim()
  ) {
    return "empty_body"
  }

  if (
    input.action === "request_reviewers" &&
    normalizeGitHubWriteBackReviewerLogins(input.reviewers).length === 0
  ) {
    return "empty_reviewers"
  }

  return null
}

export function canConfirmGitHubWriteBack(
  input: GitHubWriteBackConfirmationStateInput,
): boolean {
  return getGitHubWriteBackConfirmationDisabledReason(input) === null
}

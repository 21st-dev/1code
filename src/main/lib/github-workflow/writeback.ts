import type {
  GitHubPrState,
  GitHubWriteBackAction,
  GitHubWriteBackPullRequestTarget,
  GitHubWriteBackRefreshHint,
  GitHubWriteBackRequest,
  GitHubWriteBackResult,
  GitHubWriteBackUnavailableReason,
} from "../../../shared/github-workflow-context"
import { getCurrentPullRequestContext } from "./current-pr-context"
import {
  classifyGitHubCommandError,
  getGitHubWorkflowStatus,
  getGitHubWorkflowUnavailableMessage,
} from "./status"
import { runGitHubCli } from "./gh-cli"
import { invalidateGitHubStatusCache } from "../git/github/github"

const REVIEW_THREAD_REPLY_MUTATION = `
mutation AddPullRequestReviewThreadReply($threadId: ID!, $body: String!) {
  addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: $threadId, body: $body }) {
    comment {
      id
      url
    }
  }
}
`.trim()

type ValidationResult =
  | { status: "valid"; request: GitHubWriteBackRequest }
  | Extract<GitHubWriteBackResult, { status: "unavailable" }>

type TargetResult =
  | { status: "found"; target: GitHubWriteBackPullRequestTarget }
  | Extract<GitHubWriteBackResult, { status: "unavailable" }>

function makeUnavailable(input: {
  action?: GitHubWriteBackAction
  reason: GitHubWriteBackUnavailableReason
  message: string
  repoSlug?: string
  repoUrl?: string
  branch?: string
  prNumber?: number
}): Extract<GitHubWriteBackResult, { status: "unavailable" }> {
  return {
    status: "unavailable",
    action: input.action,
    reason: input.reason,
    message: input.message,
    repoSlug: input.repoSlug,
    repoUrl: input.repoUrl,
    branch: input.branch,
    prNumber: input.prNumber,
    lastRefreshed: Date.now(),
  }
}

function makeCompleted(input: {
  action: GitHubWriteBackAction
  target: GitHubWriteBackPullRequestTarget
  message: string
  url?: string
  refreshHints: GitHubWriteBackRefreshHint[]
}): Extract<GitHubWriteBackResult, { status: "completed" }> {
  return {
    status: "completed",
    action: input.action,
    repoSlug: input.target.repoSlug,
    repoUrl: input.target.repoUrl,
    branch: input.target.branch,
    prNumber: input.target.pr.number,
    message: input.message,
    url: input.url,
    refreshHints: input.refreshHints,
    lastRefreshed: Date.now(),
  }
}

function isPositivePrNumber(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0
}

function extractGitHubUrl(output: string): string | undefined {
  const match = output.match(/https:\/\/github\.com\/[^\s)]+/)
  return match?.[0]
}

function normalizeBody(body: string): string {
  return body.trim()
}

export function normalizeGitHubReviewerLogins(reviewers: string[]): string[] {
  const seen = new Set<string>()
  const normalized: string[] = []

  for (const reviewer of reviewers) {
    for (const value of reviewer.split(",")) {
      const login = value.trim().replace(/^@/, "")
      if (!login || seen.has(login)) continue
      seen.add(login)
      normalized.push(login)
    }
  }

  return normalized
}

export function getGitHubWriteBackUnavailableMessage(
  reason: GitHubWriteBackUnavailableReason,
): string {
  if (
    reason === "no_worktree" ||
    reason === "not_github_repo" ||
    reason === "gh_missing" ||
    reason === "gh_not_authenticated" ||
    reason === "github_unavailable"
  ) {
    return getGitHubWorkflowUnavailableMessage(reason)
  }
  if (reason === "no_pr") {
    return "No current pull request is available for GitHub write-back."
  }
  if (reason === "missing_pr_number") {
    return "A pull request number is required before writing back to GitHub."
  }
  if (reason === "pr_mismatch") {
    return "The selected pull request no longer matches the current branch."
  }
  if (reason === "empty_body") {
    return "A public GitHub comment body is required."
  }
  if (reason === "missing_thread_id") {
    return "A review thread identifier is required before replying."
  }
  if (reason === "empty_reviewers") {
    return "At least one reviewer login is required."
  }
  if (reason === "unsupported_pr_state") {
    return "The current pull request state does not support this GitHub write-back action."
  }
  return "GitHub write-back failed. Check GitHub CLI output and repository access."
}

export function validateGitHubWriteBackRequest(
  request: GitHubWriteBackRequest,
): ValidationResult {
  if (!isPositivePrNumber(request.prNumber)) {
    return makeUnavailable({
      action: request.action,
      reason: "missing_pr_number",
      message: getGitHubWriteBackUnavailableMessage("missing_pr_number"),
    })
  }

  if (
    (request.action === "pr_comment" ||
      request.action === "review_thread_reply") &&
    !normalizeBody(request.body)
  ) {
    return makeUnavailable({
      action: request.action,
      reason: "empty_body",
      message: getGitHubWriteBackUnavailableMessage("empty_body"),
      prNumber: request.prNumber,
    })
  }

  if (
    request.action === "review_thread_reply" &&
    !request.threadId.trim()
  ) {
    return makeUnavailable({
      action: request.action,
      reason: "missing_thread_id",
      message: getGitHubWriteBackUnavailableMessage("missing_thread_id"),
      prNumber: request.prNumber,
    })
  }

  if (
    request.action === "request_reviewers" &&
    normalizeGitHubReviewerLogins(request.reviewers).length === 0
  ) {
    return makeUnavailable({
      action: request.action,
      reason: "empty_reviewers",
      message: getGitHubWriteBackUnavailableMessage("empty_reviewers"),
      prNumber: request.prNumber,
    })
  }

  return { status: "valid", request }
}

async function resolveWriteBackTarget(
  worktreePath: string | null | undefined,
  action: GitHubWriteBackAction,
  prNumber: number,
): Promise<TargetResult> {
  if (!worktreePath) {
    return makeUnavailable({
      action,
      reason: "no_worktree",
      message: getGitHubWriteBackUnavailableMessage("no_worktree"),
      prNumber,
    })
  }

  const workflowStatus = await getGitHubWorkflowStatus(worktreePath)
  if (workflowStatus.status === "unavailable") {
    return makeUnavailable({
      action,
      reason: workflowStatus.reason,
      message: workflowStatus.message,
      repoSlug: workflowStatus.repoSlug,
      repoUrl: workflowStatus.repoUrl,
      branch: workflowStatus.branch,
      prNumber,
    })
  }

  const currentPr = await getCurrentPullRequestContext(worktreePath)
  if (currentPr.status === "no_pr") {
    return makeUnavailable({
      action,
      reason: "no_pr",
      message: getGitHubWriteBackUnavailableMessage("no_pr"),
      repoSlug: workflowStatus.repoSlug,
      repoUrl: workflowStatus.repoUrl,
      branch: workflowStatus.branch,
      prNumber,
    })
  }
  if (currentPr.status === "unavailable") {
    return makeUnavailable({
      action,
      reason: currentPr.reason,
      message: currentPr.message,
      repoSlug: currentPr.repoSlug,
      repoUrl: currentPr.repoUrl,
      branch: currentPr.branch,
      prNumber,
    })
  }

  if (currentPr.context.pr.number !== prNumber) {
    return makeUnavailable({
      action,
      reason: "pr_mismatch",
      message: getGitHubWriteBackUnavailableMessage("pr_mismatch"),
      repoSlug: workflowStatus.repoSlug,
      repoUrl: workflowStatus.repoUrl,
      branch: workflowStatus.branch,
      prNumber,
    })
  }

  return {
    status: "found",
    target: {
      repoSlug: workflowStatus.repoSlug,
      repoUrl: workflowStatus.repoUrl,
      branch: workflowStatus.branch,
      pr: {
        number: currentPr.context.pr.number,
        title: currentPr.context.pr.title,
        url: currentPr.context.pr.url,
        state: currentPr.context.pr.state,
      },
    },
  }
}

export function buildGitHubPullRequestCommentArgs(input: {
  repoSlug: string
  prNumber: number
  body: string
}): string[] {
  return [
    "pr",
    "comment",
    String(input.prNumber),
    "--repo",
    input.repoSlug,
    "--body",
    input.body,
  ]
}

export function buildGitHubReviewThreadReplyArgs(input: {
  threadId: string
  body: string
}): string[] {
  return [
    "api",
    "graphql",
    "-f",
    `query=${REVIEW_THREAD_REPLY_MUTATION}`,
    "-f",
    `threadId=${input.threadId}`,
    "-f",
    `body=${input.body}`,
  ]
}

export function buildGitHubMarkReadyForReviewArgs(input: {
  repoSlug: string
  prNumber: number
}): string[] {
  return [
    "pr",
    "ready",
    String(input.prNumber),
    "--repo",
    input.repoSlug,
  ]
}

export function buildGitHubRequestReviewersArgs(input: {
  repoSlug: string
  prNumber: number
  reviewers: string[]
}): string[] {
  return [
    "pr",
    "edit",
    String(input.prNumber),
    "--repo",
    input.repoSlug,
    "--add-reviewer",
    input.reviewers.join(","),
  ]
}

async function runWriteBackCommand(
  worktreePath: string,
  args: string[],
): Promise<string> {
  const { stdout } = await runGitHubCli(args, {
    cwd: worktreePath,
    timeoutMs: 60_000,
  })
  return stdout
}

function mapWriteBackError(
  action: GitHubWriteBackAction,
  target: GitHubWriteBackPullRequestTarget,
  error: unknown,
): Extract<GitHubWriteBackResult, { status: "unavailable" }> {
  const commandReason = classifyGitHubCommandError(error)
  const reason: GitHubWriteBackUnavailableReason =
    commandReason === "github_unavailable" ? "write_failed" : commandReason

  return makeUnavailable({
    action,
    reason,
    message:
      reason === "write_failed"
        ? getGitHubWriteBackUnavailableMessage("write_failed")
        : getGitHubWriteBackUnavailableMessage(reason),
    repoSlug: target.repoSlug,
    repoUrl: target.repoUrl,
    branch: target.branch,
    prNumber: target.pr.number,
  })
}

function getRefreshHintsForAction(
  action: GitHubWriteBackAction,
): GitHubWriteBackRefreshHint[] {
  if (action === "review_thread_reply") {
    return ["review_comments", "current_pr", "github_status"]
  }
  return ["current_pr", "github_status"]
}

async function runConfirmedCommand(input: {
  worktreePath: string
  target: GitHubWriteBackPullRequestTarget
  action: GitHubWriteBackAction
  args: string[]
  successMessage: string
}): Promise<GitHubWriteBackResult> {
  try {
    const stdout = await runWriteBackCommand(input.worktreePath, input.args)
    invalidateGitHubStatusCache(input.worktreePath)
    return makeCompleted({
      action: input.action,
      target: input.target,
      message: input.successMessage,
      url: extractGitHubUrl(stdout),
      refreshHints: getRefreshHintsForAction(input.action),
    })
  } catch (error) {
    return mapWriteBackError(input.action, input.target, error)
  }
}

function isDraftPullRequestState(state: GitHubPrState): boolean {
  return state === "draft"
}

export async function runConfirmedGitHubWriteBack(
  worktreePath: string | null | undefined,
  request: GitHubWriteBackRequest,
): Promise<GitHubWriteBackResult> {
  const validation = validateGitHubWriteBackRequest(request)
  if (validation.status === "unavailable") return validation

  const targetResult = await resolveWriteBackTarget(
    worktreePath,
    request.action,
    request.prNumber,
  )
  if (targetResult.status === "unavailable") return targetResult

  const { target } = targetResult
  if (request.action === "pr_comment") {
    const body = normalizeBody(request.body)
    return runConfirmedCommand({
      worktreePath: worktreePath!,
      target,
      action: request.action,
      args: buildGitHubPullRequestCommentArgs({
        repoSlug: target.repoSlug,
        prNumber: target.pr.number,
        body,
      }),
      successMessage: `Posted a comment to PR #${target.pr.number}.`,
    })
  }

  if (request.action === "review_thread_reply") {
    const body = normalizeBody(request.body)
    return runConfirmedCommand({
      worktreePath: worktreePath!,
      target,
      action: request.action,
      args: buildGitHubReviewThreadReplyArgs({
        threadId: request.threadId.trim(),
        body,
      }),
      successMessage: `Posted a review-thread reply to PR #${target.pr.number}.`,
    })
  }

  if (request.action === "mark_ready_for_review") {
    if (!isDraftPullRequestState(target.pr.state)) {
      return makeUnavailable({
        action: request.action,
        reason: "unsupported_pr_state",
        message: "Only draft pull requests can be marked ready for review.",
        repoSlug: target.repoSlug,
        repoUrl: target.repoUrl,
        branch: target.branch,
        prNumber: target.pr.number,
      })
    }

    return runConfirmedCommand({
      worktreePath: worktreePath!,
      target,
      action: request.action,
      args: buildGitHubMarkReadyForReviewArgs({
        repoSlug: target.repoSlug,
        prNumber: target.pr.number,
      }),
      successMessage: `Marked PR #${target.pr.number} ready for review.`,
    })
  }

  const reviewers = normalizeGitHubReviewerLogins(request.reviewers)
  return runConfirmedCommand({
    worktreePath: worktreePath!,
    target,
    action: request.action,
    args: buildGitHubRequestReviewersArgs({
      repoSlug: target.repoSlug,
      prNumber: target.pr.number,
      reviewers,
    }),
    successMessage: `Requested ${reviewers.join(", ")} on PR #${target.pr.number}.`,
  })
}

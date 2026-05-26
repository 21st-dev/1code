export type GitHubPrState = "open" | "draft" | "merged" | "closed"
export type GitHubReviewDecision = "approved" | "changes_requested" | "pending"
export type GitHubCheckStatus =
  | "success"
  | "failure"
  | "pending"
  | "skipped"
  | "cancelled"

export interface GitHubWorkflowCheck {
  name: string
  status: GitHubCheckStatus
  url?: string
  runId?: number
  jobId?: number
  workflowName?: string
}

export interface GitHubChecksSummary {
  total: number
  passed: number
  failed: number
  pending: number
  skipped: number
  cancelled: number
}

export interface GitHubPrContext {
  repoUrl: string
  branch: string
  pr: {
    number: number
    title: string
    url: string
    state: GitHubPrState
    baseBranch?: string
    headBranch?: string
    authorLogin?: string
    body?: string
    additions: number
    deletions: number
    reviewDecision: GitHubReviewDecision
    checksStatus: "success" | "failure" | "pending" | "none"
    checks: GitHubWorkflowCheck[]
  }
  checksSummary: GitHubChecksSummary
}

export type GitHubTaskKind = "issue" | "pull_request"

export type GitHubWorkflowUnavailableReason =
  | "no_worktree"
  | "not_github_repo"
  | "gh_missing"
  | "gh_not_authenticated"
  | "github_unavailable"

export type GitHubWorkflowStatusResult =
  | {
      status: "available"
      repoSlug: string
      repoUrl: string
      branch: string
      defaultBranch?: string
      ghVersion?: string
      lastRefreshed: number
    }
  | {
      status: "unavailable"
      reason: GitHubWorkflowUnavailableReason
      message: string
      repoSlug?: string
      repoUrl?: string
      branch?: string
      defaultBranch?: string
      ghVersion?: string
      lastRefreshed: number
    }

export interface ParsedGitHubTaskUrl {
  kind: GitHubTaskKind
  owner: string
  repo: string
  repoSlug: string
  repoUrl: string
  number: number
  url: string
}

export type GitHubCurrentPrContextResult =
  | {
      status: "found"
      context: GitHubPrContext
      contextText: string
      lastRefreshed: number
    }
  | {
      status: "no_pr"
      repoUrl: string
      branch: string
      repoSlug?: string
      lastRefreshed: number
    }
  | {
      status: "unavailable"
      reason: GitHubWorkflowUnavailableReason
      message: string
      repoSlug?: string
      repoUrl?: string
      branch?: string
    }

export interface GitHubTaskCommentSummary {
  authorLogin?: string
  body: string
  createdAt?: string
  url?: string
}

export interface GitHubTaskContext {
  kind: GitHubTaskKind
  repoSlug: string
  repoUrl: string
  number: number
  title: string
  url: string
  state: string
  body?: string
  authorLogin?: string
  labels: string[]
  comments: GitHubTaskCommentSummary[]
  commentsCount: number
  pr?: {
    baseBranch?: string
    headBranch?: string
    additions?: number
    deletions?: number
    reviewDecision?: GitHubReviewDecision
    checks?: GitHubWorkflowCheck[]
    checksSummary?: GitHubChecksSummary
  }
}

export interface GitHubFailedCheckLogContext {
  repoSlug: string
  repoUrl: string
  branch: string
  pr: {
    number: number
    title: string
    url: string
  }
  check: GitHubWorkflowCheck
  runId: number
  runUrl?: string
  log: string
  truncated: boolean
  redacted: boolean
  fetchedAt: string
}

export interface GitHubReviewComment {
  id?: string
  authorLogin?: string
  body: string
  createdAt?: string
  url?: string
  path?: string
  line?: number
  originalLine?: number
  diffHunk?: string
}

export interface GitHubReviewCommentThread {
  id?: string
  path?: string
  line?: number
  startLine?: number
  isResolved: boolean
  isOutdated?: boolean
  comments: GitHubReviewComment[]
}

export interface GitHubReviewCommentsContext {
  repoSlug: string
  repoUrl: string
  branch: string
  pr: {
    number: number
    title: string
    url: string
  }
  threads: GitHubReviewCommentThread[]
  totalThreads: number
  unresolvedThreads: number
  commentsCount: number
  fetchedAt: string
}

export type GitHubTaskImportResult =
  | {
      status: "found"
      task: GitHubTaskContext
      contextText: string
      lastRefreshed: number
    }
  | {
      status: "invalid_url"
      reason: "invalid_url"
      message: string
    }
  | {
      status: "unavailable"
      reason: GitHubWorkflowUnavailableReason
      message: string
    }

export type GitHubFailedCheckLogResult =
  | {
      status: "found"
      context: GitHubFailedCheckLogContext
      contextText: string
      lastRefreshed: number
    }
  | {
      status: "unavailable"
      reason: GitHubWorkflowUnavailableReason | "check_not_found" | "no_actions_log"
      message: string
    }

export type GitHubReviewCommentsResult =
  | {
      status: "found"
      context: GitHubReviewCommentsContext
      contextText: string
      lastRefreshed: number
    }
  | {
      status: "unavailable"
      reason: GitHubWorkflowUnavailableReason | "no_pr" | "review_comments_unavailable"
      message: string
    }

export type GitHubDraftPullRequestUnavailableReason =
  | GitHubWorkflowUnavailableReason
  | "existing_pr"
  | "base_branch"
  | "no_changes"
  | "dirty_worktree"
  | "branch_mismatch"
  | "create_failed"

export type GitHubDraftPullRequestFileStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "untracked"
  | "unknown"

export interface GitHubDraftPullRequestChangedFile {
  path: string
  status: GitHubDraftPullRequestFileStatus
  additions?: number
  deletions?: number
}

export interface GitHubDraftPullRequestPreparation {
  repoSlug: string
  repoUrl: string
  branch: string
  baseBranch: string
  draft: true
  changedFiles: GitHubDraftPullRequestChangedFile[]
  commits: string[]
  title: string
  summary: string
  testPlan: string
  body: string
}

export type GitHubDraftPullRequestPreparationResult =
  | {
      status: "prepared"
      preparation: GitHubDraftPullRequestPreparation
      lastRefreshed: number
    }
  | {
      status: "unavailable"
      reason: GitHubDraftPullRequestUnavailableReason
      message: string
      repoSlug?: string
      repoUrl?: string
      branch?: string
      baseBranch?: string
      lastRefreshed: number
    }

export interface GitHubDraftPullRequestCreateRequest {
  branch: string
  baseBranch: string
  title: string
  body: string
}

export type GitHubDraftPullRequestCreationResult =
  | {
      status: "created"
      url: string
      branch: string
      baseBranch: string
      title: string
      lastRefreshed: number
    }
  | {
      status: "unavailable"
      reason: GitHubDraftPullRequestUnavailableReason
      message: string
      repoSlug?: string
      repoUrl?: string
      branch?: string
      baseBranch?: string
      existingPrUrl?: string
      lastRefreshed: number
    }

export type GitHubWriteBackAction =
  | "pr_comment"
  | "review_thread_reply"
  | "mark_ready_for_review"
  | "request_reviewers"

export type GitHubWriteBackRefreshHint =
  | "github_status"
  | "current_pr"
  | "review_comments"

export type GitHubWriteBackUnavailableReason =
  | GitHubWorkflowUnavailableReason
  | "no_pr"
  | "missing_pr_number"
  | "pr_mismatch"
  | "empty_body"
  | "missing_thread_id"
  | "empty_reviewers"
  | "unsupported_pr_state"
  | "write_failed"

export interface GitHubWriteBackPullRequestTarget {
  repoSlug: string
  repoUrl: string
  branch: string
  pr: {
    number: number
    title: string
    url: string
    state: GitHubPrState
  }
}

interface GitHubWriteBackConfirmedRequestBase {
  confirmed: true
  prNumber: number
}

export interface GitHubPullRequestCommentWriteBackRequest
  extends GitHubWriteBackConfirmedRequestBase {
  action: "pr_comment"
  body: string
}

export interface GitHubReviewThreadReplyWriteBackRequest
  extends GitHubWriteBackConfirmedRequestBase {
  action: "review_thread_reply"
  threadId: string
  body: string
}

export interface GitHubMarkReadyForReviewWriteBackRequest
  extends GitHubWriteBackConfirmedRequestBase {
  action: "mark_ready_for_review"
}

export interface GitHubRequestReviewersWriteBackRequest
  extends GitHubWriteBackConfirmedRequestBase {
  action: "request_reviewers"
  reviewers: string[]
}

export type GitHubWriteBackRequest =
  | GitHubPullRequestCommentWriteBackRequest
  | GitHubReviewThreadReplyWriteBackRequest
  | GitHubMarkReadyForReviewWriteBackRequest
  | GitHubRequestReviewersWriteBackRequest

export type GitHubWriteBackResult =
  | {
      status: "completed"
      action: GitHubWriteBackAction
      repoSlug: string
      repoUrl: string
      branch: string
      prNumber: number
      message: string
      url?: string
      refreshHints: GitHubWriteBackRefreshHint[]
      lastRefreshed: number
    }
  | {
      status: "unavailable"
      action?: GitHubWriteBackAction
      reason: GitHubWriteBackUnavailableReason
      message: string
      repoSlug?: string
      repoUrl?: string
      branch?: string
      prNumber?: number
      lastRefreshed: number
    }

export interface ParsedGitHubRemote {
  repoSlug: string
  repoUrl: string
}

const MAX_PR_BODY_CHARS = 4_000
const MAX_CHECKS_IN_CONTEXT = 50
const MAX_TASK_BODY_CHARS = 5_000
const MAX_COMMENTS_IN_CONTEXT = 5
const MAX_COMMENT_BODY_CHARS = 1_000
const MAX_REVIEW_THREADS_IN_CONTEXT = 20
const MAX_REVIEW_COMMENTS_PER_THREAD = 5
const MAX_REVIEW_COMMENT_BODY_CHARS = 1_200
const MAX_REVIEW_DIFF_HUNK_CHARS = 1_500
const MAX_DRAFT_PR_BODY_FILES = 20
const MAX_DRAFT_PR_BODY_COMMITS = 8
export const MAX_GITHUB_CI_LOG_CHARS = 30_000

export function parseGitHubRemoteUrl(
  remoteUrl: string | null | undefined,
): ParsedGitHubRemote | null {
  const normalized = remoteUrl?.trim().replace(/\.git$/, "")
  if (!normalized) return null

  const httpsMatch = normalized.match(
    /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+)$/,
  )
  if (httpsMatch) {
    const repoSlug = `${httpsMatch[1]}/${httpsMatch[2]}`
    return {
      repoSlug,
      repoUrl: `https://github.com/${repoSlug}`,
    }
  }

  const sshMatch = normalized.match(/^git@github\.com:([^/\s]+)\/([^/\s]+)$/)
  if (sshMatch) {
    const repoSlug = `${sshMatch[1]}/${sshMatch[2]}`
    return {
      repoSlug,
      repoUrl: `https://github.com/${repoSlug}`,
    }
  }

  const sshUrlMatch = normalized.match(
    /^ssh:\/\/git@github\.com\/([^/\s]+)\/([^/\s]+)$/,
  )
  if (sshUrlMatch) {
    const repoSlug = `${sshUrlMatch[1]}/${sshUrlMatch[2]}`
    return {
      repoSlug,
      repoUrl: `https://github.com/${repoSlug}`,
    }
  }

  return null
}

export function parseGitHubTaskUrl(
  input: string,
  baseRepoSlug?: string | null,
): ParsedGitHubTaskUrl | null {
  const value = input.trim()
  if (!value) return null

  const absoluteMatch = value.match(
    /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/(issues|pull)\/(\d+)(?:[/?#].*)?$/,
  )
  if (absoluteMatch) {
    const [, owner, repo, rawKind, rawNumber] = absoluteMatch
    const kind: GitHubTaskKind =
      rawKind === "pull" ? "pull_request" : "issue"
    const repoSlug = `${owner}/${repo}`
    const number = Number(rawNumber)
    if (!Number.isInteger(number) || number <= 0) return null
    return {
      kind,
      owner,
      repo,
      repoSlug,
      repoUrl: `https://github.com/${repoSlug}`,
      number,
      url: `https://github.com/${repoSlug}/${rawKind}/${number}`,
    }
  }

  const relativeMatch = value.match(/^\/?(issues|pull)\/(\d+)(?:[/?#].*)?$/)
  if (!relativeMatch || !baseRepoSlug) return null

  const repoMatch = baseRepoSlug.match(/^([^/\s]+)\/([^/\s]+)$/)
  if (!repoMatch) return null

  const [, rawKind, rawNumber] = relativeMatch
  const [, owner, repo] = repoMatch
  const kind: GitHubTaskKind = rawKind === "pull" ? "pull_request" : "issue"
  const number = Number(rawNumber)
  if (!Number.isInteger(number) || number <= 0) return null

  return {
    kind,
    owner,
    repo,
    repoSlug: baseRepoSlug,
    repoUrl: `https://github.com/${baseRepoSlug}`,
    number,
    url: `https://github.com/${baseRepoSlug}/${rawKind}/${number}`,
  }
}

function truncateContextText(value: string, limit: number): string {
  if (value.length <= limit) return value
  return `${value.slice(0, limit).trimEnd()}\n\n[Truncated after ${limit} characters]`
}

export function parseGitHubActionsRunId(
  url: string | null | undefined,
): number | null {
  const match = url?.match(/\/actions\/runs\/(\d+)(?:[/?#]|$)/)
  if (!match) return null

  const runId = Number(match[1])
  return Number.isSafeInteger(runId) && runId > 0 ? runId : null
}

export function parseGitHubActionsJobId(
  url: string | null | undefined,
): number | null {
  const match = url?.match(/\/job\/(\d+)(?:[/?#]|$)/)
  if (!match) return null

  const jobId = Number(match[1])
  return Number.isSafeInteger(jobId) && jobId > 0 ? jobId : null
}

export function boundGitHubLogText(
  log: string,
  limit = MAX_GITHUB_CI_LOG_CHARS,
): { log: string; truncated: boolean } {
  if (log.length <= limit) {
    return { log, truncated: false }
  }

  const headLength = Math.floor(limit * 0.4)
  const tailLength = limit - headLength
  const omitted = log.length - limit
  return {
    log: [
      log.slice(0, headLength).trimEnd(),
      "",
      `[Truncated ${omitted} characters from the middle of this CI log]`,
      "",
      log.slice(-tailLength).trimStart(),
    ].join("\n"),
    truncated: true,
  }
}

export function redactGitHubLogText(log: string): {
  log: string
  redacted: boolean
} {
  const patterns = [
    /\bghp_[A-Za-z0-9_]{20,}\b/g,
    /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
    /\bAKIA[0-9A-Z]{16}\b/g,
    /\bsk-[A-Za-z0-9_-]{20,}\b/g,
    /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g,
    /\b(?:token|secret|password|api[_-]?key|authorization)(\s*[:=]\s*)([^\s'"`]+)\b/gi,
  ]

  let redacted = false
  let output = log

  for (const pattern of patterns) {
    output = output.replace(pattern, (match, separator) => {
      redacted = true
      if (typeof separator === "string") {
        const key = match.slice(0, match.indexOf(separator))
        return `${key}${separator}[REDACTED]`
      }
      return "[REDACTED]"
    })
  }

  return { log: output, redacted }
}

export function summarizeGitHubChecks(
  checks: GitHubWorkflowCheck[],
): GitHubChecksSummary {
  const summary: GitHubChecksSummary = {
    total: checks.length,
    passed: 0,
    failed: 0,
    pending: 0,
    skipped: 0,
    cancelled: 0,
  }

  for (const check of checks) {
    if (check.status === "success") {
      summary.passed += 1
    } else if (check.status === "failure") {
      summary.failed += 1
    } else if (check.status === "pending") {
      summary.pending += 1
    } else if (check.status === "skipped") {
      summary.skipped += 1
    } else if (check.status === "cancelled") {
      summary.cancelled += 1
    }
  }

  return summary
}

export function formatGitHubChecksSummary(
  summary: GitHubChecksSummary,
): string {
  if (summary.total === 0) return "No checks reported"

  const parts = [
    `${summary.passed} passed`,
    `${summary.failed} failed`,
    `${summary.pending} pending`,
  ]

  if (summary.skipped > 0) {
    parts.push(`${summary.skipped} skipped`)
  }
  if (summary.cancelled > 0) {
    parts.push(`${summary.cancelled} cancelled`)
  }

  return parts.join(", ")
}

export function formatGitHubPrState(state: GitHubPrState): string {
  if (state === "draft") return "Draft"
  if (state === "merged") return "Merged"
  if (state === "closed") return "Closed"
  return "Open"
}

export function formatGitHubReviewDecision(
  decision: GitHubReviewDecision,
): string {
  if (decision === "approved") return "Approved"
  if (decision === "changes_requested") return "Changes requested"
  return "Pending"
}

export function buildGitHubPrContextText(context: GitHubPrContext): string {
  const { pr } = context
  const lines = [
    "Use this GitHub pull request context for the current task.",
    "",
    "## Pull Request",
    `Repository: ${context.repoUrl}`,
    `PR: #${pr.number} ${pr.title}`,
    `URL: ${pr.url}`,
    `State: ${formatGitHubPrState(pr.state)}`,
    `Branch: ${context.branch}`,
  ]

  if (pr.baseBranch) {
    lines.push(`Base branch: ${pr.baseBranch}`)
  }
  if (pr.headBranch) {
    lines.push(`Head branch: ${pr.headBranch}`)
  }
  if (pr.authorLogin) {
    lines.push(`Author: ${pr.authorLogin}`)
  }

  lines.push(
    `Review: ${formatGitHubReviewDecision(pr.reviewDecision)}`,
    `Checks: ${formatGitHubChecksSummary(context.checksSummary)}`,
    `Diff stats: +${pr.additions} -${pr.deletions}`,
  )

  if (pr.body?.trim()) {
    lines.push(
      "",
      "## PR Description",
      truncateContextText(pr.body.trim(), MAX_PR_BODY_CHARS),
    )
  }

  if (pr.checks.length > 0) {
    lines.push("", "## Checks")
    for (const check of pr.checks.slice(0, MAX_CHECKS_IN_CONTEXT)) {
      lines.push(`- ${check.status}: ${check.name}`)
    }
    if (pr.checks.length > MAX_CHECKS_IN_CONTEXT) {
      lines.push(
        `- ${pr.checks.length - MAX_CHECKS_IN_CONTEXT} additional checks omitted`,
      )
    }
  }

  lines.push(
    "",
    "Do not assume GitHub has been updated unless you run or request an explicit GitHub operation.",
  )

  return lines.join("\n")
}

export function formatGitHubTaskKind(kind: GitHubTaskKind): string {
  return kind === "pull_request" ? "Pull Request" : "Issue"
}

export function buildGitHubTaskContextText(context: GitHubTaskContext): string {
  const taskKind = formatGitHubTaskKind(context.kind)
  const lines = [
    `Use this GitHub ${taskKind.toLowerCase()} context for the current task.`,
    "",
    `## ${taskKind}`,
    `Repository: ${context.repoUrl}`,
    `${taskKind}: #${context.number} ${context.title}`,
    `URL: ${context.url}`,
    `State: ${context.state}`,
  ]

  if (context.authorLogin) {
    lines.push(`Author: ${context.authorLogin}`)
  }
  if (context.labels.length > 0) {
    lines.push(`Labels: ${context.labels.join(", ")}`)
  }

  if (context.pr) {
    if (context.pr.baseBranch) {
      lines.push(`Base branch: ${context.pr.baseBranch}`)
    }
    if (context.pr.headBranch) {
      lines.push(`Head branch: ${context.pr.headBranch}`)
    }
    if (context.pr.reviewDecision) {
      lines.push(
        `Review: ${formatGitHubReviewDecision(context.pr.reviewDecision)}`,
      )
    }
    if (context.pr.checksSummary) {
      lines.push(`Checks: ${formatGitHubChecksSummary(context.pr.checksSummary)}`)
    }
    if (
      typeof context.pr.additions === "number" &&
      typeof context.pr.deletions === "number"
    ) {
      lines.push(`Diff stats: +${context.pr.additions} -${context.pr.deletions}`)
    }
  }

  if (context.body?.trim()) {
    lines.push(
      "",
      "## Description",
      truncateContextText(context.body.trim(), MAX_TASK_BODY_CHARS),
    )
  }

  lines.push("", `## Comments`, `${context.commentsCount} comments`)
  if (context.comments.length > 0) {
    for (const comment of context.comments.slice(0, MAX_COMMENTS_IN_CONTEXT)) {
      const author = comment.authorLogin ? ` by ${comment.authorLogin}` : ""
      const created = comment.createdAt ? ` at ${comment.createdAt}` : ""
      lines.push(
        "",
        `### Comment${author}${created}`,
        truncateContextText(comment.body.trim(), MAX_COMMENT_BODY_CHARS),
      )
    }
    if (context.commentsCount > MAX_COMMENTS_IN_CONTEXT) {
      lines.push(
        "",
        `${context.commentsCount - MAX_COMMENTS_IN_CONTEXT} additional comments omitted.`,
      )
    }
  }

  if (context.pr?.checks?.length) {
    lines.push("", "## Checks")
    for (const check of context.pr.checks.slice(0, MAX_CHECKS_IN_CONTEXT)) {
      lines.push(`- ${check.status}: ${check.name}`)
    }
    if (context.pr.checks.length > MAX_CHECKS_IN_CONTEXT) {
      lines.push(
        `- ${context.pr.checks.length - MAX_CHECKS_IN_CONTEXT} additional checks omitted`,
      )
    }
  }

  lines.push(
    "",
    "Do not assume GitHub has been updated unless you run or request an explicit GitHub operation.",
  )

  return lines.join("\n")
}

export function buildGitHubFailedCheckLogContextText(
  context: GitHubFailedCheckLogContext,
): string {
  const lines = [
    "Use this GitHub CI failure context for the current task.",
    "",
    "## Pull Request",
    `Repository: ${context.repoUrl}`,
    `PR: #${context.pr.number} ${context.pr.title}`,
    `URL: ${context.pr.url}`,
    `Branch: ${context.branch}`,
    "",
    "## Failed Check",
    `Check: ${context.check.name}`,
    `Status: ${context.check.status}`,
    `Workflow: ${context.check.workflowName || "Unknown"}`,
    `Run ID: ${context.runId}`,
  ]

  if (context.runUrl) {
    lines.push(`Run URL: ${context.runUrl}`)
  }

  if (context.truncated) {
    lines.push("Log: bounded and truncated")
  } else {
    lines.push("Log: bounded")
  }
  if (context.redacted) {
    lines.push("Redaction: secret-like values were redacted")
  }

  lines.push(
    "",
    "## Bounded Failed Log",
    "```text",
    context.log,
    "```",
    "",
    "Use this log as evidence. Do not assume GitHub has been updated unless you run or request an explicit GitHub operation.",
  )

  return lines.join("\n")
}

export function buildGitHubReviewCommentsContextText(
  context: GitHubReviewCommentsContext,
): string {
  const lines = [
    "Use this GitHub pull request review feedback context for the current task.",
    "",
    "## Pull Request",
    `Repository: ${context.repoUrl}`,
    `PR: #${context.pr.number} ${context.pr.title}`,
    `URL: ${context.pr.url}`,
    `Branch: ${context.branch}`,
    `Review threads: ${context.unresolvedThreads} unresolved of ${context.totalThreads} total`,
  ]

  if (context.threads.length === 0) {
    lines.push("", "## Review Feedback", "No unresolved review comments.")
  } else {
    lines.push("", "## Unresolved Review Feedback")
    for (const thread of context.threads.slice(0, MAX_REVIEW_THREADS_IN_CONTEXT)) {
      const locationParts = [
        thread.path || "Unknown file",
        typeof thread.line === "number" ? `line ${thread.line}` : undefined,
      ].filter(Boolean)

      lines.push("", `### ${locationParts.join(": ")}`)
      if (thread.isOutdated) {
        lines.push("Thread status: outdated")
      }

      for (const comment of thread.comments.slice(0, MAX_REVIEW_COMMENTS_PER_THREAD)) {
        const author = comment.authorLogin ? ` by ${comment.authorLogin}` : ""
        const created = comment.createdAt ? ` at ${comment.createdAt}` : ""
        lines.push("", `Comment${author}${created}:`)
        lines.push(
          truncateContextText(
            comment.body.trim() || "[Empty review comment]",
            MAX_REVIEW_COMMENT_BODY_CHARS,
          ),
        )

        if (comment.url) {
          lines.push(`URL: ${comment.url}`)
        }
        if (comment.diffHunk?.trim()) {
          lines.push(
            "",
            "Relevant diff hunk:",
            "```diff",
            truncateContextText(
              comment.diffHunk.trim(),
              MAX_REVIEW_DIFF_HUNK_CHARS,
            ),
            "```",
          )
        }
      }

      if (thread.comments.length > MAX_REVIEW_COMMENTS_PER_THREAD) {
        lines.push(
          "",
          `${thread.comments.length - MAX_REVIEW_COMMENTS_PER_THREAD} additional comments in this thread omitted.`,
        )
      }
    }

    if (context.threads.length > MAX_REVIEW_THREADS_IN_CONTEXT) {
      lines.push(
        "",
        `${context.threads.length - MAX_REVIEW_THREADS_IN_CONTEXT} additional review threads omitted.`,
      )
    }
  }

  lines.push(
    "",
    "Use this review feedback as a fix task. Do not reply to, resolve, or mutate GitHub review threads unless the user explicitly asks.",
  )

  return lines.join("\n")
}

function formatDraftPrFileStatus(
  status: GitHubDraftPullRequestFileStatus,
): string {
  if (status === "added") return "Added"
  if (status === "modified") return "Modified"
  if (status === "deleted") return "Deleted"
  if (status === "renamed") return "Renamed"
  if (status === "copied") return "Copied"
  if (status === "untracked") return "Untracked"
  return "Changed"
}

export function titleFromGitHubBranch(branch: string): string {
  const withoutPrefix = branch
    .replace(/^(codex|claude|feature|feat|fix|bugfix|hotfix|chore|docs|doc|refactor|test|tests|release)[/-]/i, "")
    .replace(/^\d+[/-]/, "")
  const words = withoutPrefix
    .replace(/[#_]+/g, "-")
    .split(/[-/\s]+/)
    .map((part) => part.trim())
    .filter(Boolean)

  if (words.length === 0) return `Update ${branch}`

  const title = words
    .map((word, index) => {
      const lower = word.toLowerCase()
      if (index > 0 && /^(api|cli|ci|ui|ux|pr|url|id)$/.test(lower)) {
        return lower.toUpperCase()
      }
      return lower
    })
    .join(" ")

  return title.charAt(0).toUpperCase() + title.slice(1)
}

export function buildGitHubDraftPullRequestBody(input: {
  summary: string
  testPlan: string
  changedFiles?: GitHubDraftPullRequestChangedFile[]
  commits?: string[]
}): string {
  const lines = [
    "## Summary",
    input.summary.trim() || "- Update this branch.",
    "",
    "## Test plan",
    input.testPlan.trim() ||
      "- Not run (draft prepared from local Git state).",
  ]

  const commits = input.commits?.filter(Boolean) ?? []
  if (commits.length > 0) {
    lines.push("", "## Local commits")
    for (const commit of commits.slice(0, MAX_DRAFT_PR_BODY_COMMITS)) {
      lines.push(`- ${commit}`)
    }
    if (commits.length > MAX_DRAFT_PR_BODY_COMMITS) {
      lines.push(
        `- ${commits.length - MAX_DRAFT_PR_BODY_COMMITS} additional commits omitted`,
      )
    }
  }

  const changedFiles = input.changedFiles ?? []
  if (changedFiles.length > 0) {
    lines.push("", "## Changed files")
    for (const file of changedFiles.slice(0, MAX_DRAFT_PR_BODY_FILES)) {
      lines.push(`- ${formatDraftPrFileStatus(file.status)}: ${file.path}`)
    }
    if (changedFiles.length > MAX_DRAFT_PR_BODY_FILES) {
      lines.push(
        `- ${changedFiles.length - MAX_DRAFT_PR_BODY_FILES} additional files omitted`,
      )
    }
  }

  return lines.join("\n")
}

export function createGitHubDraftPullRequestPreparation(input: {
  repoSlug: string
  repoUrl: string
  branch: string
  baseBranch: string
  changedFiles: GitHubDraftPullRequestChangedFile[]
  commits: string[]
}): GitHubDraftPullRequestPreparation {
  const fileCount = input.changedFiles.length
  const commitCount = input.commits.length
  const title = titleFromGitHubBranch(input.branch)
  const summaryLines: string[] = []

  if (commitCount > 0) {
    for (const commit of input.commits.slice(0, 3)) {
      summaryLines.push(`- ${commit}`)
    }
    if (commitCount > 3) {
      summaryLines.push(`- ${commitCount - 3} more local commits`)
    }
  } else if (fileCount > 0) {
    summaryLines.push(
      `- Update ${fileCount} changed file${fileCount === 1 ? "" : "s"} on ${input.branch}.`,
    )
  } else {
    summaryLines.push(`- Update ${input.branch}.`)
  }

  if (fileCount > 0) {
    const fileList = input.changedFiles
      .slice(0, 5)
      .map((file) => file.path)
      .join(", ")
    summaryLines.push(`- Touches ${fileList}${fileCount > 5 ? ", and more" : ""}.`)
  }

  const summary = summaryLines.join("\n")
  const testPlan = "- Not run (draft prepared from local Git state)."

  return {
    repoSlug: input.repoSlug,
    repoUrl: input.repoUrl,
    branch: input.branch,
    baseBranch: input.baseBranch,
    draft: true,
    changedFiles: input.changedFiles,
    commits: input.commits,
    title,
    summary,
    testPlan,
    body: buildGitHubDraftPullRequestBody({
      summary,
      testPlan,
      changedFiles: input.changedFiles,
      commits: input.commits,
    }),
  }
}

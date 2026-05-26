import {
  buildGitHubPrContextText,
  summarizeGitHubChecks,
  type GitHubCurrentPrContextResult,
  type GitHubCheckStatus,
  type GitHubPrContext,
  type GitHubPrState,
  type GitHubReviewDecision,
} from "../../../shared/github-workflow-context"
import { parseChecks } from "../git/github/github"
import { GHPRResponseSchema, type GHPRResponse } from "../git/github/types"
import {
  classifyGitHubCommandError,
  isNoPullRequestFoundError,
  runGitHubCliJson,
} from "./gh-cli"
import {
  getGitHubWorkflowStatus,
  getGitHubWorkflowUnavailableMessage,
} from "./status"

const PR_VIEW_FIELDS =
  "number,title,url,state,isDraft,baseRefName,headRefName,body,author,mergedAt,additions,deletions,reviewDecision,statusCheckRollup,mergeable"

function mapPrState(
  state: GHPRResponse["state"],
  isDraft: boolean,
): GitHubPrState {
  if (state === "MERGED") return "merged"
  if (state === "CLOSED") return "closed"
  if (isDraft) return "draft"
  return "open"
}

function mapReviewDecision(
  decision: GHPRResponse["reviewDecision"],
): GitHubReviewDecision {
  if (decision === "APPROVED") return "approved"
  if (decision === "CHANGES_REQUESTED") return "changes_requested"
  return "pending"
}

function computeChecksStatus(
  checks: Array<{ status: GitHubCheckStatus }>,
): GitHubPrContext["pr"]["checksStatus"] {
  if (checks.length === 0) return "none"
  if (checks.some((check) => check.status === "failure")) return "failure"
  if (checks.some((check) => check.status === "pending")) return "pending"
  return "success"
}

export async function getCurrentPullRequestContext(
  worktreePath: string | null | undefined,
): Promise<GitHubCurrentPrContextResult> {
  if (!worktreePath) {
    return {
      status: "unavailable",
      reason: "no_worktree",
      message: getGitHubWorkflowUnavailableMessage("no_worktree"),
    }
  }

  const workflowStatus = await getGitHubWorkflowStatus(worktreePath)
  if (workflowStatus.status === "unavailable") {
    return {
      status: "unavailable",
      reason: workflowStatus.reason,
      message: workflowStatus.message,
      repoSlug: workflowStatus.repoSlug,
      repoUrl: workflowStatus.repoUrl,
      branch: workflowStatus.branch,
    }
  }

  try {
    const data = await runGitHubCliJson(
      [
        "pr",
        "view",
        workflowStatus.branch,
        "--repo",
        workflowStatus.repoSlug,
        "--json",
        PR_VIEW_FIELDS,
      ],
      GHPRResponseSchema,
      {
        cwd: worktreePath,
        commandDescription: "GitHub pull request",
      },
    )
    const checks = parseChecks(data.statusCheckRollup)
    const context: GitHubPrContext = {
      repoUrl: workflowStatus.repoUrl,
      branch: workflowStatus.branch,
      pr: {
        number: data.number,
        title: data.title,
        url: data.url,
        state: mapPrState(data.state, data.isDraft),
        baseBranch: data.baseRefName ?? undefined,
        headBranch: data.headRefName ?? undefined,
        authorLogin: data.author?.login,
        body: data.body ?? undefined,
        additions: data.additions,
        deletions: data.deletions,
        reviewDecision: mapReviewDecision(data.reviewDecision),
        checksStatus: computeChecksStatus(checks),
        checks,
      },
      checksSummary: summarizeGitHubChecks(checks),
    }

    return {
      status: "found",
      context,
      contextText: buildGitHubPrContextText(context),
      lastRefreshed: Date.now(),
    }
  } catch (error) {
    if (isNoPullRequestFoundError(error)) {
      return {
        status: "no_pr",
        repoUrl: workflowStatus.repoUrl,
        repoSlug: workflowStatus.repoSlug,
        branch: workflowStatus.branch,
        lastRefreshed: Date.now(),
      }
    }

    const reason = classifyGitHubCommandError(error)
    return {
      status: "unavailable",
      reason,
      message: getGitHubWorkflowUnavailableMessage(reason),
      repoSlug: workflowStatus.repoSlug,
      repoUrl: workflowStatus.repoUrl,
      branch: workflowStatus.branch,
    }
  }
}

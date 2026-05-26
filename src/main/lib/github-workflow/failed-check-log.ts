import {
  boundGitHubLogText,
  buildGitHubFailedCheckLogContextText,
  parseGitHubActionsRunId,
  redactGitHubLogText,
  type GitHubFailedCheckLogResult,
} from "../../../shared/github-workflow-context"
import { runGitHubCli } from "./gh-cli"
import { getCurrentPullRequestContext } from "./current-pr-context"
import {
  classifyGitHubCommandError,
  getGitHubCliStatus,
  getGitHubWorkflowStatus,
  getGitHubWorkflowUnavailableMessage,
} from "./status"

function getRunIdFromCheck(input: {
  runId?: number
  checkUrl?: string
}): number | null {
  if (typeof input.runId === "number" && Number.isSafeInteger(input.runId)) {
    return input.runId
  }
  return parseGitHubActionsRunId(input.checkUrl)
}

function buildFailedLogArgs(input: {
  repoSlug: string
  runId: number
  jobId?: number
}): string[] {
  const args = [
    "run",
    "view",
    String(input.runId),
    "--repo",
    input.repoSlug,
  ]

  if (typeof input.jobId === "number") {
    args.push("--job", String(input.jobId))
  }

  args.push("--log-failed")
  return args
}

export async function getFailedCheckLogContext(input: {
  worktreePath?: string | null
  checkName: string
  runId?: number
}): Promise<GitHubFailedCheckLogResult> {
  const workflowStatus = await getGitHubWorkflowStatus(input.worktreePath)
  if (workflowStatus.status === "unavailable") {
    return {
      status: "unavailable",
      reason: workflowStatus.reason,
      message: workflowStatus.message,
    }
  }

  const currentPr = await getCurrentPullRequestContext(input.worktreePath)
  if (currentPr.status !== "found") {
    return {
      status: "unavailable",
      reason: "check_not_found",
      message: "No current pull request with failed checks is available.",
    }
  }

  const failedChecks = currentPr.context.pr.checks.filter(
    (check) => check.status === "failure",
  )
  const check = failedChecks.find((candidate) => {
    if (candidate.name !== input.checkName) return false
    if (typeof input.runId !== "number") return true
    return candidate.runId === input.runId
  })

  if (!check) {
    return {
      status: "unavailable",
      reason: "check_not_found",
      message: "The selected failed check is no longer available on the current pull request.",
    }
  }

  const runId = getRunIdFromCheck({ runId: check.runId, checkUrl: check.url })
  if (!runId) {
    return {
      status: "unavailable",
      reason: "no_actions_log",
      message:
        "This failed check does not expose a GitHub Actions run log that Locus can load through gh.",
    }
  }

  const cliStatus = await getGitHubCliStatus(input.worktreePath)
  if (cliStatus.status === "unavailable") {
    return {
      status: "unavailable",
      reason: cliStatus.reason,
      message: cliStatus.message,
    }
  }

  try {
    const { stdout } = await runGitHubCli(
      buildFailedLogArgs({
        repoSlug: workflowStatus.repoSlug,
        runId,
        jobId: check.jobId,
      }),
      {
        cwd: input.worktreePath ?? undefined,
        maxBuffer: 5 * 1024 * 1024,
        timeoutMs: 60_000,
      },
    )

    const rawLog = stdout.trim()
    const redacted = redactGitHubLogText(rawLog)
    const bounded = boundGitHubLogText(redacted.log)
    const runUrl =
      check.url ?? `https://github.com/${workflowStatus.repoSlug}/actions/runs/${runId}`
    const context = {
      repoSlug: workflowStatus.repoSlug,
      repoUrl: workflowStatus.repoUrl,
      branch: currentPr.context.branch,
      pr: {
        number: currentPr.context.pr.number,
        title: currentPr.context.pr.title,
        url: currentPr.context.pr.url,
      },
      check,
      runId,
      runUrl,
      log: bounded.log || "[No failed log output returned by GitHub CLI]",
      truncated: bounded.truncated,
      redacted: redacted.redacted,
      fetchedAt: new Date().toISOString(),
    }

    return {
      status: "found",
      context,
      contextText: buildGitHubFailedCheckLogContextText(context),
      lastRefreshed: Date.now(),
    }
  } catch (error) {
    const reason = classifyGitHubCommandError(error)
    return {
      status: "unavailable",
      reason,
      message: getGitHubWorkflowUnavailableMessage(reason),
    }
  }
}

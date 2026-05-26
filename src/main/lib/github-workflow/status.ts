import type { GitHubWorkflowStatusResult } from "../../../shared/github-workflow-context"
import {
  getGitHubCliDiagnostics,
  getGitHubWorkflowEnvironment,
} from "./gh-cli"

export {
  classifyGitHubCommandError,
  getGitHubCommandErrorText,
  getGitHubWorkflowUnavailableMessage,
  isNoPullRequestFoundError,
} from "./gh-cli"

export async function getGitHubCliStatus(
  worktreePath: string | null | undefined,
): ReturnType<typeof getGitHubCliDiagnostics> {
  return getGitHubCliDiagnostics(worktreePath)
}

export async function getGitHubWorkflowStatus(
  worktreePath: string | null | undefined,
): Promise<GitHubWorkflowStatusResult> {
  const environment = await getGitHubWorkflowEnvironment(worktreePath)
  if (environment.status === "unavailable") {
    return {
      status: "unavailable",
      reason: environment.reason,
      message: environment.message,
      repoSlug: environment.repoSlug,
      repoUrl: environment.repoUrl,
      branch: environment.branch,
      defaultBranch: environment.defaultBranch,
      ghVersion: environment.ghVersion,
      lastRefreshed: Date.now(),
    }
  }

  return {
    status: "available",
    repoSlug: environment.repoSlug,
    repoUrl: environment.repoUrl,
    branch: environment.branch,
    defaultBranch: environment.defaultBranch,
    ghVersion: environment.ghVersion,
    lastRefreshed: Date.now(),
  }
}

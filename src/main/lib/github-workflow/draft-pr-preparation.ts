import { execWithShellEnv } from "../git/shell-env"
import { gitCache } from "../git/cache"
import { withGitLock } from "../git/git-factory"
import { invalidateGitHubStatusCache } from "../git/github/github"
import {
  createGitHubDraftPullRequestPreparation,
  type GitHubDraftPullRequestCreateRequest,
  type GitHubDraftPullRequestChangedFile,
  type GitHubDraftPullRequestFileStatus,
  type GitHubDraftPullRequestCreationResult,
  type GitHubDraftPullRequestPreparationResult,
} from "../../../shared/github-workflow-context"
import { getCurrentPullRequestContext } from "./current-pr-context"
import {
  getGitHubWorkflowStatus,
  getGitHubWorkflowUnavailableMessage,
} from "./status"
import { resolveGitDefaultBranch, runGitHubCli } from "./gh-cli"

function mapGitNameStatus(
  statusCode: string,
): GitHubDraftPullRequestFileStatus {
  const code = statusCode.charAt(0)
  if (code === "A") return "added"
  if (code === "M") return "modified"
  if (code === "D") return "deleted"
  if (code === "R") return "renamed"
  if (code === "C") return "copied"
  return "unknown"
}

function parseNameStatusZ(output: string): GitHubDraftPullRequestChangedFile[] {
  const parts = output.split("\0").filter(Boolean)
  const files: GitHubDraftPullRequestChangedFile[] = []

  for (let index = 0; index < parts.length;) {
    const statusCode = parts[index++]
    if (!statusCode) continue

    if (statusCode.startsWith("R") || statusCode.startsWith("C")) {
      index += 1
      const newPath = parts[index++]
      if (newPath) {
        files.push({
          path: newPath,
          status: mapGitNameStatus(statusCode),
        })
      }
      continue
    }

    const path = parts[index++]
    if (path) {
      files.push({
        path,
        status: mapGitNameStatus(statusCode),
      })
    }
  }

  return files
}

function mergeChangedFiles(
  groups: GitHubDraftPullRequestChangedFile[][],
): GitHubDraftPullRequestChangedFile[] {
  const byPath = new Map<string, GitHubDraftPullRequestChangedFile>()
  for (const group of groups) {
    for (const file of group) {
      byPath.set(file.path, file)
    }
  }
  return Array.from(byPath.values()).sort((a, b) =>
    a.path.localeCompare(b.path),
  )
}

function invalidateLocalGitCaches(worktreePath: string): void {
  gitCache.invalidateStatus(worktreePath)
  gitCache.invalidateParsedDiff(worktreePath)
  gitCache.invalidateAllFileContents(worktreePath)
  invalidateGitHubStatusCache(worktreePath)
}

function getErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error)

  const maybeProcessError = error as Error & {
    stdout?: string
    stderr?: string
  }
  const details = [
    error.message,
    maybeProcessError.stderr,
    maybeProcessError.stdout,
  ].filter(Boolean)

  return details.join("\n")
}

async function runGit(
  worktreePath: string,
  args: string[],
): Promise<string | null> {
  try {
    const { stdout } = await execWithShellEnv("git", args, {
      cwd: worktreePath,
    })
    return stdout
  } catch {
    return null
  }
}

async function resolveBaseRef(
  worktreePath: string,
  baseBranch: string,
): Promise<string | null> {
  for (const candidate of [`origin/${baseBranch}`, baseBranch]) {
    const exists = await runGit(worktreePath, [
      "rev-parse",
      "--verify",
      "--quiet",
      candidate,
    ])
    if (exists !== null) return candidate
  }
  return null
}

async function getBranchCommits(
  worktreePath: string,
  baseRef: string | null,
): Promise<string[]> {
  if (!baseRef) return []
  const output = await runGit(worktreePath, [
    "log",
    "--format=%s",
    `${baseRef}..HEAD`,
  ])
  if (!output) return []

  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

async function getChangedFiles(
  worktreePath: string,
  baseRef: string | null,
): Promise<GitHubDraftPullRequestChangedFile[]> {
  const baseDiff = baseRef
    ? parseNameStatusZ(
        (await runGit(worktreePath, [
          "diff",
          "--name-status",
          "-z",
          `${baseRef}...HEAD`,
        ])) ?? "",
      )
    : []
  const stagedDiff = parseNameStatusZ(
    (await runGit(worktreePath, ["diff", "--cached", "--name-status", "-z"])) ??
      "",
  )
  const workingDiff = parseNameStatusZ(
    (await runGit(worktreePath, ["diff", "--name-status", "-z"])) ?? "",
  )
  const untrackedFiles =
    (await runGit(worktreePath, [
      "ls-files",
      "--others",
      "--exclude-standard",
      "-z",
    ])) ?? ""
  const untracked = untrackedFiles
    .split("\0")
    .filter((path) => path.length > 0)
    .map((path) => ({ path, status: "untracked" as const }))

  return mergeChangedFiles([baseDiff, stagedDiff, workingDiff, untracked])
}

async function hasDirtyWorktree(worktreePath: string): Promise<boolean> {
  const status = await runGit(worktreePath, ["status", "--porcelain"])
  return !!status?.trim()
}

function extractPullRequestUrl(stdout: string): string | null {
  const match = stdout.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/)
  return match?.[0] ?? null
}

export function buildGitHubDraftPullRequestCreateArgs(input: {
  repoSlug: string
  branch: string
  baseBranch: string
  title: string
  body: string
}): string[] {
  return [
    "pr",
    "create",
    "--repo",
    input.repoSlug,
    "--base",
    input.baseBranch,
    "--head",
    input.branch,
    "--title",
    input.title,
    "--body",
    input.body,
    "--draft",
  ]
}

export async function prepareDraftPullRequest(
  worktreePath: string | null | undefined,
): Promise<GitHubDraftPullRequestPreparationResult> {
  if (!worktreePath) {
    return {
      status: "unavailable",
      reason: "no_worktree",
      message: getGitHubWorkflowUnavailableMessage("no_worktree"),
      lastRefreshed: Date.now(),
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
      lastRefreshed: Date.now(),
    }
  }

  const currentPr = await getCurrentPullRequestContext(worktreePath)
  if (currentPr.status === "found") {
    return {
      status: "unavailable",
      reason: "existing_pr",
      message: `Current branch already has PR #${currentPr.context.pr.number}.`,
      repoSlug: workflowStatus.repoSlug,
      repoUrl: workflowStatus.repoUrl,
      branch: workflowStatus.branch,
      lastRefreshed: Date.now(),
    }
  }
  if (currentPr.status === "unavailable") {
    return {
      status: "unavailable",
      reason: currentPr.reason,
      message: currentPr.message,
      repoSlug: currentPr.repoSlug,
      repoUrl: currentPr.repoUrl,
      branch: currentPr.branch,
      lastRefreshed: Date.now(),
    }
  }

  const baseBranch = await resolveGitDefaultBranch(worktreePath)
  if (workflowStatus.branch === "HEAD") {
    return {
      status: "unavailable",
      reason: "github_unavailable",
      message: "Unable to prepare a draft PR from a detached HEAD.",
      repoSlug: workflowStatus.repoSlug,
      repoUrl: workflowStatus.repoUrl,
      branch: workflowStatus.branch,
      baseBranch,
      lastRefreshed: Date.now(),
    }
  }
  if (workflowStatus.branch === baseBranch) {
    return {
      status: "unavailable",
      reason: "base_branch",
      message: "Create or switch to a feature branch before preparing a PR.",
      repoSlug: workflowStatus.repoSlug,
      repoUrl: workflowStatus.repoUrl,
      branch: workflowStatus.branch,
      baseBranch,
      lastRefreshed: Date.now(),
    }
  }

  const baseRef = await resolveBaseRef(worktreePath, baseBranch)
  const [commits, changedFiles] = await Promise.all([
    getBranchCommits(worktreePath, baseRef),
    getChangedFiles(worktreePath, baseRef),
  ])

  if (commits.length === 0 && changedFiles.length === 0) {
    return {
      status: "unavailable",
      reason: "no_changes",
      message: "No branch diff or local changes are available for a draft PR.",
      repoSlug: workflowStatus.repoSlug,
      repoUrl: workflowStatus.repoUrl,
      branch: workflowStatus.branch,
      baseBranch,
      lastRefreshed: Date.now(),
    }
  }

  return {
    status: "prepared",
    preparation: createGitHubDraftPullRequestPreparation({
      repoSlug: workflowStatus.repoSlug,
      repoUrl: workflowStatus.repoUrl,
      branch: workflowStatus.branch,
      baseBranch,
      changedFiles,
      commits,
    }),
    lastRefreshed: Date.now(),
  }
}

export async function createDraftPullRequest(
  worktreePath: string | null | undefined,
  request: GitHubDraftPullRequestCreateRequest,
): Promise<GitHubDraftPullRequestCreationResult> {
  if (!worktreePath) {
    return {
      status: "unavailable",
      reason: "no_worktree",
      message: getGitHubWorkflowUnavailableMessage("no_worktree"),
      lastRefreshed: Date.now(),
    }
  }

  return withGitLock(worktreePath, async () => {
    const title = request.title.trim()
    const body = request.body.trim()
    if (!title) {
      return {
        status: "unavailable",
        reason: "create_failed",
        message: "PR title is required.",
        branch: request.branch,
        baseBranch: request.baseBranch,
        lastRefreshed: Date.now(),
      }
    }
    if (!body) {
      return {
        status: "unavailable",
        reason: "create_failed",
        message: "PR body is required.",
        branch: request.branch,
        baseBranch: request.baseBranch,
        lastRefreshed: Date.now(),
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
        lastRefreshed: Date.now(),
      }
    }

    if (workflowStatus.branch !== request.branch) {
      return {
        status: "unavailable",
        reason: "branch_mismatch",
        message:
          `Current branch is ${workflowStatus.branch}, but the draft was prepared for ${request.branch}. Refresh the draft before creating the PR.`,
        repoSlug: workflowStatus.repoSlug,
        repoUrl: workflowStatus.repoUrl,
        branch: workflowStatus.branch,
        baseBranch: request.baseBranch,
        lastRefreshed: Date.now(),
      }
    }

    const currentPr = await getCurrentPullRequestContext(worktreePath)
    if (currentPr.status === "found") {
      return {
        status: "unavailable",
        reason: "existing_pr",
        message: `Current branch already has PR #${currentPr.context.pr.number}.`,
        repoSlug: workflowStatus.repoSlug,
        repoUrl: workflowStatus.repoUrl,
        branch: workflowStatus.branch,
        baseBranch: currentPr.context.pr.baseBranch ?? request.baseBranch,
        existingPrUrl: currentPr.context.pr.url,
        lastRefreshed: Date.now(),
      }
    }
    if (currentPr.status === "unavailable") {
      return {
        status: "unavailable",
        reason: currentPr.reason,
        message: currentPr.message,
        repoSlug: currentPr.repoSlug,
        repoUrl: currentPr.repoUrl,
        branch: currentPr.branch,
        baseBranch: request.baseBranch,
        lastRefreshed: Date.now(),
      }
    }

    const baseBranch = request.baseBranch.trim()
    if (workflowStatus.branch === baseBranch) {
      return {
        status: "unavailable",
        reason: "base_branch",
        message: "Create or switch to a feature branch before creating a PR.",
        repoSlug: workflowStatus.repoSlug,
        repoUrl: workflowStatus.repoUrl,
        branch: workflowStatus.branch,
        baseBranch,
        lastRefreshed: Date.now(),
      }
    }

    if (await hasDirtyWorktree(worktreePath)) {
      return {
        status: "unavailable",
        reason: "dirty_worktree",
        message:
          "Commit or stash local changes before creating a PR. GitHub PRs can only include committed changes that are pushed to the branch.",
        repoSlug: workflowStatus.repoSlug,
        repoUrl: workflowStatus.repoUrl,
        branch: workflowStatus.branch,
        baseBranch,
        lastRefreshed: Date.now(),
      }
    }

    const baseRef = await resolveBaseRef(worktreePath, baseBranch)
    const commits = await getBranchCommits(worktreePath, baseRef)
    if (commits.length === 0) {
      return {
        status: "unavailable",
        reason: "no_changes",
        message: "No committed branch changes are available for a PR.",
        repoSlug: workflowStatus.repoSlug,
        repoUrl: workflowStatus.repoUrl,
        branch: workflowStatus.branch,
        baseBranch,
        lastRefreshed: Date.now(),
      }
    }

    try {
      const upstream = await runGit(worktreePath, [
        "rev-parse",
        "--abbrev-ref",
        "--symbolic-full-name",
        "@{upstream}",
      ])
      if (upstream?.trim()) {
        await execWithShellEnv("git", ["push"], { cwd: worktreePath })
      } else {
        await execWithShellEnv(
          "git",
          ["push", "--set-upstream", "origin", workflowStatus.branch],
          { cwd: worktreePath },
        )
      }

      const { stdout } = await runGitHubCli(
        buildGitHubDraftPullRequestCreateArgs({
          repoSlug: workflowStatus.repoSlug,
          branch: workflowStatus.branch,
          baseBranch,
          title,
          body,
        }),
        { cwd: worktreePath, timeoutMs: 60_000 },
      )

      const url = extractPullRequestUrl(stdout)
      if (!url) {
        throw new Error("GitHub CLI did not return a pull request URL.")
      }

      await runGit(worktreePath, ["fetch"])
      invalidateLocalGitCaches(worktreePath)

      return {
        status: "created",
        url,
        branch: workflowStatus.branch,
        baseBranch,
        title,
        lastRefreshed: Date.now(),
      }
    } catch (error) {
      invalidateGitHubStatusCache(worktreePath)
      return {
        status: "unavailable",
        reason: "create_failed",
        message: getErrorMessage(error),
        repoSlug: workflowStatus.repoSlug,
        repoUrl: workflowStatus.repoUrl,
        branch: workflowStatus.branch,
        baseBranch,
        lastRefreshed: Date.now(),
      }
    }
  })
}

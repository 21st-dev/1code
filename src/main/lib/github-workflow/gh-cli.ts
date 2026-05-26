import { z } from "zod"
import {
  parseGitHubRemoteUrl,
  type GitHubWorkflowUnavailableReason,
} from "../../../shared/github-workflow-context"
import { execWithShellEnv } from "../git/shell-env"

const DEFAULT_GH_TIMEOUT_MS = 20_000
const DEFAULT_GH_MAX_BUFFER_BYTES = 1024 * 1024
const DEFAULT_GIT_TIMEOUT_MS = 10_000

export interface GitHubWorkflowEnvironment {
  repoSlug: string
  repoUrl: string
  branch: string
  defaultBranch: string
  ghVersion?: string
}

export type GitHubCliStatusResult =
  | {
      status: "available"
      ghVersion?: string
    }
  | {
      status: "unavailable"
      reason: "gh_missing" | "gh_not_authenticated" | "github_unavailable"
      message: string
      ghVersion?: string
    }

export type GitHubWorkflowEnvironmentResult =
  | ({
      status: "available"
    } & GitHubWorkflowEnvironment)
  | {
      status: "unavailable"
      reason: GitHubWorkflowUnavailableReason
      message: string
      repoSlug?: string
      repoUrl?: string
      branch?: string
      defaultBranch?: string
      ghVersion?: string
    }

export interface GitHubCliCommandOptions {
  cwd?: string
  timeoutMs?: number
  maxBuffer?: number
}

type GitCommandOptions = {
  cwd: string
  timeoutMs?: number
  maxBuffer?: number
}

export function getGitHubCommandErrorText(error: unknown): string {
  if (!(error instanceof Error)) return String(error)

  const details: string[] = [error.message]
  const maybeProcessError = error as Error & {
    stdout?: string
    stderr?: string
    code?: string | number
  }
  if (maybeProcessError.stderr) details.push(maybeProcessError.stderr)
  if (maybeProcessError.stdout) details.push(maybeProcessError.stdout)
  if (maybeProcessError.code) details.push(String(maybeProcessError.code))

  return details.join("\n")
}

export function classifyGitHubCommandError(
  error: unknown,
): GitHubWorkflowUnavailableReason {
  const text = getGitHubCommandErrorText(error).toLowerCase()

  if (
    text.includes("enoent") ||
    text.includes("command not found") ||
    text.includes("spawn gh")
  ) {
    return "gh_missing"
  }

  if (
    text.includes("not logged into") ||
    text.includes("not authenticated") ||
    text.includes("authentication required") ||
    text.includes("gh auth login") ||
    text.includes("oauth") ||
    text.includes("requires authentication")
  ) {
    return "gh_not_authenticated"
  }

  return "github_unavailable"
}

export function getGitHubWorkflowUnavailableMessage(
  reason: GitHubWorkflowUnavailableReason,
): string {
  if (reason === "no_worktree") {
    return "No worktree is associated with this chat."
  }
  if (reason === "not_github_repo") {
    return "This workspace is not connected to a GitHub origin remote."
  }
  if (reason === "gh_missing") {
    return "GitHub CLI is not installed or is not available on PATH."
  }
  if (reason === "gh_not_authenticated") {
    return "GitHub CLI is not authenticated. Run gh auth login."
  }
  return "GitHub workflow context is unavailable. Check GitHub CLI output and network access."
}

export function isNoPullRequestFoundError(error: unknown): boolean {
  return getGitHubCommandErrorText(error)
    .toLowerCase()
    .includes("no pull requests found")
}

async function runGit(
  args: string[],
  options: GitCommandOptions,
): Promise<string> {
  const { stdout } = await execWithShellEnv("git", args, {
    cwd: options.cwd,
    timeout: options.timeoutMs ?? DEFAULT_GIT_TIMEOUT_MS,
    maxBuffer: options.maxBuffer,
  })
  return stdout
}

async function tryRunGit(
  args: string[],
  options: GitCommandOptions,
): Promise<string | null> {
  try {
    return await runGit(args, options)
  } catch {
    return null
  }
}

export async function runGitHubCli(
  args: string[],
  options: GitHubCliCommandOptions = {},
): Promise<{ stdout: string; stderr: string }> {
  return execWithShellEnv("gh", args, {
    cwd: options.cwd,
    timeout: options.timeoutMs ?? DEFAULT_GH_TIMEOUT_MS,
    maxBuffer: options.maxBuffer ?? DEFAULT_GH_MAX_BUFFER_BYTES,
  })
}

export async function runGitHubCliJson<T>(
  args: string[],
  schema: z.ZodType<T>,
  options: GitHubCliCommandOptions & { commandDescription: string },
): Promise<T> {
  const { stdout } = await runGitHubCli(args, options)
  let raw: unknown
  try {
    raw = JSON.parse(stdout)
  } catch (error) {
    throw new Error(
      `${options.commandDescription} returned invalid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }

  const result = schema.safeParse(raw)
  if (!result.success) {
    throw new Error(
      `${options.commandDescription} response did not match expected shape`,
    )
  }

  return result.data
}

export async function getGitHubCliDiagnostics(
  worktreePath: string | null | undefined,
): Promise<GitHubCliStatusResult> {
  let ghVersion: string | undefined

  try {
    const { stdout } = await runGitHubCli(["--version"], {
      cwd: worktreePath ?? undefined,
    })
    ghVersion = stdout.split("\n")[0]?.trim() || undefined
  } catch (error) {
    const reason = classifyGitHubCommandError(error)
    return {
      status: "unavailable",
      reason: reason === "gh_missing" ? "gh_missing" : "github_unavailable",
      message: getGitHubWorkflowUnavailableMessage(
        reason === "gh_missing" ? "gh_missing" : "github_unavailable",
      ),
    }
  }

  try {
    await runGitHubCli(["auth", "status", "--hostname", "github.com"], {
      cwd: worktreePath ?? undefined,
    })
  } catch (error) {
    const reason = classifyGitHubCommandError(error)
    return {
      status: "unavailable",
      reason:
        reason === "gh_not_authenticated"
          ? "gh_not_authenticated"
          : "github_unavailable",
      message: getGitHubWorkflowUnavailableMessage(
        reason === "gh_not_authenticated"
          ? "gh_not_authenticated"
          : "github_unavailable",
      ),
      ghVersion,
    }
  }

  return {
    status: "available",
    ghVersion,
  }
}

export async function readGitHubOriginRepo(
  worktreePath: string,
): Promise<{ repoSlug: string; repoUrl: string } | null> {
  try {
    return parseGitHubRemoteUrl(
      await runGit(["remote", "get-url", "origin"], { cwd: worktreePath }),
    )
  } catch {
    return null
  }
}

export async function readCurrentGitBranch(
  worktreePath: string,
): Promise<string> {
  return (await runGit(["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: worktreePath,
  })).trim()
}

export async function resolveGitDefaultBranch(
  worktreePath: string,
): Promise<string> {
  const originHead = await tryRunGit(
    ["symbolic-ref", "refs/remotes/origin/HEAD", "--short"],
    { cwd: worktreePath },
  )
  const normalized = originHead?.trim().replace(/^origin\//, "")
  if (normalized) return normalized

  for (const candidate of ["main", "master"]) {
    const exists = await tryRunGit(
      ["rev-parse", "--verify", "--quiet", `origin/${candidate}`],
      { cwd: worktreePath },
    )
    if (exists !== null) return candidate
  }

  return "main"
}

export async function getGitHubWorkflowEnvironment(
  worktreePath: string | null | undefined,
): Promise<GitHubWorkflowEnvironmentResult> {
  if (!worktreePath) {
    return {
      status: "unavailable",
      reason: "no_worktree",
      message: getGitHubWorkflowUnavailableMessage("no_worktree"),
    }
  }

  const repo = await readGitHubOriginRepo(worktreePath)
  if (!repo) {
    return {
      status: "unavailable",
      reason: "not_github_repo",
      message: getGitHubWorkflowUnavailableMessage("not_github_repo"),
    }
  }

  let branchAndDefault:
    | {
        branch: string
        defaultBranch: string
      }
    | undefined
  try {
    const [branch, defaultBranch] = await Promise.all([
      readCurrentGitBranch(worktreePath),
      resolveGitDefaultBranch(worktreePath),
    ])
    branchAndDefault = { branch, defaultBranch }
  } catch {
    return {
      status: "unavailable",
      reason: "github_unavailable",
      message: "Unable to read the current Git branch.",
      repoSlug: repo.repoSlug,
      repoUrl: repo.repoUrl,
    }
  }

  const cliStatus = await getGitHubCliDiagnostics(worktreePath)
  if (cliStatus.status === "unavailable") {
    return {
      status: "unavailable",
      reason: cliStatus.reason,
      message: cliStatus.message,
      repoSlug: repo.repoSlug,
      repoUrl: repo.repoUrl,
      branch: branchAndDefault.branch,
      defaultBranch: branchAndDefault.defaultBranch,
      ghVersion: cliStatus.ghVersion,
    }
  }

  return {
    status: "available",
    repoSlug: repo.repoSlug,
    repoUrl: repo.repoUrl,
    branch: branchAndDefault.branch,
    defaultBranch: branchAndDefault.defaultBranch,
    ghVersion: cliStatus.ghVersion,
  }
}

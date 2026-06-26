import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export interface GitHubRepoIdentity {
  owner: string
  repo: string
}

export interface GitHubCloneTarget extends GitHubRepoIdentity {
  cloneUrl: string
  clonePath: string
  reposDir: string
}

export type GitExecFile = (
  file: string,
  args: string[],
) => Promise<unknown>

const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/
const REPO_PATTERN = /^[A-Za-z0-9._][A-Za-z0-9._-]{0,99}$/

function trimGitSuffix(value: string): string {
  return value.endsWith(".git") ? value.slice(0, -4) : value
}

function validateGitHubRepoIdentity(
  owner: string | undefined,
  repo: string | undefined,
): GitHubRepoIdentity | null {
  const normalizedOwner = owner?.trim()
  const normalizedRepo = trimGitSuffix(repo?.trim() ?? "")

  if (
    !normalizedOwner ||
    !normalizedRepo ||
    !OWNER_PATTERN.test(normalizedOwner) ||
    !REPO_PATTERN.test(normalizedRepo) ||
    normalizedRepo.startsWith("-")
  ) {
    return null
  }

  return { owner: normalizedOwner, repo: normalizedRepo }
}

export function parseGitHubRepoIdentity(input: string): GitHubRepoIdentity {
  const repoUrl = input.trim()

  const shortMatch = repoUrl.match(/^([^/\s]+)\/([^/\s]+)$/)
  const shortIdentity = validateGitHubRepoIdentity(
    shortMatch?.[1],
    shortMatch?.[2],
  )
  if (shortIdentity) {
    return shortIdentity
  }

  const sshMatch = repoUrl.match(/^git@github\.com:([^/\s]+)\/([^/\s]+)$/)
  const sshIdentity = validateGitHubRepoIdentity(sshMatch?.[1], sshMatch?.[2])
  if (sshIdentity) {
    return sshIdentity
  }

  let url: URL
  try {
    url = new URL(repoUrl)
  } catch {
    throw new Error("Invalid GitHub URL or repo format")
  }

  if (url.protocol !== "https:" || url.hostname !== "github.com") {
    throw new Error("Invalid GitHub URL or repo format")
  }

  const pathParts = url.pathname.split("/").filter(Boolean)
  if (pathParts.length !== 2 || url.search || url.hash) {
    throw new Error("Invalid GitHub URL or repo format")
  }

  const httpsIdentity = validateGitHubRepoIdentity(pathParts[0], pathParts[1])
  if (!httpsIdentity) {
    throw new Error("Invalid GitHub URL or repo format")
  }

  return httpsIdentity
}

export function buildGitHubCloneTarget(
  repoUrl: string,
  homePath: string,
): GitHubCloneTarget {
  const { owner, repo } = parseGitHubRepoIdentity(repoUrl)
  const reposDir = join(homePath, ".21st", "repos", owner)
  const clonePath = join(reposDir, repo)
  const cloneUrl = `https://github.com/${owner}/${repo}.git`

  return { owner, repo, reposDir, clonePath, cloneUrl }
}

export async function cloneGitHubRepository(
  target: GitHubCloneTarget,
  execGit: GitExecFile = execFileAsync,
): Promise<void> {
  if (existsSync(target.clonePath)) {
    return
  }

  await mkdir(target.reposDir, { recursive: true })
  await execGit("git", ["clone", "--", target.cloneUrl, target.clonePath])
}


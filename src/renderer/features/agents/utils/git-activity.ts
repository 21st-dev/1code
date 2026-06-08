export interface GitCommitInfo {
  type: "commit"
  message: string
  hash?: string
  pushed?: boolean
}

export interface GitPrInfo {
  type: "pr"
  title: string
  url: string
  number?: number
}

export type GitActivity = GitCommitInfo | GitPrInfo

export interface ChangedFileInfo {
  filePath: string
  displayPath: string
  additions: number
  deletions: number
}

function hasToolError(part: any): boolean {
  return (
    part?.errorText !== undefined ||
    part?.error !== undefined ||
    part?.isError === true ||
    part?.state === "output-error" ||
    part?.output?.success === false ||
    part?.result?.success === false
  )
}

export function isSuccessfulFileChangeToolPart(part: any): boolean {
  if (part?.type !== "tool-Edit" && part?.type !== "tool-Write") return false
  if (!part?.input?.file_path) return false
  if (hasToolError(part)) return false

  return (
    part.state === "result" ||
    part.state === "output-available" ||
    part.output !== undefined ||
    part.result !== undefined
  )
}

/**
 * Extract commit message from a git commit command and its output.
 */
function extractCommitInfo(
  command: string,
  stdout: string,
): GitCommitInfo | null {
  if (!/git\s+commit/.test(command)) return null

  // Verify commit actually succeeded by checking stdout for git's commit output
  // Format: [branch-name hash] commit message
  const stdoutMatch = stdout.match(/\[[\w/.:-]+\s+([\da-f]+)\]\s+(.+)/)
  if (!stdoutMatch) return null

  const hash = stdoutMatch[1]
  let message = stdoutMatch[2]!.trim()

  // If stdout message is truncated, try to get full message from command
  // Pattern 1: HEREDOC pattern (Claude's preferred format)
  const heredocMatch = command.match(
    /<<'?EOF'?\s*\n([\s\S]*?)\n\s*EOF/,
  )
  if (heredocMatch) {
    const heredocFirstLine = heredocMatch[1]!.split("\n")[0]!.trim()
    if (heredocFirstLine) {
      message = heredocFirstLine
    }
  }

  // Pattern 2: -m "message" or -m 'message' (simple inline message)
  if (!heredocMatch) {
    const mFlagMatch = command.match(/-m\s+["']([^"']+)["']/)
    if (mFlagMatch) {
      message = mFlagMatch[1]!.trim()
    }
  }

  return { type: "commit", message, hash }
}

/**
 * Extract PR info from a gh pr create command and its output.
 */
function extractPrInfo(command: string, stdout: string): GitPrInfo | null {
  if (!/gh\s+pr\s+create/.test(command)) return null

  // Extract URL from stdout
  const urlMatch = stdout.match(
    /(https:\/\/github\.com\/[^\s]+\/pull\/\d+)/,
  )
  if (!urlMatch) return null

  const url = urlMatch[1]!
  const numberMatch = url.match(/\/pull\/(\d+)/)
  const number = numberMatch ? parseInt(numberMatch[1]!, 10) : undefined

  // Extract title from --title flag in command
  const titleMatch = command.match(/--title\s+["']([^"']+)["']/)
  const title = titleMatch?.[1] || `PR #${number || ""}`

  return { type: "pr", title, url, number }
}

/**
 * Scan message parts and return the most significant git activity.
 * Priority: last PR > last commit (PR is more significant).
 * Returns null if no git activity found.
 */
export function extractGitActivity(parts: any[]): GitActivity | null {
  let lastCommit: GitCommitInfo | null = null
  let lastPr: GitPrInfo | null = null
  let lastPushHash: string | null = null
  let hadRebase = false

  for (const part of parts) {
    if (part.type !== "tool-Bash") continue
    if (!part.output) continue

    const command: string = part.input?.command || ""
    const stdout: string = part.output?.stdout || part.output?.output || ""
    const stderr: string = part.output?.stderr || ""

    const commit = extractCommitInfo(command, stdout)
    if (commit) lastCommit = commit

    const pr = extractPrInfo(command, stdout)
    if (pr) lastPr = pr

    // Detect rebase (git pull --rebase rewrites commit hashes)
    if (/git\s+pull\s+--rebase/.test(command)) {
      hadRebase = true
    }

    // Detect successful git push and extract the final pushed hash
    // Push output format: "oldHash..newHash branch -> origin/branch"
    if (/git\s+push/.test(command) && !stderr.includes("error")) {
      // Check stdout and stderr for push ref update (git push outputs to stderr)
      const pushOutput = stdout + "\n" + stderr
      const pushMatch = pushOutput.match(/[\da-f]+\.\.([\da-f]+)\s+\S+\s*->\s*\S+/)
      if (pushMatch) {
        lastPushHash = pushMatch[1]!
      } else {
        // Push succeeded but no hash in output (e.g. first push with -u)
        lastPushHash = ""
      }
    }
  }

  if (lastCommit && lastPushHash !== null) {
    // If rebase happened after commit, the original hash is invalid —
    // use the hash from the final git push output instead
    if (hadRebase && lastPushHash) {
      lastCommit.hash = lastPushHash
      lastCommit.pushed = true
    } else if (hadRebase && !lastPushHash) {
      // Rebase happened but couldn't extract new hash from push output —
      // don't mark as pushed (old hash would 404 on GitHub)
      lastCommit.pushed = false
    } else {
      // No rebase — original hash is valid
      lastCommit.pushed = true
    }
  }

  // PR is more significant than commit (PR implies push already happened)
  return lastPr || lastCommit
}

function countLines(text: string): number {
  if (!text) return 0
  return text.split("\n").length
}

/**
 * Convert absolute file path to relative path from project root.
 * Falls back to basename if project path doesn't match.
 */
function toRelativePath(filePath: string, projectPath?: string): string {
  if (projectPath && filePath.startsWith(projectPath)) {
    const relative = filePath.slice(projectPath.length)
    return relative.startsWith("/") ? relative.slice(1) : relative
  }
  // Handle worktree paths: /Users/.../.21st/worktrees/{chatId}/{subChatId}/relativePath
  const worktreeMatch = filePath.match(/\.21st\/worktrees\/[^/]+\/[^/]+\/(.+)$/)
  if (worktreeMatch) {
    return worktreeMatch[1]!
  }
  return filePath.split("/").pop() || filePath
}

/**
 * Extract changed files from Edit/Write tool parts in a message.
 * Tracks additions and deletions per file.
 * @param projectPath - project root path for computing relative display paths
 */
export function extractChangedFiles(parts: any[], projectPath?: string): ChangedFileInfo[] {
  const fileMap = new Map<string, ChangedFileInfo>()

  for (const part of parts) {
    if (!isSuccessfulFileChangeToolPart(part)) continue
    const filePath: string = part.input?.file_path || ""

    // Skip session/plan files
    if (filePath.includes("claude-sessions") || filePath.includes("Application Support")) continue

    // Use relative path as display, full path as key
    const displayPath = toRelativePath(filePath, projectPath)

    const existing = fileMap.get(filePath)

    if (part.type === "tool-Edit") {
      const oldLines = countLines(part.input?.old_string || "")
      const newLines = countLines(part.input?.new_string || "")
      if (existing) {
        existing.additions += newLines
        existing.deletions += oldLines
      } else {
        fileMap.set(filePath, { filePath, displayPath, additions: newLines, deletions: oldLines })
      }
    } else {
      // tool-Write: all new content = additions
      const lines = countLines(part.input?.content || "")
      if (existing) {
        existing.additions += lines
      } else {
        fileMap.set(filePath, { filePath, displayPath, additions: lines, deletions: 0 })
      }
    }
  }

  return Array.from(fileMap.values())
}

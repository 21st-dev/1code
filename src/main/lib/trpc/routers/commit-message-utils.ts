import type { ParsedDiffFile } from "../../git/diff-parser"

const COMMIT_MESSAGE_TYPES = [
  "feat",
  "fix",
  "docs",
  "style",
  "refactor",
  "perf",
  "test",
  "build",
  "ci",
  "chore",
  "revert",
]
const COMMIT_MESSAGE_REGEX = new RegExp(
  `^(${COMMIT_MESSAGE_TYPES.join("|")})(\\([a-z0-9._/-]+\\))?!?: .+$`,
)

export function cleanGeneratedCommitMessage(value: unknown): string | null {
  if (typeof value !== "string") return null

  const candidates = value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("```"))

  for (const candidate of candidates) {
    const cleaned = candidate
      .replace(/^[-*]\s+/, "")
      .replace(/^\d+\.\s+/, "")
      .replace(/^commit message:\s*/i, "")
      .replace(/^subject:\s*/i, "")
      .replace(/^["'`]+|["'`]+$/g, "")
      .replace(/\s+/g, " ")
      .trim()

    if (!cleaned || cleaned.length >= 100) continue
    if (!COMMIT_MESSAGE_REGEX.test(cleaned)) continue

    const subject = cleaned.split(": ").slice(1).join(": ")
    if (!subject || subject.length > 72) continue

    return cleaned
  }

  return null
}

function getDiffFilePath(file: ParsedDiffFile): string {
  return file.newPath !== "/dev/null" ? file.newPath : file.oldPath
}

function getDiffFileStatus(file: ParsedDiffFile): string {
  if (file.isNewFile) return "added"
  if (file.isDeletedFile) return "deleted"
  if (file.isBinary) return "binary"
  return "modified"
}

export function buildCommitFileSummary(files: ParsedDiffFile[]): string {
  const visibleFiles = files.slice(0, 30)
  const lines = visibleFiles.map((file) => {
    const filePath = getDiffFilePath(file)
    const status = getDiffFileStatus(file)
    const binaryLabel = file.isBinary ? ", binary" : ""
    const languageLabel = file.fileLang ? `, ${file.fileLang}` : ""
    return `- ${status}: ${filePath} (+${file.additions}/-${file.deletions}${languageLabel}${binaryLabel})`
  })

  if (files.length > visibleFiles.length) {
    lines.push(`- ${files.length - visibleFiles.length} more files omitted`)
  }

  return lines.join("\n")
}

export function buildCommitMessagePrompt(
  diff: string,
  fileSummary: string,
  fileCount: number,
  additions: number,
  deletions: number,
  diffLimit: number,
): string {
  return `Write exactly one Conventional Commit subject line for these selected changes.

Rules:
- Output only one line, with no quotes, markdown, or explanation.
- Format: type(scope?): short imperative description
- Allowed types: ${COMMIT_MESSAGE_TYPES.join(", ")}
- Prefer the intent of the change over listing file names.
- Use docs, test, build, chore, or refactor only when the changes are clearly limited to that area.
- Use fix for corrected behavior and feat for new user-visible capability.
- Keep the subject after ": " at 72 characters or less.

Change summary:
- Files: ${fileCount}
- Lines: +${additions}/-${deletions}
- File changes:
${fileSummary || "- No per-file summary available"}

Diff (truncated):
${diff.slice(0, diffLimit)}

Commit message:`
}

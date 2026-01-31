/**
 * Diff Parser - Server-side parsing of unified diff format
 *
 * Moved from renderer to main process to:
 * - Avoid blocking UI on large diffs
 * - Single source of truth for diff parsing logic
 * - Enable prefetching file contents in the same request
 */

export interface ParsedDiffFile {
  key: string
  oldPath: string
  newPath: string
  diffText: string
  isBinary: boolean
  additions: number
  deletions: number
  isValid: boolean
  fileLang: string | null
  isNewFile: boolean
  isDeletedFile: boolean
}

/**
 * Language mapping for syntax highlighting
 */
const LANG_MAP: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  css: "css",
  scss: "scss",
  less: "less",
  json: "json",
  md: "markdown",
  mdx: "markdown",
  html: "html",
  htm: "html",
  xml: "xml",
  svg: "xml",
  yaml: "yaml",
  yml: "yaml",
  py: "python",
  rb: "ruby",
  rs: "rust",
  go: "go",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c",
  cpp: "cpp",
  h: "c",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  sql: "sql",
  graphql: "graphql",
  gql: "graphql",
  vue: "vue",
  svelte: "svelte",
}

/**
 * Get language identifier for syntax highlighting
 */
export function getFileLang(filePath: string): string | null {
  if (!filePath || filePath === "/dev/null") return null
  const ext = filePath.split(".").pop()?.toLowerCase() || ""
  return LANG_MAP[ext] || ext || null
}

/**
 * Validate if a diff hunk has valid structure
 * This is a lenient validator - only reject clearly malformed diffs
 */
function validateDiffHunk(diffText: string): { valid: boolean; reason?: string } {
  if (!diffText || diffText.trim().length === 0) {
    return { valid: false, reason: "empty diff" }
  }

  const lines = diffText.split("\n")
  const hunkHeaderRegex = /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/

  // Find the --- and +++ lines
  const minusLineIdx = lines.findIndex((l) => l.startsWith("--- "))
  const plusLineIdx = lines.findIndex((l) => l.startsWith("+++ "))

  // Must have both header lines
  if (minusLineIdx === -1 || plusLineIdx === -1) {
    return { valid: false, reason: "missing header lines" }
  }

  // +++ must come after ---
  if (plusLineIdx <= minusLineIdx) {
    return { valid: false, reason: "header order wrong" }
  }

  // Check for special cases that don't have hunks
  if (
    diffText.includes("new mode") ||
    diffText.includes("old mode") ||
    diffText.includes("rename from") ||
    diffText.includes("rename to") ||
    diffText.includes("Binary files")
  ) {
    return { valid: true }
  }

  // Must have at least one hunk header after +++ line
  let hasHunk = false
  for (let i = plusLineIdx + 1; i < lines.length; i++) {
    if (hunkHeaderRegex.test(lines[i]!)) {
      hasHunk = true
      break
    }
  }

  if (!hasHunk) {
    return { valid: false, reason: "no hunk headers found" }
  }

  return { valid: true }
}

/**
 * Split a unified diff into separate file diffs
 */
export function splitUnifiedDiffByFile(diffText: string): ParsedDiffFile[] {
  if (!diffText || !diffText.trim()) {
    return []
  }

  const normalized = diffText.replace(/\r\n/g, "\n")
  const lines = normalized.split("\n")

  const blocks: string[] = []
  let current: string[] = []

  const pushCurrent = () => {
    const text = current.join("\n").trim()
    if (
      text &&
      (text.startsWith("diff --git ") ||
        text.startsWith("--- ") ||
        text.startsWith("+++ ") ||
        text.startsWith("Binary files ") ||
        text.includes("\n+++ ") ||
        text.includes("\nBinary files "))
    ) {
      blocks.push(text)
    }
    current = []
  }

  for (const line of lines) {
    if (line.startsWith("diff --git ") && current.length > 0) {
      pushCurrent()
    }
    current.push(line)
  }
  pushCurrent()

  return blocks.map((blockText, index) => {
    const blockLines = blockText.split("\n")
    let oldPath = ""
    let newPath = ""
    let isBinary = false
    let additions = 0
    let deletions = 0

    for (const line of blockLines) {
      if (line.startsWith("diff --git ")) {
        // Fallback: parse paths from "diff --git a/path b/path"
        // Needed for binary files that don't have ---/+++ lines
        const match = line.match(/^diff --git a\/(.+) b\/(.+)$/)
        if (match) {
          if (!oldPath) oldPath = match[1]!
          if (!newPath) newPath = match[2]!
        }
      }

      if (line.startsWith("Binary files ") && line.endsWith(" differ")) {
        isBinary = true
      }

      if (line.startsWith("--- ")) {
        const raw = line.slice(4).trim()
        oldPath = raw.startsWith("a/") ? raw.slice(2) : raw
      }

      if (line.startsWith("+++ ")) {
        const raw = line.slice(4).trim()
        newPath = raw.startsWith("b/") ? raw.slice(2) : raw
      }

      if (line.startsWith("+") && !line.startsWith("+++ ")) {
        additions += 1
      } else if (line.startsWith("-") && !line.startsWith("--- ")) {
        deletions += 1
      }
    }

    const key = oldPath || newPath ? `${oldPath}->${newPath}` : `file-${index}`
    const validation = isBinary ? { valid: true } : validateDiffHunk(blockText)
    const isValid = validation.valid

    const isNewFile = oldPath === "/dev/null"
    const isDeletedFile = newPath === "/dev/null"

    const actualPath = isNewFile ? newPath : isDeletedFile ? oldPath : newPath || oldPath
    const fileLang = getFileLang(actualPath)

    return {
      key,
      oldPath,
      newPath,
      diffText: blockText,
      isBinary,
      additions,
      deletions,
      isValid,
      fileLang,
      isNewFile,
      isDeletedFile,
    }
  })
}

export interface ParsedDiffResponse {
  files: ParsedDiffFile[]
  totalAdditions: number
  totalDeletions: number
  fileContents: Record<string, string>
}

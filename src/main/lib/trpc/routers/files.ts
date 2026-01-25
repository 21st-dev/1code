import { z } from "zod"
import { router, publicProcedure } from "../index"
import { readdir, stat, readFile, writeFile, mkdir } from "node:fs/promises"
import { join, relative, basename, posix } from "node:path"
import { spawn } from "node:child_process"
import { platform } from "node:os"
import { app } from "electron"

// Directories to ignore when scanning
const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "release",
  ".next",
  ".nuxt",
  ".output",
  "coverage",
  "__pycache__",
  ".venv",
  "venv",
  ".cache",
  ".turbo",
  ".vercel",
  ".netlify",
  "out",
  ".svelte-kit",
  ".astro",
])

// Files to ignore
const IGNORED_FILES = new Set([
  ".DS_Store",
  "Thumbs.db",
  ".gitkeep",
])

// File extensions to ignore
const IGNORED_EXTENSIONS = new Set([
  ".log",
  ".lock", // We'll handle package-lock.json separately
  ".pyc",
  ".pyo",
  ".class",
  ".o",
  ".obj",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
])

// Lock files to keep (not ignore)
const ALLOWED_LOCK_FILES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
])

// Entry type for files and folders
interface FileEntry {
  path: string
  type: "file" | "folder"
}

// Content search result type
interface ContentSearchResult {
  file: string
  line: number
  column: number
  text: string
  beforeContext?: string[]
  afterContext?: string[]
}

// Cache for file and folder listings
const fileListCache = new Map<string, { entries: FileEntry[]; timestamp: number }>()
const CACHE_TTL = 5000 // 5 seconds

/**
 * Recursively scan a directory and return all file and folder paths
 */
async function scanDirectory(
  rootPath: string,
  currentPath: string = rootPath,
  depth: number = 0,
  maxDepth: number = 15
): Promise<FileEntry[]> {
  if (depth > maxDepth) return []

  const entries: FileEntry[] = []

  try {
    const dirEntries = await readdir(currentPath, { withFileTypes: true })

    for (const entry of dirEntries) {
      const fullPath = join(currentPath, entry.name)
      const relativePath = relative(rootPath, fullPath)

      if (entry.isDirectory()) {
        // Skip ignored directories
        if (IGNORED_DIRS.has(entry.name)) continue
        // Skip hidden directories (except .github, .vscode, etc.)
        if (entry.name.startsWith(".") && !entry.name.startsWith(".github") && !entry.name.startsWith(".vscode")) continue

        // Add the folder itself to results
        // Normalize path separators to forward slashes for cross-platform consistency
        entries.push({ path: relativePath.replace(/\\/g, "/"), type: "folder" })

        // Recurse into subdirectory
        const subEntries = await scanDirectory(rootPath, fullPath, depth + 1, maxDepth)
        entries.push(...subEntries)
      } else if (entry.isFile()) {
        // Skip ignored files
        if (IGNORED_FILES.has(entry.name)) continue

        // Check extension
        const ext = entry.name.includes(".") ? "." + entry.name.split(".").pop()?.toLowerCase() : ""
        if (IGNORED_EXTENSIONS.has(ext)) {
          // Allow specific lock files
          if (!ALLOWED_LOCK_FILES.has(entry.name)) continue
        }

        // Normalize path separators to forward slashes for cross-platform consistency
        entries.push({ path: relativePath.replace(/\\/g, "/"), type: "file" })
      }
    }
  } catch (error) {
    // Silently skip directories we can't read
    console.warn(`[files] Could not read directory: ${currentPath}`, error)
  }

  return entries
}

/**
 * Get cached entry list or scan directory
 */
async function getEntryList(projectPath: string): Promise<FileEntry[]> {
  const cached = fileListCache.get(projectPath)
  const now = Date.now()

  if (cached && now - cached.timestamp < CACHE_TTL) {
    return cached.entries
  }

  const entries = await scanDirectory(projectPath)
  fileListCache.set(projectPath, { entries, timestamp: now })

  return entries
}

/**
 * Filter and sort entries (files and folders) by query
 */
function filterEntries(
  entries: FileEntry[],
  query: string,
  limit: number
): Array<{ id: string; label: string; path: string; repository: string; type: "file" | "folder" }> {
  const queryLower = query.toLowerCase()

  // Filter entries that match the query
  let filtered = entries
  if (query) {
    filtered = entries.filter((entry) => {
      const name = basename(entry.path).toLowerCase()
      const pathLower = entry.path.toLowerCase()
      return name.includes(queryLower) || pathLower.includes(queryLower)
    })
  }

  // Sort by relevance (exact match > starts with > shorter match > contains > alphabetical)
  // Files and folders are treated equally
  filtered.sort((a, b) => {
    const aName = basename(a.path).toLowerCase()
    const bName = basename(b.path).toLowerCase()

    if (query) {
      // Priority 1: Exact name match
      const aExact = aName === queryLower
      const bExact = bName === queryLower
      if (aExact && !bExact) return -1
      if (!aExact && bExact) return 1

      // Priority 2: Name starts with query
      const aStarts = aName.startsWith(queryLower)
      const bStarts = bName.startsWith(queryLower)
      if (aStarts && !bStarts) return -1
      if (!aStarts && bStarts) return 1

      // Priority 3: If both start with query, shorter name = better match
      if (aStarts && bStarts) {
        if (aName.length !== bName.length) {
          return aName.length - bName.length
        }
      }

      // Priority 4: Name contains query (but doesn't start with it)
      const aContains = aName.includes(queryLower)
      const bContains = bName.includes(queryLower)
      if (aContains && !bContains) return -1
      if (!aContains && bContains) return 1
    }

    // Alphabetical by name
    return aName.localeCompare(bName)
  })

  // Limit results
  const limited = filtered.slice(0, Math.min(limit, 200))

  // Map to expected format with type
  return limited.map((entry) => ({
    id: `${entry.type}:local:${entry.path}`,
    label: basename(entry.path),
    path: entry.path,
    repository: "local",
    type: entry.type,
  }))
}

export const filesRouter = router({
  /**
   * Search files and folders in a local project directory
   */
  search: publicProcedure
    .input(
      z.object({
        projectPath: z.string(),
        query: z.string().default(""),
        limit: z.number().min(1).max(200).default(50),
      })
    )
    .query(async ({ input }) => {
      const { projectPath, query, limit } = input

      if (!projectPath) {
        return []
      }

      try {
        // Verify the path exists and is a directory
        const pathStat = await stat(projectPath)
        if (!pathStat.isDirectory()) {
          console.warn(`[files] Not a directory: ${projectPath}`)
          return []
        }

        // Get entry list (cached or fresh scan)
        const entries = await getEntryList(projectPath)

        // Debug: log folder count
        const folderCount = entries.filter(e => e.type === "folder").length
        const fileCount = entries.filter(e => e.type === "file").length
        console.log(`[files] Scanned ${projectPath}: ${folderCount} folders, ${fileCount} files`)

        // Filter and sort by query
        const results = filterEntries(entries, query, limit)
        console.log(`[files] Query "${query}": returning ${results.length} results, folders: ${results.filter(r => r.type === "folder").length}`)
        return results
      } catch (error) {
        console.error(`[files] Error searching files:`, error)
        return []
      }
    }),

  /**
   * Clear the file cache for a project (useful when files change)
   */
  clearCache: publicProcedure
    .input(z.object({ projectPath: z.string() }))
    .mutation(({ input }) => {
      fileListCache.delete(input.projectPath)
      return { success: true }
    }),

  /**
   * List contents of a specific directory (non-recursive, for lazy loading)
   */
  listDirectory: publicProcedure
    .input(
      z.object({
        projectPath: z.string(),
        relativePath: z.string().default(""),
      })
    )
    .query(async ({ input }) => {
      const { projectPath, relativePath } = input

      if (!projectPath) {
        return []
      }

      try {
        const targetPath = relativePath ? join(projectPath, relativePath) : projectPath

        // Verify the path exists and is a directory
        const pathStat = await stat(targetPath)
        if (!pathStat.isDirectory()) {
          console.warn(`[files] Not a directory: ${targetPath}`)
          return []
        }

        const dirEntries = await readdir(targetPath, { withFileTypes: true })
        const results: Array<{ name: string; path: string; type: "file" | "folder" }> = []

        for (const entry of dirEntries) {
          // Use forward slash for cross-platform consistency
          const entryRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name

          if (entry.isDirectory()) {
            // Skip ignored directories
            if (IGNORED_DIRS.has(entry.name)) continue
            // Skip hidden directories (except .github, .vscode, etc.)
            if (entry.name.startsWith(".") && !entry.name.startsWith(".github") && !entry.name.startsWith(".vscode")) continue

            results.push({
              name: entry.name,
              path: entryRelativePath,
              type: "folder",
            })
          } else if (entry.isFile()) {
            // Skip ignored files
            if (IGNORED_FILES.has(entry.name)) continue

            // Check extension
            const ext = entry.name.includes(".") ? "." + entry.name.split(".").pop()?.toLowerCase() : ""
            if (IGNORED_EXTENSIONS.has(ext)) {
              // Allow specific lock files
              if (!ALLOWED_LOCK_FILES.has(entry.name)) continue
            }

            results.push({
              name: entry.name,
              path: entryRelativePath,
              type: "file",
            })
          }
        }

        // Sort: folders first, then alphabetically
        results.sort((a, b) => {
          if (a.type !== b.type) {
            return a.type === "folder" ? -1 : 1
          }
          return a.name.localeCompare(b.name)
        })

        return results
      } catch (error) {
        console.error(`[files] Error listing directory:`, error)
        return []
      }
    }),

  /**
   * Read file content (for preview)
   */
  readFile: publicProcedure
    .input(
      z.object({
        path: z.string(),
        maxSize: z.number().default(1024 * 1024), // 1MB default max
      })
    )
    .query(async ({ input }) => {
      const { path: filePath, maxSize } = input

      try {
        // Check file exists and get size
        const fileStat = await stat(filePath)

        if (!fileStat.isFile()) {
          throw new Error("Not a file")
        }

        if (fileStat.size > maxSize) {
          throw new Error(`File too large (${Math.round(fileStat.size / 1024)}KB > ${Math.round(maxSize / 1024)}KB limit)`)
        }

        // Read file content
        const content = await readFile(filePath, "utf-8")
        return content
      } catch (error) {
        console.error(`[files] Error reading file:`, error)
        throw error
      }
    }),

  /**
   * Read binary file as base64 (for images, PDFs, etc.)
   */
  readBinaryFile: publicProcedure
    .input(
      z.object({
        path: z.string(),
        maxSize: z.number().default(10 * 1024 * 1024), // 10MB default max for binary files
      })
    )
    .query(async ({ input }) => {
      const { path: filePath, maxSize } = input

      try {
        // Check file exists and get size
        const fileStat = await stat(filePath)

        if (!fileStat.isFile()) {
          throw new Error("Not a file")
        }

        if (fileStat.size > maxSize) {
          throw new Error(`File too large (${Math.round(fileStat.size / 1024)}KB > ${Math.round(maxSize / 1024)}KB limit)`)
        }

        // Read file as buffer and convert to base64
        const buffer = await readFile(filePath)
        const base64 = buffer.toString("base64")

        // Determine MIME type from extension
        const ext = filePath.split(".").pop()?.toLowerCase() || ""
        const mimeTypes: Record<string, string> = {
          // Images
          png: "image/png",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          gif: "image/gif",
          webp: "image/webp",
          svg: "image/svg+xml",
          ico: "image/x-icon",
          bmp: "image/bmp",
          avif: "image/avif",
          // Documents
          pdf: "application/pdf",
        }
        const mimeType = mimeTypes[ext] || "application/octet-stream"

        return {
          base64,
          mimeType,
          size: fileStat.size,
        }
      } catch (error) {
        console.error(`[files] Error reading binary file:`, error)
        throw error
      }
    }),

  /**
   * Search for files matching a filename pattern (returns all matching paths for auto-expand)
   */
  searchFiles: publicProcedure
    .input(
      z.object({
        projectPath: z.string(),
        query: z.string(),
        limit: z.number().min(1).max(500).default(100),
      })
    )
    .query(async ({ input }) => {
      const { projectPath, query, limit } = input

      if (!projectPath) {
        return { results: [], parentPaths: [] }
      }

      try {
        const entries = await getEntryList(projectPath)

        // If no query, return all folder paths for expand all functionality
        if (!query) {
          const allFolders = entries.filter((entry) => entry.type === "folder")
          return {
            results: [],
            parentPaths: allFolders.map((f) => f.path),
          }
        }

        const queryLower = query.toLowerCase()

        // Find matching files
        const matchingFiles = entries.filter((entry) => {
          const name = basename(entry.path).toLowerCase()
          return name.includes(queryLower)
        })

        // Sort by relevance
        matchingFiles.sort((a, b) => {
          const aName = basename(a.path).toLowerCase()
          const bName = basename(b.path).toLowerCase()

          // Exact match first
          if (aName === queryLower && bName !== queryLower) return -1
          if (bName === queryLower && aName !== queryLower) return 1

          // Starts with query
          if (aName.startsWith(queryLower) && !bName.startsWith(queryLower)) return -1
          if (bName.startsWith(queryLower) && !aName.startsWith(queryLower)) return 1

          // Shorter name = better match
          return aName.length - bName.length
        })

        const limited = matchingFiles.slice(0, limit)

        // Collect all parent directories that need to be expanded
        // Use posix.dirname since paths are normalized to forward slashes
        const parentPaths = new Set<string>()
        for (const entry of limited) {
          let currentPath = posix.dirname(entry.path)
          while (currentPath && currentPath !== ".") {
            parentPaths.add(currentPath)
            currentPath = posix.dirname(currentPath)
          }
        }

        return {
          results: limited.map((entry) => ({
            path: entry.path,
            type: entry.type,
            name: basename(entry.path),
          })),
          parentPaths: Array.from(parentPaths),
        }
      } catch (error) {
        console.error(`[files] Error searching files:`, error)
        return { results: [], parentPaths: [] }
      }
    }),

  /**
   * Search file contents using ripgrep (with grep/findstr fallback)
   */
  searchContent: publicProcedure
    .input(
      z.object({
        projectPath: z.string(),
        query: z.string(),
        filePattern: z.string().optional(),
        caseSensitive: z.boolean().default(false),
        limit: z.number().min(1).max(500).default(100),
      })
    )
    .mutation(async ({ input }) => {
      const { projectPath, query, filePattern, caseSensitive, limit } = input

      if (!projectPath || !query) {
        return { results: [], tool: "none" }
      }

      const isWindows = platform() === "win32"

      return new Promise<{ results: ContentSearchResult[]; tool: string }>((resolve) => {
        // Try ripgrep first, then fall back to grep/findstr
        const rgPaths = isWindows
          ? ["rg", "C:\\Program Files\\ripgrep\\rg.exe", "C:\\ProgramData\\scoop\\shims\\rg.exe"]
          : ["rg", "/opt/homebrew/bin/rg", "/usr/local/bin/rg", "/usr/bin/rg"]

        let rgPathIndex = 0

        const tryRipgrep = () => {
          if (rgPathIndex >= rgPaths.length) {
            // No ripgrep found, try fallback
            tryFallback()
            return
          }

          const rgPath = rgPaths[rgPathIndex]
          rgPathIndex++

          console.log(`[files] Trying ripgrep at: ${rgPath} for content search: "${query}" in ${projectPath}`)

          const args = [
            "--json",
            "--line-number",
            "--column",
            "-C", "2", // 2 lines of context
          ]

          // Add case sensitivity flag
          if (!caseSensitive) {
            args.push("-i")
          }

          // Add file pattern if provided
          if (filePattern) {
            args.push("-g", filePattern)
          }

          // Add ignored directories
          for (const dir of IGNORED_DIRS) {
            args.push("-g", `!${dir}/**`)
          }

          args.push("--", query, projectPath)

          const rg = spawn(rgPath, args)
          let output = ""

          rg.stdout.on("data", (data) => {
            output += data.toString()
          })

          rg.on("close", (code) => {
            if (code === null || (code !== 0 && code !== 1)) {
              // ripgrep error, try next path
              tryRipgrep()
              return
            }

            // Parse JSON output
            const lines = output.split("\n").filter(Boolean)
            const matchMap = new Map<string, ContentSearchResult>()

            for (const line of lines) {
              try {
                const json = JSON.parse(line)
                if (json.type === "match") {
                  const data = json.data
                  const file = relative(projectPath, data.path.text).replace(/\\/g, "/")
                  const lineNum = data.line_number

                  // Skip ignored directories
                  if (IGNORED_DIRS.has(file.split("/")[0])) continue

                  const key = `${file}:${lineNum}`
                  if (!matchMap.has(key)) {
                    matchMap.set(key, {
                      file,
                      line: lineNum,
                      column: data.submatches?.[0]?.start || 0,
                      text: data.lines.text.trim(),
                      beforeContext: [],
                      afterContext: [],
                    })
                  }
                }
              } catch {
                // Skip non-JSON lines
              }
            }

            const results = Array.from(matchMap.values()).slice(0, limit)
            resolve({
              results,
              tool: "ripgrep",
            })
          })

          rg.on("error", () => {
            // This ripgrep path not found, try next path
            tryRipgrep()
          })
        }

        const tryFallback = () => {
          if (isWindows) {
            tryFindstr()
          } else {
            tryGrep()
          }
        }

        const tryFindstr = () => {
          console.log(`[files] Trying findstr for content search: "${query}" in ${projectPath}`)

          // Windows findstr command
          // /S = search subdirectories
          // /N = print line numbers
          // /I = case insensitive (if needed)
          // /P = skip binary files
          const args = ["/S", "/N", "/P"]

          if (!caseSensitive) {
            args.push("/I")
          }

          // Add search pattern
          args.push(query)

          // Add file pattern
          if (filePattern) {
            args.push(filePattern)
          } else {
            args.push("*.*")
          }

          const findstr = spawn("findstr", args, { cwd: projectPath })
          const results: ContentSearchResult[] = []
          let output = ""

          findstr.stdout.on("data", (data) => {
            output += data.toString()
          })

          findstr.on("close", (code) => {
            // findstr returns 1 when no matches found, 0 on success, 2 on error
            if (code === 2) {
              console.error(`[files] findstr failed`)
              resolve({ results: [], tool: "findstr-failed" })
              return
            }

            // Parse findstr output: filename:line:content
            const lines = output.split("\r\n").filter(Boolean)

            for (const line of lines) {
              if (results.length >= limit) break

              const match = line.match(/^(.+?):(\d+):(.*)$/)
              if (match) {
                let filePath = match[1]
                // Normalize path separators to forward slashes
                filePath = filePath.replace(/\\/g, "/")
                // Skip ignored directories
                if (IGNORED_DIRS.has(filePath.split("/")[0])) continue
                if (filePath.includes("/node_modules/") || filePath.includes("/.git/")) continue

                results.push({
                  file: filePath,
                  line: parseInt(match[2], 10),
                  column: 0,
                  text: match[3].trim(),
                })
              }
            }

            resolve({ results, tool: "findstr" })
          })

          findstr.on("error", (err) => {
            console.error(`[files] findstr spawn error:`, err)
            resolve({ results: [], tool: "findstr-error" })
          })
        }

        const tryGrep = () => {
          console.log(`[files] Trying grep for content search: "${query}" in ${projectPath}`)

          const grepPath = "/usr/bin/grep"
          const args = ["-r", "-n", "-H"]

          if (filePattern) {
            args.push("--include=" + filePattern)
          }

          if (!caseSensitive) {
            args.push("-i")
          }

          for (const dir of IGNORED_DIRS) {
            args.push(`--exclude-dir=${dir}`)
          }

          args.push("--", query, projectPath)

          const grep = spawn(grepPath, args)
          const results: ContentSearchResult[] = []
          let output = ""

          grep.stdout.on("data", (data) => {
            output += data.toString()
          })

          grep.on("close", (code) => {
            if (code === null || code > 1) {
              resolve({ results: [], tool: "grep-failed" })
              return
            }

            const lines = output.split("\n").filter(Boolean)
            for (const line of lines) {
              if (results.length >= limit) break

              const match = line.match(/^(.+?):(\d+):(.*)$/)
              if (match) {
                results.push({
                  file: relative(projectPath, match[1]).replace(/\\/g, "/"),
                  line: parseInt(match[2], 10),
                  column: 0,
                  text: match[3].trim(),
                })
              }
            }

            resolve({ results, tool: "grep" })
          })

          grep.on("error", () => {
            resolve({ results: [], tool: "grep-error" })
          })
        }

        tryRipgrep()
      })
    }),

  /**
   * Write file content (for editing files)
   */
  writeFile: publicProcedure
    .input(
      z.object({
        path: z.string(),
        content: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const { path: filePath, content } = input

      try {
        await writeFile(filePath, content, "utf-8")
        console.log(`[files] Wrote file: ${filePath} (${content.length} bytes)`)
        return { success: true }
      } catch (error) {
        console.error(`[files] Error writing file:`, error)
        throw error
      }
    }),

  /**
   * Write pasted text to a file in the session's pasted directory
   * Used for large text pastes that shouldn't be embedded inline
   */
  writePastedText: publicProcedure
    .input(
      z.object({
        subChatId: z.string(),
        text: z.string(),
        filename: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { subChatId, text, filename } = input

      // Create pasted directory in session folder
      const sessionDir = join(app.getPath("userData"), "claude-sessions", subChatId)
      const pastedDir = join(sessionDir, "pasted")
      await mkdir(pastedDir, { recursive: true })

      // Generate filename with timestamp
      const finalFilename = filename || `pasted_${Date.now()}.txt`
      const filePath = join(pastedDir, finalFilename)

      // Write file
      await writeFile(filePath, text, "utf-8")

      console.log(`[files] Wrote pasted text to ${filePath} (${text.length} bytes)`)

      return {
        filePath,
        filename: finalFilename,
        size: text.length,
      }
    }),
})

import { z } from "zod"
import { router, publicProcedure } from "../index"
import { readdir, stat } from "node:fs/promises"
import { watch, type FSWatcher } from "node:fs"
import { join, relative, basename } from "node:path"
import { observable } from "@trpc/server/observable"
import { EventEmitter } from "node:events"
import { exec } from "node:child_process"
import { promisify } from "node:util"
import {
  getDataFileInfo,
  parseDataFile,
  querySqlite,
  listSqliteTables,
  isDataFile,
} from "../../parsers"

const execAsync = promisify(exec)

// Git status codes
export type GitStatusCode =
  | "modified"      // M - modified
  | "added"         // A - staged new file
  | "deleted"       // D - deleted
  | "renamed"       // R - renamed
  | "copied"        // C - copied
  | "untracked"     // ? - untracked
  | "ignored"       // ! - ignored
  | "unmerged"      // U - unmerged (conflict)
  | "staged"        // File is staged (index has changes)
  | null            // No changes

export interface GitFileStatus {
  path: string
  status: GitStatusCode
  staged: boolean  // Whether the file has staged changes
}

// Event emitter for file changes
const fileChangeEmitter = new EventEmitter()
fileChangeEmitter.setMaxListeners(100) // Allow many subscribers

// Active file watchers per project path
const activeWatchers = new Map<string, { watcher: FSWatcher; refCount: number }>()

// Git directory watchers (watch .git for status changes)
const gitWatchers = new Map<string, { watcher: FSWatcher; refCount: number }>()

// Git status cache with longer TTL (invalidated by .git watcher)
const gitStatusCache = new Map<string, { status: Map<string, GitFileStatus>; timestamp: number }>()
const GIT_STATUS_CACHE_TTL = 30000 // 30 seconds (longer since we watch .git)

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

// Cache for file and folder listings
const fileListCache = new Map<string, { entries: FileEntry[]; timestamp: number }>()
const CACHE_TTL = 1000 // 1 second (short TTL since we have real-time watching)

// Debounce timers for file change events
const debounceTimers = new Map<string, NodeJS.Timeout>()
const DEBOUNCE_MS = 100 // Debounce rapid changes

/**
 * Parse git status output and return a map of file paths to their status
 */
function parseGitStatus(output: string): Map<string, GitFileStatus> {
  const statusMap = new Map<string, GitFileStatus>()

  for (const line of output.split("\n")) {
    if (!line || line.length < 4) continue

    // Git status format: XY PATH or XY ORIG -> PATH (for renames)
    const indexStatus = line[0]  // Status in index (staged)
    const workingStatus = line[1] // Status in working tree
    let filePath = line.slice(3)

    // Handle renames: "R  old -> new"
    if (filePath.includes(" -> ")) {
      filePath = filePath.split(" -> ")[1]
    }

    // Remove quotes if present (git quotes paths with special chars)
    if (filePath.startsWith('"') && filePath.endsWith('"')) {
      filePath = filePath.slice(1, -1)
    }

    let status: GitStatusCode = null
    let staged = false

    // Check index status (staged changes)
    if (indexStatus === "M") {
      status = "modified"
      staged = true
    } else if (indexStatus === "A") {
      status = "added"
      staged = true
    } else if (indexStatus === "D") {
      status = "deleted"
      staged = true
    } else if (indexStatus === "R") {
      status = "renamed"
      staged = true
    } else if (indexStatus === "C") {
      status = "copied"
      staged = true
    }

    // Check working tree status (unstaged changes)
    if (workingStatus === "M") {
      status = "modified"
    } else if (workingStatus === "D") {
      status = "deleted"
    } else if (workingStatus === "?") {
      status = "untracked"
    } else if (workingStatus === "!") {
      status = "ignored"
    } else if (workingStatus === "U" || indexStatus === "U") {
      status = "unmerged"
    }

    if (status) {
      statusMap.set(filePath, { path: filePath, status, staged })
    }
  }

  return statusMap
}

/**
 * Get git status for all files in a directory (with caching)
 */
async function getGitStatus(projectPath: string): Promise<Map<string, GitFileStatus>> {
  // Check cache first
  const cached = gitStatusCache.get(projectPath)
  const now = Date.now()

  if (cached && now - cached.timestamp < GIT_STATUS_CACHE_TTL) {
    return cached.status
  }

  try {
    // Check if this is a git repository
    const { stdout } = await execAsync("git status --porcelain -uall", {
      cwd: projectPath,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large repos
    })
    const status = parseGitStatus(stdout)

    // Cache the result
    gitStatusCache.set(projectPath, { status, timestamp: now })

    return status
  } catch (error) {
    // Not a git repo or git not available
    return new Map()
  }
}

/**
 * Start watching .git directory for status changes
 */
function startGitWatching(projectPath: string): void {
  const existing = gitWatchers.get(projectPath)
  if (existing) {
    existing.refCount++
    return
  }

  const gitPath = join(projectPath, ".git")

  try {
    // Check if .git exists
    const watcher = watch(gitPath, { recursive: true }, (eventType, filename) => {
      if (!filename) return

      // Only care about files that indicate git state changes
      // index = staging area, HEAD = current branch, refs = branches/tags
      const isRelevant =
        filename === "index" ||
        filename === "HEAD" ||
        filename.startsWith("refs/") ||
        filename === "COMMIT_EDITMSG" ||
        filename === "MERGE_HEAD" ||
        filename === "REBASE_HEAD"

      if (!isRelevant) return

      // Debounce and invalidate cache
      const timerKey = `git:${projectPath}`
      const existingTimer = debounceTimers.get(timerKey)
      if (existingTimer) {
        clearTimeout(existingTimer)
      }

      debounceTimers.set(timerKey, setTimeout(() => {
        debounceTimers.delete(timerKey)
        // Invalidate git status cache
        gitStatusCache.delete(projectPath)
        // Emit git change event
        fileChangeEmitter.emit(`gitChange:${projectPath}`)
      }, DEBOUNCE_MS))
    })

    watcher.on("error", (error) => {
      console.warn(`[files] Git watcher error for ${projectPath}:`, error)
    })

    gitWatchers.set(projectPath, { watcher, refCount: 1 })
    console.log(`[files] Started watching .git: ${projectPath}`)
  } catch (error) {
    // .git doesn't exist or not accessible
    console.warn(`[files] Could not watch .git for ${projectPath}:`, error)
  }
}

/**
 * Stop watching .git directory
 */
function stopGitWatching(projectPath: string): void {
  const existing = gitWatchers.get(projectPath)
  if (!existing) return

  existing.refCount--
  if (existing.refCount <= 0) {
    existing.watcher.close()
    gitWatchers.delete(projectPath)
    // Clean up timer
    const timerKey = `git:${projectPath}`
    const timer = debounceTimers.get(timerKey)
    if (timer) {
      clearTimeout(timer)
      debounceTimers.delete(timerKey)
    }
    console.log(`[files] Stopped watching .git: ${projectPath}`)
  }
}

/**
 * Start watching a project directory for changes
 */
function startWatching(projectPath: string): void {
  const existing = activeWatchers.get(projectPath)
  if (existing) {
    existing.refCount++
    return
  }

  try {
    const watcher = watch(projectPath, { recursive: true }, (eventType, filename) => {
      if (!filename) return

      // Skip ignored directories and files
      const parts = filename.split("/")
      const shouldIgnore = parts.some(part =>
        IGNORED_DIRS.has(part) ||
        IGNORED_FILES.has(part) ||
        (part.startsWith(".") && !part.startsWith(".github") && !part.startsWith(".vscode"))
      )
      if (shouldIgnore) return

      // Debounce rapid changes
      const existing = debounceTimers.get(projectPath)
      if (existing) {
        clearTimeout(existing)
      }

      debounceTimers.set(projectPath, setTimeout(() => {
        debounceTimers.delete(projectPath)
        // Invalidate cache
        fileListCache.delete(projectPath)
        // Emit change event
        fileChangeEmitter.emit(`change:${projectPath}`, { eventType, filename })
      }, DEBOUNCE_MS))
    })

    watcher.on("error", (error) => {
      console.warn(`[files] Watcher error for ${projectPath}:`, error)
    })

    activeWatchers.set(projectPath, { watcher, refCount: 1 })
    console.log(`[files] Started watching: ${projectPath}`)
  } catch (error) {
    console.warn(`[files] Could not start watcher for ${projectPath}:`, error)
  }
}

/**
 * Stop watching a project directory
 */
function stopWatching(projectPath: string): void {
  const existing = activeWatchers.get(projectPath)
  if (!existing) return

  existing.refCount--
  if (existing.refCount <= 0) {
    existing.watcher.close()
    activeWatchers.delete(projectPath)
    // Clean up debounce timer
    const timer = debounceTimers.get(projectPath)
    if (timer) {
      clearTimeout(timer)
      debounceTimers.delete(projectPath)
    }
    console.log(`[files] Stopped watching: ${projectPath}`)
  }
}

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
        entries.push({ path: relativePath, type: "folder" })

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

        entries.push({ path: relativePath, type: "file" })
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
   * List all files and folders in a project directory (for file tree)
   */
  listAll: publicProcedure
    .input(z.object({ projectPath: z.string() }))
    .query(async ({ input }) => {
      const { projectPath } = input

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

        // Get full entry list (cached or fresh scan)
        const entries = await getEntryList(projectPath)
        return entries
      } catch (error) {
        console.error(`[files] Error listing files:`, error)
        return []
      }
    }),

  /**
   * Subscribe to file changes in a project directory
   * Emits events when files are created, modified, or deleted
   */
  watchChanges: publicProcedure
    .input(z.object({ projectPath: z.string() }))
    .subscription(({ input }) => {
      const { projectPath } = input

      return observable<{ eventType: string; filename: string }>((emit) => {
        if (!projectPath) {
          emit.complete()
          return () => {}
        }

        // Start watching this project
        startWatching(projectPath)

        // Listen for change events
        const onChange = (data: { eventType: string; filename: string }) => {
          emit.next(data)
        }

        fileChangeEmitter.on(`change:${projectPath}`, onChange)

        // Cleanup when subscription ends
        return () => {
          fileChangeEmitter.off(`change:${projectPath}`, onChange)
          stopWatching(projectPath)
        }
      })
    }),

  /**
   * Get git status for all files in a project directory
   */
  gitStatus: publicProcedure
    .input(z.object({ projectPath: z.string() }))
    .query(async ({ input }) => {
      const { projectPath } = input

      if (!projectPath) {
        return {}
      }

      try {
        const statusMap = await getGitStatus(projectPath)
        // Convert Map to plain object for serialization
        const result: Record<string, { status: GitStatusCode; staged: boolean }> = {}
        statusMap.forEach((value, key) => {
          result[key] = { status: value.status, staged: value.staged }
        })
        return result
      } catch (error) {
        console.error(`[files] Error getting git status:`, error)
        return {}
      }
    }),

  /**
   * Subscribe to git status changes (watches .git directory)
   * More efficient than watching all files - only updates when git state changes
   */
  watchGitChanges: publicProcedure
    .input(z.object({ projectPath: z.string() }))
    .subscription(({ input }) => {
      const { projectPath } = input

      return observable<{ type: "git-change" }>((emit) => {
        if (!projectPath) {
          emit.complete()
          return () => {}
        }

        // Start watching .git directory
        startGitWatching(projectPath)

        // Listen for git change events
        const onGitChange = () => {
          emit.next({ type: "git-change" })
        }

        fileChangeEmitter.on(`gitChange:${projectPath}`, onGitChange)

        // Cleanup when subscription ends
        return () => {
          fileChangeEmitter.off(`gitChange:${projectPath}`, onGitChange)
          stopGitWatching(projectPath)
        }
      })
    }),

  /**
   * Check if a file is a supported data file (CSV, JSON, SQLite)
   */
  isDataFile: publicProcedure
    .input(z.object({ filePath: z.string() }))
    .query(({ input }) => {
      return isDataFile(input.filePath)
    }),

  /**
   * Get metadata about a data file (type, size, tables for SQLite)
   */
  getDataFileInfo: publicProcedure
    .input(z.object({ filePath: z.string() }))
    .query(async ({ input }) => {
      return await getDataFileInfo(input.filePath)
    }),

  /**
   * Parse and preview a data file (first N rows)
   */
  previewDataFile: publicProcedure
    .input(
      z.object({
        filePath: z.string(),
        limit: z.number().min(1).max(10000).default(1000),
        offset: z.number().min(0).default(0),
        tableName: z.string().optional(), // For SQLite files
      })
    )
    .query(async ({ input }) => {
      return await parseDataFile(input.filePath, {
        limit: input.limit,
        offset: input.offset,
        tableName: input.tableName,
      })
    }),

  /**
   * Execute a SQL query on a SQLite file
   */
  querySqliteFile: publicProcedure
    .input(
      z.object({
        filePath: z.string(),
        sql: z.string(),
      })
    )
    .query(({ input }) => {
      return querySqlite(input.filePath, input.sql)
    }),

  /**
   * List tables in a SQLite file
   */
  listSqliteTables: publicProcedure
    .input(z.object({ filePath: z.string() }))
    .query(({ input }) => {
      return listSqliteTables(input.filePath)
    }),
})

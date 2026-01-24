import { z } from "zod"
import { router, publicProcedure } from "../index"
import { readdir, stat } from "node:fs/promises"
import { join, relative, basename } from "node:path"

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
        // Skip hidden directories (except .github, .vscode, .ii, etc.)
        if (entry.name.startsWith(".") && !entry.name.startsWith(".github") && !entry.name.startsWith(".vscode") && !entry.name.startsWith(".ii")) continue

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
})

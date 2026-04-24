/**
 * Startup orphan-worktree scanner.
 *
 * Walks ~/.21st/worktrees/<slug>/<folder>/ two levels deep and removes any
 * directory that has no matching `chats.worktreePath` row. This catches:
 *  - Worktrees left behind by previous app crashes
 *  - Worktrees from manually-deleted DB rows
 *  - Worktrees migrated between projects
 *
 * Defensive: refuses to operate on paths outside the worktree root, never
 * blocks startup, swallows errors.
 */
import { readdir, rm, stat } from "node:fs/promises"
import { homedir } from "node:os"
import { join, resolve, sep } from "node:path"
import { eq } from "drizzle-orm"
import { chats, getDatabase } from "../db"
import { isPathInsideWorktreeRoot } from "./worktree"

const SCAN_TIMEOUT_MS = 30_000

async function listSubdirs(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return entries.filter((e) => e.isDirectory()).map((e) => e.name)
  } catch {
    return []
  }
}

async function isOlderThan(path: string, minAgeMs: number): Promise<boolean> {
  try {
    const s = await stat(path)
    return Date.now() - s.mtimeMs > minAgeMs
  } catch {
    return false
  }
}

async function scanOnce(): Promise<{ scanned: number; removed: number }> {
  const root = join(homedir(), ".21st", "worktrees")
  const projectSlugs = await listSubdirs(root)
  if (projectSlugs.length === 0) return { scanned: 0, removed: 0 }

  const db = getDatabase()
  let scanned = 0
  let removed = 0

  for (const slug of projectSlugs) {
    const slugPath = join(root, slug)
    const worktreeFolders = await listSubdirs(slugPath)
    for (const folder of worktreeFolders) {
      scanned++
      const fullPath = join(slugPath, folder)
      const resolved = resolve(fullPath)

      // Defense in depth: ensure path is still inside the worktree root after symlink resolution
      const allowedRoot = resolve(root) + sep
      if (!resolved.startsWith(allowedRoot)) continue
      if (!isPathInsideWorktreeRoot(fullPath)) continue

      const matchingChat = db
        .select({ id: chats.id })
        .from(chats)
        .where(eq(chats.worktreePath, fullPath))
        .get()

      if (matchingChat) continue

      // Don't remove freshly-created dirs (safety margin against race with new worktrees)
      const isOld = await isOlderThan(fullPath, 60_000)
      if (!isOld) continue

      try {
        await rm(fullPath, { recursive: true, force: true, maxRetries: 2 })
        removed++
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        console.warn(`[WorktreeCleanup] Failed to remove orphan ${fullPath}: ${msg}`)
      }
    }

    // Remove now-empty slug dir
    try {
      const remaining = await readdir(slugPath)
      if (remaining.length === 0 && isPathInsideWorktreeRoot(slugPath)) {
        await rm(slugPath, { recursive: true, force: true })
      }
    } catch {
      // Non-fatal
    }
  }

  return { scanned, removed }
}

/**
 * Run the orphan scan. Capped at SCAN_TIMEOUT_MS so a slow disk can't block
 * other startup work. Logs a one-line summary; never throws.
 */
export async function scanWorktreeOrphans(): Promise<void> {
  const start = Date.now()
  try {
    const result = await Promise.race([
      scanOnce(),
      new Promise<{ scanned: number; removed: number }>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), SCAN_TIMEOUT_MS),
      ),
    ])
    const elapsed = Date.now() - start
    console.log(
      `[WorktreeCleanup] Scanned ${result.scanned} worktree dirs, removed ${result.removed} orphans (${elapsed}ms)`,
    )
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.warn(`[WorktreeCleanup] Scan failed: ${msg}`)
  }
}

/**
 * Files & Folders Mention Provider
 *
 * Wraps the existing tRPC files.search endpoint as a mention provider.
 * Provides file and folder search with icons and relevance sorting.
 */

import { FolderOpen as FolderOpenIcon, Files as FilesIcon } from "lucide-react"
import { trpcClient } from "../../../lib/trpc"
import {
  createMentionProvider,
  type MentionItem,
  type MentionSearchContext,
  type MentionSearchResult,
  MENTION_PREFIXES,
} from "../types"

/**
 * Data payload for file/folder mentions
 */
export interface FileData {
  path: string
  type: "file" | "folder"
  repository: string
  additions?: number
  deletions?: number
}

/**
 * Extract directory path from full path for display
 */
function getTruncatedPath(path: string): string {
  const parts = path.split("/")
  if (parts.length <= 1) return ""
  return parts.slice(0, -1).join("/")
}

/**
 * Get filename from path
 */
function getFilename(path: string): string {
  return path.split("/").pop() || path
}

/**
 * Files & Folders provider
 */
export const filesProvider = createMentionProvider<FileData>({
  id: "files",
  name: "Files & Folders",
  category: {
    label: "Files & Folders",
    priority: 100,
  },
  trigger: {
    char: "@",
    position: "standalone",
    allowSpaces: true,
  },
  priority: 100,

  async search(context: MentionSearchContext): Promise<MentionSearchResult<FileData>> {
    const startTime = performance.now()

    if (!context.projectPath) {
      return { items: [], hasMore: false, timing: 0 }
    }

    // Check for abort
    if (context.signal.aborted) {
      return { items: [], hasMore: false, timing: 0 }
    }

    try {
      // Use tRPC to search files
      const results = await trpcClient.files.search.query({
        projectPath: context.projectPath,
        query: context.query,
        limit: context.limit,
      })

      // Map to MentionItem format
      const items: MentionItem<FileData>[] = results.map((result) => ({
        id: result.id,
        label: result.label,
        description: result.path,
        icon: result.type === "folder" ? "folder" : undefined,
        data: {
          path: result.path,
          type: result.type,
          repository: result.repository,
        },
        metadata: {
          type: result.type,
          truncatedPath: getTruncatedPath(result.path),
          repository: result.repository,
        },
      }))

      // Add changed files at the top if available
      if (context.changedFiles && context.changedFiles.length > 0 && !context.query) {
        const changedItems: MentionItem<FileData>[] = context.changedFiles.map((file) => ({
          id: `file:local:${file.path}`,
          label: getFilename(file.path),
          description: file.path,
          data: {
            path: file.path,
            type: "file" as const,
            repository: "local",
            additions: file.additions,
            deletions: file.deletions,
          },
          priority: 200, // Higher priority for changed files
          metadata: {
            type: "file" as const,
            truncatedPath: getTruncatedPath(file.path),
            repository: "local",
            diffStats: {
              additions: file.additions,
              deletions: file.deletions,
            },
          },
        }))

        // Dedupe - don't add changed files that are already in results
        const existingPaths = new Set(items.map((i) => i.data.path))
        const uniqueChangedItems = changedItems.filter(
          (i) => !existingPaths.has(i.data.path)
        )

        items.unshift(...uniqueChangedItems)
      }

      const timing = performance.now() - startTime

      return {
        items,
        hasMore: results.length === context.limit,
        totalCount: results.length,
        timing,
      }
    } catch (error) {
      console.error("[FilesProvider] Search error:", error)
      return {
        items: [],
        hasMore: false,
        warning: "Failed to search files",
        timing: performance.now() - startTime,
      }
    }
  },

  serialize(item: MentionItem<FileData>): string {
    return `@[${item.id}]`
  },

  deserialize(token: string): MentionItem<FileData> | null {
    try {
      // Check if this token belongs to us
      if (!token.startsWith(MENTION_PREFIXES.FILE) && !token.startsWith(MENTION_PREFIXES.FOLDER)) {
        return null
      }

      // Parse: file:repo:path or folder:repo:path
      const isFolder = token.startsWith(MENTION_PREFIXES.FOLDER)
      const prefix = isFolder ? MENTION_PREFIXES.FOLDER : MENTION_PREFIXES.FILE

      const rest = token.slice(prefix.length)
      const colonIndex = rest.indexOf(":")
      if (colonIndex === -1) {
        // No repo separator, assume local
        const path = rest
        return {
          id: token,
          label: getFilename(path),
          description: path,
          data: {
            path,
            type: isFolder ? "folder" : "file",
            repository: "local",
          },
          metadata: {
            type: isFolder ? "folder" : "file",
            truncatedPath: getTruncatedPath(path),
            repository: "local",
          },
        }
      }

      const repository = rest.slice(0, colonIndex)
      const path = rest.slice(colonIndex + 1)

      return {
        id: token,
        label: getFilename(path),
        description: path,
        data: {
          path,
          type: isFolder ? "folder" : "file",
          repository,
        },
        metadata: {
          type: isFolder ? "folder" : "file",
          truncatedPath: getTruncatedPath(path),
          repository,
        },
      }
    } catch (error) {
      console.warn(`[FilesProvider] Failed to deserialize token: ${token}`, error)
      return null
    }
  },

  isAvailable(context) {
    // Files provider is available when we have a project path
    return !!context.projectPath
  },
})

export default filesProvider

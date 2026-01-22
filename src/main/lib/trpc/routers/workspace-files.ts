import * as fs from "fs/promises"
import * as path from "path"
import { z } from "zod"
import { chats, getDatabase, projects } from "../../db"
import { eq } from "drizzle-orm"
import { publicProcedure, router } from "../index"

interface FileTreeNode {
  name: string
  path: string
  type: "file" | "folder"
  children?: FileTreeNode[]
}

/**
 * Validate and normalize a file path to prevent directory traversal
 */
function validatePath(filePath: string): string {
  const normalized = path.normalize(filePath)

  // Prevent directory traversal
  if (normalized.includes("..") || path.isAbsolute(normalized)) {
    throw new Error("Invalid file path")
  }

  return normalized
}

/**
 * Recursively build file tree structure
 */
async function buildFileTree(
  dirPath: string,
  relativePath: string = ""
): Promise<FileTreeNode[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  const nodes: FileTreeNode[] = []

  for (const entry of entries) {
    const entryPath = path.join(relativePath, entry.name)
    const fullPath = path.join(dirPath, entry.name)

    if (entry.isDirectory()) {
      const children = await buildFileTree(fullPath, entryPath)
      nodes.push({
        name: entry.name,
        path: entryPath,
        type: "folder",
        children,
      })
    } else {
      nodes.push({
        name: entry.name,
        path: entryPath,
        type: "file",
      })
    }
  }

  // Sort: folders first, then files, alphabetically
  return nodes.sort((a, b) => {
    if (a.type === b.type) {
      return a.name.localeCompare(b.name)
    }
    return a.type === "folder" ? -1 : 1
  })
}

export const workspaceFilesRouter = router({
  /**
   * List all files in workspace directory
   */
  listFiles: publicProcedure
    .input(z.object({ chatId: z.string() }))
    .query(async ({ input }) => {
      const db = getDatabase()

      // Get chat and project
      const chat = db.select().from(chats).where(eq(chats.id, input.chatId)).get()
      if (!chat) {
        throw new Error("Chat not found")
      }

      const project = db
        .select()
        .from(projects)
        .where(eq(projects.id, chat.projectId))
        .get()
      if (!project) {
        throw new Error("Project not found")
      }

      // Build workspace directory path
      const workspaceDir = path.join(
        project.path,
        ".ii",
        "workspaces",
        input.chatId
      )

      // Check if directory exists
      try {
        await fs.access(workspaceDir)
      } catch {
        // Directory doesn't exist yet, return empty tree
        return []
      }

      // Build and return file tree
      try {
        return await buildFileTree(workspaceDir)
      } catch (error) {
        console.error("[workspaceFiles.listFiles] error:", error)
        throw new Error("Failed to list files")
      }
    }),

  /**
   * Read file contents from workspace directory
   */
  readFile: publicProcedure
    .input(
      z.object({
        chatId: z.string(),
        filePath: z.string(),
      })
    )
    .query(async ({ input }) => {
      const db = getDatabase()

      // Validate file path
      const safePath = validatePath(input.filePath)

      // Get chat and project
      const chat = db.select().from(chats).where(eq(chats.id, input.chatId)).get()
      if (!chat) {
        throw new Error("Chat not found")
      }

      const project = db
        .select()
        .from(projects)
        .where(eq(projects.id, chat.projectId))
        .get()
      if (!project) {
        throw new Error("Project not found")
      }

      // Build full file path
      const workspaceDir = path.join(
        project.path,
        ".ii",
        "workspaces",
        input.chatId
      )
      const fullPath = path.join(workspaceDir, safePath)

      // Security: Ensure resolved path is still within workspace directory
      const resolvedPath = path.resolve(fullPath)
      const resolvedWorkspaceDir = path.resolve(workspaceDir)
      if (!resolvedPath.startsWith(resolvedWorkspaceDir)) {
        throw new Error("Access denied: path outside workspace directory")
      }

      // Read file
      try {
        const content = await fs.readFile(fullPath, "utf-8")
        return {
          content,
          path: safePath,
        }
      } catch (error) {
        console.error("[workspaceFiles.readFile] error:", error)
        throw new Error("Failed to read file")
      }
    }),
})

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

export const fileCrudRouter = router({
  /**
   * List workspace files for UI tree display
   * Scoped to .ii/workspaces/{chatId}/
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
   * Read any file from the project
   * Accepts project-relative paths (e.g., ".ii/workspaces/chatId/file.md" or "src/App.tsx")
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

      let projectRelativePath = input.filePath

      // Handle absolute paths by converting to project-relative
      if (path.isAbsolute(input.filePath)) {
        // Check if the absolute path is within the project
        if (input.filePath.startsWith(project.path)) {
          // Extract project-relative portion
          projectRelativePath = input.filePath.slice(project.path.length)
          // Remove leading slash
          if (projectRelativePath.startsWith(path.sep)) {
            projectRelativePath = projectRelativePath.slice(1)
          }
        } else {
          throw new Error("Access denied: absolute path outside project directory")
        }
      }

      // Normalize path (handles ./ ../ etc)
      const normalizedPath = path.normalize(projectRelativePath)

      // Build full file path from project root
      const fullPath = path.join(project.path, normalizedPath)

      console.log("[workspaceFiles.readFile] Path resolution:", {
        inputPath: input.filePath,
        isAbsolute: path.isAbsolute(input.filePath),
        projectRelativePath,
        normalizedPath,
        projectPath: project.path,
        fullPath,
      })

      // Security: Ensure resolved path is still within project directory
      const resolvedPath = path.resolve(fullPath)
      const resolvedProjectPath = path.resolve(project.path)
      if (!resolvedPath.startsWith(resolvedProjectPath)) {
        throw new Error("Access denied: path outside project directory")
      }

      // Read file
      try {
        const content = await fs.readFile(fullPath, "utf-8")
        return {
          content,
          path: normalizedPath,
        }
      } catch (error) {
        console.error("[workspaceFiles.readFile] error:", error)
        throw new Error("Failed to read file")
      }
    }),

})

"use client"

import { ChevronRight, File, Folder, FolderOpen, FileSpreadsheet, FileJson, Database, FileBox, Table2, ArrowRight } from "lucide-react"
import { memo, useCallback, useMemo } from "react"
import { cn } from "../../../../lib/utils"
import type { TreeNode } from "./build-file-tree"
import {
  ContextMenu,
  ContextMenuTrigger,
} from "../../../../components/ui/context-menu"
import { FileTreeContextMenu } from "./FileTreeContextMenu"

// Data file extensions for special icons (files that open in data viewer)
const DATA_FILE_EXTENSIONS: Record<string, "csv" | "sqlite" | "parquet" | "excel" | "arrow"> = {
  ".csv": "csv",
  ".tsv": "csv",
  ".db": "sqlite",
  ".sqlite": "sqlite",
  ".sqlite3": "sqlite",
  ".parquet": "parquet",
  ".pq": "parquet",
  ".xlsx": "excel",
  ".xls": "excel",
  ".arrow": "arrow",
  ".feather": "arrow",
  ".ipc": "arrow",
}

function getDataFileType(filename: string): "csv" | "sqlite" | "parquet" | "excel" | "arrow" | null {
  const ext = filename.includes(".") ? `.${filename.split(".").pop()?.toLowerCase()}` : ""
  return DATA_FILE_EXTENSIONS[ext] || null
}

function isDataFile(filename: string): boolean {
  return getDataFileType(filename) !== null
}

// Git status type matching the backend
type GitStatusCode =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "copied"
  | "untracked"
  | "ignored"
  | "unmerged"
  | null

export type GitStatusMap = Record<string, { status: GitStatusCode; staged: boolean }>

// Status colors matching VS Code conventions
const STATUS_COLORS: Record<string, string> = {
  modified: "text-yellow-500 dark:text-yellow-400",      // Yellow for modified
  added: "text-green-500 dark:text-green-400",           // Green for added/staged
  deleted: "text-red-500 dark:text-red-400",             // Red for deleted
  renamed: "text-green-500 dark:text-green-400",         // Green for renamed
  copied: "text-green-500 dark:text-green-400",          // Green for copied
  untracked: "text-green-600 dark:text-green-500",       // Darker green for untracked
  ignored: "text-muted-foreground/50",                   // Dimmed for ignored
  unmerged: "text-red-600 dark:text-red-500",            // Red for conflicts
}

// Status indicators (shown after filename)
const STATUS_INDICATORS: Record<string, string> = {
  modified: "M",
  added: "A",
  deleted: "D",
  renamed: "R",
  copied: "C",
  untracked: "U",
  unmerged: "!",
}

// Helper to highlight matching text in search results
function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text

  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const index = lowerText.indexOf(lowerQuery)

  if (index === -1) return text

  return (
    <>
      {text.slice(0, index)}
      <span className="bg-yellow-300/40 dark:bg-yellow-500/30 rounded-sm">
        {text.slice(index, index + query.length)}
      </span>
      {text.slice(index + query.length)}
    </>
  )
}

interface FileTreeNodeProps {
  node: TreeNode
  level: number
  expandedFolders: Set<string>
  onToggleFolder: (path: string) => void
  /** Called when a data file (CSV, JSON, SQLite, Parquet) is clicked */
  onSelectDataFile?: (path: string) => void
  /** Called when a source file (non-data file) is clicked */
  onSelectSourceFile?: (path: string) => void
  /** @deprecated Use onSelectDataFile and onSelectSourceFile instead */
  onSelectFile?: (path: string) => void
  gitStatus?: GitStatusMap
  /** Absolute path to project root (for context menu actions) */
  projectPath?: string
  /** Called when files are dropped onto a folder */
  onDropFiles?: (targetDir: string, filePaths: string[], isInternalMove?: boolean) => void
  /** Currently active drop target folder path */
  dropTargetPath?: string | null
  /** Called when drag enters a folder */
  onDragEnterFolder?: (folderPath: string) => void
  /** Called when drag leaves a folder */
  onDragLeaveFolder?: () => void
  /** Current search query for highlighting */
  searchQuery?: string
}

export const FileTreeNode = memo(function FileTreeNode({
  node,
  level,
  expandedFolders,
  onToggleFolder,
  onSelectDataFile,
  onSelectSourceFile,
  onSelectFile,
  gitStatus = {},
  projectPath,
  onDropFiles,
  dropTargetPath,
  onDragEnterFolder,
  onDragLeaveFolder,
  searchQuery,
}: FileTreeNodeProps) {
  const isExpanded = node.type === "folder" && expandedFolders.has(node.path)
  const hasChildren = node.type === "folder" && node.children.length > 0
  const isDropTarget = node.type === "folder" && dropTargetPath === node.path

  // Get git status for this file
  const fileStatus = gitStatus[node.path]
  const statusCode = fileStatus?.status
  const isStaged = fileStatus?.staged

  // For folders, check if any children have changes
  const folderHasChanges = useMemo(() => {
    if (node.type !== "folder") return false

    // Check if any file in gitStatus starts with this folder path (exclude ignored)
    return Object.entries(gitStatus).some(([path, status]) =>
      path.startsWith(node.path + "/") && status.status !== "ignored"
    )
  }, [node.type, node.path, gitStatus])

  // Check if this item or any parent folder is ignored
  const isIgnored = useMemo(() => {
    // Direct status check
    if (statusCode === "ignored") return true

    // Check if any parent folder is ignored in gitStatus
    const pathParts = node.path.split("/")
    for (let i = 1; i <= pathParts.length; i++) {
      const parentPath = pathParts.slice(0, i).join("/")
      if (gitStatus[parentPath]?.status === "ignored") return true
    }

    return false
  }, [node.path, statusCode, gitStatus])

  const handleClick = useCallback(() => {
    if (node.type === "folder") {
      onToggleFolder(node.path)
    } else {
      // Determine if this is a data file or source file
      if (isDataFile(node.name)) {
        // Data files: CSV, JSON, SQLite, Parquet
        onSelectDataFile?.(node.path)
      } else {
        // Source files: everything else
        onSelectSourceFile?.(node.path)
      }
      // Also call legacy onSelectFile for backwards compatibility
      onSelectFile?.(node.path)
    }
  }, [node.type, node.path, node.name, onToggleFolder, onSelectDataFile, onSelectSourceFile, onSelectFile])

  // Make files/folders draggable for internal drag-and-drop
  const handleDragStart = useCallback((e: React.DragEvent) => {
    // Set custom data for internal drag-and-drop
    // Use a custom MIME type to identify internal drags
    e.dataTransfer.setData("application/x-file-tree-path", node.path)
    e.dataTransfer.setData("application/x-file-tree-type", node.type)
    e.dataTransfer.setData("text/plain", node.path) // Fallback for chat input
    e.dataTransfer.effectAllowed = "copyMove"
  }, [node.path, node.type])

  // Drag and drop handlers for folders
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    if (node.type !== "folder") return
    e.preventDefault()
    e.stopPropagation()

    // Support both external files and internal drags
    const hasFiles = e.dataTransfer.types.includes("Files")
    const hasInternalDrag = e.dataTransfer.types.includes("application/x-file-tree-path")

    if (hasFiles || hasInternalDrag) {
      onDragEnterFolder?.(node.path)
    }
  }, [node.type, node.path, onDragEnterFolder])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (node.type !== "folder") return
    e.preventDefault()
    e.stopPropagation()

    // Support both external files and internal drags
    const hasFiles = e.dataTransfer.types.includes("Files")
    const hasInternalDrag = e.dataTransfer.types.includes("application/x-file-tree-path")

    if (hasFiles || hasInternalDrag) {
      e.dataTransfer.dropEffect = hasInternalDrag ? "move" : "copy"
      // Re-assert this folder as target (in case of rapid mouse movement between folders)
      onDragEnterFolder?.(node.path)
    }
  }, [node.type, node.path, onDragEnterFolder])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (node.type !== "folder") return
    e.preventDefault()
    e.stopPropagation()
    // Check if we're actually leaving this element
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX
    const y = e.clientY
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      onDragLeaveFolder?.()
    }
  }, [node.type, onDragLeaveFolder])

  const handleDrop = useCallback((e: React.DragEvent) => {
    // Always prevent default and stop propagation for folders to capture the drop
    if (node.type === "folder") {
      e.preventDefault()
      e.stopPropagation()

      // Check for internal file tree drag (file/folder being moved within tree)
      const internalPath = e.dataTransfer.getData("application/x-file-tree-path")
      const internalType = e.dataTransfer.getData("application/x-file-tree-type")

      if (internalPath && internalType) {
        // Don't allow dropping a folder into itself or its children
        if (internalPath === node.path || node.path.startsWith(internalPath + "/")) {
          return
        }
        // Call the move handler with the source path
        onDropFiles?.(node.path, [internalPath], true) // true = internal move
        return
      }

      // External files from system
      const files = Array.from(e.dataTransfer.files)
      if (files.length === 0) return

      // Get file paths using Electron's webUtils API
      const filePaths = files
        .map((file) => window.webUtils?.getPathForFile?.(file))
        .filter((p): p is string => !!p)

      if (filePaths.length > 0) {
        onDropFiles?.(node.path, filePaths, false) // false = external import
      }
    }
  }, [node.type, node.path, onDropFiles])

  const paddingLeft = level * 12 + 6

  // Determine text color based on status
  const textColorClass = statusCode ? STATUS_COLORS[statusCode] : "text-foreground"
  const statusIndicator = statusCode ? STATUS_INDICATORS[statusCode] : null

  return (
    <div className="min-w-0">
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            type="button"
            draggable
            onClick={handleClick}
            onDragStart={handleDragStart}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              "w-full flex items-center gap-1.5 py-0.5 text-left rounded-sm",
              "hover:bg-accent/50 cursor-pointer transition-colors text-xs",
              "focus:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              // Drop target highlight for folders
              isDropTarget && "bg-primary/20 ring-1 ring-primary",
            )}
            style={{ paddingLeft: `${paddingLeft}px`, paddingRight: "6px" }}
          >
            {/* Chevron for folders */}
            {node.type === "folder" ? (
              <ChevronRight
                className={cn(
                  "size-3 text-muted-foreground shrink-0 transition-transform duration-150",
                  isExpanded && "rotate-90",
                  !hasChildren && "invisible",
                )}
              />
            ) : (
              <span className="size-3 shrink-0" /> // Spacer for files
            )}

            {/* Icon */}
            {node.type === "folder" ? (
              isExpanded ? (
                <FolderOpen className={cn(
                  "size-3.5 shrink-0",
                  isIgnored
                    ? "text-muted-foreground/50"
                    : folderHasChanges
                      ? "text-yellow-500 dark:text-yellow-400"
                      : "text-muted-foreground"
                )} />
              ) : (
                <Folder className={cn(
                  "size-3.5 shrink-0",
                  isIgnored
                    ? "text-muted-foreground/50"
                    : folderHasChanges
                      ? "text-yellow-500 dark:text-yellow-400"
                      : "text-muted-foreground"
                )} />
              )
            ) : (
              // Use special icons for data files
              (() => {
                const dataType = getDataFileType(node.name)
                // Apply dimmed style for ignored files
                const ignoredClass = isIgnored ? "opacity-50" : ""
                if (dataType === "csv") {
                  return <FileSpreadsheet className={cn("size-3.5 shrink-0 text-green-500", ignoredClass)} />
                }
                if (dataType === "json") {
                  return <FileJson className={cn("size-3.5 shrink-0 text-yellow-500", ignoredClass)} />
                }
                if (dataType === "sqlite") {
                  return <Database className={cn("size-3.5 shrink-0 text-blue-500", ignoredClass)} />
                }
                if (dataType === "parquet") {
                  return <FileBox className={cn("size-3.5 shrink-0 text-purple-500", ignoredClass)} />
                }
                if (dataType === "excel") {
                  return <Table2 className={cn("size-3.5 shrink-0 text-emerald-600", ignoredClass)} />
                }
                if (dataType === "arrow") {
                  return <ArrowRight className={cn("size-3.5 shrink-0 text-orange-500", ignoredClass)} />
                }
                return <File className={cn("size-3.5 shrink-0", textColorClass)} />
              })()
            )}

            {/* Name */}
            <span className={cn("truncate flex-1", textColorClass)}>
              {searchQuery ? highlightMatch(node.name, searchQuery) : node.name}
            </span>

            {/* Status indicator */}
            {statusIndicator && (
              <span className={cn(
                "text-[10px] font-medium shrink-0 ml-1",
                textColorClass,
                isStaged && "underline" // Underline if staged
              )}>
                {statusIndicator}
              </span>
            )}
          </button>
        </ContextMenuTrigger>
        {projectPath && (
          <FileTreeContextMenu
            path={node.path}
            type={node.type}
            projectPath={projectPath}
          />
        )}
      </ContextMenu>

      {/* Children (only for expanded folders) */}
      {isExpanded && node.children.length > 0 && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              level={level + 1}
              expandedFolders={expandedFolders}
              onToggleFolder={onToggleFolder}
              onSelectDataFile={onSelectDataFile}
              onSelectSourceFile={onSelectSourceFile}
              onSelectFile={onSelectFile}
              gitStatus={gitStatus}
              projectPath={projectPath}
              onDropFiles={onDropFiles}
              dropTargetPath={dropTargetPath}
              onDragEnterFolder={onDragEnterFolder}
              onDragLeaveFolder={onDragLeaveFolder}
              searchQuery={searchQuery}
            />
          ))}
        </div>
      )}
    </div>
  )
})

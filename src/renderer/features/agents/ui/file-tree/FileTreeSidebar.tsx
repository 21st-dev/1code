"use client"

import { useAtom } from "jotai"
import { useCallback, useMemo, useState, useEffect, useRef } from "react"
import { Button } from "../../../../components/ui/button"
import { IconDoubleChevronLeft } from "../../../../components/ui/icons"
import { Input } from "../../../../components/ui/input"
import { Kbd } from "../../../../components/ui/kbd"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../../../components/ui/tooltip"
import { trpc } from "../../../../lib/trpc"
import { expandedFoldersAtomFamily } from "../../atoms"
import { buildFileTree, countFiles, countFolders, filterTree } from "./build-file-tree"
import { FileTreeNode, type GitStatusMap } from "./FileTreeNode"
import { Download } from "lucide-react"
import { toast } from "sonner"

interface FileTreeSidebarProps {
  projectPath: string | undefined
  projectId: string
  onClose: () => void
  /** Called when a data file (CSV, JSON, SQLite, Parquet) is clicked */
  onSelectDataFile?: (path: string) => void
  /** Called when a source file (non-data file) is clicked */
  onSelectSourceFile?: (path: string) => void
  /** @deprecated Use onSelectDataFile and onSelectSourceFile instead */
  onSelectFile?: (path: string) => void
}

// Unified drop target state - ensures mutual exclusivity
type DropTarget =
  | { type: "none" }                    // Not dragging over file tree
  | { type: "root" }                    // Drop to project root
  | { type: "folder"; path: string }    // Drop to specific folder

export function FileTreeSidebar({
  projectPath,
  projectId,
  onClose,
  onSelectDataFile,
  onSelectSourceFile,
  onSelectFile,
}: FileTreeSidebarProps) {
  const [expandedFolders, setExpandedFolders] = useAtom(
    expandedFoldersAtomFamily(projectId),
  )

  // Search state
  const [searchQuery, setSearchQuery] = useState("")
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Drag and drop state - unified to ensure mutual exclusivity
  const [dropTarget, setDropTarget] = useState<DropTarget>({ type: "none" })
  const [isImporting, setIsImporting] = useState(false)

  // Fetch all files from project (like VS Code, we scan everything upfront)
  const {
    data: entries = [],
    isLoading,
    refetch,
  } = trpc.files.listAll.useQuery(
    { projectPath: projectPath || "" },
    {
      enabled: !!projectPath,
      staleTime: 1000, // Short TTL since we have real-time watching
    },
  )

  // Fetch git status
  const {
    data: gitStatus = {},
    refetch: refetchGitStatus,
  } = trpc.files.gitStatus.useQuery(
    { projectPath: projectPath || "" },
    {
      enabled: !!projectPath,
      staleTime: 1000,
    },
  )

  // Subscribe to file changes for real-time sync
  trpc.files.watchChanges.useSubscription(
    { projectPath: projectPath || "" },
    {
      enabled: !!projectPath,
      onData: () => {
        // Refetch file list when files change
        refetch()
      },
    },
  )

  // Subscribe to git changes separately (more efficient - only watches .git directory)
  trpc.files.watchGitChanges.useSubscription(
    { projectPath: projectPath || "" },
    {
      enabled: !!projectPath,
      onData: () => {
        // Refetch git status when git state changes (commits, staging, etc.)
        refetchGitStatus()
      },
    },
  )

  // Build tree from entries (all files are loaded upfront like VS Code)
  const tree = useMemo(() => buildFileTree(entries), [entries])

  // Filter tree based on search query
  const filteredTree = useMemo(
    () => filterTree(tree, searchQuery),
    [tree, searchQuery]
  )

  // Stats for footer (show unfiltered counts)
  const fileCount = useMemo(() => countFiles(tree), [tree])
  const folderCount = useMemo(() => countFolders(tree), [tree])

  // Toggle folder expansion (simple - all files are loaded upfront)
  const handleToggleFolder = useCallback(
    (path: string) => {
      const next = new Set(expandedFolders)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      setExpandedFolders(next)
    },
    [expandedFolders, setExpandedFolders],
  )

  // Import files mutation
  const importFilesMutation = trpc.files.importFiles.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`Imported ${result.imported} of ${result.total} file${result.total !== 1 ? "s" : ""}`)
        // File watcher will automatically refresh the tree
      } else {
        toast.error("Failed to import files")
      }
    },
    onError: (error) => {
      toast.error(`Import failed: ${error.message}`)
    },
  })

  // Move file mutation (for internal drag-and-drop)
  const moveFileMutation = trpc.files.moveFile.useMutation({
    onSuccess: () => {
      toast.success("File moved successfully")
      // File watcher will automatically refresh the tree
    },
    onError: (error) => {
      toast.error(`Move failed: ${error.message}`)
    },
  })

  // Import files to a target directory
  const importFilesToDir = useCallback(
    async (targetDir: string, filePaths: string[]) => {
      if (!projectPath) {
        toast.error("No project selected")
        return
      }

      setIsImporting(true)
      setDropTarget({ type: "none" })
      try {
        await importFilesMutation.mutateAsync({
          sourcePaths: filePaths,
          targetDir,
        })
      } finally {
        setIsImporting(false)
      }
    },
    [projectPath, importFilesMutation]
  )

  // Folder-level drag handlers (passed to FileTreeNode)
  const handleDragEnterFolder = useCallback((folderPath: string) => {
    // Entering a folder - set folder as drop target (hides root overlay)
    setDropTarget({ type: "folder", path: folderPath })
  }, [])

  const handleDragLeaveFolder = useCallback(() => {
    // Leaving a folder - revert to root (still dragging, just not over folder)
    setDropTarget({ type: "root" })
  }, [])

  const handleDropOnFolder = useCallback(
    (targetDir: string, filePaths: string[], isInternalMove?: boolean) => {
      if (!projectPath) return

      // targetDir from FileTreeNode is a relative path, convert to absolute
      const absoluteTargetDir = targetDir.startsWith("/")
        ? targetDir
        : `${projectPath}/${targetDir}`

      if (isInternalMove && filePaths.length === 1) {
        // Internal move - the filePath is a relative path within the project
        const sourcePath = filePaths[0].startsWith("/")
          ? filePaths[0]
          : `${projectPath}/${filePaths[0]}`
        moveFileMutation.mutate({ sourcePath, targetDir: absoluteTargetDir })
      } else {
        // External import
        importFilesToDir(absoluteTargetDir, filePaths)
      }
    },
    [importFilesToDir, projectPath, moveFileMutation]
  )

  // Root container drag handlers (for dropping on empty area = project root)
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const hasFiles = e.dataTransfer.types.includes("Files")
    const hasInternalDrag = e.dataTransfer.types.includes("application/x-file-tree-path")

    if (hasFiles || hasInternalDrag) {
      // Only set to root if we're not already targeting a folder
      // Use functional update to avoid stale closure issues
      setDropTarget((prev) => {
        if (prev.type === "folder") return prev  // Keep folder target
        return { type: "root" }
      })
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    // Only clear if actually leaving the container bounds entirely
    const rect = e.currentTarget.getBoundingClientRect()
    if (
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    ) {
      setDropTarget({ type: "none" })
    }
  }, [])

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()

      // Always clear drop target state on drop
      setDropTarget({ type: "none" })

      if (!projectPath) {
        toast.error("No project selected")
        return
      }

      // Check for internal file tree drag (moving file within the project)
      const internalPath = e.dataTransfer.getData("application/x-file-tree-path")
      if (internalPath) {
        // Internal move - move file to project root
        const sourcePath = internalPath.startsWith("/")
          ? internalPath
          : `${projectPath}/${internalPath}`

        // Don't move if already at root level
        const relativePath = sourcePath.startsWith(projectPath)
          ? sourcePath.slice(projectPath.length + 1)
          : internalPath
        if (!relativePath.includes("/")) {
          // File is already at root level
          return
        }

        moveFileMutation.mutate({ sourcePath, targetDir: projectPath })
        return
      }

      // External files from system
      const files = Array.from(e.dataTransfer.files)
      if (files.length === 0) return

      // Get file paths using Electron's webUtils API
      const filePaths = files
        .map((file) => window.webUtils?.getPathForFile?.(file))
        .filter((p): p is string => !!p)

      if (filePaths.length === 0) {
        toast.error("Could not get file paths. Make sure you're dragging files from your file system.")
        return
      }

      // Import to project root
      importFilesToDir(projectPath, filePaths)
    },
    [projectPath, importFilesToDir, moveFileMutation]
  )

  // Container ref for focus management
  const containerRef = useRef<HTMLDivElement>(null)

  // Handle paste events for file import
  const handlePaste = useCallback(
    async (e: ClipboardEvent) => {
      if (!projectPath) return

      const files = e.clipboardData?.files
      if (!files || files.length === 0) return

      // Get file paths using Electron's webUtils API
      const filePaths = Array.from(files)
        .map((file) => window.webUtils?.getPathForFile?.(file))
        .filter((p): p is string => !!p)

      if (filePaths.length > 0) {
        e.preventDefault()
        importFilesToDir(projectPath, filePaths)
      }
    },
    [projectPath, importFilesToDir]
  )

  // Listen for paste events when the file tree is focused or hovered
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // We need to use the document-level paste handler because
    // paste events only fire on editable elements or document
    const handleDocumentPaste = (e: ClipboardEvent) => {
      // Only handle if the file tree container is focused or contains the active element
      if (
        container.contains(document.activeElement) ||
        container.matches(":hover")
      ) {
        handlePaste(e)
      }
    }

    document.addEventListener("paste", handleDocumentPaste)
    return () => document.removeEventListener("paste", handleDocumentPaste)
  }, [handlePaste])

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full min-w-0 overflow-hidden"
      tabIndex={0} // Make focusable for paste events
    >
      {/* Header - matches sidebar team dropdown area */}
      <div className="px-2 pt-2 pb-2 flex-shrink-0">
        <div className="flex items-center justify-between gap-1">
          <h3 className="text-xs font-medium text-muted-foreground whitespace-nowrap px-1.5">
            Files
          </h3>
          {/* Close button */}
          <Tooltip delayDuration={500}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-6 w-6 p-0 hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] text-foreground flex-shrink-0 rounded-md"
                aria-label="Close file tree"
              >
                <IconDoubleChevronLeft className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Close file tree
              <Kbd>⌘B</Kbd>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Search Input - matches sidebar search section */}
      <div className="px-2 pb-3 flex-shrink-0">
        <Input
          ref={searchInputRef}
          placeholder="Search files..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault()
              setSearchQuery("")
              searchInputRef.current?.blur()
            }
          }}
          className="w-full h-7 rounded-lg text-sm bg-muted border border-input placeholder:text-muted-foreground/40"
        />
      </div>

      {/* Root folder name */}
      {projectPath && (
        <div className="px-2 pb-1 flex-shrink-0">
          <div className="px-1.5 py-1 text-xs font-medium text-muted-foreground uppercase truncate">
            {projectPath.split("/").pop()}
          </div>
        </div>
      )}

      {/* Content with drag-and-drop */}
      <div
        className="flex-1 overflow-y-auto overflow-x-hidden py-1 relative"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drop overlay - for project root */}
        {dropTarget.type === "root" && (
          <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
            <div className="absolute inset-1 rounded-md border border-primary/40 bg-primary/5" />
            <div className="relative flex items-center gap-1.5 px-2 py-1 rounded-md bg-background/90 border border-border shadow-sm">
              <Download className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Drop to project root</span>
            </div>
          </div>
        )}

        {/* Drop indicator for specific folder */}
        {dropTarget.type === "folder" && (
          <div className="absolute inset-0 z-40 pointer-events-none">
            <div className="absolute inset-1 rounded-md border border-primary/40 bg-primary/5" />
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2 py-1 rounded-md bg-background/90 border border-border shadow-sm">
              <Download className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Drop into <span className="font-medium text-foreground">{dropTarget.path.split("/").pop()}</span></span>
            </div>
          </div>
        )}

        {/* Importing overlay */}
        {isImporting && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/80 pointer-events-none">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full mb-2" />
            <span className="text-sm text-muted-foreground">Importing files...</span>
          </div>
        )}

        {!projectPath ? (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center">
            No project selected
          </div>
        ) : isLoading ? (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center">
            Loading files...
          </div>
        ) : tree.length === 0 ? (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center flex flex-col items-center gap-2">
            <span>No files found</span>
            <span className="text-[10px]">Drag & drop or paste (⌘V) files here</span>
          </div>
        ) : filteredTree.length === 0 ? (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center">
            No files matching "{searchQuery}"
          </div>
        ) : (
          filteredTree.map((node) => (
            <FileTreeNode
              key={node.path}
              node={node}
              level={0}
              expandedFolders={expandedFolders}
              onToggleFolder={handleToggleFolder}
              onSelectDataFile={onSelectDataFile}
              onSelectSourceFile={onSelectSourceFile}
              onSelectFile={onSelectFile}
              gitStatus={gitStatus as GitStatusMap}
              projectPath={projectPath}
              onDropFiles={handleDropOnFolder}
              dropTargetPath={dropTarget.type === "folder" ? dropTarget.path : null}
              onDragEnterFolder={handleDragEnterFolder}
              onDragLeaveFolder={handleDragLeaveFolder}
              searchQuery={searchQuery}
            />
          ))
        )}
      </div>

      {/* Footer with stats */}
      {!isLoading && tree.length > 0 && (
        <div className="px-3 py-1.5 border-t border-border/50 text-[10px] text-muted-foreground flex-shrink-0">
          {fileCount} file{fileCount !== 1 ? "s" : ""}, {folderCount} folder
          {folderCount !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  )
}

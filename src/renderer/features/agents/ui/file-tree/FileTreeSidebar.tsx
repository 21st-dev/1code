"use client"

import { useAtom } from "jotai"
import { useCallback, useMemo, useState, useEffect, useRef } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
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
import {
  expandedFoldersAtomFamily,
  selectedFilePathAtomFamily,
  selectedFilePathsAtomFamily,
  fileClipboardAtom,
} from "../../atoms"
import { buildFileTree, countFiles, countFolders, filterTree, flattenVisibleTree } from "./build-file-tree"
import { useAtomValue, useSetAtom } from "jotai"
import { FileTreeNodeRow, type GitStatusMap } from "./FileTreeNode"
import { Download } from "lucide-react"
import { toast } from "sonner"
import { useGitWatcher } from "../../../../lib/hooks/use-file-change-listener"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../../../components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../../components/ui/dialog"

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

  // Selection state
  const [selectedPath, setSelectedPath] = useAtom(selectedFilePathAtomFamily(projectId))
  const [selectedPaths, setSelectedPaths] = useAtom(selectedFilePathsAtomFamily(projectId))
  const fileClipboard = useAtomValue(fileClipboardAtom)
  const setFileClipboard = useSetAtom(fileClipboardAtom)

  // Track last selected for shift+click range selection
  const lastSelectedRef = useRef<string | null>(null)

  // State for delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [pendingDeletePaths, setPendingDeletePaths] = useState<string[]>([])

  // State for rename dialog
  const [showRenameDialog, setShowRenameDialog] = useState(false)
  const [renameTarget, setRenameTarget] = useState<string | null>(null)
  const [newName, setNewName] = useState("")

  // State for new file/folder dialogs
  const [showNewFileDialog, setShowNewFileDialog] = useState(false)
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false)
  const [newItemName, setNewItemName] = useState("")
  const [newItemTargetDir, setNewItemTargetDir] = useState<string | null>(null)

  // Search state with debouncing for performance
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("")
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Debounce search query to avoid filtering on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
    }, 150) // 150ms debounce

    return () => clearTimeout(timer)
  }, [searchQuery])

  // Drag and drop state - unified to ensure mutual exclusivity
  const [dropTarget, setDropTarget] = useState<DropTarget>({ type: "none" })
  const [isImporting, setIsImporting] = useState(false)

  // Auto-expand timer for drag hover
  const autoExpandTimerRef = useRef<NodeJS.Timeout | null>(null)
  const autoExpandFolderRef = useRef<string | null>(null)

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

  // Use unified git watcher for cross-component invalidation (chokidar-based, most reliable)
  useGitWatcher(projectPath)

  // Build tree from entries (all files are loaded upfront like VS Code)
  const tree = useMemo(() => buildFileTree(entries), [entries])

  // Filter tree based on debounced search query (for performance)
  const filteredTree = useMemo(
    () => filterTree(tree, debouncedSearchQuery),
    [tree, debouncedSearchQuery]
  )

  // Flatten visible tree for virtualization (only expanded nodes)
  const flattenedNodes = useMemo(
    () => flattenVisibleTree(filteredTree, expandedFolders),
    [filteredTree, expandedFolders]
  )

  // Stabilize gitStatus object to prevent unnecessary re-renders
  const stableGitStatus = useMemo(() => gitStatus, [JSON.stringify(gitStatus)])

  // Pre-compute set of folders that have changes (O(n) once instead of O(n*m))
  const foldersWithChanges = useMemo(() => {
    const folders = new Set<string>()
    for (const [path, status] of Object.entries(stableGitStatus)) {
      if (status.status === "ignored") continue
      // Add all parent folders of this changed file
      const parts = path.split("/")
      for (let i = 1; i < parts.length; i++) {
        folders.add(parts.slice(0, i).join("/"))
      }
    }
    return folders
  }, [stableGitStatus])

  // Stats for footer (show unfiltered counts)
  const fileCount = useMemo(() => countFiles(tree), [tree])
  const folderCount = useMemo(() => countFolders(tree), [tree])

  // Scroll container ref for virtualization
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Virtualizer for efficient rendering of large file trees
  const virtualizer = useVirtualizer({
    count: flattenedNodes.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 24, // Each row is ~24px
    overscan: 15, // Render 15 extra items above/below viewport
  })

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

  // Handle file/folder selection with modifier key support
  const handleSelect = useCallback(
    (path: string, event: React.MouseEvent) => {
      if (event.metaKey || event.ctrlKey) {
        // Cmd/Ctrl+Click: Toggle item in multi-selection
        const next = new Set(selectedPaths)
        if (next.has(path)) {
          next.delete(path)
          // If we removed the focused item, update focus to another selected item
          if (path === selectedPath) {
            const remaining = Array.from(next)
            setSelectedPath(remaining.length > 0 ? remaining[remaining.length - 1] : null)
          }
        } else {
          next.add(path)
          setSelectedPath(path)
        }
        setSelectedPaths(next)
        lastSelectedRef.current = path
      } else if (event.shiftKey && lastSelectedRef.current) {
        // Shift+Click: Range selection
        const lastIndex = flattenedNodes.findIndex(n => n.node.path === lastSelectedRef.current)
        const currentIndex = flattenedNodes.findIndex(n => n.node.path === path)

        if (lastIndex !== -1 && currentIndex !== -1) {
          const startIndex = Math.min(lastIndex, currentIndex)
          const endIndex = Math.max(lastIndex, currentIndex)

          const rangeSelection = new Set<string>()
          for (let i = startIndex; i <= endIndex; i++) {
            rangeSelection.add(flattenedNodes[i].node.path)
          }
          setSelectedPaths(rangeSelection)
          setSelectedPath(path)
        }
      } else {
        // Regular click: Single selection, clear multi-selection
        setSelectedPath(path)
        setSelectedPaths(new Set([path]))
        lastSelectedRef.current = path
      }
    },
    [selectedPath, selectedPaths, setSelectedPath, setSelectedPaths, flattenedNodes],
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

  // Copy files mutation
  const copyFilesMutation = trpc.files.copyFiles.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`Copied ${result.copied} file${result.copied !== 1 ? "s" : ""}`)
        // Clear clipboard after paste if it was a cut operation
        if (fileClipboard?.operation === "cut") {
          setFileClipboard(null)
        }
      } else {
        toast.error("Failed to copy files")
      }
    },
    onError: (error) => {
      toast.error(`Copy failed: ${error.message}`)
    },
  })

  // Delete files mutation
  const deleteFilesMutation = trpc.files.deleteFiles.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`Deleted ${result.deleted} item${result.deleted !== 1 ? "s" : ""}`)
        // Clear selection
        setSelectedPath(null)
        setSelectedPaths(new Set())
      } else {
        toast.error("Failed to delete files")
      }
      setShowDeleteConfirm(false)
      setPendingDeletePaths([])
    },
    onError: (error) => {
      toast.error(`Delete failed: ${error.message}`)
      setShowDeleteConfirm(false)
      setPendingDeletePaths([])
    },
  })

  // Rename file mutation
  const renameFileMutation = trpc.files.renameFile.useMutation({
    onSuccess: () => {
      toast.success("Renamed successfully")
      setShowRenameDialog(false)
      setRenameTarget(null)
      setNewName("")
    },
    onError: (error) => {
      toast.error(`Rename failed: ${error.message}`)
    },
  })

  // Create file mutation
  const createFileMutation = trpc.files.createFile.useMutation({
    onSuccess: () => {
      toast.success("File created")
      setShowNewFileDialog(false)
      setNewItemName("")
      setNewItemTargetDir(null)
    },
    onError: (error) => {
      toast.error(`Create file failed: ${error.message}`)
    },
  })

  // Create folder mutation
  const createFolderMutation = trpc.files.createFolder.useMutation({
    onSuccess: () => {
      toast.success("Folder created")
      setShowNewFolderDialog(false)
      setNewItemName("")
      setNewItemTargetDir(null)
    },
    onError: (error) => {
      toast.error(`Create folder failed: ${error.message}`)
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

    // Auto-expand: Start timer to expand folder after 500ms of hovering
    if (autoExpandFolderRef.current !== folderPath) {
      // Clear any existing timer
      if (autoExpandTimerRef.current) {
        clearTimeout(autoExpandTimerRef.current)
      }
      autoExpandFolderRef.current = folderPath

      // Only set timer if folder is not already expanded
      if (!expandedFolders.has(folderPath)) {
        autoExpandTimerRef.current = setTimeout(() => {
          // Use functional update to get the latest state and avoid overwriting
          // any manual expand/collapse actions that occurred during the delay
          setExpandedFolders((prev) => {
            const next = new Set(prev)
            next.add(folderPath)
            return next
          })
        }, 500)
      }
    }
  }, [expandedFolders, setExpandedFolders])

  const handleDragLeaveFolder = useCallback(() => {
    // Leaving a folder - revert to root (still dragging, just not over folder)
    setDropTarget({ type: "root" })

    // Clear auto-expand timer
    if (autoExpandTimerRef.current) {
      clearTimeout(autoExpandTimerRef.current)
      autoExpandTimerRef.current = null
    }
    autoExpandFolderRef.current = null
  }, [])

  const handleDropOnFolder = useCallback(
    (targetDir: string, filePaths: string[], isInternalMove?: boolean) => {
      if (!projectPath) return

      // Clear auto-expand timer on drop
      if (autoExpandTimerRef.current) {
        clearTimeout(autoExpandTimerRef.current)
        autoExpandTimerRef.current = null
      }
      autoExpandFolderRef.current = null

      // targetDir from FileTreeNode is a relative path, convert to absolute
      const absoluteTargetDir = targetDir.startsWith("/")
        ? targetDir
        : `${projectPath}/${targetDir}`

      if (isInternalMove) {
        // Internal move - move all files
        for (const filePath of filePaths) {
          const sourcePath = filePath.startsWith("/")
            ? filePath
            : `${projectPath}/${filePath}`
          moveFileMutation.mutate({ sourcePath, targetDir: absoluteTargetDir })
        }
      } else {
        // External import
        importFilesToDir(absoluteTargetDir, filePaths)
      }
    },
    [importFilesToDir, projectPath, moveFileMutation]
  )

  // Clean up auto-expand timer on unmount
  useEffect(() => {
    return () => {
      if (autoExpandTimerRef.current) {
        clearTimeout(autoExpandTimerRef.current)
      }
    }
  }, [])

  // Clear drag state when drag ends anywhere (catches cancelled drags, external drops, etc.)
  useEffect(() => {
    const handleDocumentDragEnd = () => {
      setDropTarget({ type: "none" })
      if (autoExpandTimerRef.current) {
        clearTimeout(autoExpandTimerRef.current)
        autoExpandTimerRef.current = null
      }
      autoExpandFolderRef.current = null
    }

    document.addEventListener("dragend", handleDocumentDragEnd)
    return () => document.removeEventListener("dragend", handleDocumentDragEnd)
  }, [])

  // Root container drag handlers (for dropping on empty area = project root)
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Don't set any state here - folder highlighting is handled by folder nodes
    // Drop to empty space will go to project root (handled in handleDrop)
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

      // Clear auto-expand timer on drop
      if (autoExpandTimerRef.current) {
        clearTimeout(autoExpandTimerRef.current)
        autoExpandTimerRef.current = null
      }
      autoExpandFolderRef.current = null

      if (!projectPath) {
        toast.error("No project selected")
        return
      }

      // Check for multi-drag first (JSON array of paths)
      const multiPathsJson = e.dataTransfer.getData("application/x-file-tree-paths")
      if (multiPathsJson) {
        try {
          const internalPaths = JSON.parse(multiPathsJson) as string[]
          // Filter out files already at root level
          const pathsToMove = internalPaths.filter(p => p.includes("/"))
          for (const path of pathsToMove) {
            const sourcePath = path.startsWith("/")
              ? path
              : `${projectPath}/${path}`
            moveFileMutation.mutate({ sourcePath, targetDir: projectPath })
          }
          return
        } catch {
          // Fall back to single path
        }
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

  // Helper to compute target dir based on selection
  const getTargetDirFromSelection = useCallback((): string => {
    if (!projectPath) return ""
    if (!selectedPath) return projectPath

    // Helper to compute target dir from a node
    const computeTargetDir = (nodePath: string, nodeType: "file" | "folder"): string => {
      if (nodeType === "folder") {
        return `${projectPath}/${nodePath}`
      }
      // For files, use parent directory
      const parentPath = nodePath.includes("/")
        ? nodePath.substring(0, nodePath.lastIndexOf("/"))
        : ""
      return parentPath ? `${projectPath}/${parentPath}` : projectPath
    }

    // Find the selected node to check if it's a folder
    const selectedNode = flattenedNodes.find(n => n.node.path === selectedPath)
    if (selectedNode) {
      return computeTargetDir(selectedPath, selectedNode.node.type)
    }

    // Node not found in visible tree - check the full tree
    const checkNodeType = (nodes: typeof filteredTree): "file" | "folder" | null => {
      for (const n of nodes) {
        if (n.path === selectedPath) return n.type
        if (n.type === "folder" && n.children) {
          const found = checkNodeType(n.children)
          if (found) return found
        }
      }
      return null
    }
    const nodeType = checkNodeType(filteredTree)
    if (nodeType) {
      return computeTargetDir(selectedPath, nodeType)
    }

    return projectPath
  }, [projectPath, selectedPath, flattenedNodes, filteredTree])

  // Handle paste events for file import (external files from Finder/Explorer)
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
        // Use selected folder as target, or project root if nothing selected
        const targetDir = getTargetDirFromSelection()
        importFilesToDir(targetDir, filePaths)
      }
    },
    [projectPath, importFilesToDir, getTargetDirFromSelection]
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

  // Handle internal clipboard paste via Ctrl+V at document level for reliability
  useEffect(() => {
    const container = containerRef.current
    if (!container || !projectPath) return

    const handleDocumentKeyDown = (e: KeyboardEvent) => {
      // Only handle Ctrl/Cmd+V for internal clipboard paste
      if (!((e.metaKey || e.ctrlKey) && e.key === "v")) return
      if (!fileClipboard) return

      // Only handle if the file tree container is focused or contains the active element
      if (!container.contains(document.activeElement) && !container.matches(":hover")) {
        return
      }

      // Don't handle if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      e.preventDefault()

      // Use the shared helper to get target directory based on selection
      const targetDir = getTargetDirFromSelection()

      // Execute paste operation
      if (fileClipboard.operation === "cut") {
        for (const sourcePath of fileClipboard.paths) {
          moveFileMutation.mutate({ sourcePath, targetDir })
        }
        setFileClipboard(null)
      } else {
        copyFilesMutation.mutate({
          sourcePaths: fileClipboard.paths,
          targetDir,
        })
      }
    }

    document.addEventListener("keydown", handleDocumentKeyDown)
    return () => document.removeEventListener("keydown", handleDocumentKeyDown)
  }, [projectPath, fileClipboard, setFileClipboard, moveFileMutation, copyFilesMutation, getTargetDirFromSelection])

  // Keyboard handler for file operations
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!projectPath) return

      // Don't handle if typing in search input
      if (e.target instanceof HTMLInputElement) return

      // Escape: Clear drag state if active
      if (e.key === "Escape" && dropTarget.type !== "none") {
        e.preventDefault()
        setDropTarget({ type: "none" })
        if (autoExpandTimerRef.current) {
          clearTimeout(autoExpandTimerRef.current)
          autoExpandTimerRef.current = null
        }
        autoExpandFolderRef.current = null
        return
      }

      const hasSelection = selectedPaths.size > 0

      // Cmd+C: Copy
      if ((e.metaKey || e.ctrlKey) && e.key === "c" && hasSelection) {
        e.preventDefault()
        const absolutePaths = Array.from(selectedPaths).map(p => `${projectPath}/${p}`)
        setFileClipboard({
          paths: absolutePaths,
          operation: "copy",
          projectPath,
        })
        toast.success(`${selectedPaths.size} item${selectedPaths.size > 1 ? "s" : ""} copied`)
        return
      }

      // Cmd+X: Cut
      if ((e.metaKey || e.ctrlKey) && e.key === "x" && hasSelection) {
        e.preventDefault()
        const absolutePaths = Array.from(selectedPaths).map(p => `${projectPath}/${p}`)
        setFileClipboard({
          paths: absolutePaths,
          operation: "cut",
          projectPath,
        })
        toast.success(`${selectedPaths.size} item${selectedPaths.size > 1 ? "s" : ""} cut`)
        return
      }

      // Note: Cmd+V paste is handled by document-level listener in useEffect above

      // Cmd+D: Duplicate
      if ((e.metaKey || e.ctrlKey) && e.key === "d" && hasSelection) {
        e.preventDefault()
        const absolutePaths = Array.from(selectedPaths).map(p => `${projectPath}/${p}`)
        // For each file, copy to its own directory
        for (const path of absolutePaths) {
          const parentDir = path.substring(0, path.lastIndexOf("/")) || projectPath
          copyFilesMutation.mutate({
            sourcePaths: [path],
            targetDir: parentDir,
          })
        }
        return
      }

      // Delete or Cmd+Backspace: Delete
      if ((e.key === "Delete" || e.key === "Backspace") && hasSelection) {
        if (e.key === "Backspace" && !(e.metaKey || e.ctrlKey)) return // Only Cmd+Backspace, not just Backspace
        e.preventDefault()
        const absolutePaths = Array.from(selectedPaths).map(p => `${projectPath}/${p}`)
        setPendingDeletePaths(absolutePaths)
        setShowDeleteConfirm(true)
        return
      }

      // Enter: Rename (single selection only)
      if (e.key === "Enter" && selectedPaths.size === 1 && selectedPath) {
        e.preventDefault()
        const fileName = selectedPath.includes("/")
          ? selectedPath.substring(selectedPath.lastIndexOf("/") + 1)
          : selectedPath
        setRenameTarget(`${projectPath}/${selectedPath}`)
        setNewName(fileName)
        setShowRenameDialog(true)
        return
      }

      // Arrow key navigation
      const currentIndex = selectedPath
        ? flattenedNodes.findIndex(n => n.node.path === selectedPath)
        : -1

      // Arrow Down: Move selection down
      if (e.key === "ArrowDown") {
        e.preventDefault()
        const nextIndex = currentIndex < flattenedNodes.length - 1 ? currentIndex + 1 : currentIndex
        if (nextIndex !== currentIndex || currentIndex === -1) {
          const targetIndex = currentIndex === -1 ? 0 : nextIndex
          if (targetIndex < flattenedNodes.length) {
            const newPath = flattenedNodes[targetIndex].node.path
            setSelectedPath(newPath)
            setSelectedPaths(new Set([newPath]))
            lastSelectedRef.current = newPath
            // Scroll into view
            virtualizer.scrollToIndex(targetIndex, { align: "auto" })
          }
        }
        return
      }

      // Arrow Up: Move selection up
      if (e.key === "ArrowUp") {
        e.preventDefault()
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : 0
        if (prevIndex !== currentIndex || currentIndex === -1) {
          const targetIndex = currentIndex === -1 ? flattenedNodes.length - 1 : prevIndex
          if (targetIndex >= 0 && targetIndex < flattenedNodes.length) {
            const newPath = flattenedNodes[targetIndex].node.path
            setSelectedPath(newPath)
            setSelectedPaths(new Set([newPath]))
            lastSelectedRef.current = newPath
            virtualizer.scrollToIndex(targetIndex, { align: "auto" })
          }
        }
        return
      }

      // Arrow Right: Expand folder or move to first child
      if (e.key === "ArrowRight" && selectedPath && currentIndex !== -1) {
        e.preventDefault()
        const currentNode = flattenedNodes[currentIndex].node
        if (currentNode.type === "folder") {
          if (!expandedFolders.has(currentNode.path)) {
            // Expand the folder
            const next = new Set(expandedFolders)
            next.add(currentNode.path)
            setExpandedFolders(next)
          } else if (currentNode.children.length > 0) {
            // Already expanded, move to first child
            const newPath = currentNode.children[0].path
            setSelectedPath(newPath)
            setSelectedPaths(new Set([newPath]))
            lastSelectedRef.current = newPath
            // Find new index after expansion
            const newIndex = flattenedNodes.findIndex(n => n.node.path === newPath)
            if (newIndex !== -1) {
              virtualizer.scrollToIndex(newIndex, { align: "auto" })
            }
          }
        }
        return
      }

      // Arrow Left: Collapse folder or move to parent
      if (e.key === "ArrowLeft" && selectedPath && currentIndex !== -1) {
        e.preventDefault()
        const currentNode = flattenedNodes[currentIndex].node
        if (currentNode.type === "folder" && expandedFolders.has(currentNode.path)) {
          // Collapse the folder
          const next = new Set(expandedFolders)
          next.delete(currentNode.path)
          setExpandedFolders(next)
        } else {
          // Move to parent folder
          const parentPath = currentNode.path.includes("/")
            ? currentNode.path.substring(0, currentNode.path.lastIndexOf("/"))
            : null
          if (parentPath) {
            const parentIndex = flattenedNodes.findIndex(n => n.node.path === parentPath)
            if (parentIndex !== -1) {
              setSelectedPath(parentPath)
              setSelectedPaths(new Set([parentPath]))
              lastSelectedRef.current = parentPath
              virtualizer.scrollToIndex(parentIndex, { align: "auto" })
            }
          }
        }
        return
      }

      // Home: Select first item
      if (e.key === "Home" && flattenedNodes.length > 0) {
        e.preventDefault()
        const newPath = flattenedNodes[0].node.path
        setSelectedPath(newPath)
        setSelectedPaths(new Set([newPath]))
        lastSelectedRef.current = newPath
        virtualizer.scrollToIndex(0, { align: "start" })
        return
      }

      // End: Select last item
      if (e.key === "End" && flattenedNodes.length > 0) {
        e.preventDefault()
        const lastIndex = flattenedNodes.length - 1
        const newPath = flattenedNodes[lastIndex].node.path
        setSelectedPath(newPath)
        setSelectedPaths(new Set([newPath]))
        lastSelectedRef.current = newPath
        virtualizer.scrollToIndex(lastIndex, { align: "end" })
        return
      }

      // Space: Toggle folder expand
      if (e.key === " " && selectedPath && currentIndex !== -1) {
        e.preventDefault()
        const currentNode = flattenedNodes[currentIndex].node
        if (currentNode.type === "folder") {
          const next = new Set(expandedFolders)
          if (next.has(currentNode.path)) {
            next.delete(currentNode.path)
          } else {
            next.add(currentNode.path)
          }
          setExpandedFolders(next)
        }
        return
      }
    },
    [
      projectPath,
      selectedPaths,
      selectedPath,
      flattenedNodes,
      fileClipboard,
      setFileClipboard,
      copyFilesMutation,
      dropTarget.type,
      virtualizer,
      expandedFolders,
      setExpandedFolders,
      setSelectedPath,
      setSelectedPaths,
    ]
  )

  // Handle actual delete after confirmation
  const handleConfirmDelete = useCallback(() => {
    if (pendingDeletePaths.length > 0) {
      deleteFilesMutation.mutate({ paths: pendingDeletePaths })
    }
  }, [pendingDeletePaths, deleteFilesMutation])

  // Handle rename
  const handleRename = useCallback(() => {
    if (!renameTarget || !newName.trim()) return
    const parentDir = renameTarget.substring(0, renameTarget.lastIndexOf("/"))
    const newPath = `${parentDir}/${newName}`
    renameFileMutation.mutate({ oldPath: renameTarget, newPath })
  }, [renameTarget, newName, renameFileMutation])

  // Handle create new file
  const handleCreateFile = useCallback(() => {
    if (!newItemTargetDir || !newItemName.trim()) return
    const filePath = `${newItemTargetDir}/${newItemName}`
    createFileMutation.mutate({ filePath })
  }, [newItemTargetDir, newItemName, createFileMutation])

  // Handle create new folder
  const handleCreateFolder = useCallback(() => {
    if (!newItemTargetDir || !newItemName.trim()) return
    const folderPath = `${newItemTargetDir}/${newItemName}`
    createFolderMutation.mutate({ folderPath })
  }, [newItemTargetDir, newItemName, createFolderMutation])

  // Get target directory for operations (folder itself, or parent of file)
  const getTargetDir = useCallback(
    (nodePath: string, nodeType: "file" | "folder"): string => {
      if (!projectPath) return ""
      if (nodeType === "folder") {
        return `${projectPath}/${nodePath}`
      }
      // For files, use parent directory
      const parentPath = nodePath.includes("/")
        ? nodePath.substring(0, nodePath.lastIndexOf("/"))
        : ""
      return parentPath ? `${projectPath}/${parentPath}` : projectPath
    },
    [projectPath],
  )

  // Context menu handlers - these create callbacks for specific nodes
  const createContextMenuHandlers = useCallback(
    (nodePath: string, nodeType: "file" | "folder") => {
      if (!projectPath) return {}

      const absolutePath = `${projectPath}/${nodePath}`
      const targetDir = getTargetDir(nodePath, nodeType)

      return {
        onCut: () => {
          setFileClipboard({
            paths: [absolutePath],
            operation: "cut",
            projectPath,
          })
          toast.success("Cut to clipboard")
        },
        onCopy: () => {
          setFileClipboard({
            paths: [absolutePath],
            operation: "copy",
            projectPath,
          })
          toast.success("Copied to clipboard")
        },
        onPaste: () => {
          if (!fileClipboard) return
          if (fileClipboard.operation === "cut") {
            for (const sourcePath of fileClipboard.paths) {
              moveFileMutation.mutate({ sourcePath, targetDir })
            }
            setFileClipboard(null)
          } else {
            copyFilesMutation.mutate({
              sourcePaths: fileClipboard.paths,
              targetDir,
            })
          }
        },
        onDuplicate: () => {
          const parentDir = absolutePath.substring(0, absolutePath.lastIndexOf("/")) || projectPath
          copyFilesMutation.mutate({
            sourcePaths: [absolutePath],
            targetDir: parentDir,
          })
        },
        onNewFile: () => {
          setNewItemTargetDir(targetDir)
          setNewItemName("")
          setShowNewFileDialog(true)
        },
        onNewFolder: () => {
          setNewItemTargetDir(targetDir)
          setNewItemName("")
          setShowNewFolderDialog(true)
        },
      }
    },
    [projectPath, fileClipboard, setFileClipboard, moveFileMutation, copyFilesMutation, getTargetDir],
  )

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full min-w-0 overflow-hidden focus:outline-none"
      tabIndex={0} // Make focusable for keyboard events
      onKeyDown={handleKeyDown}
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
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden relative"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Folder highlighting is handled at the row level via isDropTarget prop */}

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
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const { node, level } = flattenedNodes[virtualItem.index]
              const contextMenuHandlers = createContextMenuHandlers(node.path, node.type)
              return (
                <div
                  key={node.path}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualItem.size}px`,
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <FileTreeNodeRow
                    node={node}
                    level={level}
                    isExpanded={node.type === "folder" && expandedFolders.has(node.path)}
                    onToggleFolder={handleToggleFolder}
                    onSelectDataFile={onSelectDataFile}
                    onSelectSourceFile={onSelectSourceFile}
                    onSelectFile={onSelectFile}
                    gitStatus={stableGitStatus as GitStatusMap}
                    foldersWithChanges={foldersWithChanges}
                    projectPath={projectPath}
                    onDropFiles={handleDropOnFolder}
                    dropTargetPath={dropTarget.type === "folder" ? dropTarget.path : null}
                    onDragEnterFolder={handleDragEnterFolder}
                    onDragLeaveFolder={handleDragLeaveFolder}
                    searchQuery={searchQuery}
                    isSelected={selectedPath === node.path}
                    isInMultiSelect={selectedPaths.has(node.path)}
                    isCut={fileClipboard?.operation === "cut" && fileClipboard.paths.includes(`${projectPath}/${node.path}`)}
                    onSelect={handleSelect}
                    hasClipboard={!!fileClipboard}
                    selectedPaths={selectedPaths}
                    {...contextMenuHandlers}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer with stats */}
      {!isLoading && tree.length > 0 && (
        <div className="px-3 py-1.5 border-t border-border/50 text-[10px] text-muted-foreground flex-shrink-0">
          {fileCount} file{fileCount !== 1 ? "s" : ""}, {folderCount} folder
          {folderCount !== 1 ? "s" : ""}
        </div>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {pendingDeletePaths.length} item{pendingDeletePaths.length !== 1 ? "s" : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The selected items will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingDeletePaths([])}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rename dialog */}
      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename</DialogTitle>
            <DialogDescription>
              Enter a new name
            </DialogDescription>
          </DialogHeader>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New name"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                handleRename()
              }
            }}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowRenameDialog(false)
                setRenameTarget(null)
                setNewName("")
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={!newName.trim()}>
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New file dialog */}
      <Dialog open={showNewFileDialog} onOpenChange={setShowNewFileDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New File</DialogTitle>
            <DialogDescription>
              Enter a name for the new file
            </DialogDescription>
          </DialogHeader>
          <Input
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            placeholder="filename.txt"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                handleCreateFile()
              }
            }}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowNewFileDialog(false)
                setNewItemName("")
                setNewItemTargetDir(null)
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateFile} disabled={!newItemName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New folder dialog */}
      <Dialog open={showNewFolderDialog} onOpenChange={setShowNewFolderDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Folder</DialogTitle>
            <DialogDescription>
              Enter a name for the new folder
            </DialogDescription>
          </DialogHeader>
          <Input
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            placeholder="folder-name"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                handleCreateFolder()
              }
            }}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowNewFolderDialog(false)
                setNewItemName("")
                setNewItemTargetDir(null)
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateFolder} disabled={!newItemName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

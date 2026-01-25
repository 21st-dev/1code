import { useState, useMemo, useCallback, useEffect, useRef } from "react"
import { useAtom, useSetAtom } from "jotai"
import { useQueryClient } from "@tanstack/react-query"
import { trpc } from "../../lib/trpc"
import { useGitWatcher } from "../../lib/hooks/use-file-change-listener"
import { getFileIconByExtension } from "../agents/mentions/agents-file-mention"
import {
  ChevronRight,
  ChevronDown,
  Search,
  FolderOpen,
  FolderTree,
  Folder,
  X,
  PanelLeftClose,
  RefreshCw,
  Loader2,
  AtSign,
  FileSearch,
  ArrowLeft,
  FileText,
  Filter,
  MoreHorizontal,
  ChevronsUpDown,
  ChevronsDownUp,
} from "lucide-react"
import { Input } from "../../components/ui/input"
import { Button } from "../../components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu"
import { cn } from "../../lib/utils"
import { toast } from "sonner"
import {
  fileTreeExpandedPathsAtom,
  fileTreeSearchQueryAtom,
  fileTreeSavedExpandedPathsAtom,
  pendingFileReferenceAtom,
  contentSearchActiveAtom,
  contentSearchQueryAtom,
  contentSearchPatternAtom,
  contentSearchCaseSensitiveAtom,
  contentSearchLoadingAtom,
  contentSearchResultsAtom,
  contentSearchToolAtom,
  filePreviewPathAtom,
  filePreviewLineAtom,
  filePreviewHighlightAtom,
  type ContentSearchResult,
} from "./atoms"

// ============================================================================
// Types
// ============================================================================

interface DirectoryEntry {
  name: string
  path: string
  type: "file" | "folder"
}

interface FileTreePanelProps {
  projectPath?: string
  onClose?: () => void
  onFileSelect?: (path: string, line?: number) => void
  showHeader?: boolean
}

// ============================================================================
// Lazy Loading Directory Node
// ============================================================================

interface LazyDirectoryNodeProps {
  entry: DirectoryEntry
  projectPath: string
  depth: number
  expandedPaths: Set<string>
  matchingPaths: Set<string> // Paths that match the search query
  onToggle: (path: string) => void
  onSelect: (path: string, type: "file" | "folder") => void
  onReference: (path: string, name: string, type: "file" | "folder") => void
  searchQuery: string
}

function LazyDirectoryNode({
  entry,
  projectPath,
  depth,
  expandedPaths,
  matchingPaths,
  onToggle,
  onSelect,
  onReference,
  searchQuery,
}: LazyDirectoryNodeProps) {
  const isExpanded = expandedPaths.has(entry.path)
  const isFolder = entry.type === "folder"
  const [isHovered, setIsHovered] = useState(false)

  // Check if this item or its descendants match the search
  const isMatching = matchingPaths.has(entry.path)
  const hasMatchingDescendant = useMemo(() => {
    if (!searchQuery) return false
    for (const path of matchingPaths) {
      if (path.startsWith(entry.path + "/")) return true
    }
    return false
  }, [matchingPaths, entry.path, searchQuery])

  // Lazy load children when folder is expanded
  // IMPORTANT: This hook must be called before any conditional returns
  const { data: children, isLoading } = trpc.files.listDirectory.useQuery(
    { projectPath, relativePath: entry.path },
    {
      enabled: isFolder && isExpanded,
      staleTime: 30000, // 30 seconds
    }
  )

  // Filter children - hide non-matching items when searching
  const filteredChildren = useMemo(() => {
    if (!children) return []
    return children
  }, [children])

  const handleClick = useCallback(() => {
    if (isFolder) {
      onToggle(entry.path)
    } else {
      onSelect(entry.path, entry.type)
    }
  }, [isFolder, entry.path, entry.type, onToggle, onSelect])

  const handleReference = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onReference(entry.path, entry.name, entry.type)
  }, [entry.path, entry.name, entry.type, onReference])

  // Hide non-matching files when searching (but keep folders that have matching descendants)
  // IMPORTANT: Conditional returns must come AFTER all hooks
  if (searchQuery && !isMatching && !hasMatchingDescendant && !isFolder) {
    return null
  }
  if (searchQuery && isFolder && !isMatching && !hasMatchingDescendant) {
    return null
  }

  const FileIcon = isFolder
    ? (isExpanded ? FolderOpen : Folder)
    : (getFileIconByExtension(entry.name) ?? FileText)

  // Highlight matching text
  const highlightMatch = (text: string) => {
    if (!searchQuery) return text
    const idx = text.toLowerCase().indexOf(searchQuery.toLowerCase())
    if (idx === -1) return text
    return (
      <>
        {text.slice(0, idx)}
        <span className="bg-yellow-500/30 text-foreground font-medium">{text.slice(idx, idx + searchQuery.length)}</span>
        {text.slice(idx + searchQuery.length)}
      </>
    )
  }

  return (
    <>
      <div
        className={cn(
          "flex items-center gap-1 py-1 px-1.5 rounded text-xs cursor-pointer group",
          "hover:bg-accent hover:text-accent-foreground",
          isMatching && searchQuery && "bg-yellow-500/10"
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Expand/collapse chevron for folders */}
        {isFolder ? (
          <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
            {isLoading ? (
              <Loader2 className="h-3 w-3 text-muted-foreground animate-spin" />
            ) : isExpanded ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            )}
          </span>
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}

        {/* File/folder icon */}
        <FileIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />

        {/* Name with highlight */}
        <span className="truncate flex-1">{highlightMatch(entry.name)}</span>

        {/* Reference button - only show on hover for files */}
        {!isFolder && isHovered && (
          <button
            onClick={handleReference}
            className="flex-shrink-0 p-0.5 rounded hover:bg-primary/20 transition-colors"
            title="Insert reference to chat"
          >
            <AtSign className="h-3 w-3 text-muted-foreground hover:text-primary" />
          </button>
        )}
      </div>

      {/* Children (lazy loaded when expanded) */}
      {isFolder && isExpanded && filteredChildren && filteredChildren.length > 0 && (
        <div>
          {filteredChildren.map((child) => (
            <LazyDirectoryNode
              key={child.path}
              entry={child}
              projectPath={projectPath}
              depth={depth + 1}
              expandedPaths={expandedPaths}
              matchingPaths={matchingPaths}
              onToggle={onToggle}
              onSelect={onSelect}
              onReference={onReference}
              searchQuery={searchQuery}
            />
          ))}
        </div>
      )}

      {/* Empty folder indicator */}
      {isFolder && isExpanded && !isLoading && filteredChildren && filteredChildren.length === 0 && (
        <div
          className="text-xs text-muted-foreground/60 italic py-1"
          style={{ paddingLeft: `${(depth + 1) * 12 + 8 + 16}px` }}
        >
          Empty folder
        </div>
      )}
    </>
  )
}

// ============================================================================
// Content Search Result Item
// ============================================================================

interface ContentSearchResultItemProps {
  result: ContentSearchResult
  projectPath: string
  query: string
  onSelect: (path: string, line: number) => void
}

function ContentSearchResultItem({ result, projectPath, query, onSelect }: ContentSearchResultItemProps) {
  const FileIcon = getFileIconByExtension(result.file) ?? FileText

  // Highlight matching text in the line
  const highlightText = (text: string) => {
    if (!query) return text
    const idx = text.toLowerCase().indexOf(query.toLowerCase())
    if (idx === -1) return text
    return (
      <>
        {text.slice(0, idx)}
        <span className="bg-yellow-500/50 text-foreground font-medium">{text.slice(idx, idx + query.length)}</span>
        {text.slice(idx + query.length)}
      </>
    )
  }

  return (
    <div
      className="px-2 py-1.5 hover:bg-accent cursor-pointer rounded-sm"
      onClick={() => onSelect(result.file, result.line)}
    >
      <div className="flex items-center gap-1.5 text-xs">
        <FileIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        <span className="text-muted-foreground truncate">{result.file}</span>
        <span className="text-muted-foreground/60">:</span>
        <span className="text-primary font-mono">{result.line}</span>
      </div>
      <div className="mt-1 text-xs font-mono text-muted-foreground truncate pl-5">
        {highlightText(result.text)}
      </div>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function FileTreePanel({
  projectPath,
  onClose,
  onFileSelect,
  showHeader = true,
}: FileTreePanelProps) {
  const [expandedPaths, setExpandedPaths] = useAtom(fileTreeExpandedPathsAtom)
  const [searchQuery, setSearchQuery] = useAtom(fileTreeSearchQueryAtom)
  const [savedExpandedPaths, setSavedExpandedPaths] = useAtom(fileTreeSavedExpandedPathsAtom)
  const setPendingFileReference = useSetAtom(pendingFileReferenceAtom)

  // Preview atoms for search result navigation
  const setPreviewPath = useSetAtom(filePreviewPathAtom)
  const setPreviewLine = useSetAtom(filePreviewLineAtom)
  const setPreviewHighlight = useSetAtom(filePreviewHighlightAtom)

  // Content search state
  const [contentSearchActive, setContentSearchActive] = useAtom(contentSearchActiveAtom)
  const [contentQuery, setContentQuery] = useAtom(contentSearchQueryAtom)
  const [contentPattern, setContentPattern] = useAtom(contentSearchPatternAtom)
  const [caseSensitive, setCaseSensitive] = useAtom(contentSearchCaseSensitiveAtom)
  const [contentLoading, setContentLoading] = useAtom(contentSearchLoadingAtom)
  const [contentResults, setContentResults] = useAtom(contentSearchResultsAtom)
  const [contentTool, setContentTool] = useAtom(contentSearchToolAtom)

  // Query client for cache invalidation
  const queryClient = useQueryClient()

  // Subscribe to file system changes to auto-refresh
  useGitWatcher(projectPath)

  const searchInputRef = useRef<HTMLInputElement>(null)
  const contentSearchInputRef = useRef<HTMLInputElement>(null)

  // Track if we're currently in search mode (to know when to save/restore state)
  const prevSearchQueryRef = useRef<string>("")

  // Fetch root directory contents
  const { data: rootEntries, isLoading, refetch, isFetching } = trpc.files.listDirectory.useQuery(
    { projectPath: projectPath ?? "", relativePath: "" },
    {
      enabled: !!projectPath,
      staleTime: 30000, // 30 seconds
    }
  )

  // Search files to get matching paths and parent paths to expand
  const { data: searchData } = trpc.files.searchFiles.useQuery(
    { projectPath: projectPath ?? "", query: searchQuery, limit: 100 },
    {
      enabled: !!projectPath && !!searchQuery && searchQuery.length >= 1,
      staleTime: 10000,
    }
  )

  // Save expanded state when starting to search, restore when clearing
  useEffect(() => {
    const wasSearching = prevSearchQueryRef.current.length > 0
    const isSearching = searchQuery.length > 0

    if (!wasSearching && isSearching) {
      // Starting to search - save current expanded state
      setSavedExpandedPaths(new Set(expandedPaths))
    } else if (wasSearching && !isSearching && savedExpandedPaths) {
      // Cleared search - restore saved state
      setExpandedPaths(savedExpandedPaths)
      setSavedExpandedPaths(null)
    }

    prevSearchQueryRef.current = searchQuery
  }, [searchQuery, expandedPaths, savedExpandedPaths, setSavedExpandedPaths, setExpandedPaths])

  // Auto-expand parent directories when search results come in
  useEffect(() => {
    if (searchData?.parentPaths && searchData.parentPaths.length > 0 && searchQuery) {
      setExpandedPaths((prev) => {
        const next = new Set(prev)
        for (const path of searchData.parentPaths) {
          next.add(path)
        }
        return next
      })
    }
  }, [searchData?.parentPaths, searchQuery, setExpandedPaths])

  // Create a set of matching paths for quick lookup
  const matchingPaths = useMemo(() => {
    if (!searchData?.results) return new Set<string>()
    return new Set(searchData.results.map((r) => r.path))
  }, [searchData?.results])

  // Content search mutation
  const contentSearchMutation = trpc.files.searchContent.useMutation({
    onMutate: () => {
      console.log("[FileTree] Starting content search...")
      setContentLoading(true)
    },
    onSuccess: (data) => {
      console.log("[FileTree] Content search success:", data.tool, data.results.length, "results")
      setContentResults(data.results)
      setContentTool(data.tool)
      setContentLoading(false)

      // Show toast notification for fallback tools or errors
      if (data.tool === "findstr") {
        toast.info("Using Windows findstr for content search", {
          description: "For better results, install ripgrep: scoop install ripgrep",
          duration: 5000,
        })
      } else if (data.tool === "grep") {
        toast.info("Using grep for content search", {
          description: "For better results, install ripgrep: brew install ripgrep",
          duration: 5000,
        })
      } else if (data.tool === "findstr-failed" || data.tool === "findstr-error") {
        toast.warning("Content search failed", {
          description: "Install ripgrep for better search: scoop install ripgrep",
          duration: 5000,
        })
      } else if (data.tool === "grep-failed" || data.tool === "grep-error") {
        toast.warning("Content search failed", {
          description: "Install ripgrep for better search: brew install ripgrep",
          duration: 5000,
        })
      }
    },
    onError: (error) => {
      console.error("[FileTree] Content search error:", error)
      setContentResults([])
      setContentLoading(false)
      toast.error("Content search failed", {
        description: error.message,
      })
    },
  })

  // Execute content search
  const handleContentSearch = useCallback(() => {
    if (!projectPath || !contentQuery) return
    contentSearchMutation.mutate({
      projectPath,
      query: contentQuery,
      filePattern: contentPattern || undefined,
      caseSensitive,
      limit: 50,
    })
  }, [projectPath, contentQuery, contentPattern, caseSensitive, contentSearchMutation])

  // Handle enter key for content search
  const handleContentSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleContentSearch()
    }
  }, [handleContentSearch])

  // Refresh file list - invalidate cache first to ensure fresh data
  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [["files", "listDirectory"]] })
    refetch()
  }, [queryClient, refetch])

  // Toggle folder expansion
  const handleToggle = useCallback(
    (path: string) => {
      setExpandedPaths((prev: Set<string>) => {
        const next = new Set(prev)
        if (next.has(path)) {
          next.delete(path)
        } else {
          next.add(path)
        }
        return next
      })
    },
    [setExpandedPaths]
  )

  // Select file/folder
  const handleSelect = useCallback(
    (path: string, type: "file" | "folder", line?: number) => {
      if (type === "file" && onFileSelect) {
        onFileSelect(path, line)
      }
    },
    [onFileSelect]
  )

  // Clear search
  const handleClearSearch = useCallback(() => {
    setSearchQuery("")
  }, [setSearchQuery])

  // Reference file in chat input
  const handleReference = useCallback(
    (path: string, name: string, type: "file" | "folder") => {
      setPendingFileReference({ path, name, type })
    },
    [setPendingFileReference]
  )

  // Switch to content search mode
  const handleOpenContentSearch = useCallback(() => {
    setContentSearchActive(true)
    setContentResults([])
    setTimeout(() => contentSearchInputRef.current?.focus(), 100)
  }, [setContentSearchActive, setContentResults])

  // Switch back to file tree mode
  const handleCloseContentSearch = useCallback(() => {
    setContentSearchActive(false)
    setContentQuery("")
    setContentResults([])
  }, [setContentSearchActive, setContentQuery, setContentResults])

  // Handle content search result click - open preview with line and highlight
  const handleContentResultSelect = useCallback(
    (filePath: string, line: number) => {
      // Set preview atoms for line jump and highlight
      if (projectPath) {
        // Normalize project path (remove trailing slashes)
        const normalizedProjectPath = projectPath.replace(/[\\/]+$/, "")
        // Construct full path with forward slash (filePath already normalized by backend)
        const fullPath = `${normalizedProjectPath}/${filePath}`
        setPreviewPath(fullPath)
        setPreviewLine(line)
        setPreviewHighlight(contentQuery)
      }
      // Also call onFileSelect if provided
      if (onFileSelect) {
        onFileSelect(filePath, line)
      }
    },
    [projectPath, contentQuery, setPreviewPath, setPreviewLine, setPreviewHighlight, onFileSelect]
  )

  // Expand all folders - uses searchFiles API to get all folder paths
  const { data: allFilesData } = trpc.files.searchFiles.useQuery(
    { projectPath: projectPath ?? "", query: "", limit: 500 },
    {
      enabled: !!projectPath,
      staleTime: 30000,
    }
  )

  const handleExpandAll = useCallback(() => {
    const allFolders = new Set<string>()
    // Get all folder paths from root entries
    rootEntries?.forEach((entry) => {
      if (entry.type === "folder") {
        allFolders.add(entry.path)
      }
    })
    // Add all parent paths (which includes all nested folders)
    if (allFilesData?.parentPaths) {
      allFilesData.parentPaths.forEach((path) => allFolders.add(path))
    }
    // Also add folders from search results if searching
    if (searchData?.parentPaths) {
      searchData.parentPaths.forEach((path) => allFolders.add(path))
    }
    setExpandedPaths(allFolders)
  }, [allFilesData?.parentPaths, searchData?.parentPaths, rootEntries, setExpandedPaths])

  // Collapse all folders
  const handleCollapseAll = useCallback(() => {
    setExpandedPaths(new Set<string>())
  }, [setExpandedPaths])

  // Render content search view
  if (contentSearchActive) {
    return (
      <div className="flex flex-col h-full">
        {/* Content Search Header - always show back button (even when showHeader=false) */}
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleCloseContentSearch}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </Button>
            <FileSearch className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium">Content Search</span>
          </div>
          {/* Close button only shown when showHeader is true and onClose is provided */}
          {showHeader && onClose && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onClose}
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Search Input */}
        <div className="p-2 border-b space-y-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              ref={contentSearchInputRef}
              placeholder="Search in files..."
              value={contentQuery}
              onChange={(e) => setContentQuery(e.target.value)}
              onKeyDown={handleContentSearchKeyDown}
              className="pl-8 pr-20 h-8 text-xs"
            />
            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className={cn("h-6 w-6", caseSensitive && "bg-primary/20")}
                onClick={() => setCaseSensitive(!caseSensitive)}
                title="Case sensitive"
              >
                <span className="text-[10px] font-bold">Aa</span>
              </Button>
              <Button
                variant="default"
                size="icon"
                className="h-6 w-6"
                onClick={handleContentSearch}
                disabled={!contentQuery || contentLoading}
              >
                {contentLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Search className="h-3 w-3" />
                )}
              </Button>
            </div>
          </div>

          {/* File pattern filter */}
          <div className="relative">
            <Filter className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="File pattern (e.g., *.ts, *.{js,tsx})"
              value={contentPattern}
              onChange={(e) => setContentPattern(e.target.value)}
              onKeyDown={handleContentSearchKeyDown}
              className="pl-8 h-7 text-xs"
            />
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-auto">
          {contentLoading ? (
            <div className="flex items-center justify-center gap-2 p-4 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching...
            </div>
          ) : contentResults.length === 0 ? (
            <div className="p-4 text-xs text-muted-foreground text-center">
              {contentQuery ? "No matches found" : "Enter a search term"}
            </div>
          ) : (
            <div className="p-1">
              <div className="px-2 py-1 text-xs text-muted-foreground flex items-center justify-between">
                <span>{contentResults.length} results</span>
                {contentTool && (
                  <span className="text-[10px] text-muted-foreground/60">
                    via {contentTool}
                  </span>
                )}
              </div>
              {contentResults.map((result, idx) => (
                <ContentSearchResultItem
                  key={`${result.file}:${result.line}:${idx}`}
                  result={result}
                  projectPath={projectPath ?? ""}
                  query={contentQuery}
                  onSelect={handleContentResultSelect}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Render file tree view
  return (
    <div className="flex flex-col h-full">
      {/* Header (optional) - just title and close button, toolbar is in search row */}
      {showHeader && (
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <div className="flex items-center gap-2">
            <FolderTree className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium">Explorer</span>
          </div>
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onClose}
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}

      {/* Search + Toolbar */}
      <div className="p-2 border-b">
        <div className="flex items-center gap-1">
          {/* Search input */}
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              placeholder="Filter files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-8 h-7 text-xs"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5"
                onClick={handleClearSearch}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
          {/* Toolbar buttons - always visible */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 flex-shrink-0"
            onClick={handleOpenContentSearch}
            title="Search file contents"
          >
            <FileSearch className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 flex-shrink-0"
            onClick={handleRefresh}
            disabled={isFetching}
            title="Refresh"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 flex-shrink-0"
                title="More options"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={handleExpandAll}>
                <ChevronsUpDown className="h-3.5 w-3.5 mr-2" />
                <span className="text-xs">Expand All</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleCollapseAll}>
                <ChevronsDownUp className="h-3.5 w-3.5 mr-2" />
                <span className="text-xs">Collapse All</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {/* Show match count when searching */}
        {searchQuery && searchData?.results && (
          <div className="mt-1.5 px-1 text-[10px] text-muted-foreground">
            {searchData.results.length} matches
          </div>
        )}
      </div>

      {/* File Tree */}
      <div className="flex-1 overflow-auto p-1">
        {!projectPath ? (
          <div className="text-xs text-muted-foreground p-2 text-center">
            Select a project first
          </div>
        ) : isLoading ? (
          <div className="text-xs text-muted-foreground p-2 text-center flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        ) : !rootEntries || rootEntries.length === 0 ? (
          <div className="text-xs text-muted-foreground p-2 text-center">
            {searchQuery ? "No matching files" : "No files"}
          </div>
        ) : (
          rootEntries.map((entry) => (
            <LazyDirectoryNode
              key={entry.path}
              entry={entry}
              projectPath={projectPath}
              depth={0}
              expandedPaths={expandedPaths}
              matchingPaths={matchingPaths}
              onToggle={handleToggle}
              onSelect={handleSelect}
              onReference={handleReference}
              searchQuery={searchQuery}
            />
          ))
        )}
      </div>
    </div>
  )
}

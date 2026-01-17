"use client"

import { useAtom } from "jotai"
import { ChevronDown, RefreshCw, X } from "lucide-react"
import { useCallback, useMemo } from "react"
import { Button } from "../../../../components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../../../components/ui/tooltip"
import { trpc } from "../../../../lib/trpc"
import { expandedFoldersAtomFamily } from "../../atoms"
import { buildFileTree, countFiles, countFolders } from "./build-file-tree"
import { FileTreeNode } from "./FileTreeNode"

interface FileTreeSidebarProps {
  projectPath: string | undefined
  projectId: string
  onClose: () => void
  onSelectFile?: (path: string) => void
}

export function FileTreeSidebar({
  projectPath,
  projectId,
  onClose,
  onSelectFile,
}: FileTreeSidebarProps) {
  const [expandedFolders, setExpandedFolders] = useAtom(
    expandedFoldersAtomFamily(projectId),
  )

  // Fetch all files from project
  const {
    data: entries = [],
    isLoading,
    refetch,
    isRefetching,
  } = trpc.files.listAll.useQuery(
    { projectPath: projectPath || "" },
    {
      enabled: !!projectPath,
      staleTime: 1000, // Short TTL since we have real-time watching
    },
  )

  // Subscribe to file changes for real-time sync
  trpc.files.watchChanges.useSubscription(
    { projectPath: projectPath || "" },
    {
      enabled: !!projectPath,
      onData: () => {
        // Refetch when files change
        refetch()
      },
    },
  )

  // Build tree from flat entries
  const tree = useMemo(() => buildFileTree(entries), [entries])

  // Stats for footer
  const fileCount = useMemo(() => countFiles(tree), [tree])
  const folderCount = useMemo(() => countFolders(tree), [tree])

  // Toggle folder expansion
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

  // Collapse all folders
  const handleCollapseAll = useCallback(() => {
    setExpandedFolders(new Set<string>())
  }, [setExpandedFolders])

  // Refresh file list
  const handleRefresh = useCallback(() => {
    refetch()
  }, [refetch])

  return (
    <div className="flex flex-col h-full min-w-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-2 h-10 bg-background flex-shrink-0 border-b border-border/50">
        <span className="text-xs font-medium text-foreground truncate">
          Files
        </span>
        <div className="flex items-center gap-0.5">
          {/* Refresh button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRefresh}
                disabled={isRefetching}
                className="h-6 w-6 rounded-sm"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh</TooltipContent>
          </Tooltip>

          {/* Collapse all button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCollapseAll}
                disabled={expandedFolders.size === 0}
                className="h-6 w-6 rounded-sm"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Collapse all</TooltipContent>
          </Tooltip>

          {/* Close button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-6 w-6 rounded-sm"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Close</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-1">
        {!projectPath ? (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center">
            No project selected
          </div>
        ) : isLoading ? (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center">
            Loading files...
          </div>
        ) : tree.length === 0 ? (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center">
            No files found
          </div>
        ) : (
          tree.map((node) => (
            <FileTreeNode
              key={node.path}
              node={node}
              level={0}
              expandedFolders={expandedFolders}
              onToggleFolder={handleToggleFolder}
              onSelectFile={onSelectFile}
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

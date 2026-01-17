"use client"

import { ChevronRight, File, Folder, FolderOpen } from "lucide-react"
import { memo, useCallback } from "react"
import { cn } from "../../../../lib/utils"
import type { TreeNode } from "./build-file-tree"

interface FileTreeNodeProps {
  node: TreeNode
  level: number
  expandedFolders: Set<string>
  onToggleFolder: (path: string) => void
  onSelectFile?: (path: string) => void
}

export const FileTreeNode = memo(function FileTreeNode({
  node,
  level,
  expandedFolders,
  onToggleFolder,
  onSelectFile,
}: FileTreeNodeProps) {
  const isExpanded = node.type === "folder" && expandedFolders.has(node.path)
  const hasChildren = node.type === "folder" && node.children.length > 0

  const handleClick = useCallback(() => {
    if (node.type === "folder") {
      onToggleFolder(node.path)
    } else {
      onSelectFile?.(node.path)
    }
  }, [node.type, node.path, onToggleFolder, onSelectFile])

  const paddingLeft = level * 12 + 6

  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          "w-full flex items-center gap-1.5 py-0.5 text-left rounded-sm",
          "hover:bg-accent/50 cursor-pointer transition-colors text-xs",
          "focus:outline-none focus-visible:ring-1 focus-visible:ring-ring",
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
            <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <Folder className="size-3.5 shrink-0 text-muted-foreground" />
          )
        ) : (
          <File className="size-3.5 shrink-0 text-muted-foreground" />
        )}

        {/* Name */}
        <span className="truncate text-foreground">{node.name}</span>
      </button>

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
              onSelectFile={onSelectFile}
            />
          ))}
        </div>
      )}
    </div>
  )
})

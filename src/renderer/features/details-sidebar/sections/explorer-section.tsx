"use client"

import { memo } from "react"
import { Folder } from "lucide-react"
import { FileTreePanel } from "@/features/cowork/file-tree-panel"
import { FilePreviewDialog } from "@/features/cowork/file-preview"

// ============================================================================
// Types
// ============================================================================

interface ExplorerSectionProps {
  worktreePath?: string | null
  isExpanded?: boolean
  /** Called when a file is selected for preview */
  onFileSelect?: (filePath: string, line?: number) => void
}

// ============================================================================
// Explorer Section Component (Full/Expanded version)
// ============================================================================

/**
 * Explorer Section for Expanded Widget Sidebar
 * Wraps FileTreePanel with full height and includes FilePreviewDialog
 */
export const ExplorerSection = memo(function ExplorerSection({
  worktreePath,
  isExpanded = false,
  onFileSelect,
}: ExplorerSectionProps) {
  if (!worktreePath) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
        <Folder className="h-12 w-12 opacity-40 mb-2" />
        <p className="text-sm">No workspace selected</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* FileTreePanel - full height with header */}
      <FileTreePanel
        projectPath={worktreePath}
        onFileSelect={onFileSelect}
        showHeader={true}
      />

      {/* File preview dialog - triggered by file selection */}
      <FilePreviewDialog projectPath={worktreePath} />
    </div>
  )
})

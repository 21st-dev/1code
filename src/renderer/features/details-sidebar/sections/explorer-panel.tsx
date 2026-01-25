"use client"

import { memo, useState, useCallback, useMemo } from "react"
import { useAtom, useSetAtom } from "jotai"
import { FolderTree } from "lucide-react"
import {
  PanelContainer,
  PanelHeader,
  type PanelDisplayMode,
} from "../../../components/ui/panel-container"
import { FileTreePanel } from "../../cowork/file-tree-panel"
import { FilePreview } from "../../cowork/file-preview/file-preview"
import { FilePreviewDialog } from "../../cowork/file-preview/file-preview-dialog"
import {
  explorerDisplayModeAtom,
  explorerSidebarWidthAtom,
} from "../../agents/atoms"
import { filePreviewPathAtom } from "../../cowork/atoms"

interface ExplorerPanelProps {
  chatId: string
  worktreePath: string
  isOpen: boolean
  onClose: () => void
}

export const ExplorerPanel = memo(function ExplorerPanel({
  chatId,
  worktreePath,
  isOpen,
  onClose,
}: ExplorerPanelProps) {
  const [displayMode, setDisplayMode] = useAtom(explorerDisplayModeAtom)
  const setFilePreviewPath = useSetAtom(filePreviewPathAtom)

  // Selected file for inline preview (only used in dialog/fullscreen modes)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)

  // Sidebar mode: click opens preview dialog
  // Dialog/Fullscreen mode: click shows inline preview
  const isCompact = displayMode === "side-peek"

  // Handle file selection
  const handleFileSelect = useCallback(
    (path: string) => {
      // Construct full path - path from FileTreePanel is relative
      const fullPath = `${worktreePath.replace(/[\\/]+$/, "")}/${path}`

      if (isCompact) {
        // Open FilePreviewDialog
        setFilePreviewPath(fullPath)
      } else {
        // Show inline preview
        setSelectedFile(fullPath)
      }
    },
    [isCompact, worktreePath, setFilePreviewPath]
  )

  // Handle display mode change
  const handleDisplayModeChange = useCallback(
    (mode: PanelDisplayMode) => {
      setDisplayMode(mode as typeof displayMode)
      // Clear selected file when switching to compact mode
      if (mode === "side-peek") {
        setSelectedFile(null)
      }
    },
    [setDisplayMode]
  )

  // Title element
  const titleElement = useMemo(
    () => (
      <div className="flex items-center gap-2">
        <FolderTree className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Explorer</span>
      </div>
    ),
    []
  )

  return (
    <>
      <PanelContainer
        isOpen={isOpen}
        onClose={onClose}
        displayMode={displayMode}
        widthAtom={explorerSidebarWidthAtom}
        minWidth={280}
        maxWidth={500}
        className="bg-background border-l"
        style={{ borderLeftWidth: "0.5px" }}
      >
        <div className="h-full flex flex-col">
          {/* Header with mode switcher */}
          <PanelHeader
            title={titleElement}
            onClose={onClose}
            displayMode={displayMode}
            onDisplayModeChange={handleDisplayModeChange}
          />

          {/* Content */}
          {isCompact ? (
            // Sidebar: file tree only
            <div className="flex-1 overflow-hidden">
              <FileTreePanel
                projectPath={worktreePath}
                onFileSelect={handleFileSelect}
                showHeader={false}
              />
            </div>
          ) : (
            // Dialog/Fullscreen: file tree + inline preview
            <div className="flex-1 flex min-h-0">
              {/* File tree panel - left side */}
              <div className="w-[280px] border-r flex-shrink-0 overflow-hidden">
                <FileTreePanel
                  projectPath={worktreePath}
                  onFileSelect={handleFileSelect}
                  showHeader={false}
                />
              </div>
              {/* Inline file preview - right side */}
              <div className="flex-1 overflow-hidden">
                {selectedFile ? (
                  <FilePreview filePath={selectedFile} />
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                    Select a file to preview
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </PanelContainer>

      {/* File preview dialog (for sidebar mode) */}
      <FilePreviewDialog />
    </>
  )
})

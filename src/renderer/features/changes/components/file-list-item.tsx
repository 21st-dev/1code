"use client"

import { memo } from "react"
import { Eye } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Kbd } from "@/components/ui/kbd"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"
import { getStatusIndicator } from "../utils/status"
import type { FileStatus } from "../../../../shared/changes-types"

export interface FileListItemProps {
  /** File path (relative) */
  filePath: string
  /** File name (last part of path) */
  fileName: string
  /** Directory path (without file name) */
  dirPath: string
  /** File status for indicator color */
  status: FileStatus
  /** Whether file is selected (highlighted) */
  isSelected?: boolean
  /** Whether checkbox is checked */
  isChecked: boolean
  /** Whether file is marked as viewed */
  isViewed: boolean
  /** Whether file is untracked (affects context menu text) */
  isUntracked: boolean
  /** Click handler */
  onSelect: () => void
  /** Double click handler */
  onDoubleClick?: () => void
  /** Checkbox change handler */
  onCheckboxChange: () => void
  /** Copy absolute path */
  onCopyPath?: () => void
  /** Copy relative path */
  onCopyRelativePath?: () => void
  /** Open in Finder/Explorer */
  onRevealInFinder?: () => void
  /** Open in file preview sidebar */
  onOpenInFilePreview?: () => void
  /** Open in preferred editor */
  onOpenInEditor?: () => void
  /** Label for the preferred editor (e.g. "Cursor", "VS Code") */
  editorLabel?: string
  /** Toggle viewed state */
  onToggleViewed?: () => void
  /** Discard changes */
  onDiscard?: () => void
  /** Whether to show context menu (default true) */
  showContextMenu?: boolean
}

/**
 * Shared file list item component used in both changes-view and changes-widget
 * Memoized to prevent re-renders
 */
export const FileListItem = memo(function FileListItem({
  filePath,
  fileName,
  dirPath,
  status,
  isSelected = false,
  isChecked,
  isViewed,
  isUntracked,
  onSelect,
  onDoubleClick,
  onCheckboxChange,
  onCopyPath,
  onCopyRelativePath,
  onRevealInFinder,
  onOpenInFilePreview,
  onOpenInEditor,
  editorLabel,
  onToggleViewed,
  onDiscard,
  showContextMenu = true,
}: FileListItemProps) {
  const { t } = useI18n()
  const content = (
    <div
      data-file-item
      className={cn(
        "flex items-center gap-2 px-2 py-1 cursor-pointer",
        "hover:bg-muted/80 transition-colors",
        isSelected && "bg-muted",
      )}
      onClick={onSelect}
      onDoubleClick={onDoubleClick}
    >
      <Checkbox
        checked={isChecked}
        onCheckedChange={onCheckboxChange}
        onClick={(e) => e.stopPropagation()}
        className="size-4 shrink-0 border-muted-foreground/50"
      />
      <div className="flex-1 min-w-0 flex items-center overflow-hidden">
        {dirPath && (
          <span className="text-xs text-muted-foreground truncate flex-shrink min-w-0">
            {dirPath}/
          </span>
        )}
        <span className="text-xs font-medium flex-shrink-0 whitespace-nowrap">
          {fileName}
        </span>
      </div>
      <div className="shrink-0 flex items-center gap-1.5">
        {isViewed && (
          <div className="size-4 rounded bg-emerald-500/20 flex items-center justify-center">
            <Eye className="size-2.5 text-emerald-500" />
          </div>
        )}
        {getStatusIndicator(status)}
      </div>
    </div>
  )

  if (!showContextMenu) {
    return content
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{content}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        {onCopyPath && (
          <ContextMenuItem onClick={onCopyPath}>
            {t("changes.copyPath")}
          </ContextMenuItem>
        )}
        {onCopyRelativePath && (
          <ContextMenuItem onClick={onCopyRelativePath}>
            {t("changes.copyRelativePath")}
          </ContextMenuItem>
        )}
        {(onCopyPath || onCopyRelativePath) && onRevealInFinder && (
          <ContextMenuSeparator />
        )}
        {onRevealInFinder && (
          <ContextMenuItem onClick={onRevealInFinder}>
            {t("changes.revealInFinder")}
          </ContextMenuItem>
        )}
        {(onOpenInFilePreview || onOpenInEditor) && (
          <ContextMenuSeparator />
        )}
        {onOpenInFilePreview && (
          <ContextMenuItem onClick={onOpenInFilePreview}>
            {t("changes.openInFilePreview")}
          </ContextMenuItem>
        )}
        {onOpenInEditor && (
          <ContextMenuItem onClick={onOpenInEditor}>
            {t("changes.openInEditor", {
              editor: editorLabel || t("changes.openInEditorFallback"),
            })}
          </ContextMenuItem>
        )}
        {onToggleViewed && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={onToggleViewed} className="justify-between">
              {isViewed ? t("changes.markUnviewed") : t("changes.markViewed")}
              <Kbd>V</Kbd>
            </ContextMenuItem>
          </>
        )}
        {onDiscard && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              onClick={onDiscard}
              className="data-[highlighted]:bg-red-500/15 data-[highlighted]:text-red-400"
            >
              {isUntracked
                ? t("changes.deleteFile")
                : t("changes.discardChanges")}
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
})

/**
 * Helper to extract file name from path
 */
export function getFileName(path: string): string {
  const parts = path.split("/")
  return parts[parts.length - 1] || path
}

/**
 * Helper to extract directory from path
 */
export function getFileDir(path: string): string {
  const parts = path.split("/")
  if (parts.length <= 1) return ""
  return parts.slice(0, -1).join("/")
}

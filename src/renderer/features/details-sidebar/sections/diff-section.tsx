"use client"

import { Button } from "@/components/ui/button"
import { GitCommit } from "lucide-react"
import { IconSpinner, DiffIcon } from "@/components/ui/icons"
import { cn } from "@/lib/utils"
import { getFileIconByExtension } from "@/features/agents/mentions/agents-file-mention"
import { useI18n } from "@/lib/i18n"

/** Parsed diff file type */
interface ParsedDiffFile {
  key: string
  oldPath: string
  newPath: string
  additions: number
  deletions: number
  isNewFile?: boolean
  isDeletedFile?: boolean
}

interface DiffSectionProps {
  chatId: string
  isDiffSidebarOpen: boolean
  setIsDiffSidebarOpen: (open: boolean) => void
  diffStats?: { additions: number; deletions: number; fileCount: number } | null
  parsedFileDiffs?: ParsedDiffFile[]
  onCommit?: () => void
  isCommitting?: boolean
  isExpanded?: boolean
  onOpenFullDiff?: () => void
}

/**
 * Get file name from path
 */
function getFileName(path: string): string {
  const parts = path.split("/")
  return parts[parts.length - 1] || path
}

/**
 * Get file directory from path
 */
function getFileDir(path: string): string {
  const parts = path.split("/")
  if (parts.length <= 1) return ""
  return parts.slice(0, -1).join("/")
}

export function DiffSection({
  chatId,
  isDiffSidebarOpen,
  setIsDiffSidebarOpen,
  diffStats,
  parsedFileDiffs,
  onCommit,
  isCommitting = false,
  isExpanded = false,
  onOpenFullDiff,
}: DiffSectionProps) {
  const { t } = useI18n()
  const hasChanges = diffStats && diffStats.fileCount > 0
  const files = parsedFileDiffs || []
  const handleOpenFullDiff =
    onOpenFullDiff ?? (() => setIsDiffSidebarOpen(true))

  // Compact widgets show a preview; expanded unified diff owns the full list.
  const maxFilesToShow = isExpanded ? files.length : 5
  const visibleFiles = files.slice(0, maxFilesToShow)
  const remainingCount = isExpanded ? 0 : files.length - maxFilesToShow

  return (
    <div className="px-3 py-2">
      {hasChanges ? (
        <div className="space-y-2">
          {/* Stats summary - same style as agent-diff-view */}
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-muted-foreground">
              {diffStats.fileCount} file{diffStats.fileCount !== 1 ? "s" : ""}
            </span>
            <span className="tabular-nums whitespace-nowrap">
              {diffStats.additions > 0 && (
                <span className="mr-1.5 text-emerald-600 dark:text-emerald-400">
                  +{diffStats.additions}
                </span>
              )}
              {diffStats.deletions > 0 && (
                <span className="text-red-600 dark:text-red-400">
                  -{diffStats.deletions}
                </span>
              )}
            </span>
          </div>

          {/* File list - matching agent-diff-view header style */}
          {visibleFiles.length > 0 && (
            <div className="space-y-0.5">
              {visibleFiles.map((file) => {
                const displayPath = file.newPath || file.oldPath
                const fileName = getFileName(displayPath)
                const dirPath = getFileDir(displayPath)
                const isNewFile = file.isNewFile
                const isDeletedFile = file.isDeletedFile
                const FileIcon = getFileIconByExtension(fileName)
                const rowClassName = cn(
                  "group flex items-center gap-2 font-mono text-xs",
                  "py-1 px-1.5 rounded w-full text-left",
                  isExpanded
                    ? "cursor-default"
                    : "cursor-pointer hover:bg-accent/50 transition-colors",
                )
                const rowContent = (
                  <>
                    {/* File icon */}
                    <div className="relative w-3.5 h-3.5 shrink-0">
                      {FileIcon && (
                        <FileIcon className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                    </div>

                    {/* File name + path + status - same layout as agent-diff-view */}
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="font-medium text-foreground shrink-0">
                        {fileName}
                      </span>
                      {dirPath && (
                        <span className="text-muted-foreground truncate text-[11px] min-w-0">
                          {dirPath}
                        </span>
                      )}
                      {isNewFile && (
                        <span className="shrink-0 text-[11px] text-emerald-600 dark:text-emerald-400">
                          (new)
                        </span>
                      )}
                      {isDeletedFile && (
                        <span className="shrink-0 text-[11px] text-red-600 dark:text-red-400">
                          (deleted)
                        </span>
                      )}
                    </div>

                    {/* Stats - same style as agent-diff-view */}
                    <span className="shrink-0 font-mono text-[11px] tabular-nums whitespace-nowrap">
                      {file.additions > 0 && (
                        <span className="mr-1.5 text-emerald-600 dark:text-emerald-400">
                          +{file.additions}
                        </span>
                      )}
                      {file.deletions > 0 && (
                        <span className="text-red-600 dark:text-red-400">
                          -{file.deletions}
                        </span>
                      )}
                    </span>
                  </>
                )

                if (isExpanded) {
                  return (
                    <div key={file.key} className={rowClassName}>
                      {rowContent}
                    </div>
                  )
                }

                return (
                  <button
                    type="button"
                    key={file.key}
                    className={rowClassName}
                    onClick={handleOpenFullDiff}
                  >
                    {rowContent}
                  </button>
                )
              })}

              {/* Show more indicator */}
              {remainingCount > 0 && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground py-1 px-1.5 w-full text-left font-mono"
                  onClick={handleOpenFullDiff}
                >
                  +{remainingCount} more file{remainingCount !== 1 ? "s" : ""}
                  ...
                </button>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 pt-1">
            {/* Commit button */}
            {onCommit && (
              <Button
                variant="default"
                size="sm"
                className="flex-1 h-7 text-xs"
                onClick={onCommit}
                disabled={isCommitting}
              >
                {isCommitting ? (
                  <IconSpinner className="h-3 w-3 mr-1.5" />
                ) : (
                  <GitCommit className="h-3 w-3 mr-1.5" />
                )}
                Commit
              </Button>
            )}

            {!isExpanded && (
              <Button
                variant="outline"
                size="sm"
                className={cn("h-7 text-xs", onCommit ? "flex-1" : "w-full")}
                onClick={handleOpenFullDiff}
              >
                <DiffIcon className="h-3 w-3 mr-1.5" />
                {t("changes.viewAll")}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <DiffIcon className="h-3.5 w-3.5" />
          <span>{t("changes.noChanges")}</span>
        </div>
      )}
    </div>
  )
}

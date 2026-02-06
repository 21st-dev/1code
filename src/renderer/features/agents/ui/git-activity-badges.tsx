"use client"

import { memo, useCallback, useMemo, useState } from "react"
import { GitCommit, GitPullRequest } from "lucide-react"
import { useAtomValue, useSetAtom } from "jotai"
import { AnimatePresence, motion } from "motion/react"
import {
  ExpandIcon,
  CollapseIcon,
} from "../../../components/ui/icons"
import {
  extractGitActivity,
  extractChangedFiles,
  type ChangedFileInfo,
} from "../utils/git-activity"
import {
  selectedProjectAtom,
  diffSidebarOpenAtomFamily,
  filteredDiffFilesAtom,
  filteredSubChatIdAtom,
  selectedCommitAtom,
  diffActiveTabAtom,
} from "../atoms"
import { cn } from "../../../lib/utils"
import { getFileIconByExtension } from "../mentions/agents-file-mention"
import { useFileOpen } from "../mentions"

interface GitActivityBadgesProps {
  parts: any[]
  chatId: string
  subChatId: string
}

export const GitActivityBadges = memo(function GitActivityBadges({
  parts,
  chatId,
  subChatId,
}: GitActivityBadgesProps) {
  const selectedProject = useAtomValue(selectedProjectAtom)
  const setDiffSidebarOpen = useSetAtom(diffSidebarOpenAtomFamily(chatId))
  const setFilteredDiffFiles = useSetAtom(filteredDiffFilesAtom)
  const setFilteredSubChatId = useSetAtom(filteredSubChatIdAtom)
  const setSelectedCommit = useSetAtom(selectedCommitAtom)
  const setDiffActiveTab = useSetAtom(diffActiveTabAtom)
  const onOpenFile = useFileOpen()

  const [isExpanded, setIsExpanded] = useState(false)

  const activity = useMemo(() => extractGitActivity(parts), [parts])
  const changedFiles = useMemo(() => extractChangedFiles(parts), [parts])

  const totals = useMemo(() => {
    let additions = 0
    let deletions = 0
    for (const file of changedFiles) {
      additions += file.additions
      deletions += file.deletions
    }
    return { additions, deletions }
  }, [changedFiles])

  const handleOpenCommit = useCallback(() => {
    if (activity?.type !== "commit") return

    // If pushed to remote — open on GitHub
    const owner = selectedProject?.gitOwner
    const repo = selectedProject?.gitRepo
    if (activity.pushed && activity.hash && owner && repo) {
      window.desktopApi.openExternal(
        `https://github.com/${owner}/${repo}/commit/${activity.hash}`,
      )
      return
    }

    // Otherwise — open local diff sidebar with History tab
    if (activity.hash) {
      setSelectedCommit({
        hash: activity.hash,
        shortHash: activity.hash.slice(0, 8),
        message: activity.message,
      })
    }
    setFilteredDiffFiles(null)
    setFilteredSubChatId(subChatId)
    setDiffActiveTab("history")
    setDiffSidebarOpen(true)
  }, [activity, subChatId, selectedProject, setSelectedCommit, setFilteredDiffFiles, setFilteredSubChatId, setDiffActiveTab, setDiffSidebarOpen])

  const handleFileClick = useCallback((file: ChangedFileInfo) => {
    onOpenFile?.(file.filePath)
  }, [onOpenFile])

  if (!activity && changedFiles.length === 0) return null

  return (
    <div className="mx-2 mt-1.5 mb-1 flex flex-col gap-1.5">
      {/* Changed files block - edit tool style */}
      {changedFiles.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/30 overflow-hidden">
          {/* Header */}
          <div
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center justify-between pl-2.5 pr-0.5 h-7 cursor-pointer hover:bg-muted/50 transition-colors duration-150"
          >
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
              <span>Edited {changedFiles.length} {changedFiles.length === 1 ? "file" : "files"}</span>
              {(totals.additions > 0 || totals.deletions > 0) && (
                <>
                  <span className="text-green-600 dark:text-green-400">+{totals.additions}</span>
                  <span className="text-red-600 dark:text-red-400">-{totals.deletions}</span>
                </>
              )}
            </div>

            <div className="flex items-center flex-shrink-0 ml-2">

              {/* Expand/Collapse button */}
              <div className="w-6 h-6 flex items-center justify-center">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsExpanded(!isExpanded)
                  }}
                  className="p-1 rounded-md hover:bg-accent transition-[background-color,transform] duration-150 ease-out active:scale-95"
                >
                  <div className="relative w-4 h-4">
                    <ExpandIcon
                      className={cn(
                        "absolute inset-0 w-4 h-4 text-muted-foreground transition-[opacity,transform] duration-200 ease-out",
                        isExpanded ? "opacity-0 scale-75" : "opacity-100 scale-100",
                      )}
                    />
                    <CollapseIcon
                      className={cn(
                        "absolute inset-0 w-4 h-4 text-muted-foreground transition-[opacity,transform] duration-200 ease-out",
                        isExpanded ? "opacity-100 scale-100" : "opacity-0 scale-75",
                      )}
                    />
                  </div>
                </button>
              </div>
            </div>
          </div>

          {/* File list */}
          <AnimatePresence initial={false}>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                className="overflow-hidden"
              >
                <div className="border-t border-border max-h-[200px] overflow-y-auto">
                  {changedFiles.map((file) => {
                    const FileIcon = getFileIconByExtension(file.displayPath)
                    return (
                      <div
                        key={file.filePath}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleFileClick(file)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            handleFileClick(file)
                          }
                        }}
                        className="flex items-center gap-2 px-2.5 py-1 text-xs hover:bg-muted/50 transition-colors cursor-pointer"
                      >
                        {FileIcon && (
                          <FileIcon className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
                        )}
                        <span className="truncate flex-1 text-foreground">{file.displayPath}</span>
                        <span className="flex-shrink-0 text-green-600 dark:text-green-400">+{file.additions}</span>
                        <span className="flex-shrink-0 text-red-600 dark:text-red-400">-{file.deletions}</span>
                      </div>
                    )
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Git activity badge */}
      {activity?.type === "commit" && (
        <button
          onClick={handleOpenCommit}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-muted/30 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors cursor-pointer overflow-hidden min-w-0"
        >
          <GitCommit className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="truncate">{activity.message}</span>
        </button>
      )}

      {activity?.type === "pr" && (
        <button
          onClick={() => window.desktopApi.openExternal(activity.url)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-muted/30 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors cursor-pointer overflow-hidden min-w-0"
        >
          <GitPullRequest className="w-3.5 h-3.5 flex-shrink-0 text-emerald-500" />
          <span className="truncate">{activity.title}</span>
        </button>
      )}
    </div>
  )
})

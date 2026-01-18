"use client"

import { useState, useMemo, useCallback } from "react"
import { trpc } from "../../lib/trpc"
import {
  GitBranch,
  Plus,
  Minus,
  RefreshCw,
  Check,
  ChevronDown,
  ChevronRight,
  Undo2,
  Upload,
  Download,
  Sparkles,
  Loader2,
  ArrowDownUp,
} from "lucide-react"
import { cn } from "../../lib/utils"
import { Button } from "../../components/ui/button"
import { Textarea } from "../../components/ui/textarea"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../components/ui/collapsible"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../components/ui/tooltip"
import { toast } from "sonner"
import type { ChangedFile, FileStatus } from "../../../shared/changes-types"

interface GitPanelProps {
  worktreePath: string | null
  defaultBranch?: string
  onFileSelect?: (filePath: string, category: "staged" | "unstaged") => void
}

const statusColors: Record<FileStatus, string> = {
  added: "text-green-500",
  modified: "text-blue-500",
  deleted: "text-red-500",
  renamed: "text-purple-500",
  copied: "text-purple-500",
  untracked: "text-muted-foreground",
}

const statusLabels: Record<FileStatus, string> = {
  added: "A",
  modified: "M",
  deleted: "D",
  renamed: "R",
  copied: "C",
  untracked: "U",
}

function FileItem({
  file,
  category,
  onStage,
  onUnstage,
  onDiscard,
  onSelect,
  isStaging,
}: {
  file: ChangedFile
  category: "staged" | "unstaged" | "untracked"
  onStage?: () => void
  onUnstage?: () => void
  onDiscard?: () => void
  onSelect?: () => void
  isStaging?: boolean
}) {
  const [isHovered, setIsHovered] = useState(false)
  const fileName = file.path.split("/").pop() || file.path
  const dirPath = file.path.includes("/")
    ? file.path.substring(0, file.path.lastIndexOf("/"))
    : ""

  return (
    <div
      className="group flex items-center gap-1 px-2 py-0.5 hover:bg-muted/50 rounded-sm cursor-pointer text-sm"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onSelect}
    >
      <span
        className={cn(
          "w-4 text-xs font-mono flex-shrink-0",
          statusColors[file.status]
        )}
      >
        {statusLabels[file.status]}
      </span>
      <span className="flex-1 truncate" title={file.path}>
        <span className="text-foreground">{fileName}</span>
        {dirPath && (
          <span className="text-muted-foreground ml-1 text-xs">{dirPath}</span>
        )}
      </span>
      {file.additions > 0 && (
        <span className="text-xs text-green-500">+{file.additions}</span>
      )}
      {file.deletions > 0 && (
        <span className="text-xs text-red-500">-{file.deletions}</span>
      )}
      {isHovered && !isStaging && (
        <div className="flex items-center gap-0.5 ml-1">
          {category === "staged" && onUnstage && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onUnstage()
                  }}
                  className="p-0.5 rounded hover:bg-muted"
                >
                  <Minus className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left">Unstage</TooltipContent>
            </Tooltip>
          )}
          {(category === "unstaged" || category === "untracked") && onStage && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onStage()
                  }}
                  className="p-0.5 rounded hover:bg-muted"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left">Stage</TooltipContent>
            </Tooltip>
          )}
          {category === "unstaged" && onDiscard && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onDiscard()
                  }}
                  className="p-0.5 rounded hover:bg-muted text-destructive"
                >
                  <Undo2 className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left">Discard Changes</TooltipContent>
            </Tooltip>
          )}
        </div>
      )}
    </div>
  )
}

export function GitPanel({
  worktreePath,
  defaultBranch = "main",
  onFileSelect,
}: GitPanelProps) {
  const [commitMessage, setCommitMessage] = useState("")
  const [stagedOpen, setStagedOpen] = useState(true)
  const [changesOpen, setChangesOpen] = useState(true)
  const [isStaging, setIsStaging] = useState(false)

  const utils = trpc.useUtils()

  const { data: status, isLoading, refetch } = trpc.changes.getStatus.useQuery(
    { worktreePath: worktreePath || "", defaultBranch },
    { enabled: !!worktreePath, refetchInterval: 5000 }
  )

  const stageMutation = trpc.changes.stageFile.useMutation({
    onSuccess: () => utils.changes.getStatus.invalidate(),
    onError: (err) => toast.error(`Failed to stage: ${err.message}`),
  })

  const unstageMutation = trpc.changes.unstageFile.useMutation({
    onSuccess: () => utils.changes.getStatus.invalidate(),
    onError: (err) => toast.error(`Failed to unstage: ${err.message}`),
  })

  const stageAllMutation = trpc.changes.stageAll.useMutation({
    onSuccess: () => utils.changes.getStatus.invalidate(),
    onError: (err) => toast.error(`Failed to stage all: ${err.message}`),
  })

  const unstageAllMutation = trpc.changes.unstageAll.useMutation({
    onSuccess: () => utils.changes.getStatus.invalidate(),
    onError: (err) => toast.error(`Failed to unstage all: ${err.message}`),
  })

  const discardMutation = trpc.changes.discardChanges.useMutation({
    onSuccess: () => utils.changes.getStatus.invalidate(),
    onError: (err) => toast.error(`Failed to discard: ${err.message}`),
  })

  const commitMutation = trpc.changes.commit.useMutation({
    onSuccess: () => {
      utils.changes.getStatus.invalidate()
      setCommitMessage("")
      toast.success("Changes committed!")
    },
    onError: (err) => toast.error(`Commit failed: ${err.message}`),
  })

  const pushMutation = trpc.changes.push.useMutation({
    onSuccess: () => {
      utils.changes.getStatus.invalidate()
      toast.success("Pushed to remote!")
    },
    onError: (err) => toast.error(`Push failed: ${err.message}`),
  })

  const pullMutation = trpc.changes.pull.useMutation({
    onSuccess: () => {
      utils.changes.getStatus.invalidate()
      toast.success("Pulled from remote!")
    },
    onError: (err) => toast.error(`Pull failed: ${err.message}`),
  })

  const syncMutation = trpc.changes.sync.useMutation({
    onSuccess: () => {
      utils.changes.getStatus.invalidate()
      toast.success("Synced with remote!")
    },
    onError: (err) => toast.error(`Sync failed: ${err.message}`),
  })

  const generateMutation = trpc.changes.generateCommitMessage.useMutation({
    onSuccess: (data) => {
      setCommitMessage(data.message)
      toast.success("Generated commit message")
    },
    onError: (err) => toast.error(err.message),
  })

  const handleStage = useCallback(
    async (filePath: string) => {
      if (!worktreePath) return
      setIsStaging(true)
      try {
        await stageMutation.mutateAsync({ worktreePath, filePath })
      } finally {
        setIsStaging(false)
      }
    },
    [worktreePath, stageMutation]
  )

  const handleUnstage = useCallback(
    async (filePath: string) => {
      if (!worktreePath) return
      setIsStaging(true)
      try {
        await unstageMutation.mutateAsync({ worktreePath, filePath })
      } finally {
        setIsStaging(false)
      }
    },
    [worktreePath, unstageMutation]
  )

  const handleDiscard = useCallback(
    async (filePath: string) => {
      if (!worktreePath) return
      if (!confirm(`Discard changes to ${filePath}?`)) return
      await discardMutation.mutateAsync({ worktreePath, filePath })
    },
    [worktreePath, discardMutation]
  )

  const handleCommit = useCallback(async () => {
    if (!worktreePath || !commitMessage.trim()) return
    await commitMutation.mutateAsync({
      worktreePath,
      message: commitMessage.trim(),
    })
  }, [worktreePath, commitMessage, commitMutation])

  const handleStageAll = useCallback(async () => {
    if (!worktreePath) return
    await stageAllMutation.mutateAsync({ worktreePath })
  }, [worktreePath, stageAllMutation])

  const handleUnstageAll = useCallback(async () => {
    if (!worktreePath) return
    await unstageAllMutation.mutateAsync({ worktreePath })
  }, [worktreePath, unstageAllMutation])

  const unstagedFiles = useMemo(() => {
    if (!status) return []
    return [...(status.unstaged ?? []), ...(status.untracked ?? [])]
  }, [status])

  const stagedCount = status?.staged?.length ?? 0
  const unstagedCount = unstagedFiles.length
  const hasChanges = stagedCount > 0 || unstagedCount > 0

  if (!worktreePath) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm p-4">
        <GitBranch className="h-8 w-8 mb-2 opacity-50" />
        <p>No project selected</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        <RefreshCw className="h-4 w-4 animate-spin mr-2" />
        Loading...
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{status?.branch || "—"}</span>
        </div>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() =>
                  worktreePath && pullMutation.mutate({ worktreePath })
                }
                disabled={pullMutation.isPending || !status?.hasUpstream}
              >
                {pullMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Pull{status?.pullCount ? ` (${status.pullCount})` : ""}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() =>
                  worktreePath &&
                  pushMutation.mutate({ worktreePath, setUpstream: true })
                }
                disabled={pushMutation.isPending}
              >
                {pushMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Push{status?.pushCount ? ` (${status.pushCount})` : ""}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() =>
                  worktreePath && syncMutation.mutate({ worktreePath })
                }
                disabled={syncMutation.isPending}
              >
                {syncMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ArrowDownUp className="h-3.5 w-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Sync (Pull & Push)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => refetch()}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Commit input */}
      <div className="px-3 py-2 border-b">
        <div className="relative">
          <Textarea
            placeholder="Commit message"
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            className="min-h-[60px] text-sm resize-none pr-8"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                handleCommit()
              }
            }}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="absolute top-2 right-2 p-1 rounded hover:bg-muted disabled:opacity-50"
                onClick={() => worktreePath && generateMutation.mutate({ worktreePath })}
                disabled={generateMutation.isPending || stagedCount === 0}
              >
                {generateMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>Generate with AI</TooltipContent>
          </Tooltip>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Button
            size="sm"
            className="flex-1"
            disabled={
              !commitMessage.trim() ||
              stagedCount === 0 ||
              commitMutation.isPending
            }
            onClick={handleCommit}
          >
            {commitMutation.isPending ? (
              <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5 mr-1.5" />
            )}
            Commit
          </Button>
        </div>
      </div>

      {/* File lists */}
      <div className="flex-1 overflow-y-auto">
        <div className="py-1">
          {/* Staged Changes */}
          <Collapsible open={stagedOpen} onOpenChange={setStagedOpen}>
            <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-1 hover:bg-muted/50 text-sm">
              <div className="flex items-center gap-1">
                {stagedOpen ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
                <span className="font-medium">Staged Changes</span>
                {stagedCount > 0 && (
                  <span className="text-muted-foreground ml-1">
                    ({stagedCount})
                  </span>
                )}
              </div>
              {stagedCount > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleUnstageAll()
                      }}
                      className="p-0.5 rounded hover:bg-muted"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left">Unstage All</TooltipContent>
                </Tooltip>
              )}
            </CollapsibleTrigger>
            <CollapsibleContent>
              {status?.staged?.map((file) => (
                <FileItem
                  key={file.path}
                  file={file}
                  category="staged"
                  onUnstage={() => handleUnstage(file.path)}
                  onSelect={() => onFileSelect?.(file.path, "staged")}
                  isStaging={isStaging}
                />
              ))}
              {stagedCount === 0 && (
                <div className="px-6 py-2 text-xs text-muted-foreground">
                  No staged changes
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>

          {/* Changes (unstaged + untracked) */}
          <Collapsible open={changesOpen} onOpenChange={setChangesOpen}>
            <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-1 hover:bg-muted/50 text-sm">
              <div className="flex items-center gap-1">
                {changesOpen ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
                <span className="font-medium">Changes</span>
                {unstagedCount > 0 && (
                  <span className="text-muted-foreground ml-1">
                    ({unstagedCount})
                  </span>
                )}
              </div>
              {unstagedCount > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleStageAll()
                      }}
                      className="p-0.5 rounded hover:bg-muted"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left">Stage All</TooltipContent>
                </Tooltip>
              )}
            </CollapsibleTrigger>
            <CollapsibleContent>
              {status?.unstaged?.map((file) => (
                <FileItem
                  key={file.path}
                  file={file}
                  category="unstaged"
                  onStage={() => handleStage(file.path)}
                  onDiscard={() => handleDiscard(file.path)}
                  onSelect={() => onFileSelect?.(file.path, "unstaged")}
                  isStaging={isStaging}
                />
              ))}
              {status?.untracked?.map((file) => (
                <FileItem
                  key={file.path}
                  file={file}
                  category="untracked"
                  onStage={() => handleStage(file.path)}
                  onSelect={() => onFileSelect?.(file.path, "unstaged")}
                  isStaging={isStaging}
                />
              ))}
              {unstagedCount === 0 && (
                <div className="px-6 py-2 text-xs text-muted-foreground">
                  No changes
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>

      {/* Footer with sync status */}
      {status?.hasUpstream && (status.pushCount > 0 || status.pullCount > 0) && (
        <div className="px-3 py-2 border-t text-xs text-muted-foreground flex items-center gap-2">
          {status.pullCount > 0 && (
            <span className="flex items-center gap-1">
              <Download className="h-3 w-3" />
              {status.pullCount} to pull
            </span>
          )}
          {status.pushCount > 0 && (
            <span className="flex items-center gap-1">
              <Upload className="h-3 w-3" />
              {status.pushCount} to push
            </span>
          )}
        </div>
      )}
    </div>
  )
}

"use client"

import { memo, useState, useCallback, useEffect } from "react"
import { useAtomValue } from "jotai"
import { Pencil } from "lucide-react"
import {
  GitBranchFilledIcon,
  FolderFilledIcon,
  GitPullRequestFilledIcon,
  ExternalLinkIcon,
} from "@/components/ui/icons"
import { RenamePrTitleDialog } from "./rename-pr-title-dialog"
import { Kbd } from "@/components/ui/kbd"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { trpc } from "@/lib/trpc"
import { preferredEditorAtom } from "@/lib/atoms"
import { useResolvedHotkeyDisplay } from "@/lib/hotkeys"
import { APP_META } from "../../../../shared/external-apps"
import { EDITOR_ICONS } from "@/lib/editor-icons"
import { toast } from "sonner"

interface InfoSectionProps {
  chatId: string
  worktreePath: string | null
  isExpanded?: boolean
  /** Remote chat data for sandbox workspaces */
  remoteInfo?: {
    repository?: string
    branch?: string | null
    sandboxId?: string
  } | null
}

/** Property row component - Notion-style with icon, label, and value */
function PropertyRow({
  icon: Icon,
  label,
  value,
  title,
  onClick,
  copyable,
  tooltip,
  badge,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  title?: string
  onClick?: () => void
  copyable?: boolean
  /** Tooltip to show on hover (for clickable items) */
  tooltip?: string
  /** Optional trailing element rendered next to the value (e.g. branch pill on PR row) */
  badge?: React.ReactNode
}) {
  const [showCopied, setShowCopied] = useState(false)

  const handleClick = useCallback(() => {
    if (copyable) {
      navigator.clipboard.writeText(value)
      setShowCopied(true)
      setTimeout(() => setShowCopied(false), 1500)
    } else if (onClick) {
      onClick()
    }
  }, [copyable, value, onClick])

  const isClickable = onClick || copyable

  const valueEl = isClickable ? (
    <button
      type="button"
      className="text-xs text-foreground cursor-pointer rounded px-1.5 py-0.5 -ml-1.5 truncate hover:bg-accent hover:text-accent-foreground transition-colors"
      title={!tooltip ? title : undefined}
      onClick={handleClick}
    >
      {value}
    </button>
  ) : (
    <span className="text-xs text-foreground truncate" title={!tooltip ? title : undefined}>
      {value}
    </span>
  )

  const wrappedValue = copyable ? (
    <Tooltip open={showCopied ? true : undefined}>
      <TooltipTrigger asChild>
        {valueEl}
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {showCopied ? "Copied" : "Click to copy"}
      </TooltipContent>
    </Tooltip>
  ) : tooltip ? (
    <Tooltip delayDuration={500}>
      <TooltipTrigger asChild>
        {valueEl}
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  ) : (
    valueEl
  )

  return (
    <div className="flex items-center min-h-[28px]">
      {/* Label column - fixed width */}
      <div className="flex items-center gap-1.5 w-[100px] flex-shrink-0">
        <Icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        <span className="text-xs text-muted-foreground truncate">{label}</span>
      </div>
      {/* Value column - flexible */}
      <div className="flex-1 min-w-0 pl-2 flex items-center gap-1.5 min-h-0">
        <div className="min-w-0 truncate">{wrappedValue}</div>
        {badge}
      </div>
    </div>
  )
}

/**
 * Info Section for Details Sidebar
 * Shows workspace info: branch, PR, path
 * Memoized to prevent re-renders when parent updates
 */
export const InfoSection = memo(function InfoSection({
  chatId,
  worktreePath,
  isExpanded = false,
  remoteInfo,
}: InfoSectionProps) {
  // Extract folder name from path
  const folderName = worktreePath?.split("/").pop() || "Unknown"

  const [isRenamePrOpen, setIsRenamePrOpen] = useState(false)

  // Preferred editor from settings
  const preferredEditor = useAtomValue(preferredEditorAtom)
  const editorMeta = APP_META[preferredEditor]

  // Mutations
  const openInFinderMutation = trpc.external.openInFinder.useMutation()
  const openInAppMutation = trpc.external.openInApp.useMutation({
    onError: (error, vars) => {
      const appLabel = APP_META[vars.app]?.label ?? vars.app
      toast.error(`Couldn't open ${appLabel}`, {
        description: error.message || "Make sure the app is installed and its CLI is on your PATH.",
      })
    },
  })

  // Check if this is a remote sandbox chat (no local worktree)
  const isRemoteChat = !worktreePath && !!remoteInfo

  // Fetch branch data directly (only for local chats)
  const { data: branchData, isLoading: isBranchLoading } = trpc.changes.getBranches.useQuery(
    { worktreePath: worktreePath || "" },
    { enabled: !!worktreePath }
  )

  // Get PR status for current branch (only for local chats)
  const { data: prStatus } = trpc.chats.getPrStatus.useQuery(
    { chatId },
    {
      refetchInterval: 30000, // Poll every 30 seconds
      enabled: !!chatId && !!worktreePath, // Only enable for local chats
    }
  )

  // For local chats: use fetched branch data
  // For remote chats: use remoteInfo from props
  const branchName = isRemoteChat ? remoteInfo?.branch : branchData?.current
  const pr = prStatus?.pr

  // Extract repo name from repository URL (e.g., "owner/repo" from "github.com/owner/repo")
  const repositoryName = remoteInfo?.repository
    ? remoteInfo.repository.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "")
    : null

  const handleOpenFolder = () => {
    if (worktreePath) {
      openInFinderMutation.mutate(worktreePath)
    }
  }

  // Show the "Open in editor" row for any local chat with a repo path,
  // whether that path is a worktree (~/.21st/worktrees/...) or the project
  // folder itself (project-mode chats).
  const canOpenInEditor = !!worktreePath
  const openInEditorHotkey = useResolvedHotkeyDisplay("open-in-editor")

  const handleOpenInEditor = useCallback(() => {
    if (worktreePath) {
      openInAppMutation.mutate({ path: worktreePath, app: preferredEditor })
    }
  }, [worktreePath, preferredEditor, openInAppMutation])

  // Listen for ⌘O hotkey event
  useEffect(() => {
    if (!canOpenInEditor) return
    const handler = () => handleOpenInEditor()
    window.addEventListener("open-in-editor", handler)
    return () => window.removeEventListener("open-in-editor", handler)
  }, [canOpenInEditor, handleOpenInEditor])

  const handleOpenPr = () => {
    if (pr?.url) {
      window.desktopApi.openExternal(pr.url)
    }
  }

  const handleOpenRepository = () => {
    if (remoteInfo?.repository) {
      const repoUrl = remoteInfo.repository.startsWith("http")
        ? remoteInfo.repository
        : `https://github.com/${remoteInfo.repository}`
      window.desktopApi.openExternal(repoUrl)
    }
  }

  const handleOpenSandbox = () => {
    if (remoteInfo?.sandboxId) {
      const sandboxUrl = `https://3003-${remoteInfo.sandboxId}.e2b.app`
      window.desktopApi.openExternal(sandboxUrl)
    }
  }

  // Show loading state while branch data is loading (only for local chats)
  if (!isRemoteChat && isBranchLoading) {
    return (
      <div className="px-2 py-1.5 flex flex-col gap-0.5">
        <div className="flex items-center min-h-[28px]">
          <div className="flex items-center gap-1.5 w-[100px] flex-shrink-0">
            <div className="h-3.5 w-3.5 rounded bg-muted animate-pulse" />
            <div className="h-3 w-12 rounded bg-muted animate-pulse" />
          </div>
          <div className="flex-1 min-w-0 pl-2">
            <div className="h-3 w-32 rounded bg-muted animate-pulse" />
          </div>
        </div>
        <div className="flex items-center min-h-[28px]">
          <div className="flex items-center gap-1.5 w-[100px] flex-shrink-0">
            <div className="h-3.5 w-3.5 rounded bg-muted animate-pulse" />
            <div className="h-3 w-8 rounded bg-muted animate-pulse" />
          </div>
          <div className="flex-1 min-w-0 pl-2">
            <div className="h-3 w-24 rounded bg-muted animate-pulse" />
          </div>
        </div>
      </div>
    )
  }

  const hasContent = branchName || worktreePath || repositoryName || remoteInfo?.sandboxId

  if (!hasContent) {
    return (
      <div className="px-2 py-2">
        <div className="text-xs text-muted-foreground">
          No workspace info available
        </div>
      </div>
    )
  }

  return (
    <div className="px-2 py-1.5 flex flex-col gap-0.5">
      {/* Repository - only for remote chats */}
      {repositoryName && (
        <PropertyRow
          icon={FolderFilledIcon}
          label="Repository"
          value={repositoryName}
          title={remoteInfo?.repository}
          onClick={handleOpenRepository}
          tooltip="Open in GitHub"
        />
      )}
      {/* Branch - for both local and remote */}
      {branchName && (
        <PropertyRow icon={GitBranchFilledIcon} label="Branch" value={branchName} copyable />
      )}
      {/* PR - only for local chats */}
      {pr && (
        <PropertyRow
          icon={GitPullRequestFilledIcon}
          label="Pull Request"
          value={`#${pr.number}`}
          title={pr.title}
          onClick={handleOpenPr}
          tooltip="Open in GitHub"
          badge={
            <div className="flex items-center gap-1 min-w-0">
              {branchName && (
                <Tooltip delayDuration={500}>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-border/70 bg-muted/50 text-[10px] font-mono text-muted-foreground max-w-[140px] truncate">
                      <GitBranchFilledIcon className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">{branchName}</span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    PR branch: {branchName}
                  </TooltipContent>
                </Tooltip>
              )}
              <Tooltip delayDuration={500}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setIsRenamePrOpen(true)
                    }}
                    className="h-5 w-5 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors flex-shrink-0"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  Rename PR title
                </TooltipContent>
              </Tooltip>
            </div>
          }
        />
      )}
      {pr && (
        <RenamePrTitleDialog
          chatId={chatId}
          open={isRenamePrOpen}
          initialTitle={pr.title}
          prNumber={pr.number}
          onOpenChange={setIsRenamePrOpen}
        />
      )}
      {/* Path - only for local chats */}
      {worktreePath && (
        <PropertyRow
          icon={FolderFilledIcon}
          label="Path"
          value={folderName}
          title={worktreePath}
          onClick={handleOpenFolder}
          tooltip="Open in Finder"
        />
      )}
      {/* Open in Editor — any local chat with a repo path (project or worktree) */}
      {canOpenInEditor && (
        <div className="flex items-center min-h-[28px]">
          <div className="flex items-center gap-1.5 w-[100px] flex-shrink-0">
            <ExternalLinkIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <span className="text-xs text-muted-foreground truncate">Open in</span>
          </div>
          <div className="flex-1 min-w-0 pl-2">
            <Tooltip delayDuration={500}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleOpenInEditor}
                  className="flex items-center gap-1.5 text-xs text-foreground cursor-pointer rounded px-1.5 py-0.5 -ml-1.5 hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  {EDITOR_ICONS[preferredEditor] && (
                    <img
                      src={EDITOR_ICONS[preferredEditor]}
                      alt=""
                      className="h-3.5 w-3.5 flex-shrink-0"
                    />
                  )}
                  {editorMeta.label}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                Open in {editorMeta.label}
                {openInEditorHotkey && <Kbd className="normal-case font-sans">{openInEditorHotkey}</Kbd>}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      )}
    </div>
  )
})

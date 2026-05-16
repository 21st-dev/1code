"use client"

import { memo, useState, useCallback, useEffect } from "react"
import { useAtomValue } from "jotai"
import {
  GitBranchFilledIcon,
  FolderFilledIcon,
  GitPullRequestFilledIcon,
  ExternalLinkIcon,
} from "@/components/ui/icons"
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
import { useI18n } from "@/lib/i18n"

interface InfoSectionProps {
  chatId: string
  worktreePath: string | null
  isExpanded?: boolean
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
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  title?: string
  onClick?: () => void
  copyable?: boolean
  /** Tooltip to show on hover (for clickable items) */
  tooltip?: string
}) {
  const { t } = useI18n()
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

  return (
    <div className="flex items-center min-h-[28px]">
      {/* Label column - fixed width */}
      <div className="flex items-center gap-1.5 w-[100px] flex-shrink-0">
        <Icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        <span className="text-xs text-muted-foreground truncate">{label}</span>
      </div>
      {/* Value column - flexible */}
      <div className="flex-1 min-w-0 pl-2 truncate">
        {copyable ? (
          <Tooltip open={showCopied ? true : undefined}>
            <TooltipTrigger asChild>
              {valueEl}
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {showCopied ? t("details.copied") : t("details.clickToCopy")}
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
        )}
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
}: InfoSectionProps) {
  const { t } = useI18n()
  // Extract folder name from path
  const folderName = worktreePath?.split("/").pop() || t("details.unknown")

  // Preferred editor from settings
  const preferredEditor = useAtomValue(preferredEditorAtom)
  const editorMeta = APP_META[preferredEditor]

  // Mutations
  const openInFinderMutation = trpc.external.openInFinder.useMutation()
  const openInAppMutation = trpc.external.openInApp.useMutation()

  // Fetch branch data directly for local chats
  const { data: branchData, isLoading: isBranchLoading } = trpc.changes.getBranches.useQuery(
    { worktreePath: worktreePath || "" },
    { enabled: !!worktreePath }
  )

  // Get PR status for current branch
  const { data: prStatus } = trpc.chats.getPrStatus.useQuery(
    { chatId },
    {
      refetchInterval: 30000, // Poll every 30 seconds
      enabled: !!chatId && !!worktreePath,
    }
  )

  const branchName = branchData?.current
  const pr = prStatus?.pr

  const handleOpenFolder = () => {
    if (worktreePath) {
      openInFinderMutation.mutate(worktreePath)
    }
  }

  const isWorktree = !!worktreePath && worktreePath.includes(".21st/worktrees")
  const openInEditorHotkey = useResolvedHotkeyDisplay("open-in-editor")

  const handleOpenInEditor = useCallback(() => {
    if (worktreePath) {
      openInAppMutation.mutate({ path: worktreePath, app: preferredEditor })
    }
  }, [worktreePath, preferredEditor, openInAppMutation])

  // Listen for ⌘O hotkey event
  useEffect(() => {
    if (!isWorktree) return
    const handler = () => handleOpenInEditor()
    window.addEventListener("open-in-editor", handler)
    return () => window.removeEventListener("open-in-editor", handler)
  }, [isWorktree, handleOpenInEditor])

  const handleOpenPr = () => {
    if (pr?.url) {
      window.desktopApi.openExternal(pr.url)
    }
  }

  // Show loading state while branch data is loading
  if (isBranchLoading) {
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

  const hasContent = branchName || worktreePath

  if (!hasContent) {
    return (
      <div className="px-2 py-2">
        <div className="text-xs text-muted-foreground">
          {t("details.noWorkspaceInfo")}
        </div>
      </div>
    )
  }

  return (
    <div className="px-2 py-1.5 flex flex-col gap-0.5">
      {/* Branch */}
      {branchName && (
        <PropertyRow icon={GitBranchFilledIcon} label={t("details.branch")} value={branchName} copyable />
      )}
      {/* PR */}
      {pr && (
        <PropertyRow
          icon={GitPullRequestFilledIcon}
          label={t("details.pullRequest")}
          value={`#${pr.number}`}
          title={pr.title}
          onClick={handleOpenPr}
          tooltip={t("details.openInGitHub")}
        />
      )}
      {/* Path */}
      {worktreePath && (
        <PropertyRow
          icon={FolderFilledIcon}
          label={t("details.path")}
          value={folderName}
          title={worktreePath}
          onClick={handleOpenFolder}
          tooltip={t("details.openInFinder")}
        />
      )}
      {/* Open in Editor - only for actual git worktrees (under ~/.21st/worktrees/) */}
      {isWorktree && (
        <div className="flex items-center min-h-[28px]">
          <div className="flex items-center gap-1.5 w-[100px] flex-shrink-0">
            <ExternalLinkIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <span className="text-xs text-muted-foreground truncate">
              {t("details.openIn")}
            </span>
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
                {t("changes.openInEditor", { editor: editorMeta.label })}
                {openInEditorHotkey && <Kbd className="normal-case font-sans">{openInEditorHotkey}</Kbd>}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      )}
    </div>
  )
})

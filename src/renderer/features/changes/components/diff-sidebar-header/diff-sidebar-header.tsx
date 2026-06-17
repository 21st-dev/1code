import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronsDownUp,
  ChevronsUpDown,
  Columns2,
  Eye,
  GitMerge,
  GitPullRequest,
  MoreHorizontal,
  RefreshCw,
  Rows2,
  Square,
  Upload,
  X,
} from "lucide-react"
import { memo, useCallback, useEffect, useRef, useState } from "react"
import { HiArrowPath, HiChevronDown } from "react-icons/hi2"
import { LuGitBranch } from "react-icons/lu"
import { toast } from "sonner"
import type { DiffViewDisplayMode } from "@/features/agents/atoms"
import type { DiffViewMode } from "@/features/agents/ui/agent-diff-view"
import { Button } from "../../../../components/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "../../../../components/ui/context-menu"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "../../../../components/ui/dropdown-menu"
import {
  AgentIcon,
  CircleFilterIcon,
  ExternalLinkIcon,
  IconCloseSidebarRight,
  IconFetch,
  IconForcePush,
  IconReview,
  IconSpinner,
} from "../../../../components/ui/icons"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../../../components/ui/tooltip"
import { usePRStatus } from "../../../../hooks/usePRStatus"
import { type TranslationKey, useI18n } from "../../../../lib/i18n"
import { trpc } from "../../../../lib/trpc"
import { cn } from "../../../../lib/utils"
import { usePushAction } from "../../hooks/use-push-action"
import { getSyncActionKind } from "../../utils/sync-actions"
import { PRIcon } from "../pr-icon"
import { DiffViewModeSwitcher } from "./diff-view-mode-switcher"

interface DiffStats {
  isLoading: boolean
  hasChanges: boolean
  fileCount: number
  additions: number
  deletions: number
}

interface DiffSidebarHeaderProps {
  worktreePath: string
  currentBranch: string
  diffStats: DiffStats
  // Sidebar width for responsive layout
  sidebarWidth?: number
  // Sync state
  pushCount?: number
  pullCount?: number
  hasUpstream?: boolean
  isSyncStatusLoading?: boolean
  // Commits relative to default branch
  aheadOfDefault?: number
  behindDefault?: number
  // Actions
  onReview?: () => void
  isReviewing?: boolean
  onCreatePr?: () => void
  isCreatingPr?: boolean
  onCreatePrWithAI?: () => void
  isCreatingPrWithAI?: boolean
  onMergePr?: () => void
  isMergingPr?: boolean
  onClose: () => void
  onRefresh?: () => void
  // PR state
  hasPrNumber?: boolean
  isPrOpen?: boolean
  /** Whether PR has merge conflicts - shows warning and disables merge */
  hasMergeConflicts?: boolean
  /** Handler for fixing merge conflicts - sends prompt to AI */
  onFixConflicts?: () => void
  // Diff view controls
  onExpandAll?: () => void
  onCollapseAll?: () => void
  viewMode?: DiffViewMode
  onViewModeChange?: (mode: DiffViewMode) => void
  // Viewed files controls
  viewedCount?: number
  onMarkAllViewed?: () => void
  onMarkAllUnviewed?: () => void
  // Desktop window drag region
  isDesktop?: boolean
  isFullscreen?: boolean
  // Diff view display mode (Details expanded or full-page)
  displayMode?: DiffViewDisplayMode
  onDisplayModeChange?: (mode: DiffViewDisplayMode) => void
}

type Translate = (
  key: TranslationKey,
  values?: Record<string, string | number>,
) => string

function formatTimeSince(date: Date, t: Translate): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return t("changes.diff.justNow")
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return t("changes.diff.minutesAgo", { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t("changes.diff.hoursAgo", { count: hours })
  const days = Math.floor(hours / 24)
  return t("changes.diff.daysAgo", { count: days })
}

export const DiffSidebarHeader = memo(function DiffSidebarHeader({
  worktreePath,
  currentBranch,
  diffStats,
  sidebarWidth = 800,
  pushCount = 0,
  pullCount = 0,
  hasUpstream = true,
  isSyncStatusLoading = false,
  aheadOfDefault = 0,
  behindDefault = 0,
  onReview,
  isReviewing = false,
  onCreatePr,
  isCreatingPr = false,
  onCreatePrWithAI,
  isCreatingPrWithAI = false,
  onMergePr,
  isMergingPr = false,
  onClose,
  onRefresh,
  hasPrNumber = false,
  isPrOpen = false,
  hasMergeConflicts = false,
  onFixConflicts,
  onExpandAll,
  onCollapseAll,
  viewMode = "unified",
  onViewModeChange,
  viewedCount = 0,
  onMarkAllViewed,
  onMarkAllUnviewed,
  isDesktop = false,
  isFullscreen = false,
  displayMode = "details-expanded",
  onDisplayModeChange,
}: DiffSidebarHeaderProps) {
  const { t } = useI18n()
  // Responsive breakpoints - progressive disclosure
  const isCompact = sidebarWidth < 350
  const showViewModeToggle = sidebarWidth >= 450 // Show Split/Unified toggle
  const showReviewButton = sidebarWidth >= 550 // Show Review button

  const [lastFetchTime, setLastFetchTime] = useState<Date | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [displayTime, setDisplayTime] = useState<string>("")
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const { data: branchData, refetch: refetchBranches } =
    trpc.changes.getBranches.useQuery(
      { worktreePath },
      { enabled: !!worktreePath },
    )

  // Check if current branch is the default branch (main/master)
  const isDefaultBranch = currentBranch === branchData?.defaultBranch

  const fetchMutation = trpc.changes.fetch.useMutation({
    onSuccess: () => {
      setLastFetchTime(new Date())
      refetchBranches()
      onRefresh?.()
    },
  })

  const { push: pushBranch, isPending: isPushPending } = usePushAction({
    worktreePath,
    hasUpstream,
    onSuccess: onRefresh,
  })

  const pullMutation = trpc.changes.pull.useMutation({
    onSuccess: () => {
      onRefresh?.()
    },
    onError: (error) =>
      toast.error(t("changes.diff.pullFailed", { message: error.message })),
  })

  const forcePushMutation = trpc.changes.forcePush.useMutation({
    onSuccess: () => {
      onRefresh?.()
    },
    onError: (error: { message: string }) =>
      toast.error(
        t("changes.diff.forcePushFailed", { message: error.message }),
      ),
  })

  const mergeFromDefaultMutation = trpc.changes.mergeFromDefault.useMutation({
    onSuccess: () => {
      onRefresh?.()
    },
    onError: (error: { message: string }) =>
      toast.error(t("changes.diff.mergeFailed", { message: error.message })),
  })

  const { pr } = usePRStatus({
    worktreePath,
    refetchInterval: 30000,
  })

  // Update display time every minute
  useEffect(() => {
    if (!lastFetchTime) return

    const updateTime = () => {
      setDisplayTime(formatTimeSince(lastFetchTime, t))
    }

    updateTime()
    const interval = setInterval(updateTime, 60000)
    return () => clearInterval(interval)
  }, [lastFetchTime, t])

  const handleFetch = () => {
    setIsRefreshing(true)
    fetchMutation.mutate(
      { worktreePath },
      {
        onSettled: () => {
          if (timeoutRef.current) clearTimeout(timeoutRef.current)
          timeoutRef.current = setTimeout(() => setIsRefreshing(false), 600)
        },
      },
    )
  }

  const handlePush = () => {
    pushBranch()
  }

  const handlePull = () => {
    pullMutation.mutate({ worktreePath, autoStash: true })
  }

  const handleForcePush = () => {
    if (window.confirm(t("changes.diff.forcePushConfirm"))) {
      forcePushMutation.mutate({ worktreePath })
    }
  }

  const handleMergeFromDefault = (useRebase = false) => {
    mergeFromDefaultMutation.mutate({ worktreePath, useRebase })
  }

  const handleOpenPR = () => {
    if (pr?.url) {
      window.open(pr.url, "_blank")
    }
  }

  const handleCopyPRLink = () => {
    if (pr?.url) {
      navigator.clipboard.writeText(pr.url)
    }
  }

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  // Check pending states
  const isPullPending = pullMutation.isPending
  const isFetchPending = isRefreshing || fetchMutation.isPending
  const syncActionKind = getSyncActionKind({
    hasUpstream,
    pullCount,
    pushCount,
    isSyncStatusLoading,
  })

  // ============ NEW BUTTON LOGIC ============
  // Priority:
  // 1. !hasUpstream → Publish Branch
  // 2. pushCount > 0 → Push (with pullCount > 0 showing Pull first)
  // 3. pullCount > 0 → Pull
  // 4. hasPR → Open PR
  // 5. hasUpstream && !hasPR → Create PR (secondary) or Fetch (primary)
  // 6. Default → Fetch

  interface ActionButton {
    kind:
      | "loading"
      | "publish"
      | "pull"
      | "push"
      | "open-pr"
      | "create-pr"
      | "fetch"
      | "fetching"
    label: string
    pendingLabel?: string
    icon: React.ReactNode
    handler: () => void
    tooltip: string
    badge?: string
    variant?: "default" | "ghost" | "outline"
    isPending?: boolean
    disabled?: boolean
  }

  const getPrimaryAction = (): ActionButton => {
    // 0. Loading state - show loading indicator
    if (syncActionKind === "loading") {
      return {
        kind: "loading",
        label: "",
        pendingLabel: "",
        icon: <IconFetch className="size-3.5" />,
        handler: () => {},
        tooltip: t("changes.diff.loadingSync"),
        variant: "ghost",
        isPending: true,
        disabled: true,
      }
    }

    // 1. Branch not published - must publish first
    if (syncActionKind === "publish") {
      return {
        kind: "publish",
        label: t("changes.diff.publish"),
        pendingLabel: t("changes.diff.publishing"),
        icon: <Upload className="size-3.5" />,
        handler: handlePush,
        tooltip: t("changes.diff.publishTooltip"),
        variant: "default",
        isPending: isPushPending,
      }
    }

    // 2. Remote has changes we need to pull first
    if (syncActionKind === "pull") {
      return {
        kind: "pull",
        label: t("changes.diff.pull"),
        pendingLabel: t("changes.diff.pulling"),
        icon: <ArrowDown className="size-3.5" />,
        handler: handlePull,
        tooltip: t("changes.diff.pullTooltip", {
          count: pullCount,
          plural: pullCount !== 1 ? "s" : "",
        }),
        badge: `↓${pullCount}`,
        variant: "default",
        isPending: isPullPending,
      }
    }

    // 3. We have commits to push
    if (syncActionKind === "push") {
      return {
        kind: "push",
        label: t("changes.diff.push"),
        pendingLabel: t("changes.diff.pushing"),
        icon: <ArrowUp className="size-3.5" />,
        handler: handlePush,
        tooltip: t("changes.diff.pushTooltip", {
          count: pushCount,
          plural: pushCount !== 1 ? "s" : "",
        }),
        badge: `↑${pushCount}`,
        variant: "default",
        isPending: isPushPending,
      }
    }

    // 4. PR exists - Open PR as primary
    if (pr) {
      return {
        kind: "open-pr",
        label: t("changes.diff.openPr"),
        icon: <ExternalLinkIcon className="size-3.5" />,
        handler: handleOpenPR,
        tooltip: t("changes.diff.openPrTooltip", { number: pr.number }),
        variant: "ghost",
      }
    }

    // 5. No PR, branch is synced - Create PR if ahead of default, otherwise Fetch
    if (hasUpstream && !pr) {
      // Show Create PR if we have commits ahead of default branch (not on default branch)
      if (aheadOfDefault > 0 && !isDefaultBranch && onCreatePr) {
        return {
          kind: "create-pr",
          label: t("changes.diff.createPr"),
          pendingLabel: t("changes.diff.creating"),
          icon: <GitPullRequest className="size-3.5" />,
          handler: onCreatePr,
          tooltip: t("changes.diff.createPrTooltip", {
            count: aheadOfDefault,
            plural: aheadOfDefault !== 1 ? "s" : "",
            branch: branchData?.defaultBranch || "main",
          }),
          badge: `↑${aheadOfDefault}`,
          variant: "default",
          isPending: isCreatingPr,
        }
      }
      // Otherwise show Fetch
      return {
        kind: "fetch",
        label: t("changes.diff.fetch"),
        pendingLabel: t("changes.diff.fetching"),
        icon: <IconFetch className="size-3.5" />,
        handler: handleFetch,
        tooltip: lastFetchTime
          ? t("changes.diff.lastFetched", { time: displayTime })
          : t("changes.diff.checkForUpdates"),
        variant: "ghost",
        isPending: isFetchPending,
      }
    }

    // 6. Fallback - Fetch
    return {
      kind: "fetch",
      label: t("changes.diff.fetch"),
      pendingLabel: t("changes.diff.fetching"),
      icon: <IconFetch className="size-3.5" />,
      handler: handleFetch,
      tooltip: t("changes.diff.checkForUpdates"),
      variant: "ghost",
      isPending: isFetchPending,
    }
  }

  const primaryAction = getPrimaryAction()

  // Override primary action when fetching from dropdown
  const displayAction: ActionButton =
    isFetchPending && !primaryAction.isPending
      ? {
          kind: "fetching",
          label: t("changes.diff.fetching"),
          pendingLabel: t("changes.diff.fetching"),
          icon: <IconFetch className="size-3.5" />,
          handler: () => {},
          tooltip: t("changes.diff.fetchingFromRemote"),
          variant: primaryAction.variant,
          isPending: true,
        }
      : primaryAction

  return (
    <div className="relative flex items-center justify-between h-10 px-2 border-b border-border/50 bg-background flex-shrink-0">
      {/* Drag region for window dragging */}
      {isDesktop && !isFullscreen && (
        <div
          className="absolute inset-0 z-0"
          style={{
            // @ts-expect-error - WebKit-specific property
            WebkitAppRegion: "drag",
          }}
        />
      )}
      {/* Left side: Close button + Branch selector */}
      <div
        className="relative z-10 flex items-center gap-1 min-w-0 flex-shrink"
        style={{
          // @ts-expect-error - WebKit-specific property
          WebkitAppRegion: "no-drag",
        }}
      >
        {/* Close button - sidebar close for Details, X for full-page */}
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 flex-shrink-0 hover:bg-foreground/10"
          onClick={onClose}
        >
          {displayMode === "details-expanded" ? (
            <IconCloseSidebarRight className="size-4 text-muted-foreground" />
          ) : (
            <X className="size-4 text-muted-foreground" />
          )}
        </Button>

        {/* Display mode switcher (Details expanded, full-page) */}
        {onDisplayModeChange && (
          <DiffViewModeSwitcher
            mode={displayMode}
            onModeChange={onDisplayModeChange}
          />
        )}

        {/* Branch name display (branch switching will be added later) */}
        <div className="h-6 px-2 gap-1 text-xs font-medium min-w-0 flex items-center">
          <LuGitBranch className="size-3.5 shrink-0 opacity-70" />
          <span className="truncate max-w-[120px] text-foreground">
            {currentBranch || t("changes.noBranch")}
          </span>
        </div>

        {/* PR Status badge */}
        {pr && (
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <a
                href={pr.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 h-6 px-2 rounded-md hover:bg-foreground/10 transition-colors"
              >
                <PRIcon state={pr.state} className="size-3.5" />
                <span className="text-xs text-muted-foreground font-mono">
                  #{pr.number}
                </span>
              </a>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onClick={handleOpenPR} className="text-xs">
                {t("changes.diff.openInBrowser")}
              </ContextMenuItem>
              <ContextMenuItem onClick={handleCopyPRLink} className="text-xs">
                {t("changes.diff.copyLink")}
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        )}
      </div>

      {/* Right side: Review + View mode toggle + Primary action (split button) + Secondary action + Overflow menu */}
      <div
        className="relative z-10 flex items-center gap-1 flex-shrink-0"
        style={{
          // @ts-expect-error - WebKit-specific property
          WebkitAppRegion: "no-drag",
        }}
      >
        {/* Review button - visible when there's enough space */}
        {showReviewButton && diffStats.hasChanges && onReview && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={onReview}
                disabled={isReviewing}
                className="h-6 px-2 gap-1 text-xs hover:bg-foreground/10"
              >
                {isReviewing ? (
                  <IconSpinner className="size-3.5" />
                ) : (
                  <IconReview className="size-3.5" />
                )}
                <span>{t("changes.diff.review")}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {t("changes.diff.reviewChangesWithAI")}
            </TooltipContent>
          </Tooltip>
        )}

        {/* Primary action button (solo when Fetch/Open PR, split when Push/Pull/Create PR) */}
        {displayAction.kind === "fetch" ||
        displayAction.kind === "fetching" ||
        displayAction.kind === "open-pr" ? (
          // Solo button - no dropdown (for Fetch and Open PR)
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={displayAction.handler}
                disabled={displayAction.isPending || displayAction.disabled}
                className={cn(
                  "inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors",
                  "outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/70",
                  "disabled:pointer-events-none disabled:opacity-50",
                  "h-6 px-2 gap-1 text-xs rounded-md focus:z-10 overflow-hidden",
                  "transition-all duration-200 ease-out",
                  displayAction.variant === "default"
                    ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_0_0.5px_rgb(23,23,23),inset_0_0_0_1px_rgba(255,255,255,0.14)] dark:shadow-[0_0_0_0.5px_rgb(23,23,23),inset_0_0_0_1px_rgba(0,0,0,0.14)]"
                    : "hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <span className="flex items-center gap-1 transition-opacity duration-150 min-w-0">
                  {displayAction.isPending ? (
                    <>
                      <IconSpinner className="size-3.5 ml-0.5 shrink-0" />
                      {displayAction.pendingLabel && (
                        <span className="mr-0.5 truncate">
                          {displayAction.pendingLabel}
                        </span>
                      )}
                      {displayAction.badge && (
                        <span className="text-[10px] bg-primary-foreground/20 px-1.5 py-0.5 rounded font-medium ml-1 shrink-0">
                          {displayAction.badge}
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="shrink-0">{displayAction.icon}</span>
                      {displayAction.label && (
                        <span className="truncate">{displayAction.label}</span>
                      )}
                      {displayAction.badge && (
                        <span className="text-[10px] bg-primary-foreground/20 px-1.5 py-0.5 rounded font-medium ml-1 shrink-0">
                          {displayAction.badge}
                        </span>
                      )}
                    </>
                  )}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {displayAction.tooltip}
            </TooltipContent>
          </Tooltip>
        ) : (
          // Split button with dropdown for Push/Pull/PR actions
          <div className="inline-flex -space-x-px rounded-md">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={displayAction.handler}
                  disabled={displayAction.isPending || displayAction.disabled}
                  className={cn(
                    "inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors",
                    "outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/70",
                    "disabled:pointer-events-none disabled:opacity-50",
                    "h-6 px-2 gap-1 text-xs rounded-l-md rounded-r-none focus:z-10 overflow-hidden",
                    "transition-all duration-200 ease-out",
                    displayAction.variant === "default"
                      ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_0_0.5px_rgb(23,23,23),inset_0_0_0_1px_rgba(255,255,255,0.14)] dark:shadow-[0_0_0_0.5px_rgb(23,23,23),inset_0_0_0_1px_rgba(0,0,0,0.14)]"
                      : "hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  <span className="flex items-center gap-1 transition-opacity duration-150 min-w-0">
                    {displayAction.isPending ? (
                      <>
                        <IconSpinner className="size-3.5 ml-0.5 shrink-0" />
                        {displayAction.pendingLabel && (
                          <span className="mr-0.5 truncate">
                            {displayAction.pendingLabel}
                          </span>
                        )}
                        {displayAction.badge && (
                          <span className="text-[10px] bg-primary-foreground/20 px-1.5 py-0.5 rounded font-medium ml-1 shrink-0">
                            {displayAction.badge}
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="shrink-0">{displayAction.icon}</span>
                        {displayAction.label && (
                          <span className="truncate">
                            {displayAction.label}
                          </span>
                        )}
                        {displayAction.badge && (
                          <span className="text-[10px] bg-primary-foreground/20 px-1.5 py-0.5 rounded font-medium ml-1 shrink-0">
                            {displayAction.badge}
                          </span>
                        )}
                      </>
                    )}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {displayAction.tooltip}
              </TooltipContent>
            </Tooltip>

            {/* Dropdown trigger for git operations */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant={
                    displayAction.variant === "default" ? "default" : "ghost"
                  }
                  size="sm"
                  disabled={displayAction.isPending}
                  className={cn(
                    "h-6 w-6 p-0 rounded-l-none rounded-r-md focus:z-10",
                    displayAction.variant === "ghost" &&
                      "hover:bg-accent hover:text-accent-foreground shadow-none",
                  )}
                  aria-label={t("changes.diff.moreGitOptions")}
                >
                  <HiChevronDown className="size-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {/* Fetch - available when primary action is NOT Fetch */}
                <DropdownMenuItem
                  onClick={handleFetch}
                  disabled={isFetchPending}
                  className="text-xs"
                >
                  <HiArrowPath
                    className={cn(
                      "mr-2 size-3.5",
                      isFetchPending && "animate-spin",
                    )}
                  />
                  <div className="flex-1">
                    <div>{t("changes.diff.fetchOrigin")}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {lastFetchTime
                        ? t("changes.diff.lastFetched", { time: displayTime })
                        : t("changes.diff.checkForUpdates")}
                    </div>
                  </div>
                </DropdownMenuItem>

                {/* Force Push - only when history diverged (remote has commits we don't have locally) */}
                {hasUpstream && pullCount > 0 && (
                  <DropdownMenuItem
                    onClick={handleForcePush}
                    disabled={forcePushMutation.isPending}
                    className="text-xs data-[highlighted]:bg-red-500/15 data-[highlighted]:text-red-400 [&_div]:data-[highlighted]:text-red-400/70"
                  >
                    <IconForcePush className="mr-2 size-3.5" />
                    <div className="flex-1">
                      <div>{t("changes.diff.forcePush")}</div>
                      <div className="text-[10px] text-muted-foreground/70">
                        {t("changes.diff.overwriteRemote")}
                      </div>
                    </div>
                  </DropdownMenuItem>
                )}

                {/* Merge/Rebase from default branch */}
                {!isDefaultBranch && hasUpstream && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => handleMergeFromDefault(false)}
                      disabled={
                        mergeFromDefaultMutation.isPending ||
                        behindDefault === 0
                      }
                      className="text-xs"
                    >
                      <GitMerge className="mr-2 size-3.5" />
                      <div className="flex-1">
                        <div>
                          {t("changes.diff.mergeFrom", {
                            branch: branchData?.defaultBranch || "main",
                          })}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {behindDefault > 0
                            ? t("changes.diff.commitsToMerge", {
                                count: behindDefault,
                                plural: behindDefault !== 1 ? "s" : "",
                              })
                            : t("changes.diff.alreadyUpToDate")}
                        </div>
                      </div>
                      {behindDefault > 0 && (
                        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-medium ml-2">
                          ↓{behindDefault}
                        </span>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleMergeFromDefault(true)}
                      disabled={
                        mergeFromDefaultMutation.isPending ||
                        behindDefault === 0
                      }
                      className="text-xs"
                    >
                      <GitMerge className="mr-2 size-3.5" />
                      <div className="flex-1">
                        <div>
                          {t("changes.diff.rebaseOn", {
                            branch: branchData?.defaultBranch || "main",
                          })}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {behindDefault > 0
                            ? t("changes.diff.replayOnTop", {
                                count: behindDefault,
                                plural: behindDefault !== 1 ? "s" : "",
                              })
                            : t("changes.diff.alreadyUpToDate")}
                        </div>
                      </div>
                      {behindDefault > 0 && (
                        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-medium ml-2">
                          ↓{behindDefault}
                        </span>
                      )}
                    </DropdownMenuItem>
                  </>
                )}

                {/* PR actions separator */}
                {((hasUpstream &&
                  !pr &&
                  onCreatePr &&
                  !isDefaultBranch &&
                  primaryAction.kind !== "create-pr") ||
                  (hasUpstream &&
                    !pr &&
                    onCreatePrWithAI &&
                    !isDefaultBranch) ||
                  pr ||
                  (hasPrNumber && isPrOpen && onMergePr)) && (
                  <DropdownMenuSeparator />
                )}

                {/* Create PR */}
                {hasUpstream &&
                  !pr &&
                  onCreatePr &&
                  !isDefaultBranch &&
                  primaryAction.kind !== "create-pr" && (
                    <DropdownMenuItem
                      onClick={onCreatePr}
                      disabled={isCreatingPr || aheadOfDefault === 0}
                      className="text-xs"
                    >
                      <GitPullRequest className="mr-2 size-3.5" />
                      <div className="flex-1">
                        <div>
                          {isCreatingPr
                            ? t("changes.diff.creating")
                            : t("changes.diff.createPullRequest")}
                        </div>
                        {aheadOfDefault === 0 && (
                          <div className="text-[10px] text-muted-foreground">
                            {t("changes.diff.noCommitsToMerge", {
                              branch: branchData?.defaultBranch || "main",
                            })}
                          </div>
                        )}
                      </div>
                      {aheadOfDefault > 0 && (
                        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-medium ml-2">
                          ↑{aheadOfDefault}
                        </span>
                      )}
                    </DropdownMenuItem>
                  )}

                {/* Create PR with AI */}
                {hasUpstream && !pr && onCreatePrWithAI && !isDefaultBranch && (
                  <DropdownMenuItem
                    onClick={onCreatePrWithAI}
                    disabled={isCreatingPrWithAI}
                    className="text-xs"
                  >
                    <GitPullRequest className="mr-2 size-3.5" />
                    <div className="flex-1">
                      <div>
                        {isCreatingPrWithAI
                          ? t("changes.diff.creating")
                          : t("changes.diff.createPrWithAI")}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {t("changes.diff.aiCreateAndPushPr")}
                      </div>
                    </div>
                  </DropdownMenuItem>
                )}

                {/* Open PR */}
                {pr && primaryAction.kind !== "open-pr" && (
                  <DropdownMenuItem onClick={handleOpenPR} className="text-xs">
                    <ExternalLinkIcon className="mr-2 size-3.5" />
                    <span>
                      {t("changes.diff.openPullRequest", { number: pr.number })}
                    </span>
                  </DropdownMenuItem>
                )}

                {/* Merge PR */}
                {hasPrNumber && isPrOpen && onMergePr && !hasMergeConflicts && (
                  <DropdownMenuItem
                    onClick={onMergePr}
                    disabled={isMergingPr}
                    className="text-xs"
                  >
                    <GitMerge className="mr-2 size-3.5" />
                    <span>
                      {isMergingPr
                        ? t("changes.diff.merging")
                        : t("changes.diff.mergePullRequest")}
                    </span>
                  </DropdownMenuItem>
                )}

                {/* Fix Conflicts */}
                {hasPrNumber &&
                  isPrOpen &&
                  hasMergeConflicts &&
                  onFixConflicts && (
                    <DropdownMenuItem
                      onClick={onFixConflicts}
                      className="text-xs text-yellow-600 dark:text-yellow-500"
                    >
                      <GitMerge className="mr-2 size-3.5" />
                      <span>{t("changes.diff.fixMergeConflicts")}</span>
                    </DropdownMenuItem>
                  )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* View mode toggle - visible when there's enough space */}
        {showViewModeToggle && onViewModeChange && (
          <div className="inline-flex rounded-md border border-input">
            <Button
              variant={viewMode === "split" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => onViewModeChange("split")}
              className={cn(
                "h-6 w-6 p-0 rounded-r-none border-0",
                viewMode !== "split" && "hover:bg-foreground/10",
              )}
              title={t("changes.diff.splitView")}
            >
              <Columns2 className="size-3.5" />
            </Button>
            <Button
              variant={viewMode === "unified" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => onViewModeChange("unified")}
              className={cn(
                "h-6 w-6 p-0 rounded-l-none border-0 border-l border-input",
                viewMode !== "unified" && "hover:bg-foreground/10",
              )}
              title={t("changes.diff.unifiedView")}
            >
              <Rows2 className="size-3.5" />
            </Button>
          </div>
        )}

        {/* Overflow menu (three dots) - view options, expand/collapse, hidden items */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 flex-shrink-0 hover:bg-foreground/10"
            >
              <MoreHorizontal className="size-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {/* Review - shown here when button is hidden */}
            {!showReviewButton && diffStats.hasChanges && onReview && (
              <DropdownMenuItem
                onClick={onReview}
                disabled={isReviewing}
                className="text-xs"
              >
                <IconReview className="mr-2 size-3.5" />
                <span>
                  {isReviewing
                    ? t("changes.diff.reviewing")
                    : t("changes.diff.reviewChanges")}
                </span>
              </DropdownMenuItem>
            )}

            {/* Separator only if we have hidden review above */}
            {!showReviewButton && diffStats.hasChanges && onReview && (
              <DropdownMenuSeparator />
            )}

            {/* Refresh diff view */}
            {onRefresh && (
              <DropdownMenuItem onClick={onRefresh} className="text-xs">
                <RefreshCw className="mr-2 size-3.5" />
                <span>{t("changes.diff.refreshDiffView")}</span>
              </DropdownMenuItem>
            )}

            {/* Separator after refresh if view mode submenu follows */}
            {onRefresh && !showViewModeToggle && onViewModeChange && (
              <DropdownMenuSeparator />
            )}

            {/* View mode submenu - only shown when toggle is hidden */}
            {!showViewModeToggle && onViewModeChange && (
              <>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="text-xs">
                    <Eye className="mr-2 size-3.5" />
                    <span>{t("changes.diff.view")}</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem
                      onClick={() => onViewModeChange("split")}
                      className={cn(
                        "text-xs",
                        viewMode === "split" && "bg-muted",
                      )}
                    >
                      <Columns2 className="mr-2 size-3.5" />
                      <span>{t("changes.diff.splitView")}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onViewModeChange("unified")}
                      className={cn(
                        "text-xs",
                        viewMode === "unified" && "bg-muted",
                      )}
                    >
                      <Rows2 className="mr-2 size-3.5" />
                      <span>{t("changes.diff.unifiedView")}</span>
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
              </>
            )}

            {/* Expand/Collapse all */}
            {onExpandAll && (
              <DropdownMenuItem onClick={onExpandAll} className="text-xs">
                <ChevronsUpDown className="mr-2 size-3.5" />
                <span>{t("changes.diff.expandAll")}</span>
              </DropdownMenuItem>
            )}
            {onCollapseAll && (
              <DropdownMenuItem onClick={onCollapseAll} className="text-xs">
                <ChevronsDownUp className="mr-2 size-3.5" />
                <span>{t("changes.diff.collapseAll")}</span>
              </DropdownMenuItem>
            )}

            {/* Mark all as viewed/unviewed */}
            {(onMarkAllViewed || onMarkAllUnviewed) &&
              (onExpandAll || onCollapseAll) && <DropdownMenuSeparator />}
            {onMarkAllViewed && (
              <DropdownMenuItem onClick={onMarkAllViewed} className="text-xs">
                <Check className="mr-2 size-3.5" />
                <span>{t("changes.diff.markAllViewed")}</span>
              </DropdownMenuItem>
            )}
            {onMarkAllUnviewed && viewedCount > 0 && (
              <DropdownMenuItem onClick={onMarkAllUnviewed} className="text-xs">
                <Square className="mr-2 size-3.5" />
                <span>{t("changes.diff.markAllUnviewed")}</span>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
})

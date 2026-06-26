// biome-ignore-all assist/source/organizeImports: Preserve legacy import grouping for this focused sidebar migration.
"use client"

import { memo, useState, useCallback, useEffect, useMemo } from "react"
import type { FormEvent } from "react"
import {
  ArrowRight,
  MessageSquare,
  SendHorizontal,
  TerminalSquare,
  UserPlus,
} from "lucide-react"
import { useAtomValue, useSetAtom } from "jotai"
import { toast } from "sonner"
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
import { parseGitHubRemoteUrl } from "../../../../shared/github-workflow-context"
import type {
  GitHubReviewCommentThread,
  GitHubTaskImportResult,
  GitHubWorkflowCheck,
  GitHubWorkflowUnavailableReason,
  GitHubWriteBackPullRequestTarget,
  GitHubWriteBackRequest,
  GitHubWriteBackRefreshHint,
} from "../../../../shared/github-workflow-context"
import {
  canSendGitHubReviewComments,
  getFailedGitHubChecks,
  getGitHubStatusMessageKey,
  getGitHubStatusTitleKey,
  shouldOfferGitHubAuthLogin,
  shouldShowNoFailedGitHubChecks,
  type GitHubWorkflowStatusUiReason,
} from "../../../../shared/github-workflow-ui-state"
import { EDITOR_ICONS } from "@/lib/editor-icons"
import { useI18n } from "@/lib/i18n"
import { pendingGitHubContextMessageAtom } from "../../agents/atoms"
import { useAgentSubChatStore } from "../../agents/stores/sub-chat-store"
import { useOpenDetailsWidget } from "../use-open-details-widget"
import {
  activeTerminalIdAtom,
  terminalsAtom,
} from "../../terminal/atoms"
import { GitHubWriteBackConfirmationDialog } from "../components/github-write-back-confirmation-dialog"

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

type PrState = "open" | "draft" | "merged" | "closed"
type ReviewDecision = "approved" | "changes_requested" | "pending"
type ImportedGitHubTask = Extract<GitHubTaskImportResult, { status: "found" }>
type GitHubTaskInlineError = {
  reason?: GitHubWorkflowUnavailableReason | "invalid_url"
  message: string
}
type FailedCheckLogInlineError = {
  checkKey: string
  message: string
}
type GitHubWriteBackInlineStatus = {
  kind: "success" | "error"
  message: string
  url?: string
}
type GitHubReviewThreadReplyInlineStatus = GitHubWriteBackInlineStatus & {
  threadKey: string
}

type ReviewCommentGroup = {
  path: string
  threads: GitHubReviewCommentThread[]
}

function getFailedCheckKey(check: GitHubWorkflowCheck): string {
  return `${check.name}:${check.runId ?? check.url ?? "unknown"}`
}

function groupReviewThreadsByPath(
  threads: GitHubReviewCommentThread[],
): ReviewCommentGroup[] {
  const groups = new Map<string, GitHubReviewCommentThread[]>()
  for (const thread of threads) {
    const path = thread.path || "Unknown file"
    groups.set(path, [...(groups.get(path) ?? []), thread])
  }

  return Array.from(groups.entries()).map(([path, groupedThreads]) => ({
    path,
    threads: groupedThreads,
  }))
}

function getReviewThreadKey(thread: GitHubReviewCommentThread): string {
  return thread.id ?? `${thread.path ?? "unknown"}:${thread.line ?? "unknown"}`
}

function getPrStateLabel(
  state: PrState,
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (state === "merged") return t("agent.pr.merged")
  if (state === "closed") return t("agent.pr.closed")
  if (state === "draft") return t("agent.pr.draft")
  return t("agent.pr.open")
}

function getReviewDecisionLabel(
  decision: ReviewDecision,
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (decision === "approved") return t("agent.pr.readyToMerge")
  if (decision === "changes_requested") return t("agent.pr.changesRequested")
  return t("githubWorkflow.prContext.reviewPending")
}

function getGitHubStatusTitle(
  reason: GitHubWorkflowStatusUiReason,
  t: ReturnType<typeof useI18n>["t"],
): string {
  return t(getGitHubStatusTitleKey(reason))
}

function getGitHubStatusMessage(
  reason: GitHubWorkflowStatusUiReason | undefined,
  t: ReturnType<typeof useI18n>["t"],
  options?: { branch?: string; fallback?: string },
): string {
  if (reason === "no_pr") {
    return t("githubWorkflow.status.noPrMessage", {
      branch: options?.branch || t("details.unknown"),
    })
  }
  if (reason && reason !== "github_unavailable") {
    return t(getGitHubStatusMessageKey(reason))
  }
  return options?.fallback || t(getGitHubStatusMessageKey(reason))
}

function GitHubInlineStatus({
  title,
  message,
  actionLabel,
  onAction,
  isActionPending,
}: {
  title: string
  message: string
  actionLabel?: string
  onAction?: () => void
  isActionPending?: boolean
}) {
  return (
    <div className="mt-1 border-l-2 border-border pl-2 min-w-0">
      <div className="text-xs font-medium text-foreground truncate">
        {title}
      </div>
      <div className="mt-0.5 whitespace-pre-line text-[11px] leading-4 text-muted-foreground">
        {message}
      </div>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          disabled={isActionPending}
          className="mt-1.5 inline-flex h-6 min-w-0 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-foreground hover:bg-accent hover:text-accent-foreground transition-colors disabled:pointer-events-none disabled:opacity-50"
        >
          <TerminalSquare className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{actionLabel}</span>
        </button>
      )}
    </div>
  )
}

function GitHubWriteBackInlineStatusMessage({
  status,
  openLabel,
  className = "mt-1.5 text-[11px] leading-4",
}: {
  status: GitHubWriteBackInlineStatus | null
  openLabel: string
  className?: string
}) {
  if (!status) return null

  const toneClass =
    status.kind === "error" ? "text-destructive" : "text-muted-foreground"

  return (
    <div className={`${className} ${toneClass}`}>
      {status.message}
      {status.url && (
        <button
          type="button"
          className="ml-2 font-medium text-foreground underline-offset-2 hover:underline"
          onClick={() => window.desktopApi.openExternal(status.url!)}
        >
          {openLabel}
        </button>
      )}
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
  const setPendingGitHubContextMessage = useSetAtom(pendingGitHubContextMessageAtom)
  const openDetailsWidget = useOpenDetailsWidget(chatId)
  const setAllTerminals = useSetAtom(terminalsAtom)
  const setActiveTerminalIds = useSetAtom(activeTerminalIdAtom)
  const [githubTaskUrl, setGithubTaskUrl] = useState("")
  const [importedGitHubTask, setImportedGitHubTask] =
    useState<ImportedGitHubTask | null>(null)
  const [githubTaskInlineError, setGithubTaskInlineError] =
    useState<GitHubTaskInlineError | null>(null)
  const [failedCheckLogError, setFailedCheckLogError] =
    useState<FailedCheckLogInlineError | null>(null)
  const [loadingFailedCheckKey, setLoadingFailedCheckKey] =
    useState<string | null>(null)
  const [isPrCommentDialogOpen, setIsPrCommentDialogOpen] = useState(false)
  const [prCommentInlineStatus, setPrCommentInlineStatus] =
    useState<GitHubWriteBackInlineStatus | null>(null)
  const [prCommentDialogError, setPrCommentDialogError] =
    useState<string | null>(null)
  const [selectedReviewReplyThread, setSelectedReviewReplyThread] =
    useState<GitHubReviewCommentThread | null>(null)
  const [isReviewReplyDialogOpen, setIsReviewReplyDialogOpen] = useState(false)
  const [reviewReplyInlineStatus, setReviewReplyInlineStatus] =
    useState<GitHubReviewThreadReplyInlineStatus | null>(null)
  const [reviewReplyDialogError, setReviewReplyDialogError] =
    useState<string | null>(null)
  const [isMarkReadyDialogOpen, setIsMarkReadyDialogOpen] = useState(false)
  const [markReadyInlineStatus, setMarkReadyInlineStatus] =
    useState<GitHubWriteBackInlineStatus | null>(null)
  const [markReadyDialogError, setMarkReadyDialogError] =
    useState<string | null>(null)
  const [isRequestReviewersDialogOpen, setIsRequestReviewersDialogOpen] =
    useState(false)
  const [requestReviewersInlineStatus, setRequestReviewersInlineStatus] =
    useState<GitHubWriteBackInlineStatus | null>(null)
  const [requestReviewersDialogError, setRequestReviewersDialogError] =
    useState<string | null>(null)
  // Extract folder name from path
  const folderName = worktreePath?.split("/").pop() || t("details.unknown")

  // Preferred editor from settings
  const preferredEditor = useAtomValue(preferredEditorAtom)
  const editorMeta = APP_META[preferredEditor]

  // Mutations
  const utils = trpc.useUtils()
  const openInFinderMutation = trpc.external.openInFinder.useMutation()
  const openInAppMutation = trpc.external.openInApp.useMutation()
  const runGhAuthLoginMutation = trpc.terminal.createOrAttach.useMutation()
  const postPullRequestCommentMutation =
    trpc.githubWorkflow.postPullRequestComment.useMutation()
  const replyToReviewThreadMutation =
    trpc.githubWorkflow.replyToReviewThread.useMutation()
  const markReadyForReviewMutation =
    trpc.githubWorkflow.markReadyForReview.useMutation()
  const requestReviewersMutation =
    trpc.githubWorkflow.requestReviewers.useMutation()
  const failedCheckLogMutation = trpc.githubWorkflow.getFailedCheckLog.useMutation({
    onSettled: () => {
      setLoadingFailedCheckKey(null)
    },
  })
  const importGitHubTaskMutation = trpc.githubWorkflow.importTaskFromUrl.useMutation({
    onSuccess: (result) => {
      if (result.status === "found") {
        setImportedGitHubTask(result)
        setGithubTaskInlineError(null)
        toast.success(t("githubWorkflow.taskImport.loaded"), {
          position: "top-center",
        })
        return
      }

      setImportedGitHubTask(null)
      setGithubTaskInlineError({
        reason: result.reason,
        message: getGitHubStatusMessage(result.reason, t, {
          fallback: result.message,
        }),
      })
      toast.error(result.message, { position: "top-center" })
    },
    onError: (error) => {
      setImportedGitHubTask(null)
      setGithubTaskInlineError({
        reason: "github_unavailable",
        message: error.message || t("githubWorkflow.taskImport.failed"),
      })
      toast.error(error.message || t("githubWorkflow.taskImport.failed"), {
        position: "top-center",
      })
    },
  })

  // Fetch branch data directly for local chats
  const { data: branchData, isLoading: isBranchLoading } = trpc.changes.getBranches.useQuery(
    { worktreePath: worktreePath || "" },
    { enabled: !!worktreePath }
  )

  // Get read-only PR context for current branch.
  const { data: currentPrContext } = trpc.githubWorkflow.getCurrentPullRequestContext.useQuery(
    { chatId },
    {
      refetchInterval: 30000, // Poll every 30 seconds
      enabled: !!chatId && !!worktreePath,
    }
  )

  const { data: reviewCommentsResult, isFetching: isFetchingReviewComments } =
    trpc.githubWorkflow.getReviewCommentsContext.useQuery(
      { chatId },
      {
        enabled:
          !!chatId &&
          !!worktreePath &&
          currentPrContext?.status === "found",
        refetchInterval: 60000,
      },
    )

  const prContext = currentPrContext?.status === "found" ? currentPrContext.context : null
  const pr = prContext?.pr
  const githubWriteBackTarget = useMemo<GitHubWriteBackPullRequestTarget | null>(() => {
    if (!prContext || !pr) return null
    const repo = parseGitHubRemoteUrl(prContext.repoUrl)
    if (!repo) return null

    return {
      repoSlug: repo.repoSlug,
      repoUrl: repo.repoUrl,
      branch: prContext.branch,
      pr: {
        number: pr.number,
        title: pr.title,
        url: pr.url,
        state: pr.state,
      },
    }
  }, [pr, prContext])
  const failedChecks = getFailedGitHubChecks(pr?.checks)
  const reviewCommentsContext =
    reviewCommentsResult?.status === "found" ? reviewCommentsResult.context : null
  const reviewThreadGroups = useMemo(
    () => groupReviewThreadsByPath(reviewCommentsContext?.threads ?? []),
    [reviewCommentsContext?.threads],
  )
  const branchName =
    branchData?.current ||
    (currentPrContext?.status === "found"
      ? currentPrContext.context.branch
      : currentPrContext?.status === "no_pr" ||
          currentPrContext?.status === "unavailable"
        ? currentPrContext.branch
        : undefined)
  const isWorktree = !!worktreePath && worktreePath.includes(".21st/worktrees")
  const terminalScopeKey = useMemo(() => {
    if (!worktreePath) return `ws:${chatId}`
    return isWorktree ? `ws:${chatId}` : `path:${worktreePath}`
  }, [chatId, isWorktree, worktreePath])
  const githubStatusBlock =
    currentPrContext?.status === "unavailable"
      ? {
          reason: currentPrContext.reason,
          title: getGitHubStatusTitle(currentPrContext.reason, t),
          message: getGitHubStatusMessage(currentPrContext.reason, t, {
            branch: currentPrContext.branch,
            fallback: currentPrContext.message,
          }),
        }
      : currentPrContext?.status === "no_pr"
        ? {
            reason: "no_pr" as const,
            title: getGitHubStatusTitle("no_pr", t),
            message: getGitHubStatusMessage("no_pr", t, {
              branch: currentPrContext.branch,
            }),
          }
        : null

  const sendContextToCurrentAgent = useCallback((message: string, successMessage: string) => {
    const store = useAgentSubChatStore.getState()
    const activeSubChatId = store.activeSubChatId
    if (!activeSubChatId) {
      toast.error(t("githubWorkflow.prContext.noActiveChat"), {
        position: "top-center",
      })
      return
    }

    store.addToOpenSubChats(activeSubChatId)
    store.setActiveSubChat(activeSubChatId)
    setPendingGitHubContextMessage({
      subChatId: activeSubChatId,
      message,
    })
    toast.success(successMessage, { position: "top-center" })
  }, [setPendingGitHubContextMessage, t])

  const handleSendPrContext = useCallback(() => {
    if (currentPrContext?.status !== "found") return

    sendContextToCurrentAgent(
      currentPrContext.contextText,
      t("githubWorkflow.prContext.sentToAgent"),
    )
  }, [currentPrContext, sendContextToCurrentAgent, t])

  const handleSendFailedCheckLog = useCallback((check: GitHubWorkflowCheck) => {
    const checkKey = getFailedCheckKey(check)
    setLoadingFailedCheckKey(checkKey)
    setFailedCheckLogError(null)
    failedCheckLogMutation.mutate(
      {
        chatId,
        checkName: check.name,
        runId: check.runId,
      },
      {
        onSuccess: (result) => {
          if (result.status === "found") {
            sendContextToCurrentAgent(
              result.contextText,
              t("githubWorkflow.prContext.failedLogSent"),
            )
            return
          }

          setFailedCheckLogError({
            checkKey,
            message: result.message,
          })
          toast.error(result.message, { position: "top-center" })
        },
        onError: (error) => {
          const message =
            error.message || t("githubWorkflow.prContext.failedLogUnavailable")
          setFailedCheckLogError({ checkKey, message })
          toast.error(message, { position: "top-center" })
        },
      },
    )
  }, [chatId, failedCheckLogMutation, sendContextToCurrentAgent, t])

  const handleSendReviewComments = useCallback(() => {
    if (reviewCommentsResult?.status !== "found") return

    sendContextToCurrentAgent(
      reviewCommentsResult.contextText,
      t("githubWorkflow.reviewComments.sentToAgent"),
    )
  }, [reviewCommentsResult, sendContextToCurrentAgent, t])

  const handleOpenPrCommentDialog = useCallback(() => {
    setPrCommentDialogError(null)
    setIsPrCommentDialogOpen(true)
  }, [])

  const refreshGitHubWriteBackQueries = useCallback(
    (refreshHints: GitHubWriteBackRefreshHint[]) => {
      if (refreshHints.includes("current_pr")) {
        utils.githubWorkflow.getCurrentPullRequestContext.invalidate({ chatId })
      }
      if (refreshHints.includes("review_comments")) {
        utils.githubWorkflow.getReviewCommentsContext.invalidate({ chatId })
      }
      if (refreshHints.includes("github_status")) {
        utils.githubWorkflow.getStatus.invalidate({ chatId })
      }
    },
    [chatId, utils],
  )

  const handleConfirmPrComment = useCallback((request: GitHubWriteBackRequest) => {
    if (request.action !== "pr_comment") return

    setPrCommentDialogError(null)
    setPrCommentInlineStatus(null)
    postPullRequestCommentMutation.mutate(
      {
        chatId,
        confirmed: request.confirmed,
        prNumber: request.prNumber,
        body: request.body,
      },
      {
        onSuccess: (result) => {
          if (result.status === "completed") {
            setIsPrCommentDialogOpen(false)
            setPrCommentInlineStatus({
              kind: "success",
              message: t("githubWorkflow.writeBack.success.prComment"),
              url: result.url,
            })
            toast.success(t("githubWorkflow.writeBack.success.prComment"), {
              position: "top-center",
            })
            refreshGitHubWriteBackQueries(result.refreshHints)
            return
          }

          setPrCommentDialogError(result.message)
          setPrCommentInlineStatus({
            kind: "error",
            message: result.message,
          })
          toast.error(result.message, { position: "top-center" })
        },
        onError: (error) => {
          const message =
            error.message || t("githubWorkflow.writeBack.failed")
          setPrCommentDialogError(message)
          setPrCommentInlineStatus({
            kind: "error",
            message,
          })
          toast.error(message, { position: "top-center" })
        },
      },
    )
  }, [chatId, postPullRequestCommentMutation, refreshGitHubWriteBackQueries, t])

  const handleOpenReviewReplyDialog = useCallback(
    (thread: GitHubReviewCommentThread) => {
      setSelectedReviewReplyThread(thread)
      setReviewReplyDialogError(null)
      setIsReviewReplyDialogOpen(true)
    },
    [],
  )

  const handleConfirmReviewThreadReply = useCallback((request: GitHubWriteBackRequest) => {
    if (request.action !== "review_thread_reply") return

    const threadKey = selectedReviewReplyThread
      ? getReviewThreadKey(selectedReviewReplyThread)
      : request.threadId
    setReviewReplyDialogError(null)
    setReviewReplyInlineStatus(null)
    replyToReviewThreadMutation.mutate(
      {
        chatId,
        confirmed: request.confirmed,
        prNumber: request.prNumber,
        threadId: request.threadId,
        body: request.body,
      },
      {
        onSuccess: (result) => {
          if (result.status === "completed") {
            setIsReviewReplyDialogOpen(false)
            setReviewReplyInlineStatus({
              threadKey,
              kind: "success",
              message: t("githubWorkflow.writeBack.success.reviewThreadReply"),
              url: result.url,
            })
            toast.success(
              t("githubWorkflow.writeBack.success.reviewThreadReply"),
              { position: "top-center" },
            )
            refreshGitHubWriteBackQueries(result.refreshHints)
            return
          }

          setReviewReplyDialogError(result.message)
          setReviewReplyInlineStatus({
            threadKey,
            kind: "error",
            message: result.message,
          })
          toast.error(result.message, { position: "top-center" })
        },
        onError: (error) => {
          const message =
            error.message || t("githubWorkflow.writeBack.failed")
          setReviewReplyDialogError(message)
          setReviewReplyInlineStatus({
            threadKey,
            kind: "error",
            message,
          })
          toast.error(message, { position: "top-center" })
        },
      },
    )
  }, [
    chatId,
    refreshGitHubWriteBackQueries,
    replyToReviewThreadMutation,
    selectedReviewReplyThread,
    t,
  ])

  const handleOpenMarkReadyDialog = useCallback(() => {
    setMarkReadyDialogError(null)
    setIsMarkReadyDialogOpen(true)
  }, [])

  const handleConfirmMarkReady = useCallback((request: GitHubWriteBackRequest) => {
    if (request.action !== "mark_ready_for_review") return

    setMarkReadyDialogError(null)
    setMarkReadyInlineStatus(null)
    markReadyForReviewMutation.mutate(
      {
        chatId,
        confirmed: request.confirmed,
        prNumber: request.prNumber,
      },
      {
        onSuccess: (result) => {
          if (result.status === "completed") {
            setIsMarkReadyDialogOpen(false)
            setMarkReadyInlineStatus({
              kind: "success",
              message: t("githubWorkflow.writeBack.success.markReady"),
              url: result.url,
            })
            toast.success(t("githubWorkflow.writeBack.success.markReady"), {
              position: "top-center",
            })
            refreshGitHubWriteBackQueries(result.refreshHints)
            return
          }

          setMarkReadyDialogError(result.message)
          setMarkReadyInlineStatus({
            kind: "error",
            message: result.message,
          })
          toast.error(result.message, { position: "top-center" })
        },
        onError: (error) => {
          const message =
            error.message || t("githubWorkflow.writeBack.failed")
          setMarkReadyDialogError(message)
          setMarkReadyInlineStatus({
            kind: "error",
            message,
          })
          toast.error(message, { position: "top-center" })
        },
      },
    )
  }, [
    chatId,
    markReadyForReviewMutation,
    refreshGitHubWriteBackQueries,
    t,
  ])

  const handleOpenRequestReviewersDialog = useCallback(() => {
    setRequestReviewersDialogError(null)
    setIsRequestReviewersDialogOpen(true)
  }, [])

  const handleConfirmRequestReviewers = useCallback((request: GitHubWriteBackRequest) => {
    if (request.action !== "request_reviewers") return

    setRequestReviewersDialogError(null)
    setRequestReviewersInlineStatus(null)
    requestReviewersMutation.mutate(
      {
        chatId,
        confirmed: request.confirmed,
        prNumber: request.prNumber,
        reviewers: request.reviewers,
      },
      {
        onSuccess: (result) => {
          if (result.status === "completed") {
            setIsRequestReviewersDialogOpen(false)
            setRequestReviewersInlineStatus({
              kind: "success",
              message: t("githubWorkflow.writeBack.success.requestReviewers"),
              url: result.url,
            })
            toast.success(
              t("githubWorkflow.writeBack.success.requestReviewers"),
              { position: "top-center" },
            )
            refreshGitHubWriteBackQueries(result.refreshHints)
            return
          }

          setRequestReviewersDialogError(result.message)
          setRequestReviewersInlineStatus({
            kind: "error",
            message: result.message,
          })
          toast.error(result.message, { position: "top-center" })
        },
        onError: (error) => {
          const message =
            error.message || t("githubWorkflow.writeBack.failed")
          setRequestReviewersDialogError(message)
          setRequestReviewersInlineStatus({
            kind: "error",
            message,
          })
          toast.error(message, { position: "top-center" })
        },
      },
    )
  }, [
    chatId,
    refreshGitHubWriteBackQueries,
    requestReviewersMutation,
    t,
  ])

  const handleRunGhAuthLogin = useCallback(() => {
    if (!worktreePath) return

    const terminalId = `github-auth-${Date.now().toString(36)}`
    const paneId = `${terminalScopeKey}:term:${terminalId}`

    setAllTerminals((prev) => ({
      ...prev,
      [terminalScopeKey]: [
        ...(prev[terminalScopeKey] || []),
        {
          id: terminalId,
          paneId,
          name: "GitHub Auth",
          createdAt: Date.now(),
        },
      ],
    }))
    setActiveTerminalIds((prev) => ({
      ...prev,
      [terminalScopeKey]: terminalId,
    }))
    openDetailsWidget("terminal")

    runGhAuthLoginMutation.mutate(
      {
        paneId,
        workspaceId: chatId,
        scopeKey: terminalScopeKey,
        initialCommandIntents: ["github-cli-auth-login"],
      },
      {
        onSuccess: () => {
          toast.success(t("githubWorkflow.status.authTerminalStarted"), {
            position: "top-center",
          })
        },
        onError: (error) => {
          toast.error(error.message, { position: "top-center" })
        },
      },
    )
  }, [
    chatId,
    runGhAuthLoginMutation,
    setActiveTerminalIds,
    setAllTerminals,
    openDetailsWidget,
    t,
    terminalScopeKey,
    worktreePath,
  ])

  const handleImportGitHubTask = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedUrl = githubTaskUrl.trim()
    if (!trimmedUrl) return
    setGithubTaskInlineError(null)
    importGitHubTaskMutation.mutate({ chatId, url: trimmedUrl })
  }, [chatId, githubTaskUrl, importGitHubTaskMutation])

  const handleSendImportedGitHubTask = useCallback(() => {
    if (!importedGitHubTask) return
    sendContextToCurrentAgent(
      importedGitHubTask.contextText,
      t("githubWorkflow.taskImport.sentToAgent"),
    )
  }, [importedGitHubTask, sendContextToCurrentAgent, t])

  const handleOpenImportedGitHubTask = useCallback(() => {
    if (importedGitHubTask?.task.url) {
      window.desktopApi.openExternal(importedGitHubTask.task.url)
    }
  }, [importedGitHubTask])

  const handleOpenFolder = () => {
    if (worktreePath) {
      openInFinderMutation.mutate(worktreePath)
    }
  }

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
      {githubStatusBlock && (
        <div className="mt-1 border-t border-border/40 pt-2 pb-1">
          <div className="flex items-start gap-2 min-w-0">
            <GitPullRequestFilledIcon className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <GitHubInlineStatus
                title={githubStatusBlock.title}
                message={githubStatusBlock.message}
                actionLabel={
                  shouldOfferGitHubAuthLogin(githubStatusBlock.reason)
                    ? t("githubWorkflow.status.runGhAuthLogin")
                    : undefined
                }
                onAction={
                  shouldOfferGitHubAuthLogin(githubStatusBlock.reason)
                    ? handleRunGhAuthLogin
                    : undefined
                }
                isActionPending={runGhAuthLoginMutation.isPending}
              />
            </div>
          </div>
        </div>
      )}
      {prContext && pr && (
        <div className="mt-1 border-t border-border/40 pt-2 pb-1">
          <div className="flex items-start gap-2 min-w-0">
            <GitPullRequestFilledIcon className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs font-medium text-foreground flex-shrink-0">
                  {t("githubWorkflow.prContext.prNumber", { number: pr.number })}
                </span>
                <span className="text-xs text-muted-foreground truncate">
                  {pr.title}
                </span>
              </div>
              <div className="mt-1 grid grid-cols-[52px_1fr] gap-x-2 gap-y-0.5 text-[11px] leading-4">
                <span className="text-muted-foreground">
                  {t("githubWorkflow.prContext.statusLabel")}
                </span>
                <span className="text-foreground truncate">
                  {getPrStateLabel(pr.state, t)}
                </span>
                <span className="text-muted-foreground">
                  {t("githubWorkflow.prContext.checksLabel")}
                </span>
                <span className="text-foreground truncate">
                  {t("githubWorkflow.prContext.checksSummary", {
                    passed: prContext.checksSummary.passed,
                    failed: prContext.checksSummary.failed,
                    pending: prContext.checksSummary.pending,
                  })}
                </span>
                <span className="text-muted-foreground">
                  {t("githubWorkflow.prContext.reviewLabel")}
                </span>
                <span className="text-foreground truncate">
                  {getReviewDecisionLabel(pr.reviewDecision, t)}
                </span>
              </div>
              {failedChecks.length > 0 && (
                <div className="mt-2 min-w-0">
                  <div className="text-[11px] font-medium text-foreground">
                    {t("githubWorkflow.prContext.failedChecks")}
                  </div>
                  <div className="mt-1 flex flex-col gap-1">
                    {failedChecks.map((check) => {
                      const checkKey = getFailedCheckKey(check)
                      const isLoading = loadingFailedCheckKey === checkKey

                      return (
                        <div key={checkKey} className="min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-destructive" />
                            <span
                              className="min-w-0 flex-1 truncate text-[11px] text-foreground"
                              title={check.workflowName ? `${check.workflowName}: ${check.name}` : check.name}
                            >
                              {check.name}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleSendFailedCheckLog(check)}
                              disabled={isLoading}
                              className="inline-flex h-5 flex-shrink-0 items-center gap-1 rounded-md px-1.5 text-[10px] font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors disabled:pointer-events-none disabled:opacity-50"
                            >
                              {isLoading ? (
                                <span className="h-2.5 w-2.5 animate-spin rounded-full border border-muted-foreground border-t-transparent" />
                              ) : (
                                <SendHorizontal className="h-2.5 w-2.5" />
                              )}
                              <span>{t("githubWorkflow.prContext.sendFailedLog")}</span>
                            </button>
                          </div>
                          {failedCheckLogError?.checkKey === checkKey && (
                            <div className="mt-0.5 pl-3 text-[11px] leading-4 text-destructive">
                              {failedCheckLogError.message}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              {shouldShowNoFailedGitHubChecks(
                prContext.checksSummary,
                failedChecks.length,
              ) && (
                <div className="mt-2 text-[11px] leading-4 text-muted-foreground">
                  {t("githubWorkflow.prContext.noFailedChecks")}
                </div>
              )}
              {reviewCommentsResult?.status === "found" && (
                <div className="mt-2 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] font-medium text-foreground">
                      {t("githubWorkflow.reviewComments.title")}
                    </div>
                    {canSendGitHubReviewComments(reviewCommentsContext) && (
                      <button
                        type="button"
                        onClick={handleSendReviewComments}
                        className="inline-flex h-5 flex-shrink-0 items-center gap-1 rounded-md px-1.5 text-[10px] font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                      >
                        <SendHorizontal className="h-2.5 w-2.5" />
                        <span>{t("githubWorkflow.reviewComments.sendToAgent")}</span>
                      </button>
                    )}
                  </div>
                  {reviewCommentsContext?.threads.length === 0 ? (
                    <div className="mt-1 text-[11px] leading-4 text-muted-foreground">
                      {reviewCommentsContext.totalThreads > 0
                        ? t("githubWorkflow.reviewComments.noUnresolved")
                        : t("githubWorkflow.reviewComments.none")}
                    </div>
                  ) : (
                    <div className="mt-1 flex flex-col gap-1">
                      {reviewThreadGroups.slice(0, 4).map((group) => {
                        const firstThread = group.threads[0]
                        const firstComment = firstThread?.comments[0]
                        const firstThreadKey = firstThread
                          ? getReviewThreadKey(firstThread)
                          : group.path
                        const threadReplyStatus =
                          reviewReplyInlineStatus?.threadKey === firstThreadKey
                            ? reviewReplyInlineStatus
                            : null

                        return (
                          <div key={group.path} className="min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-500" />
                              <span className="min-w-0 flex-1 truncate text-[11px] text-foreground" title={group.path}>
                                {group.path}
                              </span>
                              <span className="flex-shrink-0 text-[10px] text-muted-foreground">
                                {t("githubWorkflow.reviewComments.threadCount", {
                                  count: group.threads.length,
                                })}
                              </span>
                              {firstThread && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleOpenReviewReplyDialog(firstThread)}
                                  disabled={replyToReviewThreadMutation.isPending}
                                  className="inline-flex h-5 flex-shrink-0 items-center gap-1 rounded-md px-1.5 text-[10px] font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors disabled:pointer-events-none disabled:opacity-50"
                                >
                                  <MessageSquare className="h-2.5 w-2.5" />
                                  <span>
                                    {t(
                                      "githubWorkflow.writeBack.confirmButton.reviewThreadReply",
                                    )}
                                  </span>
                                </button>
                              )}
                            </div>
                            {firstComment?.body && (
                              <div className="mt-0.5 truncate pl-3 text-[11px] leading-4 text-muted-foreground">
                                {firstComment.authorLogin
                                  ? `${firstComment.authorLogin}: ${firstComment.body}`
                                  : firstComment.body}
                              </div>
                            )}
                            <GitHubWriteBackInlineStatusMessage
                              status={threadReplyStatus}
                              openLabel={t("githubWorkflow.prContext.openInBrowser")}
                              className="mt-0.5 pl-3 text-[11px] leading-4"
                            />
                          </div>
                        )
                      })}
                      {reviewThreadGroups.length > 4 && (
                        <div className="text-[11px] leading-4 text-muted-foreground">
                          {t("githubWorkflow.reviewComments.moreFiles", {
                            count: reviewThreadGroups.length - 4,
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {isFetchingReviewComments && !reviewCommentsResult && (
                <div className="mt-2 text-[11px] leading-4 text-muted-foreground">
                  {t("githubWorkflow.reviewComments.loading")}
                </div>
              )}
              {reviewCommentsResult?.status === "unavailable" &&
                reviewCommentsResult.reason !== "no_pr" && (
                  <div className="mt-2 text-[11px] leading-4 text-muted-foreground">
                    {reviewCommentsResult.message}
                  </div>
                )}
              <div className="mt-2 flex items-center gap-1.5 min-w-0">
                {pr.state === "draft" && (
                  <button
                    type="button"
                    onClick={handleOpenMarkReadyDialog}
                    className="inline-flex h-6 min-w-0 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-foreground hover:bg-accent hover:text-accent-foreground transition-colors disabled:pointer-events-none disabled:opacity-50"
                    disabled={markReadyForReviewMutation.isPending}
                  >
                    <GitPullRequestFilledIcon className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">
                      {t("githubWorkflow.writeBack.action.markReady")}
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleOpenPrCommentDialog}
                  className="inline-flex h-6 min-w-0 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-foreground hover:bg-accent hover:text-accent-foreground transition-colors disabled:pointer-events-none disabled:opacity-50"
                  disabled={postPullRequestCommentMutation.isPending}
                >
                  <MessageSquare className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">
                    {t("githubWorkflow.writeBack.action.prComment")}
                  </span>
                </button>
                {(pr.state === "open" || pr.state === "draft") && (
                  <button
                    type="button"
                    onClick={handleOpenRequestReviewersDialog}
                    className="inline-flex h-6 min-w-0 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-foreground hover:bg-accent hover:text-accent-foreground transition-colors disabled:pointer-events-none disabled:opacity-50"
                    disabled={requestReviewersMutation.isPending}
                  >
                    <UserPlus className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">
                      {t("githubWorkflow.writeBack.action.requestReviewers")}
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSendPrContext}
                  className="inline-flex h-6 min-w-0 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <SendHorizontal className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">
                    {t("githubWorkflow.prContext.sendToAgent")}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenPr}
                  className="inline-flex h-6 min-w-0 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <ExternalLinkIcon className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">
                    {t("githubWorkflow.prContext.openInBrowser")}
                  </span>
                </button>
              </div>
              <GitHubWriteBackInlineStatusMessage
                status={prCommentInlineStatus}
                openLabel={t("githubWorkflow.prContext.openInBrowser")}
              />
              <GitHubWriteBackInlineStatusMessage
                status={requestReviewersInlineStatus}
                openLabel={t("githubWorkflow.prContext.openInBrowser")}
              />
              <GitHubWriteBackInlineStatusMessage
                status={markReadyInlineStatus}
                openLabel={t("githubWorkflow.prContext.openInBrowser")}
              />
            </div>
          </div>
        </div>
      )}
      <div className="mt-1 border-t border-border/40 pt-2 pb-1">
        <div className="flex items-center gap-1.5">
          <GitPullRequestFilledIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <span className="text-xs font-medium text-foreground">
            {t("githubWorkflow.taskImport.title")}
          </span>
        </div>
        <form
          onSubmit={handleImportGitHubTask}
          className="mt-1.5 flex items-center gap-1.5 min-w-0"
        >
          <input
            type="text"
            value={githubTaskUrl}
            onChange={(event) => {
              setGithubTaskUrl(event.target.value)
              setGithubTaskInlineError(null)
            }}
            placeholder={t("githubWorkflow.taskImport.placeholder")}
            className="h-7 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring"
          />
          <button
            type="submit"
            disabled={!githubTaskUrl.trim() || importGitHubTaskMutation.isPending}
            className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
            aria-label={t("githubWorkflow.taskImport.load")}
          >
            {importGitHubTaskMutation.isPending ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border border-muted-foreground border-t-transparent" />
            ) : (
              <ArrowRight className="h-3.5 w-3.5" />
            )}
          </button>
        </form>
        {githubTaskInlineError && (
          <GitHubInlineStatus
            title={getGitHubStatusTitle(
              githubTaskInlineError.reason || "invalid_url",
              t,
            )}
            message={githubTaskInlineError.message}
            actionLabel={
              shouldOfferGitHubAuthLogin(githubTaskInlineError.reason)
                ? t("githubWorkflow.status.runGhAuthLogin")
                : undefined
            }
            onAction={
              shouldOfferGitHubAuthLogin(githubTaskInlineError.reason)
                ? handleRunGhAuthLogin
                : undefined
            }
            isActionPending={runGhAuthLoginMutation.isPending}
          />
        )}
        {importedGitHubTask && (
          <div className="mt-2 border-l-2 border-border pl-2 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs font-medium text-foreground flex-shrink-0">
                {importedGitHubTask.task.kind === "pull_request"
                  ? t("githubWorkflow.taskImport.pullRequestNumber", {
                      number: importedGitHubTask.task.number,
                    })
                  : t("githubWorkflow.taskImport.issueNumber", {
                      number: importedGitHubTask.task.number,
                    })}
              </span>
              <span className="text-xs text-muted-foreground truncate">
                {importedGitHubTask.task.title}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground truncate">
              {t("githubWorkflow.taskImport.meta", {
                state: importedGitHubTask.task.state,
                comments: importedGitHubTask.task.commentsCount,
              })}
            </div>
            {importedGitHubTask.task.labels.length > 0 && (
              <div className="mt-1 flex items-center gap-1 overflow-hidden">
                {importedGitHubTask.task.labels.slice(0, 3).map((label) => (
                  <span
                    key={label}
                    className="min-w-0 max-w-[88px] truncate rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    title={label}
                  >
                    {label}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-2 flex items-center gap-1.5 min-w-0">
              <button
                type="button"
                onClick={handleSendImportedGitHubTask}
                className="inline-flex h-6 min-w-0 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <SendHorizontal className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">
                  {t("githubWorkflow.taskImport.startCurrentAgent")}
                </span>
              </button>
              <button
                type="button"
                onClick={handleOpenImportedGitHubTask}
                className="inline-flex h-6 min-w-0 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <ExternalLinkIcon className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">
                  {t("githubWorkflow.prContext.openInBrowser")}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
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
      <GitHubWriteBackConfirmationDialog
        open={isPrCommentDialogOpen}
        onOpenChange={setIsPrCommentDialogOpen}
        action="pr_comment"
        target={githubWriteBackTarget}
        isSubmitting={postPullRequestCommentMutation.isPending}
        inlineError={prCommentDialogError}
        onConfirm={handleConfirmPrComment}
      />
      <GitHubWriteBackConfirmationDialog
        open={isReviewReplyDialogOpen}
        onOpenChange={(open) => {
          setIsReviewReplyDialogOpen(open)
          if (!open) {
            setSelectedReviewReplyThread(null)
            setReviewReplyDialogError(null)
          }
        }}
        action="review_thread_reply"
        target={githubWriteBackTarget}
        thread={selectedReviewReplyThread}
        isSubmitting={replyToReviewThreadMutation.isPending}
        inlineError={reviewReplyDialogError}
        onConfirm={handleConfirmReviewThreadReply}
      />
      <GitHubWriteBackConfirmationDialog
        open={isMarkReadyDialogOpen}
        onOpenChange={(open) => {
          setIsMarkReadyDialogOpen(open)
          if (!open) {
            setMarkReadyDialogError(null)
          }
        }}
        action="mark_ready_for_review"
        target={githubWriteBackTarget}
        isSubmitting={markReadyForReviewMutation.isPending}
        inlineError={markReadyDialogError}
        onConfirm={handleConfirmMarkReady}
      />
      <GitHubWriteBackConfirmationDialog
        open={isRequestReviewersDialogOpen}
        onOpenChange={(open) => {
          setIsRequestReviewersDialogOpen(open)
          if (!open) {
            setRequestReviewersDialogError(null)
          }
        }}
        action="request_reviewers"
        target={githubWriteBackTarget}
        isSubmitting={requestReviewersMutation.isPending}
        inlineError={requestReviewersDialogError}
        onConfirm={handleConfirmRequestReviewers}
      />
    </div>
  )
})

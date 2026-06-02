"use client"

import { useCallback, useMemo, useState } from "react"
import { useAtomValue, useSetAtom } from "jotai"
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  ExternalLink,
  FileDiff,
  FolderOpen,
  GitBranch,
  GitPullRequest,
  Loader2,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  ScrollText,
  Terminal,
  XCircle,
} from "lucide-react"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { Textarea } from "../../../components/ui/textarea"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../../components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../../components/ui/tooltip"
import { trpc } from "../../../lib/trpc"
import { useI18n, type TranslationKey } from "../../../lib/i18n"
import { cn } from "../../../lib/utils"
import type { GitHubDraftPullRequestUnavailableReason } from "../../../../shared/github-workflow-context"
import { getGitHubDraftPrUnavailableMessageKey } from "../../../../shared/github-workflow-ui-state"
import {
  desktopViewAtom,
  diffSidebarOpenAtomFamily,
  filteredDiffFilesAtom,
  filteredSubChatIdAtom,
  selectedAgentChatIdAtom,
  selectedDiffFilePathAtom,
  selectedDraftIdAtom,
  showNewChatFormAtom,
  pendingUserQuestionsAtom,
} from "../atoms"
import { useStreamingStatusStore } from "../stores/streaming-status-store"
import { useAgentSubChatStore } from "../stores/sub-chat-store"

type WorkbenchFilter = "all" | "running" | "needs-review" | "prs" | "blocked" | "clean"
type WorkbenchTaskStatus = "running" | "blocked" | "needs-review" | "has-pr" | "clean" | "archived"
type HeadlessJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "canceled"
  | "interrupted"

type WorkbenchTask = {
  id: string
  title: string
  project: {
    name: string
    path: string
    gitOwner: string | null
    gitRepo: string | null
  }
  worktreePath: string | null
  branch: string | null
  baseBranch: string | null
  localDirectoryMode: boolean
  latestSubChat: {
    id: string
    name: string | null
    mode: "plan" | "agent"
    updatedAt: Date | string | null
  } | null
  diff: {
    fileCount: number
    additions: number | null
    deletions: number | null
    error?: string
  }
  pr: {
    url: string | null
    number: number | null
  } | null
  status: WorkbenchTaskStatus
  statusReason: string | null
  updatedAt: Date | string | null
  actions: {
    canOpen: boolean
    canContinue: boolean
    canReviewDiff: boolean
    canOpenPr: boolean
    canCreatePr: boolean
  }
}

type HeadlessJob = {
  id: string
  retryOfJobId: string | null
  attempt: number
  source: string
  runtime: string
  status: HeadlessJobStatus
  mode: "plan" | "agent"
  cwd: string
  chatId: string | null
  subChatId: string | null
  promptPreview: string | null
  createdAt: Date | string | null
  startedAt: Date | string | null
  finishedAt: Date | string | null
  exitCode: number | null
  errorCode: string | null
  errorMessage: string | null
  result: unknown
  workerId: string | null
  workerPid: number | null
  heartbeatAt: Date | string | null
  cancelRequestedAt: Date | string | null
  cancelRequestedBy: string | null
}

type HeadlessJobEvent = {
  id: string
  jobId: string
  sequence: number
  type: string
  payload: unknown
  createdAt: Date | string | null
}

type DraftPrFormState = {
  title: string
  body: string
}

type DraftPrMetaState = {
  repoSlug: string
  branch: string
  baseBranch: string
  changedFileCount: number
  commitCount: number
}

const FILTERS: WorkbenchFilter[] = [
  "all",
  "running",
  "needs-review",
  "prs",
  "blocked",
  "clean",
]

type WorkbenchCounts = {
  all: number
  running: number
  needsReview: number
  prs: number
  blocked: number
  clean: number
}

function getStatusIcon(status: WorkbenchTaskStatus) {
  if (status === "running") return Loader2
  if (status === "blocked") return AlertCircle
  if (status === "needs-review") return FileDiff
  if (status === "has-pr") return GitPullRequest
  if (status === "clean") return CheckCircle2
  return Circle
}

function getStatusClassName(status: WorkbenchTaskStatus): string {
  if (status === "running") return "text-blue-500"
  if (status === "blocked") return "text-amber-500"
  if (status === "needs-review") return "text-purple-500"
  if (status === "has-pr") return "text-emerald-500"
  if (status === "clean") return "text-muted-foreground"
  return "text-muted-foreground"
}

function getHeadlessJobStatusIcon(status: HeadlessJobStatus) {
  if (status === "queued" || status === "running") return Loader2
  if (status === "succeeded") return CheckCircle2
  if (status === "failed" || status === "interrupted") return AlertCircle
  if (status === "canceled") return XCircle
  return Circle
}

function getHeadlessJobStatusClassName(status: HeadlessJobStatus): string {
  if (status === "queued" || status === "running") return "text-blue-500"
  if (status === "succeeded") return "text-emerald-500"
  if (status === "failed" || status === "interrupted") return "text-destructive"
  if (status === "canceled") return "text-muted-foreground"
  return "text-muted-foreground"
}

function isActiveHeadlessJob(job: HeadlessJob): boolean {
  return job.status === "queued" || job.status === "running"
}

function matchesHeadlessJobFilter(
  status: HeadlessJobStatus,
  filter: WorkbenchFilter,
): boolean {
  if (filter === "all") return true
  if (filter === "running") return status === "queued" || status === "running"
  if (filter === "blocked") return status === "failed" || status === "interrupted"
  if (filter === "clean") return status === "succeeded"
  return false
}

function getHeadlessJobCounts(jobs: HeadlessJob[]): WorkbenchCounts {
  return {
    all: jobs.length,
    running: jobs.filter((job) => matchesHeadlessJobFilter(job.status, "running"))
      .length,
    needsReview: 0,
    prs: 0,
    blocked: jobs.filter((job) => matchesHeadlessJobFilter(job.status, "blocked"))
      .length,
    clean: jobs.filter((job) => matchesHeadlessJobFilter(job.status, "clean"))
      .length,
  }
}

function mergeWorkbenchCounts(
  taskCounts: WorkbenchCounts | undefined,
  headlessCounts: WorkbenchCounts,
): WorkbenchCounts {
  return {
    all: (taskCounts?.all ?? 0) + headlessCounts.all,
    running: (taskCounts?.running ?? 0) + headlessCounts.running,
    needsReview: (taskCounts?.needsReview ?? 0) + headlessCounts.needsReview,
    prs: (taskCounts?.prs ?? 0) + headlessCounts.prs,
    blocked: (taskCounts?.blocked ?? 0) + headlessCounts.blocked,
    clean: (taskCounts?.clean ?? 0) + headlessCounts.clean,
  }
}

function getWorkbenchFilterCount(
  counts: WorkbenchCounts,
  filter: WorkbenchFilter,
): number {
  if (filter === "needs-review") return counts.needsReview
  return counts[filter]
}

function canRetryHeadlessJob(job: HeadlessJob): boolean {
  return (
    job.status === "failed" ||
    job.status === "canceled" ||
    job.status === "interrupted"
  )
}

function formatHeadlessRuntime(runtime: string): string {
  if (runtime === "claude-code") return "Claude Code"
  if (runtime === "codex") return "Codex"
  return runtime
}

function formatPayload(payload: unknown): string {
  if (payload === null || payload === undefined) return ""
  if (typeof payload === "string") return payload
  try {
    return JSON.stringify(payload, null, 2)
  } catch {
    return String(payload)
  }
}

function getReviewDisabledReason(task: WorkbenchTask, t: ReturnType<typeof useI18n>["t"]) {
  if (task.actions.canReviewDiff) return null
  if (!task.worktreePath) return t("workbench.noWorkspacePath")
  return t("workbench.noReviewableDiff")
}

function getPreparePrHint(task: WorkbenchTask, t: ReturnType<typeof useI18n>["t"]) {
  if (!task.worktreePath) return t("workbench.noWorkspacePath")
  if (!task.actions.canCreatePr) return t("workbench.preparePrUnavailable")
  return t("workbench.preparePrHint")
}

function getDraftPrUnavailableMessage(
  reason: GitHubDraftPullRequestUnavailableReason,
  fallback: string,
  t: ReturnType<typeof useI18n>["t"],
): string {
  const key = getGitHubDraftPrUnavailableMessageKey(reason)
  return key ? t(key) : fallback
}

function formatUpdatedAt(value: Date | string | null): string {
  if (!value) return ""
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function TaskCard({
  task,
  onOpen,
  onReview,
  onOpenPr,
  onPreparePr,
  isPreparingPr,
}: {
  task: WorkbenchTask
  onOpen: (task: WorkbenchTask) => void
  onReview: (task: WorkbenchTask, setDiffSidebarOpen: (open: boolean) => void) => void
  onOpenPr: (task: WorkbenchTask) => void
  onPreparePr: (task: WorkbenchTask) => void
  isPreparingPr: boolean
}) {
  const { t } = useI18n()
  const StatusIcon = getStatusIcon(task.status)
  const updatedAt = formatUpdatedAt(task.updatedAt)
  const diffHasLines = task.diff.additions !== null || task.diff.deletions !== null
  const diffSidebarAtom = useMemo(() => diffSidebarOpenAtomFamily(task.id), [task.id])
  const setDiffSidebarOpen = useSetAtom(diffSidebarAtom)
  const reviewDisabledReason = getReviewDisabledReason(task, t)
  const preparePrHint = getPreparePrHint(task, t)
  const handleReview = useCallback(
    () => onReview(task, setDiffSidebarOpen),
    [onReview, setDiffSidebarOpen, task],
  )
  const handlePreparePr = useCallback(
    () => onPreparePr(task),
    [onPreparePr, task],
  )

  return (
    <article className="rounded-lg border border-border bg-background px-4 py-3">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <StatusIcon
              className={cn(
                "h-4 w-4 flex-shrink-0",
                getStatusClassName(task.status),
                task.status === "running" && "animate-spin",
              )}
            />
            <h3 className="truncate text-sm font-medium text-foreground">
              {task.title}
            </h3>
          </div>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="truncate">{task.project.name}</span>
            <span className="flex min-w-0 items-center gap-1">
              <GitBranch className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">
                {task.branch ||
                  (task.localDirectoryMode
                    ? t("workbench.localDirectory")
                    : t("workbench.noBranch"))}
              </span>
            </span>
            {task.latestSubChat && (
              <span className="flex min-w-0 items-center gap-1">
                <MessageSquare className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">
                  {task.latestSubChat.name || t("chat.defaultTitle")}
                </span>
              </span>
            )}
            {updatedAt && <span>{updatedAt}</span>}
          </div>
        </div>

        <span className="flex-shrink-0 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
          {t(`workbench.status.${task.status}` as TranslationKey)}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <div className="flex items-baseline gap-1.5">
          <span className="font-medium text-foreground">{task.diff.fileCount}</span>
          <span>{t("workbench.filesChanged")}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="font-medium text-foreground">
            {diffHasLines ? (
              <>
                <span className="text-green-600 dark:text-green-400">
                  +{task.diff.additions ?? 0}
                </span>{" "}
                <span className="text-red-600 dark:text-red-400">
                  -{task.diff.deletions ?? 0}
                </span>
              </>
            ) : (
              t("workbench.notAvailable")
            )}
          </span>
          <span>{t("workbench.lineChanges")}</span>
        </div>
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate font-medium text-foreground">
            {task.pr?.number ? `#${task.pr.number}` : t("workbench.none")}
          </span>
          <span>{t("workbench.pullRequest")}</span>
        </div>
      </div>

      {task.statusReason && (
        <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">
          {task.statusReason}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          className="h-7 px-3 text-xs"
          onClick={() => onOpen(task)}
        >
          {task.latestSubChat ? t("workbench.continue") : t("workbench.open")}
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                variant="secondary"
                size="sm"
                className="h-7 px-3 text-xs"
                disabled={!task.actions.canReviewDiff}
                onClick={handleReview}
              >
                <FileDiff className="mr-1.5 h-3.5 w-3.5" />
                {t("workbench.reviewDiff")}
              </Button>
            </span>
          </TooltipTrigger>
          {reviewDisabledReason && (
            <TooltipContent>{reviewDisabledReason}</TooltipContent>
          )}
        </Tooltip>
        {task.pr?.url ? (
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-3 text-xs"
            onClick={() => onOpenPr(task)}
          >
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            {t("workbench.openPr")}
          </Button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-3 text-xs"
                  disabled={!task.actions.canCreatePr || isPreparingPr}
                  onClick={handlePreparePr}
                >
                  {isPreparingPr ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <GitPullRequest className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {isPreparingPr
                    ? t("githubWorkflow.draftPr.preparing")
                    : t("workbench.preparePr")}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>{preparePrHint}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </article>
  )
}

function HeadlessJobCard({
  job,
  onOpenLogs,
  onOpenCwd,
  onOpenLinkedChat,
  onCancel,
  onRetry,
  isCanceling,
  isRetrying,
}: {
  job: HeadlessJob
  onOpenLogs: (job: HeadlessJob) => void
  onOpenCwd: (job: HeadlessJob) => void
  onOpenLinkedChat: (job: HeadlessJob) => void
  onCancel: (job: HeadlessJob) => void
  onRetry: (job: HeadlessJob) => void
  isCanceling: boolean
  isRetrying: boolean
}) {
  const { t } = useI18n()
  const StatusIcon = getHeadlessJobStatusIcon(job.status)
  const createdAt = formatUpdatedAt(job.createdAt)
  const active = isActiveHeadlessJob(job)
  const retryable = canRetryHeadlessJob(job)

  return (
    <article className="rounded-lg border border-border bg-background px-4 py-3">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <StatusIcon
              className={cn(
                "h-4 w-4 flex-shrink-0",
                getHeadlessJobStatusClassName(job.status),
                active && "animate-spin",
              )}
            />
            <h3 className="truncate text-sm font-medium text-foreground">
              {job.promptPreview || t("workbench.headlessJobUntitled")}
            </h3>
          </div>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="flex min-w-0 items-center gap-1">
              <Terminal className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{formatHeadlessRuntime(job.runtime)}</span>
            </span>
            <span className="uppercase">{job.mode}</span>
            <span className="truncate">{job.cwd}</span>
            {createdAt && <span>{createdAt}</span>}
          </div>
        </div>

        <span className="flex-shrink-0 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
          {t(`workbench.jobStatus.${job.status}` as TranslationKey)}
        </span>
      </div>

      {(job.errorMessage || job.cancelRequestedAt) && (
        <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">
          {job.errorMessage ||
            t("workbench.cancelRequested", {
              by: job.cancelRequestedBy || "desktop",
            })}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          className="h-7 px-3 text-xs"
          onClick={() => onOpenLogs(job)}
        >
          <ScrollText className="mr-1.5 h-3.5 w-3.5" />
          {t("workbench.logs")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-3 text-xs"
          onClick={() => onOpenCwd(job)}
        >
          <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
          {t("workbench.openCwd")}
        </Button>
        {job.chatId && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-3 text-xs"
            onClick={() => onOpenLinkedChat(job)}
          >
            <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
            {t("workbench.openLinkedChat")}
          </Button>
        )}
        {active && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-3 text-xs"
            disabled={isCanceling}
            onClick={() => onCancel(job)}
          >
            {isCanceling ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <XCircle className="mr-1.5 h-3.5 w-3.5" />
            )}
            {t("workbench.cancelJob")}
          </Button>
        )}
        {retryable && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-3 text-xs"
            disabled={isRetrying}
            onClick={() => onRetry(job)}
          >
            {isRetrying ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            )}
            {t("workbench.retryJob")}
          </Button>
        )}
      </div>
    </article>
  )
}

function HeadlessJobLogsDialog({
  job,
  events,
  isLoading,
  isOpen,
  onOpenChange,
}: {
  job: HeadlessJob | null
  events: HeadlessJobEvent[]
  isLoading: boolean
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useI18n()

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="w-[760px] p-0">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="text-base">
            {t("workbench.jobLogs")}
          </DialogTitle>
          <DialogDescription className="truncate">
            {job?.id || t("workbench.headlessJobUntitled")}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[68vh] overflow-y-auto px-5 py-4">
          {isLoading ? (
            <div className="flex items-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t("workbench.loadingLogs")}
            </div>
          ) : events.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("workbench.noLogs")}
            </p>
          ) : (
            <div className="space-y-2">
              {events.map((event) => (
                <div
                  key={event.id}
                  className="grid grid-cols-[3.5rem_9rem_minmax(0,1fr)] gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs"
                >
                  <span className="font-mono text-muted-foreground">
                    #{event.sequence}
                  </span>
                  <span className="truncate font-medium text-foreground">
                    {event.type}
                  </span>
                  <pre className="min-w-0 whitespace-pre-wrap break-words font-mono text-muted-foreground">
                    {formatPayload(event.payload)}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DraftPrDialog({
  task,
  form,
  meta,
  error,
  createdUrl,
  isOpen,
  isConfirmOpen,
  isCreating,
  canCreate,
  onOpenChange,
  onConfirmOpenChange,
  onFormChange,
  onCreate,
  onOpenCreated,
}: {
  task: WorkbenchTask | null
  form: DraftPrFormState | null
  meta: DraftPrMetaState | null
  error: string | null
  createdUrl: string | null
  isOpen: boolean
  isConfirmOpen: boolean
  isCreating: boolean
  canCreate: boolean
  onOpenChange: (open: boolean) => void
  onConfirmOpenChange: (open: boolean) => void
  onFormChange: (field: keyof DraftPrFormState, value: string) => void
  onCreate: () => void
  onOpenCreated: (url: string) => void
}) {
  const { t } = useI18n()

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="w-[680px] p-0">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle className="text-base">
              {t("githubWorkflow.draftPr.ready")}
            </DialogTitle>
            <DialogDescription>
              {task ? task.title : t("workbench.title")}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
            {error && (
              <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            {createdUrl && (
              <div className="mb-3 flex items-center justify-between gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm">
                <span className="min-w-0 truncate text-emerald-700 dark:text-emerald-300">
                  {t("githubWorkflow.draftPr.created")}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => onOpenCreated(createdUrl)}
                >
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                  {t("githubWorkflow.draftPr.openCreated")}
                </Button>
              </div>
            )}

            {form && meta && (
              <div className="space-y-4">
                <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  {t("githubWorkflow.draftPr.meta", {
                    branch: meta.branch,
                    baseBranch: meta.baseBranch,
                    changes: meta.changedFileCount,
                    commits: meta.commitCount,
                  })}
                </div>

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t("githubWorkflow.draftPr.title")}
                  </span>
                  <Input
                    value={form.title}
                    onChange={(event) =>
                      onFormChange("title", event.target.value)}
                    className="h-8"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t("githubWorkflow.draftPr.body")}
                  </span>
                  <Textarea
                    value={form.body}
                    onChange={(event) =>
                      onFormChange("body", event.target.value)}
                    className="min-h-64 font-mono text-xs"
                  />
                </label>

                <p className="text-xs text-muted-foreground">
                  {t("githubWorkflow.draftPr.createNotice")}
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-border px-5 py-4">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isCreating}
            >
              {t("githubWorkflow.draftPr.cancel")}
            </Button>
            <Button
              disabled={!canCreate}
              onClick={() => onConfirmOpenChange(true)}
            >
              {isCreating
                ? t("githubWorkflow.draftPr.creating")
                : t("githubWorkflow.draftPr.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {form && meta && (
        <AlertDialog
          open={isConfirmOpen}
          onOpenChange={(open) => {
            if (!isCreating) onConfirmOpenChange(open)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("githubWorkflow.draftPr.confirmTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("githubWorkflow.draftPr.confirmDescription")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="px-5 pb-3 text-xs text-muted-foreground">
              {t("githubWorkflow.draftPr.meta", {
                branch: meta.branch,
                baseBranch: meta.baseBranch,
                changes: meta.changedFileCount,
                commits: meta.commitCount,
              })}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isCreating}>
                {t("githubWorkflow.draftPr.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={!canCreate}
                onClick={(event) => {
                  event.preventDefault()
                  onCreate()
                }}
              >
                {isCreating
                  ? t("githubWorkflow.draftPr.creating")
                  : t("githubWorkflow.draftPr.confirmCreate")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  )
}

export function AgentWorkbench() {
  const { t } = useI18n()
  const [filter, setFilter] = useState<WorkbenchFilter>("all")
  const [preparingPrTaskId, setPreparingPrTaskId] = useState<string | null>(null)
  const [draftPrTask, setDraftPrTask] = useState<WorkbenchTask | null>(null)
  const [draftPrForm, setDraftPrForm] = useState<DraftPrFormState | null>(null)
  const [draftPrMeta, setDraftPrMeta] = useState<DraftPrMetaState | null>(null)
  const [draftPrError, setDraftPrError] = useState<string | null>(null)
  const [createdDraftPrUrl, setCreatedDraftPrUrl] = useState<string | null>(null)
  const [isDraftPrDialogOpen, setIsDraftPrDialogOpen] = useState(false)
  const [isCreateDraftPrDialogOpen, setIsCreateDraftPrDialogOpen] =
    useState(false)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [mutatingJobId, setMutatingJobId] = useState<string | null>(null)
  const setSelectedChatId = useSetAtom(selectedAgentChatIdAtom)
  const setSelectedDraftId = useSetAtom(selectedDraftIdAtom)
  const setShowNewChatForm = useSetAtom(showNewChatFormAtom)
  const setDesktopView = useSetAtom(desktopViewAtom)
  const setFilteredDiffFiles = useSetAtom(filteredDiffFilesAtom)
  const setFilteredSubChatId = useSetAtom(filteredSubChatIdAtom)
  const setSelectedDiffFilePath = useSetAtom(selectedDiffFilePathAtom)
  const pendingQuestions = useAtomValue(pendingUserQuestionsAtom)
  const streamingStatuses = useStreamingStatusStore((state) => state.statuses)
  const prepareDraftPrMutation =
    trpc.githubWorkflow.prepareDraftPullRequest.useMutation()
  const createDraftPrMutation =
    trpc.githubWorkflow.createDraftPullRequest.useMutation()
  const cancelJobMutation = trpc.agentJobs.cancel.useMutation()
  const retryJobMutation = trpc.agentJobs.retry.useMutation()
  const openInFinderMutation = trpc.external.openInFinder.useMutation()
  const trpcUtils = trpc.useUtils()
  const runningSubChatIds = useMemo(
    () =>
      Object.entries(streamingStatuses)
        .filter(([, status]) => status === "streaming" || status === "submitted")
        .map(([subChatId]) => subChatId),
    [streamingStatuses],
  )
  const blockedSubChatIds = useMemo(
    () => Array.from(pendingQuestions.keys()),
    [pendingQuestions],
  )

  const tasksQuery = trpc.agentWorkbench.listTasks.useQuery(
    {
      filter,
      runningSubChatIds,
      blockedSubChatIds,
    },
    {
      refetchInterval:
        runningSubChatIds.length > 0 || blockedSubChatIds.length > 0
          ? 5000
          : false,
      placeholderData: (previous) => previous,
    },
  )

  const jobsQuery = trpc.agentJobs.list.useQuery(
    { source: "cli", limit: 20 },
    {
      refetchInterval: (query) => {
        const jobs = ((query.state.data as { jobs?: HeadlessJob[] } | undefined)
          ?.jobs ?? []) as HeadlessJob[]
        return jobs.some(isActiveHeadlessJob) ? 5000 : false
      },
      placeholderData: (previous) => previous,
    },
  )
  const selectedJob = useMemo(
    () =>
      ((jobsQuery.data?.jobs ?? []) as HeadlessJob[]).find(
        (job) => job.id === selectedJobId,
      ) ?? null,
    [jobsQuery.data?.jobs, selectedJobId],
  )
  const jobLogsQuery = trpc.agentJobs.logs.useQuery(
    { jobId: selectedJobId ?? "", afterSequence: 0 },
    {
      enabled: !!selectedJobId,
      refetchInterval: selectedJob && isActiveHeadlessJob(selectedJob)
        ? 3000
        : false,
      placeholderData: (previous) => previous,
    },
  )

  const tasks = (tasksQuery.data?.tasks ?? []) as WorkbenchTask[]
  const headlessJobs = (jobsQuery.data?.jobs ?? []) as HeadlessJob[]
  const visibleHeadlessJobs = useMemo(
    () =>
      headlessJobs.filter((job) =>
        matchesHeadlessJobFilter(job.status, filter),
      ),
    [filter, headlessJobs],
  )
  const headlessJobCounts = useMemo(
    () => getHeadlessJobCounts(headlessJobs),
    [headlessJobs],
  )
  const headlessJobEvents = (jobLogsQuery.data?.events ?? []) as HeadlessJobEvent[]
  const counts = mergeWorkbenchCounts(tasksQuery.data?.counts, headlessJobCounts)
  const isRefreshing = tasksQuery.isFetching || jobsQuery.isFetching
  const canCreateDraftPr =
    !!draftPrForm?.title.trim() &&
    !!draftPrForm.body.trim() &&
    !!draftPrMeta &&
    !createDraftPrMutation.isPending

  const openTask = useCallback(
    (task: WorkbenchTask) => {
      const store = useAgentSubChatStore.getState()
      setSelectedDraftId(null)
      setShowNewChatForm(false)
      setDesktopView(null)
      store.setChatId(task.id)
      if (task.latestSubChat) {
        store.addToAllSubChats({
          id: task.latestSubChat.id,
          name: task.latestSubChat.name || t("chat.defaultTitle"),
          mode: task.latestSubChat.mode,
          updated_at:
            task.latestSubChat.updatedAt instanceof Date
              ? task.latestSubChat.updatedAt.toISOString()
              : task.latestSubChat.updatedAt || undefined,
        })
        store.addToOpenSubChats(task.latestSubChat.id)
        store.setActiveSubChat(task.latestSubChat.id)
      }
      setSelectedChatId(task.id)
    },
    [setDesktopView, setSelectedChatId, setSelectedDraftId, setShowNewChatForm, t],
  )

  const handleReview = useCallback(
    (task: WorkbenchTask, setDiffSidebarOpen: (open: boolean) => void) => {
      openTask(task)
      setFilteredDiffFiles(null)
      setFilteredSubChatId(task.latestSubChat?.id ?? null)
      setSelectedDiffFilePath(null)
      setDiffSidebarOpen(true)
    },
    [openTask, setFilteredDiffFiles, setFilteredSubChatId, setSelectedDiffFilePath],
  )

  const handleOpenPr = useCallback((task: WorkbenchTask) => {
    if (task.pr?.url) {
      window.desktopApi.openExternal(task.pr.url)
    }
  }, [])

  const handleOpenJobLogs = useCallback((job: HeadlessJob) => {
    setSelectedJobId(job.id)
  }, [])

  const handleOpenJobCwd = useCallback(
    (job: HeadlessJob) => {
      openInFinderMutation.mutate(job.cwd)
    },
    [openInFinderMutation],
  )

  const handleOpenLinkedJobChat = useCallback(
    (job: HeadlessJob) => {
      if (!job.chatId) return
      const store = useAgentSubChatStore.getState()
      setSelectedDraftId(null)
      setShowNewChatForm(false)
      setDesktopView(null)
      store.setChatId(job.chatId)
      if (job.subChatId) {
        store.addToOpenSubChats(job.subChatId)
        store.setActiveSubChat(job.subChatId)
      }
      setSelectedChatId(job.chatId)
    },
    [setDesktopView, setSelectedChatId, setSelectedDraftId, setShowNewChatForm],
  )

  const handleCancelJob = useCallback(
    async (job: HeadlessJob) => {
      setMutatingJobId(job.id)
      try {
        await cancelJobMutation.mutateAsync({ jobId: job.id })
        await Promise.all([
          trpcUtils.agentJobs.list.invalidate(),
          trpcUtils.agentJobs.logs.invalidate({ jobId: job.id, afterSequence: 0 }),
        ])
      } finally {
        setMutatingJobId(null)
      }
    },
    [cancelJobMutation, trpcUtils],
  )

  const handleRetryJob = useCallback(
    async (job: HeadlessJob) => {
      setMutatingJobId(job.id)
      try {
        await retryJobMutation.mutateAsync({ jobId: job.id })
        await trpcUtils.agentJobs.list.invalidate()
      } finally {
        setMutatingJobId(null)
      }
    },
    [retryJobMutation, trpcUtils],
  )

  const handlePreparePr = useCallback(
    async (task: WorkbenchTask) => {
      if (!task.actions.canCreatePr) return

      setPreparingPrTaskId(task.id)
      setDraftPrTask(task)
      setDraftPrForm(null)
      setDraftPrMeta(null)
      setDraftPrError(null)
      setCreatedDraftPrUrl(null)
      setIsCreateDraftPrDialogOpen(false)

      try {
        const result = await prepareDraftPrMutation.mutateAsync({
          chatId: task.id,
        })

        if (result.status === "unavailable") {
          setDraftPrError(
            getDraftPrUnavailableMessage(result.reason, result.message, t),
          )
          setIsDraftPrDialogOpen(true)
          return
        }

        const { preparation } = result
        setDraftPrForm({
          title: preparation.title,
          body: preparation.body,
        })
        setDraftPrMeta({
          repoSlug: preparation.repoSlug,
          branch: preparation.branch,
          baseBranch: preparation.baseBranch,
          changedFileCount: preparation.changedFiles.length,
          commitCount: preparation.commits.length,
        })
        setIsDraftPrDialogOpen(true)
      } catch (error) {
        setDraftPrError(
          error instanceof Error
            ? error.message
            : t("githubWorkflow.draftPr.failed"),
        )
        setIsDraftPrDialogOpen(true)
      } finally {
        setPreparingPrTaskId(null)
      }
    },
    [prepareDraftPrMutation, t],
  )

  const updateDraftPrField = useCallback(
    (field: keyof DraftPrFormState, value: string) => {
      setDraftPrForm((current) =>
        current
          ? {
              ...current,
              [field]: value,
            }
          : current,
      )
    },
    [],
  )

  const handleCreateDraftPr = useCallback(async () => {
    if (!draftPrTask || !draftPrForm || !draftPrMeta || !canCreateDraftPr) {
      return
    }

    setDraftPrError(null)
    setCreatedDraftPrUrl(null)
    try {
      const result = await createDraftPrMutation.mutateAsync({
        chatId: draftPrTask.id,
        branch: draftPrMeta.branch,
        baseBranch: draftPrMeta.baseBranch,
        title: draftPrForm.title,
        body: draftPrForm.body,
      })

      setIsCreateDraftPrDialogOpen(false)

      if (result.status === "unavailable") {
        setDraftPrError(
          getDraftPrUnavailableMessage(result.reason, result.message, t),
        )
        if (result.existingPrUrl) {
          setCreatedDraftPrUrl(result.existingPrUrl)
        }
        return
      }

      setCreatedDraftPrUrl(result.url)
      setDraftPrForm(null)
      setDraftPrMeta(null)
      await Promise.all([
        trpcUtils.agentWorkbench.listTasks.invalidate(),
        trpcUtils.chats.getPrStatus.invalidate({ chatId: draftPrTask.id }),
        trpcUtils.githubWorkflow.getStatus.invalidate({
          chatId: draftPrTask.id,
        }),
        trpcUtils.githubWorkflow.getCurrentPullRequestContext.invalidate({
          chatId: draftPrTask.id,
        }),
      ])
    } catch (error) {
      setIsCreateDraftPrDialogOpen(false)
      setDraftPrError(
        error instanceof Error
          ? error.message
          : t("githubWorkflow.draftPr.createFailed"),
      )
    }
  }, [
    canCreateDraftPr,
    createDraftPrMutation,
    draftPrForm,
    draftPrMeta,
    draftPrTask,
    t,
    trpcUtils,
  ])

  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      <div className="border-b border-border px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-foreground">
              {t("workbench.title")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("workbench.subtitle")}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => {
              void tasksQuery.refetch()
              void jobsQuery.refetch()
            }}
            disabled={isRefreshing}
          >
            <RefreshCw
              className={cn(
                "h-3.5 w-3.5",
                isRefreshing && "animate-spin",
              )}
            />
            {t("workbench.refresh")}
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap gap-1">
          {FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              className={cn(
                "h-7 rounded-md px-2.5 text-xs transition-colors",
                filter === item
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`workbench.filter.${item}` as TranslationKey)}
              <span className="ml-1 opacity-70">
                {getWorkbenchFilterCount(counts, item)}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {jobsQuery.isLoading && tasksQuery.isLoading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t("workbench.loading")}
          </div>
        ) : tasks.length === 0 && visibleHeadlessJobs.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-sm text-center">
              <Circle className="mx-auto h-6 w-6 text-muted-foreground" />
              <h2 className="mt-3 text-sm font-medium text-foreground">
                {t("workbench.emptyTitle")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("workbench.emptyDescription")}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {visibleHeadlessJobs.length > 0 && (
              <section className="space-y-2">
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-sm font-medium text-foreground">
                      {t("workbench.headlessJobs")}
                    </h2>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {t("workbench.headlessJobsSubtitle")}
                    </p>
                  </div>
                </div>
                <div className="grid gap-3">
                  {visibleHeadlessJobs.map((job) => (
                    <HeadlessJobCard
                      key={job.id}
                      job={job}
                      onOpenLogs={handleOpenJobLogs}
                      onOpenCwd={handleOpenJobCwd}
                      onOpenLinkedChat={handleOpenLinkedJobChat}
                      onCancel={handleCancelJob}
                      onRetry={handleRetryJob}
                      isCanceling={
                        mutatingJobId === job.id && cancelJobMutation.isPending
                      }
                      isRetrying={
                        mutatingJobId === job.id && retryJobMutation.isPending
                      }
                    />
                  ))}
                </div>
              </section>
            )}

            {tasks.length > 0 && (
              <div className="grid gap-3">
                {tasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onOpen={openTask}
                    onReview={handleReview}
                    onOpenPr={handleOpenPr}
                    onPreparePr={handlePreparePr}
                    isPreparingPr={preparingPrTaskId === task.id}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <HeadlessJobLogsDialog
        job={selectedJob}
        events={headlessJobEvents}
        isLoading={jobLogsQuery.isLoading}
        isOpen={!!selectedJobId}
        onOpenChange={(open) => {
          if (!open) setSelectedJobId(null)
        }}
      />
      <DraftPrDialog
        task={draftPrTask}
        form={draftPrForm}
        meta={draftPrMeta}
        error={draftPrError}
        createdUrl={createdDraftPrUrl}
        isOpen={isDraftPrDialogOpen}
        isConfirmOpen={isCreateDraftPrDialogOpen}
        isCreating={createDraftPrMutation.isPending}
        canCreate={canCreateDraftPr}
        onOpenChange={setIsDraftPrDialogOpen}
        onConfirmOpenChange={setIsCreateDraftPrDialogOpen}
        onFormChange={updateDraftPrField}
        onCreate={() => void handleCreateDraftPr()}
        onOpenCreated={(url) => window.desktopApi.openExternal(url)}
      />
    </div>
  )
}

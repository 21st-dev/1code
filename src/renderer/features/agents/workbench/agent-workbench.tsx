"use client"

import { useAtomValue, useSetAtom } from "jotai"
import {
  AlertCircle,
  Braces,
  Cable,
  CalendarClock,
  CheckCircle2,
  Circle,
  ExternalLink,
  FileDiff,
  FolderOpen,
  GitBranch,
  GitPullRequest,
  Loader2,
  MessageSquare,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  ScrollText,
  Server,
  Terminal,
  Trash2,
  XCircle,
} from "lucide-react"
import { useCallback, useMemo, useState } from "react"
import type { GitHubDraftPullRequestUnavailableReason } from "../../../../shared/github-workflow-context"
import { getGitHubDraftPrUnavailableMessageKey } from "../../../../shared/github-workflow-ui-state"
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
import { Button } from "../../../components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog"
import { Input } from "../../../components/ui/input"
import { Textarea } from "../../../components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../../components/ui/tooltip"
import { type TranslationKey, useI18n } from "../../../lib/i18n"
import { trpc } from "../../../lib/trpc"
import { cn } from "../../../lib/utils"
import {
  desktopViewAtom,
  diffSidebarOpenAtomFamily,
  filteredDiffFilesAtom,
  filteredSubChatIdAtom,
  pendingUserQuestionsAtom,
  selectedAgentChatIdAtom,
  selectedDiffFilePathAtom,
  selectedDraftIdAtom,
  showNewChatFormAtom,
} from "../atoms"
import { useStreamingStatusStore } from "../stores/streaming-status-store"
import { useAgentSubChatStore } from "../stores/sub-chat-store"
import {
  formatTracePayload,
  getWorkbenchTraceRow,
  type WorkbenchObservedPermission,
  type WorkbenchTraceEvent,
} from "./workbench-trace-presenter"

type WorkbenchFilter =
  | "all"
  | "running"
  | "needs-review"
  | "prs"
  | "blocked"
  | "clean"
type WorkbenchTaskStatus =
  | "running"
  | "blocked"
  | "needs-review"
  | "has-pr"
  | "clean"
  | "archived"
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
  apiConsumerId: string | null
  apiConsumerRunId: string | null
  artifactBaseDir: string | null
  artifactManifestPath: string | null
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

type HeadlessJobEvent = WorkbenchTraceEvent

type AgentSchedule = {
  id: string
  name: string
  status: "enabled" | "paused" | "disabled"
  runtime: string
  mode: "plan" | "agent"
  cwd: string
  projectId: string | null
  promptPreview: string | null
  intervalSeconds: number
  timezone: string
  nextRunAt: Date | string | null
  lastRunAt: Date | string | null
  lastJobId: string | null
  createdAt: Date | string | null
  updatedAt: Date | string | null
  disabledAt: Date | string | null
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

type ScheduleMutationAction = "run" | "pause" | "resume" | "delete"

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
  if (filter === "blocked")
    return status === "failed" || status === "interrupted"
  if (filter === "clean") return status === "succeeded"
  return false
}

function getHeadlessJobCounts(jobs: HeadlessJob[]): WorkbenchCounts {
  return {
    all: jobs.length,
    running: jobs.filter((job) =>
      matchesHeadlessJobFilter(job.status, "running"),
    ).length,
    needsReview: 0,
    prs: 0,
    blocked: jobs.filter((job) =>
      matchesHeadlessJobFilter(job.status, "blocked"),
    ).length,
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
    job.source !== "desktop" &&
    job.source !== "api" &&
    (job.status === "failed" ||
      job.status === "canceled" ||
      job.status === "interrupted")
  )
}

function getHeadlessJobSourceIcon(job: HeadlessJob) {
  if (job.source === "api") return Braces
  if (job.source === "schedule") return CalendarClock
  if (job.source === "protocol") return Cable
  if (job.source === "daemon") return Server
  return job.source === "desktop" ? MessageSquare : Terminal
}

function getHeadlessJobSourceLabelKey(job: HeadlessJob): TranslationKey {
  if (job.source === "desktop") return "workbench.jobSource.desktop"
  if (job.source === "cli") return "workbench.jobSource.cli"
  if (job.source === "daemon") return "workbench.jobSource.daemon"
  if (job.source === "schedule") return "workbench.jobSource.schedule"
  if (job.source === "protocol") return "workbench.jobSource.protocol"
  if (job.source === "api") return "workbench.jobSource.api"
  return "workbench.jobSource.other"
}

function HeadlessJobApiMetadata({
  job,
  compact = false,
}: {
  job: HeadlessJob
  compact?: boolean
}) {
  const { t } = useI18n()
  if (job.source !== "api") return null

  const artifactPath = job.artifactManifestPath || job.artifactBaseDir
  const metadata = [
    job.apiConsumerId
      ? {
          key: "consumer",
          label: t("workbench.apiConsumer"),
          value: job.apiConsumerId,
        }
      : null,
    job.apiConsumerRunId
      ? {
          key: "run",
          label: t("workbench.apiExternalRun"),
          value: job.apiConsumerRunId,
        }
      : null,
    artifactPath
      ? {
          key: "artifacts",
          label: t("workbench.apiArtifacts"),
          value: artifactPath,
        }
      : null,
  ].filter(Boolean) as Array<{ key: string; label: string; value: string }>

  if (metadata.length === 0) return null

  return (
    <div
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground",
        compact ? "mt-2" : "mt-3",
      )}
    >
      {metadata.map((item) => (
        <span
          key={item.key}
          className="flex min-w-0 max-w-full items-baseline gap-1.5"
          title={`${item.label}: ${item.value}`}
        >
          <span className="flex-shrink-0 text-muted-foreground">
            {item.label}
          </span>
          <span
            className="min-w-0 truncate font-mono text-foreground/80"
            title={item.value}
          >
            {item.value}
          </span>
        </span>
      ))}
    </div>
  )
}

function HeadlessJobRecordHeader({ job }: { job: HeadlessJob }) {
  const { t } = useI18n()
  const createdAt = formatUpdatedAt(job.createdAt)
  const startedAt = formatUpdatedAt(job.startedAt)
  const finishedAt = formatUpdatedAt(job.finishedAt)
  const heartbeatAt = formatUpdatedAt(job.heartbeatAt)
  const details = [
    {
      key: "job-id",
      label: t("workbench.record.jobId"),
      value: job.id,
      monospace: true,
    },
    {
      key: "source",
      label: t("workbench.record.source"),
      value: t(getHeadlessJobSourceLabelKey(job)),
    },
    {
      key: "runtime",
      label: t("workbench.record.runtime"),
      value: formatHeadlessRuntime(job.runtime),
    },
    {
      key: "mode",
      label: t("workbench.record.mode"),
      value: job.mode.toUpperCase(),
    },
    {
      key: "status",
      label: t("workbench.record.status"),
      value: t(`workbench.jobStatus.${job.status}` as TranslationKey),
    },
    createdAt
      ? {
          key: "created",
          label: t("workbench.record.created"),
          value: createdAt,
        }
      : null,
    startedAt
      ? {
          key: "started",
          label: t("workbench.record.started"),
          value: startedAt,
        }
      : null,
    {
      key: "finished",
      label: t("workbench.record.finished"),
      value: finishedAt || t("workbench.record.notFinished"),
    },
    heartbeatAt
      ? {
          key: "heartbeat",
          label: t("workbench.record.heartbeat"),
          value: heartbeatAt,
        }
      : null,
    job.exitCode !== null
      ? {
          key: "exit-code",
          label: t("workbench.record.exitCode"),
          value: String(job.exitCode),
        }
      : null,
    job.workerPid !== null
      ? {
          key: "worker",
          label: t("workbench.record.worker"),
          value: String(job.workerPid),
        }
      : null,
  ].filter(Boolean) as Array<{
    key: string
    label: string
    value: string
    monospace?: boolean
  }>

  return (
    <div className="mb-4 rounded-lg border border-border bg-muted/30 p-3">
      <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
        {details.map((item) => (
          <div key={item.key} className="min-w-0">
            <dt className="text-[11px] font-medium uppercase text-muted-foreground">
              {item.label}
            </dt>
            <dd
              className={cn(
                "mt-0.5 truncate text-xs text-foreground",
                item.monospace && "font-mono",
              )}
              title={item.value}
            >
              {item.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-3 min-w-0 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          {t("workbench.record.cwd")}
        </span>
        <span className="ml-2 break-all font-mono">{job.cwd}</span>
      </div>

      {(job.errorCode || job.errorMessage) && (
        <div className="mt-3 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs">
          <div className="font-medium text-destructive">
            {t("workbench.record.error")}
          </div>
          {job.errorCode && (
            <div className="mt-1 font-mono text-destructive/90">
              {job.errorCode}
            </div>
          )}
          {job.errorMessage && (
            <div className="mt-1 whitespace-pre-wrap break-words text-destructive/90">
              {job.errorMessage}
            </div>
          )}
        </div>
      )}

      <HeadlessJobApiMetadata job={job} compact />
    </div>
  )
}

function formatHeadlessRuntime(runtime: string): string {
  if (runtime === "claude-code") return "Claude Code"
  if (runtime === "codex") return "Codex"
  return runtime
}

function getScheduleStatusClassName(status: AgentSchedule["status"]): string {
  if (status === "enabled") return "text-emerald-500"
  if (status === "paused") return "text-amber-500"
  return "text-muted-foreground"
}

function formatScheduleInterval(intervalSeconds: number): string {
  if (intervalSeconds % 3600 === 0) return `${intervalSeconds / 3600}h`
  if (intervalSeconds % 60 === 0) return `${intervalSeconds / 60}m`
  return `${intervalSeconds}s`
}

function getReviewDisabledReason(
  task: WorkbenchTask,
  t: ReturnType<typeof useI18n>["t"],
) {
  if (task.actions.canReviewDiff) return null
  if (!task.worktreePath) return t("workbench.noWorkspacePath")
  return t("workbench.noReviewableDiff")
}

function getPreparePrHint(
  task: WorkbenchTask,
  t: ReturnType<typeof useI18n>["t"],
) {
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
  onReview: (
    task: WorkbenchTask,
    setDiffSidebarOpen: (open: boolean) => void,
  ) => void
  onOpenPr: (task: WorkbenchTask) => void
  onPreparePr: (task: WorkbenchTask) => void
  isPreparingPr: boolean
}) {
  const { t } = useI18n()
  const StatusIcon = getStatusIcon(task.status)
  const updatedAt = formatUpdatedAt(task.updatedAt)
  const diffHasLines =
    task.diff.additions !== null || task.diff.deletions !== null
  const diffSidebarAtom = useMemo(
    () => diffSidebarOpenAtomFamily(task.id),
    [task.id],
  )
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
          <span className="font-medium text-foreground">
            {task.diff.fileCount}
          </span>
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

function ScheduleCard({
  schedule,
  onRunNow,
  onPause,
  onResume,
  onDelete,
  onOpenLastJob,
  mutatingAction,
}: {
  schedule: AgentSchedule
  onRunNow: (schedule: AgentSchedule) => void
  onPause: (schedule: AgentSchedule) => void
  onResume: (schedule: AgentSchedule) => void
  onDelete: (schedule: AgentSchedule) => void
  onOpenLastJob: (schedule: AgentSchedule) => void
  mutatingAction: ScheduleMutationAction | null
}) {
  const { t } = useI18n()
  const nextRunAt = formatUpdatedAt(schedule.nextRunAt)
  const lastRunAt = formatUpdatedAt(schedule.lastRunAt)
  const isMutating = mutatingAction !== null
  const canRun = schedule.status !== "disabled"
  const canPause = schedule.status === "enabled"
  const canResume = schedule.status === "paused"

  return (
    <article className="rounded-lg border border-border bg-background px-4 py-3">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <CalendarClock
              className={cn(
                "h-4 w-4 flex-shrink-0",
                getScheduleStatusClassName(schedule.status),
              )}
            />
            <h3 className="truncate text-sm font-medium text-foreground">
              {schedule.name}
            </h3>
          </div>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{formatHeadlessRuntime(schedule.runtime)}</span>
            <span className="uppercase">{schedule.mode}</span>
            <span>
              {t("workbench.scheduleInterval", {
                interval: formatScheduleInterval(schedule.intervalSeconds),
              })}
            </span>
            {nextRunAt && (
              <span>{t("workbench.scheduleNextRun", { time: nextRunAt })}</span>
            )}
            {lastRunAt && (
              <span>{t("workbench.scheduleLastRun", { time: lastRunAt })}</span>
            )}
            <span className="truncate">{schedule.cwd}</span>
          </div>
        </div>

        <span className="flex-shrink-0 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
          {t(`workbench.scheduleStatus.${schedule.status}` as TranslationKey)}
        </span>
      </div>

      {schedule.promptPreview && (
        <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">
          {schedule.promptPreview}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          className="h-7 px-3 text-xs"
          disabled={!canRun || isMutating}
          onClick={() => onRunNow(schedule)}
        >
          {mutatingAction === "run" ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <PlayCircle className="mr-1.5 h-3.5 w-3.5" />
          )}
          {t("workbench.runScheduleNow")}
        </Button>

        {canPause && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-3 text-xs"
            disabled={isMutating}
            onClick={() => onPause(schedule)}
          >
            {mutatingAction === "pause" ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <PauseCircle className="mr-1.5 h-3.5 w-3.5" />
            )}
            {t("workbench.pauseSchedule")}
          </Button>
        )}

        {canResume && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-3 text-xs"
            disabled={isMutating}
            onClick={() => onResume(schedule)}
          >
            {mutatingAction === "resume" ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <PlayCircle className="mr-1.5 h-3.5 w-3.5" />
            )}
            {t("workbench.resumeSchedule")}
          </Button>
        )}

        {schedule.lastJobId && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-3 text-xs"
            onClick={() => onOpenLastJob(schedule)}
          >
            <ScrollText className="mr-1.5 h-3.5 w-3.5" />
            {t("workbench.openScheduleJob")}
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          className="h-7 px-3 text-xs"
          disabled={schedule.status === "disabled" || isMutating}
          onClick={() => onDelete(schedule)}
        >
          {mutatingAction === "delete" ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          )}
          {t("workbench.deleteSchedule")}
        </Button>
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
  const SourceIcon = getHeadlessJobSourceIcon(job)
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
              <SourceIcon className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{t(getHeadlessJobSourceLabelKey(job))}</span>
            </span>
            <span>{formatHeadlessRuntime(job.runtime)}</span>
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

      <HeadlessJobApiMetadata job={job} />

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
          <DialogDescription>
            {t("workbench.jobTraceSubtitle")}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[68vh] overflow-y-auto px-5 py-4">
          {job && <HeadlessJobRecordHeader job={job} />}
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
                <JobEventRow key={event.id} event={event} />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function JobEventRow({ event }: { event: HeadlessJobEvent }) {
  const { t } = useI18n()
  const row = getWorkbenchTraceRow(event)
  const observed = row.observedPermission
  const summary = row.summaryKey
    ? t(row.summaryKey, row.summaryValues)
    : row.summary
  const nextAction = row.nextActionKey
    ? t(row.nextActionKey, row.nextActionValues)
    : row.nextAction

  return (
    <div className="grid grid-cols-[3.5rem_11rem_minmax(0,1fr)] gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs">
      <span className="font-mono text-muted-foreground">#{event.sequence}</span>
      <div className="min-w-0">
        <div className="truncate font-medium text-foreground">
          {t(row.titleKey)}
        </div>
        <div className="truncate font-mono text-[11px] text-muted-foreground">
          {event.type}
        </div>
      </div>
      <div className="min-w-0 space-y-1">
        {observed && <ObservedPermissionSummary observed={observed} />}
        {summary && (
          <div className="truncate font-medium text-foreground/80">
            {summary}
          </div>
        )}
        {nextAction && (
          <div className="text-[11px] text-muted-foreground">{nextAction}</div>
        )}
        <pre className="min-w-0 whitespace-pre-wrap break-words font-mono text-muted-foreground">
          {formatTracePayload(row.semanticPayload)}
        </pre>
        <details className="text-muted-foreground">
          <summary className="cursor-pointer text-[11px] font-medium">
            {t("workbench.rawPayload")}
          </summary>
          <pre className="mt-1 min-w-0 whitespace-pre-wrap break-words font-mono">
            {formatTracePayload(row.rawPayload)}
          </pre>
        </details>
      </div>
    </div>
  )
}

function ObservedPermissionSummary({
  observed,
}: {
  observed: WorkbenchObservedPermission
}) {
  const { t } = useI18n()
  const denied = observed.decision === "deny"

  return (
    <div
      className={cn(
        "rounded-md border px-2.5 py-2",
        denied
          ? "border-destructive/30 bg-destructive/5 text-destructive"
          : "border-amber-500/25 bg-amber-500/5 text-amber-700 dark:text-amber-300",
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="rounded bg-background/70 px-1.5 py-0.5 font-medium">
          {t("workbench.observedControl")}
        </span>
        <span className="rounded bg-background/70 px-1.5 py-0.5 font-mono">
          {observed.controlLevel}
        </span>
        <span className="rounded bg-background/70 px-1.5 py-0.5 font-medium">
          {denied
            ? t("workbench.observedDenied")
            : t("workbench.observedAllowed")}
        </span>
        <span className="rounded bg-background/70 px-1.5 py-0.5">
          {t("workbench.observedRisk", { risk: observed.riskLevel })}
        </span>
        {observed.toolName && (
          <span className="rounded bg-background/70 px-1.5 py-0.5 font-mono">
            {observed.toolName}
          </span>
        )}
      </div>
      {(observed.reason ||
        observed.message ||
        observed.categories.length > 0) && (
        <div className="mt-1.5 space-y-1 text-[11px]">
          {(observed.message || observed.reason) && (
            <p className="break-words">{observed.message || observed.reason}</p>
          )}
          {observed.categories.length > 0 && (
            <p className="break-words">
              {t("workbench.observedCategories", {
                categories: observed.categories.join(", "),
              })}
            </p>
          )}
        </div>
      )}
      {denied && (
        <div className="mt-1.5 text-[11px] font-medium">
          {t("workbench.observedSafety")}
        </div>
      )}
    </div>
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

                <label
                  className="block space-y-1.5"
                  htmlFor="github-draft-pr-title"
                >
                  <span className="text-xs font-medium text-muted-foreground">
                    {t("githubWorkflow.draftPr.title")}
                  </span>
                  <Input
                    id="github-draft-pr-title"
                    value={form.title}
                    onChange={(event) =>
                      onFormChange("title", event.target.value)
                    }
                    className="h-8"
                  />
                </label>

                <label
                  className="block space-y-1.5"
                  htmlFor="github-draft-pr-body"
                >
                  <span className="text-xs font-medium text-muted-foreground">
                    {t("githubWorkflow.draftPr.body")}
                  </span>
                  <Textarea
                    id="github-draft-pr-body"
                    value={form.body}
                    onChange={(event) =>
                      onFormChange("body", event.target.value)
                    }
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
  const [preparingPrTaskId, setPreparingPrTaskId] = useState<string | null>(
    null,
  )
  const [draftPrTask, setDraftPrTask] = useState<WorkbenchTask | null>(null)
  const [draftPrForm, setDraftPrForm] = useState<DraftPrFormState | null>(null)
  const [draftPrMeta, setDraftPrMeta] = useState<DraftPrMetaState | null>(null)
  const [draftPrError, setDraftPrError] = useState<string | null>(null)
  const [createdDraftPrUrl, setCreatedDraftPrUrl] = useState<string | null>(
    null,
  )
  const [isDraftPrDialogOpen, setIsDraftPrDialogOpen] = useState(false)
  const [isCreateDraftPrDialogOpen, setIsCreateDraftPrDialogOpen] =
    useState(false)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [mutatingJobId, setMutatingJobId] = useState<string | null>(null)
  const [mutatingSchedule, setMutatingSchedule] = useState<{
    id: string
    action: ScheduleMutationAction
  } | null>(null)
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
  const runScheduleNowMutation = trpc.agentSchedules.runNow.useMutation()
  const pauseScheduleMutation = trpc.agentSchedules.pause.useMutation()
  const resumeScheduleMutation = trpc.agentSchedules.resume.useMutation()
  const deleteScheduleMutation = trpc.agentSchedules.delete.useMutation()
  const openInFinderMutation = trpc.external.openInFinder.useMutation()
  const trpcUtils = trpc.useUtils()
  const runningSubChatIds = useMemo(
    () =>
      Object.entries(streamingStatuses)
        .filter(
          ([, status]) => status === "streaming" || status === "submitted",
        )
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

  const cliJobsQuery = trpc.agentJobs.list.useQuery(
    { source: "cli", limit: 20 },
    {
      refetchInterval: (query) => {
        const jobs = ((query.state.data as { jobs?: HeadlessJob[] } | undefined)
          ?.jobs ?? []) as HeadlessJob[]
        return jobs.some(isActiveHeadlessJob) ? 5000 : 10000
      },
      placeholderData: (previous) => previous,
    },
  )
  const desktopJobsQuery = trpc.agentJobs.list.useQuery(
    { source: "desktop", limit: 20 },
    {
      refetchInterval: (query) => {
        const jobs = ((query.state.data as { jobs?: HeadlessJob[] } | undefined)
          ?.jobs ?? []) as HeadlessJob[]
        return jobs.some(isActiveHeadlessJob) ? 5000 : 10000
      },
      placeholderData: (previous) => previous,
    },
  )
  const daemonJobsQuery = trpc.agentJobs.list.useQuery(
    { source: "daemon", limit: 20 },
    {
      refetchInterval: (query) => {
        const jobs = ((query.state.data as { jobs?: HeadlessJob[] } | undefined)
          ?.jobs ?? []) as HeadlessJob[]
        return jobs.some(isActiveHeadlessJob) ? 5000 : 10000
      },
      placeholderData: (previous) => previous,
    },
  )
  const scheduleJobsQuery = trpc.agentJobs.list.useQuery(
    { source: "schedule", limit: 20 },
    {
      refetchInterval: (query) => {
        const jobs = ((query.state.data as { jobs?: HeadlessJob[] } | undefined)
          ?.jobs ?? []) as HeadlessJob[]
        return jobs.some(isActiveHeadlessJob) ? 5000 : 10000
      },
      placeholderData: (previous) => previous,
    },
  )
  const protocolJobsQuery = trpc.agentJobs.list.useQuery(
    { source: "protocol", limit: 20 },
    {
      refetchInterval: (query) => {
        const jobs = ((query.state.data as { jobs?: HeadlessJob[] } | undefined)
          ?.jobs ?? []) as HeadlessJob[]
        return jobs.some(isActiveHeadlessJob) ? 5000 : 10000
      },
      placeholderData: (previous) => previous,
    },
  )
  const apiJobsQuery = trpc.agentJobs.list.useQuery(
    { source: "api", limit: 20 },
    {
      refetchInterval: (query) => {
        const jobs = ((query.state.data as { jobs?: HeadlessJob[] } | undefined)
          ?.jobs ?? []) as HeadlessJob[]
        return jobs.some(isActiveHeadlessJob) ? 5000 : 10000
      },
      placeholderData: (previous) => previous,
    },
  )
  const schedulesQuery = trpc.agentSchedules.list.useQuery(
    { includeDisabled: false, limit: 20 },
    {
      refetchInterval: 10000,
      placeholderData: (previous) => previous,
    },
  )
  const selectedJob = useMemo(
    () =>
      [
        ...((desktopJobsQuery.data?.jobs ?? []) as HeadlessJob[]),
        ...((cliJobsQuery.data?.jobs ?? []) as HeadlessJob[]),
        ...((daemonJobsQuery.data?.jobs ?? []) as HeadlessJob[]),
        ...((scheduleJobsQuery.data?.jobs ?? []) as HeadlessJob[]),
        ...((protocolJobsQuery.data?.jobs ?? []) as HeadlessJob[]),
        ...((apiJobsQuery.data?.jobs ?? []) as HeadlessJob[]),
      ].find((job) => job.id === selectedJobId) ?? null,
    [
      apiJobsQuery.data?.jobs,
      cliJobsQuery.data?.jobs,
      daemonJobsQuery.data?.jobs,
      desktopJobsQuery.data?.jobs,
      protocolJobsQuery.data?.jobs,
      scheduleJobsQuery.data?.jobs,
      selectedJobId,
    ],
  )
  const jobLogsQuery = trpc.agentJobs.logs.useQuery(
    { jobId: selectedJobId ?? "", afterSequence: 0 },
    {
      enabled: !!selectedJobId,
      refetchInterval:
        selectedJob && isActiveHeadlessJob(selectedJob) ? 3000 : false,
      placeholderData: (previous) => previous,
    },
  )
  const jobRecordQuery = trpc.agentJobs.show.useQuery(
    { jobId: selectedJobId ?? "" },
    {
      enabled: !!selectedJobId,
      refetchInterval:
        selectedJob && isActiveHeadlessJob(selectedJob) ? 3000 : false,
      placeholderData: (previous) => previous,
    },
  )

  const tasks = (tasksQuery.data?.tasks ?? []) as WorkbenchTask[]
  const schedules = (schedulesQuery.data?.schedules ?? []) as AgentSchedule[]
  const headlessJobs = useMemo(() => {
    const jobs = [
      ...((desktopJobsQuery.data?.jobs ?? []) as HeadlessJob[]),
      ...((cliJobsQuery.data?.jobs ?? []) as HeadlessJob[]),
      ...((daemonJobsQuery.data?.jobs ?? []) as HeadlessJob[]),
      ...((scheduleJobsQuery.data?.jobs ?? []) as HeadlessJob[]),
      ...((protocolJobsQuery.data?.jobs ?? []) as HeadlessJob[]),
      ...((apiJobsQuery.data?.jobs ?? []) as HeadlessJob[]),
    ]
    return jobs.sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return bTime - aTime
    })
  }, [
    apiJobsQuery.data?.jobs,
    cliJobsQuery.data?.jobs,
    daemonJobsQuery.data?.jobs,
    desktopJobsQuery.data?.jobs,
    protocolJobsQuery.data?.jobs,
    scheduleJobsQuery.data?.jobs,
  ])
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
  const selectedJobLogs =
    (jobLogsQuery.data?.job as HeadlessJob | undefined)?.id === selectedJobId
      ? jobLogsQuery.data
      : null
  const selectedJobRecord =
    (jobRecordQuery.data?.job as HeadlessJob | undefined)?.id === selectedJobId
      ? (jobRecordQuery.data?.job as HeadlessJob)
      : null
  const headlessJobEvents = (selectedJobLogs?.events ??
    []) as HeadlessJobEvent[]
  const loggedJob =
    selectedJobRecord ??
    (selectedJobLogs?.job as HeadlessJob | undefined) ??
    selectedJob
  const counts = mergeWorkbenchCounts(
    tasksQuery.data?.counts,
    headlessJobCounts,
  )
  const isRefreshing =
    tasksQuery.isFetching ||
    cliJobsQuery.isFetching ||
    desktopJobsQuery.isFetching ||
    daemonJobsQuery.isFetching ||
    scheduleJobsQuery.isFetching ||
    protocolJobsQuery.isFetching ||
    apiJobsQuery.isFetching ||
    schedulesQuery.isFetching
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
    [
      setDesktopView,
      setSelectedChatId,
      setSelectedDraftId,
      setShowNewChatForm,
      t,
    ],
  )

  const handleReview = useCallback(
    (task: WorkbenchTask, setDiffSidebarOpen: (open: boolean) => void) => {
      openTask(task)
      setFilteredDiffFiles(null)
      setFilteredSubChatId(task.latestSubChat?.id ?? null)
      setSelectedDiffFilePath(null)
      setDiffSidebarOpen(true)
    },
    [
      openTask,
      setFilteredDiffFiles,
      setFilteredSubChatId,
      setSelectedDiffFilePath,
    ],
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
          trpcUtils.agentJobs.logs.invalidate({
            jobId: job.id,
            afterSequence: 0,
          }),
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

  const refreshSchedulesAndJobs = useCallback(async () => {
    await Promise.all([
      trpcUtils.agentSchedules.list.invalidate(),
      trpcUtils.agentJobs.list.invalidate(),
    ])
  }, [trpcUtils])

  const handleRunScheduleNow = useCallback(
    async (schedule: AgentSchedule) => {
      setMutatingSchedule({ id: schedule.id, action: "run" })
      try {
        const result = await runScheduleNowMutation.mutateAsync({
          scheduleId: schedule.id,
        })
        setSelectedJobId(result.job.id)
        await refreshSchedulesAndJobs()
      } finally {
        setMutatingSchedule(null)
      }
    },
    [refreshSchedulesAndJobs, runScheduleNowMutation],
  )

  const handlePauseSchedule = useCallback(
    async (schedule: AgentSchedule) => {
      setMutatingSchedule({ id: schedule.id, action: "pause" })
      try {
        await pauseScheduleMutation.mutateAsync({ scheduleId: schedule.id })
        await refreshSchedulesAndJobs()
      } finally {
        setMutatingSchedule(null)
      }
    },
    [pauseScheduleMutation, refreshSchedulesAndJobs],
  )

  const handleResumeSchedule = useCallback(
    async (schedule: AgentSchedule) => {
      setMutatingSchedule({ id: schedule.id, action: "resume" })
      try {
        await resumeScheduleMutation.mutateAsync({ scheduleId: schedule.id })
        await refreshSchedulesAndJobs()
      } finally {
        setMutatingSchedule(null)
      }
    },
    [refreshSchedulesAndJobs, resumeScheduleMutation],
  )

  const handleDeleteSchedule = useCallback(
    async (schedule: AgentSchedule) => {
      setMutatingSchedule({ id: schedule.id, action: "delete" })
      try {
        await deleteScheduleMutation.mutateAsync({ scheduleId: schedule.id })
        await refreshSchedulesAndJobs()
      } finally {
        setMutatingSchedule(null)
      }
    },
    [deleteScheduleMutation, refreshSchedulesAndJobs],
  )

  const handleOpenScheduleJob = useCallback((schedule: AgentSchedule) => {
    if (schedule.lastJobId) setSelectedJobId(schedule.lastJobId)
  }, [])

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
              void cliJobsQuery.refetch()
              void desktopJobsQuery.refetch()
              void daemonJobsQuery.refetch()
              void scheduleJobsQuery.refetch()
              void protocolJobsQuery.refetch()
              void apiJobsQuery.refetch()
              void schedulesQuery.refetch()
            }}
            disabled={isRefreshing}
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")}
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
        {cliJobsQuery.isLoading &&
        desktopJobsQuery.isLoading &&
        daemonJobsQuery.isLoading &&
        scheduleJobsQuery.isLoading &&
        protocolJobsQuery.isLoading &&
        apiJobsQuery.isLoading &&
        schedulesQuery.isLoading &&
        tasksQuery.isLoading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t("workbench.loading")}
          </div>
        ) : tasks.length === 0 &&
          schedules.length === 0 &&
          visibleHeadlessJobs.length === 0 ? (
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
            {schedules.length > 0 && (
              <section className="space-y-2">
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-sm font-medium text-foreground">
                      {t("workbench.schedules")}
                    </h2>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {t("workbench.schedulesSubtitle")}
                    </p>
                  </div>
                </div>
                <div className="grid gap-3">
                  {schedules.map((schedule) => (
                    <ScheduleCard
                      key={schedule.id}
                      schedule={schedule}
                      onRunNow={handleRunScheduleNow}
                      onPause={handlePauseSchedule}
                      onResume={handleResumeSchedule}
                      onDelete={handleDeleteSchedule}
                      onOpenLastJob={handleOpenScheduleJob}
                      mutatingAction={
                        mutatingSchedule?.id === schedule.id
                          ? mutatingSchedule.action
                          : null
                      }
                    />
                  ))}
                </div>
              </section>
            )}

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
        job={loggedJob}
        events={headlessJobEvents}
        isLoading={jobLogsQuery.isLoading || jobRecordQuery.isLoading}
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

"use client"

import { useCallback, useMemo, useState } from "react"
import { useAtomValue, useSetAtom } from "jotai"
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  ExternalLink,
  FileDiff,
  GitBranch,
  GitPullRequest,
  Loader2,
  MessageSquare,
  RefreshCw,
} from "lucide-react"
import { Button } from "../../../components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../../components/ui/tooltip"
import { trpc } from "../../../lib/trpc"
import { useI18n, type TranslationKey } from "../../../lib/i18n"
import { cn } from "../../../lib/utils"
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

const FILTERS: WorkbenchFilter[] = [
  "all",
  "running",
  "needs-review",
  "prs",
  "blocked",
  "clean",
]

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
}: {
  task: WorkbenchTask
  onOpen: (task: WorkbenchTask) => void
  onReview: (task: WorkbenchTask, setDiffSidebarOpen: (open: boolean) => void) => void
  onOpenPr: (task: WorkbenchTask) => void
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
                  disabled={!task.actions.canCreatePr}
                  onClick={handleReview}
                >
                  <GitPullRequest className="mr-1.5 h-3.5 w-3.5" />
                  {t("workbench.preparePr")}
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

export function AgentWorkbench() {
  const { t } = useI18n()
  const [filter, setFilter] = useState<WorkbenchFilter>("all")
  const setSelectedChatId = useSetAtom(selectedAgentChatIdAtom)
  const setSelectedDraftId = useSetAtom(selectedDraftIdAtom)
  const setShowNewChatForm = useSetAtom(showNewChatFormAtom)
  const setDesktopView = useSetAtom(desktopViewAtom)
  const setFilteredDiffFiles = useSetAtom(filteredDiffFilesAtom)
  const setFilteredSubChatId = useSetAtom(filteredSubChatIdAtom)
  const setSelectedDiffFilePath = useSetAtom(selectedDiffFilePathAtom)
  const pendingQuestions = useAtomValue(pendingUserQuestionsAtom)
  const streamingStatuses = useStreamingStatusStore((state) => state.statuses)
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

  const tasks = (tasksQuery.data?.tasks ?? []) as WorkbenchTask[]
  const counts = tasksQuery.data?.counts

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
            onClick={() => tasksQuery.refetch()}
            disabled={tasksQuery.isFetching}
          >
            <RefreshCw
              className={cn(
                "h-3.5 w-3.5",
                tasksQuery.isFetching && "animate-spin",
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
              {counts && (
                <span className="ml-1 opacity-70">
                  {item === "needs-review"
                    ? counts.needsReview
                    : item === "all"
                      ? counts.all
                      : item === "prs"
                        ? counts.prs
                        : counts[item]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {tasksQuery.isLoading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t("workbench.loading")}
          </div>
        ) : tasks.length === 0 ? (
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
          <div className="grid gap-3">
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onOpen={openTask}
                onReview={handleReview}
                onOpenPr={handleOpenPr}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

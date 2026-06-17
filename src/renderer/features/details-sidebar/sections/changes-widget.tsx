"use client"

import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { ArrowUp, ArrowUpRight, GitPullRequest, Upload } from "lucide-react"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DiffIcon } from "@/components/ui/icons"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/ui/kbd"
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { diffSidebarOpenAtomFamily, viewedFilesAtomFamily } from "@/features/agents/atoms"
import {
  FileListItem,
  getFileDir,
  getFileName,
} from "@/features/changes/components/file-list-item"
import { CommitInput } from "@/features/changes/components/commit-input"
import { usePushAction } from "@/features/changes/hooks/use-push-action"
import { getSyncActionKind } from "@/features/changes/utils"
import { selectedFileAtomFamily } from "@/features/details-sidebar/atoms"
import { useOpenDetailsWidget } from "@/features/details-sidebar/use-open-details-widget"
import { preferredEditorAtom } from "@/lib/atoms"
import { useResolvedHotkeyDisplay } from "@/lib/hotkeys"
import { useI18n } from "@/lib/i18n"
import { trpc } from "@/lib/trpc"
import { cn } from "@/lib/utils"
import type { ChangedFile } from "../../../../shared/changes-types"
import { APP_META } from "../../../../shared/external-apps"
import type { GitHubDraftPullRequestUnavailableReason } from "../../../../shared/github-workflow-context"
import { getGitHubDraftPrUnavailableMessageKey } from "../../../../shared/github-workflow-ui-state"
import type { ParsedDiffFile } from "../types"

interface ChangesWidgetProps {
  chatId: string
  worktreePath?: string | null
  diffStats?: { additions: number; deletions: number; fileCount: number } | null
  parsedFileDiffs?: ParsedDiffFile[] | null
  onRefresh?: () => void
  pushCount?: number
  pullCount?: number
  hasUpstream?: boolean
  staged?: ChangedFile[]
  unstaged?: ChangedFile[]
  untracked?: ChangedFile[]
  isSyncStatusLoading?: boolean
  currentBranch?: string
  onExpand?: () => void
  /** Called when a file is clicked - should open diff sidebar with this file selected */
  onFileSelect?: (filePath: string) => void
  /** Diff display mode - affects file-preview handoff */
  diffDisplayMode?: "details-expanded" | "full-page"
}

interface DraftPrFormState {
  title: string
  summary: string
  testPlan: string
  body: string
}

interface DraftPrMetaState {
  repoSlug: string
  branch: string
  baseBranch: string
  changedFileCount: number
  commitCount: number
}

function getDraftPrUnavailableMessage(
  reason: GitHubDraftPullRequestUnavailableReason,
  fallback: string,
  t: ReturnType<typeof useI18n>["t"],
): string {
  const key = getGitHubDraftPrUnavailableMessageKey(reason)
  return key ? t(key) : fallback
}

/**
 * Map parsed diff file status to FileStatus type for getStatusIndicator
 */
function getFileStatus(file: ParsedDiffFile): "added" | "modified" | "deleted" | "renamed" {
  if (file.isNewFile) return "added"
  if (file.isDeletedFile) return "deleted"
  // Check for rename: oldPath and newPath are different and neither is /dev/null
  if (
    file.oldPath &&
    file.newPath &&
    file.oldPath !== "/dev/null" &&
    file.newPath !== "/dev/null" &&
    file.oldPath !== file.newPath
  ) {
    return "renamed"
  }
  return "modified"
}

function statusFilesToParsedDiffs(files: ChangedFile[]): ParsedDiffFile[] {
  const byPath = new Map<string, ChangedFile>()
  for (const file of files) {
    const previous = byPath.get(file.path)
    if (!previous) {
      byPath.set(file.path, file)
      continue
    }

    byPath.set(file.path, {
      ...previous,
      additions: previous.additions + file.additions,
      deletions: previous.deletions + file.deletions,
      status: file.status === "untracked" ? "untracked" : previous.status,
    })
  }

  return Array.from(byPath.values()).map((file) => {
    const oldPath =
      file.status === "added" || file.status === "untracked"
        ? "/dev/null"
        : (file.oldPath ?? file.path)
    const newPath = file.status === "deleted" ? "/dev/null" : file.path

    return {
      key: `${oldPath}->${newPath}`,
      oldPath,
      newPath,
      diffText: "",
      isBinary: false,
      additions: file.additions,
      deletions: file.deletions,
      isValid: true,
      fileLang: null,
      isNewFile: file.status === "added" || file.status === "untracked",
      isDeletedFile: file.status === "deleted",
    }
  })
}

function getParsedDiffDisplayPath(file: ParsedDiffFile): string {
  if (file.newPath && file.newPath !== "/dev/null") {
    return file.newPath
  }
  if (file.oldPath && file.oldPath !== "/dev/null") {
    return file.oldPath
  }
  return file.newPath || file.oldPath
}

function mergeDisplayFiles(
  statusFiles: ParsedDiffFile[],
  parsedFiles: ParsedDiffFile[],
): ParsedDiffFile[] {
  const filesByPath = new Map<string, ParsedDiffFile>()

  for (const file of parsedFiles) {
    filesByPath.set(getParsedDiffDisplayPath(file), file)
  }
  for (const file of statusFiles) {
    filesByPath.set(getParsedDiffDisplayPath(file), file)
  }

  return Array.from(filesByPath.values())
}

/**
 * Changes Widget for Overview Sidebar
 * Shows file list exactly like the Changes tab in diff sidebar
 * Memoized to prevent unnecessary re-renders when parent updates
 */
export const ChangesWidget = memo(function ChangesWidget({
  chatId,
  worktreePath,
  diffStats,
  parsedFileDiffs,
  onRefresh,
  pushCount = 0,
  pullCount = 0,
  hasUpstream = true,
  staged = [],
  unstaged = [],
  untracked = [],
  isSyncStatusLoading = false,
  currentBranch,
  onExpand,
  onFileSelect,
  diffDisplayMode = "details-expanded",
}: ChangesWidgetProps) {
  const { t } = useI18n()
  const {
    data: freshGitStatus,
    isLoading: isFreshGitStatusLoading,
  } = trpc.changes.getStatus.useQuery(
    { worktreePath: worktreePath || "" },
    {
      enabled: !!worktreePath,
      refetchOnWindowFocus: true,
      staleTime: 5000,
    },
  )
  const effectiveStaged = freshGitStatus?.staged ?? staged
  const effectiveUnstaged = freshGitStatus?.unstaged ?? unstaged
  const effectiveUntracked = freshGitStatus?.untracked ?? untracked
  const effectivePushCount = freshGitStatus?.pushCount ?? pushCount
  const effectivePullCount = freshGitStatus?.pullCount ?? pullCount
  const effectiveHasUpstream = freshGitStatus?.hasUpstream ?? hasUpstream
  const effectiveIsSyncStatusLoading =
    isSyncStatusLoading || isFreshGitStatusLoading

  // Data is now cached at the ActiveChat level via workspaceDiffCacheAtomFamily
  // So parsedFileDiffs and diffStats persist across workspace switches
  const statusFiles = useMemo(
    () =>
      statusFilesToParsedDiffs([
        ...effectiveStaged,
        ...effectiveUnstaged,
        ...effectiveUntracked,
      ]),
    [effectiveStaged, effectiveUnstaged, effectiveUntracked],
  )
  const displayFiles = useMemo(
    () => mergeDisplayFiles(statusFiles, parsedFileDiffs ?? []),
    [statusFiles, parsedFileDiffs],
  )
  const mergedStats = useMemo(
    () =>
      displayFiles.length > 0
        ? {
            additions: displayFiles.reduce(
              (sum, file) => sum + file.additions,
              0,
            ),
            deletions: displayFiles.reduce(
              (sum, file) => sum + file.deletions,
              0,
            ),
            fileCount: displayFiles.length,
          }
        : null,
    [displayFiles],
  )
  const displayStats = mergedStats ?? diffStats

  const hasChanges =
    displayFiles.length > 0 || !!(displayStats && displayStats.fileCount > 0)

  // Resolved hotkey for tooltip
  const openDiffHotkey = useResolvedHotkeyDisplay("open-diff")

  // Viewed files state (same atom as diff sidebar)
  const [viewedFiles] = useAtom(viewedFilesAtomFamily(chatId))

  // Mutations for context menu actions
  const openInFinderMutation = trpc.external.openInFinder.useMutation()
  const openInAppMutation = trpc.external.openInApp.useMutation()
  const prepareDraftPrMutation =
    trpc.githubWorkflow.prepareDraftPullRequest.useMutation()
  const createDraftPrMutation =
    trpc.githubWorkflow.createDraftPullRequest.useMutation()
  const trpcUtils = trpc.useUtils()

  const syncActionKind = getSyncActionKind({
    hasUpstream: effectiveHasUpstream,
    pullCount: effectivePullCount,
    pushCount: effectivePushCount,
    isSyncStatusLoading: effectiveIsSyncStatusLoading,
  })
  const showPushAction =
    !!worktreePath &&
    (syncActionKind === "publish" || syncActionKind === "push")
  const pushActionLabel =
    syncActionKind === "publish"
      ? t("changes.diff.publish")
      : t("changes.diff.push")
  const pushPendingLabel =
    syncActionKind === "publish"
      ? t("changes.diff.publishing")
      : t("changes.diff.pushing")
  const pushTooltip =
    syncActionKind === "publish"
      ? t("changes.diff.publishTooltip")
      : t("changes.diff.pushTooltip", {
          count: effectivePushCount,
          plural: effectivePushCount !== 1 ? "s" : "",
        })
  const pushBadge =
    syncActionKind === "push" && effectivePushCount > 0
      ? `↑${effectivePushCount}`
      : null
  const { push: pushBranch, isPending: isPushPending } = usePushAction({
    worktreePath,
    hasUpstream: effectiveHasUpstream,
    onSuccess: onRefresh,
  })
  const isLikelyDefaultBranch =
    currentBranch === "main" ||
    currentBranch === "master" ||
    currentBranch === "develop"
  const canPrepareDraftPr =
    !!worktreePath &&
    !!currentBranch &&
    !isLikelyDefaultBranch &&
    !prepareDraftPrMutation.isPending

  // Preferred editor
  const preferredEditor = useAtomValue(preferredEditorAtom)
  const editorMeta = APP_META[preferredEditor]
  // Details-owned file viewer selection
  const selectedFileAtom = useMemo(
    () => selectedFileAtomFamily(chatId),
    [chatId],
  )
  const setSelectedFilePath = useSetAtom(selectedFileAtom)
  const openDetailsWidget = useOpenDetailsWidget(chatId)

  // Diff sidebar state (to close dialog/fullscreen when opening file preview)
  const diffSidebarAtom = useMemo(
    () => diffSidebarOpenAtomFamily(chatId),
    [chatId],
  )
  const setDiffSidebarOpen = useSetAtom(diffSidebarAtom)

  // Selection state - all files selected by default
  const [selectedForCommit, setSelectedForCommit] = useState<Set<string>>(new Set())
  const [hasInitializedSelection, setHasInitializedSelection] = useState(false)
  const [draftPrForm, setDraftPrForm] = useState<DraftPrFormState | null>(null)
  const [draftPrMeta, setDraftPrMeta] = useState<DraftPrMetaState | null>(null)
  const [draftPrError, setDraftPrError] = useState<string | null>(null)
  const [isDraftPrOpen, setIsDraftPrOpen] = useState(false)
  const [createdDraftPrUrl, setCreatedDraftPrUrl] = useState<string | null>(null)
  const [isCreateDraftPrDialogOpen, setIsCreateDraftPrDialogOpen] =
    useState(false)
  const prevAllPathsRef = useRef<Set<string>>(new Set())

  // Helper to get display path (handles /dev/null for deleted files)
  const getDisplayPath = useCallback((file: ParsedDiffFile): string => {
    return getParsedDiffDisplayPath(file)
  }, [])

  // Initialize selection, then auto-select newly added paths on subsequent updates
  useEffect(() => {
    const allPaths = new Set(displayFiles.map((f) => getDisplayPath(f)))

    if (!hasInitializedSelection && displayFiles.length > 0) {
      setSelectedForCommit(allPaths)
      setHasInitializedSelection(true)
      prevAllPathsRef.current = allPaths
      return
    }

    const prevPaths = prevAllPathsRef.current
    const newPaths: string[] = []
    for (const path of allPaths) {
      if (!prevPaths.has(path)) {
        newPaths.push(path)
      }
    }

    if (newPaths.length > 0) {
      setSelectedForCommit((prev) => {
        const next = new Set(prev)
        for (const path of newPaths) {
          next.add(path)
        }
        return next
      })
    }

    prevAllPathsRef.current = allPaths
  }, [displayFiles, hasInitializedSelection, getDisplayPath])

  // Reset selection when files change significantly
  useEffect(() => {
    if (displayFiles.length === 0) {
      setHasInitializedSelection(false)
      setSelectedForCommit(new Set())
      prevAllPathsRef.current = new Set()
    }
  }, [displayFiles.length])

  // Check if file is marked as viewed using its diff key directly
  const isFileViewed = useCallback(
    (file: ParsedDiffFile): boolean => {
      // Use the actual key from the parsed diff (oldPath->newPath) for exact match
      const viewedState = viewedFiles[file.key]
      if (viewedState?.viewed) {
        return true
      }
      return false
    },
    [viewedFiles],
  )

  // Toggle individual file selection
  const handleCheckboxChange = useCallback((filePath: string) => {
    setSelectedForCommit((prev) => {
      const next = new Set(prev)
      if (next.has(filePath)) {
        next.delete(filePath)
      } else {
        next.add(filePath)
      }
      return next
    })
  }, [])

  // Selection stats - use getDisplayPath consistently for all path operations
  const selectedCount = displayFiles.filter((f) =>
    selectedForCommit.has(getDisplayPath(f)),
  ).length
  const allSelected = displayFiles.length > 0 && selectedCount === displayFiles.length
  const someSelected = selectedCount > 0 && selectedCount < displayFiles.length
  const selectedFilePaths = useMemo(
    () =>
      displayFiles
        .filter((f) => selectedForCommit.has(getDisplayPath(f)))
        .map((f) => getDisplayPath(f)),
    [displayFiles, selectedForCommit, getDisplayPath],
  )
  const canCreateDraftPr =
    !!draftPrForm?.title.trim() &&
    !!draftPrForm.body.trim() &&
    !!draftPrMeta &&
    !createDraftPrMutation.isPending

  // Toggle all files selection
  const handleSelectAllChange = useCallback(() => {
    if (allSelected) {
      setSelectedForCommit(new Set())
    } else {
      const allPaths = new Set(displayFiles.map((f) => getDisplayPath(f)))
      setSelectedForCommit(allPaths)
    }
  }, [allSelected, displayFiles, getDisplayPath])

  const handleCommitSuccess = useCallback(() => {
    setSelectedForCommit(new Set())
  }, [])

  const handlePrepareDraftPr = useCallback(async () => {
    if (!canPrepareDraftPr) return

    setDraftPrError(null)
    setCreatedDraftPrUrl(null)
    try {
      const result = await prepareDraftPrMutation.mutateAsync({ chatId })
      if (result.status === "unavailable") {
        setIsDraftPrOpen(false)
        setDraftPrForm(null)
        setDraftPrMeta(null)
        setDraftPrError(
          getDraftPrUnavailableMessage(result.reason, result.message, t),
        )
        return
      }

      const { preparation } = result
      setDraftPrForm({
        title: preparation.title,
        summary: preparation.summary,
        testPlan: preparation.testPlan,
        body: preparation.body,
      })
      setDraftPrMeta({
        repoSlug: preparation.repoSlug,
        branch: preparation.branch,
        baseBranch: preparation.baseBranch,
        changedFileCount: preparation.changedFiles.length,
        commitCount: preparation.commits.length,
      })
      setIsDraftPrOpen(true)
    } catch (error) {
      setIsDraftPrOpen(false)
      setDraftPrError(
        error instanceof Error
          ? error.message
          : t("githubWorkflow.draftPr.failed"),
      )
    }
  }, [canPrepareDraftPr, chatId, prepareDraftPrMutation, t])

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
    if (!draftPrForm || !draftPrMeta || !canCreateDraftPr) return

    setDraftPrError(null)
    setCreatedDraftPrUrl(null)
    try {
      const result = await createDraftPrMutation.mutateAsync({
        chatId,
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
          setIsDraftPrOpen(false)
        }
        return
      }

      setCreatedDraftPrUrl(result.url)
      setIsDraftPrOpen(false)
      void trpcUtils.githubWorkflow.getCurrentPullRequestContext.invalidate({
        chatId,
      })
      void trpcUtils.githubWorkflow.getStatus.invalidate({ chatId })
      void trpcUtils.chats.getPrStatus.invalidate({ chatId })
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
    chatId,
    createDraftPrMutation,
    draftPrForm,
    draftPrMeta,
    t,
    trpcUtils,
  ])

  const draftPrButton = (
    <Button
      variant="outline"
      size="sm"
      className="h-7 text-xs min-w-24"
      onClick={handlePrepareDraftPr}
      disabled={!canPrepareDraftPr}
    >
      <GitPullRequest className="mr-1.5 h-3.5 w-3.5" />
      {prepareDraftPrMutation.isPending
        ? t("githubWorkflow.draftPr.preparing")
        : t("githubWorkflow.draftPr.prepare")}
    </Button>
  )

  const pushActionButton = showPushAction ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="default"
          size="sm"
          className="h-7 flex-1 min-w-24 text-xs"
          onClick={pushBranch}
          disabled={isPushPending}
        >
          {isPushPending ? (
            <span className="truncate">{pushPendingLabel}</span>
          ) : (
            <>
              {syncActionKind === "publish" ? (
                <Upload className="mr-1.5 h-3.5 w-3.5" />
              ) : (
                <ArrowUp className="mr-1.5 h-3.5 w-3.5" />
              )}
              <span className="truncate">{pushActionLabel}</span>
              {pushBadge && (
                <span className="ml-1 rounded bg-primary-foreground/20 px-1 text-[10px]">
                  {pushBadge}
                </span>
              )}
            </>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{pushTooltip}</TooltipContent>
    </Tooltip>
  ) : null

  const draftPrPanel = (
    <>
      {draftPrError && (
        <div className="border-t border-border/50 px-2 py-2 text-xs text-destructive">
          {draftPrError}
        </div>
      )}

      {createdDraftPrUrl && (
        <div className="flex items-center justify-between gap-2 border-t border-border/50 px-2 py-2 text-xs">
          <span className="min-w-0 truncate text-emerald-600 dark:text-emerald-400">
            {t("githubWorkflow.draftPr.created")}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => window.desktopApi.openExternal(createdDraftPrUrl)}
          >
            <ArrowUpRight className="mr-1 h-3 w-3" />
            {t("githubWorkflow.draftPr.openCreated")}
          </Button>
        </div>
      )}

      {isDraftPrOpen && draftPrForm && draftPrMeta && (
        <div className="border-t border-border/50 px-2 py-2 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-medium text-foreground">
                {t("githubWorkflow.draftPr.ready")}
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground truncate">
                {t("githubWorkflow.draftPr.meta", {
                  branch: draftPrMeta.branch,
                  baseBranch: draftPrMeta.baseBranch,
                  changes: draftPrMeta.changedFileCount,
                  commits: draftPrMeta.commitCount,
                })}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => {
                setIsDraftPrOpen(false)
                setDraftPrError(null)
              }}
            >
              {t("githubWorkflow.draftPr.cancel")}
            </Button>
          </div>

          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">
              {t("githubWorkflow.draftPr.title")}
            </span>
            <Input
              value={draftPrForm.title}
              onChange={(event) =>
                updateDraftPrField("title", event.target.value)}
              className="h-7 rounded-md px-2 text-xs"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">
              {t("githubWorkflow.draftPr.summary")}
            </span>
            <Textarea
              value={draftPrForm.summary}
              onChange={(event) =>
                updateDraftPrField("summary", event.target.value)}
              className="min-h-16 rounded-md px-2 py-1.5 text-xs"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">
              {t("githubWorkflow.draftPr.testPlan")}
            </span>
            <Textarea
              value={draftPrForm.testPlan}
              onChange={(event) =>
                updateDraftPrField("testPlan", event.target.value)}
              className="min-h-14 rounded-md px-2 py-1.5 text-xs"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">
              {t("githubWorkflow.draftPr.body")}
            </span>
            <Textarea
              value={draftPrForm.body}
              onChange={(event) =>
                updateDraftPrField("body", event.target.value)}
              className="min-h-28 rounded-md px-2 py-1.5 text-xs"
            />
          </label>

          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-[11px] text-muted-foreground">
              {t("githubWorkflow.draftPr.createNotice")}
            </span>
            <Button
              variant="default"
              size="sm"
              className="h-7 text-xs"
              disabled={!canCreateDraftPr}
              onClick={() => setIsCreateDraftPrDialogOpen(true)}
            >
              {createDraftPrMutation.isPending
                ? t("githubWorkflow.draftPr.creating")
                : t("githubWorkflow.draftPr.create")}
            </Button>
          </div>

          <AlertDialog
            open={isCreateDraftPrDialogOpen}
            onOpenChange={(open) => {
              if (!createDraftPrMutation.isPending) {
                setIsCreateDraftPrDialogOpen(open)
              }
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
                  branch: draftPrMeta.branch,
                  baseBranch: draftPrMeta.baseBranch,
                  changes: draftPrMeta.changedFileCount,
                  commits: draftPrMeta.commitCount,
                })}
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={createDraftPrMutation.isPending}>
                  {t("githubWorkflow.draftPr.cancel")}
                </AlertDialogCancel>
                <AlertDialogAction
                  disabled={!canCreateDraftPr}
                  onClick={(event) => {
                    event.preventDefault()
                    void handleCreateDraftPr()
                  }}
                >
                  {createDraftPrMutation.isPending
                    ? t("githubWorkflow.draftPr.creating")
                    : t("githubWorkflow.draftPr.confirmCreate")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </>
  )

  return (
    <div className="mx-2 mb-2">
      <div className={cn("rounded-lg border border-border/50 overflow-hidden")}>
        {/* Widget Header with stats - fixed height h-8 for consistency */}
        <div className="flex items-center gap-2 px-2 h-8 select-none group bg-muted/30">
          {/* Icon */}
          <DiffIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />

          {/* Title + branch */}
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-xs font-medium text-foreground">
              {t("changes.title")}
            </span>
            {currentBranch && (
              <span className="text-xs text-muted-foreground flex items-center gap-1 min-w-0">
                <span className="shrink-0">{t("changes.onBranch")}</span>
                <span className="truncate max-w-[120px] text-foreground">
                  {currentBranch}
                </span>
              </span>
            )}
          </div>

          {/* Stats in header - total lines changed */}
          {hasChanges && displayStats && (
            <span className="text-xs text-muted-foreground">
              <span className="text-green-500">+{displayStats.additions}</span>
              {" "}
              <span className="text-red-500">-{displayStats.deletions}</span>
            </span>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Expand to sidebar button */}
          {onExpand && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onExpand}
                  className="h-5 w-5 p-0 hover:bg-foreground/10 text-muted-foreground hover:text-foreground rounded-md opacity-0 group-hover:opacity-100 transition-[background-color,opacity,transform] duration-150 ease-out active:scale-[0.97] flex-shrink-0"
                  aria-label={t("details.expandChanges")}
                >
                  <ArrowUpRight className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">
                {t("details.expandChanges")}
                {openDiffHotkey && <Kbd>{openDiffHotkey}</Kbd>}
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Content */}
        {hasChanges ? (
          <>
            {/* Select all header - like in changes-view */}
            <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border/50">
              <Checkbox
                checked={someSelected ? "indeterminate" : allSelected}
                onCheckedChange={handleSelectAllChange}
                className="size-4 border-muted-foreground/50"
              />
              <span className="text-xs text-muted-foreground">
                {t("changes.filesSelected", {
                  selected: selectedCount,
                  total: displayFiles.length,
                  plural: displayFiles.length !== 1 ? "s" : "",
                })}
              </span>
            </div>

            {/* File list - using shared FileListItem component */}
            <div className="max-h-[300px] overflow-y-auto">
              {displayFiles.map((file) => {
                const filePath = getDisplayPath(file)
                const absolutePath = worktreePath ? `${worktreePath}/${filePath}` : null

                return (
                  <FileListItem
                    key={file.key}
                    filePath={filePath}
                    fileName={getFileName(filePath)}
                    dirPath={getFileDir(filePath)}
                    status={getFileStatus(file)}
                    isChecked={selectedForCommit.has(filePath)}
                    isViewed={isFileViewed(file)}
                    isUntracked={file.isNewFile ?? false}
                    showContextMenu={!!worktreePath}
                    onSelect={() => {
                      if (onFileSelect) {
                        onFileSelect(filePath)
                      } else {
                        onExpand?.()
                      }
                    }}
                    onCheckboxChange={() => handleCheckboxChange(filePath)}
                    onCopyPath={absolutePath ? async () => {
                      await navigator.clipboard.writeText(absolutePath)
                    } : undefined}
                    onCopyRelativePath={async () => {
                      await navigator.clipboard.writeText(filePath)
                    }}
                    onRevealInFinder={absolutePath ? () => {
                      openInFinderMutation.mutate(absolutePath)
                    } : undefined}
                    onOpenInFilePreview={absolutePath ? () => {
                      setSelectedFilePath(absolutePath)
                      if (diffDisplayMode === "full-page") {
                        setDiffSidebarOpen(false)
                      }
                      openDetailsWidget("file")
                    } : undefined}
                    onOpenInEditor={absolutePath ? () => {
                      openInAppMutation.mutate({ path: absolutePath, app: preferredEditor })
                    } : undefined}
                    editorLabel={editorMeta.label}
                  />
                )
              })}
            </div>

            {/* First-class commit controls - shared with the expanded Changes surface */}
            {worktreePath && (
              <CommitInput
                worktreePath={worktreePath}
                hasStagedChanges={selectedCount > 0}
                onRefresh={onRefresh ?? (() => {})}
                onCommitSuccess={handleCommitSuccess}
                stagedCount={selectedCount}
                currentBranch={currentBranch}
                selectedFilePaths={selectedFilePaths}
                chatId={chatId}
              />
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2 p-2 border-t border-border/50">
              {pushActionButton}
              {draftPrButton}

              {/* View diff button */}
              <Button
                variant="outline"
                size="sm"
                className={cn("h-7 text-xs", showPushAction ? "w-24" : "flex-1")}
                onClick={() => onExpand?.()}
              >
                {t("changes.viewDiff")}
              </Button>
            </div>

            {draftPrPanel}
          </>
        ) : (
          <>
            <div className="text-xs text-muted-foreground px-2 py-2">
              {t("changes.noChanges")}
            </div>
            {(showPushAction || canPrepareDraftPr) && (
              <div className="flex flex-wrap gap-2 p-2 border-t border-border/50">
                {pushActionButton}
                {canPrepareDraftPr && draftPrButton}
              </div>
            )}
            {draftPrPanel}
          </>
        )}
      </div>
    </div>
  )
})

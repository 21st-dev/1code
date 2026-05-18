import { useCallback, useEffect, useRef } from "react"
import { trpcClient } from "../../../lib/trpc"
import {
  useFileChangeListener,
  useGitWatcher,
} from "../../../lib/hooks/use-file-change-listener"
import type { DiffStats, ParsedDiffFile } from "../ui/agent-diff-view"

const DIFF_THROTTLE_MS = 2000

export function useWorkspaceDiffFetch({
  chatId,
  worktreePath,
  isDiffSidebarOpen,
  setDiffStats,
  setParsedFileDiffs,
  setPrefetchedFileContents,
  setDiffContent,
}: {
  chatId: string
  worktreePath: string | null | undefined
  isDiffSidebarOpen: boolean
  setDiffStats: (value: DiffStats | ((prev: DiffStats) => DiffStats)) => void
  setParsedFileDiffs: (files: ParsedDiffFile[] | null) => void
  setPrefetchedFileContents: (contents: Record<string, string>) => void
  setDiffContent: (content: string | null) => void
}) {
  const fetchDiffStatsDebounceRef = useRef<NodeJS.Timeout | null>(null)
  const isFetchingDiffRef = useRef(false)

  const fetchDiffStats = useCallback(async () => {
    console.log("[fetchDiffStats] Called with:", { worktreePath, chatId })

    if (!worktreePath) {
      console.log("[fetchDiffStats] Skipping - no worktreePath")
      return
    }

    if (isFetchingDiffRef.current) {
      console.log("[fetchDiffStats] Skipping - already fetching")
      return
    }

    isFetchingDiffRef.current = true
    console.log("[fetchDiffStats] Starting fetch...")

    try {
      if (chatId) {
        const result = await trpcClient.chats.getParsedDiff.query({ chatId })

        if (result.files.length > 0) {
          setParsedFileDiffs(result.files)
          setPrefetchedFileContents(result.fileContents)
          setDiffContent(null)
          setDiffStats({
            fileCount: result.files.length,
            additions: result.totalAdditions,
            deletions: result.totalDeletions,
            isLoading: false,
            hasChanges: result.files.length > 0,
          })
        } else {
          setDiffStats({
            fileCount: 0,
            additions: 0,
            deletions: 0,
            isLoading: false,
            hasChanges: false,
          })
          setParsedFileDiffs([])
          setPrefetchedFileContents({})
          setDiffContent(null)
        }
      }
    } catch (error) {
      console.error("[fetchDiffStats] Error:", error)
      setDiffStats((prev) => ({ ...prev, isLoading: false }))
    } finally {
      console.log("[fetchDiffStats] Done")
      isFetchingDiffRef.current = false
    }
  }, [
    worktreePath,
    chatId,
    setDiffStats,
    setParsedFileDiffs,
    setPrefetchedFileContents,
    setDiffContent,
  ])

  const fetchDiffStatsDebounced = useCallback(() => {
    if (fetchDiffStatsDebounceRef.current) {
      clearTimeout(fetchDiffStatsDebounceRef.current)
    }
    fetchDiffStatsDebounceRef.current = setTimeout(() => {
      fetchDiffStats()
    }, 2000)
  }, [fetchDiffStats])

  const fetchDiffStatsRef = useRef(fetchDiffStatsDebounced)
  useEffect(() => {
    fetchDiffStatsRef.current = fetchDiffStatsDebounced
  }, [fetchDiffStatsDebounced])

  useEffect(() => {
    fetchDiffStats()
  }, [fetchDiffStats])

  useEffect(() => {
    if (isDiffSidebarOpen) {
      fetchDiffStats()
    }
  }, [isDiffSidebarOpen, fetchDiffStats])

  const lastDiffFetchTimeRef = useRef<number>(Date.now())
  const diffRefreshTimerRef = useRef<NodeJS.Timeout | null>(null)

  const scheduleDiffRefresh = useCallback(() => {
    const now = Date.now()
    const timeSinceLastFetch = now - lastDiffFetchTimeRef.current

    if (timeSinceLastFetch >= DIFF_THROTTLE_MS) {
      lastDiffFetchTimeRef.current = now
      fetchDiffStats()
      return
    }

    const delay = DIFF_THROTTLE_MS - timeSinceLastFetch
    if (diffRefreshTimerRef.current) {
      clearTimeout(diffRefreshTimerRef.current)
    }
    diffRefreshTimerRef.current = setTimeout(() => {
      diffRefreshTimerRef.current = null
      lastDiffFetchTimeRef.current = Date.now()
      fetchDiffStats()
    }, delay)
  }, [fetchDiffStats])

  useEffect(() => {
    return () => {
      if (fetchDiffStatsDebounceRef.current) {
        clearTimeout(fetchDiffStatsDebounceRef.current)
        fetchDiffStatsDebounceRef.current = null
      }
      if (diffRefreshTimerRef.current) {
        clearTimeout(diffRefreshTimerRef.current)
        diffRefreshTimerRef.current = null
      }
    }
  }, [])

  useFileChangeListener(worktreePath, { onChange: scheduleDiffRefresh })
  useGitWatcher(worktreePath, { onChange: scheduleDiffRefresh, debounceMs: 200 })

  return {
    fetchDiffStats,
    fetchDiffStatsRef,
    scheduleDiffRefresh,
  }
}

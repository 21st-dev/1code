import { useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"

/**
 * Hook that listens for file changes from Claude Write/Edit tools
 * and invalidates the git status query to trigger a refetch
 */
export function useFileChangeListener(
  worktreePath: string | null | undefined,
  options?: {
    onChange?: (data: { filePath: string; type: string; subChatId: string }) => void
  },
) {
  const queryClient = useQueryClient()
  const onChangeRef = useRef(options?.onChange)

  useEffect(() => {
    onChangeRef.current = options?.onChange
  }, [options?.onChange])

  useEffect(() => {
    if (!worktreePath) return

    const cleanup = window.desktopApi?.onFileChanged((data) => {
      // Check if the changed file is within our worktree
      if (data.filePath.startsWith(worktreePath)) {
        // Invalidate git status queries to trigger refetch
        queryClient.invalidateQueries({
          queryKey: [["changes", "getStatus"]],
        })
        // Invalidate parsed diff caches for both changes + chats routes
        queryClient.invalidateQueries({
          queryKey: [["changes", "getParsedDiff"]],
        })
        queryClient.invalidateQueries({
          queryKey: [["chats", "getParsedDiff"]],
        })
        onChangeRef.current?.(data)
      }
    })

    return () => {
      cleanup?.()
    }
  }, [worktreePath, queryClient])
}

/**
 * Hook that subscribes to the GitWatcher for real-time file system monitoring.
 * Uses chokidar on the main process for efficient file watching.
 * Automatically invalidates git status queries when files change.
 */
export function useGitWatcher(
  worktreePath: string | null | undefined,
  options?: {
    onChange?: (data: { worktreePath: string; changes: Array<{ path: string; type: "add" | "change" | "unlink" }> }) => void
    debounceMs?: number
  },
) {
  const queryClient = useQueryClient()
  const isSubscribedRef = useRef(false)
  const onChangeRef = useRef(options?.onChange)
  const debounceMsRef = useRef(options?.debounceMs ?? 0)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const pendingEventRef = useRef<{
    worktreePath: string
    changes: Array<{ path: string; type: "add" | "change" | "unlink" }>
  } | null>(null)

  useEffect(() => {
    onChangeRef.current = options?.onChange
    debounceMsRef.current = options?.debounceMs ?? 0
  }, [options?.onChange, options?.debounceMs])

  useEffect(() => {
    if (!worktreePath) return

    // Subscribe to git watcher on main process
    const subscribe = async () => {
      try {
        await window.desktopApi?.subscribeToGitWatcher(worktreePath)
        isSubscribedRef.current = true
      } catch (error) {
        console.error("[useGitWatcher] Failed to subscribe:", error)
      }
    }

    subscribe()

    // Listen for git status changes from the watcher
    const cleanup = window.desktopApi?.onGitStatusChanged((data) => {
      if (data.worktreePath === worktreePath) {
        // Invalidate git status queries to trigger refetch
        queryClient.invalidateQueries({
          queryKey: [["changes", "getStatus"]],
        })

        // Also invalidate parsed diff if files were modified
        const hasModifiedFiles = data.changes.some(
          (change) => change.type === "change" || change.type === "add"
        )
        if (hasModifiedFiles) {
          queryClient.invalidateQueries({
            queryKey: [["changes", "getParsedDiff"]],
          })
          queryClient.invalidateQueries({
            queryKey: [["chats", "getParsedDiff"]],
          })
        }

        const onChange = onChangeRef.current
        if (onChange) {
          const debounceMs = debounceMsRef.current
          if (debounceMs > 0) {
            pendingEventRef.current = data
            if (debounceTimerRef.current) {
              clearTimeout(debounceTimerRef.current)
            }
            debounceTimerRef.current = setTimeout(() => {
              debounceTimerRef.current = null
              if (pendingEventRef.current) {
                onChange(pendingEventRef.current)
                pendingEventRef.current = null
              }
            }, debounceMs)
          } else {
            onChange(data)
          }
        }
      }
    })

    return () => {
      cleanup?.()
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
      pendingEventRef.current = null

      // Unsubscribe from git watcher
      if (isSubscribedRef.current) {
        window.desktopApi?.unsubscribeFromGitWatcher(worktreePath).catch((error) => {
          console.error("[useGitWatcher] Failed to unsubscribe:", error)
        })
        isSubscribedRef.current = false
      }
    }
  }, [worktreePath, queryClient])
}

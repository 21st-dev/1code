/**
 * useMentionSearch Hook
 *
 * React hook for searching mentions with debouncing, cancellation,
 * and stale-while-revalidate pattern to prevent UI flickering.
 *
 * Key features:
 * - Stale data shown while fetching new results (no flicker)
 * - No loading indicators (search feels instant/local)
 * - Proper abort controller handling
 * - No state updates after unmount
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { mentionSearchEngine } from "../search"
import type { MentionItem, AggregatedSearchResult } from "../types"

/**
 * Debounce delay before starting search
 * Matches agents-file-mention.tsx for consistency
 */
const DEFAULT_DEBOUNCE_MS = 200

export interface UseMentionSearchOptions {
  /**
   * Trigger character to search for
   * @default '@'
   */
  trigger?: string

  /**
   * Project path for file-based providers
   */
  projectPath?: string

  /**
   * Session ID for context
   */
  sessionId?: string

  /**
   * Debounce delay in milliseconds
   * @default 200
   */
  debounceMs?: number

  /**
   * Whether search is enabled
   * @default true
   */
  enabled?: boolean

  /**
   * Filter to specific provider IDs
   */
  providerIds?: string[]

  /**
   * Changed files for context (shown at top of results)
   */
  changedFiles?: Array<{
    path: string
    filePath?: string // Alternative field name for compatibility
    additions: number
    deletions: number
  }>

  /**
   * MCP tools for tools provider (from sessionInfoAtom)
   */
  mcpTools?: string[]

  /**
   * MCP servers for tools provider (from sessionInfoAtom)
   */
  mcpServers?: Array<{
    name: string
    status: "connected" | "connecting" | "disconnected" | "failed"
  }>
}

export interface UseMentionSearchResult {
  /**
   * Search results (items from all providers)
   * Uses stale data while fetching to prevent flicker
   */
  items: MentionItem[]

  /**
   * Error message if search failed
   */
  error: string | null

  /**
   * Whether more results are available
   */
  hasMore: boolean

  /**
   * Warnings from providers
   */
  warnings: string[]

  /**
   * Full aggregated result (current)
   */
  result: AggregatedSearchResult | null

  /**
   * Clear all results and reset state
   */
  clear: () => void
}

/**
 * Hook for searching mentions with stale-while-revalidate pattern
 *
 * @example
 * ```tsx
 * const { items } = useMentionSearch(query, {
 *   projectPath: '/path/to/project',
 *   trigger: '@',
 * })
 *
 * // Items always available (stale data shown during fetch)
 * return (
 *   <div>
 *     {items.map(item => <Item key={item.id} {...item} />)}
 *   </div>
 * )
 * ```
 */
export function useMentionSearch(
  query: string,
  options: UseMentionSearchOptions = {}
): UseMentionSearchResult {
  const {
    trigger = "@",
    projectPath,
    sessionId,
    debounceMs = DEFAULT_DEBOUNCE_MS,
    enabled = true,
    providerIds,
    changedFiles,
    mcpTools,
    mcpServers,
  } = options

  // Current result
  const [result, setResult] = useState<AggregatedSearchResult | null>(null)

  // Previous result for stale-while-revalidate
  const [previousResult, setPreviousResult] = useState<AggregatedSearchResult | null>(null)

  const [error, setError] = useState<string | null>(null)

  // Refs for cleanup and tracking
  const debounceRef = useRef<NodeJS.Timeout | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)
  const resultRef = useRef<AggregatedSearchResult | null>(null)

  // Keep resultRef in sync with result state
  resultRef.current = result

  // Track mounted state
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Clear all results
  const clear = useCallback(() => {
    setResult(null)
    setPreviousResult(null)
    setError(null)

    // Clear timeouts
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
  }, [])

  // Normalize changedFiles to use consistent field name, filter invalid entries
  const normalizedChangedFiles = useMemo(() => {
    if (!changedFiles) return undefined
    return changedFiles
      .filter((f) => f.filePath || f.path) // Filter out entries without path
      .map((f) => ({
        path: f.filePath || f.path,
        additions: f.additions,
        deletions: f.deletions,
      }))
  }, [changedFiles])

  // Perform search
  useEffect(() => {
    // Clear previous debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }

    // Abort previous search
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }

    // If disabled, clear and skip
    if (!enabled) {
      clear()
      return
    }

    // Save current result as previous via ref (avoids infinite loop)
    if (resultRef.current) {
      setPreviousResult(resultRef.current)
    }

    // Debounce the search
    debounceRef.current = setTimeout(async () => {
      // Create abort controller for this search
      const controller = new AbortController()
      abortRef.current = controller

      try {
        const searchResult = await mentionSearchEngine.search(
          trigger,
          query,
          {
            projectPath,
            sessionId,
            changedFiles: normalizedChangedFiles,
            // Pass MCP context for tools provider
            ...(mcpTools && { mcpTools }),
            ...(mcpServers && { mcpServers }),
          } as any, // Extended context
          {
            providerIds,
          }
        )

        // Check if aborted or unmounted
        if (controller.signal.aborted || !mountedRef.current) return

        // Update state
        setResult(searchResult)
        setError(null)

        // Check for warnings when no results
        if (searchResult.items.length === 0 && searchResult.warnings.length > 0) {
          setError(searchResult.warnings[0] || null)
        }
      } catch (err) {
        // Ignore abort errors (expected when user types fast)
        if (err instanceof Error && err.name === "AbortError") return

        // Don't update state if unmounted
        if (!mountedRef.current) return

        console.error("[useMentionSearch] Error:", err)
        setError(err instanceof Error ? err.message : "Search failed")
        // Don't clear result on error - keep stale data visible
      }
    }, debounceMs)

    // Cleanup on unmount or deps change
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
      if (abortRef.current) {
        abortRef.current.abort()
        abortRef.current = null
      }
    }
  }, [
    query,
    trigger,
    projectPath,
    sessionId,
    debounceMs,
    enabled,
    providerIds,
    normalizedChangedFiles,
    mcpTools,
    mcpServers,
    clear,
    // NOTE: result intentionally NOT in deps to avoid infinite loop
    // We use resultRef.current instead
  ])

  // Return items: prefer current result, fall back to previous (stale)
  const items = useMemo(() => {
    return result?.items ?? previousResult?.items ?? []
  }, [result, previousResult])

  return {
    items,
    error,
    hasMore: result?.hasMore ?? previousResult?.hasMore ?? false,
    warnings: result?.warnings ?? [],
    result,
    clear,
  }
}

export default useMentionSearch

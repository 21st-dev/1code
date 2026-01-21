import { useAtomValue } from "jotai"
import * as React from "react"
import { createContext, useContext, useMemo, useCallback } from "react"

import {
  chatSearchOpenAtom,
  chatSearchQueryAtom,
  chatSearchMatchesAtom,
  chatSearchCurrentMatchAtom,
  type SearchMatch,
  type HighlightRange,
} from "./chat-search-atoms"

// ============================================================================
// CONTEXT TYPES
// ============================================================================

interface SearchHighlightContextValue {
  query: string
  isSearchActive: boolean
  getHighlightRanges: (
    messageId: string,
    partIndex: number,
    partType: string
  ) => HighlightRange[]
}

const SearchHighlightContext = createContext<SearchHighlightContextValue | null>(
  null
)

// ============================================================================
// PROVIDER
// ============================================================================

interface SearchHighlightProviderProps {
  children: React.ReactNode
}

// Empty context value when search is closed - stable reference to avoid re-renders
const EMPTY_HIGHLIGHT_RANGES: HighlightRange[] = []
const emptyGetHighlightRanges = () => EMPTY_HIGHLIGHT_RANGES
const CLOSED_SEARCH_VALUE: SearchHighlightContextValue = {
  query: "",
  isSearchActive: false,
  getHighlightRanges: emptyGetHighlightRanges,
}

export function SearchHighlightProvider({
  children,
}: SearchHighlightProviderProps) {
  // Only subscribe to isOpen first - this is the gate
  const isOpen = useAtomValue(chatSearchOpenAtom)

  // When search is closed, render with static empty context
  // This prevents any subscriptions to query/matches/currentMatch
  if (!isOpen) {
    return (
      <SearchHighlightContext.Provider value={CLOSED_SEARCH_VALUE}>
        {children}
      </SearchHighlightContext.Provider>
    )
  }

  // Search is open - render the active provider
  return (
    <SearchHighlightProviderActive>
      {children}
    </SearchHighlightProviderActive>
  )
}

// Separate component for when search is active
// This isolates the subscriptions to query/matches/currentMatch
function SearchHighlightProviderActive({
  children,
}: SearchHighlightProviderProps) {
  const query = useAtomValue(chatSearchQueryAtom)
  const matches = useAtomValue(chatSearchMatchesAtom)
  const currentMatch = useAtomValue(chatSearchCurrentMatchAtom)

  // Build lookup map for efficient highlight retrieval
  const matchesByKey = useMemo(() => {
    const map = new Map<string, SearchMatch[]>()
    for (const match of matches) {
      const key = `${match.messageId}:${match.partIndex}:${match.partType}`
      const existing = map.get(key) || []
      existing.push(match)
      map.set(key, existing)
    }
    return map
  }, [matches])

  const getHighlightRanges = useCallback(
    (messageId: string, partIndex: number, partType: string): HighlightRange[] => {
      const key = `${messageId}:${partIndex}:${partType}`
      const relevantMatches = matchesByKey.get(key)

      if (!relevantMatches || relevantMatches.length === 0) {
        return EMPTY_HIGHLIGHT_RANGES
      }

      return relevantMatches.map((m, idx) => ({
        offset: m.offset,
        length: m.length,
        isCurrent: currentMatch?.id === m.id,
        indexInPart: idx,
      }))
    },
    [matchesByKey, currentMatch]
  )

  const value = useMemo(
    () => ({
      query,
      isSearchActive: query.trim().length > 0,
      getHighlightRanges,
    }),
    [query, getHighlightRanges]
  )

  return (
    <SearchHighlightContext.Provider value={value}>
      {children}
    </SearchHighlightContext.Provider>
  )
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Hook to access search highlight context
 */
export function useSearchHighlightContext() {
  return useContext(SearchHighlightContext)
}

/**
 * Hook to get highlight ranges for a specific message part
 * Returns empty array if search is not active or no matches
 */
export function useSearchHighlight(
  messageId: string,
  partIndex: number,
  partType: string
): HighlightRange[] {
  const context = useContext(SearchHighlightContext)

  if (!context || !context.isSearchActive) {
    return []
  }

  return context.getHighlightRanges(messageId, partIndex, partType)
}

/**
 * Hook to check if search is currently active
 */
export function useIsSearchActive(): boolean {
  const context = useContext(SearchHighlightContext)
  return context?.isSearchActive ?? false
}

/**
 * Hook to get the current search query
 */
export function useSearchQuery(): string {
  const context = useContext(SearchHighlightContext)
  return context?.query ?? ""
}

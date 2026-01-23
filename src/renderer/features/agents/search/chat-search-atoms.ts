import { atom } from "jotai"
import { atomFamily } from "jotai/utils"

// ============================================================================
// TYPES
// ============================================================================

export interface SearchMatch {
  id: string // unique match id: `${messageId}:${partIndex}:${offset}`
  messageId: string
  partIndex: number
  partType: string // "text" | "tool-Bash:stdout" | "tool-Read:content" | etc.
  offset: number // character offset within the text
  length: number // length of matched text
}

export interface HighlightRange {
  offset: number
  length: number
  isCurrent: boolean
  indexInPart: number // 0-based index of this match within the part (for DOM highlighting)
}

// ============================================================================
// SEARCH STATE ATOMS
// ============================================================================

// Search panel open state
export const chatSearchOpenAtom = atom<boolean>(false)

// Raw input value (updates immediately for responsive UI)
export const chatSearchInputAtom = atom<string>("")

// Debounced search query (for actual searching)
export const chatSearchQueryAtom = atom<string>("")

// All matches found
export const chatSearchMatchesAtom = atom<SearchMatch[]>([])

// Current match index (0-based)
export const chatSearchCurrentIndexAtom = atom<number>(0)

// ============================================================================
// DERIVED ATOMS
// ============================================================================

// Current match for scroll-to
export const chatSearchCurrentMatchAtom = atom((get) => {
  const matches = get(chatSearchMatchesAtom)
  const index = get(chatSearchCurrentIndexAtom)
  return matches[index] ?? null
})

// Match count info for display
export const chatSearchCountInfoAtom = atom((get) => {
  const matches = get(chatSearchMatchesAtom)
  const index = get(chatSearchCurrentIndexAtom)
  return {
    current: matches.length > 0 ? index + 1 : 0,
    total: matches.length,
  }
})

// ============================================================================
// HIGHLIGHT RANGES PER MESSAGE/PART
// ============================================================================

// Cache for highlight ranges by message and part
// Key format: `${messageId}:${partIndex}:${partType}`
const highlightRangesCache = new Map<string, HighlightRange[]>()

// Atom family for getting highlight ranges for a specific message part
export const highlightRangesAtomFamily = atomFamily(
  (key: string) =>
    atom((get) => {
      const matches = get(chatSearchMatchesAtom)
      const currentMatch = get(chatSearchCurrentMatchAtom)

      // Parse key
      const [messageId, partIndexStr, partType] = key.split(":")
      const partIndex = parseInt(partIndexStr, 10)

      // Filter matches for this message/part
      const relevantMatches = matches.filter(
        (m) =>
          m.messageId === messageId &&
          m.partIndex === partIndex &&
          m.partType === partType
      )

      if (relevantMatches.length === 0) {
        return []
      }

      // Convert to highlight ranges
      const ranges: HighlightRange[] = relevantMatches.map((m, idx) => ({
        offset: m.offset,
        length: m.length,
        isCurrent: currentMatch?.id === m.id,
        indexInPart: idx,
      }))

      // Check cache for stable reference
      const cacheKey = key
      const cached = highlightRangesCache.get(cacheKey)
      if (
        cached &&
        cached.length === ranges.length &&
        cached.every(
          (r, i) =>
            r.offset === ranges[i].offset &&
            r.length === ranges[i].length &&
            r.isCurrent === ranges[i].isCurrent
        )
      ) {
        return cached
      }

      highlightRangesCache.set(cacheKey, ranges)
      return ranges
    }),
  (a, b) => a === b
)

// ============================================================================
// ACTIONS
// ============================================================================

// Navigate to next match
export const goToNextMatchAtom = atom(null, (get, set) => {
  const matches = get(chatSearchMatchesAtom)
  const currentIndex = get(chatSearchCurrentIndexAtom)
  if (matches.length === 0) return
  const newIndex = (currentIndex + 1) % matches.length
  set(chatSearchCurrentIndexAtom, newIndex)
})

// Navigate to previous match
export const goToPrevMatchAtom = atom(null, (get, set) => {
  const matches = get(chatSearchMatchesAtom)
  const currentIndex = get(chatSearchCurrentIndexAtom)
  if (matches.length === 0) return
  const newIndex = currentIndex === 0 ? matches.length - 1 : currentIndex - 1
  set(chatSearchCurrentIndexAtom, newIndex)
})

// Close search and clear state
export const closeSearchAtom = atom(null, (_get, set) => {
  set(chatSearchOpenAtom, false)
  set(chatSearchInputAtom, "")
  set(chatSearchQueryAtom, "")
  set(chatSearchMatchesAtom, [])
  set(chatSearchCurrentIndexAtom, 0)
  highlightRangesCache.clear()
})

// Open search
export const openSearchAtom = atom(null, (_get, set) => {
  set(chatSearchOpenAtom, true)
})

/**
 * Toggle search - if already open, select all text instead of closing
 * This allows users to press Cmd+F again to quickly start a new search
 */
export const toggleSearchAtom = atom(null, (get, set) => {
  const isOpen = get(chatSearchOpenAtom)
  if (isOpen) {
    // Dispatch custom event to select all text in search input
    window.dispatchEvent(new CustomEvent("chat-search-select-all"))
  } else {
    set(openSearchAtom)
  }
})

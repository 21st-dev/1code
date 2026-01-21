// Atoms
export {
  chatSearchOpenAtom,
  chatSearchInputAtom,
  chatSearchQueryAtom,
  chatSearchMatchesAtom,
  chatSearchCurrentIndexAtom,
  chatSearchCurrentMatchAtom,
  chatSearchCountInfoAtom,
  highlightRangesAtomFamily,
  goToNextMatchAtom,
  goToPrevMatchAtom,
  closeSearchAtom,
  openSearchAtom,
  toggleSearchAtom,
  type SearchMatch,
  type HighlightRange,
} from "./chat-search-atoms"

// Utils
export {
  extractSearchableText,
  findMatches,
  splitTextByHighlights,
  debounce,
  type TextSegment,
} from "./chat-search-utils"

// Components
export { ChatSearchBar } from "./chat-search-bar"

// Context
export {
  SearchHighlightProvider,
  useSearchHighlightContext,
  useSearchHighlight,
  useIsSearchActive,
  useSearchQuery,
} from "./search-highlight-context"

/**
 * Search Types for the Mention System
 *
 * Defines the context and result types for mention searches.
 * These types are used by the search engine and providers.
 */

import type { MentionItem } from "./core"

/**
 * Search context passed to providers
 * Contains all information needed to search for mentions
 */
export interface MentionSearchContext {
  /**
   * Current search query (text after trigger)
   * e.g., for "@agents side" the query is "agents side"
   */
  query: string

  /**
   * Project path for file-based providers
   */
  projectPath?: string

  /**
   * Active repository name (for multi-repo support)
   */
  repository?: string

  /**
   * Active chat/session ID
   */
  sessionId?: string

  /**
   * Sub-chat ID for context-aware filtering
   */
  subChatId?: string

  /**
   * Parent item when drilling down in hierarchy
   * e.g., when getting symbols for a file
   */
  parentItem?: MentionItem

  /**
   * Abort signal for cancellation
   * Providers should check this regularly for long operations
   */
  signal: AbortSignal

  /**
   * Maximum number of results to return
   */
  limit: number

  /**
   * Offset for pagination (optional)
   */
  offset?: number

  /**
   * Changed files in the current context
   * Useful for showing recently modified files at top
   */
  changedFiles?: Array<{
    path: string
    additions: number
    deletions: number
  }>
}

/**
 * Result from provider search
 */
export interface MentionSearchResult<TData = unknown> {
  /**
   * Array of matching mention items
   */
  items: MentionItem<TData>[]

  /**
   * Whether more results are available (for pagination)
   */
  hasMore: boolean

  /**
   * Total count of matching items (for display purposes)
   */
  totalCount?: number

  /**
   * Warning message if search partially failed
   * e.g., "Some results may be missing due to timeout"
   */
  warning?: string

  /**
   * Time taken for the search in milliseconds
   */
  timing?: number
}

/**
 * Aggregated search result from multiple providers
 */
export interface AggregatedSearchResult {
  /**
   * Results grouped by provider ID
   */
  byProvider: Map<string, MentionSearchResult>

  /**
   * Merged and sorted items from all providers
   */
  items: MentionItem[]

  /**
   * Whether any provider has more results
   */
  hasMore: boolean

  /**
   * Warnings from all providers
   */
  warnings: string[]

  /**
   * Total time for the aggregated search
   */
  timing: number
}

/**
 * Search options for the search engine
 */
export interface MentionSearchOptions {
  /**
   * Debounce delay in milliseconds
   * @default 100
   */
  debounceMs?: number

  /**
   * Timeout for individual provider searches
   * @default 500
   */
  timeoutMs?: number

  /**
   * Whether to use cached results
   * @default true
   */
  useCache?: boolean

  /**
   * Whether to search providers in parallel
   * @default true
   */
  parallel?: boolean

  /**
   * Filter to specific provider IDs
   */
  providerIds?: string[]
}

/**
 * Search relevance score for sorting
 */
export interface RelevanceScore {
  /**
   * Exact match bonus (query === label)
   */
  exactMatch: number

  /**
   * Prefix match bonus (label starts with query)
   */
  prefixMatch: number

  /**
   * Contains match (query found in label)
   */
  containsMatch: number

  /**
   * Path match (query found in path/description)
   */
  pathMatch: number

  /**
   * Keywords match (query matches item.keywords)
   */
  keywordsMatch: number

  /**
   * Recency bonus (recently modified)
   */
  recency: number

  /**
   * Priority from provider
   */
  priority: number

  /**
   * Final computed score
   */
  total: number
}

/**
 * Calculate relevance score for an item
 */
export function calculateRelevance(
  item: MentionItem,
  query: string
): RelevanceScore {
  const normalizedQuery = query.toLowerCase().trim()
  const normalizedLabel = item.label.toLowerCase()
  const normalizedDescription = item.description?.toLowerCase() ?? ""

  // Split query into words for multi-word matching
  const queryWords = normalizedQuery.split(/\s+/).filter(Boolean)
  const firstWord = queryWords[0] ?? ""

  let exactMatch = 0
  let prefixMatch = 0
  let containsMatch = 0
  let pathMatch = 0
  let keywordsMatch = 0

  // Empty query - return neutral score (items sorted by priority)
  if (queryWords.length === 0 || !normalizedQuery) {
    return {
      exactMatch: 0,
      prefixMatch: 0,
      containsMatch: 0,
      pathMatch: 0,
      keywordsMatch: 0,
      recency: 0,
      priority: Math.min(Math.max(item.priority ?? 0, -100), 100),
      total: Math.min(Math.max(item.priority ?? 0, -100), 100),
    }
  }

  // Single word query
  if (queryWords.length === 1) {
    if (normalizedLabel === normalizedQuery) {
      exactMatch = 100
    } else if (firstWord && normalizedLabel.startsWith(firstWord)) {
      prefixMatch = 80
    } else if (normalizedLabel.includes(normalizedQuery)) {
      containsMatch = 50
    }

    if (normalizedDescription.includes(normalizedQuery)) {
      pathMatch = 30
    }
  } else {
    // Multi-word query - all words must match somewhere
    const allWordsMatch = queryWords.every(
      (word) =>
        normalizedLabel.includes(word) || normalizedDescription.includes(word)
    )

    if (allWordsMatch) {
      // Bonus for label starting with first word
      if (firstWord && normalizedLabel.startsWith(firstWord)) {
        prefixMatch = 60
      }
      containsMatch = 40
    }
  }

  // Check keywords (e.g., agent tools, skill tags)
  // This allows finding agents by their allowed tools
  if (item.keywords && item.keywords.length > 0 && queryWords.length > 0) {
    const normalizedKeywords = item.keywords.map((k) => k.toLowerCase())
    const matchedKeywords = queryWords.filter((word) =>
      normalizedKeywords.some((kw) => kw.includes(word))
    )
    // 20 points per matched keyword, up to 60
    keywordsMatch = Math.min(matchedKeywords.length * 20, 60)
  }

  // Priority from item (clamped to prevent abuse)
  const priority = Math.min(Math.max(item.priority ?? 0, -100), 100)

  // Calculate total
  const total = exactMatch + prefixMatch + containsMatch + pathMatch + keywordsMatch + priority

  return {
    exactMatch,
    prefixMatch,
    containsMatch,
    pathMatch,
    keywordsMatch,
    recency: 0, // Would be calculated with file mtime
    priority,
    total,
  }
}

/**
 * Sort items by relevance to query
 */
export function sortByRelevance<T extends MentionItem>(
  items: T[],
  query: string
): T[] {
  if (!query.trim()) {
    // No query - sort by priority only
    return [...items].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
  }

  return [...items]
    .map((item) => ({
      item,
      score: calculateRelevance(item, query),
    }))
    .sort((a, b) => {
      // Primary: total score
      if (b.score.total !== a.score.total) {
        return b.score.total - a.score.total
      }
      // Secondary: shorter labels (more specific matches)
      return a.item.label.length - b.item.label.length
    })
    .map(({ item }) => item)
}

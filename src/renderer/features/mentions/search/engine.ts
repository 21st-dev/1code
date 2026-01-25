/**
 * Mention Search Engine
 *
 * Orchestrates search across all registered providers.
 * Features:
 * - Multi-tier search (cache → providers)
 * - Parallel provider queries
 * - Debouncing and cancellation
 * - Result aggregation and sorting
 */

import { mentionRegistry } from "../registry"
import { MentionCache } from "./cache"
import type {
  MentionProvider,
  MentionItem,
  MentionSearchContext,
  MentionSearchResult,
  MentionSearchOptions,
  AggregatedSearchResult,
} from "../types"
import { sortByRelevance } from "../types"

/**
 * Default search options
 * Debounce unified with use-mention-search.ts (200ms)
 */
const DEFAULT_OPTIONS: Required<MentionSearchOptions> = {
  debounceMs: 200,
  timeoutMs: 500,
  useCache: true,
  parallel: true,
  providerIds: [],
}

/**
 * Search engine for mentions
 */
export class MentionSearchEngine {
  private cache: MentionCache
  private pendingSearches = new Map<string, AbortController>()

  constructor(cache?: MentionCache) {
    this.cache = cache ?? new MentionCache()
  }

  /**
   * Search across all registered providers
   */
  async search(
    trigger: string,
    query: string,
    baseContext: Omit<MentionSearchContext, "query" | "signal" | "limit">,
    options: MentionSearchOptions = {}
  ): Promise<AggregatedSearchResult> {
    const startTime = performance.now()
    const opts = { ...DEFAULT_OPTIONS, ...options }

    // Cancel any pending search for this trigger
    const searchKey = `${trigger}:${baseContext.projectPath ?? "global"}`
    const existingController = this.pendingSearches.get(searchKey)
    if (existingController) {
      existingController.abort()
    }

    // Create new abort controller
    const controller = new AbortController()
    this.pendingSearches.set(searchKey, controller)

    try {
      // Get applicable providers
      let providers = mentionRegistry.getByTrigger(trigger)

      // Filter by provider IDs if specified
      if (opts.providerIds && opts.providerIds.length > 0) {
        const providerIdSet = new Set(opts.providerIds)
        providers = providers.filter((p) => providerIdSet.has(p.id))
      }

      // Filter by availability
      providers = providers.filter(
        (p) => p.isAvailable?.({ projectPath: baseContext.projectPath }) ?? true
      )

      if (providers.length === 0) {
        return this.createEmptyResult(startTime)
      }

      // Build search context
      const context: MentionSearchContext = {
        ...baseContext,
        query,
        signal: controller.signal,
        limit: 50,
      }

      // Search all providers
      const results = opts.parallel
        ? await this.searchParallel(providers, context, opts)
        : await this.searchSequential(providers, context, opts)

      // Aggregate results
      return this.aggregateResults(results, query, startTime)
    } finally {
      // Cleanup
      this.pendingSearches.delete(searchKey)
    }
  }

  /**
   * Search a single provider
   */
  async searchProvider(
    provider: MentionProvider,
    context: MentionSearchContext,
    options: MentionSearchOptions = {}
  ): Promise<MentionSearchResult> {
    const opts = { ...DEFAULT_OPTIONS, ...options }

    // Check cache first
    if (opts.useCache) {
      const cacheKey = MentionCache.createKey(provider.id, context.query, {
        projectPath: context.projectPath,
      })
      const cached = this.cache.get<MentionSearchResult>(cacheKey)
      if (cached) {
        return cached
      }
    }

    // Search provider with timeout (cancellable)
    let timeoutId: NodeJS.Timeout | null = null

    try {
      const result = await Promise.race([
        provider.search(context),
        this.createCancellableTimeout(opts.timeoutMs, (id) => {
          timeoutId = id
        }),
      ])

      // Clear timeout if search completed first
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
      }

      // Cache the result
      if (opts.useCache && result.items.length > 0) {
        const cacheKey = MentionCache.createKey(provider.id, context.query, {
          projectPath: context.projectPath,
        })
        this.cache.set(cacheKey, result)
      }

      return result
    } catch (error) {
      // Always clear timeout on error
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
      }

      if (error instanceof Error && error.name === "AbortError") {
        return { items: [], hasMore: false }
      }
      console.error(`[SearchEngine] Provider "${provider.id}" error:`, error)
      return {
        items: [],
        hasMore: false,
        warning: `${provider.name} search failed`,
      }
    }
  }

  /**
   * Search providers in parallel
   */
  private async searchParallel(
    providers: MentionProvider[],
    context: MentionSearchContext,
    options: MentionSearchOptions
  ): Promise<Map<string, MentionSearchResult>> {
    const results = new Map<string, MentionSearchResult>()

    const searchPromises = providers.map(async (provider) => {
      const result = await this.searchProvider(provider, context, options)
      results.set(provider.id, result)
    })

    await Promise.allSettled(searchPromises)
    return results
  }

  /**
   * Search providers sequentially
   */
  private async searchSequential(
    providers: MentionProvider[],
    context: MentionSearchContext,
    options: MentionSearchOptions
  ): Promise<Map<string, MentionSearchResult>> {
    const results = new Map<string, MentionSearchResult>()

    for (const provider of providers) {
      if (context.signal.aborted) break

      const result = await this.searchProvider(provider, context, options)
      results.set(provider.id, result)
    }

    return results
  }

  /**
   * Aggregate results from multiple providers
   */
  private aggregateResults(
    resultsByProvider: Map<string, MentionSearchResult>,
    query: string,
    startTime: number
  ): AggregatedSearchResult {
    const allItems: MentionItem[] = []
    const warnings: string[] = []
    let hasMore = false

    Array.from(resultsByProvider.values()).forEach((result) => {
      allItems.push(...result.items)
      if (result.hasMore) hasMore = true
      if (result.warning) warnings.push(result.warning)
    })

    // Sort by relevance
    const sortedItems = sortByRelevance(allItems, query)

    return {
      byProvider: resultsByProvider,
      items: sortedItems,
      hasMore,
      warnings,
      timing: performance.now() - startTime,
    }
  }

  /**
   * Create empty result
   */
  private createEmptyResult(startTime: number): AggregatedSearchResult {
    return {
      byProvider: new Map(),
      items: [],
      hasMore: false,
      warnings: [],
      timing: performance.now() - startTime,
    }
  }

  /**
   * Create cancellable timeout promise
   * The onTimeoutId callback receives the timeout ID for cleanup
   */
  private createCancellableTimeout(
    ms: number,
    onTimeoutId: (id: NodeJS.Timeout) => void
  ): Promise<never> {
    return new Promise((_, reject) => {
      const timeoutId = setTimeout(() => {
        const error = new Error("Search timeout")
        error.name = "TimeoutError"
        reject(error)
      }, ms)
      onTimeoutId(timeoutId)
    })
  }

  /**
   * Cancel all pending searches
   */
  cancelAll(): void {
    Array.from(this.pendingSearches.values()).forEach((controller) => {
      controller.abort()
    })
    this.pendingSearches.clear()
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear()
  }

  /**
   * Invalidate cache for a provider
   */
  invalidateProvider(providerId: string): void {
    this.cache.invalidateProvider(providerId)
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.getStats()
  }
}

/**
 * Global search engine instance
 */
export const mentionSearchEngine = new MentionSearchEngine()

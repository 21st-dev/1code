/**
 * Mention Search Cache
 *
 * Multi-layer caching system for mention search results.
 * Supports LRU eviction, TTL expiration, and git-aware invalidation.
 */

/**
 * Cache entry with expiration
 */
interface CacheEntry<T> {
  value: T
  expires: number
  hitCount: number
}

/**
 * Cache options
 */
export interface MentionCacheOptions {
  /**
   * Maximum number of entries in the cache
   * @default 500
   */
  maxSize?: number

  /**
   * Default TTL in milliseconds
   * @default 30000 (30 seconds)
   */
  defaultTtl?: number
}

/**
 * LRU Cache with TTL support
 */
export class MentionCache {
  private cache = new Map<string, CacheEntry<unknown>>()
  private maxSize: number
  private defaultTtl: number
  private hits = 0
  private misses = 0

  constructor(options: MentionCacheOptions = {}) {
    this.maxSize = options.maxSize ?? 500
    this.defaultTtl = options.defaultTtl ?? 30000 // 30 seconds
  }

  /**
   * Get a value from the cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key)

    if (!entry) {
      this.misses++
      return null
    }

    // Check expiration
    if (Date.now() > entry.expires) {
      this.cache.delete(key)
      this.misses++
      return null
    }

    // Update hit count and move to end (LRU)
    entry.hitCount++
    this.cache.delete(key)
    this.cache.set(key, entry)

    this.hits++
    return entry.value as T
  }

  /**
   * Set a value in the cache
   */
  set<T>(key: string, value: T, ttl?: number): void {
    // LRU eviction if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value
      if (firstKey) {
        this.cache.delete(firstKey)
      }
    }

    this.cache.set(key, {
      value,
      expires: Date.now() + (ttl ?? this.defaultTtl),
      hitCount: 0,
    })
  }

  /**
   * Invalidate entries matching a pattern
   * Pattern supports * as wildcard
   */
  invalidate(pattern: string): number {
    // Escape regex special characters first, then convert * to .*
    const escapedPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&") // Escape special regex chars (except *)
      .replace(/\*/g, ".*") // Convert * to .*
    const regex = new RegExp("^" + escapedPattern + "$")
    let count = 0

    Array.from(this.cache.keys()).forEach((key) => {
      if (regex.test(key)) {
        this.cache.delete(key)
        count++
      }
    })

    return count
  }

  /**
   * Invalidate entries for a specific provider
   */
  invalidateProvider(providerId: string): number {
    return this.invalidate(`${providerId}:*`)
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear()
    this.hits = 0
    this.misses = 0
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number
    maxSize: number
    hits: number
    misses: number
    hitRate: number
  } {
    const total = this.hits + this.misses
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
    }
  }

  /**
   * Generate a cache key for a search query
   * Uses URI encoding to prevent collision when parts contain separators
   */
  static createKey(
    providerId: string,
    query: string,
    context?: { projectPath?: string }
  ): string {
    const parts = [providerId, query]
    if (context?.projectPath) {
      parts.push(context.projectPath)
    }
    // Encode each part to prevent collision from separator characters
    return parts.map((p) => encodeURIComponent(p)).join(":")
  }
}

/**
 * Global cache instance
 */
export const mentionCache = new MentionCache()

/**
 * Git-aware cache that invalidates on branch changes
 */
export class GitAwareCache extends MentionCache {
  private currentHead: string | null = null
  private headChangeListeners = new Set<() => void>()

  /**
   * Update the current git HEAD
   * If HEAD changes, invalidate file-related caches
   */
  updateHead(newHead: string): void {
    if (this.currentHead && this.currentHead !== newHead) {
      // Branch changed - invalidate file-related caches
      this.invalidate("files:*")
      this.notifyHeadChange()
    }
    this.currentHead = newHead
  }

  /**
   * Subscribe to head change events
   */
  onHeadChange(listener: () => void): () => void {
    this.headChangeListeners.add(listener)
    return () => this.headChangeListeners.delete(listener)
  }

  private notifyHeadChange(): void {
    Array.from(this.headChangeListeners).forEach((listener) => {
      try {
        listener()
      } catch (error) {
        console.error("[GitAwareCache] Listener error:", error)
      }
    })
  }
}

/**
 * Global git-aware cache instance
 */
export const gitAwareCache = new GitAwareCache()

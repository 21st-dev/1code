import { createHash } from "crypto";

interface CacheEntry<T> {
	data: T;
	hash: string;
	timestamp: number;
	accessCount: number;
	sizeBytes: number;
}

interface CacheConfig {
	maxAge: number; // TTL in ms
	maxEntries: number;
	maxSizeBytes?: number;
}

/**
 * LRU Cache with TTL and optional size limits.
 * Supports hash-based invalidation for efficient updates.
 */
class LRUCache<T> {
	private cache: Map<string, CacheEntry<T>> = new Map();
	private config: CacheConfig;
	private currentSizeBytes = 0;

	constructor(config: CacheConfig) {
		this.config = config;
	}

	/**
	 * Get an entry from the cache if it exists and is not expired.
	 */
	get(key: string): T | null {
		const entry = this.cache.get(key);
		if (!entry) return null;

		// Check TTL
		if (Date.now() - entry.timestamp > this.config.maxAge) {
			this.delete(key);
			return null;
		}

		// Update access count for LRU
		entry.accessCount++;
		return entry.data;
	}

	/**
	 * Get entry only if hash matches (for conditional updates).
	 */
	getIfHashMatches(key: string, hash: string): T | null {
		const entry = this.cache.get(key);
		if (!entry) return null;

		// Check TTL
		if (Date.now() - entry.timestamp > this.config.maxAge) {
			this.delete(key);
			return null;
		}

		// Check hash
		if (entry.hash !== hash) {
			return null;
		}

		entry.accessCount++;
		return entry.data;
	}

	/**
	 * Set an entry in the cache.
	 */
	set(key: string, data: T, hash: string, sizeBytes = 0): void {
		// Evict if necessary
		this.evictIfNeeded(sizeBytes);

		// Delete existing entry first to update size tracking
		if (this.cache.has(key)) {
			this.delete(key);
		}

		const entry: CacheEntry<T> = {
			data,
			hash,
			timestamp: Date.now(),
			accessCount: 1,
			sizeBytes,
		};

		this.cache.set(key, entry);
		this.currentSizeBytes += sizeBytes;
	}

	/**
	 * Delete an entry from the cache.
	 */
	delete(key: string): boolean {
		const entry = this.cache.get(key);
		if (entry) {
			this.currentSizeBytes -= entry.sizeBytes;
			return this.cache.delete(key);
		}
		return false;
	}

	/**
	 * Invalidate all entries for a given worktree path.
	 */
	invalidateByPrefix(prefix: string): number {
		let count = 0;
		const keys = Array.from(this.cache.keys());
		for (const key of keys) {
			if (key.startsWith(prefix)) {
				this.delete(key);
				count++;
			}
		}
		return count;
	}

	/**
	 * Clear all entries.
	 */
	clear(): void {
		this.cache.clear();
		this.currentSizeBytes = 0;
	}

	/**
	 * Get cache statistics.
	 */
	getStats(): {
		entries: number;
		sizeBytes: number;
		maxEntries: number;
		maxSizeBytes: number | undefined;
	} {
		return {
			entries: this.cache.size,
			sizeBytes: this.currentSizeBytes,
			maxEntries: this.config.maxEntries,
			maxSizeBytes: this.config.maxSizeBytes,
		};
	}

	private evictIfNeeded(incomingSizeBytes: number): void {
		// Evict by entry count
		while (this.cache.size >= this.config.maxEntries) {
			this.evictLRU();
		}

		// Evict by size if configured
		if (this.config.maxSizeBytes) {
			while (
				this.currentSizeBytes + incomingSizeBytes >
					this.config.maxSizeBytes &&
				this.cache.size > 0
			) {
				this.evictLRU();
			}
		}
	}

	private evictLRU(): void {
		let lruKey: string | null = null;
		let lruAccessCount = Number.POSITIVE_INFINITY;
		let lruTimestamp = Number.POSITIVE_INFINITY;

		const entries = Array.from(this.cache.entries());
		for (const [key, entry] of entries) {
			// Prioritize by access count, then by timestamp
			if (
				entry.accessCount < lruAccessCount ||
				(entry.accessCount === lruAccessCount &&
					entry.timestamp < lruTimestamp)
			) {
				lruKey = key;
				lruAccessCount = entry.accessCount;
				lruTimestamp = entry.timestamp;
			}
		}

		if (lruKey) {
			this.delete(lruKey);
		}
	}
}

/**
 * Compute content hash for cache invalidation.
 */
export function computeContentHash(content: string): string {
	return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

/**
 * Estimate byte size of a JavaScript value.
 */
export function estimateSizeBytes(value: unknown): number {
	if (typeof value === "string") {
		return value.length * 2; // UTF-16
	}
	if (typeof value === "number") {
		return 8;
	}
	if (typeof value === "boolean") {
		return 4;
	}
	if (value === null || value === undefined) {
		return 0;
	}
	if (Array.isArray(value)) {
		return value.reduce(
			(sum, item) => sum + estimateSizeBytes(item),
			64,
		);
	}
	if (typeof value === "object") {
		return Object.entries(value).reduce(
			(sum, [key, val]) =>
				sum + key.length * 2 + estimateSizeBytes(val),
			64,
		);
	}
	return 0;
}

// Cache configuration
const CACHE_CONFIGS = {
	// Git status - short lived, frequently invalidated
	status: {
		maxAge: 5000, // 5 seconds
		maxEntries: 20,
	},
	// Parsed diff - longer lived, hash-based invalidation
	parsedDiff: {
		maxAge: 60000, // 1 minute
		maxEntries: 100,
		maxSizeBytes: 50 * 1024 * 1024, // 50MB
	},
	// File contents - content-addressed, longer TTL
	fileContents: {
		maxAge: 300000, // 5 minutes
		maxEntries: 500,
		maxSizeBytes: 100 * 1024 * 1024, // 100MB
	},
} as const;

/**
 * GitCache provides caching for git operations.
 * Uses different caching strategies for different data types.
 */
class GitCache {
	private statusCache: LRUCache<unknown>;
	private parsedDiffCache: LRUCache<unknown>;
	private fileContentsCache: LRUCache<string>;

	constructor() {
		this.statusCache = new LRUCache(CACHE_CONFIGS.status);
		this.parsedDiffCache = new LRUCache(CACHE_CONFIGS.parsedDiff);
		this.fileContentsCache = new LRUCache(CACHE_CONFIGS.fileContents);
	}

	// Status cache methods
	getStatus<T>(worktreePath: string): T | null {
		return this.statusCache.get(worktreePath) as T | null;
	}

	setStatus<T>(worktreePath: string, status: T): void {
		const hash = computeContentHash(JSON.stringify(status));
		this.statusCache.set(worktreePath, status, hash);
	}

	invalidateStatus(worktreePath: string): void {
		this.statusCache.delete(worktreePath);
	}

	// Parsed diff cache methods
	getParsedDiff<T>(worktreePath: string, diffHash: string): T | null {
		const key = `${worktreePath}:${diffHash}`;
		return this.parsedDiffCache.getIfHashMatches(key, diffHash) as T | null;
	}

	setParsedDiff<T>(worktreePath: string, diffHash: string, parsed: T): void {
		const key = `${worktreePath}:${diffHash}`;
		const sizeBytes = estimateSizeBytes(parsed);
		this.parsedDiffCache.set(key, parsed, diffHash, sizeBytes);
	}

	invalidateParsedDiff(worktreePath: string): number {
		return this.parsedDiffCache.invalidateByPrefix(worktreePath);
	}

	// File contents cache methods
	getFileContent(worktreePath: string, filePath: string): string | null {
		const key = `${worktreePath}:${filePath}`;
		return this.fileContentsCache.get(key);
	}

	getFileContentIfHashMatches(
		worktreePath: string,
		filePath: string,
		contentHash: string,
	): string | null {
		const key = `${worktreePath}:${filePath}`;
		return this.fileContentsCache.getIfHashMatches(key, contentHash);
	}

	setFileContent(
		worktreePath: string,
		filePath: string,
		content: string,
	): void {
		const key = `${worktreePath}:${filePath}`;
		const hash = computeContentHash(content);
		this.fileContentsCache.set(key, content, hash, content.length * 2);
	}

	invalidateFileContent(worktreePath: string, filePath: string): void {
		const key = `${worktreePath}:${filePath}`;
		this.fileContentsCache.delete(key);
	}

	invalidateAllFileContents(worktreePath: string): number {
		return this.fileContentsCache.invalidateByPrefix(worktreePath);
	}

	// Invalidate all caches for a worktree
	invalidateWorktree(worktreePath: string): void {
		this.statusCache.delete(worktreePath);
		this.parsedDiffCache.invalidateByPrefix(worktreePath);
		this.fileContentsCache.invalidateByPrefix(worktreePath);
	}

	// Get statistics for monitoring
	getStats(): {
		status: ReturnType<LRUCache<unknown>["getStats"]>;
		parsedDiff: ReturnType<LRUCache<unknown>["getStats"]>;
		fileContents: ReturnType<LRUCache<string>["getStats"]>;
	} {
		return {
			status: this.statusCache.getStats(),
			parsedDiff: this.parsedDiffCache.getStats(),
			fileContents: this.fileContentsCache.getStats(),
		};
	}

	// Clear all caches
	clearAll(): void {
		this.statusCache.clear();
		this.parsedDiffCache.clear();
		this.fileContentsCache.clear();
	}
}

// Singleton instance
export const gitCache = new GitCache();

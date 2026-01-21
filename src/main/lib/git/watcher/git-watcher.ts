import { EventEmitter } from "events";

// Chokidar is ESM-only, so we need to dynamically import it
type FSWatcher = Awaited<ReturnType<typeof import("chokidar")>>["FSWatcher"] extends new () => infer T ? T : never;

// Simple debounce implementation to avoid lodash-es dependency in main process
function debounce<T extends (...args: unknown[]) => unknown>(
	func: T,
	wait: number,
): (...args: Parameters<T>) => void {
	let timeoutId: NodeJS.Timeout | null = null;
	return (...args: Parameters<T>) => {
		if (timeoutId) clearTimeout(timeoutId);
		timeoutId = setTimeout(() => func(...args), wait);
	};
}

export type FileChangeType = "add" | "change" | "unlink";

export interface FileChange {
	path: string;
	type: FileChangeType;
}

export interface GitWatchEvent {
	type: "batch";
	changes: FileChange[];
	timestamp: number;
	worktreePath: string;
}

interface GitWatcherConfig {
	worktreePath: string;
	debounceMs?: number;
	ignorePatterns?: string[];
}

const DEFAULT_IGNORE_PATTERNS = [
	// Node/JS
	"**/node_modules/**",
	"**/dist/**",
	"**/build/**",
	"**/out/**",
	"**/.next/**",
	"**/.turbo/**",
	"**/.cache/**",
	"**/coverage/**",
	"**/*.log",
	"**/.DS_Store",
	"**/package-lock.json",
	"**/pnpm-lock.yaml",
	"**/yarn.lock",
	"**/.env*",
	"**/*.map",
	"**/*.d.ts",
	// Rust
	"**/target/**",
	// Python
	"**/__pycache__/**",
	"**/.pytest_cache/**",
	"**/*.pyc",
	// Go/PHP
	"**/vendor/**",
	// Java/Kotlin
	"**/.gradle/**",
	"**/*.class",
	// IDE
	"**/.idea/**",
	"**/.vscode/**",
	// iOS
	"**/Pods/**",
	// C/C++
	"**/*.o",
	"**/*.obj",
	// Temporary files
	"**/*.swp",
	"**/*.swo",
	"**/*~",
];

/**
 * GitWatcher monitors a worktree directory for file changes using chokidar.
 * Changes are batched and debounced to avoid overwhelming the renderer with events.
 */
export class GitWatcher extends EventEmitter {
	private watcher: FSWatcher | null = null;
	private worktreePath: string;
	private pendingChanges: Map<string, FileChangeType> = new Map();
	private isDisposed = false;
	private debounceMs: number;
	private initPromise: Promise<void>;

	constructor(config: GitWatcherConfig) {
		super();
		this.worktreePath = config.worktreePath;
		this.debounceMs = config.debounceMs ?? 100;
		this.initPromise = this.initWatcher(config);
	}

	private async initWatcher(config: GitWatcherConfig): Promise<void> {
		// Dynamic import for ESM-only chokidar
		const chokidar = await import("chokidar");
		const path = await import("path");

		// Strategy: Watch ONLY .git/index and .git/HEAD
		// - .git/index changes on ANY git operation (commit, stage, unstage, checkout, merge, etc.)
		// - .git/HEAD changes on branch switches
		// This uses only 2 file descriptors instead of thousands, avoiding EMFILE errors
		const gitIndexPath = path.join(config.worktreePath, ".git", "index");
		const gitHeadPath = path.join(config.worktreePath, ".git", "HEAD");

		const watchPaths = [gitIndexPath, gitHeadPath];

		this.watcher = chokidar.watch(watchPaths, {
			persistent: true,
			ignoreInitial: true,
			awaitWriteFinish: {
				stabilityThreshold: 50,
				pollInterval: 25,
			},
			// Native events (no polling) for efficiency
			usePolling: false,
			// Don't follow symlinks
			followSymlinks: false,
		});

		// Debounced flush function
		const flushChanges = debounce(() => {
			if (this.isDisposed || this.pendingChanges.size === 0) return;

			const changes: FileChange[] = Array.from(
				this.pendingChanges.entries(),
			).map(([path, type]) => ({
				path,
				type,
			}));

			this.pendingChanges.clear();

			const event: GitWatchEvent = {
				type: "batch",
				changes,
				timestamp: Date.now(),
				worktreePath: this.worktreePath,
			};

			this.emit("change", event);
		}, this.debounceMs);

		this.watcher
			.on("add", (path: string) => {
				this.pendingChanges.set(path, "add");
				flushChanges();
			})
			.on("change", (path: string) => {
				this.pendingChanges.set(path, "change");
				flushChanges();
			})
			.on("unlink", (path: string) => {
				this.pendingChanges.set(path, "unlink");
				flushChanges();
			})
			.on("error", (error: Error) => {
				console.error("[GitWatcher] Error:", error);
				this.emit("error", error);
			});

		console.log(`[GitWatcher] Watching: ${config.worktreePath}`);
	}

	/**
	 * Wait for the watcher to be initialized.
	 */
	async waitForReady(): Promise<void> {
		await this.initPromise;
	}

	getWorktreePath(): string {
		return this.worktreePath;
	}

	async dispose(): Promise<void> {
		if (this.isDisposed) return;
		this.isDisposed = true;

		// Wait for init to complete before disposing
		await this.initPromise.catch(() => {});

		await this.watcher?.close();
		this.pendingChanges.clear();
		this.removeAllListeners();
		console.log(`[GitWatcher] Disposed: ${this.worktreePath}`);
	}
}

/**
 * Registry for managing multiple GitWatcher instances (one per worktree).
 * Ensures only one watcher exists per worktree path.
 */
class GitWatcherRegistry {
	private watchers: Map<string, GitWatcher> = new Map();
	private listeners: Map<string, Set<(event: GitWatchEvent) => void>> =
		new Map();

	/**
	 * Get or create a watcher for the given worktree path.
	 * If a watcher already exists, returns the existing one.
	 */
	async getOrCreate(worktreePath: string): Promise<GitWatcher> {
		let watcher = this.watchers.get(worktreePath);
		if (!watcher) {
			watcher = new GitWatcher({
				worktreePath,
				debounceMs: 100,
			});
			this.watchers.set(worktreePath, watcher);

			// Wire up event forwarding
			watcher.on("change", (event: GitWatchEvent) => {
				const listeners = this.listeners.get(worktreePath);
				if (listeners) {
					const callbacks = Array.from(listeners);
					for (const callback of callbacks) {
						try {
							callback(event);
						} catch (error) {
							console.error(
								"[GitWatcherRegistry] Listener error:",
								error,
							);
						}
					}
				}
			});

			// Wait for the watcher to be ready
			await watcher.waitForReady();
		}
		return watcher;
	}

	/**
	 * Subscribe to file change events for a worktree.
	 * Returns an unsubscribe function.
	 *
	 * NOTE: This is async to ensure the watcher is ready before returning.
	 * This prevents race conditions where events could be missed if the
	 * callback is added before the watcher finishes initializing.
	 */
	async subscribe(
		worktreePath: string,
		callback: (event: GitWatchEvent) => void,
	): Promise<() => void> {
		// Wait for watcher to be ready before adding listener
		await this.getOrCreate(worktreePath);

		// Add listener
		let listeners = this.listeners.get(worktreePath);
		if (!listeners) {
			listeners = new Set();
			this.listeners.set(worktreePath, listeners);
		}
		listeners.add(callback);

		// Return unsubscribe function
		return () => {
			listeners?.delete(callback);
			// Keep watcher alive for potential reuse (only 2 file descriptors)
		};
	}

	/**
	 * Check if a watcher exists for the given worktree.
	 */
	has(worktreePath: string): boolean {
		return this.watchers.has(worktreePath);
	}

	/**
	 * Dispose a specific watcher.
	 */
	async dispose(worktreePath: string): Promise<void> {
		const watcher = this.watchers.get(worktreePath);
		if (watcher) {
			await watcher.dispose();
			this.watchers.delete(worktreePath);
			this.listeners.delete(worktreePath);
		}
	}

	/**
	 * Dispose all watchers. Call this when the app is shutting down.
	 */
	async disposeAll(): Promise<void> {
		const disposals = Array.from(this.watchers.values()).map((watcher) =>
			watcher.dispose(),
		);
		await Promise.all(disposals);
		this.watchers.clear();
		this.listeners.clear();
	}

	/**
	 * Get the number of active watchers.
	 */
	getWatcherCount(): number {
		return this.watchers.size;
	}
}

// Singleton instance
export const gitWatcherRegistry = new GitWatcherRegistry();

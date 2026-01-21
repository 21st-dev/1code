import simpleGit, { SimpleGit, SimpleGitOptions } from "simple-git";
import { stat, unlink } from "fs/promises";
import { join } from "path";

/**
 * Default timeout values for git operations (in milliseconds)
 */
export const GIT_TIMEOUTS = {
	/** Local operations (status, add, commit, etc.) */
	LOCAL: 30_000, // 30 seconds
	/** Network operations (fetch, push, pull, clone) */
	NETWORK: 120_000, // 2 minutes
	/** Long-running operations (clone large repos, initial fetch) */
	LONG: 300_000, // 5 minutes
} as const;

/**
 * Per-worktree operation locks to prevent concurrent git operations
 */
const operationLocks = new Map<string, Promise<void>>();

/**
 * Creates a simple-git instance with configured timeouts.
 *
 * @param worktreePath - Path to the git worktree/repository
 * @param timeout - Timeout in milliseconds (defaults to LOCAL timeout)
 * @returns Configured SimpleGit instance
 */
export function createGit(
	worktreePath: string,
	timeout: number = GIT_TIMEOUTS.LOCAL
): SimpleGit {
	const options: Partial<SimpleGitOptions> = {
		baseDir: worktreePath,
		binary: "git",
		maxConcurrentProcesses: 6,
		timeout: {
			block: timeout,
		},
	};

	return simpleGit(options);
}

/**
 * Creates a simple-git instance configured for network operations.
 * Uses longer timeout suitable for fetch, push, pull operations.
 */
export function createGitForNetwork(worktreePath: string): SimpleGit {
	return createGit(worktreePath, GIT_TIMEOUTS.NETWORK);
}

/**
 * Creates a simple-git instance configured for long-running operations.
 * Uses extended timeout suitable for clone, large fetches, etc.
 */
export function createGitForLongOperation(worktreePath: string): SimpleGit {
	return createGit(worktreePath, GIT_TIMEOUTS.LONG);
}

/**
 * Executes a git operation with a per-worktree mutex lock.
 * Prevents concurrent git operations on the same worktree which can
 * cause lock file conflicts and corruption.
 *
 * @param worktreePath - Path to the git worktree
 * @param operation - Async function to execute
 * @returns Result of the operation
 */
export async function withGitLock<T>(
	worktreePath: string,
	operation: () => Promise<T>
): Promise<T> {
	// Wait for any existing operation to complete
	const existing = operationLocks.get(worktreePath);
	if (existing) {
		await existing.catch(() => {}); // Ignore errors from previous operation
	}

	// Create a new lock for this operation
	let resolveLock: () => void;
	const lock = new Promise<void>((resolve) => {
		resolveLock = resolve;
	});
	operationLocks.set(worktreePath, lock);

	try {
		return await operation();
	} finally {
		resolveLock!();
		// Clean up the lock if it's still ours
		if (operationLocks.get(worktreePath) === lock) {
			operationLocks.delete(worktreePath);
		}
	}
}

/**
 * Known lock files that git creates during operations
 */
const GIT_LOCK_FILES = [
	".git/index.lock",
	".git/config.lock",
	".git/HEAD.lock",
	".git/refs/heads/*.lock",
	".git/shallow.lock",
];

/**
 * Checks for and removes stale git lock files.
 * A lock file is considered stale if it's older than the specified max age.
 *
 * @param worktreePath - Path to the git worktree
 * @param maxAgeMs - Maximum age in milliseconds before a lock is considered stale (default: 5 minutes)
 * @returns Array of removed lock file paths
 */
export async function cleanStaleLockFiles(
	worktreePath: string,
	maxAgeMs: number = 5 * 60 * 1000
): Promise<string[]> {
	const removedLocks: string[] = [];
	const basicLocks = [
		".git/index.lock",
		".git/config.lock",
		".git/HEAD.lock",
		".git/shallow.lock",
	];

	for (const lockRelPath of basicLocks) {
		const lockPath = join(worktreePath, lockRelPath);
		try {
			const stats = await stat(lockPath);
			const age = Date.now() - stats.mtimeMs;

			if (age > maxAgeMs) {
				await unlink(lockPath);
				removedLocks.push(lockPath);
				console.log(`[git-factory] Removed stale lock file: ${lockPath} (age: ${Math.round(age / 1000)}s)`);
			}
		} catch {
			// Lock file doesn't exist, which is fine
		}
	}

	return removedLocks;
}

/**
 * Detects if an error is caused by a git lock file conflict.
 */
export function isLockFileError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return (
		message.includes("index.lock") ||
		message.includes("Unable to create") ||
		message.includes("Another git process seems to be running") ||
		message.includes(".lock': File exists")
	);
}

/**
 * Executes a git operation with automatic retry on lock file conflicts.
 * Will attempt to clean stale locks and retry the operation.
 *
 * @param worktreePath - Path to the git worktree
 * @param operation - Async function to execute
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @param retryDelayMs - Delay between retries in milliseconds (default: 1000)
 * @returns Result of the operation
 */
export async function withLockRetry<T>(
	worktreePath: string,
	operation: () => Promise<T>,
	maxRetries: number = 3,
	retryDelayMs: number = 1000
): Promise<T> {
	let lastError: unknown;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			return await operation();
		} catch (error) {
			lastError = error;

			if (isLockFileError(error) && attempt < maxRetries) {
				console.log(`[git-factory] Lock file conflict on attempt ${attempt + 1}, cleaning and retrying...`);

				// Try to clean stale locks
				await cleanStaleLockFiles(worktreePath);

				// Wait before retry with exponential backoff
				await new Promise((resolve) =>
					setTimeout(resolve, retryDelayMs * Math.pow(2, attempt))
				);
			} else {
				throw error;
			}
		}
	}

	throw lastError;
}

/**
 * Checks if a repository has uncommitted changes.
 * Returns true if there are staged, unstaged, or untracked changes.
 */
export async function hasUncommittedChanges(worktreePath: string): Promise<boolean> {
	const git = createGit(worktreePath);
	const status = await git.status();

	return !status.isClean();
}

/**
 * Gets detailed uncommitted changes information.
 */
export async function getUncommittedChanges(worktreePath: string): Promise<{
	hasChanges: boolean;
	staged: string[];
	modified: string[];
	deleted: string[];
	untracked: string[];
	conflicted: string[];
}> {
	const git = createGit(worktreePath);
	const status = await git.status();

	return {
		hasChanges: !status.isClean(),
		staged: status.staged,
		modified: status.modified,
		deleted: status.deleted,
		untracked: status.not_added,
		conflicted: status.conflicted,
	};
}

/**
 * Checks if the repository is in a rebase or merge state.
 */
export async function getRepositoryState(worktreePath: string): Promise<{
	isRebasing: boolean;
	isMerging: boolean;
	isCherryPicking: boolean;
	isReverting: boolean;
	hasConflicts: boolean;
}> {
	const git = createGit(worktreePath);
	const status = await git.status();

	// Check for state indicators via git status
	const isRebasing = status.current?.includes("(no branch") || false;
	const hasConflicts = status.conflicted.length > 0;

	// More accurate state detection via git internals
	const { existsSync } = await import("fs");
	const gitDir = join(worktreePath, ".git");

	return {
		isRebasing: existsSync(join(gitDir, "rebase-merge")) || existsSync(join(gitDir, "rebase-apply")),
		isMerging: existsSync(join(gitDir, "MERGE_HEAD")),
		isCherryPicking: existsSync(join(gitDir, "CHERRY_PICK_HEAD")),
		isReverting: existsSync(join(gitDir, "REVERT_HEAD")),
		hasConflicts,
	};
}

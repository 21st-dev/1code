import {
	assertRegisteredWorktree,
	assertValidGitPath,
} from "./path-validation";
import { createGit, withLockRetry } from "../git-factory";

/**
 * Git command helpers with semantic naming.
 *
 * Design principle: Different functions for different git semantics.
 * You can't accidentally use file checkout syntax for branch switching.
 *
 * Each function:
 * 1. Validates worktree is registered
 * 2. Validates paths/refs as appropriate
 * 3. Uses the correct git command syntax
 */

/**
 * Switch to a branch.
 *
 * Uses `git switch` (unambiguous branch operation, git 2.23+).
 * Falls back to `git checkout <branch>` for older git versions.
 *
 * Note: `git checkout -- <branch>` is WRONG - that's file checkout syntax.
 */
export async function gitSwitchBranch(
	worktreePath: string,
	branch: string,
): Promise<void> {
	assertRegisteredWorktree(worktreePath);

	// Validate: reject anything that looks like a flag
	if (branch.startsWith("-")) {
		throw new Error("Invalid branch name: cannot start with -");
	}

	// Validate: reject empty branch names
	if (!branch.trim()) {
		throw new Error("Invalid branch name: cannot be empty");
	}

	const git = createGit(worktreePath);

	await withLockRetry(worktreePath, async () => {
		try {
			// Prefer `git switch` - unambiguous branch operation (git 2.23+)
			await git.raw(["switch", branch]);
		} catch (switchError) {
			// Check if it's because `switch` command doesn't exist (old git < 2.23)
			// Git outputs: "git: 'switch' is not a git command. See 'git --help'."
			const errorMessage = String(switchError);
			if (errorMessage.includes("is not a git command")) {
				// Fallback for older git versions
				// Note: checkout WITHOUT -- is correct for branches
				await git.checkout(branch);
			} else {
				throw switchError;
			}
		}
	});
}

/**
 * Checkout (restore) a file path, discarding local changes.
 *
 * Uses `git checkout -- <path>` - the `--` is REQUIRED here
 * to indicate path mode (not branch mode).
 */
export async function gitCheckoutFile(
	worktreePath: string,
	filePath: string,
): Promise<void> {
	assertRegisteredWorktree(worktreePath);
	assertValidGitPath(filePath);

	const git = createGit(worktreePath);
	// `--` is correct here - we want path semantics
	await withLockRetry(worktreePath, () => git.checkout(["--", filePath]));
}

/**
 * Stage a file for commit.
 *
 * Uses `git add -- <path>` - the `--` prevents paths starting
 * with `-` from being interpreted as flags.
 */
export async function gitStageFile(
	worktreePath: string,
	filePath: string,
): Promise<void> {
	assertRegisteredWorktree(worktreePath);
	assertValidGitPath(filePath);

	const git = createGit(worktreePath);
	await withLockRetry(worktreePath, () => git.add(["--", filePath]));
}

/**
 * Stage all changes for commit.
 *
 * Uses `git add -A` to stage all changes (new, modified, deleted).
 */
export async function gitStageAll(worktreePath: string): Promise<void> {
	assertRegisteredWorktree(worktreePath);

	const git = createGit(worktreePath);
	await withLockRetry(worktreePath, () => git.add("-A"));
}

/**
 * Stage multiple files for commit in a single git operation.
 *
 * Uses `git add -- <paths...>` to stage multiple files at once,
 * avoiding multiple sequential git calls and lock conflicts.
 */
/** Maximum files per batch to avoid command line length limits */
const BATCH_SIZE = 100;

export async function gitStageFiles(
	worktreePath: string,
	filePaths: string[],
): Promise<void> {
	assertRegisteredWorktree(worktreePath);
	for (const filePath of filePaths) {
		assertValidGitPath(filePath);
	}

	if (filePaths.length === 0) return;

	const git = createGit(worktreePath);

	// Process in batches to avoid command line length limits
	for (let i = 0; i < filePaths.length; i += BATCH_SIZE) {
		const batch = filePaths.slice(i, i + BATCH_SIZE);
		await withLockRetry(worktreePath, () => git.add(["--", ...batch]));
	}
}

/**
 * Unstage a file (remove from staging area).
 *
 * Uses `git reset HEAD -- <path>` to unstage without
 * discarding changes.
 */
export async function gitUnstageFile(
	worktreePath: string,
	filePath: string,
): Promise<void> {
	assertRegisteredWorktree(worktreePath);
	assertValidGitPath(filePath);

	const git = createGit(worktreePath);
	await withLockRetry(worktreePath, () => git.reset(["HEAD", "--", filePath]));
}

/**
 * Unstage all files.
 *
 * Uses `git reset HEAD` to unstage all changes without
 * discarding them.
 */
export async function gitUnstageAll(worktreePath: string): Promise<void> {
	assertRegisteredWorktree(worktreePath);

	const git = createGit(worktreePath);
	await withLockRetry(worktreePath, () => git.reset(["HEAD"]));
}

/**
 * Unstage multiple files in a single git operation.
 *
 * Uses `git reset HEAD -- <paths...>` to unstage multiple files at once,
 * avoiding multiple sequential git calls and lock conflicts.
 */
export async function gitUnstageFiles(
	worktreePath: string,
	filePaths: string[],
): Promise<void> {
	assertRegisteredWorktree(worktreePath);
	for (const filePath of filePaths) {
		assertValidGitPath(filePath);
	}

	if (filePaths.length === 0) return;

	const git = createGit(worktreePath);

	// Process in batches
	for (let i = 0; i < filePaths.length; i += BATCH_SIZE) {
		const batch = filePaths.slice(i, i + BATCH_SIZE);
		await withLockRetry(worktreePath, () => git.reset(["HEAD", "--", ...batch]));
	}
}

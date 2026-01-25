/**
 * Git module - combines all git-related routers
 * Flattened structure to match Superset API (changes.getStatus, changes.stageFile, etc.)
 */
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { router } from "../trpc";
import { createBranchesRouter } from "./branches";
import { createFileContentsRouter } from "./file-contents";
import { createGitOperationsRouter } from "./git-operations";
import { createStagingRouter } from "./staging";
import { createStatusRouter } from "./status";

const execAsync = promisify(exec);

// Re-export worktree utilities
export * from "./worktree";
export * from "./worktree-naming";

// Re-export GitHub utilities
export * from "./github";

// Re-export types
export type { GitChangesStatus, ChangedFile, CommitInfo, FileContents } from "../../../shared/changes-types";

/**
 * Combined git router with flattened procedures
 * This matches Superset's changes router API structure
 */
export const createGitRouter = () => {
	return router({
		// Merge all sub-router procedures at top level
		...createStatusRouter()._def.procedures,
		...createStagingRouter()._def.procedures,
		...createGitOperationsRouter()._def.procedures,
		...createBranchesRouter()._def.procedures,
		...createFileContentsRouter()._def.procedures,
	});
};

// ============ GIT REMOTE INFO ============

export type GitProvider = "github" | "gitlab" | "bitbucket" | null;

export interface GitRemoteInfo {
	remoteUrl: string | null;
	provider: GitProvider;
	owner: string | null;
	repo: string | null;
}

/**
 * Check if a path is a git repository
 */
async function isGitRepo(path: string): Promise<boolean> {
	try {
		await execAsync("git rev-parse --git-dir", { cwd: path });
		return true;
	} catch {
		return false;
	}
}

/**
 * Parse a git remote URL to extract provider, owner, and repo
 * Handles both formats:
 * - https://github.com/owner/repo.git
 * - git@github.com:owner/repo.git
 */
function parseGitRemoteUrl(url: string): Omit<GitRemoteInfo, "remoteUrl"> {
	// Normalize the URL
	let normalized = url.trim();

	// Remove .git suffix
	if (normalized.endsWith(".git")) {
		normalized = normalized.slice(0, -4);
	}

	// Try to extract provider, owner, repo
	let provider: GitProvider = null;
	let owner: string | null = null;
	let repo: string | null = null;

	// Match HTTPS format: https://github.com/owner/repo
	const httpsMatch = normalized.match(
		/https?:\/\/(github\.com|gitlab\.com|bitbucket\.org)\/([^/]+)\/([^/]+)/,
	);
	if (httpsMatch) {
		const [, host, ownerPart, repoPart] = httpsMatch;
		provider =
			host === "github.com"
				? "github"
				: host === "gitlab.com"
					? "gitlab"
					: host === "bitbucket.org"
						? "bitbucket"
						: null;
		owner = ownerPart || null;
		repo = repoPart || null;
		return { provider, owner, repo };
	}

	// Match SSH format: git@github.com:owner/repo
	const sshMatch = normalized.match(
		/git@(github\.com|gitlab\.com|bitbucket\.org):([^/]+)\/(.+)/,
	);
	if (sshMatch) {
		const [, host, ownerPart, repoPart] = sshMatch;
		provider =
			host === "github.com"
				? "github"
				: host === "gitlab.com"
					? "gitlab"
					: host === "bitbucket.org"
						? "bitbucket"
						: null;
		owner = ownerPart || null;
		repo = repoPart || null;
		return { provider, owner, repo };
	}

	return { provider: null, owner: null, repo: null };
}

/**
 * Get git remote info for a project path
 * Extracts remote URL, provider (github/gitlab/bitbucket), owner, and repo name
 */
export async function getGitRemoteInfo(
	projectPath: string,
): Promise<GitRemoteInfo> {
	const emptyResult: GitRemoteInfo = {
		remoteUrl: null,
		provider: null,
		owner: null,
		repo: null,
	};

	// Check if it's a git repo
	const isRepo = await isGitRepo(projectPath);
	if (!isRepo) {
		return emptyResult;
	}

	try {
		// Get the remote URL for origin
		const { stdout } = await execAsync("git remote get-url origin", {
			cwd: projectPath,
		});

		const remoteUrl = stdout.trim();
		if (!remoteUrl) {
			return emptyResult;
		}

		const parsed = parseGitRemoteUrl(remoteUrl);

		return {
			remoteUrl,
			...parsed,
		};
	} catch {
		// No remote configured or other error
		return emptyResult;
	}
}

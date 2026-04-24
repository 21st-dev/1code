import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { branchExistsOnRemote } from "../worktree";
import { execWithShellEnv } from "../shell-env";
import {
	type CheckItem,
	type GHPRResponse,
	type GitHubStatus,
	type PRComment,
	GHPRResponseSchema,
	GHRepoResponseSchema,
	GHReviewCommentSchema,
} from "./types";

const execFileAsync = promisify(execFile);

// Cache for GitHub status (10 second TTL)
const cache = new Map<string, { data: GitHubStatus; timestamp: number }>();
const CACHE_TTL_MS = 10_000;

/**
 * Drop cached PR status for a worktree so the next fetch hits the real gh CLI.
 * Call this after a mutation that changes PR state (title rename, merge, etc.).
 */
export function invalidateGitHubPRCache(worktreePath?: string): void {
	if (worktreePath) {
		cache.delete(worktreePath);
	} else {
		cache.clear();
	}
}

/**
 * Fetches GitHub PR status for a worktree using the `gh` CLI.
 * Returns null if `gh` is not installed, not authenticated, or on error.
 * Results are cached for 10 seconds.
 */
export async function fetchGitHubPRStatus(
	worktreePath: string,
): Promise<GitHubStatus | null> {
	// Check cache first
	const cached = cache.get(worktreePath);
	if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
		return cached.data;
	}

	try {
		// First, get the repo URL
		const repoUrl = await getRepoUrl(worktreePath);
		if (!repoUrl) {
			return null;
		}

		// Get current branch name
		const { stdout: branchOutput } = await execFileAsync(
			"git",
			["rev-parse", "--abbrev-ref", "HEAD"],
			{ cwd: worktreePath },
		);
		const branchName = branchOutput.trim();

		// Check if branch exists on remote and get PR info in parallel
		const [branchCheck, prInfo] = await Promise.all([
			branchExistsOnRemote(worktreePath, branchName),
			getPRForBranch(worktreePath, branchName),
		]);

		// Convert result to boolean - only "exists" is true
		// "not_found" and "error" both mean we can't confirm it exists
		const existsOnRemote = branchCheck.status === "exists";

		const result: GitHubStatus = {
			pr: prInfo,
			repoUrl,
			branchExistsOnRemote: existsOnRemote,
			lastRefreshed: Date.now(),
		};

		// Cache the result
		cache.set(worktreePath, { data: result, timestamp: Date.now() });

		return result;
	} catch {
		// Any error (gh not installed, not auth'd, etc.) - return null
		return null;
	}
}

async function getRepoUrl(worktreePath: string): Promise<string | null> {
	try {
		const { stdout } = await execWithShellEnv(
			"gh",
			["repo", "view", "--json", "url"],
			{ cwd: worktreePath },
		);
		const raw = JSON.parse(stdout);
		const result = GHRepoResponseSchema.safeParse(raw);
		if (!result.success) {
			console.error("[GitHub] Repo schema validation failed:", result.error);
			console.error("[GitHub] Raw data:", JSON.stringify(raw, null, 2));
			return null;
		}
		return result.data.url;
	} catch {
		return null;
	}
}

async function getPRForBranch(
	worktreePath: string,
	branch: string,
): Promise<GitHubStatus["pr"]> {
	try {
		// Use execWithShellEnv to handle macOS GUI app PATH issues
		const { stdout } = await execWithShellEnv(
			"gh",
			[
				"pr",
				"view",
				branch,
				"--json",
				"number,title,url,state,isDraft,mergedAt,additions,deletions,reviewDecision,statusCheckRollup,mergeable",
			],
			{ cwd: worktreePath },
		);
		const raw = JSON.parse(stdout);
		const result = GHPRResponseSchema.safeParse(raw);
		if (!result.success) {
			console.error("[GitHub] PR schema validation failed:", result.error);
			console.error("[GitHub] Raw data:", JSON.stringify(raw, null, 2));
			throw new Error("PR schema validation failed");
		}
		const data = result.data;

		const checks = parseChecks(data.statusCheckRollup);

		return {
			number: data.number,
			title: data.title,
			url: data.url,
			state: mapPRState(data.state, data.isDraft),
			mergedAt: data.mergedAt ? new Date(data.mergedAt).getTime() : undefined,
			additions: data.additions,
			deletions: data.deletions,
			reviewDecision: mapReviewDecision(data.reviewDecision),
			checksStatus: computeChecksStatus(data.statusCheckRollup),
			checks,
			mergeable: data.mergeable,
		};
	} catch (error) {
		// "no pull requests found" is not an error - just no PR
		if (
			error instanceof Error &&
			error.message.includes("no pull requests found")
		) {
			return null;
		}
		// Re-throw other errors to be caught by parent
		throw error;
	}
}

function mapPRState(
	state: GHPRResponse["state"],
	isDraft: boolean,
): NonNullable<GitHubStatus["pr"]>["state"] {
	if (state === "MERGED") return "merged";
	if (state === "CLOSED") return "closed";
	if (isDraft) return "draft";
	return "open";
}

function mapReviewDecision(
	decision: GHPRResponse["reviewDecision"],
): NonNullable<GitHubStatus["pr"]>["reviewDecision"] {
	if (decision === "APPROVED") return "approved";
	if (decision === "CHANGES_REQUESTED") return "changes_requested";
	return "pending";
}

function parseChecks(rollup: GHPRResponse["statusCheckRollup"]): CheckItem[] {
	if (!rollup || rollup.length === 0) {
		return [];
	}

	return rollup.map((ctx) => {
		// CheckRun uses 'name', StatusContext uses 'context'
		const name = ctx.name || ctx.context || "Unknown check";
		// CheckRun uses 'detailsUrl', StatusContext uses 'targetUrl'
		const url = ctx.detailsUrl || ctx.targetUrl;
		// StatusContext uses 'state', CheckRun uses 'conclusion'
		const rawStatus = ctx.state || ctx.conclusion;

		let status: CheckItem["status"];
		if (rawStatus === "SUCCESS") {
			status = "success";
		} else if (
			rawStatus === "FAILURE" ||
			rawStatus === "ERROR" ||
			rawStatus === "TIMED_OUT"
		) {
			status = "failure";
		} else if (rawStatus === "SKIPPED" || rawStatus === "NEUTRAL") {
			status = "skipped";
		} else if (rawStatus === "CANCELLED") {
			status = "cancelled";
		} else {
			status = "pending";
		}

		return { name, status, url };
	});
}

function computeChecksStatus(
	rollup: GHPRResponse["statusCheckRollup"],
): NonNullable<GitHubStatus["pr"]>["checksStatus"] {
	if (!rollup || rollup.length === 0) {
		return "none";
	}

	let hasFailure = false;
	let hasPending = false;

	for (const ctx of rollup) {
		// StatusContext uses 'state', CheckRun uses 'conclusion'
		const status = ctx.state || ctx.conclusion;

		if (status === "FAILURE" || status === "ERROR" || status === "TIMED_OUT") {
			hasFailure = true;
		} else if (
			status === "PENDING" ||
			status === "" ||
			status === null ||
			status === undefined
		) {
			hasPending = true;
		}
	}

	if (hasFailure) return "failure";
	if (hasPending) return "pending";
	return "success";
}

// Cache for PR comments (30 second TTL — comments change less often than status)
const commentsCache = new Map<
	string,
	{ data: PRComment[]; timestamp: number }
>();
const COMMENTS_CACHE_TTL_MS = 30_000;

/**
 * Fetch both general (issue) and review (code-level) comments for the current
 * branch's PR. Returns an empty array when there's no PR or gh can't reach it.
 * Cached for 30 seconds per worktree.
 */
export async function fetchGitHubPRComments(
	worktreePath: string,
): Promise<PRComment[]> {
	const cached = commentsCache.get(worktreePath);
	if (cached && Date.now() - cached.timestamp < COMMENTS_CACHE_TTL_MS) {
		return cached.data;
	}

	try {
		const { stdout: branchOutput } = await execFileAsync(
			"git",
			["rev-parse", "--abbrev-ref", "HEAD"],
			{ cwd: worktreePath },
		);
		const branchName = branchOutput.trim();
		if (!branchName) return [];

		let prNumber: number | null = null;
		try {
			const { stdout } = await execWithShellEnv(
				"gh",
				["pr", "view", branchName, "--json", "number"],
				{ cwd: worktreePath },
			);
			const parsed = JSON.parse(stdout);
			if (typeof parsed?.number === "number") {
				prNumber = parsed.number;
			}
		} catch {
			return [];
		}
		if (!prNumber) return [];

		const [issueStdout, reviewStdout] = await Promise.all([
			execWithShellEnv(
				"gh",
				["pr", "view", String(prNumber), "--json", "comments"],
				{ cwd: worktreePath },
			)
				.then((r) => r.stdout)
				.catch(() => null),
			execWithShellEnv(
				"gh",
				[
					"api",
					`repos/{owner}/{repo}/pulls/${prNumber}/comments`,
					"--paginate",
				],
				{ cwd: worktreePath },
			)
				.then((r) => r.stdout)
				.catch(() => null),
		]);

		const comments: PRComment[] = [];

		if (issueStdout) {
			try {
				const raw = JSON.parse(issueStdout);
				const rawComments = Array.isArray(raw?.comments) ? raw.comments : [];
				for (const c of rawComments) {
					const login = c?.author?.login ?? "unknown";
					const createdAt = c?.createdAt ?? c?.created_at ?? null;
					const body = typeof c?.body === "string" ? c.body : "";
					if (!createdAt) continue;
					comments.push({
						id: typeof c?.id === "number" ? c.id : comments.length,
						kind: "issue",
						author: login,
						avatarUrl: null,
						createdAt,
						body,
						htmlUrl: c?.url ?? null,
					});
				}
			} catch (err) {
				console.error("[GitHub] Failed to parse issue comments:", err);
			}
		}

		if (reviewStdout) {
			try {
				const raw = JSON.parse(reviewStdout);
				const arr = Array.isArray(raw) ? raw : [];
				for (const c of arr) {
					const parsed = GHReviewCommentSchema.safeParse(c);
					if (!parsed.success) continue;
					const data = parsed.data;
					comments.push({
						id: data.id,
						kind: "review",
						author: data.user?.login ?? "unknown",
						avatarUrl: data.user?.avatar_url ?? null,
						createdAt: data.created_at,
						body: data.body ?? "",
						htmlUrl: data.html_url ?? null,
						path: data.path ?? null,
						line: data.line ?? data.original_line ?? null,
						diffHunk: data.diff_hunk ?? null,
					});
				}
			} catch (err) {
				console.error("[GitHub] Failed to parse review comments:", err);
			}
		}

		comments.sort(
			(a, b) =>
				new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
		);

		commentsCache.set(worktreePath, {
			data: comments,
			timestamp: Date.now(),
		});
		return comments;
	} catch (err) {
		console.error("[GitHub] fetchGitHubPRComments failed:", err);
		return [];
	}
}

/**
 * Invalidate the PR comments cache for a worktree.
 */
export function invalidateGitHubPRCommentsCache(worktreePath?: string): void {
	if (worktreePath) {
		commentsCache.delete(worktreePath);
	} else {
		commentsCache.clear();
	}
}

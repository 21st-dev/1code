/**
 * Provider dispatcher for PR operations.
 *
 * Resolves the git host from the worktree's origin remote, then delegates to
 * the matching provider implementation. GitHub calls are pure forwarders so
 * existing behavior stays byte-identical; Azure calls go through the az CLI.
 *
 * Unknown providers (gitlab, bitbucket, on-prem, etc.) return null / [] from
 * queries and throw PROVIDER_UNSUPPORTED from mutations — the renderer handles
 * null gracefully (PR widget empty state) and throws as toasts.
 */

import { getGitRemoteInfo } from "../index";
import {
	fetchGitHubPRStatus,
	fetchGitHubPRComments,
	invalidateGitHubPRCache,
	invalidateGitHubPRCommentsCache,
} from "../github";
import {
	fetchAzurePRStatus,
	fetchAzurePRComments,
	invalidateAzurePRCache,
	invalidateAzurePRCommentsCache,
	mergeAzurePR,
	updateAzurePRTitle,
} from "./azure/azure";
import { buildAzureCreatePRWebUrl, parseAzureRemoteUrl } from "./azure/parse-url";
import type { PullRequestStatus, SupportedProvider, PRComment } from "./types";

export type { PullRequestStatus, SupportedProvider, PRComment };

// 60s resolver cache — git remotes effectively never change within a session
// and we don't want to shell out to `git remote get-url` on every 10s poll.
const providerCache = new Map<
	string,
	{ value: SupportedProvider | null; timestamp: number }
>();
const PROVIDER_CACHE_TTL_MS = 60_000;

/**
 * Resolve the supported provider for a worktree. Returns null for gitlab,
 * bitbucket, on-prem, or any unrecognized remote.
 */
export async function resolveProvider(
	worktreePath: string,
): Promise<SupportedProvider | null> {
	const cached = providerCache.get(worktreePath);
	if (cached && Date.now() - cached.timestamp < PROVIDER_CACHE_TTL_MS) {
		return cached.value;
	}
	const info = await getGitRemoteInfo(worktreePath);
	const value: SupportedProvider | null =
		info.provider === "github" || info.provider === "azure"
			? info.provider
			: null;
	providerCache.set(worktreePath, { value, timestamp: Date.now() });
	return value;
}

export function invalidateProviderCache(worktreePath?: string): void {
	if (worktreePath) {
		providerCache.delete(worktreePath);
	} else {
		providerCache.clear();
	}
}

/**
 * Fetch PR status for the current branch. Null on any failure — never throws.
 * Safe to call from a 10s polling hook.
 */
export async function fetchPRStatus(
	worktreePath: string,
): Promise<PullRequestStatus | null> {
	const provider = await resolveProvider(worktreePath);
	if (provider === "github") return fetchGitHubPRStatus(worktreePath);
	if (provider === "azure") return fetchAzurePRStatus(worktreePath);
	return null;
}

/**
 * Fetch PR comments for the current branch. Returns [] on failure. Azure v1
 * always returns [] (thread-model stub — see plan "Out of scope").
 */
export async function fetchPRComments(
	worktreePath: string,
): Promise<PRComment[]> {
	const provider = await resolveProvider(worktreePath);
	if (provider === "github") return fetchGitHubPRComments(worktreePath);
	if (provider === "azure") return fetchAzurePRComments(worktreePath);
	return [];
}

/**
 * Merge (complete) a PR. Throws with MERGE_CONFLICT: prefix on conflicts —
 * the renderer already recognizes that contract.
 */
export async function mergePR(args: {
	worktreePath: string;
	prNumber: number;
	method: "merge" | "squash" | "rebase";
}): Promise<{ success: true }> {
	const provider = await resolveProvider(args.worktreePath);
	if (provider === "azure") return mergeAzurePR(args);
	if (provider === "github") {
		// Forward to the existing inline gh logic in chats.ts via a tiny helper.
		return mergeGitHubPR(args);
	}
	throw new Error("PROVIDER_UNSUPPORTED: This repository's host is not supported for PR merge.");
}

/** Update PR title. Throws on failure. */
export async function updatePRTitle(args: {
	worktreePath: string;
	title: string;
	prNumber?: number;
}): Promise<{ success: true; title: string }> {
	const provider = await resolveProvider(args.worktreePath);
	if (provider === "azure") return updateAzurePRTitle(args);
	if (provider === "github") return updateGitHubPRTitle(args);
	throw new Error("PROVIDER_UNSUPPORTED: This repository's host is not supported for PR title updates.");
}

/** Invalidate PR status cache in BOTH providers (safe no-op per provider). */
export function invalidatePRCache(worktreePath?: string): void {
	invalidateGitHubPRCache(worktreePath);
	invalidateAzurePRCache(worktreePath);
}

/** Invalidate PR comments cache in BOTH providers. */
export function invalidatePRCommentsCache(worktreePath?: string): void {
	invalidateGitHubPRCommentsCache(worktreePath);
	invalidateAzurePRCommentsCache(worktreePath);
}

/**
 * Build the browser URL for the "Create PR" page on the given provider.
 */
export function buildCreatePRWebUrl(args: {
	provider: SupportedProvider;
	remoteUrl: string;
	branch: string;
	baseBranch: string;
}): string {
	if (args.provider === "github") {
		// Preserves existing behavior from git-operations.createPR — a compare
		// URL for the branch. `baseBranch` isn't needed in the GitHub form;
		// GitHub's UI defaults to the repo's default branch.
		const match = args.remoteUrl.match(
			/github\.com[:/]([^/]+)\/([^/.]+)/,
		);
		if (!match) {
			throw new Error("Could not parse GitHub remote URL");
		}
		const [, owner, repo] = match;
		return `https://github.com/${owner}/${repo}/compare/${encodeURIComponent(args.branch)}?expand=1`;
	}

	const remote = parseAzureRemoteUrl(args.remoteUrl);
	if (!remote) {
		throw new Error("Could not parse Azure DevOps remote URL");
	}
	return buildAzureCreatePRWebUrl({
		remote,
		branch: args.branch,
		baseBranch: args.baseBranch,
	});
}

// ---------- GitHub mutation adapters ----------
// These wrap the existing gh-CLI calls currently inlined in chats.ts, so
// the tRPC router can call a single dispatcher regardless of provider.

import { execWithShellEnv } from "../shell-env";

async function mergeGitHubPR(args: {
	worktreePath: string;
	prNumber: number;
	method: "merge" | "squash" | "rebase";
}): Promise<{ success: true }> {
	const flag = `--${args.method}`;
	try {
		await execWithShellEnv(
			"gh",
			["pr", "merge", String(args.prNumber), flag, "--delete-branch"],
			{ cwd: args.worktreePath },
		);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		if (/conflict/i.test(msg) || /not mergeable/i.test(msg) || /CONFLICTING/.test(msg)) {
			throw new Error(`MERGE_CONFLICT: ${msg}`);
		}
		throw new Error(`GitHub PR merge failed: ${msg}`);
	}
	invalidateGitHubPRCache(args.worktreePath);
	invalidateGitHubPRCommentsCache(args.worktreePath);
	return { success: true };
}

async function updateGitHubPRTitle(args: {
	worktreePath: string;
	title: string;
	prNumber?: number;
}): Promise<{ success: true; title: string }> {
	const cmd =
		args.prNumber != null
			? ["pr", "edit", String(args.prNumber), "--title", args.title]
			: ["pr", "edit", "--title", args.title];
	try {
		await execWithShellEnv("gh", cmd, { cwd: args.worktreePath });
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		if (/no pull request/i.test(msg)) {
			throw new Error("No pull request exists for the current branch.");
		}
		throw new Error(`GitHub PR title update failed: ${msg}`);
	}
	invalidateGitHubPRCache(args.worktreePath);
	return { success: true, title: args.title };
}

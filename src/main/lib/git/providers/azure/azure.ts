import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { execWithShellEnv } from "../../shell-env";
import { branchExistsOnRemote } from "../../worktree";
import { getGitRemoteInfo } from "../../index";
import type { GitHubStatus, PRComment } from "../../github/types";
import { detectAzureCli, detectionToToastMessage } from "./detect";
import {
	type AzurePR,
	type AzurePolicyEval,
	AzurePRSchema,
	AzurePolicyEvalSchema,
} from "./types";
import { parseAzureRemoteUrl, type AzureRemote } from "./parse-url";

const execFileAsync = promisify(execFile);

// 10s status cache — matches the GitHub provider.
const statusCache = new Map<string, { data: GitHubStatus; timestamp: number }>();
const STATUS_TTL_MS = 10_000;

// 30s comments cache — stubbed to [] in v1 but wired for future use.
const commentsCache = new Map<string, { data: PRComment[]; timestamp: number }>();
const COMMENTS_TTL_MS = 30_000;

export function invalidateAzurePRCache(worktreePath?: string): void {
	if (worktreePath) {
		statusCache.delete(worktreePath);
	} else {
		statusCache.clear();
	}
}

export function invalidateAzurePRCommentsCache(worktreePath?: string): void {
	if (worktreePath) {
		commentsCache.delete(worktreePath);
	} else {
		commentsCache.clear();
	}
}

/**
 * Fetch PR status for the current branch in an Azure DevOps worktree.
 * Returns null for any failure (missing CLI, not logged in, no PR, network, etc.)
 * so the polling UI never throws. Cached 10s per worktree.
 */
export async function fetchAzurePRStatus(
	worktreePath: string,
): Promise<GitHubStatus | null> {
	const cached = statusCache.get(worktreePath);
	if (cached && Date.now() - cached.timestamp < STATUS_TTL_MS) {
		return cached.data;
	}

	try {
		const detection = await detectAzureCli();
		if (detection.status !== "ok") return null;

		const remote = await resolveAzureRemote(worktreePath);
		if (!remote) return null;

		const branch = await getCurrentBranch(worktreePath);
		if (!branch) return null;

		const [branchCheck, prSummary] = await Promise.all([
			branchExistsOnRemote(worktreePath, branch),
			findPRForBranch(worktreePath, remote, branch),
		]);
		const existsOnRemote = branchCheck.status === "exists";

		let prData: GitHubStatus["pr"] = null;
		if (prSummary) {
			const [full, checks] = await Promise.all([
				showPR(worktreePath, remote, prSummary.pullRequestId),
				listPolicyChecks(worktreePath, remote, prSummary.pullRequestId),
			]);
			if (full) {
				prData = mapAzurePRToStatus(full, checks, remote);
			}
		}

		const result: GitHubStatus = {
			pr: prData,
			repoUrl: remote.repoWebUrl,
			branchExistsOnRemote: existsOnRemote,
			lastRefreshed: Date.now(),
		};

		statusCache.set(worktreePath, { data: result, timestamp: Date.now() });
		return result;
	} catch (err) {
		console.warn("[Azure] fetchAzurePRStatus failed:", err);
		return null;
	}
}

/** v1: stubbed to [] — Azure's thread-based comment model is deferred to v2. */
export async function fetchAzurePRComments(
	_worktreePath: string,
): Promise<PRComment[]> {
	return [];
}

/**
 * Complete an Azure PR. Throws on user-visible errors with MERGE_CONFLICT:
 * prefix when appropriate (matches GitHub's contract with the renderer).
 */
export async function mergeAzurePR(args: {
	worktreePath: string;
	prNumber: number;
	method: "merge" | "squash" | "rebase";
}): Promise<{ success: true }> {
	const detection = await detectAzureCli();
	if (detection.status !== "ok") {
		throw new Error(detectionToToastMessage(detection));
	}

	const remote = await resolveAzureRemote(args.worktreePath);
	if (!remote) {
		throw new Error("Could not determine Azure DevOps remote for this worktree.");
	}

	// Precheck mergeability so we can surface the existing MERGE_CONFLICT: contract.
	const pr = await showPR(args.worktreePath, remote, args.prNumber);
	if (pr?.mergeStatus === "conflicts") {
		throw new Error(
			"MERGE_CONFLICT: PR has merge conflicts. Sync with the target branch and resolve them.",
		);
	}

	if (args.method === "rebase") {
		console.warn(
			"[Azure] Rebase merge not directly supported by az CLI; falling back to non-squash merge.",
		);
	}

	const azArgs = [
		"repos",
		"pr",
		"update",
		"--id",
		String(args.prNumber),
		"--status",
		"completed",
		"--squash",
		args.method === "squash" ? "true" : "false",
		"--delete-source-branch",
		"true",
		"--organization",
		remote.orgUrl,
		"--output",
		"json",
	];

	try {
		await execWithShellEnv("az", azArgs, { cwd: args.worktreePath });
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		if (/conflict/i.test(msg) || /not mergeable/i.test(msg)) {
			throw new Error(`MERGE_CONFLICT: ${msg}`);
		}
		throw new Error(`Azure PR merge failed: ${msg}`);
	}

	invalidateAzurePRCache(args.worktreePath);
	invalidateAzurePRCommentsCache(args.worktreePath);
	return { success: true };
}

export async function updateAzurePRTitle(args: {
	worktreePath: string;
	title: string;
	prNumber?: number;
}): Promise<{ success: true; title: string }> {
	const detection = await detectAzureCli();
	if (detection.status !== "ok") {
		throw new Error(detectionToToastMessage(detection));
	}

	const remote = await resolveAzureRemote(args.worktreePath);
	if (!remote) {
		throw new Error("Could not determine Azure DevOps remote for this worktree.");
	}

	let prNumber = args.prNumber;
	if (prNumber == null) {
		const branch = await getCurrentBranch(args.worktreePath);
		if (!branch) {
			throw new Error("Could not determine current branch.");
		}
		const summary = await findPRForBranch(args.worktreePath, remote, branch);
		if (!summary) {
			throw new Error("No pull request found for the current branch.");
		}
		prNumber = summary.pullRequestId;
	}

	const azArgs = [
		"repos",
		"pr",
		"update",
		"--id",
		String(prNumber),
		"--title",
		args.title,
		"--organization",
		remote.orgUrl,
		"--output",
		"json",
	];

	try {
		await execWithShellEnv("az", azArgs, { cwd: args.worktreePath });
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw new Error(`Azure PR title update failed: ${msg}`);
	}

	invalidateAzurePRCache(args.worktreePath);
	return { success: true, title: args.title };
}

// ---------- internal helpers ----------

async function resolveAzureRemote(
	worktreePath: string,
): Promise<AzureRemote | null> {
	const info = await getGitRemoteInfo(worktreePath);
	if (info.provider !== "azure" || !info.remoteUrl) return null;
	return parseAzureRemoteUrl(info.remoteUrl);
}

async function getCurrentBranch(worktreePath: string): Promise<string | null> {
	try {
		const { stdout } = await execFileAsync(
			"git",
			["rev-parse", "--abbrev-ref", "HEAD"],
			{ cwd: worktreePath },
		);
		const b = stdout.trim();
		return b || null;
	} catch {
		return null;
	}
}

/** Return the first active PR (or most recent non-active) for the branch. */
async function findPRForBranch(
	worktreePath: string,
	remote: AzureRemote,
	branch: string,
): Promise<AzurePR | null> {
	const base = [
		"repos",
		"pr",
		"list",
		"--source-branch",
		`refs/heads/${branch}`,
		"--repository",
		remote.repository,
		"--project",
		remote.project,
		"--organization",
		remote.orgUrl,
		"--output",
		"json",
	];

	// Try active first, fall back to all (so merged/abandoned PRs still display).
	for (const status of ["active", "all"] as const) {
		try {
			const { stdout } = await execWithShellEnv(
				"az",
				[...base, "--status", status],
				{ cwd: worktreePath },
			);
			const raw = JSON.parse(stdout);
			if (!Array.isArray(raw) || raw.length === 0) continue;

			// Pick the highest pullRequestId (most recent)
			const sorted = raw
				.map((r) => AzurePRSchema.safeParse(r))
				.filter((r) => r.success)
				.map((r) => (r.success ? r.data : null))
				.filter((r): r is AzurePR => r !== null)
				.sort((a, b) => b.pullRequestId - a.pullRequestId);

			if (sorted[0]) return sorted[0];
		} catch {
			// fall through to next status
		}
	}

	return null;
}

async function showPR(
	worktreePath: string,
	remote: AzureRemote,
	prId: number,
): Promise<AzurePR | null> {
	try {
		const { stdout } = await execWithShellEnv(
			"az",
			[
				"repos",
				"pr",
				"show",
				"--id",
				String(prId),
				"--organization",
				remote.orgUrl,
				"--output",
				"json",
			],
			{ cwd: worktreePath },
		);
		const raw = JSON.parse(stdout);
		const parsed = AzurePRSchema.safeParse(raw);
		if (!parsed.success) {
			console.warn("[Azure] PR schema validation failed:", parsed.error);
			return null;
		}
		return parsed.data;
	} catch (err) {
		console.warn("[Azure] showPR failed:", err);
		return null;
	}
}

async function listPolicyChecks(
	worktreePath: string,
	remote: AzureRemote,
	prId: number,
): Promise<AzurePolicyEval[]> {
	try {
		const { stdout } = await execWithShellEnv(
			"az",
			[
				"repos",
				"pr",
				"policy",
				"list",
				"--id",
				String(prId),
				"--organization",
				remote.orgUrl,
				"--output",
				"json",
			],
			{ cwd: worktreePath },
		);
		const raw = JSON.parse(stdout);
		if (!Array.isArray(raw)) return [];
		return raw
			.map((r) => AzurePolicyEvalSchema.safeParse(r))
			.filter((r) => r.success)
			.map((r) => (r.success ? r.data : null))
			.filter((r): r is AzurePolicyEval => r !== null);
	} catch {
		return [];
	}
}

function mapAzurePRToStatus(
	pr: AzurePR,
	policies: AzurePolicyEval[],
	remote: AzureRemote,
): NonNullable<GitHubStatus["pr"]> {
	return {
		number: pr.pullRequestId,
		title: pr.title,
		url: `${remote.repoWebUrl}/pullrequest/${pr.pullRequestId}`,
		state: mapState(pr.status, pr.isDraft ?? false),
		mergedAt:
			pr.status === "completed" && pr.closedDate
				? Date.parse(pr.closedDate) || undefined
				: undefined,
		additions: 0, // v1: Azure JSON doesn't expose this cheaply
		deletions: 0,
		reviewDecision: mapReviewDecision(pr.reviewers ?? []),
		checksStatus: computeChecksStatus(policies),
		checks: policies.map((p) => ({
			name: p.configuration?.type?.displayName ?? "Policy",
			status: mapPolicyStatus(p.status),
		})),
		mergeable: mapMergeable(pr.mergeStatus),
	};
}

function mapState(
	status: AzurePR["status"],
	isDraft: boolean,
): NonNullable<GitHubStatus["pr"]>["state"] {
	if (status === "completed") return "merged";
	if (status === "abandoned") return "closed";
	if (isDraft) return "draft";
	return "open";
}

function mapReviewDecision(
	reviewers: NonNullable<AzurePR["reviewers"]>,
): NonNullable<GitHubStatus["pr"]>["reviewDecision"] {
	if (reviewers.some((r) => r.vote === -10)) return "changes_requested";
	const required = reviewers.filter((r) => r.isRequired);
	if (required.length > 0 && required.every((r) => r.vote >= 5)) {
		return "approved";
	}
	if (reviewers.some((r) => r.vote >= 5) && required.length === 0) {
		return "approved";
	}
	return "pending";
}

function mapMergeable(
	status: AzurePR["mergeStatus"],
): NonNullable<GitHubStatus["pr"]>["mergeable"] {
	if (status === "conflicts" || status === "rejectedByPolicy" || status === "failure") {
		return "CONFLICTING";
	}
	if (status === "succeeded") return "MERGEABLE";
	return "UNKNOWN";
}

function mapPolicyStatus(
	status: string,
): NonNullable<GitHubStatus["pr"]>["checks"][number]["status"] {
	const s = status.toLowerCase();
	if (s === "approved") return "success";
	if (s === "rejected" || s === "broken") return "failure";
	if (s === "queued" || s === "running") return "pending";
	if (s === "notapplicable") return "skipped";
	return "pending";
}

function computeChecksStatus(
	policies: AzurePolicyEval[],
): NonNullable<GitHubStatus["pr"]>["checksStatus"] {
	const relevant = policies.filter(
		(p) => p.status.toLowerCase() !== "notapplicable",
	);
	if (relevant.length === 0) return "none";
	if (relevant.some((p) => /^(rejected|broken)$/i.test(p.status))) {
		return "failure";
	}
	if (relevant.some((p) => /^(queued|running)$/i.test(p.status))) {
		return "pending";
	}
	return "success";
}

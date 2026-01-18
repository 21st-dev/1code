import type { ChangedFile, GitChangesStatus } from "../../../shared/changes-types";
import simpleGit from "simple-git";
import { z } from "zod";
import { publicProcedure, router } from "../trpc";
import { assertRegisteredWorktree, secureFs } from "./security";
import { applyNumstatToFiles } from "./utils/apply-numstat";
import {
	parseGitLog,
	parseGitStatus,
	parseNameStatus,
} from "./utils/parse-status";

export const createStatusRouter = () => {
	return router({
		getStatus: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					defaultBranch: z.string().optional(),
				}),
			)
			.query(async ({ input }): Promise<GitChangesStatus> => {
				console.log("[getStatus] Called with worktreePath:", input.worktreePath);
				assertRegisteredWorktree(input.worktreePath);

				const git = simpleGit(input.worktreePath);
				const defaultBranch = input.defaultBranch || "main";

				const status = await git.status();
				const parsed = parseGitStatus(status);

				const branchComparison = await getBranchComparison(git, defaultBranch);
				const trackingStatus = await getTrackingBranchStatus(git);

				await applyNumstatToFiles(git, parsed.staged, [
					"diff",
					"--cached",
					"--numstat",
				]);

				await applyNumstatToFiles(git, parsed.unstaged, ["diff", "--numstat"]);

				await applyUntrackedLineCount(input.worktreePath, parsed.untracked);

				const result = {
					branch: parsed.branch,
					defaultBranch,
					againstBase: branchComparison.againstBase,
					commits: branchComparison.commits,
					staged: parsed.staged,
					unstaged: parsed.unstaged,
					untracked: parsed.untracked,
					ahead: branchComparison.ahead,
					behind: branchComparison.behind,
					pushCount: trackingStatus.pushCount,
					pullCount: trackingStatus.pullCount,
					hasUpstream: trackingStatus.hasUpstream,
				};
				console.log("[getStatus] Returning:", {
					branch: result.branch,
					stagedCount: result.staged.length,
					unstagedCount: result.unstaged.length,
					untrackedCount: result.untracked.length,
					commitsCount: result.commits.length,
				});
				return result;
			}),

		getCommitFiles: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					commitHash: z.string(),
				}),
			)
			.query(async ({ input }): Promise<ChangedFile[]> => {
				assertRegisteredWorktree(input.worktreePath);

				const git = simpleGit(input.worktreePath);

				const nameStatus = await git.raw([
					"diff-tree",
					"--no-commit-id",
					"--name-status",
					"-r",
					input.commitHash,
				]);
				const files = parseNameStatus(nameStatus);

				await applyNumstatToFiles(git, files, [
					"diff-tree",
					"--no-commit-id",
					"--numstat",
					"-r",
					input.commitHash,
				]);

				return files;
			}),

		/**
		 * Get commit log for commit-graph visualization.
		 * Returns commits in the format expected by the commit-graph npm package.
		 */
		getCommitLog: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					limit: z.number().optional().default(50),
					offset: z.number().optional().default(0),
				}),
			)
			.query(async ({ input }) => {
				assertRegisteredWorktree(input.worktreePath);

				const git = simpleGit(input.worktreePath);

				// Get commits with parent info in format: hash|parents|subject|author|email|date
				const logOutput = await git.raw([
					"log",
					"--all",
					`--skip=${input.offset}`,
					`-n${input.limit}`,
					"--format=%H|%P|%s|%an|%ae|%aI",
				]);

				const commits = parseCommitLogForGraph(logOutput);

				// Get branch heads (local and remote)
				const branchOutput = await git.raw([
					"for-each-ref",
					"--format=%(refname:short)|%(objectname)",
					"refs/heads",
					"refs/remotes/origin",
				]);

				const branches = parseBranchHeads(branchOutput);

				// Get set of commits that exist on remote (for sync status)
				const remoteShas = await getRemoteCommitShas(git);

				// Check if there are more commits
				const totalCountOutput = await git.raw(["rev-list", "--all", "--count"]);
				const totalCount = Number.parseInt(totalCountOutput.trim(), 10);
				const hasMore = input.offset + input.limit < totalCount;

				return {
					commits,
					branches,
					remoteShas,
					hasMore,
					totalCount,
				};
			}),
	});
};

/** Commit type for commit-graph package */
interface GraphCommit {
	sha: string;
	commit: {
		author: {
			name: string;
			email: string;
			date: string;
		};
		message: string;
	};
	parents: Array<{ sha: string }>;
}

/** Branch type for commit-graph package */
interface GraphBranch {
	name: string;
	commit: { sha: string };
}

function parseCommitLogForGraph(output: string): GraphCommit[] {
	if (!output.trim()) return [];

	return output
		.trim()
		.split("\n")
		.filter((line) => line.trim())
		.map((line) => {
			const [hash, parents, message, author, email, date] = line.split("|");
			return {
				sha: hash,
				commit: {
					author: {
						name: author,
						email: email,
						date: date,
					},
					message: message,
				},
				parents: parents
					? parents.split(" ").map((p) => ({ sha: p }))
					: [],
			};
		});
}

function parseBranchHeads(output: string): GraphBranch[] {
	if (!output.trim()) return [];

	return output
		.trim()
		.split("\n")
		.filter((line) => line.trim())
		.map((line) => {
			const [name, sha] = line.split("|");
			// Clean up remote branch names (origin/main -> main)
			const cleanName = name.startsWith("origin/")
				? name.replace("origin/", "") + " (remote)"
				: name;
			return {
				name: cleanName,
				commit: { sha },
			};
		});
}

async function getRemoteCommitShas(
	git: ReturnType<typeof simpleGit>,
): Promise<string[]> {
	try {
		// Get all commits that exist on the remote tracking branch
		const output = await git.raw([
			"rev-list",
			"--remotes",
			"-n",
			"100", // Limit to avoid performance issues
		]);
		return output
			.trim()
			.split("\n")
			.filter((sha) => sha.trim());
	} catch {
		return [];
	}
}

interface BranchComparison {
	commits: GitChangesStatus["commits"];
	againstBase: ChangedFile[];
	ahead: number;
	behind: number;
}

async function getBranchComparison(
	git: ReturnType<typeof simpleGit>,
	defaultBranch: string,
): Promise<BranchComparison> {
	let commits: GitChangesStatus["commits"] = [];
	let againstBase: ChangedFile[] = [];
	let ahead = 0;
	let behind = 0;

	try {
		const tracking = await git.raw([
			"rev-list",
			"--left-right",
			"--count",
			`origin/${defaultBranch}...HEAD`,
		]);
		const [behindStr, aheadStr] = tracking.trim().split(/\s+/);
		behind = Number.parseInt(behindStr || "0", 10);
		ahead = Number.parseInt(aheadStr || "0", 10);

		const logOutput = await git.raw([
			"log",
			`origin/${defaultBranch}..HEAD`,
			"--format=%H|%h|%s|%an|%aI",
		]);
		commits = parseGitLog(logOutput);

		if (ahead > 0) {
			const nameStatus = await git.raw([
				"diff",
				"--name-status",
				`origin/${defaultBranch}...HEAD`,
			]);
			againstBase = parseNameStatus(nameStatus);

			await applyNumstatToFiles(git, againstBase, [
				"diff",
				"--numstat",
				`origin/${defaultBranch}...HEAD`,
			]);
		}
	} catch {}

	return { commits, againstBase, ahead, behind };
}

/** Max file size for line counting (1 MiB) - skip larger files to avoid OOM */
const MAX_LINE_COUNT_SIZE = 1 * 1024 * 1024;

async function applyUntrackedLineCount(
	worktreePath: string,
	untracked: ChangedFile[],
): Promise<void> {
	for (const file of untracked) {
		try {
			const stats = await secureFs.stat(worktreePath, file.path);
			if (stats.size > MAX_LINE_COUNT_SIZE) continue;

			const content = await secureFs.readFile(worktreePath, file.path);
			const lineCount = content.split("\n").length;
			file.additions = lineCount;
			file.deletions = 0;
		} catch {
			// Skip files that fail validation or reading
		}
	}
}

interface TrackingStatus {
	pushCount: number;
	pullCount: number;
	hasUpstream: boolean;
}

async function getTrackingBranchStatus(
	git: ReturnType<typeof simpleGit>,
): Promise<TrackingStatus> {
	try {
		const upstream = await git.raw([
			"rev-parse",
			"--abbrev-ref",
			"@{upstream}",
		]);
		if (!upstream.trim()) {
			return { pushCount: 0, pullCount: 0, hasUpstream: false };
		}

		const tracking = await git.raw([
			"rev-list",
			"--left-right",
			"--count",
			"@{upstream}...HEAD",
		]);
		const [pullStr, pushStr] = tracking.trim().split(/\s+/);
		return {
			pushCount: Number.parseInt(pushStr || "0", 10),
			pullCount: Number.parseInt(pullStr || "0", 10),
			hasUpstream: true,
		};
	} catch {
		return { pushCount: 0, pullCount: 0, hasUpstream: false };
	}
}

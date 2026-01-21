import { eq } from "drizzle-orm";
import { getDatabase, chats } from "../db";
import simpleGit from "simple-git";
import { z } from "zod";
import { publicProcedure, router } from "../trpc";
import {
	assertRegisteredWorktree,
	getRegisteredChat,
	gitSwitchBranch,
} from "./security";
import { createGit, createGitForNetwork, withGitLock, withLockRetry } from "./git-factory";

/** Regex for valid branch names */
const BRANCH_NAME_REGEX = /^[a-zA-Z0-9._/-]+$/;
/** Invalid branch name patterns */
const INVALID_BRANCH_PATTERNS = [/^-/, /\.\./, /\.$/, /^\./, /@\{/, /\\/, /\s/];

export const createBranchesRouter = () => {
	return router({
		getBranches: publicProcedure
			.input(z.object({ worktreePath: z.string() }))
			.query(
				async ({
					input,
				}): Promise<{
					current: string;
					local: Array<{ branch: string; lastCommitDate: number }>;
					remote: string[];
					defaultBranch: string;
					checkedOutBranches: Record<string, string>;
				}> => {
					assertRegisteredWorktree(input.worktreePath);
					const git = createGit(input.worktreePath);
					const branchSummary = await git.branch(["-a"]);

					const localBranches: string[] = [];
					const remote: string[] = [];

					for (const name of Object.keys(branchSummary.branches)) {
						if (name.startsWith("remotes/origin/")) {
							if (name === "remotes/origin/HEAD") continue;
							const remoteName = name.replace("remotes/origin/", "");
							remote.push(remoteName);
						} else {
							localBranches.push(name);
						}
					}

					const local = await getLocalBranchesWithDates(git, localBranches);
					const defaultBranch = await getDefaultBranch(git, remote);
					const checkedOutBranches = await getCheckedOutBranches(
						git,
						input.worktreePath,
					);

					return {
						current: branchSummary.current,
						local,
						remote: remote.sort(),
						defaultBranch,
						checkedOutBranches,
					};
				},
			),

		switchBranch: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					branch: z.string(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				const chat = getRegisteredChat(input.worktreePath);
				await gitSwitchBranch(input.worktreePath, input.branch);

				// Update the branch in the chat record
				const db = getDatabase();
				db.update(chats)
					.set({ branch: input.branch })
					.where(eq(chats.worktreePath, input.worktreePath))
					.run();

				return { success: true };
			}),

		createBranch: publicProcedure
			.input(
				z.object({
					projectPath: z.string(),
					branchName: z.string(),
					baseBranch: z.string(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean; branchName: string }> => {
				assertRegisteredWorktree(input.projectPath);

				// Validate branch name
				if (!BRANCH_NAME_REGEX.test(input.branchName)) {
					throw new Error(
						"Branch name can only contain letters, numbers, dots, hyphens, underscores, and slashes"
					);
				}
				for (const pattern of INVALID_BRANCH_PATTERNS) {
					if (pattern.test(input.branchName)) {
						throw new Error(`Invalid branch name: '${input.branchName}'`);
					}
				}
				if (input.branchName.length > 250) {
					throw new Error("Branch name too long (max 250 characters)");
				}

				return withGitLock(input.projectPath, async () => {
					const git = createGit(input.projectPath);

					// Check if branch already exists
					const branchSummary = await git.branch(["-a"]);
					const allBranches = Object.keys(branchSummary.branches);

					if (allBranches.includes(input.branchName)) {
						throw new Error(`Branch '${input.branchName}' already exists`);
					}

					// Determine the start point (prefer remote, fallback to local)
					let startPoint = input.baseBranch;
					if (allBranches.includes(`remotes/origin/${input.baseBranch}`)) {
						startPoint = `origin/${input.baseBranch}`;
					}

					// Create the new branch (without switching to it)
					await withLockRetry(input.projectPath, () =>
						git.branch([input.branchName, startPoint])
					);

					return { success: true, branchName: input.branchName };
				});
			}),

		deleteBranch: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					branch: z.string(),
					force: z.boolean().optional().default(false),
					deleteRemote: z.boolean().optional().default(false),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				assertRegisteredWorktree(input.worktreePath);

				return withGitLock(input.worktreePath, async () => {
					const git = createGit(input.worktreePath);

					// Get current branch
					const branchSummary = await git.branch(["-a"]);
					const currentBranch = branchSummary.current;

					// Cannot delete current branch
					if (input.branch === currentBranch) {
						throw new Error(
							`Cannot delete branch '${input.branch}' because it is currently checked out`
						);
					}

					// Check if branch is checked out in another worktree
					const checkedOutBranches = await getCheckedOutBranches(
						git,
						input.worktreePath
					);
					if (checkedOutBranches[input.branch]) {
						throw new Error(
							`Cannot delete branch '${input.branch}' because it is checked out in another worktree: ${checkedOutBranches[input.branch]}`
						);
					}

					// Delete local branch
					const deleteFlag = input.force ? "-D" : "-d";
					await withLockRetry(input.worktreePath, () =>
						git.branch([deleteFlag, input.branch])
					);

					// Optionally delete remote branch
					if (input.deleteRemote) {
						try {
							const networkGit = createGitForNetwork(input.worktreePath);
							await withLockRetry(input.worktreePath, () =>
								networkGit.push(["origin", "--delete", input.branch])
							);
						} catch (error) {
							const message = error instanceof Error ? error.message : String(error);
							// Ignore if remote branch doesn't exist
							if (!message.includes("remote ref does not exist")) {
								throw new Error(`Local branch deleted, but failed to delete remote: ${message}`);
							}
						}
					}

					return { success: true };
				});
			}),

		// Clean up orphaned branches (branches that were created for worktrees that no longer exist)
		cleanupOrphanedBranches: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					dryRun: z.boolean().optional().default(true),
				}),
			)
			.mutation(async ({ input }): Promise<{ orphanedBranches: string[]; deleted: string[] }> => {
				assertRegisteredWorktree(input.worktreePath);

				const git = createGit(input.worktreePath);
				const db = getDatabase();

				// Get all local branches
				const branchSummary = await git.branch(["-a"]);
				const localBranches = Object.keys(branchSummary.branches).filter(
					(b) => !b.startsWith("remotes/")
				);

				// Get all branches that are associated with active chats
				const activeChats = db.select().from(chats).all();
				const activeBranches = new Set(activeChats.map((c) => c.branch).filter(Boolean));

				// Also add the default branch and current branch
				const defaultBranch = await getDefaultBranch(git, []);
				activeBranches.add(defaultBranch);
				activeBranches.add(branchSummary.current);

				// Find orphaned branches (pattern: adjective-animal-hex, e.g., clever-fox-a1b2)
				const worktreeBranchPattern = /^[a-z]+-[a-z]+-[a-f0-9]{3,}$/;
				const orphanedBranches = localBranches.filter((branch) => {
					// Only consider auto-generated worktree branches
					if (!worktreeBranchPattern.test(branch)) return false;
					// Skip if branch is active
					if (activeBranches.has(branch)) return false;
					return true;
				});

				const deleted: string[] = [];
				if (!input.dryRun) {
					for (const branch of orphanedBranches) {
						try {
							await git.branch(["-D", branch]);
							deleted.push(branch);
						} catch {
							// Skip branches that can't be deleted
						}
					}
				}

				return { orphanedBranches, deleted };
			}),

		fetchRemote: publicProcedure
			.input(z.object({ worktreePath: z.string() }))
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				assertRegisteredWorktree(input.worktreePath);
				return withGitLock(input.worktreePath, async () => {
					const git = createGitForNetwork(input.worktreePath);
					await git.fetch(["--prune", "--all"]);
					return { success: true };
				});
			}),
	});
};

async function getLocalBranchesWithDates(
	git: ReturnType<typeof simpleGit>,
	localBranches: string[],
): Promise<Array<{ branch: string; lastCommitDate: number }>> {
	try {
		const branchInfo = await git.raw([
			"for-each-ref",
			"--sort=-committerdate",
			"--format=%(refname:short) %(committerdate:unix)",
			"refs/heads/",
		]);

		const local: Array<{ branch: string; lastCommitDate: number }> = [];
		for (const line of branchInfo.trim().split("\n")) {
			if (!line) continue;
			const lastSpaceIdx = line.lastIndexOf(" ");
			const branch = line.substring(0, lastSpaceIdx);
			const timestamp = Number.parseInt(line.substring(lastSpaceIdx + 1), 10);
			if (localBranches.includes(branch)) {
				local.push({
					branch,
					lastCommitDate: timestamp * 1000,
				});
			}
		}
		return local;
	} catch {
		return localBranches.map((branch) => ({ branch, lastCommitDate: 0 }));
	}
}

async function getDefaultBranch(
	git: ReturnType<typeof simpleGit>,
	remoteBranches: string[],
): Promise<string> {
	try {
		const headRef = await git.raw(["symbolic-ref", "refs/remotes/origin/HEAD"]);
		const match = headRef.match(/refs\/remotes\/origin\/(.+)/);
		if (match) {
			return match[1].trim();
		}
	} catch {
		if (remoteBranches.includes("master") && !remoteBranches.includes("main")) {
			return "master";
		}
	}
	return "main";
}

async function getCheckedOutBranches(
	git: ReturnType<typeof simpleGit>,
	currentWorktreePath: string,
): Promise<Record<string, string>> {
	const checkedOutBranches: Record<string, string> = {};

	try {
		const worktreeList = await git.raw(["worktree", "list", "--porcelain"]);
		const lines = worktreeList.split("\n");
		let currentPath: string | null = null;

		for (const line of lines) {
			if (line.startsWith("worktree ")) {
				currentPath = line.substring(9).trim();
			} else if (line.startsWith("branch ")) {
				const branch = line.substring(7).trim().replace("refs/heads/", "");
				if (currentPath && currentPath !== currentWorktreePath) {
					checkedOutBranches[branch] = currentPath;
				}
			}
		}
	} catch {}

	return checkedOutBranches;
}

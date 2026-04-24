import { shell } from "electron";
import simpleGit from "simple-git";
import { z } from "zod";
import { publicProcedure, router } from "../trpc";
import {
	isUpstreamMissingError,
	isNonFastForwardPushError,
	REMOTE_AHEAD_ERROR_PREFIX,
} from "./git-utils";
import { assertRegisteredWorktree } from "./security";
import { buildCreatePRWebUrl, fetchPRStatus, resolveProvider } from "./providers";
import { gitCache } from "./cache";
import {
	createGit,
	createGitForNetwork,
	withGitLock,
	withLockRetry,
	hasUncommittedChanges,
	getRepositoryState,
	GIT_TIMEOUTS,
} from "./git-factory";

export { isUpstreamMissingError };

async function hasUpstreamBranch(
	git: ReturnType<typeof simpleGit>,
): Promise<boolean> {
	try {
		await git.raw(["rev-parse", "--abbrev-ref", "@{upstream}"]);
		return true;
	} catch {
		return false;
	}
}

/** Protected branches that should not be force-pushed to */
const PROTECTED_BRANCHES = ["main", "master", "develop", "production", "staging"];

function invalidateGitStateCaches(worktreePath: string): void {
	gitCache.invalidateStatus(worktreePath);
	gitCache.invalidateParsedDiff(worktreePath);
	gitCache.invalidateAllFileContents(worktreePath);
}

export const createGitOperationsRouter = () => {
	return router({
		// NOTE: saveFile is defined in file-contents.ts with hardened path validation
		// Do NOT add saveFile here - it would overwrite the secure version

		fetch: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				assertRegisteredWorktree(input.worktreePath);

				return withGitLock(input.worktreePath, async () => {
					const git = createGitForNetwork(input.worktreePath);
					await withLockRetry(input.worktreePath, () =>
						git.fetch(["--all", "--prune"])
					);
					invalidateGitStateCaches(input.worktreePath);
					return { success: true };
				});
			}),

		checkout: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					branch: z.string(),
					/** "auto-stash" stashes uncommitted changes and pops them on the
					 * new branch; "carry" attempts a plain checkout which git will
					 * allow only if there's no conflict; default aborts if dirty. */
					uncommittedStrategy: z
						.enum(["abort", "carry", "stash"])
						.optional()
						.default("abort"),
				}),
			)
			.mutation(
				async ({
					input,
				}): Promise<{ success: boolean; stashPopFailed?: boolean }> => {
					assertRegisteredWorktree(input.worktreePath);

					return withGitLock(input.worktreePath, async () => {
						const dirty = await hasUncommittedChanges(input.worktreePath);

						if (dirty && input.uncommittedStrategy === "abort") {
							throw new Error(
								"Cannot switch branches: you have uncommitted changes. Please commit or stash your changes first."
							);
						}

						const git = createGit(input.worktreePath);

						if (dirty && input.uncommittedStrategy === "stash") {
							await withLockRetry(input.worktreePath, () =>
								git.stash([
									"push",
									"-u",
									"-m",
									`Auto-stash before switching to ${input.branch}`,
								]),
							);
						}

						try {
							await withLockRetry(input.worktreePath, () =>
								git.checkout(input.branch)
							);
						} catch (checkoutError) {
							// If we stashed, try to pop back so the user doesn't lose work
							if (dirty && input.uncommittedStrategy === "stash") {
								try {
									await git.stash(["pop"]);
								} catch {
									const msg =
										checkoutError instanceof Error
											? checkoutError.message
											: "Checkout failed";
									throw new Error(
										`${msg}. Your uncommitted changes are saved in git stash — run 'git stash pop' manually to restore them.`,
									);
								}
							}
							throw checkoutError;
						}

						let stashPopFailed = false;
						if (dirty && input.uncommittedStrategy === "stash") {
							try {
								await git.stash(["pop"]);
							} catch {
								stashPopFailed = true;
							}
						}

						invalidateGitStateCaches(input.worktreePath);
						return { success: true, stashPopFailed };
					});
				},
			),

		getHistory: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					limit: z.number().optional().default(50),
				}),
			)
			.query(
				async ({
					input,
				}): Promise<
					Array<{
						hash: string;
						shortHash: string;
						message: string;
						author: string;
						email: string;
						date: Date;
						tags: string[];
					}>
				> => {
					assertRegisteredWorktree(input.worktreePath);

					const git = createGit(input.worktreePath);
					const logOutput = await git.raw([
						"log",
						`-${input.limit}`,
						"--format=%H|%h|%s|%an|%ae|%aI|%D",
					]);

					if (!logOutput.trim()) return [];

					return logOutput
						.trim()
						.split("\n")
						.map((line) => {
							const [hash, shortHash, message, author, email, dateStr, refs] =
								line.split("|");
							// Extract tags from ref names (format: "HEAD -> main, tag: v1.0.0, origin/main")
							const tags = (refs || "")
								.split(",")
								.map((r) => r.trim())
								.filter((r) => r.startsWith("tag: "))
								.map((r) => r.replace("tag: ", ""));
							return {
								hash: hash || "",
								shortHash: shortHash || "",
								message: message || "",
								author: author || "",
								email: email || "",
								date: new Date(dateStr || ""),
								tags,
							};
						});
				},
			),

		commit: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					message: z.string(),
				}),
			)
			.mutation(
				async ({ input }): Promise<{ success: boolean; hash: string }> => {
					assertRegisteredWorktree(input.worktreePath);

					// Validate message
					if (!input.message.trim()) {
						throw new Error("Commit message cannot be empty");
					}

					return withGitLock(input.worktreePath, async () => {
						const git = createGit(input.worktreePath);

						// Check that there are staged changes
						const status = await git.status();
						if (status.staged.length === 0) {
							throw new Error("No files staged for commit");
						}

						const result = await withLockRetry(input.worktreePath, () =>
							git.commit(input.message)
						);
						invalidateGitStateCaches(input.worktreePath);
						return { success: true, hash: result.commit };
					});
				},
			),

		// Atomic commit: stage specific files and commit in one operation
		atomicCommit: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					filePaths: z.array(z.string()),
					message: z.string(),
				}),
			)
			.mutation(
				async ({ input }): Promise<{ success: boolean; hash: string }> => {
					assertRegisteredWorktree(input.worktreePath);

					// Validate message
					if (!input.message.trim()) {
						throw new Error("Commit message cannot be empty");
					}

					// Validate files
					if (input.filePaths.length === 0) {
						throw new Error("No files selected for commit");
					}

					return withGitLock(input.worktreePath, async () => {
						const git = createGit(input.worktreePath);

						// First, unstage everything to start fresh
						await withLockRetry(input.worktreePath, () =>
							git.reset(["HEAD"])
						);

						// Stage only the selected files
						await withLockRetry(input.worktreePath, () =>
							git.add(["--", ...input.filePaths])
						);

						// Verify files were staged
						const status = await git.status();
						if (status.staged.length === 0) {
							throw new Error("Failed to stage files for commit");
						}

						// Commit
						const result = await withLockRetry(input.worktreePath, () =>
							git.commit(input.message)
						);

						invalidateGitStateCaches(input.worktreePath);
						return { success: true, hash: result.commit };
					});
				},
			),

		push: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					setUpstream: z.boolean().optional(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				assertRegisteredWorktree(input.worktreePath);

				return withGitLock(input.worktreePath, async () => {
					const git = createGitForNetwork(input.worktreePath);
					const hasUpstream = await hasUpstreamBranch(git);

					try {
						if (input.setUpstream && !hasUpstream) {
							const branch = await git.revparse(["--abbrev-ref", "HEAD"]);
							await withLockRetry(input.worktreePath, () =>
								git.push(["--set-upstream", "origin", branch.trim()])
							);
						} else {
							await withLockRetry(input.worktreePath, () => git.push());
						}
					} catch (error) {
						const message =
							error instanceof Error ? error.message : String(error);
						if (isNonFastForwardPushError(message)) {
							throw new Error(
								`${REMOTE_AHEAD_ERROR_PREFIX} Remote has new commits. Pull with rebase and retry.`
							);
						}
						throw error;
					}
					await git.fetch();
					invalidateGitStateCaches(input.worktreePath);
					return { success: true };
				});
			}),

		pull: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					autoStash: z.boolean().optional().default(false),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				assertRegisteredWorktree(input.worktreePath);

				return withGitLock(input.worktreePath, async () => {
					const git = createGitForNetwork(input.worktreePath);

					// Safety check: prevent pull with uncommitted changes (data loss risk)
					const hasChanges = await hasUncommittedChanges(input.worktreePath);
					if (hasChanges && !input.autoStash) {
						throw new Error(
							"Cannot pull with uncommitted changes. Please commit or stash your changes first, or enable auto-stash."
						);
					}

					// Check for ongoing rebase/merge
					const repoState = await getRepositoryState(input.worktreePath);
					if (repoState.isRebasing || repoState.isMerging) {
						throw new Error(
							"Cannot pull: a rebase or merge is in progress. Please complete or abort it first."
						);
					}

					try {
						if (input.autoStash && hasChanges) {
							// Stash changes before pull
							await git.stash(["push", "-m", "Auto-stash before pull"]);
						}

						await withLockRetry(input.worktreePath, () =>
							git.pull(["--rebase"])
						);

						if (input.autoStash && hasChanges) {
							// Pop stashed changes
							try {
								await git.stash(["pop"]);
							} catch (stashError) {
								// Stash pop failed (likely conflict)
								throw new Error(
									"Pull succeeded but failed to restore your stashed changes. Your changes are saved in git stash. Run 'git stash pop' to restore them."
								);
							}
						}
					} catch (error) {
						const message =
							error instanceof Error ? error.message : String(error);
						if (isUpstreamMissingError(message)) {
							throw new Error(
								"No upstream branch to pull from. The remote branch may have been deleted.",
							);
						}
						// Check for rebase conflicts
						if (message.includes("CONFLICT") || message.includes("could not apply")) {
							// Abort the rebase
							await git.rebase(["--abort"]).catch(() => {});
							throw new Error(
								"Pull failed due to conflicts. The operation has been aborted. Please resolve conflicts manually or try a different approach."
							);
						}
						throw error;
					}
					invalidateGitStateCaches(input.worktreePath);
					return { success: true };
				});
			}),

		sync: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					autoStash: z.boolean().optional().default(false),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				assertRegisteredWorktree(input.worktreePath);

				return withGitLock(input.worktreePath, async () => {
					const git = createGitForNetwork(input.worktreePath);

					// Safety check: prevent sync with uncommitted changes
					const hasChanges = await hasUncommittedChanges(input.worktreePath);
					if (hasChanges && !input.autoStash) {
						throw new Error(
							"Cannot sync with uncommitted changes. Please commit or stash your changes first."
						);
					}

					// Check for ongoing rebase/merge
					const repoState = await getRepositoryState(input.worktreePath);
					if (repoState.isRebasing || repoState.isMerging) {
						throw new Error(
							"Cannot sync: a rebase or merge is in progress. Please complete or abort it first."
						);
					}

					try {
						if (input.autoStash && hasChanges) {
							await git.stash(["push", "-m", "Auto-stash before sync"]);
						}

						await withLockRetry(input.worktreePath, () =>
							git.pull(["--rebase"])
						);

						if (input.autoStash && hasChanges) {
							try {
								await git.stash(["pop"]);
							} catch {
								throw new Error(
									"Sync pull succeeded but failed to restore your stashed changes. Your changes are saved in git stash."
								);
							}
						}
					} catch (error) {
						const message =
							error instanceof Error ? error.message : String(error);
						if (isUpstreamMissingError(message)) {
							const branch = await git.revparse(["--abbrev-ref", "HEAD"]);
							await withLockRetry(input.worktreePath, () =>
								git.push(["--set-upstream", "origin", branch.trim()])
							);
							await git.fetch();
							invalidateGitStateCaches(input.worktreePath);
							return { success: true };
						}
						// Check for rebase conflicts
						if (message.includes("CONFLICT") || message.includes("could not apply")) {
							await git.rebase(["--abort"]).catch(() => {});
							throw new Error(
								"Sync failed due to conflicts. The operation has been aborted. Please resolve conflicts manually."
							);
						}
						throw error;
					}
					await withLockRetry(input.worktreePath, () => git.push());
					await git.fetch();
					invalidateGitStateCaches(input.worktreePath);
					return { success: true };
				});
			}),

		forcePush: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					confirmProtectedBranch: z.boolean().optional().default(false),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				assertRegisteredWorktree(input.worktreePath);

				return withGitLock(input.worktreePath, async () => {
					const git = createGitForNetwork(input.worktreePath);

					// Get current branch
					const branch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();

					// Check if it's a protected branch
					if (PROTECTED_BRANCHES.includes(branch) && !input.confirmProtectedBranch) {
						throw new Error(
							`Cannot force push to protected branch '${branch}'. This action requires explicit confirmation.`
						);
					}

					await withLockRetry(input.worktreePath, () =>
						git.push(["--force-with-lease"])
					);
					await git.fetch();
					invalidateGitStateCaches(input.worktreePath);
					return { success: true };
				});
			}),

		mergeFromDefault: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					useRebase: z.boolean().optional().default(false),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				assertRegisteredWorktree(input.worktreePath);

				return withGitLock(input.worktreePath, async () => {
					const git = createGitForNetwork(input.worktreePath);

					// Safety check: prevent merge/rebase with uncommitted changes
					if (await hasUncommittedChanges(input.worktreePath)) {
						throw new Error(
							"Cannot merge/rebase with uncommitted changes. Please commit or stash your changes first."
						);
					}

					// Check for ongoing rebase/merge
					const repoState = await getRepositoryState(input.worktreePath);
					if (repoState.isRebasing || repoState.isMerging) {
						throw new Error(
							"Cannot merge/rebase: another merge or rebase is in progress. Please complete or abort it first."
						);
					}

					// Fetch latest from remote first
					await withLockRetry(input.worktreePath, () =>
						git.fetch(["--all"])
					);

					// Determine default branch (main or master)
					let defaultBranch = "main";
					try {
						await git.raw(["rev-parse", "--verify", "origin/main"]);
					} catch {
						try {
							await git.raw(["rev-parse", "--verify", "origin/master"]);
							defaultBranch = "master";
						} catch {
							throw new Error("Could not find default branch (main or master)");
						}
					}

					try {
						if (input.useRebase) {
							await withLockRetry(input.worktreePath, () =>
								git.rebase([`origin/${defaultBranch}`])
							);
						} else {
							await withLockRetry(input.worktreePath, () =>
								git.merge([`origin/${defaultBranch}`, "--no-edit"])
							);
						}
					} catch (error) {
						const message =
							error instanceof Error ? error.message : String(error);

						// Check for conflicts
						if (
							message.includes("CONFLICT") ||
							message.includes("could not apply") ||
							message.includes("merge failed")
						) {
							// Abort the operation
							if (input.useRebase) {
								await git.rebase(["--abort"]).catch(() => {});
							} else {
								await git.merge(["--abort"]).catch(() => {});
							}
							throw new Error(
								`${input.useRebase ? "Rebase" : "Merge"} failed due to conflicts. The operation has been aborted. Please resolve conflicts manually or use a different strategy.`
							);
						}
						throw error;
					}

					invalidateGitStateCaches(input.worktreePath);
					return { success: true };
				});
			}),

		// Abort an ongoing rebase
		abortRebase: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				assertRegisteredWorktree(input.worktreePath);

				return withGitLock(input.worktreePath, async () => {
					const git = createGit(input.worktreePath);
					await git.rebase(["--abort"]);
					invalidateGitStateCaches(input.worktreePath);
					return { success: true };
				});
			}),

		// Abort an ongoing merge
		abortMerge: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				assertRegisteredWorktree(input.worktreePath);

				return withGitLock(input.worktreePath, async () => {
					const git = createGit(input.worktreePath);
					await git.merge(["--abort"]);
					invalidateGitStateCaches(input.worktreePath);
					return { success: true };
				});
			}),

		// Get repository state (rebase/merge in progress, conflicts)
		getRepositoryState: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
				}),
			)
			.query(async ({ input }) => {
				assertRegisteredWorktree(input.worktreePath);
				return getRepositoryState(input.worktreePath);
			}),

		createPR: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					baseBranch: z.string().optional(),
				}),
			)
			.mutation(
				async ({ input }): Promise<{ success: boolean; url: string }> => {
					assertRegisteredWorktree(input.worktreePath);

					return withGitLock(input.worktreePath, async () => {
						const git = createGitForNetwork(input.worktreePath);
						const branch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();
						const hasUpstream = await hasUpstreamBranch(git);

						// Ensure branch is pushed first
						if (!hasUpstream) {
							await withLockRetry(input.worktreePath, () =>
								git.push(["--set-upstream", "origin", branch])
							);
						} else {
							// Push any unpushed commits
							await withLockRetry(input.worktreePath, () => git.push());
						}

						const remoteUrl = (await git.remote(["get-url", "origin"])) || "";
						const provider = await resolveProvider(input.worktreePath);
						if (!provider) {
							throw new Error(
								"Could not determine repository provider from remote URL",
							);
						}

						const url = buildCreatePRWebUrl({
							provider,
							remoteUrl: remoteUrl.trim(),
							branch,
							baseBranch: input.baseBranch ?? "main",
						});

						await shell.openExternal(url);
						await git.fetch();
						invalidateGitStateCaches(input.worktreePath);

						return { success: true, url };
					});
				},
			),

		// Procedure name preserved for back-compat with the renderer (usePRStatus
		// hook calls `trpc.changes.getGitHubStatus.useQuery`). Under the hood it
		// now dispatches by provider — GitHub stays byte-identical, Azure uses az.
		getGitHubStatus: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
				}),
			)
			.query(async ({ input }) => {
				assertRegisteredWorktree(input.worktreePath);
				return await fetchPRStatus(input.worktreePath);
			}),
	});
};

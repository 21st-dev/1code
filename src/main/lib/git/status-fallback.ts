import type { ChangedFile, GitChangesStatus } from "../../../shared/changes-types";
import fs from "node:fs";
import * as isoGit from "isomorphic-git";
import type { StatusRow } from "isomorphic-git";

const FALLBACK_SKIP_PREFIXES = [
	".git/",
	"node_modules/",
	"dist/",
	"out/",
	"release/",
	"release-",
	"tmp/",
	".tmp/",
	".vite/",
	"evidence/",
	".1code/",
];

const FALLBACK_MAX_FILES_PER_BUCKET = 500;

interface FallbackStatusBuckets {
	staged: ChangedFile[];
	unstaged: ChangedFile[];
	untracked: ChangedFile[];
}

export function isRecoverableGitStatusError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return /xcode.*license|xcodebuild -license|have not agreed|spawn git ENOENT|unable to find git|cannot find git|git.*not found/i.test(
		message,
	);
}

export async function getReadOnlyGitStatusFallback(
	worktreePath: string,
	defaultBranch: string,
): Promise<GitChangesStatus> {
	const [branch, statusMatrix] = await Promise.all([
		getCurrentBranch(worktreePath),
		isoGit.statusMatrix({
			fs,
			dir: worktreePath,
			filter: shouldIncludeFallbackPath,
			ignored: false,
			refresh: false,
		}),
	]);
	const parsed = parseIsomorphicStatusMatrix(statusMatrix);

	return {
		branch,
		defaultBranch,
		againstBase: [],
		commits: [],
		staged: parsed.staged,
		unstaged: parsed.unstaged,
		untracked: parsed.untracked,
		ahead: 0,
		behind: 0,
		pushCount: 0,
		pullCount: 0,
		hasUpstream: false,
	};
}

export function parseIsomorphicStatusMatrix(
	statusMatrix: StatusRow[],
): FallbackStatusBuckets {
	const staged: ChangedFile[] = [];
	const unstaged: ChangedFile[] = [];
	const untracked: ChangedFile[] = [];

	for (const [path, head, workdir, stage] of statusMatrix) {
		if ((head === 1 && workdir === 1 && stage === 1) || (head === 0 && workdir === 0 && stage === 0)) {
			continue;
		}

		if (head === 0 && workdir === 2 && stage === 0) {
			untracked.push(toChangedFile(path, "untracked"));
			continue;
		}

		if (head !== stage) {
			staged.push(toChangedFile(path, getStagedStatus(head, stage)));
		}

		if (workdir !== stage) {
			unstaged.push(toChangedFile(path, getUnstagedStatus(head, workdir, stage)));
		}
	}

	return {
		staged: limitChangedFilesForStatus(staged),
		unstaged: limitChangedFilesForStatus(unstaged),
		untracked: limitChangedFilesForStatus(untracked),
	};
}

export function limitChangedFilesForStatus(files: ChangedFile[]): ChangedFile[] {
	return files
		.sort((a, b) => getPathSortRank(a.path) - getPathSortRank(b.path) || a.path.localeCompare(b.path))
		.slice(0, FALLBACK_MAX_FILES_PER_BUCKET);
}

function shouldIncludeFallbackPath(path: string): boolean {
	return !FALLBACK_SKIP_PREFIXES.some((prefix) => path === prefix.slice(0, -1) || path.startsWith(prefix));
}

async function getCurrentBranch(worktreePath: string): Promise<string> {
	try {
		return (
			(await isoGit.currentBranch({
				fs,
				dir: worktreePath,
				fullname: false,
			})) || "HEAD"
		);
	} catch {
		return "HEAD";
	}
}

function getStagedStatus(
	head: StatusRow[1],
	stage: StatusRow[3],
): ChangedFile["status"] {
	if (stage === 0) return "deleted";
	if (head === 0) return "added";
	return "modified";
}

function getUnstagedStatus(
	head: StatusRow[1],
	workdir: StatusRow[2],
	stage: StatusRow[3],
): ChangedFile["status"] {
	if (workdir === 0) return "deleted";
	if (head === 0 && stage === 0) return "untracked";
	return "modified";
}

function toChangedFile(
	path: string,
	status: ChangedFile["status"],
): ChangedFile {
	return {
		path,
		status,
		additions: 0,
		deletions: 0,
	};
}

function getPathSortRank(path: string): number {
	if (
		path === "package.json" ||
		path === "bun.lock" ||
		path.startsWith("src/") ||
		path.startsWith("scripts/")
	) {
		return 0;
	}
	if (path.startsWith(".")) return 2;
	return 1;
}

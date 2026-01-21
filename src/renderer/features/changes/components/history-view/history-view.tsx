import { memo, useMemo, useCallback, useEffect } from "react";
import { trpc } from "../../../../lib/trpc";
import { formatRelativeDate } from "../../utils/date";
import { FileText, ArrowUp } from "lucide-react";
import { cn } from "../../../../lib/utils";
import { getStatusIndicator } from "../../utils/status";
import { Button } from "../../../../components/ui/button";
import type { ChangedFile } from "../../../../../shared/changes-types";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "../../../../components/ui/context-menu";
import { toast } from "sonner";

export interface CommitInfo {
	hash: string;
	shortHash: string;
	message: string;
	author: string;
	email: string;
	date: Date;
}

interface HistoryViewProps {
	worktreePath: string;
	selectedCommitHash?: string | null;
	selectedFilePath?: string | null;
	onCommitSelect?: (commit: CommitInfo | null) => void;
	onFileSelect?: (file: ChangedFile, commitHash: string) => void;
	pushCount?: number;
}

export const HistoryView = memo(function HistoryView({
	worktreePath,
	selectedCommitHash,
	selectedFilePath,
	onCommitSelect,
	onFileSelect,
	pushCount,
}: HistoryViewProps) {
	const { data: commits, isLoading, refetch: refetchHistory } = trpc.changes.getHistory.useQuery(
		{ worktreePath, limit: 50 },
		{
			enabled: !!worktreePath,
			staleTime: 30000, // 30 seconds - history changes rarely
		},
	);

	// Check if worktree is registered
	const { data: isWorktreeRegistered } = trpc.changes.isWorktreeRegistered.useQuery(
		{ worktreePath },
		{ enabled: !!worktreePath },
	);

	// Fetch files for selected commit
	const {
		data: commitFiles,
		isLoading: isLoadingFiles,
		error: filesError,
		refetch: refetchFiles,
	} = trpc.changes.getCommitFiles.useQuery(
		{ worktreePath, commitHash: selectedCommitHash! },
		{
			enabled: !!worktreePath && !!selectedCommitHash,
			staleTime: 60000, // 1 minute - commit files don't change
		},
	);

	// Auto-select first commit when history loads (if none selected)
	useEffect(() => {
		if (commits && commits.length > 0 && !selectedCommitHash && onCommitSelect) {
			onCommitSelect(commits[0]);
		}
	}, [commits, selectedCommitHash, onCommitSelect]);

	// Auto-select first file when commit files load
	useEffect(() => {
		if (commitFiles && commitFiles.length > 0 && selectedCommitHash && !selectedFilePath && onFileSelect) {
			onFileSelect(commitFiles[0], selectedCommitHash);
		}
	}, [commitFiles, selectedCommitHash, selectedFilePath, onFileSelect]);

	// Refetch history and commit files when window gains focus
	useEffect(() => {
		if (!worktreePath) return

		const handleWindowFocus = () => {
			// Refetch commit history
			refetchHistory()
			// Refetch commit files if a commit is selected
			if (selectedCommitHash) {
				refetchFiles()
			}
		}

		window.addEventListener('focus', handleWindowFocus)
		return () => window.removeEventListener('focus', handleWindowFocus)
	}, [worktreePath, selectedCommitHash, refetchHistory, refetchFiles])

	const handleCommitClick = useCallback(
		(commit: CommitInfo) => {
			onCommitSelect?.(commit);
		},
		[onCommitSelect],
	);

	const handleFileClick = useCallback(
		(file: ChangedFile) => {
			if (selectedCommitHash) {
				onFileSelect?.(file, selectedCommitHash);
			}
		},
		[selectedCommitHash, onFileSelect],
	);

	if (isLoading) {
		return (
			<div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
				Loading...
			</div>
		);
	}

	if (!commits?.length) {
		return (
			<div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
				No commits yet
			</div>
		);
	}

	return (
		<div className="flex-1 overflow-y-auto">
			{/* Worktree not registered warning */}
			{isWorktreeRegistered === false && worktreePath && (
				<div className="p-4 bg-yellow-500/10 border border-yellow-500/20 text-yellow-600 text-xs">
					Worktree not registered. Cannot load commit files.
				</div>
			)}

			{/* Commits list - only commits, files are shown in right panel */}
			{commits.map((commit, index) => (
				<HistoryCommitItem
					key={commit.hash}
					commit={commit}
					isSelected={selectedCommitHash === commit.hash}
					isUnpushed={index < (pushCount || 0)}
					onClick={() => handleCommitClick(commit)}
				/>
			))}
		</div>
	);
});

const HistoryCommitItem = memo(function HistoryCommitItem({
	commit,
	isSelected,
	isUnpushed,
	onClick,
}: {
	commit: CommitInfo;
	isSelected: boolean;
	isUnpushed?: boolean;
	onClick: () => void;
}) {
	const timeAgo = useMemo(
		() => formatRelativeDate(new Date(commit.date)),
		[commit.date],
	);

	const handleCopySha = useCallback(() => {
		navigator.clipboard.writeText(commit.hash);
		toast.success("Copied SHA to clipboard");
	}, [commit.hash]);

	const handleOpenOnRemote = useCallback(() => {
		// TODO: Get repository URL and construct commit URL
		// For now, just show a toast
		toast.info("Open on remote - not implemented yet");
	}, []);

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<div
					className={cn(
						"flex items-center gap-2 px-2 py-2 cursor-pointer transition-colors",
						"hover:bg-muted/50 border-b border-border/30 last:border-b-0",
						isSelected && "bg-muted",
					)}
					onClick={onClick}
				>
					<div className="flex-1 min-w-0">
						<div className="text-xs font-medium truncate">{commit.message}</div>
						<div className="text-xs text-muted-foreground flex items-center gap-1">
							<span className="font-mono">{commit.shortHash}</span>
							<span>·</span>
							<span className="truncate">{commit.author}</span>
							<span>·</span>
							<span className="shrink-0">{timeAgo}</span>
						</div>
					</div>
					{isUnpushed && (
						<div className="flex items-center justify-center w-7 h-6 rounded bg-primary/10 shrink-0">
							<ArrowUp className="size-3.5 text-primary" />
						</div>
					)}
				</div>
			</ContextMenuTrigger>
			<ContextMenuContent className="w-48">
				<ContextMenuItem onClick={handleCopySha}>
					Copy SHA
				</ContextMenuItem>
				<ContextMenuItem
					onClick={handleOpenOnRemote}
					disabled={isUnpushed}
				>
					Open on Remote
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
});

const CommitFileItem = memo(function CommitFileItem({
	file,
	isSelected,
	onClick,
}: {
	file: ChangedFile;
	isSelected: boolean;
	onClick: () => void;
}) {
	const fileName = file.path.split("/").pop() || file.path;
	const dirPath = file.path.includes("/")
		? file.path.substring(0, file.path.lastIndexOf("/"))
		: "";

	return (
		<div
			className={cn(
				"flex items-center gap-2 px-2 py-1 cursor-pointer transition-colors",
				"hover:bg-muted/80",
				isSelected && "bg-muted",
			)}
			onClick={onClick}
		>
			<FileText className="size-3.5 text-muted-foreground shrink-0 ml-5" />
			<div className="flex-1 min-w-0 flex items-center overflow-hidden">
				{dirPath && (
					<span className="text-xs text-muted-foreground truncate flex-shrink min-w-0">
						{dirPath}/
					</span>
				)}
				<span className="text-xs font-medium flex-shrink-0 whitespace-nowrap">
					{fileName}
				</span>
			</div>
			<div className="shrink-0">{getStatusIndicator(file.status)}</div>
		</div>
	);
});

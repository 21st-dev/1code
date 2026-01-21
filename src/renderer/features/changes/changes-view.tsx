import { Checkbox } from "../../components/ui/checkbox";
import { Button } from "../../components/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "../../components/ui/context-menu";
import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "../../components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs";
import { toast } from "sonner";
import { useEffect, useState, useCallback, useRef, useMemo, memo } from "react";
import { useAtom } from "jotai";
import { trpc } from "../../lib/trpc";
import { useChangesStore } from "../../lib/stores/changes-store";
import { usePRStatus } from "../../hooks/usePRStatus";
import { useFileChangeListener } from "../../lib/hooks/use-file-change-listener";
import type { ChangeCategory, ChangedFile } from "../../../shared/changes-types";
import { cn } from "../../lib/utils";
import { ChangesFileFilter, type SubChatFilterItem } from "./components/changes-file-filter";
import { CommitInput } from "./components/commit-input";
import { HistoryView, type CommitInfo } from "./components/history-view";
import { getStatusIndicator } from "./utils/status";
import { GitPullRequest, Eye } from "lucide-react";
import type { ChangedFile as HistoryChangedFile } from "../../../shared/changes-types";
import { viewedFilesAtomFamily, type ViewedFileState } from "../agents/atoms";
import { Kbd } from "../../components/ui/kbd";

// Memoized file item component with context menu to prevent re-renders
const ChangesFileItemWithContext = memo(function ChangesFileItemWithContext({
	file,
	category,
	isSelected,
	isChecked,
	isViewed,
	onSelect,
	onDoubleClick,
	onCheckboxChange,
	onCopyPath,
	onCopyRelativePath,
	onRevealInFinder,
	onToggleViewed,
	onDiscard,
}: {
	file: ChangedFile;
	category: ChangeCategory;
	isSelected: boolean;
	isChecked: boolean;
	isViewed: boolean;
	onSelect: () => void;
	onDoubleClick: () => void;
	onCheckboxChange: () => void;
	onCopyPath: () => void;
	onCopyRelativePath: () => void;
	onRevealInFinder: () => void;
	onToggleViewed: () => void;
	onDiscard: () => void;
}) {
	const fileName = file.path.split("/").pop() || file.path;
	const dirPath = file.path.includes("/")
		? file.path.substring(0, file.path.lastIndexOf("/"))
		: "";
	const isUntracked = file.status === "untracked" || file.status === "added";

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<div
					data-file-item
					className={cn(
						"flex items-center gap-2 px-2 py-1 cursor-pointer",
						"hover:bg-muted/80 transition-colors",
						isSelected && "bg-muted"
					)}
					onClick={onSelect}
					onDoubleClick={onDoubleClick}
				>
					<Checkbox
						checked={isChecked}
						onCheckedChange={onCheckboxChange}
						onClick={(e) => e.stopPropagation()}
						className="size-4 shrink-0 border-muted-foreground/50"
					/>
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
					<div className="shrink-0 flex items-center gap-1.5">
						{isViewed && (
							<div className="size-4 rounded bg-emerald-500/20 flex items-center justify-center">
								<Eye className="size-2.5 text-emerald-500" />
							</div>
						)}
						{getStatusIndicator(file.status)}
					</div>
				</div>
			</ContextMenuTrigger>
			<ContextMenuContent className="w-52">
				<ContextMenuItem onClick={onCopyPath}>
					Copy Path
				</ContextMenuItem>
				<ContextMenuItem onClick={onCopyRelativePath}>
					Copy Relative Path
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem onClick={onRevealInFinder}>
					Reveal in Finder
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem
					onClick={onToggleViewed}
					className="justify-between"
				>
					{isViewed ? "Mark as unviewed" : "Mark as viewed"}
					<Kbd>V</Kbd>
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem
					onClick={onDiscard}
					className="data-[highlighted]:bg-red-500/15 data-[highlighted]:text-red-400"
				>
					{isUntracked ? "Delete File..." : "Discard Changes..."}
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
});

interface ChangesViewProps {
	worktreePath: string;
	selectedFilePath?: string | null;
	onFileSelect?: (
		file: ChangedFile,
		category: ChangeCategory,
		commitHash?: string,
	) => void;
	onFileOpenPinned?: (
		file: ChangedFile,
		category: ChangeCategory,
		commitHash?: string,
	) => void;
	/** Callback to create a PR (sends prompt to chat) */
	onCreatePr?: () => void;
	/** Called after a successful commit to reset diff view state */
	onCommitSuccess?: () => void;
	/** Available subchats for filtering */
	subChats?: SubChatFilterItem[];
	/** Currently selected subchat ID for filtering (passed from Review button) */
	initialSubChatFilter?: string | null;
	/** Chat ID for AI-generated commit messages */
	chatId?: string;
	/** Selected commit hash for History tab */
	selectedCommitHash?: string | null;
	/** Callback when commit is selected in History tab */
	onCommitSelect?: (commit: CommitInfo | null) => void;
	/** Callback when file is selected in commit History */
	onCommitFileSelect?: (file: HistoryChangedFile, commitHash: string) => void;
	/** Callback when active tab changes (Changes/History) */
	onActiveTabChange?: (tab: "changes" | "history") => void;
	/** Number of commits ahead of upstream (for unpushed indicator) */
	pushCount?: number;
}

export function ChangesView({
	worktreePath,
	selectedFilePath,
	onFileSelect: onFileSelectProp,
	onFileOpenPinned,
	onCreatePr,
	onCommitSuccess,
	subChats = [],
	initialSubChatFilter = null,
	chatId,
	selectedCommitHash,
	onCommitSelect,
	onCommitFileSelect,
	onActiveTabChange,
	pushCount,
}: ChangesViewProps) {
	useFileChangeListener(worktreePath);

	// Viewed files state from agents diff view (for showing eye icon and toggling)
	const [viewedFiles, setViewedFiles] = useAtom(viewedFilesAtomFamily(chatId || ""));

	const { baseBranch } = useChangesStore();
	const { data: branchData } = trpc.changes.getBranches.useQuery(
		{ worktreePath: worktreePath || "" },
		{ enabled: !!worktreePath },
	);

	const effectiveBaseBranch = baseBranch ?? branchData?.defaultBranch ?? "main";

	const {
		data: status,
		isLoading,
		refetch,
	} = trpc.changes.getStatus.useQuery(
		{ worktreePath: worktreePath || "", defaultBranch: effectiveBaseBranch },
		{
			enabled: !!worktreePath,
			refetchOnWindowFocus: true,
			// Use default staleTime (5000ms) - GitWatcher handles real-time invalidation
		},
	);

	const { pr, refetch: refetchPRStatus } = usePRStatus({
		worktreePath,
		refetchInterval: 10000,
	});

	const handleRefresh = () => {
		refetch();
		refetchPRStatus();
	};

	// Handle successful commit - reset local state and notify parent
	const handleCommitSuccess = useCallback(() => {
		// Reset selection state so new files will be auto-selected
		setHasInitializedSelection(false);
		setSelectedForCommit(new Set());
		// Notify parent to reset diff view selection
		onCommitSuccess?.();
	}, [onCommitSuccess]);

	// External actions
	const openInFinderMutation = trpc.external.openInFinder.useMutation();
	const openInEditorMutation = trpc.external.openFileInEditor.useMutation();

	// Discard changes
	const discardChangesMutation = trpc.changes.discardChanges.useMutation({
		onSuccess: () => {
			toast.success("Changes discarded");
			refetch();
		},
		onError: (error) => {
			toast.error(`Failed to discard changes: ${error.message}`);
		},
	});
	const deleteUntrackedMutation = trpc.changes.deleteUntracked.useMutation({
		onSuccess: () => {
			toast.success("File deleted");
			refetch();
		},
		onError: (error) => {
			toast.error(`Failed to delete file: ${error.message}`);
		},
	});

	// Discard confirmation dialog state
	const [discardFile, setDiscardFile] = useState<ChangedFile | null>(null);

	const {
		selectFile,
		getSelectedFile,
	} = useChangesStore();

	const selectedFileState = getSelectedFile(worktreePath || "");
	const selectedFile = selectedFilePath !== undefined
		? (selectedFilePath ? { path: selectedFilePath } as ChangedFile : null)
		: (selectedFileState?.file ?? null);

	const [fileFilter, setFileFilter] = useState("");
	const [subChatFilter, setSubChatFilter] = useState<string | null>(initialSubChatFilter);
	const [activeTab, setActiveTab] = useState<"changes" | "history">("changes");
	const fileListRef = useRef<HTMLDivElement>(null);

	// Update subchat filter when initialSubChatFilter changes (e.g., from Review button)
	useEffect(() => {
		setSubChatFilter(initialSubChatFilter);
	}, [initialSubChatFilter]);

	// Local selection state - tracks which files are selected for commit
	// Key is file path, value is whether it's selected
	const [selectedForCommit, setSelectedForCommit] = useState<Set<string>>(new Set());
	const [hasInitializedSelection, setHasInitializedSelection] = useState(false);

	// Reset filters when worktreePath changes, but preserve initialSubChatFilter
	useEffect(() => {
		setFileFilter("");
		// Don't reset subChatFilter to null - use initialSubChatFilter instead
		// This preserves the filter when component remounts (e.g., when diff sidebar opens)
		setSubChatFilter(initialSubChatFilter);
		setHasInitializedSelection(false);
		setSelectedForCommit(new Set());
	}, [worktreePath, initialSubChatFilter]);

	// Combine all files into a flat list
	const allFiles = useMemo(() => {
		if (!status) return [];

		const files: Array<{ file: ChangedFile; category: ChangeCategory }> = [];

		// Staged files
		for (const file of status.staged) {
			files.push({ file, category: "staged" });
		}

		// Unstaged files
		for (const file of status.unstaged) {
			files.push({ file, category: "unstaged" });
		}

		// Untracked files
		for (const file of status.untracked) {
			files.push({ file, category: "unstaged" });
		}

		// Sort by full path alphabetically
		files.sort((a, b) => a.file.path.localeCompare(b.file.path));

		return files;
	}, [status]);

	// Initialize selection - select all files by default when data loads
	useEffect(() => {
		if (!hasInitializedSelection && allFiles.length > 0) {
			const allPaths = new Set(allFiles.map(f => f.file.path));
			setSelectedForCommit(allPaths);
			setHasInitializedSelection(true);
		}
	}, [allFiles, hasInitializedSelection]);

	// Get file paths for selected subchat filter
	const subChatFilterPaths = useMemo(() => {
		if (!subChatFilter) return null;
		const subChat = subChats.find((sc) => sc.id === subChatFilter);
		return subChat?.filePaths || null;
	}, [subChatFilter, subChats]);

	// Apply filters (text filter + subchat filter)
	const filteredFiles = useMemo(() => {
		let result = allFiles;

		// Apply subchat filter first
		if (subChatFilterPaths) {
			result = result.filter(({ file }) =>
				subChatFilterPaths.some(
					(filterPath) =>
						file.path === filterPath ||
						file.path.endsWith(filterPath) ||
						filterPath.endsWith(file.path)
				)
			);
		}

		// Then apply text filter
		if (fileFilter.trim()) {
			result = result.filter(({ file }) =>
				file.path.toLowerCase().includes(fileFilter.toLowerCase())
			);
		}

		return result;
	}, [allFiles, fileFilter, subChatFilterPaths]);

	const filteredCount = filteredFiles.length;
	const totalCount = allFiles.length;
	const selectedCount = filteredFiles.filter(f => selectedForCommit.has(f.file.path)).length;
	const allSelected = filteredCount > 0 && selectedCount === filteredCount;
	const someSelected = selectedCount > 0 && selectedCount < filteredCount;

	const handleFileSelect = (file: ChangedFile, category: ChangeCategory) => {
		if (!worktreePath) return;
		selectFile(worktreePath, file, category, null);
		onFileSelectProp?.(file, category);
	};

	const handleFileDoubleClick = (file: ChangedFile, category: ChangeCategory) => {
		if (!worktreePath) return;
		selectFile(worktreePath, file, category, null);
		onFileOpenPinned?.(file, category);
	};

	// Toggle individual file selection
	const handleCheckboxChange = useCallback((filePath: string) => {
		setSelectedForCommit(prev => {
			const next = new Set(prev);
			if (next.has(filePath)) {
				next.delete(filePath);
			} else {
				next.add(filePath);
			}
			return next;
		});
	}, []);

	// Toggle all files selection
	const handleSelectAllChange = useCallback(() => {
		if (allSelected) {
			// Deselect all filtered files
			setSelectedForCommit(prev => {
				const next = new Set(prev);
				for (const { file } of filteredFiles) {
					next.delete(file.path);
				}
				return next;
			});
		} else {
			// Select all filtered files
			setSelectedForCommit(prev => {
				const next = new Set(prev);
				for (const { file } of filteredFiles) {
					next.add(file.path);
				}
				return next;
			});
		}
	}, [allSelected, filteredFiles]);

	// Keyboard navigation handler for arrow up/down
	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;

		e.preventDefault();

		if (filteredFiles.length === 0) return;

		const currentIndex = filteredFiles.findIndex(({ file }) => file.path === selectedFile?.path);
		let newIndex: number;

		if (currentIndex === -1) {
			newIndex = 0;
		} else if (e.key === "ArrowDown") {
			newIndex = Math.min(currentIndex + 1, filteredFiles.length - 1);
		} else {
			newIndex = Math.max(currentIndex - 1, 0);
		}

		const newFile = filteredFiles[newIndex];
		if (newFile) {
			handleFileSelect(newFile.file, newFile.category);

			const container = fileListRef.current;
			if (container) {
				const items = container.querySelectorAll('[data-file-item]');
				const targetItem = items[newIndex] as HTMLElement | undefined;
				targetItem?.scrollIntoView({ block: 'nearest' });
			}
		}
	};

	// Get selected file paths for commit - only from filtered files (visible in current view)
	// This ensures that when filtering by subchat, only the visible selected files are committed
	const selectedFilePaths = useMemo(() => {
		return filteredFiles
			.filter(f => selectedForCommit.has(f.file.path))
			.map(f => f.file.path);
	}, [filteredFiles, selectedForCommit]);

	// Check if a file is marked as viewed in the diff view
	// Key format matches agent-diff-view.tsx: `${oldPath}->${newPath}`
	// Must be defined before early returns to maintain hooks order
	const isFileMarkedAsViewed = useCallback((filePath: string): boolean => {
		// For new files: /dev/null->{path}
		// For modified files: {path}->{path}
		// For deleted files: {path}->/dev/null
		// We check all possible key formats
		const possibleKeys = [
			`${filePath}->${filePath}`,  // Modified
			`/dev/null->${filePath}`,     // New file
			`${filePath}->/dev/null`,     // Deleted file
		];

		for (const key of possibleKeys) {
			const viewedState = viewedFiles[key];
			if (viewedState?.viewed) {
				return true;
			}
		}
		return false;
	}, [viewedFiles]);

	// Toggle viewed state for a file in the list
	const toggleFileViewed = useCallback((filePath: string) => {
		// Try to find existing key
		const possibleKeys = [
			`${filePath}->${filePath}`,  // Modified
			`/dev/null->${filePath}`,     // New file
			`${filePath}->/dev/null`,     // Deleted file
		];

		let existingKey: string | null = null;
		for (const key of possibleKeys) {
			if (viewedFiles[key]) {
				existingKey = key;
				break;
			}
		}

		// Use existing key or default to modified format
		const fileKey = existingKey || `${filePath}->${filePath}`;
		const currentState = viewedFiles[fileKey];
		const isCurrentlyViewed = currentState?.viewed || false;

		setViewedFiles({
			...viewedFiles,
			[fileKey]: {
				viewed: !isCurrentlyViewed,
				contentHash: currentState?.contentHash || "",
			},
		});
	}, [viewedFiles, setViewedFiles]);

	if (!worktreePath) {
		return (
			<div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-4">
				No worktree path available
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-4">
				Loading changes...
			</div>
		);
	}

	if (!status) {
		return (
			<div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-4">
				Unable to load changes
			</div>
		);
	}

	// Handle discard confirmation
	const handleConfirmDiscard = () => {
		if (!discardFile || !worktreePath) return;

		const isUntracked = discardFile.status === "untracked" || discardFile.status === "added";
		if (isUntracked) {
			deleteUntrackedMutation.mutate({ worktreePath, filePath: discardFile.path });
		} else {
			discardChangesMutation.mutate({ worktreePath, filePath: discardFile.path });
		}
		setDiscardFile(null);
	};

	// Context menu handlers
	const handleCopyPath = (filePath: string) => {
		const absolutePath = `${worktreePath}/${filePath}`;
		navigator.clipboard.writeText(absolutePath);
	};

	const handleCopyRelativePath = (filePath: string) => {
		navigator.clipboard.writeText(filePath);
	};

	const handleRevealInFinder = (filePath: string) => {
		const absolutePath = `${worktreePath}/${filePath}`;
		openInFinderMutation.mutate(absolutePath);
	};

	const handleOpenInEditor = (filePath: string) => {
		const absolutePath = `${worktreePath}/${filePath}`;
		openInEditorMutation.mutate({ path: absolutePath, cwd: worktreePath });
	};

	return (
		<>
			<div className="flex flex-col h-full">
				<Tabs
					value={activeTab}
					onValueChange={(v) => {
						const newTab = v as "changes" | "history";
						setActiveTab(newTab);
						// Notify parent about tab change
						onActiveTabChange?.(newTab);
						// Reset selected commit when switching to Changes tab
						if (v === "changes" && onCommitSelect) {
							onCommitSelect(null);
						}
					}}
					className="flex flex-col h-full"
				>
					{/* Tab triggers */}
					<TabsList className="h-8 px-2 bg-transparent border-b border-border/50 rounded-none justify-start gap-1 shrink-0">
						<TabsTrigger
							value="changes"
							className="h-6 px-2.5 text-xs rounded-md data-[state=active]:bg-muted data-[state=active]:shadow-none"
						>
							Changes
						</TabsTrigger>
						<TabsTrigger
							value="history"
							className="h-6 px-2.5 text-xs rounded-md data-[state=active]:bg-muted data-[state=active]:shadow-none"
						>
							History
						</TabsTrigger>
					</TabsList>

					{/* Changes tab content */}
					<TabsContent value="changes" className="flex-1 flex flex-col m-0 overflow-hidden data-[state=inactive]:hidden">
						{/* Filter */}
						<ChangesFileFilter
							value={fileFilter}
							onChange={setFileFilter}
							subChats={subChats}
							selectedSubChatId={subChatFilter}
							onSubChatFilterChange={setSubChatFilter}
						/>

						{/* Select all header */}
						<div className="flex items-center gap-2 px-2 py-1.5 border-b border-border/50">
							<Checkbox
								checked={someSelected ? "indeterminate" : allSelected}
								onCheckedChange={handleSelectAllChange}
								className="size-4 border-muted-foreground/50"
							/>
							<span className="text-xs text-muted-foreground">
								{selectedCount} of {totalCount} file{totalCount !== 1 ? "s" : ""} selected
							</span>
						</div>

						{/* File list */}
						{totalCount === 0 ? (
							<div className="flex-1 flex items-center justify-center text-muted-foreground text-sm px-4 text-center">
								No changes detected
							</div>
						) : filteredCount === 0 ? (
							<div className="flex-1 flex items-center justify-center text-muted-foreground text-sm px-4 text-center">
								No files match filter
							</div>
						) : (
							<div
								ref={fileListRef}
								className="flex-1 overflow-y-auto outline-none"
								tabIndex={0}
								onKeyDown={handleKeyDown}
							>
								{filteredFiles.map(({ file, category }) => (
									<ChangesFileItemWithContext
										key={file.path}
										file={file}
										category={category}
										isSelected={selectedFile?.path === file.path}
										isChecked={selectedForCommit.has(file.path)}
										isViewed={isFileMarkedAsViewed(file.path)}
										onSelect={() => {
											handleFileSelect(file, category);
											fileListRef.current?.focus();
										}}
										onDoubleClick={() => handleFileDoubleClick(file, category)}
										onCheckboxChange={() => handleCheckboxChange(file.path)}
										onCopyPath={() => handleCopyPath(file.path)}
										onCopyRelativePath={() => handleCopyRelativePath(file.path)}
										onRevealInFinder={() => handleRevealInFinder(file.path)}
										onToggleViewed={() => toggleFileViewed(file.path)}
										onDiscard={() => setDiscardFile(file)}
									/>
								))}
							</div>
						)}

						{/* Commit input */}
						<CommitInput
							worktreePath={worktreePath}
							hasStagedChanges={selectedCount > 0}
							onRefresh={handleRefresh}
							onCommitSuccess={handleCommitSuccess}
							stagedCount={selectedCount}
							currentBranch={status.branch}
							selectedFilePaths={selectedFilePaths}
							chatId={chatId}
						/>
					</TabsContent>

					{/* History tab content */}
					<TabsContent value="history" className="flex-1 flex flex-col m-0 overflow-hidden data-[state=inactive]:hidden">
						<HistoryView
							worktreePath={worktreePath}
							selectedCommitHash={selectedCommitHash}
							selectedFilePath={selectedFilePath}
							onCommitSelect={onCommitSelect}
							onFileSelect={onCommitFileSelect}
							pushCount={pushCount}
						/>
					</TabsContent>
				</Tabs>
			</div>

			{/* Discard confirmation dialog */}
			<AlertDialog open={!!discardFile} onOpenChange={(open) => !open && setDiscardFile(null)}>
				<AlertDialogContent className="w-[340px]">
					<AlertDialogHeader>
						<AlertDialogTitle>
							{discardFile?.status === "untracked" || discardFile?.status === "added"
								? `Delete "${discardFile?.path.split("/").pop()}"?`
								: `Discard changes to "${discardFile?.path.split("/").pop()}"?`}
						</AlertDialogTitle>
					</AlertDialogHeader>
					<AlertDialogDescription className="px-5 pb-5">
						{discardFile?.status === "untracked" || discardFile?.status === "added"
							? "This will permanently delete this file. This action cannot be undone."
							: "This will revert all changes to this file. This action cannot be undone."}
					</AlertDialogDescription>
					<AlertDialogFooter>
						<Button
							variant="outline"
							size="sm"
							onClick={() => setDiscardFile(null)}
						>
							Cancel
						</Button>
						<Button
							variant="destructive"
							size="sm"
							onClick={handleConfirmDiscard}
						>
							{discardFile?.status === "untracked" || discardFile?.status === "added"
								? "Delete"
								: "Discard"}
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

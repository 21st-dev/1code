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
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { trpc } from "../../lib/trpc";
import { preferredEditorAtom } from "../../lib/atoms";
import { useI18n } from "../../lib/i18n";
import { APP_META } from "../../../shared/external-apps";
import { fileViewerOpenAtomFamily, diffViewDisplayModeAtom, diffSidebarOpenAtomFamily, diffActiveTabAtom } from "../agents/atoms";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip";

// Memoized file item component with context menu to prevent re-renders
const ChangesFileItemWithContext = memo(function ChangesFileItemWithContext({
	file,
	category,
	isSelected,
	isChecked,
	isViewed,
	isHighlighted,
	highlightedCount,
	highlightedPaths,
	index,
	onSelect,
	onDoubleClick,
	onCheckboxChange,
	onShiftClick,
	onCopyPath,
	onCopyRelativePath,
	onRevealInFinder,
	onOpenInFilePreview,
	onOpenInEditor,
	editorLabel,
	onToggleViewed,
	onDiscard,
	onDiscardSelected,
	onIncludeSelected,
	onExcludeSelected,
	onCopySelectedPaths,
	onCopySelectedRelativePaths,
}: {
	file: ChangedFile;
	category: ChangeCategory;
	isSelected: boolean;
	isChecked: boolean;
	isViewed: boolean;
	isHighlighted: boolean;
	highlightedCount: number;
	highlightedPaths: string[];
	index: number;
	onSelect: () => void;
	onDoubleClick: () => void;
	onCheckboxChange: () => void;
	onShiftClick: (index: number) => void;
	onCopyPath: () => void;
	onCopyRelativePath: () => void;
	onRevealInFinder: () => void;
	onOpenInFilePreview: () => void;
	onOpenInEditor: () => void;
	editorLabel: string;
	onToggleViewed: () => void;
	onDiscard: () => void;
	onDiscardSelected: () => void;
	onIncludeSelected: () => void;
	onExcludeSelected: () => void;
	onCopySelectedPaths: () => void;
	onCopySelectedRelativePaths: () => void;
}) {
	const { t } = useI18n();
	const fileName = file.path.split("/").pop() || file.path;
	const dirPath = file.path.includes("/")
		? file.path.substring(0, file.path.lastIndexOf("/"))
		: "";
	const isUntracked = file.status === "untracked" || file.status === "added";
	// Show multi-discard when multiple files are highlighted (shift+click selected)
	const showMultiDiscard = highlightedCount > 1 && isHighlighted;

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<div
					data-file-item
					className={cn(
						"flex items-center gap-2 px-2 py-1 cursor-pointer",
						"hover:bg-muted/80 transition-colors",
						isSelected && !isHighlighted && "bg-muted",
						isHighlighted && "bg-primary/10 hover:bg-primary/15"
					)}
					onClick={(e) => {
						if (e.shiftKey) {
							e.preventDefault();
							onShiftClick(index);
						} else {
							onSelect();
						}
					}}
					onDoubleClick={onDoubleClick}
				>
					<Checkbox
						checked={isChecked}
						onCheckedChange={onCheckboxChange}
						onClick={(e) => e.stopPropagation()}
						className="size-4 shrink-0 border-muted-foreground/50"
					/>
					<Tooltip delayDuration={500}>
						<TooltipTrigger asChild>
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
						</TooltipTrigger>
						<TooltipContent
							side="right"
							sideOffset={40}
							className="text-xs text-muted-foreground break-all max-w-[420px] bg-background"
						>
							{file.path}
						</TooltipContent>
					</Tooltip>
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
			<ContextMenuContent className="w-64">
				{showMultiDiscard ? (
					<>
						{/* Multi-select context menu */}
						<ContextMenuItem
							onClick={onDiscardSelected}
							className="data-[highlighted]:bg-red-500/15 data-[highlighted]:text-red-400"
						>
							{t("changes.discardSelected", { count: highlightedCount })}
						</ContextMenuItem>
						<ContextMenuSeparator />
						<ContextMenuItem onClick={onIncludeSelected}>
							{t("changes.includeSelected")}
						</ContextMenuItem>
						<ContextMenuItem onClick={onExcludeSelected}>
							{t("changes.excludeSelected")}
						</ContextMenuItem>
						<ContextMenuSeparator />
						<ContextMenuItem onClick={onCopySelectedPaths}>
							{t("changes.copyPaths")}
						</ContextMenuItem>
						<ContextMenuItem onClick={onCopySelectedRelativePaths}>
							{t("changes.copyRelativePaths")}
						</ContextMenuItem>
					</>
				) : (
					<>
						{/* Single file context menu */}
						<ContextMenuItem onClick={onCopyPath}>
							{t("changes.copyPath")}
						</ContextMenuItem>
						<ContextMenuItem onClick={onCopyRelativePath}>
							{t("changes.copyRelativePath")}
						</ContextMenuItem>
						<ContextMenuSeparator />
						<ContextMenuItem onClick={onRevealInFinder}>
							{t("changes.revealInFinder")}
						</ContextMenuItem>
						<ContextMenuSeparator />
						<ContextMenuItem onClick={onOpenInFilePreview}>
							{t("changes.openInFilePreview")}
						</ContextMenuItem>
						<ContextMenuItem onClick={onOpenInEditor}>
							{t("changes.openInEditor", { editor: editorLabel })}
						</ContextMenuItem>
						<ContextMenuSeparator />
						<ContextMenuItem
							onClick={onToggleViewed}
							className="justify-between"
						>
							{isViewed ? t("changes.markUnviewed") : t("changes.markViewed")}
							<Kbd>V</Kbd>
						</ContextMenuItem>
						<ContextMenuSeparator />
						<ContextMenuItem
							onClick={onDiscard}
							className="data-[highlighted]:bg-red-500/15 data-[highlighted]:text-red-400"
						>
							{isUntracked ? t("changes.deleteFile") : t("changes.discardChanges")}
						</ContextMenuItem>
					</>
				)}
			</ContextMenuContent>
		</ContextMenu>
	);
});

interface ChangesViewProps {
	worktreePath: string;
	/** Controlled active tab (optional) */
	activeTab?: "changes" | "history";
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
	/** Called after discarding/deleting changes to refresh diff */
	onDiscardSuccess?: () => void;
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
	activeTab: controlledActiveTab,
	selectedFilePath,
	onFileSelect: onFileSelectProp,
	onFileOpenPinned,
	onCreatePr,
	onCommitSuccess,
	onDiscardSuccess,
	subChats = [],
	initialSubChatFilter = null,
	chatId,
	selectedCommitHash,
	onCommitSelect,
	onCommitFileSelect,
	onActiveTabChange,
	pushCount,
}: ChangesViewProps) {
	const { t } = useI18n();
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
		// Clear commit selection without re-initializing auto-select
		// (prevents remaining files from being re-selected after commit)
		setSelectedForCommit(new Set());
		// Notify parent to reset diff view selection
		onCommitSuccess?.();
	}, [onCommitSuccess]);

	// External actions
	const openInFinderMutation = trpc.external.openInFinder.useMutation();
	const openInEditorMutation = trpc.external.openFileInEditor.useMutation();
	const openInAppMutation = trpc.external.openInApp.useMutation();

	// Preferred editor
	const preferredEditor = useAtomValue(preferredEditorAtom);
	const editorMeta = APP_META[preferredEditor];

	// File viewer (file preview sidebar)
	const fileViewerAtom = useMemo(
		() => fileViewerOpenAtomFamily(chatId || ""),
		[chatId],
	);
	const setFileViewerPath = useSetAtom(fileViewerAtom);

	// Diff sidebar state (to close dialog/fullscreen when opening file preview)
	const diffDisplayMode = useAtomValue(diffViewDisplayModeAtom);
	const diffSidebarAtom = useMemo(
		() => diffSidebarOpenAtomFamily(chatId || ""),
		[chatId],
	);
	const setDiffSidebarOpen = useSetAtom(diffSidebarAtom);

	// Discard changes - single file
	const discardChangesMutation = trpc.changes.discardChanges.useMutation({
		onSuccess: () => {
			toast.success(t("changes.toast.discarded"));
			refetch();
			onDiscardSuccess?.();
		},
		onError: (error) => {
			toast.error(t("changes.toast.failedDiscard", { message: error.message }));
		},
	});
	const deleteUntrackedMutation = trpc.changes.deleteUntracked.useMutation({
		onSuccess: () => {
			toast.success(t("changes.toast.fileDeleted"));
			refetch();
			onDiscardSuccess?.();
		},
		onError: (error) => {
			toast.error(t("changes.toast.failedDeleteFile", { message: error.message }));
		},
	});

	// Discard changes - multiple files (batch)
	const discardMultipleChangesMutation = trpc.changes.discardMultipleChanges.useMutation({
		onSuccess: () => {
			toast.success(t("changes.toast.discarded"));
			refetch();
			onDiscardSuccess?.();
		},
		onError: (error) => {
			toast.error(t("changes.toast.failedDiscard", { message: error.message }));
		},
	});
	const deleteMultipleUntrackedMutation = trpc.changes.deleteMultipleUntracked.useMutation({
		onSuccess: () => {
			toast.success(t("changes.toast.filesDeleted"));
			refetch();
			onDiscardSuccess?.();
		},
		onError: (error) => {
			toast.error(t("changes.toast.failedDeleteFiles", { message: error.message }));
		},
	});

	// Discard confirmation dialog state - single file
	const [discardFile, setDiscardFile] = useState<ChangedFile | null>(null);
	// Discard confirmation dialog state - multiple files
	const [discardFiles, setDiscardFiles] = useState<ChangedFile[] | null>(null);

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
	const [internalActiveTab, setInternalActiveTab] = useState<"changes" | "history">("changes");
	const activeTab = controlledActiveTab ?? internalActiveTab;
	const fileListRef = useRef<HTMLDivElement>(null);
	const prevAllPathsRef = useRef<Set<string>>(new Set());

	const handleActiveTabChange = useCallback((newTab: "changes" | "history") => {
		// Update internal state only in uncontrolled mode
		if (controlledActiveTab === undefined) {
			setInternalActiveTab(newTab);
		}
		// Always notify parent and reset selected commit when leaving History
		onActiveTabChange?.(newTab);
		if (newTab === "changes" && onCommitSelect) {
			onCommitSelect(null);
		}
	}, [controlledActiveTab, onActiveTabChange, onCommitSelect]);

	// Update subchat filter when initialSubChatFilter changes (e.g., from Review button)
	useEffect(() => {
		setSubChatFilter(initialSubChatFilter);
	}, [initialSubChatFilter]);

	// Local selection state - tracks which files are selected for commit (checkboxes)
	const [selectedForCommit, setSelectedForCommit] = useState<Set<string>>(new Set());
	const [hasInitializedSelection, setHasInitializedSelection] = useState(false);

	// Highlighted files state - for multi-select operations like discard (Shift+Click)
	// This is separate from selectedForCommit (checkboxes)
	// Anchor for Shift+Click is the currently selected file (selectedFile) - the one showing in diff view
	const [highlightedFiles, setHighlightedFiles] = useState<Set<string>>(new Set());

	// Reset filters when worktreePath changes, but preserve initialSubChatFilter
	useEffect(() => {
		setFileFilter("");
		// Don't reset subChatFilter to null - use initialSubChatFilter instead
		// This preserves the filter when component remounts (e.g., when diff sidebar opens)
		setSubChatFilter(initialSubChatFilter);
		setHasInitializedSelection(false);
		setSelectedForCommit(new Set());
		setHighlightedFiles(new Set());
		prevAllPathsRef.current = new Set();
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

	// Initialize selection, then auto-select newly added paths on subsequent updates
	useEffect(() => {
		const allPaths = new Set(allFiles.map(f => f.file.path));

		if (!hasInitializedSelection && allFiles.length > 0) {
			setSelectedForCommit(allPaths);
			setHasInitializedSelection(true);
			prevAllPathsRef.current = allPaths;
			return;
		}

		const prevPaths = prevAllPathsRef.current;
		const newPaths: string[] = [];
		for (const path of allPaths) {
			if (!prevPaths.has(path)) {
				newPaths.push(path);
			}
		}

		if (newPaths.length > 0) {
			setSelectedForCommit(prev => {
				const next = new Set(prev);
				for (const path of newPaths) {
					next.add(path);
				}
				return next;
			});
		}

		prevAllPathsRef.current = allPaths;
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
	// Counts for commit selection (checkboxes)
	const selectedCount = filteredFiles.filter(f => selectedForCommit.has(f.file.path)).length;
	const allSelected = filteredCount > 0 && selectedCount === filteredCount;
	const someSelected = selectedCount > 0 && selectedCount < filteredCount;
	// Count for highlighted files (shift+click selection for discard)
	const highlightedCount = highlightedFiles.size;

	// Handle file click - selects file for diff view and clears highlighting
	const handleFileSelect = useCallback((file: ChangedFile, category: ChangeCategory) => {
		if (!worktreePath) return;
		selectFile(worktreePath, file, category, null);
		onFileSelectProp?.(file, category);
		// Clear multi-select highlighting on regular click
		setHighlightedFiles(new Set());
	}, [worktreePath, selectFile, onFileSelectProp]);

	const handleFileDoubleClick = (file: ChangedFile, category: ChangeCategory) => {
		if (!worktreePath) return;
		selectFile(worktreePath, file, category, null);
		onFileOpenPinned?.(file, category);
	};

	// Toggle individual file for commit (checkbox) - doesn't affect highlighting
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

	// Shift+Click range selection handler for highlighting (multi-select for discard)
	// Uses the currently selected file (the one showing in diff view) as anchor
	const handleShiftClick = useCallback((clickedIndex: number) => {
		// Find anchor index from currently selected file (the one showing diff)
		const anchorIndex = selectedFile
			? filteredFiles.findIndex(f => f.file.path === selectedFile.path)
			: -1;

		if (anchorIndex === -1) {
			// No anchor - just highlight this one file
			const file = filteredFiles[clickedIndex];
			if (file) {
				setHighlightedFiles(new Set([file.file.path]));
			}
			return;
		}

		// Highlight range from anchor to clicked (inclusive)
		const startIndex = Math.min(anchorIndex, clickedIndex);
		const endIndex = Math.max(anchorIndex, clickedIndex);

		const newHighlighted = new Set<string>();
		for (let i = startIndex; i <= endIndex; i++) {
			const file = filteredFiles[i];
			if (file) {
				newHighlighted.add(file.file.path);
			}
		}
		setHighlightedFiles(newHighlighted);
	}, [filteredFiles, selectedFile]);

	// Get highlighted file paths as array (for context menu actions)
	const highlightedPaths = useMemo(() => {
		return filteredFiles
			.filter(f => highlightedFiles.has(f.file.path))
			.map(f => f.file.path);
	}, [filteredFiles, highlightedFiles]);

	// Include highlighted files in commit (check their checkboxes)
	const handleIncludeSelected = useCallback(() => {
		setSelectedForCommit(prev => {
			const next = new Set(prev);
			for (const path of highlightedFiles) {
				next.add(path);
			}
			return next;
		});
	}, [highlightedFiles]);

	// Exclude highlighted files from commit (uncheck their checkboxes)
	const handleExcludeSelected = useCallback(() => {
		setSelectedForCommit(prev => {
			const next = new Set(prev);
			for (const path of highlightedFiles) {
				next.delete(path);
			}
			return next;
		});
	}, [highlightedFiles]);

	// Copy paths of highlighted files
	const handleCopySelectedPaths = useCallback((worktreePath: string) => {
		const paths = highlightedPaths.map(p => `${worktreePath}/${p}`);
		navigator.clipboard.writeText(paths.join("\n"));
		toast.success(t("changes.toast.copiedPaths", { count: paths.length }));
	}, [highlightedPaths, t]);

	// Copy relative paths of highlighted files
	const handleCopySelectedRelativePaths = useCallback(() => {
		navigator.clipboard.writeText(highlightedPaths.join("\n"));
		toast.success(t("changes.toast.copiedPaths", { count: highlightedPaths.length }));
	}, [highlightedPaths, t]);

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

	// Handler for discarding highlighted files (multi-file discard via Shift+Click)
	const handleDiscardSelected = useCallback(() => {
		const filesToDiscard = filteredFiles
			.filter(f => highlightedFiles.has(f.file.path))
			.map(f => f.file);
		if (filesToDiscard.length > 0) {
			setDiscardFiles(filesToDiscard);
		}
	}, [filteredFiles, highlightedFiles]);

	if (!worktreePath) {
	return (
			<div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-4">
				{t("changes.noWorktreePath")}
			</div>
		);
	}

	if (isLoading) {
	return (
			<div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-4">
				{t("changes.loading")}
			</div>
		);
	}

	if (!status) {
		return (
			<div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-4">
				{t("changes.unableToLoad")}
			</div>
		);
	}

	// Handle single file discard confirmation
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

	// Handle multi-file discard confirmation
	const handleConfirmMultiDiscard = () => {
		if (!discardFiles || discardFiles.length === 0 || !worktreePath) return;

		// Split files by type - untracked/added need deletion, others need checkout
		const untrackedFiles = discardFiles.filter(f => f.status === "untracked" || f.status === "added");
		const trackedFiles = discardFiles.filter(f => f.status !== "untracked" && f.status !== "added");

		// Discard tracked files (git checkout)
		if (trackedFiles.length > 0) {
			discardMultipleChangesMutation.mutate({
				worktreePath,
				filePaths: trackedFiles.map(f => f.path),
			});
		}

		// Delete untracked files
		if (untrackedFiles.length > 0) {
			deleteMultipleUntrackedMutation.mutate({
				worktreePath,
				filePaths: untrackedFiles.map(f => f.path),
			});
		}

		// Clear commit selection and highlighting for discarded files
		setSelectedForCommit(prev => {
			const next = new Set(prev);
			for (const file of discardFiles) {
				next.delete(file.path);
			}
			return next;
		});
		setHighlightedFiles(new Set());

		setDiscardFiles(null);
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

	const handleOpenInPreferredEditor = (filePath: string) => {
		const absolutePath = `${worktreePath}/${filePath}`;
		openInAppMutation.mutate({ path: absolutePath, app: preferredEditor });
	};

	const handleOpenInFilePreview = (filePath: string) => {
		const absolutePath = `${worktreePath}/${filePath}`;
		setFileViewerPath(absolutePath);
		if (diffDisplayMode === "full-page") {
			setDiffSidebarOpen(false);
		}
	};

	return (
			<>
				<div className="flex flex-col h-full">
					<Tabs
						value={activeTab}
						onValueChange={(v) => {
							const newTab = v as "changes" | "history";
							handleActiveTabChange(newTab);
						}}
						className="flex flex-col h-full"
					>
					{/* Tab triggers */}
					<TabsList className="h-8 px-2 bg-transparent border-b border-border/50 rounded-none justify-start gap-1 shrink-0">
						<TabsTrigger
							value="changes"
							className="h-6 px-2.5 text-xs rounded-md data-[state=active]:bg-muted data-[state=active]:shadow-none"
						>
							{t("changes.title")}
						</TabsTrigger>
						<TabsTrigger
							value="history"
							className="h-6 px-2.5 text-xs rounded-md data-[state=active]:bg-muted data-[state=active]:shadow-none"
						>
							{t("changes.history")}
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
								{t("changes.filesSelected", {
									selected: selectedCount,
									total: totalCount,
									plural: totalCount !== 1 ? "s" : "",
								})}
							</span>
						</div>

						{/* File list */}
						{totalCount === 0 ? (
							<div className="flex-1 flex items-center justify-center text-muted-foreground text-sm px-4 text-center">
								{t("changes.noDetected")}
							</div>
						) : filteredCount === 0 ? (
							<div className="flex-1 flex items-center justify-center text-muted-foreground text-sm px-4 text-center">
								{t("changes.noFilesMatch")}
							</div>
						) : (
							<div
								ref={fileListRef}
								className="flex-1 overflow-y-auto outline-none"
								tabIndex={0}
								onKeyDown={handleKeyDown}
							>
								{filteredFiles.map(({ file, category }, index) => (
									<ChangesFileItemWithContext
										key={file.path}
										file={file}
										category={category}
										isSelected={selectedFile?.path === file.path}
										isChecked={selectedForCommit.has(file.path)}
										isViewed={isFileMarkedAsViewed(file.path)}
										isHighlighted={highlightedFiles.has(file.path)}
										highlightedCount={highlightedCount}
										highlightedPaths={highlightedPaths}
										index={index}
										onSelect={() => {
											handleFileSelect(file, category);
											fileListRef.current?.focus();
										}}
										onDoubleClick={() => handleFileDoubleClick(file, category)}
										onCheckboxChange={() => handleCheckboxChange(file.path)}
										onShiftClick={handleShiftClick}
										onCopyPath={() => handleCopyPath(file.path)}
										onCopyRelativePath={() => handleCopyRelativePath(file.path)}
										onRevealInFinder={() => handleRevealInFinder(file.path)}
										onOpenInFilePreview={() => handleOpenInFilePreview(file.path)}
										onOpenInEditor={() => handleOpenInPreferredEditor(file.path)}
										editorLabel={editorMeta.label}
										onToggleViewed={() => toggleFileViewed(file.path)}
										onDiscard={() => setDiscardFile(file)}
										onDiscardSelected={handleDiscardSelected}
										onIncludeSelected={handleIncludeSelected}
										onExcludeSelected={handleExcludeSelected}
										onCopySelectedPaths={() => handleCopySelectedPaths(worktreePath)}
										onCopySelectedRelativePaths={handleCopySelectedRelativePaths}
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

			{/* Discard confirmation dialog - single file */}
			<AlertDialog open={!!discardFile} onOpenChange={(open) => !open && setDiscardFile(null)}>
				<AlertDialogContent className="w-[340px]">
					<AlertDialogHeader>
						<AlertDialogTitle>
							{discardFile?.status === "untracked" || discardFile?.status === "added"
								? t("changes.deleteTitle", {
									name: discardFile?.path.split("/").pop() ?? "",
								})
								: t("changes.discardTitle", {
									name: discardFile?.path.split("/").pop() ?? "",
								})}
						</AlertDialogTitle>
					</AlertDialogHeader>
					<AlertDialogDescription className="px-5 pb-5">
						{discardFile?.status === "untracked" || discardFile?.status === "added"
							? t("changes.deleteDescription")
							: t("changes.discardDescription")}
					</AlertDialogDescription>
					<AlertDialogFooter>
						<Button
							variant="outline"
							size="sm"
							onClick={() => setDiscardFile(null)}
						>
							{t("common.cancel")}
						</Button>
						<Button
							variant="destructive"
							size="sm"
							onClick={handleConfirmDiscard}
						>
							{discardFile?.status === "untracked" || discardFile?.status === "added"
								? t("changes.delete")
								: t("changes.discard")}
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* Discard confirmation dialog - multiple files */}
			<AlertDialog open={!!discardFiles} onOpenChange={(open) => !open && setDiscardFiles(null)}>
				<AlertDialogContent className="w-[400px]">
					<AlertDialogHeader>
						<AlertDialogTitle>
							{t("changes.discardSelectedTitle", {
								count: discardFiles?.length ?? 0,
							})}
						</AlertDialogTitle>
					</AlertDialogHeader>
					<AlertDialogDescription asChild>
						<div className="px-5 pb-5">
							<p className="mb-2">{t("changes.discardSelectedDescription")}</p>
							<ul className="max-h-40 overflow-y-auto text-xs font-mono bg-muted/50 rounded-md p-2 space-y-0.5">
								{discardFiles?.map(f => (
									<li key={f.path} className="truncate text-muted-foreground">
										{f.path}
									</li>
								))}
							</ul>
						</div>
					</AlertDialogDescription>
					<AlertDialogFooter>
						<Button
							variant="outline"
							size="sm"
							onClick={() => setDiscardFiles(null)}
						>
							{t("common.cancel")}
						</Button>
						<Button
							variant="destructive"
							size="sm"
							onClick={handleConfirmMultiDiscard}
						>
							{t("changes.discard")}
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

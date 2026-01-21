import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "../../../../components/ui/alert-dialog";
import { Button } from "../../../../components/ui/button";
import { Checkbox } from "../../../../components/ui/checkbox";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "../../../../components/ui/context-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../../../components/ui/tooltip";
import { cn } from "../../../../lib/utils";
import { useState } from "react";
import { HiMiniMinus, HiMiniPlus } from "react-icons/hi2";
import { trpc } from "../../../../lib/trpc";
import {
	ClipboardIcon,
	ExternalLinkIcon,
	FolderIcon,
	PlusIcon,
	TrashIcon,
	UndoIcon,
} from "../../../../components/ui/icons";
import { Minus, Plus } from "lucide-react";
import type { ChangedFile } from "../../../../../shared/changes-types";
import { getStatusColor, getStatusIndicator } from "../../utils";

interface FileItemProps {
	file: ChangedFile;
	isSelected: boolean;
	/** Single click - opens in preview mode */
	onClick: () => void;
	/** Double click - opens pinned (permanent) */
	onDoubleClick?: () => void;
	showStats?: boolean;
	/** Number of level indentations (for tree view) */
	level?: number;
	/** Callback for staging the file (shown on hover for unstaged files) */
	onStage?: () => void;
	/** Callback for unstaging the file (shown on hover for staged files) */
	onUnstage?: () => void;
	/** Whether the action is currently pending */
	isActioning?: boolean;
	/** Worktree path for constructing absolute paths */
	worktreePath?: string;
	/** Callback for discarding changes */
	onDiscard?: () => void;
	/** Whether to show checkbox for staging (GitHub Desktop style) */
	showCheckbox?: boolean;
	/** Whether the file is staged (for checkbox state) */
	isStaged?: boolean;
}

function LevelIndicators({ level }: { level: number }) {
	if (level === 0) return null;

	return (
		<div className="flex self-stretch shrink-0">
			{Array.from({ length: level }).map((_, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: static visual dividers that never reorder
				<div key={i} className="w-3 self-stretch border-r border-border" />
			))}
		</div>
	);
}

function getFileName(path: string): string {
	return path.split("/").pop() || path;
}

export function FileItem({
	file,
	isSelected,
	onClick,
	onDoubleClick,
	showStats = true,
	level = 0,
	onStage,
	onUnstage,
	isActioning = false,
	worktreePath,
	onDiscard,
	showCheckbox = false,
	isStaged = false,
}: FileItemProps) {
	const [showDiscardDialog, setShowDiscardDialog] = useState(false);

	const fileName = getFileName(file.path);
	const statusBadgeColor = getStatusColor(file.status);
	const statusIndicator = getStatusIndicator(file.status);
	const showStatsDisplay =
		showStats && (file.additions > 0 || file.deletions > 0);
	const hasIndent = level > 0;
	const hasAction = onStage || onUnstage;

	const handleCheckboxChange = (checked: boolean) => {
		if (checked && onStage) {
			onStage();
		} else if (!checked && onUnstage) {
			onUnstage();
		}
	};

	const openInFinderMutation = trpc.external.openInFinder.useMutation();
	const openInEditorMutation = trpc.external.openFileInEditor.useMutation();

	const absolutePath = worktreePath ? `${worktreePath}/${file.path}` : null;

	const handleCopyPath = async () => {
		if (absolutePath) {
			await navigator.clipboard.writeText(absolutePath);
		}
	};

	const handleCopyRelativePath = async () => {
		await navigator.clipboard.writeText(file.path);
	};

	const handleRevealInFinder = () => {
		if (absolutePath) {
			openInFinderMutation.mutate(absolutePath);
		}
	};

	const handleOpenInEditor = () => {
		if (absolutePath && worktreePath) {
			openInEditorMutation.mutate({ path: absolutePath, cwd: worktreePath });
		}
	};

	const handleDiscardClick = () => {
		setShowDiscardDialog(true);
	};

	const handleConfirmDiscard = () => {
		setShowDiscardDialog(false);
		onDiscard?.();
	};

	const isDeleteAction = file.status === "untracked" || file.status === "added";
	const discardLabel = isDeleteAction ? "Delete" : "Discard Changes";
	const discardDialogTitle = isDeleteAction
		? `Delete "${fileName}"?`
		: `Discard changes to "${fileName}"?`;
	const discardDialogDescription = isDeleteAction
		? "This will permanently delete this file. This action cannot be undone."
		: "This will revert all changes to this file. This action cannot be undone.";

	const fileContent = (
		<div
			className={cn(
				"group w-full flex items-stretch gap-1 px-1.5 text-left rounded-sm",
				"cursor-pointer transition-colors overflow-hidden",
				isSelected ? "bg-muted" : "hover:bg-muted/80",
			)}
		>
			{hasIndent && <LevelIndicators level={level} />}

			{/* Checkbox for staging (GitHub Desktop style) */}
			{showCheckbox && (onStage || onUnstage) && (
				<div
					className="flex items-center px-0.5"
					onClick={(e) => e.stopPropagation()}
				>
					<Checkbox
						checked={isStaged}
						onCheckedChange={handleCheckboxChange}
						disabled={isActioning}
						className="size-3.5"
					/>
				</div>
			)}

			<button
				type="button"
				onClick={onClick}
				onDoubleClick={onDoubleClick}
				className={cn(
					"flex items-center gap-1.5 flex-1 min-w-0",
					hasIndent ? "py-0.5" : "py-1",
				)}
			>
				<span
					className={cn("shrink-0 flex items-center text-xs", statusBadgeColor)}
				>
					{statusIndicator}
				</span>
				<span className="flex-1 min-w-0 flex items-center gap-1">
					<Tooltip>
						<TooltipTrigger asChild>
							<span className="text-xs text-start truncate overflow-hidden text-ellipsis">
								{fileName}
							</span>
						</TooltipTrigger>
						<TooltipContent side="right">{file.path}</TooltipContent>
					</Tooltip>
					{showStatsDisplay && (
						<span className="flex items-center gap-0.5 text-[10px] font-mono shrink-0 whitespace-nowrap opacity-60">
							{file.additions > 0 && (
								<span className="text-green-600 dark:text-green-500">
									+{file.additions}
								</span>
							)}
							{file.deletions > 0 && (
								<span className="text-red-600 dark:text-red-400">
									-{file.deletions}
								</span>
							)}
						</span>
					)}
				</span>
			</button>

			{/* Hover actions (only when checkbox is not shown) */}
			{!showCheckbox && hasAction && (
				<div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
					{onStage && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="size-5 hover:bg-accent"
									onClick={(e) => {
										e.stopPropagation();
										onStage();
									}}
									disabled={isActioning}
								>
									<HiMiniPlus className="size-3" />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="right">Stage</TooltipContent>
						</Tooltip>
					)}
					{onUnstage && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="size-5 hover:bg-accent"
									onClick={(e) => {
										e.stopPropagation();
										onUnstage();
									}}
									disabled={isActioning}
								>
									<HiMiniMinus className="size-3" />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="right">Unstage</TooltipContent>
						</Tooltip>
					)}
				</div>
			)}
		</div>
	);

	if (!worktreePath) {
		return fileContent;
	}

	return (
		<>
			<ContextMenu>
				<ContextMenuTrigger asChild>{fileContent}</ContextMenuTrigger>
				<ContextMenuContent className="w-48">
					<ContextMenuItem onClick={handleCopyPath}>
						<ClipboardIcon className="mr-2 size-4" />
						Copy Path
					</ContextMenuItem>
					<ContextMenuItem onClick={handleCopyRelativePath}>
						<ClipboardIcon className="mr-2 size-4" />
						Copy Relative Path
					</ContextMenuItem>
					<ContextMenuSeparator />
					<ContextMenuItem onClick={handleRevealInFinder}>
						<FolderIcon className="mr-2 size-4" />
						Reveal in Finder
					</ContextMenuItem>
					<ContextMenuItem onClick={handleOpenInEditor}>
						<ExternalLinkIcon className="mr-2 size-4" />
						Open in Editor
					</ContextMenuItem>

					{(onStage || onUnstage || onDiscard) && <ContextMenuSeparator />}

					{onStage && (
						<ContextMenuItem onClick={onStage} disabled={isActioning}>
							<Plus className="mr-2 size-4" />
							Stage
						</ContextMenuItem>
					)}

					{onUnstage && (
						<ContextMenuItem onClick={onUnstage} disabled={isActioning}>
							<Minus className="mr-2 size-4" />
							Unstage
						</ContextMenuItem>
					)}

					{onDiscard && (
						<ContextMenuItem
							onClick={handleDiscardClick}
							disabled={isActioning}
							className="data-[highlighted]:bg-red-500/15 data-[highlighted]:text-red-400"
						>
							{discardLabel}
						</ContextMenuItem>
					)}
				</ContextMenuContent>
			</ContextMenu>

			<AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
				<AlertDialogContent className="w-[340px]">
					<AlertDialogHeader>
						<AlertDialogTitle>
							{discardDialogTitle}
						</AlertDialogTitle>
					</AlertDialogHeader>
					<AlertDialogDescription className="px-5 pb-5">
						{discardDialogDescription}
					</AlertDialogDescription>
					<AlertDialogFooter>
						<Button
							variant="outline"
							size="sm"
							onClick={() => setShowDiscardDialog(false)}
						>
							Cancel
						</Button>
						<Button
							variant="destructive"
							size="sm"
							onClick={handleConfirmDiscard}
						>
							{isDeleteAction ? "Delete" : "Discard"}
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

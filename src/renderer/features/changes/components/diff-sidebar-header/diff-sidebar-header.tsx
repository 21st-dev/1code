import { Button } from "../../../../components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
	DropdownMenuSub,
	DropdownMenuSubTrigger,
	DropdownMenuSubContent,
} from "../../../../components/ui/dropdown-menu";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "../../../../components/ui/context-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "../../../../components/ui/tooltip";
import { IconCloseSidebarRight, IconFetch, IconForcePush, IconSpinner, AgentIcon, CircleFilterIcon, IconReview, ExternalLinkIcon } from "../../../../components/ui/icons";
import { DiffViewModeSwitcher } from "./diff-view-mode-switcher";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { HiArrowPath, HiChevronDown } from "react-icons/hi2";
import { LuGitBranch } from "react-icons/lu";
import {
	ArrowDown,
	ArrowUp,
	Check,
	ChevronsDownUp,
	ChevronsUpDown,
	Columns2,
	Eye,
	GitMerge,
	GitPullRequest,
	MoreHorizontal,
	RefreshCw,
	Rows2,
	Square,
	Upload,
	X,
} from "lucide-react";
import { trpc } from "../../../../lib/trpc";
import { cn } from "../../../../lib/utils";
import { usePRStatus } from "../../../../hooks/usePRStatus";
import { PRIcon } from "../pr-icon";
import { toast } from "sonner";
import type { DiffViewMode } from "@/features/agents/ui/agent-diff-view";

interface DiffStats {
	isLoading: boolean;
	hasChanges: boolean;
	fileCount: number;
	additions: number;
	deletions: number;
}

interface DiffSidebarHeaderProps {
	worktreePath: string;
	currentBranch: string;
	diffStats: DiffStats;
	// Sidebar width for responsive layout
	sidebarWidth?: number;
	// Sync state
	pushCount?: number;
	pullCount?: number;
	hasUpstream?: boolean;
	isSyncStatusLoading?: boolean;
	// Commits relative to default branch
	aheadOfDefault?: number;
	behindDefault?: number;
	// Actions
	onReview?: () => void;
	isReviewing?: boolean;
	onCreatePr?: () => void;
	isCreatingPr?: boolean;
	onCreatePrWithAI?: () => void;
	isCreatingPrWithAI?: boolean;
	onMergePr?: () => void;
	isMergingPr?: boolean;
	onClose: () => void;
	onRefresh?: () => void;
	// PR state
	hasPrNumber?: boolean;
	isPrOpen?: boolean;
	/** Whether PR has merge conflicts - shows warning and disables merge */
	hasMergeConflicts?: boolean;
	/** Handler for fixing merge conflicts - sends prompt to AI */
	onFixConflicts?: () => void;
	// Diff view controls
	onExpandAll?: () => void;
	onCollapseAll?: () => void;
	viewMode?: DiffViewMode;
	onViewModeChange?: (mode: DiffViewMode) => void;
	// Viewed files controls
	viewedCount?: number;
	onMarkAllViewed?: () => void;
	onMarkAllUnviewed?: () => void;
	// Desktop window drag region
	isDesktop?: boolean;
	isFullscreen?: boolean;
	// Diff view display mode (side-peek, center-peek, full-page)
	displayMode?: "side-peek" | "center-peek" | "full-page";
	onDisplayModeChange?: (mode: "side-peek" | "center-peek" | "full-page") => void;
}

function formatTimeSince(date: Date): string {
	const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
	if (seconds < 60) return "just now";
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

export const DiffSidebarHeader = memo(function DiffSidebarHeader({
	worktreePath,
	currentBranch,
	diffStats,
	sidebarWidth = 800,
	pushCount = 0,
	pullCount = 0,
	hasUpstream = true,
	isSyncStatusLoading = false,
	aheadOfDefault = 0,
	behindDefault = 0,
	onReview,
	isReviewing = false,
	onCreatePr,
	isCreatingPr = false,
	onCreatePrWithAI,
	isCreatingPrWithAI = false,
	onMergePr,
	isMergingPr = false,
	onClose,
	onRefresh,
	hasPrNumber = false,
	isPrOpen = false,
	hasMergeConflicts = false,
	onFixConflicts,
	onExpandAll,
	onCollapseAll,
	viewMode = "unified",
	onViewModeChange,
	viewedCount = 0,
	onMarkAllViewed,
	onMarkAllUnviewed,
	isDesktop = false,
	isFullscreen = false,
	displayMode = "side-peek",
	onDisplayModeChange,
}: DiffSidebarHeaderProps) {
	// Responsive breakpoints - progressive disclosure
	const isCompact = sidebarWidth < 350;
	const showViewModeToggle = sidebarWidth >= 450; // Show Split/Unified toggle
	const showReviewButton = sidebarWidth >= 550; // Show Review button

	const [lastFetchTime, setLastFetchTime] = useState<Date | null>(null);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [displayTime, setDisplayTime] = useState<string>("");
	const timeoutRef = useRef<NodeJS.Timeout | null>(null);

	const { data: branchData, refetch: refetchBranches } =
		trpc.changes.getBranches.useQuery(
			{ worktreePath },
			{ enabled: !!worktreePath }
		);

	// Check if current branch is the default branch (main/master)
	const isDefaultBranch = currentBranch === branchData?.defaultBranch;

	const fetchMutation = trpc.changes.fetch.useMutation({
		onSuccess: () => {
			setLastFetchTime(new Date());
			refetchBranches();
			onRefresh?.();
		},
	});

	const pushMutation = trpc.changes.push.useMutation({
		onSuccess: () => {
			onRefresh?.();
		},
		onError: (error) => toast.error(`Push failed: ${error.message}`),
	});

	const pullMutation = trpc.changes.pull.useMutation({
		onSuccess: () => {
			onRefresh?.();
		},
		onError: (error) => toast.error(`Pull failed: ${error.message}`),
	});

	const forcePushMutation = trpc.changes.forcePush.useMutation({
		onSuccess: () => {
			onRefresh?.();
		},
		onError: (error: { message: string }) => toast.error(`Force push failed: ${error.message}`),
	});

	const mergeFromDefaultMutation = trpc.changes.mergeFromDefault.useMutation({
		onSuccess: () => {
			onRefresh?.();
		},
		onError: (error: { message: string }) => toast.error(`Merge failed: ${error.message}`),
	});

	const { pr } = usePRStatus({
		worktreePath,
		refetchInterval: 30000,
	});

	// Update display time every minute
	useEffect(() => {
		if (!lastFetchTime) return;

		const updateTime = () => {
			setDisplayTime(formatTimeSince(lastFetchTime));
		};

		updateTime();
		const interval = setInterval(updateTime, 60000);
		return () => clearInterval(interval);
	}, [lastFetchTime]);

	const handleFetch = () => {
		setIsRefreshing(true);
		fetchMutation.mutate(
			{ worktreePath },
			{
				onSettled: () => {
					if (timeoutRef.current) clearTimeout(timeoutRef.current);
					timeoutRef.current = setTimeout(() => setIsRefreshing(false), 600);
				},
			}
		);
	};

	const handlePush = () => {
		pushMutation.mutate({ worktreePath, setUpstream: !hasUpstream });
	};

	const handlePull = () => {
		pullMutation.mutate({ worktreePath, autoStash: true });
	};

	const handleForcePush = () => {
		if (window.confirm("Are you sure you want to force push? This will overwrite the remote branch.")) {
			forcePushMutation.mutate({ worktreePath });
		}
	};

	const handleMergeFromDefault = (useRebase = false) => {
		mergeFromDefaultMutation.mutate({ worktreePath, useRebase });
	};

	const handleOpenPR = () => {
		if (pr?.url) {
			window.open(pr.url, "_blank");
		}
	};

	const handleCopyPRLink = () => {
		if (pr?.url) {
			navigator.clipboard.writeText(pr.url);
		}
	};

	useEffect(() => {
		return () => {
			if (timeoutRef.current) clearTimeout(timeoutRef.current);
		};
	}, []);

	// Check pending states
	const isPushPending = pushMutation.isPending;
	const isPullPending = pullMutation.isPending;
	const isFetchPending = isRefreshing || fetchMutation.isPending;

	// ============ NEW BUTTON LOGIC ============
	// Priority:
	// 1. !hasUpstream → Publish Branch
	// 2. pushCount > 0 → Push (with pullCount > 0 showing Pull first)
	// 3. pullCount > 0 → Pull
	// 4. hasPR → Open PR
	// 5. hasUpstream && !hasPR → Create PR (secondary) or Fetch (primary)
	// 6. Default → Fetch

	interface ActionButton {
		label: string;
		pendingLabel?: string;
		icon: React.ReactNode;
		handler: () => void;
		tooltip: string;
		badge?: string;
		variant?: "default" | "ghost" | "outline";
		isPending?: boolean;
		disabled?: boolean;
	}

	const getPrimaryAction = (): ActionButton => {
		// 0. Loading state - show loading indicator
		if (isSyncStatusLoading) {
			return {
				label: "",
				pendingLabel: "",
				icon: <IconFetch className="size-3.5" />,
				handler: () => {},
				tooltip: "Loading sync status...",
				variant: "ghost",
				isPending: true,
				disabled: true,
			};
		}

		// 1. Branch not published - must publish first
		if (!hasUpstream) {
			return {
				label: "Publish",
				pendingLabel: "Publishing...",
				icon: <Upload className="size-3.5" />,
				handler: handlePush,
				tooltip: "Publish branch to remote",
				variant: "default",
				isPending: isPushPending,
			};
		}

		// 2. Remote has changes we need to pull first
		if (pullCount > 0) {
			return {
				label: "Pull",
				pendingLabel: "Pulling...",
				icon: <ArrowDown className="size-3.5" />,
				handler: handlePull,
				tooltip: `Pull ${pullCount} commit${pullCount !== 1 ? "s" : ""} from remote`,
				badge: `↓${pullCount}`,
				variant: "default",
				isPending: isPullPending,
			};
		}

		// 3. We have commits to push
		if (pushCount > 0) {
			return {
				label: "Push",
				pendingLabel: "Pushing...",
				icon: <ArrowUp className="size-3.5" />,
				handler: handlePush,
				tooltip: `Push ${pushCount} commit${pushCount !== 1 ? "s" : ""} to remote`,
				badge: `↑${pushCount}`,
				variant: "default",
				isPending: isPushPending,
			};
		}

		// 4. PR exists - Open PR as primary
		if (pr) {
			return {
				label: "Open PR",
				icon: <ExternalLinkIcon className="size-3.5" />,
				handler: handleOpenPR,
				tooltip: `Open Pull Request #${pr.number}`,
				variant: "ghost",
			};
		}

		// 5. No PR, branch is synced - Create PR if ahead of default, otherwise Fetch
		if (hasUpstream && !pr) {
			// Show Create PR if we have commits ahead of default branch (not on default branch)
			if (aheadOfDefault > 0 && !isDefaultBranch && onCreatePr) {
				return {
					label: "Create PR",
					pendingLabel: "Creating...",
					icon: <GitPullRequest className="size-3.5" />,
					handler: onCreatePr,
					tooltip: `Create Pull Request (${aheadOfDefault} commit${aheadOfDefault !== 1 ? "s" : ""} ahead of ${branchData?.defaultBranch || "main"})`,
					badge: `↑${aheadOfDefault}`,
					variant: "default",
					isPending: isCreatingPr,
				};
			}
			// Otherwise show Fetch
			return {
				label: "Fetch",
				pendingLabel: "Fetching...",
				icon: <IconFetch className="size-3.5" />,
				handler: handleFetch,
				tooltip: lastFetchTime ? `Last fetched ${displayTime}` : "Check for updates",
				variant: "ghost",
				isPending: isFetchPending,
			};
		}

		// 6. Fallback - Fetch
		return {
			label: "Fetch",
			pendingLabel: "Fetching...",
			icon: <IconFetch className="size-3.5" />,
			handler: handleFetch,
			tooltip: "Check for updates",
			variant: "ghost",
			isPending: isFetchPending,
		};
	};

	const primaryAction = getPrimaryAction();

	// Override primary action when fetching from dropdown
	const displayAction: ActionButton = isFetchPending && !primaryAction.isPending
		? {
			label: "Fetching",
			pendingLabel: "Fetching...",
			icon: <IconFetch className="size-3.5" />,
			handler: () => {},
			tooltip: "Fetching from remote...",
			variant: primaryAction.variant,
			isPending: true,
		}
		: primaryAction;

	return (
		<div className="relative flex items-center justify-between h-10 px-2 border-b border-border/50 bg-background flex-shrink-0">
			{/* Drag region for window dragging */}
			{isDesktop && !isFullscreen && (
				<div
					className="absolute inset-0 z-0"
					style={{
						// @ts-expect-error - WebKit-specific property
						WebkitAppRegion: "drag",
					}}
				/>
			)}
			{/* Left side: Close button + Branch selector */}
			<div
				className="relative z-10 flex items-center gap-1 min-w-0 flex-shrink"
				style={{
					// @ts-expect-error - WebKit-specific property
					WebkitAppRegion: "no-drag",
				}}
			>
				{/* Close button - X icon for dialog/fullpage modes, chevron for sidebar */}
				<Button
					variant="ghost"
					size="sm"
					className="h-6 w-6 p-0 flex-shrink-0 hover:bg-foreground/10"
					onClick={onClose}
				>
					{displayMode === "side-peek" ? (
						<IconCloseSidebarRight className="size-4 text-muted-foreground" />
					) : (
						<X className="size-4 text-muted-foreground" />
					)}
				</Button>

				{/* Display mode switcher (side-peek, center-peek, full-page) */}
				{onDisplayModeChange && (
					<DiffViewModeSwitcher
						mode={displayMode}
						onModeChange={onDisplayModeChange}
					/>
				)}

				{/* Branch name display (branch switching will be added later) */}
				<div className="h-6 px-2 gap-1 text-xs font-medium min-w-0 flex items-center">
					<LuGitBranch className="size-3.5 shrink-0 opacity-70" />
					<span className="truncate max-w-[120px] text-foreground">
						{currentBranch || "No branch"}
					</span>
				</div>

				{/* PR Status badge */}
				{pr && (
					<ContextMenu>
						<ContextMenuTrigger asChild>
							<a
								href={pr.url}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-1 h-6 px-2 rounded-md hover:bg-foreground/10 transition-colors"
							>
								<PRIcon state={pr.state} className="size-3.5" />
								<span className="text-xs text-muted-foreground font-mono">
									#{pr.number}
								</span>
							</a>
						</ContextMenuTrigger>
						<ContextMenuContent>
							<ContextMenuItem onClick={handleOpenPR} className="text-xs">
								Open in browser
							</ContextMenuItem>
							<ContextMenuItem onClick={handleCopyPRLink} className="text-xs">
								Copy link
							</ContextMenuItem>
						</ContextMenuContent>
					</ContextMenu>
				)}
			</div>

			{/* Right side: Review + View mode toggle + Primary action (split button) + Secondary action + Overflow menu */}
			<div
				className="relative z-10 flex items-center gap-1 flex-shrink-0"
				style={{
					// @ts-expect-error - WebKit-specific property
					WebkitAppRegion: "no-drag",
				}}
			>
				{/* Review button - visible when there's enough space */}
				{showReviewButton && diffStats.hasChanges && onReview && (
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								onClick={onReview}
								disabled={isReviewing}
								className="h-6 px-2 gap-1 text-xs hover:bg-foreground/10"
							>
								{isReviewing ? (
									<IconSpinner className="size-3.5" />
								) : (
									<IconReview className="size-3.5" />
								)}
								<span>Review</span>
							</Button>
						</TooltipTrigger>
						<TooltipContent side="bottom">Review changes with AI</TooltipContent>
					</Tooltip>
				)}

				{/* Primary action button (solo when Fetch/Open PR, split when Push/Pull/Create PR) */}
				{displayAction.label === "Fetch" || displayAction.label === "Fetching" || displayAction.label === "Open PR" ? (
					// Solo button - no dropdown (for Fetch and Open PR)
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								onClick={displayAction.handler}
								disabled={displayAction.isPending || displayAction.disabled}
								className={cn(
									"inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors",
									"outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/70",
									"disabled:pointer-events-none disabled:opacity-50",
									"h-6 px-2 gap-1 text-xs rounded-md focus:z-10 overflow-hidden",
									"transition-all duration-200 ease-out",
									displayAction.variant === "default"
										? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_0_0.5px_rgb(23,23,23),inset_0_0_0_1px_rgba(255,255,255,0.14)] dark:shadow-[0_0_0_0.5px_rgb(23,23,23),inset_0_0_0_1px_rgba(0,0,0,0.14)]"
										: "hover:bg-accent hover:text-accent-foreground"
								)}
							>
								<span className="flex items-center gap-1 transition-opacity duration-150 min-w-0">
									{displayAction.isPending ? (
										<>
											<IconSpinner className="size-3.5 ml-0.5 shrink-0" />
											{displayAction.pendingLabel && <span className="mr-0.5 truncate">{displayAction.pendingLabel}</span>}
											{displayAction.badge && (
												<span className="text-[10px] bg-primary-foreground/20 px-1.5 py-0.5 rounded font-medium ml-1 shrink-0">
													{displayAction.badge}
												</span>
											)}
										</>
									) : (
										<>
											<span className="shrink-0">{displayAction.icon}</span>
											{displayAction.label && <span className="truncate">{displayAction.label}</span>}
											{displayAction.badge && (
												<span className="text-[10px] bg-primary-foreground/20 px-1.5 py-0.5 rounded font-medium ml-1 shrink-0">
													{displayAction.badge}
												</span>
											)}
										</>
									)}
								</span>
							</button>
						</TooltipTrigger>
						<TooltipContent side="bottom">{displayAction.tooltip}</TooltipContent>
					</Tooltip>
				) : (
					// Split button with dropdown for Push/Pull/PR actions
					<div className="inline-flex -space-x-px rounded-md">
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									onClick={displayAction.handler}
									disabled={displayAction.isPending || displayAction.disabled}
									className={cn(
										"inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors",
										"outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/70",
										"disabled:pointer-events-none disabled:opacity-50",
										"h-6 px-2 gap-1 text-xs rounded-l-md rounded-r-none focus:z-10 overflow-hidden",
										"transition-all duration-200 ease-out",
										displayAction.variant === "default"
											? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_0_0.5px_rgb(23,23,23),inset_0_0_0_1px_rgba(255,255,255,0.14)] dark:shadow-[0_0_0_0.5px_rgb(23,23,23),inset_0_0_0_1px_rgba(0,0,0,0.14)]"
											: "hover:bg-accent hover:text-accent-foreground"
									)}
								>
									<span className="flex items-center gap-1 transition-opacity duration-150 min-w-0">
										{displayAction.isPending ? (
											<>
												<IconSpinner className="size-3.5 ml-0.5 shrink-0" />
												{displayAction.pendingLabel && <span className="mr-0.5 truncate">{displayAction.pendingLabel}</span>}
												{displayAction.badge && (
													<span className="text-[10px] bg-primary-foreground/20 px-1.5 py-0.5 rounded font-medium ml-1 shrink-0">
														{displayAction.badge}
													</span>
												)}
											</>
										) : (
											<>
												<span className="shrink-0">{displayAction.icon}</span>
												{displayAction.label && <span className="truncate">{displayAction.label}</span>}
												{displayAction.badge && (
													<span className="text-[10px] bg-primary-foreground/20 px-1.5 py-0.5 rounded font-medium ml-1 shrink-0">
														{displayAction.badge}
													</span>
												)}
											</>
										)}
									</span>
								</button>
							</TooltipTrigger>
							<TooltipContent side="bottom">{displayAction.tooltip}</TooltipContent>
						</Tooltip>

						{/* Dropdown trigger for git operations */}
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant={displayAction.variant === "default" ? "default" : "ghost"}
									size="sm"
									disabled={displayAction.isPending}
									className={cn(
										"h-6 w-6 p-0 rounded-l-none rounded-r-md focus:z-10",
										displayAction.variant === "ghost" && "hover:bg-accent hover:text-accent-foreground shadow-none"
									)}
									aria-label="More git options"
								>
									<HiChevronDown className="size-3" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-52">
								{/* Fetch - available when primary action is NOT Fetch */}
								<DropdownMenuItem
									onClick={handleFetch}
									disabled={isFetchPending}
									className="text-xs"
								>
									<HiArrowPath className={cn("mr-2 size-3.5", isFetchPending && "animate-spin")} />
									<div className="flex-1">
										<div>Fetch origin</div>
										<div className="text-[10px] text-muted-foreground">
											{lastFetchTime ? `Last fetched ${displayTime}` : "Check for updates"}
										</div>
									</div>
								</DropdownMenuItem>

								{/* Force Push - only when history diverged (remote has commits we don't have locally) */}
								{hasUpstream && pullCount > 0 && (
									<DropdownMenuItem
										onClick={handleForcePush}
										disabled={forcePushMutation.isPending}
										className="text-xs data-[highlighted]:bg-red-500/15 data-[highlighted]:text-red-400 [&_div]:data-[highlighted]:text-red-400/70"
									>
										<IconForcePush className="mr-2 size-3.5" />
										<div className="flex-1">
											<div>Force push</div>
											<div className="text-[10px] text-muted-foreground/70">
												Overwrite remote (dangerous)
											</div>
										</div>
									</DropdownMenuItem>
								)}

								{/* Merge/Rebase from default branch */}
								{!isDefaultBranch && hasUpstream && (
									<>
										<DropdownMenuSeparator />
										<DropdownMenuItem
											onClick={() => handleMergeFromDefault(false)}
											disabled={mergeFromDefaultMutation.isPending || behindDefault === 0}
											className="text-xs"
										>
											<GitMerge className="mr-2 size-3.5" />
											<div className="flex-1">
												<div>Merge from {branchData?.defaultBranch || "main"}</div>
												<div className="text-[10px] text-muted-foreground">
													{behindDefault > 0
														? `${behindDefault} commit${behindDefault !== 1 ? "s" : ""} to merge`
														: "Already up to date"}
												</div>
											</div>
											{behindDefault > 0 && (
												<span className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-medium ml-2">
													↓{behindDefault}
												</span>
											)}
										</DropdownMenuItem>
										<DropdownMenuItem
											onClick={() => handleMergeFromDefault(true)}
											disabled={mergeFromDefaultMutation.isPending || behindDefault === 0}
											className="text-xs"
										>
											<GitMerge className="mr-2 size-3.5" />
											<div className="flex-1">
												<div>Rebase on {branchData?.defaultBranch || "main"}</div>
												<div className="text-[10px] text-muted-foreground">
													{behindDefault > 0
														? `Replay on top of ${behindDefault} commit${behindDefault !== 1 ? "s" : ""}`
														: "Already up to date"}
												</div>
											</div>
											{behindDefault > 0 && (
												<span className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-medium ml-2">
													↓{behindDefault}
												</span>
											)}
										</DropdownMenuItem>
									</>
								)}

								{/* PR actions separator */}
								{((hasUpstream && !pr && onCreatePr && !isDefaultBranch && primaryAction.label !== "Create PR") || (hasUpstream && !pr && onCreatePrWithAI && !isDefaultBranch) || pr || (hasPrNumber && isPrOpen && onMergePr)) && (
									<DropdownMenuSeparator />
								)}

								{/* Create PR */}
								{hasUpstream && !pr && onCreatePr && !isDefaultBranch && primaryAction.label !== "Create PR" && (
									<DropdownMenuItem
										onClick={onCreatePr}
										disabled={isCreatingPr || aheadOfDefault === 0}
										className="text-xs"
									>
										<GitPullRequest className="mr-2 size-3.5" />
										<div className="flex-1">
											<div>{isCreatingPr ? "Creating..." : "Create Pull Request"}</div>
											{aheadOfDefault === 0 && (
												<div className="text-[10px] text-muted-foreground">
													No commits to merge into {branchData?.defaultBranch || "main"}
												</div>
											)}
										</div>
										{aheadOfDefault > 0 && (
											<span className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-medium ml-2">
												↑{aheadOfDefault}
											</span>
										)}
									</DropdownMenuItem>
								)}

								{/* Create PR with AI */}
								{hasUpstream && !pr && onCreatePrWithAI && !isDefaultBranch && (
									<DropdownMenuItem
										onClick={onCreatePrWithAI}
										disabled={isCreatingPrWithAI}
										className="text-xs"
									>
										<GitPullRequest className="mr-2 size-3.5" />
										<div className="flex-1">
											<div>{isCreatingPrWithAI ? "Creating..." : "Create PR with AI"}</div>
											<div className="text-[10px] text-muted-foreground">
												Let AI create and push PR
											</div>
										</div>
									</DropdownMenuItem>
								)}

								{/* Open PR */}
								{pr && primaryAction.label !== "Open PR" && (
									<DropdownMenuItem
										onClick={handleOpenPR}
										className="text-xs"
									>
										<ExternalLinkIcon className="mr-2 size-3.5" />
										<span>Open Pull Request #{pr.number}</span>
									</DropdownMenuItem>
								)}

								{/* Merge PR */}
								{hasPrNumber && isPrOpen && onMergePr && !hasMergeConflicts && (
									<DropdownMenuItem
										onClick={onMergePr}
										disabled={isMergingPr}
										className="text-xs"
									>
										<GitMerge className="mr-2 size-3.5" />
										<span>{isMergingPr ? "Merging..." : "Merge Pull Request"}</span>
									</DropdownMenuItem>
								)}

								{/* Fix Conflicts */}
								{hasPrNumber && isPrOpen && hasMergeConflicts && onFixConflicts && (
									<DropdownMenuItem
										onClick={onFixConflicts}
										className="text-xs text-yellow-600 dark:text-yellow-500"
									>
										<GitMerge className="mr-2 size-3.5" />
										<span>Fix Merge Conflicts</span>
									</DropdownMenuItem>
								)}
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				)}

				{/* View mode toggle - visible when there's enough space */}
				{showViewModeToggle && onViewModeChange && (
					<div className="inline-flex rounded-md border border-input">
						<Button
							variant={viewMode === "split" ? "secondary" : "ghost"}
							size="sm"
							onClick={() => onViewModeChange("split")}
							className={cn(
								"h-6 w-6 p-0 rounded-r-none border-0",
								viewMode !== "split" && "hover:bg-foreground/10"
							)}
							title="Split view"
						>
							<Columns2 className="size-3.5" />
						</Button>
						<Button
							variant={viewMode === "unified" ? "secondary" : "ghost"}
							size="sm"
							onClick={() => onViewModeChange("unified")}
							className={cn(
								"h-6 w-6 p-0 rounded-l-none border-0 border-l border-input",
								viewMode !== "unified" && "hover:bg-foreground/10"
							)}
							title="Unified view"
						>
							<Rows2 className="size-3.5" />
						</Button>
					</div>
				)}

				{/* Overflow menu (three dots) - view options, expand/collapse, hidden items */}
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="sm"
							className="h-6 w-6 p-0 flex-shrink-0 hover:bg-foreground/10"
						>
							<MoreHorizontal className="size-4 text-muted-foreground" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-48">
						{/* Review - shown here when button is hidden */}
						{!showReviewButton && diffStats.hasChanges && onReview && (
							<DropdownMenuItem
								onClick={onReview}
								disabled={isReviewing}
								className="text-xs"
							>
								<IconReview className="mr-2 size-3.5" />
								<span>{isReviewing ? "Reviewing..." : "Review changes"}</span>
							</DropdownMenuItem>
						)}

						{/* Separator only if we have hidden review above */}
						{(!showReviewButton && diffStats.hasChanges && onReview) && (
							<DropdownMenuSeparator />
						)}

						{/* Refresh diff view */}
						{onRefresh && (
							<DropdownMenuItem
								onClick={onRefresh}
								className="text-xs"
							>
								<RefreshCw className="mr-2 size-3.5" />
								<span>Refresh diff view</span>
							</DropdownMenuItem>
						)}

						{/* Separator after refresh if view mode submenu follows */}
						{onRefresh && !showViewModeToggle && onViewModeChange && (
							<DropdownMenuSeparator />
						)}

						{/* View mode submenu - only shown when toggle is hidden */}
						{!showViewModeToggle && onViewModeChange && (
							<>
								<DropdownMenuSub>
									<DropdownMenuSubTrigger className="text-xs">
										<Eye className="mr-2 size-3.5" />
										<span>View</span>
									</DropdownMenuSubTrigger>
									<DropdownMenuSubContent>
										<DropdownMenuItem
											onClick={() => onViewModeChange("split")}
											className={cn("text-xs", viewMode === "split" && "bg-muted")}
										>
											<Columns2 className="mr-2 size-3.5" />
											<span>Split view</span>
										</DropdownMenuItem>
										<DropdownMenuItem
											onClick={() => onViewModeChange("unified")}
											className={cn("text-xs", viewMode === "unified" && "bg-muted")}
										>
											<Rows2 className="mr-2 size-3.5" />
											<span>Unified view</span>
										</DropdownMenuItem>
									</DropdownMenuSubContent>
								</DropdownMenuSub>
								<DropdownMenuSeparator />
							</>
						)}

						{/* Expand/Collapse all */}
						{onExpandAll && (
							<DropdownMenuItem
								onClick={onExpandAll}
								className="text-xs"
							>
								<ChevronsUpDown className="mr-2 size-3.5" />
								<span>Expand all</span>
							</DropdownMenuItem>
						)}
						{onCollapseAll && (
							<DropdownMenuItem
								onClick={onCollapseAll}
								className="text-xs"
							>
								<ChevronsDownUp className="mr-2 size-3.5" />
								<span>Collapse all</span>
							</DropdownMenuItem>
						)}

						{/* Mark all as viewed/unviewed */}
						{(onMarkAllViewed || onMarkAllUnviewed) && (onExpandAll || onCollapseAll) && (
							<DropdownMenuSeparator />
						)}
						{onMarkAllViewed && (
							<DropdownMenuItem
								onClick={onMarkAllViewed}
								className="text-xs"
							>
								<Check className="mr-2 size-3.5" />
								<span>Mark all as viewed</span>
							</DropdownMenuItem>
						)}
						{onMarkAllUnviewed && viewedCount > 0 && (
							<DropdownMenuItem
								onClick={onMarkAllUnviewed}
								className="text-xs"
							>
								<Square className="mr-2 size-3.5" />
								<span>Mark all as unviewed</span>
							</DropdownMenuItem>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>
	);
})

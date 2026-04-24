import { Button } from "../../../../components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../../../components/ui/tooltip";
import { useEffect, useRef, useState } from "react";
import { HiArrowPath } from "react-icons/hi2";
import { trpc } from "../../../../lib/trpc";
import { cn } from "../../../../lib/utils";
import { usePRStatus } from "../../../../hooks/usePRStatus";
import { PRIcon } from "../pr-icon";
import { BranchSwitcherPopover } from "../branch-switcher/branch-switcher-popover";

type LayoutMode = "compact" | "standard" | "wide" | "full";

interface ChangesPanelHeaderProps {
	worktreePath: string;
	currentBranch: string;
	layoutMode: LayoutMode;
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

export function ChangesPanelHeader({
	worktreePath,
	currentBranch,
	layoutMode,
}: ChangesPanelHeaderProps) {
	const [lastFetchTime, setLastFetchTime] = useState<Date | null>(null);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [displayTime, setDisplayTime] = useState<string>("");
	const timeoutRef = useRef<NodeJS.Timeout | null>(null);

	const utils = trpc.useUtils();

	const { refetch: refetchBranches } = trpc.changes.getBranches.useQuery(
		{ worktreePath },
		{ enabled: !!worktreePath },
	);

	const fetchMutation = trpc.changes.fetch.useMutation({
		onSuccess: () => {
			setLastFetchTime(new Date());
			refetchBranches();
			utils.changes.getStatus.invalidate({ worktreePath });
		},
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
			},
		);
	};

	useEffect(() => {
		return () => {
			if (timeoutRef.current) clearTimeout(timeoutRef.current);
		};
	}, []);

	const isCompact = layoutMode === "compact";

	return (
		<div
			className={cn(
				"flex items-center gap-2 px-2 py-1.5 flex-1 min-w-0",
				isCompact && "px-1.5 py-1",
			)}
		>
			{/* Branch selector */}
			<BranchSwitcherPopover
				worktreePath={worktreePath}
				currentBranch={currentBranch}
				compact={isCompact}
			/>

			{/* Right side: PR status + Fetch */}
			<div className="flex items-center gap-1">
				{/* PR Status */}
				{pr && (
					<Tooltip>
						<TooltipTrigger asChild>
							<a
								href={pr.url}
								target="_blank"
								rel="noopener noreferrer"
								className={cn(
									"flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-accent transition-colors",
									isCompact && "px-1",
								)}
							>
								<PRIcon state={pr.state} className={cn("size-3.5", isCompact && "size-3")} />
								{!isCompact && (
									<span className="text-[10px] text-muted-foreground font-mono">
										#{pr.number}
									</span>
								)}
							</a>
						</TooltipTrigger>
						<TooltipContent side="bottom">
							PR #{pr.number}: {pr.title}
						</TooltipContent>
					</Tooltip>
				)}

				{/* Fetch button */}
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="sm"
							onClick={handleFetch}
							disabled={isRefreshing || fetchMutation.isPending}
							className={cn(
								"h-6 px-2 gap-1.5 text-xs",
								isCompact && "h-5 px-1.5 gap-1",
							)}
						>
							<HiArrowPath
								className={cn(
									"size-3.5",
									(isRefreshing || fetchMutation.isPending) && "animate-spin",
									isCompact && "size-3",
								)}
							/>
							{layoutMode !== "compact" && (
								<span className="text-[10px] text-muted-foreground">
									{displayTime || "Fetch"}
								</span>
							)}
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						{lastFetchTime
							? `Last fetched ${displayTime}`
							: "Fetch from remote"}
					</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
}

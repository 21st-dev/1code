import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Check } from "lucide-react";
import { LuGitBranch } from "react-icons/lu";
import { HiChevronDown } from "react-icons/hi2";
import { SearchIcon } from "../../../../components/ui/icons";
import { Popover, PopoverContent, PopoverTrigger } from "../../../../components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../../../components/ui/tooltip";
import { Button } from "../../../../components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../../../../components/ui/dialog";
import { toast } from "sonner";
import { trpc } from "../../../../lib/trpc";
import { cn } from "../../../../lib/utils";
import { formatTimeAgo } from "../../../../lib/utils/format-time-ago";

interface BranchEntry {
	name: string;
	type: "local" | "remote";
	isDefault: boolean;
	committedAt: string | null;
}

interface BranchSwitcherPopoverProps {
	worktreePath: string;
	currentBranch: string;
	compact?: boolean;
}

type PendingSwitch = {
	branch: string;
	dirty: boolean;
};

export function BranchSwitcherPopover({
	worktreePath,
	currentBranch,
	compact = false,
}: BranchSwitcherPopoverProps) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [pending, setPending] = useState<PendingSwitch | null>(null);
	const listRef = useRef<HTMLDivElement>(null);

	const utils = trpc.useUtils();

	const branchesQuery = trpc.changes.getBranches.useQuery(
		{ worktreePath },
		{ enabled: !!worktreePath && open },
	);

	const statusQuery = trpc.changes.getStatus.useQuery(
		{ worktreePath },
		{ enabled: !!worktreePath, staleTime: 2000 },
	);

	const checkoutMutation = trpc.changes.checkout.useMutation({
		onSuccess: (result, vars) => {
			utils.changes.getBranches.invalidate({ worktreePath });
			utils.changes.getStatus.invalidate({ worktreePath });
			utils.changes.getGitHubStatus.invalidate({ worktreePath });
			utils.chats.getPrStatus.invalidate();
			if (result.stashPopFailed) {
				toast.warning("Switched branch, but couldn't restore stashed changes", {
					description:
						"Your changes are saved in git stash. Run `git stash pop` manually to resolve the conflict.",
				});
			} else {
				toast.success(`Switched to ${vars.branch}`);
			}
			setPending(null);
		},
		onError: (error) => {
			toast.error("Failed to switch branch", {
				description: error.message,
			});
			setPending(null);
		},
	});

	const branches: BranchEntry[] = useMemo(() => {
		if (!branchesQuery.data) return [];
		const { local, remote, defaultBranch } = branchesQuery.data;
		const result: BranchEntry[] = [];
		for (const { branch, lastCommitDate } of local) {
			result.push({
				name: branch,
				type: "local",
				isDefault: branch === defaultBranch,
				committedAt: lastCommitDate ? new Date(lastCommitDate).toISOString() : null,
			});
		}
		for (const name of remote) {
			result.push({
				name,
				type: "remote",
				isDefault: name === defaultBranch,
				committedAt: null,
			});
		}
		return result.sort((a, b) => {
			if (a.isDefault && !b.isDefault) return -1;
			if (!a.isDefault && b.isDefault) return 1;
			if (a.type !== b.type) return a.type === "local" ? -1 : 1;
			return a.name.localeCompare(b.name);
		});
	}, [branchesQuery.data]);

	const filtered = useMemo(() => {
		if (!search.trim()) return branches;
		const q = search.toLowerCase();
		return branches.filter((b) => b.name.toLowerCase().includes(q));
	}, [branches, search]);

	const virtualizer = useVirtualizer({
		count: filtered.length,
		getScrollElement: () => listRef.current,
		estimateSize: () => 32,
		overscan: 5,
		enabled: open,
	});

	useEffect(() => {
		if (open) {
			const t = setTimeout(() => virtualizer.measure(), 0);
			return () => clearTimeout(t);
		}
	}, [open, virtualizer]);

	const handleSelect = (branch: string) => {
		if (branch === currentBranch) {
			setOpen(false);
			return;
		}
		setOpen(false);
		setSearch("");

		const status = statusQuery.data;
		const dirty = !!status && (
			status.staged.length > 0 ||
			status.unstaged.length > 0 ||
			status.untracked.length > 0
		);

		if (dirty) {
			setPending({ branch, dirty: true });
		} else {
			checkoutMutation.mutate({ worktreePath, branch, uncommittedStrategy: "abort" });
		}
	};

	const runSwitch = (strategy: "carry" | "stash") => {
		if (!pending) return;
		checkoutMutation.mutate({
			worktreePath,
			branch: pending.branch,
			uncommittedStrategy: strategy,
		});
	};

	return (
		<>
			<Popover
				open={open}
				onOpenChange={(next) => {
					if (!next) setSearch("");
					setOpen(next);
				}}
			>
				<Tooltip>
					<TooltipTrigger asChild>
						<PopoverTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								disabled={checkoutMutation.isPending}
								className={cn(
									"h-6 px-2 gap-1.5 text-xs font-medium min-w-0",
									compact && "h-5 px-1.5 gap-1 text-[10px]",
								)}
							>
								<LuGitBranch className={cn("size-3.5 shrink-0", compact && "size-3")} />
								<span className="truncate max-w-[160px]">
									{currentBranch || "No branch"}
								</span>
								<HiChevronDown className={cn("size-3 shrink-0 opacity-50", compact && "size-2.5")} />
							</Button>
						</PopoverTrigger>
					</TooltipTrigger>
					<TooltipContent side="bottom">Switch branch</TooltipContent>
				</Tooltip>
				<PopoverContent className="w-80 p-0" align="start">
					<div className="flex items-center gap-1.5 h-7 px-1.5 mx-1 my-1 rounded-md bg-muted/50">
						<SearchIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
						<input
							type="text"
							placeholder="Search branches..."
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
							autoFocus
						/>
					</div>

					{branchesQuery.isLoading ? (
						<div className="py-6 text-center text-sm text-muted-foreground">
							Loading branches...
						</div>
					) : filtered.length === 0 ? (
						<div className="py-6 text-center text-sm text-muted-foreground">
							No branches found.
						</div>
					) : (
						<div
							ref={listRef}
							className="overflow-auto py-1 scrollbar-hide"
							style={{
								height: Math.min(filtered.length * 32 + 8, 300),
							}}
						>
							<div
								style={{
									height: `${virtualizer.getTotalSize()}px`,
									width: "100%",
									position: "relative",
								}}
							>
								{virtualizer.getVirtualItems().map((virtualItem) => {
									const branch = filtered[virtualItem.index]!;
									const isCurrent = branch.name === currentBranch && branch.type === "local";
									return (
										<button
											key={`${branch.type}-${branch.name}`}
											onClick={() => handleSelect(branch.name)}
											className={cn(
												"flex items-center gap-1.5 w-[calc(100%-8px)] mx-1 px-1.5 text-sm text-left absolute left-0 top-0 rounded-md cursor-default select-none outline-none transition-colors",
												isCurrent
													? "dark:bg-neutral-800 bg-accent text-foreground"
													: "dark:hover:bg-neutral-800 hover:bg-accent/60 hover:text-foreground",
											)}
											style={{
												height: `${virtualItem.size}px`,
												transform: `translateY(${virtualItem.start}px)`,
											}}
										>
											<LuGitBranch className="h-4 w-4 text-muted-foreground shrink-0" />
											<span className="truncate flex-1">{branch.name}</span>
											<span
												className={cn(
													"text-[10px] px-1.5 py-0.5 rounded shrink-0",
													branch.type === "local"
														? "bg-blue-500/10 text-blue-500"
														: "bg-orange-500/10 text-orange-500",
												)}
											>
												{branch.type}
											</span>
											{branch.committedAt && (
												<span className="text-xs text-muted-foreground/70 shrink-0">
													{formatTimeAgo(branch.committedAt)}
												</span>
											)}
											{branch.isDefault && (
												<span className="text-[10px] text-muted-foreground/70 bg-muted px-1.5 py-0.5 rounded shrink-0">
													default
												</span>
											)}
											{isCurrent && <Check className="h-4 w-4 shrink-0 ml-auto" />}
										</button>
									);
								})}
							</div>
						</div>
					)}
				</PopoverContent>
			</Popover>

			<Dialog
				open={!!pending}
				onOpenChange={(open) => {
					if (!open) setPending(null);
				}}
			>
				<DialogContent className="sm:max-w-[420px]">
					<DialogHeader>
						<DialogTitle>Uncommitted changes</DialogTitle>
						<DialogDescription>
							You have uncommitted changes in this worktree. How should they be handled when switching to{" "}
							<span className="font-mono text-foreground">{pending?.branch}</span>?
						</DialogDescription>
					</DialogHeader>
					<DialogFooter className="flex-col-reverse sm:flex-row sm:justify-end gap-2">
						<Button
							variant="ghost"
							onClick={() => setPending(null)}
							disabled={checkoutMutation.isPending}
						>
							Cancel
						</Button>
						<Button
							variant="outline"
							onClick={() => runSwitch("carry")}
							disabled={checkoutMutation.isPending}
						>
							Carry changes
						</Button>
						<Button
							onClick={() => runSwitch("stash")}
							disabled={checkoutMutation.isPending}
						>
							Stash &amp; switch
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}

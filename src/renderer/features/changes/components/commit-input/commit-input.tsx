import { Button } from "../../../../components/ui/button";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../../../components/ui/tooltip";
import { useState } from "react";
import { trpc } from "../../../../lib/trpc";
import { cn } from "../../../../lib/utils";
import { IconSpinner } from "../../../../components/ui/icons";
import { useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { selectedOllamaModelAtom } from "../../../../lib/atoms";

interface CommitInputProps {
	worktreePath: string;
	hasStagedChanges: boolean;
	onRefresh: () => void;
	/** Called after a successful commit to reset UI state */
	onCommitSuccess?: () => void;
	stagedCount?: number;
	currentBranch?: string;
	/** File paths selected for commit - will be staged before committing */
	selectedFilePaths?: string[];
	/** Chat ID for AI-generated commit messages */
	chatId?: string;
}

export function CommitInput({
	worktreePath,
	hasStagedChanges,
	onRefresh,
	onCommitSuccess,
	stagedCount,
	currentBranch,
	selectedFilePaths,
	chatId,
}: CommitInputProps) {
	const [summary, setSummary] = useState("");
	const [description, setDescription] = useState("");
	const [isGenerating, setIsGenerating] = useState(false);
	const queryClient = useQueryClient();
	const selectedOllamaModel = useAtomValue(selectedOllamaModelAtom);

	// AI commit message generation
	const generateCommitMutation = trpc.chats.generateCommitMessage.useMutation();

	// Use atomic commit when we have selected files (safer, single operation)
	const atomicCommitMutation = trpc.changes.atomicCommit.useMutation({
		onSuccess: () => {
			setSummary("");
			setDescription("");
			// Invalidate the changes.getStatus query to force a fresh fetch
			queryClient.invalidateQueries({ queryKey: [["changes", "getStatus"]] });
			onRefresh();
			onCommitSuccess?.();
		},
		onError: (error) => toast.error(`Commit failed: ${error.message}`),
	});

	// Fallback to regular commit for staged changes
	const commitMutation = trpc.changes.commit.useMutation({
		onSuccess: () => {
			setSummary("");
			setDescription("");
			queryClient.invalidateQueries({ queryKey: [["changes", "getStatus"]] });
			onRefresh();
			onCommitSuccess?.();
		},
		onError: (error) => toast.error(`Commit failed: ${error.message}`),
	});

	const isPending = commitMutation.isPending || atomicCommitMutation.isPending || isGenerating;

	// Build full commit message from summary and description
	const getCommitMessage = () => {
		const trimmedSummary = summary.trim();
		const trimmedDescription = description.trim();
		if (trimmedDescription) {
			return `${trimmedSummary}\n\n${trimmedDescription}`;
		}
		return trimmedSummary;
	};

	// Can commit if files are selected (will auto-generate message if needed)
	const canCommit = hasStagedChanges;

	const handleCommit = async () => {
		if (!canCommit) return;

		try {
			// Get commit message - generate if empty
			let commitMessage = getCommitMessage();
			console.log("[CommitInput] handleCommit called, commitMessage:", commitMessage, "chatId:", chatId);

			if (!commitMessage && chatId) {
				console.log("[CommitInput] No message, generating with AI for files:", selectedFilePaths);
				setIsGenerating(true);
				try {
					// Pass selected file paths to generate message only for those files
					const result = await generateCommitMutation.mutateAsync({
						chatId,
						filePaths: selectedFilePaths,
						ollamaModel: selectedOllamaModel,
					});
					console.log("[CommitInput] AI generated message:", result.message);
					commitMessage = result.message;
					// Also update the input field so user can see what was generated
					setSummary(result.message);
				} catch (error) {
					console.error("[CommitInput] Failed to generate message:", error);
					toast.error("Failed to generate commit message");
					setIsGenerating(false);
					return;
				}
				setIsGenerating(false);
			}

			if (!commitMessage) {
				toast.error("Please enter a commit message");
				return;
			}

			// Use atomic commit when we have selected files (single operation, safer)
			if (selectedFilePaths && selectedFilePaths.length > 0) {
				atomicCommitMutation.mutate({
					worktreePath,
					filePaths: selectedFilePaths,
					message: commitMessage,
				});
			} else {
				// Fallback to regular commit for pre-staged changes
				commitMutation.mutate({ worktreePath, message: commitMessage });
			}
		} catch (error) {
			toast.error(`Failed to prepare commit: ${error instanceof Error ? error.message : "Unknown error"}`);
		}
	};

	// Build dynamic commit label
	const getCommitLabel = () => {
		if (stagedCount && stagedCount > 0 && currentBranch) {
			return `Commit ${stagedCount} to ${currentBranch}`;
		}
		if (currentBranch) {
			return `Commit to ${currentBranch}`;
		}
		return "Commit";
	};

	const getTooltip = () => {
		if (!hasStagedChanges) return "No staged changes";
		if (!summary.trim()) return "AI will generate commit message";
		return "Commit staged changes";
	};

	return (
		<div className="flex flex-col gap-2 p-2 border-t border-border/50 bg-background">
			{/* Summary input - single line */}
			<input
				type="text"
				placeholder="Summary (required)"
				value={summary}
				onChange={(e) => setSummary(e.target.value)}
				className={cn(
					"w-full px-2 py-1.5 text-xs rounded-md",
					"bg-background border border-input",
					"placeholder:text-muted-foreground",
					"focus:outline-none focus:ring-1 focus:ring-ring"
				)}
				onKeyDown={(e) => {
					if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canCommit) {
						e.preventDefault();
						handleCommit();
					}
				}}
			/>

			{/* Description textarea - multiline */}
			<textarea
				placeholder="Description"
				value={description}
				onChange={(e) => setDescription(e.target.value)}
				className={cn(
					"w-full px-2 py-1.5 text-xs rounded-md resize-none",
					"bg-background border border-input",
					"placeholder:text-muted-foreground",
					"focus:outline-none focus:ring-1 focus:ring-ring",
					"min-h-[60px]"
				)}
				onKeyDown={(e) => {
					if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canCommit) {
						e.preventDefault();
						handleCommit();
					}
				}}
			/>

			{/* Commit button - simple, no dropdown */}
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="default"
						size="sm"
						className="w-full h-7 text-xs overflow-hidden"
						onClick={handleCommit}
						disabled={!canCommit || isPending}
					>
						{isPending ? (
							<>
								<IconSpinner className="h-3 w-3 mr-1.5 animate-spin" />
								<span className="truncate">{isGenerating ? "Generating..." : "Committing..."}</span>
							</>
						) : (
							<span className="truncate">{getCommitLabel()}</span>
						)}
					</Button>
				</TooltipTrigger>
				<TooltipContent side="top">{getTooltip()}</TooltipContent>
			</Tooltip>
		</div>
	);
}

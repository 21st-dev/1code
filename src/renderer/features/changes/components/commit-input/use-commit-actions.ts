import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { toast } from "sonner";
import { trpc } from "../../../../lib/trpc";
import { selectedOllamaModelAtom } from "../../../../lib/atoms";

interface CommitActionInput {
	message?: string;
	filePaths?: string[];
}

interface UseCommitActionsOptions {
	worktreePath?: string | null;
	chatId?: string;
	onRefresh?: () => void;
	onCommitSuccess?: () => void;
	onMessageGenerated?: (message: string) => void;
}

export function useCommitActions({
	worktreePath,
	chatId,
	onRefresh,
	onCommitSuccess,
	onMessageGenerated,
}: UseCommitActionsOptions) {
	const [isGenerating, setIsGenerating] = useState(false);
	const queryClient = useQueryClient();
	const selectedOllamaModel = useAtomValue(selectedOllamaModelAtom);

	const handleSuccess = useCallback(() => {
		queryClient.invalidateQueries({ queryKey: [["changes", "getStatus"]] });
		onRefresh?.();
		onCommitSuccess?.();
	}, [queryClient, onRefresh, onCommitSuccess]);

	const handleError = useCallback((error: { message?: string }) => {
		toast.error(`Commit failed: ${error.message ?? "Unknown error"}`);
	}, []);

	// AI commit message generation
	const generateCommitMutation = trpc.chats.generateCommitMessage.useMutation();

	// Use atomic commit when we have selected files (safer, single operation)
	const atomicCommitMutation = trpc.changes.atomicCommit.useMutation();

	// Fallback to regular commit for staged changes
	const commitMutation = trpc.changes.commit.useMutation();

	const commit = useCallback(
		async ({ message, filePaths }: CommitActionInput): Promise<boolean> => {
			if (!worktreePath) {
				toast.error("Worktree path is required");
				return false;
			}

			let commitMessage = message?.trim() ?? "";
			console.log("[CommitActions] commit called, commitMessage:", commitMessage, "chatId:", chatId);

			if (!commitMessage && chatId) {
				console.log("[CommitActions] No message, generating with AI for files:", filePaths);
				setIsGenerating(true);
				try {
					const result = await generateCommitMutation.mutateAsync({
						chatId,
						filePaths,
						ollamaModel: selectedOllamaModel,
					});
					console.log("[CommitActions] AI generated message:", result.message);
					commitMessage = result.message;
					onMessageGenerated?.(result.message);
				} catch (error) {
					console.error("[CommitActions] Failed to generate message:", error);
					toast.error("Failed to generate commit message");
					return false;
				} finally {
					setIsGenerating(false);
				}
			}

			if (!commitMessage) {
				toast.error("Please enter a commit message");
				return false;
			}

			try {
				if (filePaths && filePaths.length > 0) {
					await atomicCommitMutation.mutateAsync({
						worktreePath,
						filePaths,
						message: commitMessage,
					});
				} else {
					await commitMutation.mutateAsync({ worktreePath, message: commitMessage });
				}
				handleSuccess();
				return true;
			} catch (error) {
				handleError(error as { message?: string });
				return false;
			}
		},
		[
			worktreePath,
			chatId,
			generateCommitMutation,
			selectedOllamaModel,
			onMessageGenerated,
			atomicCommitMutation,
			commitMutation,
			handleSuccess,
			handleError,
		],
	);

	const isPending = isGenerating || atomicCommitMutation.isPending || commitMutation.isPending;

	return { commit, isPending, isGenerating };
}

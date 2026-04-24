import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "../../../lib/trpc";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogBody,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "../../../components/ui/alert-dialog";

interface PullPushDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	worktreePath: string | null | undefined;
	setUpstream: boolean;
	onSuccess?: () => void;
}

export function PullPushDialog({
	open,
	onOpenChange,
	worktreePath,
	setUpstream,
	onSuccess,
}: PullPushDialogProps) {
	const [isWorking, setIsWorking] = useState(false);
	const pullMutation = trpc.changes.pull.useMutation();
	const pushMutation = trpc.changes.push.useMutation();

	const handlePullAndPush = async () => {
		if (!worktreePath) return;
		setIsWorking(true);
		try {
			await pullMutation.mutateAsync({ worktreePath, autoStash: true });
			await pushMutation.mutateAsync({ worktreePath, setUpstream });
			onSuccess?.();
			onOpenChange(false);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			toast.error(`Pull & push failed: ${message}`);
		} finally {
			setIsWorking(false);
		}
	};

	return (
		<AlertDialog open={open} onOpenChange={isWorking ? undefined : onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Remote has new commits</AlertDialogTitle>
					<AlertDialogDescription className="mt-2">
						Your push was rejected because the remote branch has commits you
						don't have locally.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogBody>
					<p className="text-sm text-muted-foreground">
						Pull with rebase and push in one step. Any uncommitted changes will
						be auto-stashed and restored.
					</p>
				</AlertDialogBody>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={isWorking}>Cancel</AlertDialogCancel>
					<AlertDialogAction
						onClick={(e) => {
							e.preventDefault();
							void handlePullAndPush();
						}}
						disabled={isWorking || !worktreePath}
					>
						{isWorking ? "Working…" : "Pull & Push"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

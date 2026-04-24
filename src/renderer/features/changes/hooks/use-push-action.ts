import { createElement, useCallback, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { trpc } from "../../../lib/trpc";
import { PullPushDialog } from "../components/pull-push-dialog";

const REMOTE_AHEAD_MARKER = "REMOTE_AHEAD:";

interface UsePushActionOptions {
	worktreePath?: string | null;
	hasUpstream?: boolean;
	onSuccess?: () => void;
}

export function usePushAction({
	worktreePath,
	hasUpstream = true,
	onSuccess,
}: UsePushActionOptions) {
	const [dialogOpen, setDialogOpen] = useState(false);

	const pushMutation = trpc.changes.push.useMutation({
		onSuccess: () => {
			onSuccess?.();
		},
		onError: (error) => {
			if (error.message.startsWith(REMOTE_AHEAD_MARKER)) {
				setDialogOpen(true);
				return;
			}
			toast.error(`Push failed: ${error.message}`);
		},
	});

	const push = useCallback(() => {
		if (!worktreePath) {
			toast.error("Worktree path is required");
			return;
		}
		pushMutation.mutate({ worktreePath, setUpstream: !hasUpstream });
	}, [worktreePath, hasUpstream, pushMutation]);

	const dialog: ReactNode = createElement(PullPushDialog, {
		open: dialogOpen,
		onOpenChange: setDialogOpen,
		worktreePath,
		setUpstream: !hasUpstream,
		onSuccess,
	});

	return { push, isPending: pushMutation.isPending, dialog };
}

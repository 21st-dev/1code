import { useCallback } from "react";
import { toast } from "sonner";
import { trpc } from "../../../lib/trpc";
import { useI18n } from "../../../lib/i18n";

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
	const { t } = useI18n();
	const pushMutation = trpc.changes.push.useMutation({
		onSuccess: () => {
			onSuccess?.();
		},
		onError: (error) => toast.error(t("changes.toast.pushFailed", { message: error.message })),
	});

	const push = useCallback(() => {
		if (!worktreePath) {
			toast.error(t("changes.toast.worktreePathRequired"));
			return;
		}
		pushMutation.mutate({ worktreePath, setUpstream: !hasUpstream });
	}, [worktreePath, hasUpstream, pushMutation, t]);

	return { push, isPending: pushMutation.isPending };
}

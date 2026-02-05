export type SyncActionKind = "loading" | "publish" | "pull" | "push" | "none";

interface SyncActionInput {
	hasUpstream?: boolean;
	pullCount?: number;
	pushCount?: number;
	isSyncStatusLoading?: boolean;
}

export function getSyncActionKind({
	hasUpstream = true,
	pullCount = 0,
	pushCount = 0,
	isSyncStatusLoading = false,
}: SyncActionInput): SyncActionKind {
	if (isSyncStatusLoading) return "loading";
	if (!hasUpstream) return "publish";
	if (pullCount > 0) return "pull";
	if (pushCount > 0) return "push";
	return "none";
}

/**
 * Check if the error message indicates the upstream branch is missing/deleted
 */
export function isUpstreamMissingError(message: string): boolean {
	return (
		message.includes("no such ref was fetched") ||
		message.includes("no tracking information") ||
		message.includes("couldn't find remote ref")
	);
}

export function isNonFastForwardPushError(message: string): boolean {
	return (
		message.includes("[rejected]") ||
		message.includes("non-fast-forward") ||
		message.includes("fetch first") ||
		message.includes("Updates were rejected")
	);
}

export const REMOTE_AHEAD_ERROR_PREFIX = "REMOTE_AHEAD:";

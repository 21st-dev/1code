import { execWithShellEnv } from "./shell-env"

let setupAttempted = false

/**
 * Configures git to use GitHub CLI for authentication.
 * Runs `gh auth setup-git` which sets up the git credential helper.
 * Safe to call multiple times - will skip if already attempted this session.
 */
export async function initGhAuth(): Promise<void> {
	if (setupAttempted) return
	setupAttempted = true

	try {
		// First check if gh is authenticated
		await execWithShellEnv("gh", ["auth", "status"], { timeout: 5000 })

		// Configure git to use gh for authentication
		await execWithShellEnv("gh", ["auth", "setup-git"], { timeout: 5000 })
		console.log("[GhAuth] Git configured to use GitHub CLI for authentication")
	} catch (error) {
		// Non-fatal - gh CLI may not be installed or authenticated
		const message = error instanceof Error ? error.message : String(error)
		if (message.includes("ENOENT")) {
			console.log("[GhAuth] gh CLI not installed, skipping auth setup")
		} else if (message.includes("not logged in")) {
			console.log("[GhAuth] gh CLI not authenticated, skipping auth setup")
		} else {
			console.warn("[GhAuth] Failed to setup git auth:", message)
		}
	}
}

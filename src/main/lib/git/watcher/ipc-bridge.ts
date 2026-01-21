import { ipcMain, BrowserWindow } from "electron";
import { gitWatcherRegistry, type GitWatchEvent } from "./git-watcher";
import { gitCache } from "../cache";

/**
 * IPC Bridge for GitWatcher.
 * Handles subscription/unsubscription from renderer and forwards file change events.
 */

// Track active subscriptions per worktree
const activeSubscriptions: Map<string, () => void> = new Map();

/**
 * Register IPC handlers for git watcher.
 * Call this once during app initialization.
 */
export function registerGitWatcherIPC(
	getWindow: () => BrowserWindow | null,
): void {
	// Handle subscription requests from renderer
	ipcMain.handle(
		"git:subscribe-watcher",
		async (_event, worktreePath: string) => {
			if (!worktreePath) return;

			// Already subscribed?
			if (activeSubscriptions.has(worktreePath)) {
				return;
			}

			// Subscribe to file changes (await to ensure watcher is ready)
			const unsubscribe = await gitWatcherRegistry.subscribe(
				worktreePath,
				(event: GitWatchEvent) => {
					const win = getWindow();
					if (!win || win.isDestroyed()) return;

					// We're watching .git/index and .git/HEAD, so any event means a git operation occurred.
					// Invalidate status and parsedDiff caches - these are always affected by git operations.
					// File content cache is content-addressed and will update on next request if hash changed.
					gitCache.invalidateStatus(worktreePath);
					gitCache.invalidateParsedDiff(worktreePath);

					// Send event to renderer
					win.webContents.send("git:status-changed", {
						worktreePath: event.worktreePath,
						changes: event.changes,
					});
				},
			);

			activeSubscriptions.set(worktreePath, unsubscribe);
			console.log(
				`[GitWatcher] Subscribed to: ${worktreePath}`,
			);
		},
	);

	// Handle unsubscription requests from renderer
	ipcMain.handle(
		"git:unsubscribe-watcher",
		async (_event, worktreePath: string) => {
			if (!worktreePath) return;

			const unsubscribe = activeSubscriptions.get(worktreePath);
			if (unsubscribe) {
				unsubscribe();
				activeSubscriptions.delete(worktreePath);
				console.log(
					`[GitWatcher] Unsubscribed from: ${worktreePath}`,
				);
			}
		},
	);
}

/**
 * Cleanup all watchers.
 * Call this when the app is shutting down.
 */
export async function cleanupGitWatchers(): Promise<void> {
	// Unsubscribe all
	const unsubscribers = Array.from(activeSubscriptions.values());
	for (const unsubscribe of unsubscribers) {
		unsubscribe();
	}
	activeSubscriptions.clear();

	// Dispose all watchers
	await gitWatcherRegistry.disposeAll();
	console.log("[GitWatcher] All watchers cleaned up");
}

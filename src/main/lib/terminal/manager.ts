import { EventEmitter } from "node:events"
import { FALLBACK_SHELL, SHELL_CRASH_THRESHOLD_MS } from "./env"
import { portManager } from "./port-manager"
import { getProcessTree } from "./port-scanner"
import { createSession, setupInitialCommands } from "./session"
import type {
	CreateSessionParams,
	SessionResult,
	TerminalSession,
} from "./types"

export class TerminalManager extends EventEmitter {
	private sessions = new Map<string, TerminalSession>()
	private pendingSessions = new Map<string, Promise<SessionResult>>()

	async createOrAttach(params: CreateSessionParams): Promise<SessionResult> {
		const { paneId, cols, rows } = params

		// Deduplicate concurrent calls (prevents race in React Strict Mode)
		const pending = this.pendingSessions.get(paneId)
		if (pending) {
			return pending
		}

		// Return existing session if alive
		const existing = this.sessions.get(paneId)
		if (existing?.isAlive) {
			existing.lastActive = Date.now()
			if (cols !== undefined && rows !== undefined) {
				this.resize({ paneId, cols, rows })
			}
			return {
				isNew: false,
				serializedState: existing.serializedState || "",
			}
		}

		// Create new session
		const creationPromise = this.doCreateSession(params)
		this.pendingSessions.set(paneId, creationPromise)

		try {
			return await creationPromise
		} finally {
			this.pendingSessions.delete(paneId)
		}
	}

	private async doCreateSession(
		params: CreateSessionParams & { useFallbackShell?: boolean },
	): Promise<SessionResult> {
		const { paneId, workspaceId, initialCommands } = params

		// Create the session
		const session = await createSession(params, (id, data) => {
			this.emit(`data:${id}`, data)
		})

		// Set up initial commands (only for new sessions)
		setupInitialCommands(session, initialCommands)

		// Set up exit handler with fallback logic
		this.setupExitHandler(session, params)

		this.sessions.set(paneId, session)

		portManager.registerSession(session, workspaceId || "")

		// Emit started event so subscribers know a session was created
		this.emit(`started:${paneId}`, session.cwd)

		return {
			isNew: true,
			serializedState: "",
		}
	}

	private setupExitHandler(
		session: TerminalSession,
		params: CreateSessionParams & { useFallbackShell?: boolean },
	): void {
		const { paneId } = params

		session.pty.onExit(async ({ exitCode, signal }) => {
			session.isAlive = false

			// Check if shell crashed quickly - try fallback
			const sessionDuration = Date.now() - session.startTime
			const crashedQuickly =
				sessionDuration < SHELL_CRASH_THRESHOLD_MS && exitCode !== 0

			if (crashedQuickly && !session.usedFallback) {
				console.warn(
					`[TerminalManager] Shell "${session.shell}" exited with code ${exitCode} after ${sessionDuration}ms, retrying with fallback shell "${FALLBACK_SHELL}"`,
				)

				this.sessions.delete(paneId)

				try {
					await this.doCreateSession({
						...params,
						useFallbackShell: true,
					})
					return // Recovered - don't emit exit
				} catch (fallbackError) {
					console.error(
						"[TerminalManager] Fallback shell also failed:",
						fallbackError,
					)
				}
			}

			// Unregister from port manager (also removes detected ports)
			portManager.unregisterSession(paneId)

			this.emit(`exit:${paneId}`, exitCode, signal)

			// Clean up session after short delay (allows late exit event handlers to fire)
			const timeout = setTimeout(() => {
				this.sessions.delete(paneId)
			}, 500)
			timeout.unref()
		})
	}

	write(params: { paneId: string; data: string }): void {
		const { paneId, data } = params
		const session = this.sessions.get(paneId)

		if (!session || !session.isAlive) {
			throw new Error(`Terminal session ${paneId} not found or not alive`)
		}

		session.pty.write(data)
		session.lastActive = Date.now()
	}

	resize(params: { paneId: string; cols: number; rows: number }): void {
		const { paneId, cols, rows } = params

		// Validate geometry: cols and rows must be positive integers
		if (
			!Number.isInteger(cols) ||
			!Number.isInteger(rows) ||
			cols <= 0 ||
			rows <= 0
		) {
			console.warn(
				`[TerminalManager] Invalid resize geometry for ${paneId}: cols=${cols}, rows=${rows}. Must be positive integers.`,
			)
			return
		}

		const session = this.sessions.get(paneId)

		if (!session || !session.isAlive) {
			console.warn(
				`Cannot resize terminal ${paneId}: session not found or not alive`,
			)
			return
		}

		try {
			session.pty.resize(cols, rows)
			session.cols = cols
			session.rows = rows
			session.lastActive = Date.now()
		} catch (error) {
			console.error(
				`[TerminalManager] Failed to resize terminal ${paneId} (cols=${cols}, rows=${rows}):`,
				error,
			)
		}
	}

	/**
	 * Kill all processes in a process tree (shell + all child processes like bun, node, webpack, etc.)
	 * This prevents orphaned child processes from consuming memory after the shell exits.
	 */
	private async killProcessTree(pid: number, signal: NodeJS.Signals = "SIGTERM"): Promise<void> {
		try {
			const pids = await getProcessTree(pid)
			// Kill in reverse order (children first, then parent) for cleaner shutdown
			for (const childPid of pids.reverse()) {
				try {
					process.kill(childPid, signal)
				} catch {
					// Process may have already exited
				}
			}
		} catch {
			// getProcessTree may fail if process already exited
		}
	}

	async signal(params: { paneId: string; signal?: string }): Promise<void> {
		const { paneId, signal = "SIGTERM" } = params
		const session = this.sessions.get(paneId)

		if (!session || !session.isAlive) {
			console.warn(
				`Cannot signal terminal ${paneId}: session not found or not alive`,
			)
			return
		}

		// Kill entire process tree, not just the shell
		const ptyPid = session.pty.pid
		if (ptyPid) {
			await this.killProcessTree(ptyPid, signal as NodeJS.Signals)
		}
		session.pty.kill(signal)
		session.lastActive = Date.now()
	}

	async kill(params: { paneId: string }): Promise<void> {
		const { paneId } = params
		const session = this.sessions.get(paneId)

		if (!session) {
			console.warn(`Cannot kill terminal ${paneId}: session not found`)
			return
		}

		if (!session.isAlive) {
			this.sessions.delete(paneId)
			return
		}

		const ptyPid = session.pty.pid

		// Send SIGTERM to entire process tree first
		try {
			if (ptyPid) {
				await this.killProcessTree(ptyPid, "SIGTERM")
			}
			session.pty.kill("SIGTERM")
		} catch (error) {
			console.error(`[TerminalManager] Failed to send SIGTERM to ${paneId}:`, error)
		}

		// Wait for graceful shutdown, then escalate to SIGKILL
		await new Promise<void>((resolve) => {
			const checkInterval = setInterval(() => {
				if (!session.isAlive) {
					clearInterval(checkInterval)
					clearTimeout(forceKillTimeout)
					resolve()
				}
			}, 100)

			const forceKillTimeout = setTimeout(async () => {
				clearInterval(checkInterval)
				if (session.isAlive) {
					try {
						// SIGKILL entire process tree
						if (ptyPid) {
							await this.killProcessTree(ptyPid, "SIGKILL")
						}
						session.pty.kill("SIGKILL")
					} catch (error) {
						console.error(`[TerminalManager] Failed to send SIGKILL to ${paneId}:`, error)
					}
				}
				// Give SIGKILL a moment to take effect
				setTimeout(resolve, 100)
			}, 2000)
		})
	}

	detach(params: { paneId: string; serializedState?: string }): void {
		const { paneId, serializedState } = params
		const session = this.sessions.get(paneId)

		if (!session) {
			console.warn(`Cannot detach terminal ${paneId}: session not found`)
			return
		}

		if (serializedState) {
			session.serializedState = serializedState
		}
		session.lastActive = Date.now()
	}

	clearScrollback(params: { paneId: string }): void {
		const { paneId } = params
		const session = this.sessions.get(paneId)

		if (!session) {
			console.warn(
				`Cannot clear scrollback for terminal ${paneId}: session not found`,
			)
			return
		}

		session.serializedState = ""
		session.lastActive = Date.now()
	}

	getSession(
		paneId: string,
	): { isAlive: boolean; cwd: string; lastActive: number } | null {
		const session = this.sessions.get(paneId)
		if (!session) {
			return null
		}

		return {
			isAlive: session.isAlive,
			cwd: session.cwd,
			lastActive: session.lastActive,
		}
	}

	async killByWorkspaceId(
		workspaceId: string,
	): Promise<{ killed: number; failed: number }> {
		const sessionsToKill = Array.from(this.sessions.entries()).filter(
			([, session]) => session.workspaceId === workspaceId,
		)

		if (sessionsToKill.length === 0) {
			return { killed: 0, failed: 0 }
		}

		const results = await Promise.all(
			sessionsToKill.map(([paneId, session]) =>
				this.killSessionWithTimeout(paneId, session),
			),
		)

		const killed = results.filter(Boolean).length
		return { killed, failed: results.length - killed }
	}

	private async killSessionWithTimeout(
		paneId: string,
		session: TerminalSession,
	): Promise<boolean> {
		if (!session.isAlive) {
			this.sessions.delete(paneId)
			return true
		}

		return new Promise<boolean>((resolve) => {
			let resolved = false
			let sigtermTimeout: ReturnType<typeof setTimeout> | undefined
			let sigkillTimeout: ReturnType<typeof setTimeout> | undefined

			const cleanup = (success: boolean) => {
				if (resolved) return
				resolved = true
				this.off(`exit:${paneId}`, exitHandler)
				if (sigtermTimeout) clearTimeout(sigtermTimeout)
				if (sigkillTimeout) clearTimeout(sigkillTimeout)
				resolve(success)
			}

			const exitHandler = () => cleanup(true)
			this.once(`exit:${paneId}`, exitHandler)

			// Escalate to SIGKILL after 2s
			sigtermTimeout = setTimeout(() => {
				if (resolved || !session.isAlive) return

				try {
					session.pty.kill("SIGKILL")
				} catch (error) {
					console.error(`Failed to send SIGKILL to terminal ${paneId}:`, error)
				}

				// Force cleanup after another 500ms
				sigkillTimeout = setTimeout(() => {
					if (resolved) return
					if (session.isAlive) {
						console.error(
							`Terminal ${paneId} did not exit after SIGKILL, forcing cleanup`,
						)
						session.isAlive = false
						this.sessions.delete(paneId)
					}
					cleanup(false)
				}, 500)
				sigkillTimeout.unref()
			}, 2000)
			sigtermTimeout.unref()

			// Send SIGTERM
			try {
				session.pty.kill()
			} catch (error) {
				console.error(`Failed to send SIGTERM to terminal ${paneId}:`, error)
				session.isAlive = false
				this.sessions.delete(paneId)
				cleanup(false)
			}
		})
	}

	getSessionCountByWorkspaceId(workspaceId: string): number {
		return Array.from(this.sessions.values()).filter(
			(session) => session.workspaceId === workspaceId && session.isAlive,
		).length
	}

	/**
	 * Send a newline to all terminals in a workspace to refresh their prompts.
	 * Useful after switching branches to update the branch name in prompts.
	 */
	refreshPromptsForWorkspace(workspaceId: string): void {
		for (const [paneId, session] of this.sessions.entries()) {
			if (session.workspaceId === workspaceId && session.isAlive) {
				try {
					session.pty.write("\n")
				} catch (error) {
					console.warn(
						`[TerminalManager] Failed to refresh prompt for pane ${paneId}:`,
						error,
					)
				}
			}
		}
	}

	detachAllListeners(): void {
		for (const event of this.eventNames()) {
			const name = String(event)
			if (name.startsWith("data:") || name.startsWith("exit:")) {
				this.removeAllListeners(event)
			}
		}
	}

	async cleanup(): Promise<void> {
		console.log(`[TerminalManager] Cleanup: killing ${this.sessions.size} sessions`)
		const exitPromises: Promise<void>[] = []

		for (const [paneId, session] of this.sessions.entries()) {
			if (session.isAlive) {
				const ptyPid = session.pty.pid
				const exitPromise = new Promise<void>(async (resolve) => {
					let timeoutId: ReturnType<typeof setTimeout> | undefined
					const exitHandler = () => {
						this.off(`exit:${paneId}`, exitHandler)
						if (timeoutId !== undefined) {
							clearTimeout(timeoutId)
						}
						resolve()
					}
					this.once(`exit:${paneId}`, exitHandler)

					// Kill entire process tree (not just shell) to prevent orphan processes
					if (ptyPid) {
						await this.killProcessTree(ptyPid, "SIGTERM")
					}
					session.pty.kill()

					timeoutId = setTimeout(async () => {
						this.off(`exit:${paneId}`, exitHandler)
						// Force kill if still alive after timeout
						if (session.isAlive && ptyPid) {
							await this.killProcessTree(ptyPid, "SIGKILL")
						}
						resolve()
					}, 2000)
					timeoutId.unref()
				})

				exitPromises.push(exitPromise)
			}
		}

		await Promise.all(exitPromises)
		this.sessions.clear()
		this.removeAllListeners()
		console.log("[TerminalManager] Cleanup complete")
	}
}

/** Singleton terminal manager instance */
export const terminalManager = new TerminalManager()

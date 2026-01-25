import fs from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { router, publicProcedure } from "../index"
import { observable } from "@trpc/server/observable"
import { terminalManager } from "../../terminal/manager"
import { portManager, type PortSubscriptionMode } from "../../terminal/port-manager"
import type { TerminalEvent, DetectedPort } from "../../terminal/types"
import { TRPCError } from "@trpc/server"

export const terminalRouter = router({
	/**
	 * Create or attach to an existing terminal session.
	 * Returns serializedState for recovery if reattaching.
	 */
	createOrAttach: publicProcedure
		.input(
			z.object({
				paneId: z.string().min(1),
				tabId: z.string().optional(),
				workspaceId: z.string().optional(),
				cols: z.number().int().positive().optional(),
				rows: z.number().int().positive().optional(),
				cwd: z.string().optional(),
				initialCommands: z.array(z.string()).optional(),
			}),
		)
		.mutation(async ({ input }) => {
			try {
				const result = await terminalManager.createOrAttach(input)
				return {
					paneId: input.paneId,
					isNew: result.isNew,
					serializedState: result.serializedState,
				}
			} catch (err) {
				console.error("[TerminalRouter] createOrAttach error:", err)
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message:
						err instanceof Error ? err.message : "Failed to create terminal",
				})
			}
		}),

	write: publicProcedure
		.input(
			z.object({
				paneId: z.string().min(1),
				data: z.string(),
			}),
		)
		.mutation(({ input }) => {
			terminalManager.write(input)
		}),

	resize: publicProcedure
		.input(
			z.object({
				paneId: z.string().min(1),
				cols: z.number().int().positive(),
				rows: z.number().int().positive(),
			}),
		)
		.mutation(({ input }) => {
			terminalManager.resize(input)
		}),

	/**
	 * Send a signal to the terminal process.
	 */
	signal: publicProcedure
		.input(
			z.object({
				paneId: z.string().min(1),
				signal: z.string().optional(),
			}),
		)
		.mutation(({ input }) => {
			terminalManager.signal(input)
		}),

	/**
	 * Kill terminal session - actually terminate it.
	 */
	kill: publicProcedure
		.input(
			z.object({
				paneId: z.string().min(1),
			}),
		)
		.mutation(async ({ input }) => {
			await terminalManager.kill(input)
		}),

	/**
	 * Detach from terminal - keep session alive.
	 * Called on component unmount. Stores serialized state for recovery.
	 */
	detach: publicProcedure
		.input(
			z.object({
				paneId: z.string().min(1),
				serializedState: z.string().optional(),
			}),
		)
		.mutation(({ input }) => {
			terminalManager.detach(input)
		}),

	/**
	 * Clear scrollback buffer for terminal (used by Cmd+K / clear command)
	 */
	clearScrollback: publicProcedure
		.input(z.object({ paneId: z.string().min(1) }))
		.mutation(({ input }) => {
			terminalManager.clearScrollback(input)
		}),

	getSession: publicProcedure
		.input(z.string().min(1))
		.query(({ input: paneId }) => {
			return terminalManager.getSession(paneId)
		}),

	/**
	 * Get count of active terminal sessions for a workspace
	 */
	getActiveSessionCount: publicProcedure
		.input(z.object({ workspaceId: z.string() }))
		.query(({ input }) => {
			return terminalManager.getSessionCountByWorkspaceId(input.workspaceId)
		}),

	/**
	 * Get workspace cwd for terminal initialization
	 */
	getWorkspaceCwd: publicProcedure.input(z.string()).query(({ input }) => {
		// For now, just return null - the workspace path comes from the chat/project
		// In the future this could look up the workspace's root directory
		return null
	}),

	/**
	 * List directory contents for navigation
	 */
	listDirectory: publicProcedure
		.input(z.object({ dirPath: z.string() }))
		.query(async ({ input }) => {
			const { dirPath } = input

			try {
				const entries = await fs.readdir(dirPath, { withFileTypes: true })

				const items = entries
					.filter((entry) => !entry.name.startsWith("."))
					.map((entry) => ({
						name: entry.name,
						path: path.join(dirPath, entry.name),
						isDirectory: entry.isDirectory(),
					}))
					.sort((a, b) => {
						// Directories first, then alphabetical
						if (a.isDirectory && !b.isDirectory) return -1
						if (!a.isDirectory && b.isDirectory) return 1
						return a.name.localeCompare(b.name)
					})

				// Get parent directory
				const parentPath = path.dirname(dirPath)
				const hasParent = parentPath !== dirPath

				return {
					currentPath: dirPath,
					parentPath: hasParent ? parentPath : null,
					items,
				}
			} catch {
				return {
					currentPath: dirPath,
					parentPath: null,
					items: [],
					error: "Unable to read directory",
				}
			}
		}),

	stream: publicProcedure
		.input(z.string().min(1))
		.subscription(({ input: paneId }) => {
			return observable<TerminalEvent>((emit) => {
				const onStarted = (cwd: string) => {
					emit.next({ type: "started", cwd })
				}

				const onData = (data: string) => {
					emit.next({ type: "data", data })
				}

				const onExit = (exitCode: number, signal?: number) => {
					emit.next({ type: "exit", exitCode, signal })
				}

				terminalManager.on(`started:${paneId}`, onStarted)
				terminalManager.on(`data:${paneId}`, onData)
				terminalManager.on(`exit:${paneId}`, onExit)

				return () => {
					terminalManager.off(`started:${paneId}`, onStarted)
					terminalManager.off(`data:${paneId}`, onData)
					terminalManager.off(`exit:${paneId}`, onExit)
				}
			})
		}),

	// ===== Port Management =====

	/**
	 * Get all detected ports across all terminal sessions
	 */
	getAllPorts: publicProcedure.query(() => {
		return portManager.getAllPorts()
	}),

	/**
	 * Get ports for a specific workspace
	 */
	getPortsByWorkspace: publicProcedure
		.input(z.object({ workspaceId: z.string() }))
		.query(({ input }) => {
			return portManager.getPortsByWorkspace(input.workspaceId)
		}),

	/**
	 * Kill a process by PID (sends SIGTERM, then SIGKILL after timeout)
	 */
	killProcessByPid: publicProcedure
		.input(z.object({ pid: z.number() }))
		.mutation(async ({ input }) => {
			try {
				process.kill(input.pid, "SIGTERM")
				// Give it 2 seconds to terminate gracefully, then force kill
				await new Promise((resolve) => setTimeout(resolve, 2000))
				try {
					// Check if process is still running
					process.kill(input.pid, 0)
					// Still running, force kill
					process.kill(input.pid, "SIGKILL")
				} catch {
					// Process already exited, which is good
				}
				return { success: true }
			} catch (err) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message:
						err instanceof Error ? err.message : "Failed to kill process",
				})
			}
		}),

	/**
	 * Subscribe to port changes (add/remove events)
	 * Uses demand-based scanning - scanning only runs when there are subscribers
	 * @param mode - "active" for fast scanning (popover open), "background" for slow scanning (badge only)
	 */
	portChanges: publicProcedure
		.input(
			z
				.object({
					mode: z.enum(["active", "background"]).default("background"),
				})
				.optional(),
		)
		.subscription(({ input }) => {
			const mode: PortSubscriptionMode = input?.mode ?? "background"

			return observable<{ type: "add" | "remove"; port: DetectedPort }>(
				(emit) => {
					// Subscribe to port manager - this starts scanning if needed
					const subscriberId = portManager.subscribe(mode)

					const onPortAdd = (port: DetectedPort) => {
						emit.next({ type: "add", port })
					}

					const onPortRemove = (port: DetectedPort) => {
						emit.next({ type: "remove", port })
					}

					portManager.on("port:add", onPortAdd)
					portManager.on("port:remove", onPortRemove)

					return () => {
						portManager.off("port:add", onPortAdd)
						portManager.off("port:remove", onPortRemove)
						// Unsubscribe - this stops scanning if no more subscribers
						portManager.unsubscribe(subscriberId)
					}
				},
			)
		}),

	/**
	 * Update the scanning mode for an existing subscription
	 * Called when popover opens/closes to adjust scan frequency
	 */
	setPortScanMode: publicProcedure
		.input(
			z.object({
				subscriberId: z.string(),
				mode: z.enum(["active", "background"]),
			}),
		)
		.mutation(({ input }) => {
			portManager.updateSubscriberMode(input.subscriberId, input.mode)
			return { success: true }
		}),
})

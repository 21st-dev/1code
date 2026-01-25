import { EventEmitter } from "node:events"
import type { DetectedPort } from "./types"
import {
	getListeningPortsForPids,
	getProcessTree,
	getAllListeningPorts,
} from "./port-scanner"
import type { TerminalSession } from "./types"

// Scan intervals based on subscriber type
const ACTIVE_SCAN_INTERVAL_MS = 2500 // When popover is open - need responsiveness
const BACKGROUND_SCAN_INTERVAL_MS = 10000 // For badge count only - can be slower

// Ports to ignore (common system ports that are usually not dev servers)
const IGNORED_PORTS = new Set([22, 80, 443, 5432, 3306, 6379, 27017])

// Special pane ID for ports not associated with a terminal session
const SYSTEM_PANE_ID = "__system__"

interface RegisteredSession {
	session: TerminalSession
	workspaceId: string
}

/**
 * Subscription modes for port scanning
 * - "active": User is actively viewing ports (popover open) - scan frequently
 * - "background": Just showing badge count - scan less frequently
 */
export type PortSubscriptionMode = "active" | "background"

interface Subscriber {
	id: string
	mode: PortSubscriptionMode
}

class PortManager extends EventEmitter {
	private ports = new Map<string, DetectedPort>()
	private sessions = new Map<string, RegisteredSession>()
	private scanInterval: ReturnType<typeof setInterval> | null = null
	private isScanning = false

	// Subscriber tracking for demand-based scanning
	private subscribers = new Map<string, Subscriber>()
	private subscriberIdCounter = 0

	// Cached port count for quick access without scanning
	private cachedPortCount = 0

	constructor() {
		super()
		// Don't start scanning automatically - wait for subscribers
	}

	/**
	 * Subscribe to port updates
	 * Scanning only runs when there are active subscribers
	 * Returns a subscriber ID for unsubscribing
	 */
	subscribe(mode: PortSubscriptionMode = "background"): string {
		const id = `sub_${++this.subscriberIdCounter}`
		this.subscribers.set(id, { id, mode })

		// Recalculate scan interval based on subscriber modes
		this.updateScanInterval()

		// If this is the first subscriber, run an immediate scan
		if (this.subscribers.size === 1) {
			this.scanAllSessions().catch((error) => {
				console.error("[PortManager] Initial scan error:", error)
			})
		}

		return id
	}

	/**
	 * Unsubscribe from port updates
	 */
	unsubscribe(subscriberId: string): void {
		this.subscribers.delete(subscriberId)
		this.updateScanInterval()
	}

	/**
	 * Update subscriber mode (e.g., when popover opens/closes)
	 */
	updateSubscriberMode(subscriberId: string, mode: PortSubscriptionMode): void {
		const subscriber = this.subscribers.get(subscriberId)
		if (subscriber) {
			subscriber.mode = mode
			this.updateScanInterval()
		}
	}

	/**
	 * Update the scan interval based on current subscribers
	 * If any subscriber is "active", use the fast interval
	 * If only "background" subscribers, use the slow interval
	 * If no subscribers, stop scanning entirely
	 */
	private updateScanInterval(): void {
		// Stop existing interval
		if (this.scanInterval) {
			clearInterval(this.scanInterval)
			this.scanInterval = null
		}

		// No subscribers = no scanning
		if (this.subscribers.size === 0) {
			return
		}

		// Check if any subscriber wants active (fast) scanning
		const hasActiveSubscriber = Array.from(this.subscribers.values()).some(
			(sub) => sub.mode === "active",
		)

		const intervalMs = hasActiveSubscriber
			? ACTIVE_SCAN_INTERVAL_MS
			: BACKGROUND_SCAN_INTERVAL_MS

		this.scanInterval = setInterval(() => {
			this.scanAllSessions().catch((error) => {
				console.error("[PortManager] Scan error:", error)
			})
		}, intervalMs)

		// Don't prevent Node from exiting
		this.scanInterval.unref()
	}

	/**
	 * Get cached port count without triggering a scan
	 * Useful for badge display when no active subscription
	 */
	getCachedPortCount(): number {
		return this.cachedPortCount
	}

	/**
	 * Check if there are any active subscribers
	 */
	hasSubscribers(): boolean {
		return this.subscribers.size > 0
	}

	/**
	 * Register a terminal session for port scanning
	 */
	registerSession(session: TerminalSession, workspaceId: string): void {
		this.sessions.set(session.paneId, { session, workspaceId })
	}

	/**
	 * Unregister a terminal session and remove its ports
	 */
	unregisterSession(paneId: string): void {
		this.sessions.delete(paneId)
		this.removePortsForPane(paneId)
	}

	/**
	 * Stop all scanning (for cleanup)
	 */
	stopAllScanning(): void {
		if (this.scanInterval) {
			clearInterval(this.scanInterval)
			this.scanInterval = null
		}
		this.subscribers.clear()
	}

	/**
	 * Scan all listening ports on the system
	 * Associates ports with terminal sessions when possible,
	 * otherwise marks them as system ports
	 */
	private async scanAllSessions(): Promise<void> {
		if (this.isScanning) return
		this.isScanning = true

		try {
			// Get all listening ports on the system
			const allPorts = await getAllListeningPorts()

			// Build a map of PID -> paneId for terminal sessions
			const pidToPaneMap = new Map<
				number,
				{ paneId: string; workspaceId: string }
			>()
			for (const [paneId, { session, workspaceId }] of this.sessions) {
				if (!session.isAlive) continue

				try {
					const pids = await getProcessTree(session.pty.pid)
					for (const pid of pids) {
						pidToPaneMap.set(pid, { paneId, workspaceId })
					}
				} catch {
					// Session may have exited
				}
			}

			// Group ports by pane (or system for unassociated ports)
			const panePortMap = new Map<
				string,
				{ workspaceId: string; ports: typeof allPorts }
			>()

			for (const portInfo of allPorts) {
				if (IGNORED_PORTS.has(portInfo.port)) continue

				const sessionInfo = pidToPaneMap.get(portInfo.pid)
				const paneId = sessionInfo?.paneId ?? SYSTEM_PANE_ID
				const workspaceId = sessionInfo?.workspaceId ?? ""

				if (!panePortMap.has(paneId)) {
					panePortMap.set(paneId, { workspaceId, ports: [] })
				}
				panePortMap.get(paneId)!.ports.push(portInfo)
			}

			// Update ports for each pane
			for (const [paneId, { workspaceId, ports }] of panePortMap) {
				this.updatePortsForPane(paneId, workspaceId, ports)
			}

			// Remove ports for panes that no longer have any
			const activePaneIds = new Set(panePortMap.keys())
			for (const [key, port] of this.ports) {
				if (!activePaneIds.has(port.paneId)) {
					this.ports.delete(key)
					this.emit("port:remove", port)
				}
			}

			// Update cached port count
			this.cachedPortCount = this.ports.size
		} finally {
			this.isScanning = false
		}
	}

	/**
	 * Update ports for a specific pane, emitting add/remove events as needed
	 */
	private updatePortsForPane(
		paneId: string,
		workspaceId: string,
		portInfos: Array<{
			port: number
			pid: number
			address: string
			processName: string
		}>,
	): void {
		const now = Date.now()

		const validPortInfos = portInfos.filter(
			(info) => !IGNORED_PORTS.has(info.port),
		)

		const seenKeys = new Set<string>()

		for (const info of validPortInfos) {
			const key = this.makeKey(paneId, info.port)
			seenKeys.add(key)

			const existing = this.ports.get(key)
			if (!existing) {
				const detectedPort: DetectedPort = {
					port: info.port,
					pid: info.pid,
					processName: info.processName,
					paneId,
					workspaceId,
					detectedAt: now,
					address: info.address,
				}
				this.ports.set(key, detectedPort)
				this.emit("port:add", detectedPort)
			} else if (
				existing.pid !== info.pid ||
				existing.processName !== info.processName
			) {
				const updatedPort: DetectedPort = {
					...existing,
					pid: info.pid,
					processName: info.processName,
					address: info.address,
				}
				this.ports.set(key, updatedPort)
				this.emit("port:remove", existing)
				this.emit("port:add", updatedPort)
			}
		}

		for (const [key, port] of this.ports) {
			if (port.paneId === paneId && !seenKeys.has(key)) {
				this.ports.delete(key)
				this.emit("port:remove", port)
			}
		}
	}

	private makeKey(paneId: string, port: number): string {
		return `${paneId}:${port}`
	}

	/**
	 * Remove all ports for a specific pane
	 */
	removePortsForPane(paneId: string): void {
		const portsToRemove: DetectedPort[] = []

		for (const [key, port] of this.ports) {
			if (port.paneId === paneId) {
				portsToRemove.push(port)
				this.ports.delete(key)
			}
		}

		for (const port of portsToRemove) {
			this.emit("port:remove", port)
		}

		// Update cached count
		this.cachedPortCount = this.ports.size
	}

	/**
	 * Get all detected ports
	 */
	getAllPorts(): DetectedPort[] {
		return Array.from(this.ports.values()).sort(
			(a, b) => b.detectedAt - a.detectedAt,
		)
	}

	/**
	 * Get ports for a specific workspace
	 */
	getPortsByWorkspace(workspaceId: string): DetectedPort[] {
		return this.getAllPorts().filter((p) => p.workspaceId === workspaceId)
	}

	/**
	 * Force an immediate scan of all sessions
	 * Useful for testing or when you know ports have changed
	 */
	async forceScan(): Promise<void> {
		await this.scanAllSessions()
	}
}

export const portManager = new PortManager()

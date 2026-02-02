// src/main/lib/remote-access/index.ts

import {
  createSession,
  endSession,
  getSession,
  setSessionUrl,
  isSessionActive,
} from "./session"
import {
  isCloudflaredInstalled,
  downloadCloudflared,
  startTunnel,
  stopTunnel,
  isTunnelRunning,
} from "./cloudflared"
import {
  startWSServer,
  stopWSServer,
  getConnectedClientCount,
  broadcast,
} from "./ws-server"
import { BrowserWindow } from "electron"

export type RemoteAccessStatus =
  | { status: "disabled" }
  | { status: "downloading"; progress: number }
  | { status: "starting" }
  | { status: "active"; url: string; pin: string; clients: number }
  | { status: "error"; message: string }

let currentStatus: RemoteAccessStatus = { status: "disabled" }
let statusListeners: ((status: RemoteAccessStatus) => void)[] = []

/**
 * Get current status
 */
export function getRemoteAccessStatus(): RemoteAccessStatus {
  if (isSessionActive() && isTunnelRunning()) {
    const session = getSession()
    if (session?.url) {
      return {
        status: "active",
        url: session.url,
        pin: session.pin,
        clients: getConnectedClientCount(),
      }
    }
  }
  return currentStatus
}

/**
 * Set status and notify listeners
 */
function setStatus(status: RemoteAccessStatus): void {
  currentStatus = status
  for (const listener of statusListeners) {
    listener(status)
  }
  // Also notify via IPC to all windows
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("remote-access:status", status)
    }
  }
}

/**
 * Subscribe to status changes
 */
export function onStatusChange(
  listener: (status: RemoteAccessStatus) => void
): () => void {
  statusListeners.push(listener)
  return () => {
    statusListeners = statusListeners.filter((l) => l !== listener)
  }
}

/**
 * Enable remote access
 */
export async function enableRemoteAccess(): Promise<void> {
  if (isSessionActive()) {
    throw new Error("Remote access already enabled")
  }

  try {
    // Check if cloudflared is installed
    if (!isCloudflaredInstalled()) {
      setStatus({ status: "downloading", progress: 0 })
      await downloadCloudflared((progress) => {
        setStatus({ status: "downloading", progress })
      })
    }

    setStatus({ status: "starting" })

    // Create session
    const session = createSession()

    // Start WebSocket server
    const port = await startWSServer()

    // Start cloudflared tunnel
    const url = await startTunnel(port)
    setSessionUrl(url)

    setStatus({
      status: "active",
      url,
      pin: session.pin,
      clients: 0,
    })

    console.log(`[RemoteAccess] Enabled - URL: ${url}, PIN: ${session.pin}`)
  } catch (error) {
    await disableRemoteAccess()
    const message = error instanceof Error ? error.message : "Unknown error"
    setStatus({ status: "error", message })
    throw error
  }
}

/**
 * Disable remote access
 */
export async function disableRemoteAccess(): Promise<void> {
  stopTunnel()
  await stopWSServer()
  endSession()
  setStatus({ status: "disabled" })
  console.log("[RemoteAccess] Disabled")
}

/**
 * Refresh client count (called periodically or on connection change)
 */
export function refreshClientCount(): void {
  if (currentStatus.status === "active") {
    setStatus({
      ...currentStatus,
      clients: getConnectedClientCount(),
    })
  }
}

// Re-export broadcast for use by other modules
export { broadcast }

// Re-export for type checking
export type { RemoteAccessStatus as RemoteAccessState }

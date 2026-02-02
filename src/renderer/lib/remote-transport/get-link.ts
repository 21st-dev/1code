// src/renderer/lib/remote-transport/get-link.ts
// Conditional tRPC link - returns wsLink for browser, ipcLink for Electron

import { wsLink } from "./ws-link"
import superjson from "superjson"

// Cache the link to avoid re-creation
let cachedLink: any = null
let ipcLinkModule: any = null

// Dynamically import ipcLink only in Electron
// This avoids importing the module in browser where it would throw
async function loadIpcLink() {
  if (ipcLinkModule) return ipcLinkModule

  // Check if we're in Electron (electronTRPC global exists)
  // @ts-ignore
  if (typeof window !== "undefined" && window.electronTRPC) {
    try {
      // Only import if electronTRPC exists
      const { ipcLink } = await import("trpc-electron/renderer")
      ipcLinkModule = ipcLink
    } catch (error) {
      // If import fails (e.g., in web bundle), fall back to null
      console.warn("[get-link] Failed to load ipcLink, using wsLink fallback:", error)
    }
  }

  return ipcLinkModule
}

/**
 * Get the appropriate tRPC link based on environment
 * - Browser (remote mode): WebSocket link
 * - Electron: IPC link
 *
 * Note: Uses dynamic import to avoid loading trpc-electron in browser
 */
export async function getLink() {
  if (cachedLink) return cachedLink

  // Check if remote mode (no desktopApi means browser/remote)
  // @ts-ignore
  const isRemote = typeof window !== "undefined" && !window.desktopApi

  if (isRemote) {
    // Browser mode - always use wsLink
    cachedLink = wsLink()
  } else {
    // Electron mode - try to dynamically import ipcLink
    const ipc = await loadIpcLink()
    if (ipc) {
      cachedLink = ipc({ transformer: superjson })
    } else {
      // Fallback to wsLink if ipcLink failed to load
      console.warn("[get-link] ipcLink not available, using wsLink fallback")
      cachedLink = wsLink()
    }
  }

  return cachedLink
}

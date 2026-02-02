// src/renderer/lib/remote-transport/init.ts
// Initialize remote transport when running in browser

import { isRemoteMode, connect, createRemoteDesktopApi } from "./index"

/**
 * Initialize remote mode if running in browser without Electron
 */
export async function initRemoteTransport(): Promise<boolean> {
  if (!isRemoteMode()) {
    console.log("[RemoteTransport] Running in Electron, skipping remote init")
    return false
  }

  console.log("[RemoteTransport] Running in remote browser mode")

  // Check if we have stored auth
  const pin = sessionStorage.getItem("remote_ws_auth")
  if (!pin) {
    // Redirect to login if not on login page
    if (!window.location.pathname.includes("/login") && window.location.pathname !== "/") {
      window.location.href = "/login"
    }
    return false
  }

  try {
    // Connect to WebSocket
    await connect()

    // Create and expose remote desktopApi
    const remoteApi = createRemoteDesktopApi()
    ;(window as any).desktopApi = remoteApi

    // Also expose webUtils stub
    ;(window as any).webUtils = {
      getPathForFile: () => "",
    }

    console.log("[RemoteTransport] Remote transport initialized")
    return true
  } catch (error) {
    console.error("[RemoteTransport] Failed to initialize:", error)
    // Clear auth and redirect to login
    sessionStorage.removeItem("remote_ws_auth")
    window.location.href = "/login"
    return false
  }
}

/**
 * Check if remote mode is active
 */
export function isRemoteModeActive(): boolean {
  return isRemoteMode() && sessionStorage.getItem("remote_ws_auth") !== null
}

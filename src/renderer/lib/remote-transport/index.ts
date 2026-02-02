// src/renderer/lib/remote-transport/index.ts
// WebSocket Transport Adapter for Remote Access
// Replaces IPC calls with WebSocket when running in browser

import superjson from "superjson"

type WSMessageType = "auth" | "trpc" | "api" | "subscribe" | "unsubscribe"

interface WSRequest {
  id: string
  type: WSMessageType
  method?: string
  params?: unknown
  pin?: string
  channel?: string
}

interface WSResponse {
  id: string | null
  type: "auth_required" | "auth_success" | "auth_failed" | "result" | "error" | "subscription"
  data?: unknown
  error?: string
  channel?: string
}

type PendingRequest = {
  resolve: (data: unknown) => void
  reject: (error: Error) => void
}

let ws: WebSocket | null = null
let isAuthenticated = false
let connectionPromise: Promise<void> | null = null
const pendingRequests = new Map<string, PendingRequest>()
const subscriptionHandlers = new Map<string, Set<(data: unknown) => void>>()
let requestId = 0

// Connection state listeners
type ConnectionState = "connecting" | "connected" | "disconnected"
const connectionStateListeners = new Set<(state: ConnectionState) => void>()
let currentConnectionState: ConnectionState = "connecting"

/**
 * Notify listeners of connection state change
 */
function notifyConnectionStateChange(state: ConnectionState) {
  currentConnectionState = state
  for (const listener of connectionStateListeners) {
    try {
      listener(state)
    } catch (err) {
      console.error("[RemoteTransport] Error in connection state listener:", err)
    }
  }
}

/**
 * Subscribe to connection state changes
 * Returns unsubscribe function
 */
export function onConnectionStateChange(callback: (state: ConnectionState) => void): () => void {
  connectionStateListeners.add(callback)
  // Immediately call with current state
  try {
    callback(currentConnectionState)
  } catch (err) {
    console.error("[RemoteTransport] Error in initial connection state callback:", err)
  }
  return () => {
    connectionStateListeners.delete(callback)
  }
}

/**
 * Get current connection state
 */
export function getConnectionState(): ConnectionState {
  return currentConnectionState
}

/**
 * Check if we're running in remote browser mode
 * Robust check that works even after desktopApi is mocked
 */
export function isRemoteMode(): boolean {
  if (typeof window === "undefined") return false;

  // If we have a stored PIN, we are definitely in remote mode
  if (sessionStorage.getItem("remote_ws_auth")) return true;

  // Otherwise check if desktopApi is missing (initial load)
  return !window.desktopApi;
}

/**
 * Get stored PIN from sessionStorage
 */
function getStoredPin(): string | null {
  return sessionStorage.getItem("remote_ws_auth")
}

/**
 * Connect to WebSocket server and authenticate
 */
export function connect(): Promise<void> {
  if (connectionPromise) return connectionPromise
  if (ws?.readyState === WebSocket.OPEN && isAuthenticated) {
    return Promise.resolve()
  }

  // Notify we're connecting
  notifyConnectionStateChange("connecting")

  connectionPromise = new Promise((resolve, reject) => {
    const pin = getStoredPin()
    if (!pin) {
      // Redirect to login page
      notifyConnectionStateChange("disconnected")
      window.location.href = "/login"
      reject(new Error("No PIN stored"))
      return
    }

    const protocol = location.protocol === "https:" ? "wss:" : "ws:"
    ws = new WebSocket(`${protocol}//${location.host}`)

    ws.onopen = () => {
      // Authenticate with stored PIN
      const authRequest: WSRequest = {
        id: `auth-${Date.now()}`,
        type: "auth",
        pin,
      }
      ws!.send(JSON.stringify(authRequest))
    }

    ws.onmessage = (event) => {
      const message: WSResponse = JSON.parse(event.data)

      // Handle auth response
      if (message.type === "auth_success") {
        console.log("[RemoteTransport] Authentication successful")
        isAuthenticated = true
        notifyConnectionStateChange("connected")
        connectionPromise = null
        resolve()
        return
      }

      if (message.type === "auth_failed") {
        console.error("[RemoteTransport] Authentication failed")
        isAuthenticated = false
        notifyConnectionStateChange("disconnected")
        sessionStorage.removeItem("remote_ws_auth")
        window.location.href = "/login"
        reject(new Error("Authentication failed"))
        return
      }

      if (message.type === "auth_required") {
        console.log("[RemoteTransport] Auth required, waiting for success/fail...")
        // Don't redirect immediately, give it a chance to process the auth we just sent
        return
      }

      // Handle subscription messages
      if (message.type === "subscription" && message.channel) {
        const handlers = subscriptionHandlers.get(message.channel)
        if (handlers) {
          handlers.forEach((handler) => handler(message.data))
        }
        return
      }

      // Handle request responses
      if (message.id) {
        const pending = pendingRequests.get(message.id)
        if (pending) {
          pendingRequests.delete(message.id)
          if (message.type === "error") {
            pending.reject(new Error(message.error || "Unknown error"))
          } else {
            // Deserialize superjson data
            const data = message.data
            if (data && typeof data === "object" && "json" in data) {
              pending.resolve(superjson.deserialize(data as any))
            } else {
              pending.resolve(data)
            }
          }
        }
      }
    }

    ws.onerror = (error) => {
      console.error("[RemoteTransport] WebSocket error:", error)
      notifyConnectionStateChange("disconnected")
      connectionPromise = null
      reject(new Error("WebSocket connection failed"))
    }

    ws.onclose = () => {
      console.log("[RemoteTransport] WebSocket closed")
      ws = null
      isAuthenticated = false
      connectionPromise = null
      notifyConnectionStateChange("disconnected")
    }
  })

  return connectionPromise
}

/**
 * Send a request and wait for response
 */
async function sendRequest(type: WSMessageType, method?: string, params?: unknown): Promise<unknown> {
  await connect()

  return new Promise((resolve, reject) => {
    const id = `req-${++requestId}-${Date.now()}`
    const request: WSRequest = { id, type, method, params }

    pendingRequests.set(id, { resolve, reject })

    // Timeout after 30 seconds
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id)
        reject(new Error("Request timeout"))
      }
    }, 30000)

    ws!.send(JSON.stringify(request))
  })
}

/**
 * Call a tRPC procedure
 */
export async function trpcCall(method: string, params?: unknown): Promise<unknown> {
  return sendRequest("trpc", method, params)
}

/**
 * Subscribe to a channel
 */
export async function subscribe(channel: string, handler: (data: unknown) => void): Promise<() => void> {
  await connect()

  // Register handler
  if (!subscriptionHandlers.has(channel)) {
    subscriptionHandlers.set(channel, new Set())
    // Send subscribe request
    await sendRequest("subscribe", undefined, undefined)
    const id = `sub-${++requestId}`
    const request: WSRequest = { id, type: "subscribe", channel }
    ws!.send(JSON.stringify(request))
  }
  subscriptionHandlers.get(channel)!.add(handler)

  // Return unsubscribe function
  return () => {
    const handlers = subscriptionHandlers.get(channel)
    if (handlers) {
      handlers.delete(handler)
      if (handlers.size === 0) {
        subscriptionHandlers.delete(channel)
        // Send unsubscribe request
        if (ws?.readyState === WebSocket.OPEN) {
          const id = `unsub-${++requestId}`
          const request: WSRequest = { id, type: "unsubscribe", channel }
          ws.send(JSON.stringify(request))
        }
      }
    }
  }
}

/**
 * Disconnect from server
 */
export function disconnect(): void {
  if (ws) {
    ws.close()
    ws = null
  }
  isAuthenticated = false
  pendingRequests.clear()
  subscriptionHandlers.clear()
}

/**
 * Create a remote desktopApi that bridges to WebSocket
 */
export function createRemoteDesktopApi(): Partial<typeof window.desktopApi> {
  return {
    platform: "darwin" as NodeJS.Platform, // Will be overridden by server
    arch: "arm64",

    // These will use tRPC calls over WebSocket
    getVersion: async () => {
      const result = await trpcCall("external.getAppVersion")
      return result as string
    },

    isPackaged: async () => true,

    // Window controls - no-op in browser
    windowMinimize: async () => {},
    windowMaximize: async () => {},
    windowClose: async () => { window.close() },
    windowIsMaximized: async () => false,
    windowToggleFullscreen: async () => {},
    windowIsFullscreen: async () => false,
    setTrafficLightVisibility: async () => {},

    // Clipboard
    clipboardWrite: async (text: string) => {
      await navigator.clipboard.writeText(text)
    },
    clipboardRead: async () => {
      return navigator.clipboard.readText()
    },

    // Open external links
    openExternal: async (url: string) => {
      window.open(url, "_blank")
    },

    // Remote access - return disabled status (we're already remote)
    getRemoteAccessStatus: async () => ({ status: "disabled" as const }),
    enableRemoteAccess: async () => ({ status: "disabled" as const }),
    disableRemoteAccess: async () => ({ status: "disabled" as const }),
    onRemoteAccessStatusChange: () => () => {},

    // Notifications
    showNotification: async (options: { title: string; body: string }) => {
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification(options.title, { body: options.body })
      }
    },

    // Auth - no-op in remote mode
    getUser: async () => null,
    isAuthenticated: async () => false,
    logout: async () => {},
    startAuthFlow: async () => {},
    submitAuthCode: async () => {},
    getAuthToken: async () => null,

    // Events - return no-op unsubscribe functions
    onFullscreenChange: () => () => {},
    onFocusChange: () => () => {},
    onUpdateChecking: () => () => {},
    onUpdateAvailable: () => () => {},
    onUpdateNotAvailable: () => () => {},
    onUpdateProgress: () => () => {},
    onUpdateDownloaded: () => () => {},
    onUpdateError: () => () => {},
    onUpdateManualCheck: () => () => {},
    onAuthSuccess: () => () => {},
    onAuthError: () => () => {},
    onShortcutNewAgent: () => () => {},
    onFileChanged: () => () => {},
    onGitStatusChanged: () => () => {},

    // Git Watcher
    subscribeToGitWatcher: async () => {},
    unsubscribeFromGitWatcher: async () => {},

    // Storage
    getAppDataPath: async () => "/tmp/1code-remote",

    // System
    setAnalyticsOptOut: async () => {},
  }
}

# Remote Access Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable users to access their desktop 1Code app from any browser via Cloudflare Tunnel with PIN authentication.

**Architecture:** Desktop starts a WebSocket server, runs cloudflared to create a public tunnel, generates a PIN. Browser loads the same renderer UI but uses WebSocket transport instead of IPC. All tRPC calls and desktopApi calls are bridged through WebSocket.

**Tech Stack:** ws (WebSocket server), cloudflared binary, existing tRPC routers, existing renderer UI

---

## Task 1: Create Session Manager

**Files:**
- Create: `src/main/lib/remote-access/session.ts`

**Step 1: Create session types and state**

```typescript
// src/main/lib/remote-access/session.ts

import { randomInt } from "crypto"

export interface RemoteSession {
  pin: string
  url: string | null
  createdAt: Date
  clients: Set<string>  // client IDs
}

let currentSession: RemoteSession | null = null

/**
 * Generate a 6-digit PIN
 */
export function generatePin(): string {
  return randomInt(100000, 999999).toString()
}

/**
 * Start a new remote session
 */
export function createSession(): RemoteSession {
  currentSession = {
    pin: generatePin(),
    url: null,
    createdAt: new Date(),
    clients: new Set(),
  }
  return currentSession
}

/**
 * Get current session
 */
export function getSession(): RemoteSession | null {
  return currentSession
}

/**
 * Set tunnel URL after cloudflared starts
 */
export function setSessionUrl(url: string): void {
  if (currentSession) {
    currentSession.url = url
  }
}

/**
 * Validate PIN
 */
export function validatePin(pin: string): boolean {
  return currentSession?.pin === pin
}

/**
 * Add a connected client
 */
export function addClient(clientId: string): void {
  currentSession?.clients.add(clientId)
}

/**
 * Remove a connected client
 */
export function removeClient(clientId: string): void {
  currentSession?.clients.delete(clientId)
}

/**
 * Get connected client count
 */
export function getClientCount(): number {
  return currentSession?.clients.size ?? 0
}

/**
 * End current session
 */
export function endSession(): void {
  currentSession = null
}

/**
 * Check if session is active
 */
export function isSessionActive(): boolean {
  return currentSession !== null
}
```

**Step 2: Commit**

```bash
git add src/main/lib/remote-access/session.ts
git commit -m "feat(remote-access): add session manager with PIN generation"
```

---

## Task 2: Create Cloudflared Manager

**Files:**
- Create: `src/main/lib/remote-access/cloudflared.ts`

**Step 1: Create cloudflared download and process manager**

```typescript
// src/main/lib/remote-access/cloudflared.ts

import { spawn, ChildProcess } from "child_process"
import { createWriteStream, existsSync, chmodSync } from "fs"
import { mkdir } from "fs/promises"
import { join } from "path"
import { app } from "electron"
import { pipeline } from "stream/promises"
import { createGunzip } from "zlib"
import { extract } from "tar"

const CLOUDFLARED_VERSION = "2024.1.5"

const DOWNLOAD_URLS: Record<string, string> = {
  "darwin-arm64": `https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/cloudflared-darwin-arm64.tgz`,
  "darwin-x64": `https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/cloudflared-darwin-amd64.tgz`,
  "win32-x64": `https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/cloudflared-windows-amd64.exe`,
  "linux-x64": `https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/cloudflared-linux-amd64`,
}

let cloudflaredProcess: ChildProcess | null = null

/**
 * Get the path where cloudflared binary should be stored
 */
export function getCloudflaredPath(): string {
  const binDir = join(app.getPath("userData"), "bin")
  const ext = process.platform === "win32" ? ".exe" : ""
  return join(binDir, `cloudflared${ext}`)
}

/**
 * Check if cloudflared is already downloaded
 */
export function isCloudflaredInstalled(): boolean {
  return existsSync(getCloudflaredPath())
}

/**
 * Download cloudflared binary for current platform
 */
export async function downloadCloudflared(
  onProgress?: (percent: number) => void
): Promise<void> {
  const platform = process.platform
  const arch = process.arch
  const key = `${platform}-${arch}`

  const url = DOWNLOAD_URLS[key]
  if (!url) {
    throw new Error(`Unsupported platform: ${key}`)
  }

  const binDir = join(app.getPath("userData"), "bin")
  await mkdir(binDir, { recursive: true })

  const cloudflaredPath = getCloudflaredPath()
  const isTgz = url.endsWith(".tgz")

  console.log(`[Cloudflared] Downloading from ${url}`)

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.statusText}`)
  }

  const contentLength = parseInt(response.headers.get("content-length") || "0")
  let downloaded = 0

  if (isTgz) {
    // For .tgz files, extract directly
    const tempPath = join(binDir, "cloudflared.tgz")
    const fileStream = createWriteStream(tempPath)

    const reader = response.body?.getReader()
    if (!reader) throw new Error("No response body")

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      fileStream.write(value)
      downloaded += value.length
      if (contentLength && onProgress) {
        onProgress(Math.round((downloaded / contentLength) * 100))
      }
    }
    fileStream.end()

    // Wait for file to be written
    await new Promise((resolve) => fileStream.on("finish", resolve))

    // Extract tar.gz
    await extract({
      file: tempPath,
      cwd: binDir,
    })

    // Clean up temp file
    const { unlink } = await import("fs/promises")
    await unlink(tempPath)
  } else {
    // For direct executables (Windows, Linux)
    const fileStream = createWriteStream(cloudflaredPath)
    const reader = response.body?.getReader()
    if (!reader) throw new Error("No response body")

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      fileStream.write(value)
      downloaded += value.length
      if (contentLength && onProgress) {
        onProgress(Math.round((downloaded / contentLength) * 100))
      }
    }
    fileStream.end()
    await new Promise((resolve) => fileStream.on("finish", resolve))
  }

  // Make executable on Unix
  if (process.platform !== "win32") {
    chmodSync(cloudflaredPath, 0o755)
  }

  console.log(`[Cloudflared] Downloaded to ${cloudflaredPath}`)
}

/**
 * Start cloudflared tunnel
 * Returns the public URL when ready
 */
export function startTunnel(localPort: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const cloudflaredPath = getCloudflaredPath()

    if (!existsSync(cloudflaredPath)) {
      reject(new Error("Cloudflared not installed"))
      return
    }

    console.log(`[Cloudflared] Starting tunnel to localhost:${localPort}`)

    cloudflaredProcess = spawn(cloudflaredPath, [
      "tunnel",
      "--url",
      `http://localhost:${localPort}`,
    ])

    let urlFound = false

    cloudflaredProcess.stderr?.on("data", (data: Buffer) => {
      const output = data.toString()
      console.log(`[Cloudflared] ${output}`)

      // Parse URL from output
      // Example: "INF +-----------------------------------------------------------+"
      // followed by "INF |  https://random-words.trycloudflare.com                  |"
      const urlMatch = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i)
      if (urlMatch && !urlFound) {
        urlFound = true
        resolve(urlMatch[0])
      }
    })

    cloudflaredProcess.on("error", (err) => {
      console.error("[Cloudflared] Process error:", err)
      reject(err)
    })

    cloudflaredProcess.on("exit", (code) => {
      console.log(`[Cloudflared] Process exited with code ${code}`)
      cloudflaredProcess = null
      if (!urlFound) {
        reject(new Error(`Cloudflared exited with code ${code}`))
      }
    })

    // Timeout after 30 seconds
    setTimeout(() => {
      if (!urlFound) {
        stopTunnel()
        reject(new Error("Timeout waiting for tunnel URL"))
      }
    }, 30000)
  })
}

/**
 * Stop cloudflared tunnel
 */
export function stopTunnel(): void {
  if (cloudflaredProcess) {
    console.log("[Cloudflared] Stopping tunnel")
    cloudflaredProcess.kill()
    cloudflaredProcess = null
  }
}

/**
 * Check if tunnel is running
 */
export function isTunnelRunning(): boolean {
  return cloudflaredProcess !== null
}
```

**Step 2: Commit**

```bash
git add src/main/lib/remote-access/cloudflared.ts
git commit -m "feat(remote-access): add cloudflared download and tunnel manager"
```

---

## Task 3: Create WebSocket Server with tRPC Bridge

**Files:**
- Create: `src/main/lib/remote-access/ws-server.ts`

**Step 1: Create WebSocket message types**

```typescript
// src/main/lib/remote-access/ws-server.ts

import { WebSocketServer, WebSocket } from "ws"
import { createServer, Server, IncomingMessage } from "http"
import { parse } from "url"
import { randomUUID } from "crypto"
import { validatePin, addClient, removeClient } from "./session"
import { createAppRouter } from "../trpc/routers"
import { BrowserWindow } from "electron"
import superjson from "superjson"

// Message types
interface WSRequest {
  id: string
  type: "auth" | "trpc" | "api" | "subscribe" | "unsubscribe"
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

interface AuthenticatedClient {
  ws: WebSocket
  id: string
  subscriptions: Set<string>
}

let httpServer: Server | null = null
let wss: WebSocketServer | null = null
const authenticatedClients = new Map<WebSocket, AuthenticatedClient>()

// Subscription handlers - map of channel pattern to active subscriptions
const subscriptionCleanups = new Map<string, () => void>()

/**
 * Send message to a WebSocket client
 */
function send(ws: WebSocket, message: WSResponse): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message))
  }
}

/**
 * Broadcast to all authenticated clients
 */
export function broadcast(channel: string, data: unknown): void {
  const message: WSResponse = {
    id: null,
    type: "subscription",
    channel,
    data,
  }

  for (const [ws, client] of authenticatedClients) {
    if (client.subscriptions.has(channel)) {
      send(ws, message)
    }
  }
}

/**
 * Handle incoming WebSocket message
 */
async function handleMessage(
  ws: WebSocket,
  client: AuthenticatedClient | undefined,
  message: WSRequest,
  router: ReturnType<typeof createAppRouter>
): Promise<void> {
  // Auth message
  if (message.type === "auth") {
    if (message.pin && validatePin(message.pin)) {
      const clientId = randomUUID()
      const newClient: AuthenticatedClient = {
        ws,
        id: clientId,
        subscriptions: new Set(),
      }
      authenticatedClients.set(ws, newClient)
      addClient(clientId)
      send(ws, { id: message.id, type: "auth_success" })
      console.log(`[WS] Client authenticated: ${clientId}`)
    } else {
      send(ws, { id: message.id, type: "auth_failed", error: "Invalid PIN" })
    }
    return
  }

  // All other messages require authentication
  if (!client) {
    send(ws, { id: message.id, type: "auth_required" })
    return
  }

  // tRPC call
  if (message.type === "trpc" && message.method) {
    try {
      const [routerName, procedureName] = message.method.split(".")

      // Get the router and procedure
      const routerObj = (router as any)[routerName]
      if (!routerObj) {
        throw new Error(`Router not found: ${routerName}`)
      }

      // Create a caller for the procedure
      const caller = router.createCaller({
        getWindow: () => BrowserWindow.getFocusedWindow(),
      })

      // Call the procedure
      const routerCaller = (caller as any)[routerName]
      if (!routerCaller || !routerCaller[procedureName]) {
        throw new Error(`Procedure not found: ${message.method}`)
      }

      const result = await routerCaller[procedureName](message.params)

      send(ws, {
        id: message.id,
        type: "result",
        data: superjson.serialize(result),
      })
    } catch (error) {
      send(ws, {
        id: message.id,
        type: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      })
    }
    return
  }

  // Subscribe
  if (message.type === "subscribe" && message.channel) {
    client.subscriptions.add(message.channel)
    send(ws, { id: message.id, type: "result", data: { subscribed: message.channel } })
    return
  }

  // Unsubscribe
  if (message.type === "unsubscribe" && message.channel) {
    client.subscriptions.delete(message.channel)
    send(ws, { id: message.id, type: "result", data: { unsubscribed: message.channel } })
    return
  }

  // Unknown message type
  send(ws, { id: message.id, type: "error", error: "Unknown message type" })
}

/**
 * Start WebSocket server
 * Returns the port number
 */
export function startWSServer(): Promise<number> {
  return new Promise((resolve, reject) => {
    // Create HTTP server for WebSocket upgrade
    httpServer = createServer((req, res) => {
      // Serve static files for web client
      // TODO: Implement static file serving in Task 6
      res.writeHead(200, { "Content-Type": "text/plain" })
      res.end("1Code Remote Access")
    })

    wss = new WebSocketServer({ server: httpServer })

    // Create tRPC router
    const router = createAppRouter(() => BrowserWindow.getFocusedWindow())

    wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
      console.log("[WS] New connection from:", req.socket.remoteAddress)

      // Send auth required message
      send(ws, { id: null, type: "auth_required" })

      ws.on("message", async (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString()) as WSRequest
          const client = authenticatedClients.get(ws)
          await handleMessage(ws, client, message, router)
        } catch (error) {
          console.error("[WS] Message parse error:", error)
          send(ws, { id: null, type: "error", error: "Invalid message format" })
        }
      })

      ws.on("close", () => {
        const client = authenticatedClients.get(ws)
        if (client) {
          removeClient(client.id)
          authenticatedClients.delete(ws)
          console.log(`[WS] Client disconnected: ${client.id}`)
        }
      })

      ws.on("error", (error) => {
        console.error("[WS] WebSocket error:", error)
      })
    })

    // Listen on random available port
    httpServer.listen(0, () => {
      const address = httpServer?.address()
      if (address && typeof address === "object") {
        console.log(`[WS] Server listening on port ${address.port}`)
        resolve(address.port)
      } else {
        reject(new Error("Failed to get server port"))
      }
    })

    httpServer.on("error", reject)
  })
}

/**
 * Stop WebSocket server
 */
export function stopWSServer(): Promise<void> {
  return new Promise((resolve) => {
    // Close all client connections
    for (const [ws] of authenticatedClients) {
      ws.close()
    }
    authenticatedClients.clear()

    // Clean up subscriptions
    for (const cleanup of subscriptionCleanups.values()) {
      cleanup()
    }
    subscriptionCleanups.clear()

    // Close servers
    wss?.close(() => {
      httpServer?.close(() => {
        wss = null
        httpServer = null
        console.log("[WS] Server stopped")
        resolve()
      })
    })
  })
}

/**
 * Check if server is running
 */
export function isWSServerRunning(): boolean {
  return httpServer !== null
}

/**
 * Get connected client count
 */
export function getConnectedClientCount(): number {
  return authenticatedClients.size
}
```

**Step 2: Commit**

```bash
git add src/main/lib/remote-access/ws-server.ts
git commit -m "feat(remote-access): add WebSocket server with tRPC bridge"
```

---

## Task 4: Create Remote Access Controller

**Files:**
- Create: `src/main/lib/remote-access/index.ts`

**Step 1: Create main controller that orchestrates all components**

```typescript
// src/main/lib/remote-access/index.ts

import {
  createSession,
  endSession,
  getSession,
  setSessionUrl,
  isSessionActive,
  getClientCount,
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
  isWSServerRunning,
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
```

**Step 2: Commit**

```bash
git add src/main/lib/remote-access/index.ts
git commit -m "feat(remote-access): add main controller"
```

---

## Task 5: Add tRPC Router for Remote Access

**Files:**
- Create: `src/main/lib/trpc/routers/remote-access.ts`
- Modify: `src/main/lib/trpc/routers/index.ts`

**Step 1: Create remote access router**

```typescript
// src/main/lib/trpc/routers/remote-access.ts

import { z } from "zod"
import { router, publicProcedure } from "../index"
import {
  enableRemoteAccess,
  disableRemoteAccess,
  getRemoteAccessStatus,
} from "../../remote-access"

export const remoteAccessRouter = router({
  /**
   * Get current remote access status
   */
  getStatus: publicProcedure.query(() => {
    return getRemoteAccessStatus()
  }),

  /**
   * Enable remote access
   */
  enable: publicProcedure.mutation(async () => {
    await enableRemoteAccess()
    return getRemoteAccessStatus()
  }),

  /**
   * Disable remote access
   */
  disable: publicProcedure.mutation(async () => {
    await disableRemoteAccess()
    return getRemoteAccessStatus()
  }),
})
```

**Step 2: Add router to app router**

Edit `src/main/lib/trpc/routers/index.ts`:

```typescript
// Add import at top
import { remoteAccessRouter } from "./remote-access"

// Add to router object in createAppRouter function
export function createAppRouter(getWindow: () => BrowserWindow | null) {
  return router({
    // ... existing routers ...
    remoteAccess: remoteAccessRouter,  // Add this line
  })
}
```

**Step 3: Commit**

```bash
git add src/main/lib/trpc/routers/remote-access.ts src/main/lib/trpc/routers/index.ts
git commit -m "feat(remote-access): add tRPC router for remote access control"
```

---

## Task 6: Add IPC Handlers for Remote Access Events

**Files:**
- Modify: `src/main/windows/main.ts`
- Modify: `src/preload/index.ts`

**Step 1: Add IPC handlers in main.ts**

Add to `src/main/windows/main.ts` in the IPC handlers section:

```typescript
// Remote access IPC handlers
ipcMain.handle("remote-access:get-status", () => {
  const { getRemoteAccessStatus } = require("../lib/remote-access")
  return getRemoteAccessStatus()
})

ipcMain.handle("remote-access:enable", async () => {
  const { enableRemoteAccess, getRemoteAccessStatus } = require("../lib/remote-access")
  await enableRemoteAccess()
  return getRemoteAccessStatus()
})

ipcMain.handle("remote-access:disable", async () => {
  const { disableRemoteAccess, getRemoteAccessStatus } = require("../lib/remote-access")
  await disableRemoteAccess()
  return getRemoteAccessStatus()
})
```

**Step 2: Add to preload**

Add to `src/preload/index.ts` in the desktopApi object:

```typescript
// Remote access
getRemoteAccessStatus: () => ipcRenderer.invoke("remote-access:get-status"),
enableRemoteAccess: () => ipcRenderer.invoke("remote-access:enable"),
disableRemoteAccess: () => ipcRenderer.invoke("remote-access:disable"),
onRemoteAccessStatusChange: (callback: (status: any) => void) => {
  const handler = (_event: unknown, status: any) => callback(status)
  ipcRenderer.on("remote-access:status", handler)
  return () => ipcRenderer.removeListener("remote-access:status", handler)
},
```

**Step 3: Add types to DesktopApi interface**

Add to the DesktopApi interface in `src/preload/index.ts`:

```typescript
// Remote access
getRemoteAccessStatus: () => Promise<{
  status: "disabled" | "downloading" | "starting" | "active" | "error"
  progress?: number
  url?: string
  pin?: string
  clients?: number
  message?: string
}>
enableRemoteAccess: () => Promise<any>
disableRemoteAccess: () => Promise<any>
onRemoteAccessStatusChange: (callback: (status: any) => void) => () => void
```

**Step 4: Commit**

```bash
git add src/main/windows/main.ts src/preload/index.ts
git commit -m "feat(remote-access): add IPC handlers and preload bridge"
```

---

## Task 7: Create Remote Access UI Atom

**Files:**
- Create: `src/renderer/lib/atoms/remote-access.ts`
- Modify: `src/renderer/lib/atoms/index.ts`

**Step 1: Create remote access atoms**

```typescript
// src/renderer/lib/atoms/remote-access.ts

import { atom } from "jotai"

export type RemoteAccessStatus =
  | { status: "disabled" }
  | { status: "downloading"; progress: number }
  | { status: "starting" }
  | { status: "active"; url: string; pin: string; clients: number }
  | { status: "error"; message: string }

export const remoteAccessStatusAtom = atom<RemoteAccessStatus>({ status: "disabled" })

export const remoteAccessDialogOpenAtom = atom(false)
```

**Step 2: Export from index**

Add to `src/renderer/lib/atoms/index.ts`:

```typescript
export * from "./remote-access"
```

**Step 3: Commit**

```bash
git add src/renderer/lib/atoms/remote-access.ts src/renderer/lib/atoms/index.ts
git commit -m "feat(remote-access): add UI atoms for remote access state"
```

---

## Task 8: Create Remote Access Dialog Component

**Files:**
- Create: `src/renderer/components/dialogs/remote-access-dialog.tsx`

**Step 1: Create dialog component**

```typescript
// src/renderer/components/dialogs/remote-access-dialog.tsx

import { useAtom } from "jotai"
import { useEffect, useCallback } from "react"
import { Globe, Copy, Check, Loader2, X } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog"
import { Button } from "../ui/button"
import {
  remoteAccessStatusAtom,
  remoteAccessDialogOpenAtom,
  type RemoteAccessStatus,
} from "../../lib/atoms/remote-access"
import { toast } from "sonner"

export function RemoteAccessDialog() {
  const [open, setOpen] = useAtom(remoteAccessDialogOpenAtom)
  const [status, setStatus] = useAtom(remoteAccessStatusAtom)

  // Fetch initial status and subscribe to changes
  useEffect(() => {
    if (!window.desktopApi) return

    // Get initial status
    window.desktopApi.getRemoteAccessStatus?.().then(setStatus)

    // Subscribe to status changes
    const unsubscribe = window.desktopApi.onRemoteAccessStatusChange?.(setStatus)
    return unsubscribe
  }, [setStatus])

  const handleEnable = useCallback(async () => {
    try {
      await window.desktopApi?.enableRemoteAccess?.()
    } catch (error) {
      toast.error("Failed to enable remote access")
    }
  }, [])

  const handleDisable = useCallback(async () => {
    try {
      await window.desktopApi?.disableRemoteAccess?.()
    } catch (error) {
      toast.error("Failed to disable remote access")
    }
  }, [])

  const handleCopyUrl = useCallback(() => {
    if (status.status === "active") {
      navigator.clipboard.writeText(status.url)
      toast.success("URL copied to clipboard")
    }
  }, [status])

  const handleCopyPin = useCallback(() => {
    if (status.status === "active") {
      navigator.clipboard.writeText(status.pin)
      toast.success("PIN copied to clipboard")
    }
  }, [status])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Remote Access
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {status.status === "disabled" && (
            <>
              <p className="text-sm text-muted-foreground">
                Access your desktop from any browser.
              </p>
              <Button onClick={handleEnable} className="w-full">
                Enable Remote Access
              </Button>
            </>
          )}

          {status.status === "downloading" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Downloading cloudflared...</span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${status.progress}%` }}
                />
              </div>
            </div>
          )}

          {status.status === "starting" && (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Starting tunnel...</span>
            </div>
          )}

          {status.status === "active" && (
            <>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-sm font-medium">Active</span>
              </div>

              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">URL</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-2 bg-muted rounded text-xs break-all">
                    {status.url}
                  </code>
                  <Button size="icon" variant="ghost" onClick={handleCopyUrl}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">PIN</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-2 bg-muted rounded text-center text-2xl font-mono tracking-widest">
                    {status.pin}
                  </code>
                  <Button size="icon" variant="ghost" onClick={handleCopyPin}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="text-sm text-muted-foreground">
                Connected clients: {status.clients}
              </div>

              <Button
                onClick={handleDisable}
                variant="destructive"
                className="w-full"
              >
                Disable Remote Access
              </Button>
            </>
          )}

          {status.status === "error" && (
            <>
              <div className="flex items-center gap-2 text-destructive">
                <X className="h-4 w-4" />
                <span className="text-sm">{status.message}</span>
              </div>
              <Button onClick={handleEnable} className="w-full">
                Try Again
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

**Step 2: Commit**

```bash
git add src/renderer/components/dialogs/remote-access-dialog.tsx
git commit -m "feat(remote-access): add remote access dialog component"
```

---

## Task 9: Add Remote Access Button to Sidebar

**Files:**
- Modify: `src/renderer/features/sidebar/agents-sidebar.tsx`

**Step 1: Find the sidebar footer icons section**

Search for the icon bar area (near settings, help icons) and add remote access button:

```typescript
// Import at top
import { Globe } from "lucide-react"
import { useSetAtom } from "jotai"
import { remoteAccessDialogOpenAtom } from "../../lib/atoms/remote-access"

// In the component, add:
const setRemoteAccessDialogOpen = useSetAtom(remoteAccessDialogOpenAtom)

// In the icon bar section (footer), add button:
<Button
  variant="ghost"
  size="icon"
  onClick={() => setRemoteAccessDialogOpen(true)}
  title="Remote Access"
>
  <Globe className="h-4 w-4" />
</Button>
```

**Step 2: Import dialog in layout**

Add to `src/renderer/features/layout/agents-layout.tsx`:

```typescript
// Import at top
import { RemoteAccessDialog } from "../../components/dialogs/remote-access-dialog"

// Add inside the return, after ClaudeLoginModal:
<RemoteAccessDialog />
```

**Step 3: Commit**

```bash
git add src/renderer/features/sidebar/agents-sidebar.tsx src/renderer/features/layout/agents-layout.tsx
git commit -m "feat(remote-access): add remote access button to sidebar"
```

---

## Task 10: Add Cleanup on App Quit

**Files:**
- Modify: `src/main/index.ts`

**Step 1: Add cleanup in before-quit handler**

Find the `app.on("before-quit", ...)` section and add:

```typescript
// Import at top
import { disableRemoteAccess } from "./lib/remote-access"

// In before-quit handler, add before other cleanup:
app.on("before-quit", async () => {
  console.log("[App] Shutting down...")
  isQuitting = true
  ;(global as any).__isAppQuitting = () => true

  // Disable remote access first
  try {
    await disableRemoteAccess()
  } catch (error) {
    console.warn("[App] Failed to disable remote access:", error)
  }

  destroyTray()
  // ... rest of cleanup
})
```

**Step 2: Commit**

```bash
git add src/main/index.ts
git commit -m "feat(remote-access): add cleanup on app quit"
```

---

## Task 11: Install ws Package

**Files:**
- Modify: `package.json`

**Step 1: Add ws dependency**

```bash
bun add ws
bun add -d @types/ws
```

**Step 2: Commit**

```bash
git add package.json bun.lockb
git commit -m "feat(remote-access): add ws package for WebSocket server"
```

---

## Task 12: Test Remote Access Feature

**Step 1: Run the app in dev mode**

```bash
bun run dev
```

**Step 2: Test enable remote access**

1. Click the Globe icon in sidebar footer
2. Click "Enable Remote Access"
3. Wait for cloudflared to download (first time only)
4. Wait for tunnel to start
5. Verify URL and PIN are displayed

**Step 3: Test web client access**

1. Open the URL in another browser
2. Verify you see a page (for now just "1Code Remote Access" text)
3. Test WebSocket connection (will implement full UI in future tasks)

**Step 4: Test disable**

1. Click "Disable Remote Access"
2. Verify status returns to disabled
3. Verify tunnel is stopped

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Session Manager | `session.ts` |
| 2 | Cloudflared Manager | `cloudflared.ts` |
| 3 | WebSocket Server | `ws-server.ts` |
| 4 | Remote Access Controller | `index.ts` |
| 5 | tRPC Router | `remote-access.ts`, `routers/index.ts` |
| 6 | IPC Handlers | `main.ts`, `preload/index.ts` |
| 7 | UI Atoms | `atoms/remote-access.ts` |
| 8 | Dialog Component | `remote-access-dialog.tsx` |
| 9 | Sidebar Button | `agents-sidebar.tsx`, `agents-layout.tsx` |
| 10 | App Cleanup | `index.ts` |
| 11 | Dependencies | `package.json` |
| 12 | Testing | Manual test |

---

## Future Tasks (Not in This Plan)

1. **Web Client Transport** - Create WebSocket transport adapter for renderer
2. **Static File Serving** - Serve built renderer UI through WS server
3. **Real-time Subscriptions** - Bridge Claude streaming, terminal, git status
4. **PIN Auth UI in Browser** - Create PIN entry page for web client
5. **Session Timeout** - Auto-disable after inactivity

// src/main/lib/remote-access/ws-server.ts

import { WebSocketServer, WebSocket } from "ws"
import { createServer, Server, IncomingMessage, ServerResponse } from "http"
import { request as httpRequest } from "http"
import { randomUUID } from "crypto"
import { validatePin, addClient, removeClient } from "./session"
import { createAppRouter } from "../trpc/routers"
import { BrowserWindow, app } from "electron"
import superjson from "superjson"
import { join, extname } from "path"
import { readFile, stat } from "fs/promises"
import { existsSync } from "fs"

// Vite dev server port
const VITE_DEV_PORT = 5173

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

// Shared chat subscriptions - one Observable per subChatId, broadcast to all clients
interface SharedChatSubscription {
  observable: any
  subscription: any
  clients: Set<WebSocket>
  // Event emitter for IPC clients to listen
  listeners: Set<(data: any) => void>
}
const sharedChatSubscriptions = new Map<string, SharedChatSubscription>()

// MIME types for static files
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
}

/**
 * Get the renderer output directory
 */
function getRendererDir(): string {
  // In dev: out/renderer, in production: resources/app.asar/out/renderer
  if (app.isPackaged) {
    return join(process.resourcesPath, "app.asar", "out", "renderer")
  }
  return join(app.getAppPath(), "out", "renderer")
}

/**
 * PIN auth page HTML
 */
function getPinAuthPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>1Code Remote Access</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0a;
      color: #fafafa;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      text-align: center;
      padding: 2rem;
      max-width: 400px;
    }
    h1 {
      font-size: 1.5rem;
      margin-bottom: 0.5rem;
      font-weight: 600;
    }
    p {
      color: #a1a1aa;
      margin-bottom: 2rem;
      font-size: 0.875rem;
    }
    .pin-input {
      display: flex;
      gap: 0.5rem;
      justify-content: center;
      margin-bottom: 1.5rem;
    }
    .pin-input input {
      width: 3rem;
      height: 3.5rem;
      text-align: center;
      font-size: 1.5rem;
      font-weight: 600;
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 0.5rem;
      color: #fafafa;
      outline: none;
      transition: border-color 0.15s;
    }
    .pin-input input:focus {
      border-color: #3b82f6;
    }
    button {
      width: 100%;
      padding: 0.75rem 1.5rem;
      font-size: 0.875rem;
      font-weight: 500;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 0.5rem;
      cursor: pointer;
      transition: background 0.15s;
    }
    button:hover { background: #2563eb; }
    button:disabled {
      background: #27272a;
      cursor: not-allowed;
    }
    .error {
      color: #ef4444;
      font-size: 0.875rem;
      margin-top: 1rem;
    }
    .loading {
      display: none;
      margin-top: 1rem;
      color: #a1a1aa;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>1Code Remote Access</h1>
    <p>Enter the 6-digit PIN shown on your desktop</p>
    <div class="pin-input">
      <input type="text" maxlength="1" inputmode="numeric" pattern="[0-9]" autocomplete="off">
      <input type="text" maxlength="1" inputmode="numeric" pattern="[0-9]" autocomplete="off">
      <input type="text" maxlength="1" inputmode="numeric" pattern="[0-9]" autocomplete="off">
      <input type="text" maxlength="1" inputmode="numeric" pattern="[0-9]" autocomplete="off">
      <input type="text" maxlength="1" inputmode="numeric" pattern="[0-9]" autocomplete="off">
      <input type="text" maxlength="1" inputmode="numeric" pattern="[0-9]" autocomplete="off">
    </div>
    <button id="connect" disabled>Connect</button>
    <div class="error" id="error"></div>
    <div class="loading" id="loading">Connecting...</div>
  </div>
  <script>
    const inputs = document.querySelectorAll('.pin-input input');
    const btn = document.getElementById('connect');
    const error = document.getElementById('error');
    const loading = document.getElementById('loading');

    // Auto-focus and navigation
    inputs.forEach((input, i) => {
      input.addEventListener('input', (e) => {
        const val = e.target.value.replace(/[^0-9]/g, '');
        e.target.value = val;
        if (val && i < inputs.length - 1) inputs[i + 1].focus();
        updateButton();
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && i > 0) {
          inputs[i - 1].focus();
        }
      });
      input.addEventListener('paste', (e) => {
        e.preventDefault();
        const paste = (e.clipboardData || window.clipboardData).getData('text');
        const digits = paste.replace(/[^0-9]/g, '').slice(0, 6);
        digits.split('').forEach((d, j) => {
          if (inputs[j]) inputs[j].value = d;
        });
        updateButton();
        if (digits.length === 6) inputs[5].focus();
      });
    });

    function updateButton() {
      const pin = Array.from(inputs).map(i => i.value).join('');
      btn.disabled = pin.length !== 6;
    }

    function getPin() {
      return Array.from(inputs).map(i => i.value).join('');
    }

    btn.addEventListener('click', async () => {
      const pin = getPin();
      error.textContent = '';
      loading.style.display = 'block';
      btn.disabled = true;

      // Connect via WebSocket
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(protocol + '//' + location.host);

      ws.onopen = () => {
        ws.send(JSON.stringify({ id: '1', type: 'auth', pin }));
      };

      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === 'auth_success') {
          // Store auth in sessionStorage and redirect
          sessionStorage.setItem('remote_ws_auth', pin);
          location.href = '/app';
        } else if (msg.type === 'auth_failed') {
          error.textContent = 'Invalid PIN. Please try again.';
          loading.style.display = 'none';
          btn.disabled = false;
          inputs.forEach(i => i.value = '');
          inputs[0].focus();
        }
      };

      ws.onerror = () => {
        error.textContent = 'Connection failed. Please try again.';
        loading.style.display = 'none';
        btn.disabled = false;
      };
    });

    // Focus first input on load
    inputs[0].focus();
  </script>
</body>
</html>`
}

/**
 * Proxy request to Vite dev server
 */
function proxyToVite(req: IncomingMessage, res: ServerResponse): void {
  // Map /app to / for Vite (Vite serves at root)
  let path = req.url || "/"
  if (path === "/app" || path.startsWith("/app?")) {
    path = "/" + path.slice(4) // Remove "/app" prefix, keep query string
  }

  const proxyReq = httpRequest(
    {
      hostname: "localhost",
      port: VITE_DEV_PORT,
      path: path,
      method: req.method,
      headers: {
        ...req.headers,
        host: `localhost:${VITE_DEV_PORT}`,
      },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 200, proxyRes.headers)
      proxyRes.pipe(res)
    }
  )

  proxyReq.on("error", (err) => {
    console.error("[WS] Proxy error:", err)
    res.writeHead(502, { "Content-Type": "text/plain" })
    res.end("Vite dev server not available. Make sure bun run dev is running.")
  })

  req.pipe(proxyReq)
}

/**
 * Serve static files or PIN auth page
 * In dev mode, proxy to Vite dev server for hot reload
 */
async function handleHttpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = req.url || "/"

  // In dev mode, only serve PIN auth page directly
  // All other requests proxy to Vite dev server
  const isDev = process.env.NODE_ENV !== "production"

  if (isDev) {
    // Root or /login -> PIN auth page (even in dev)
    if (url === "/" || url === "/login") {
      res.writeHead(200, { "Content-Type": "text/html" })
      res.end(getPinAuthPage())
      return
    }

    // Proxy all other requests to Vite dev server
    proxyToVite(req, res)
    return
  }

  // Production mode: serve static files
  const rendererDir = getRendererDir()

  // Root or /login -> PIN auth page
  if (url === "/" || url === "/login") {
    res.writeHead(200, { "Content-Type": "text/html" })
    res.end(getPinAuthPage())
    return
  }

  // /app -> serve renderer index.html
  if (url === "/app" || url.startsWith("/app?")) {
    const indexPath = join(rendererDir, "index.html")
    try {
      const content = await readFile(indexPath)
      res.writeHead(200, { "Content-Type": "text/html" })
      res.end(content)
    } catch {
      res.writeHead(404)
      res.end("Not found")
    }
    return
  }

  // Static assets
  let filePath = join(rendererDir, url.split("?")[0])

  // Security: prevent directory traversal
  if (!filePath.startsWith(rendererDir)) {
    res.writeHead(403)
    res.end("Forbidden")
    return
  }

  try {
    const fileStat = await stat(filePath)
    if (fileStat.isDirectory()) {
      filePath = join(filePath, "index.html")
    }

    const content = await readFile(filePath)
    const ext = extname(filePath).toLowerCase()
    const contentType = MIME_TYPES[ext] || "application/octet-stream"

    res.writeHead(200, { "Content-Type": contentType })
    res.end(content)
  } catch {
    res.writeHead(404)
    res.end("Not found")
  }
}

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
 * Broadcast chat data to all clients subscribed to a specific subChat
 * This is called when chat updates come from IPC (desktop) or WebSocket (web)
 */
export function broadcastChatData(subChatId: string, data: any): void {
  const sharedSub = sharedChatSubscriptions.get(subChatId)
  if (!sharedSub) {
    // No subscription exists for this chat
    return
  }

  console.log(`[WS] Broadcasting chat data to ${sharedSub.clients.size} WebSocket clients and ${sharedSub.listeners.size} IPC listeners for subChatId: ${subChatId}`)

  // Broadcast to WebSocket clients
  for (const clientWs of sharedSub.clients) {
    send(clientWs, {
      id: null,
      type: "subscription",
      data: data,
    })
  }

  // Broadcast to IPC listeners (desktop clients)
  for (const listener of sharedSub.listeners) {
    try {
      listener(data)
    } catch (err) {
      console.error(`[WS] Error in IPC listener:`, err)
    }
  }
}

/**
 * Subscribe to chat data from IPC (desktop client)
 * Returns unsubscribe function
 */
export function subscribeToChatData(subChatId: string, callback: (data: any) => void): () => void {
  let sharedSub = sharedChatSubscriptions.get(subChatId)

  if (!sharedSub) {
    // Create a placeholder subscription without an Observable
    // This allows IPC clients to register listeners before any WebSocket client connects
    sharedSub = {
      observable: null,
      subscription: null,
      clients: new Set(),
      listeners: new Set(),
    }
    sharedChatSubscriptions.set(subChatId, sharedSub)
  }

  sharedSub.listeners.add(callback)
  console.log(`[WS] IPC listener added for subChatId: ${subChatId}. Total listeners: ${sharedSub.listeners.size}`)

  // Return unsubscribe function
  return () => {
    sharedSub!.listeners.delete(callback)
    console.log(`[WS] IPC listener removed for subChatId: ${subChatId}. Remaining listeners: ${sharedSub!.listeners.size}`)

    // Clean up if no clients or listeners left
    if (sharedSub!.clients.size === 0 && sharedSub!.listeners.size === 0) {
      if (sharedSub!.subscription) {
        sharedSub!.subscription.unsubscribe()
      }
      sharedChatSubscriptions.delete(subChatId)
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
      // Parse the method path (e.g., "claude.chat" or "external.getAppVersion")
      const pathParts = message.method.split(".")
      const routerName = pathParts[0]
      const procedureName = pathParts[pathParts.length - 1]

      // Get the router
      const routerObj = (router as any)[routerName]
      if (!routerObj) {
        throw new Error(`Router not found: ${routerName}`)
      }

      // Handle subscriptions (streaming)
      // For claude.chat, routerName is "claude" and procedureName is "chat"
      if (routerName === "claude" && procedureName === "chat") {
        const subChatId = message.params?.subChatId
        if (!subChatId) {
          throw new Error(`subChatId is required for chat subscription`)
        }

        console.log(`[WS] Starting claude.chat subscription for subChatId: ${subChatId}`)

        // Check if there's already a shared subscription for this subChatId
        let sharedSub = sharedChatSubscriptions.get(subChatId)

        if (!sharedSub) {
          // Create new shared subscription
          console.log(`[WS] Creating new shared subscription for ${subChatId}`)

          // Access the claude router
          const claudeRouter = (router as any).claude
          if (!claudeRouter) {
            throw new Error(`claude router not found`)
          }

          const chatProcedure = claudeRouter.chat
          if (!chatProcedure) {
            throw new Error(`chat procedure not found`)
          }

          const procedureDef = chatProcedure._def
          if (!procedureDef) {
            throw new Error(`chat procedure _def not found`)
          }

          const subscriptionFn = procedureDef.resolver
          if (!subscriptionFn || typeof subscriptionFn !== 'function') {
            throw new Error(`chat procedure resolver not found`)
          }

          const ctx = {
            getWindow: () => BrowserWindow.getFocusedWindow(),
          }

          // Create the Observable
          const observable = subscriptionFn({
            input: message.params,
            type: 'subscription',
            ctx,
            path: 'claude.chat',
          })

          if (typeof observable?.subscribe !== 'function') {
            throw new Error(`chat subscription did not return Observable`)
          }

          // Subscribe and broadcast to all clients (WebSocket + IPC)
          const subscription = observable.subscribe({
            next: (data: any) => {
              console.log(`[WS] Broadcasting chat data to ${sharedSub?.clients.size || 0} WS clients, ${sharedSub?.listeners.size || 0} IPC listeners:`, data.type || "no-type")
              // Broadcast to all WebSocket clients subscribed to this subChat
              if (sharedSub) {
                for (const clientWs of sharedSub.clients) {
                  send(clientWs, {
                    id: null,
                    type: "subscription",
                    data: data,
                  })
                }
                // Also notify IPC listeners (desktop clients)
                for (const listener of sharedSub.listeners) {
                  try {
                    listener(data)
                  } catch (err) {
                    console.error(`[WS] Error in IPC listener:`, err)
                  }
                }
              }
            },
            error: (err: any) => {
              console.error(`[WS] Chat subscription error:`, err)
              if (sharedSub) {
                for (const clientWs of sharedSub.clients) {
                  send(clientWs, {
                    id: null,
                    type: "error",
                    error: err.message,
                  })
                }
                for (const listener of sharedSub.listeners) {
                  try {
                    listener({ type: "error", error: err.message })
                  } catch (err) {
                    console.error(`[WS] Error in IPC listener:`, err)
                  }
                }
              }
            },
            complete: () => {
              console.log(`[WS] Chat subscription complete for ${subChatId}`)
              if (sharedSub) {
                for (const clientWs of sharedSub.clients) {
                  send(clientWs, {
                    id: null,
                    type: "result",
                    data: { completed: true },
                  })
                }
                for (const listener of sharedSub.listeners) {
                  try {
                    listener({ type: "complete" })
                  } catch (err) {
                    console.error(`[WS] Error in IPC listener:`, err)
                  }
                }
              }
            }
          })

          // Create shared subscription object with listeners set
          // Preserve existing listeners if this is being recreated
          const existingListeners = sharedChatSubscriptions.get(subChatId)?.listeners || new Set()
          sharedSub = {
            observable,
            subscription,
            clients: new Set(),
            listeners: existingListeners,
          }
          sharedChatSubscriptions.set(subChatId, sharedSub)
        }

        // Add this client to the shared subscription
        sharedSub.clients.add(ws)
        console.log(`[WS] Client added to shared subscription ${subChatId}. Total clients: ${sharedSub.clients.size}`)

        // Send success response
        send(ws, {
          id: message.id,
          type: "result",
          data: { subscribed: true, subChatId },
        })

        // Clean up client from subscription on disconnect
        ws.on("close", () => {
          if (sharedSub) {
            sharedSub.clients.delete(ws)
            console.log(`[WS] Client removed from shared subscription ${subChatId}. Remaining clients: ${sharedSub.clients.size}`)

            // Clean up subscription if no clients left
            if (sharedSub.clients.size === 0) {
              console.log(`[WS] No clients left for ${subChatId}, cleaning up subscription`)
              sharedSub.subscription.unsubscribe()
              sharedChatSubscriptions.delete(subChatId)
            }
          }
        })

        return
      }

      // Create a caller for regular procedures
      const caller = router.createCaller({
        getWindow: () => BrowserWindow.getFocusedWindow(),
      })

      // Navigate the caller to find the procedure
      // Handle nested paths like "external.getAppVersion" or "projects.list"
      let current: any = caller

      for (let i = 0; i < pathParts.length - 1; i++) {
        current = current[pathParts[i]]
        if (!current) {
          throw new Error(`Router not found: ${pathParts.slice(0, i + 1).join(".")}`)
        }
      }

      if (!current[procedureName]) {
        throw new Error(`Procedure not found: ${message.method}`)
      }

      const result = await current[procedureName](message.params)

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
    // Create HTTP server for WebSocket upgrade and static files
    httpServer = createServer((req, res) => {
      handleHttpRequest(req, res).catch((err) => {
        console.error("[WS] HTTP request error:", err)
        res.writeHead(500)
        res.end("Internal Server Error")
      })
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
    if (wss) {
      wss.close(() => {
        if (httpServer) {
          httpServer.close(() => {
            wss = null
            httpServer = null
            console.log("[WS] Server stopped")
            resolve()
          })
        } else {
          wss = null
          resolve()
        }
      })
    } else {
      resolve()
    }
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

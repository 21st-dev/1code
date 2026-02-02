// src/renderer/lib/remote-transport/ws-link.ts
// WebSocket tRPC Link for Remote Access

import { TRPCLink } from "@trpc/client"
import { observable } from "@trpc/server/observable"
import type { AppRouter } from "../../../main/lib/trpc/routers"
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

type SubscriptionHandler = {
  onData: (data: unknown) => void
  onError: (error: Error) => void
  onComplete: () => void
}

let ws: WebSocket | null = null
let isAuthenticated = false
let connectionPromise: Promise<void> | null = null
const pendingRequests = new Map<string, PendingRequest>()
const subscriptionHandlers = new Map<string, SubscriptionHandler>()
let requestId = 0

/**
 * Get stored PIN from sessionStorage
 */
function getStoredPin(): string | null {
  return sessionStorage.getItem("remote_ws_auth")
}

/**
 * Connect to WebSocket server and authenticate
 */
function connect(): Promise<void> {
  if (connectionPromise) return connectionPromise
  if (ws?.readyState === WebSocket.OPEN && isAuthenticated) {
    return Promise.resolve()
  }

  connectionPromise = new Promise((resolve, reject) => {
    const pin = getStoredPin()
    if (!pin) {
      window.location.href = "/login"
      reject(new Error("No PIN stored"))
      return
    }

    const protocol = location.protocol === "https:" ? "wss:" : "ws:"
    ws = new WebSocket(`${protocol}//${location.host}`)

    ws.onopen = () => {
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
        console.log("[ws-link] Authentication successful")
        isAuthenticated = true
        connectionPromise = null
        resolve()
        return
      }

      if (message.type === "auth_failed") {
        console.error("[ws-link] Authentication failed")
        isAuthenticated = false
        sessionStorage.removeItem("remote_ws_auth")
        window.location.href = "/login"
        reject(new Error("Authentication failed"))
        return
      }

      if (message.type === "auth_required") {
        console.log("[ws-link] Auth required, waiting for success/fail...")
        return
      }

      // Handle subscription messages
      if (message.id) {
        const subHandler = subscriptionHandlers.get(message.id)
        if (subHandler) {
          if (message.type === "subscription" && message.data !== undefined) {
            console.log("[ws-link] Subscription data:", message.id, message.data)
            subHandler.onData(message.data)
          } else if (message.type === "error") {
            console.error("[ws-link] Subscription error:", message.id, message.error)
            subHandler.onError(new Error(message.error || "Subscription error"))
          } else if (message.type === "result") {
            // Check if this is the actual completion or just the initial subscription confirmation
            const resultData = message.data as { completed?: boolean; subscribed?: boolean } | undefined
            if (resultData?.completed) {
              console.log("[ws-link] Subscription complete:", message.id)
              subHandler.onComplete()
              subscriptionHandlers.delete(message.id)
            } else if (resultData?.subscribed) {
              // Initial subscription confirmation - keep the handler active
              console.log("[ws-link] Subscription confirmed:", message.id)
            }
          }
          return
        }

        // Handle normal query/mutation responses
        const pending = pendingRequests.get(message.id)
        if (pending) {
          pendingRequests.delete(message.id)
          if (message.type === "error") {
            pending.reject(new Error(message.error || "Unknown error"))
          } else {
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

    ws.onerror = () => {
      connectionPromise = null
      reject(new Error("WebSocket connection failed"))
    }

    ws.onclose = () => {
      ws = null
      isAuthenticated = false
      connectionPromise = null
      // Clear all pending requests
      for (const [id, pending] of pendingRequests) {
        pending.reject(new Error("Connection closed"))
      }
      pendingRequests.clear()
      // Clear all subscriptions
      for (const handler of subscriptionHandlers.values()) {
        handler.onComplete()
      }
      subscriptionHandlers.clear()
    }
  })

  return connectionPromise
}

/**
 * Send a tRPC request via WebSocket (for queries/mutations)
 */
async function sendTRPCRequest(method: string, params?: unknown): Promise<unknown> {
  await connect()

  return new Promise((resolve, reject) => {
    const id = `trpc-${++requestId}-${Date.now()}`
    const request: WSRequest = { id, type: "trpc", method, params }

    pendingRequests.set(id, { resolve, reject })

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
 * Create a WebSocket-based tRPC link
 */
export function wsLink(): TRPCLink<AppRouter> {
  return () => {
    return ({ op }) => {
      return observable((observer) => {
        const { path, input, type } = op

        // Convert path to method name (e.g., "projects.list")
        const method = path

        console.log("[ws-link] tRPC call:", { type, path: method })

        // Handle subscriptions differently from queries/mutations
        if (type === "subscription") {
          console.log("[ws-link] Starting subscription:", method)

          const id = `sub-${++requestId}-${Date.now()}`

          // Set up subscription handler
          const handler: SubscriptionHandler = {
            onData: (data) => {
              console.log("[ws-link] Subscription data received:", method, data)
              observer.next({
                result: {
                  type: "data",
                  data: data,
                },
              })
            },
            onError: (error) => {
              console.error("[ws-link] Subscription error:", method, error)
              observer.error(error)
            },
            onComplete: () => {
              console.log("[ws-link] Subscription complete:", method)
              observer.complete()
            },
          }

          subscriptionHandlers.set(id, handler)

          // Wait for connection, then send subscription request
          connect().then(() => {
            const request: WSRequest = { id, type: "trpc", method, params: input }
            ws!.send(JSON.stringify(request))
            console.log("[ws-link] Subscription request sent:", id, method)
          }).catch((error) => {
            console.error("[ws-link] Failed to connect for subscription:", error)
            subscriptionHandlers.delete(id)
            observer.error(error)
          })

          // Return cleanup function
          return () => {
            console.log("[ws-link] Unsubscribing:", method, id)
            subscriptionHandlers.delete(id)
          }
        }

        // Regular query/mutation
        sendTRPCRequest(method, input)
          .then((result) => {
            observer.next({
              result: {
                type: "data",
                data: result,
              },
            })
            observer.complete()
          })
          .catch((error) => {
            observer.error(error)
          })

        return () => {
          // Cleanup for query/mutation (none needed)
        }
      })
    }
  }
}

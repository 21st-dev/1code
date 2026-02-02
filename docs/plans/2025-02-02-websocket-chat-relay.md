# WebSocket Chat Relay Implementation Plan (Push-Based Sync)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Simplify web-desktop communication with push-based data sync. Web client subscribes to resources, server pushes data proactively.

**Architecture:** Server pushes data on subscription events - no polling, no direct tRPC queries from web.

**Tech Stack:** WebSocket (ws), tRPC, Electron IPC, Observable pattern

---

## Target Flow (Push-Based)

```
┌─────────────────────────────────────────────────────────────┐
│                    AUTH SUCCESS                             │
├─────────────────────────────────────────────────────────────┤
│ Web → Server: auth with PIN                                 │
│ Server → Web: auth_success + { projects, modelProfiles }    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                 SUBSCRIBE TO PROJECT                        │
├─────────────────────────────────────────────────────────────┤
│ Web → Server: subscribe(projectId)                          │
│ Server → Web: subscribed + { chats: [] }                    │
│ Server → Web: (push) new chat created                       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                  SUBSCRIBE TO CHAT                          │
├─────────────────────────────────────────────────────────────┤
│ Web → Server: subscribe(chatId)                             │
│ Server → Web: subscribed + { messages: [] }                 │
│ Server → Web: (push) new message from Claude                │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    SEND MESSAGE                             │
├─────────────────────────────────────────────────────────────┤
│ Web → Server: send(chatId, message)                         │
│ Server → Desktop: claude.sendMessage()                      │
│ Server → Web: (push via subscription) response              │
└─────────────────────────────────────────────────────────────┘
```

**Benefits:**
- Single channel for all communication
- Server pushes data proactively (no polling)
- Desktop controls everything (security)
- Simpler client code
- Real-time sync guaranteed

---

## Task 1: Define New Message Protocol

**Files:**
- Modify: `src/main/lib/remote-access/ws-server.ts`

**Step 1: Define message types**

```typescript
// Resource types for subscription
type ResourceType = "project" | "chat" | "modelProfiles"

interface WSRequest {
  id: string
  type: "auth" | "send" | "subscribe" | "unsubscribe"
  resource?: ResourceType        // What to subscribe to
  resourceId?: string            // ID of the resource (projectId/chatId)
  message?: any                  // For send (chat message content)
  pin?: string                   // For auth
}

interface WSResponse {
  id: string | null
  type: "auth_required" | "auth_success" | "auth_failed" | "subscribed" | "error" | "data"
  resource?: ResourceType        // Which resource this data is for
  resourceId?: string            // ID of the resource
  data?: unknown
  error?: string
}
```

**Step 2: Add resource subscription tracking**

```typescript
// Track subscriptions per client
interface ClientSubscription {
  resource: ResourceType
  resourceId: string
  ws: WebSocket
}

interface AuthenticatedClient {
  ws: WebSocket
  id: string
  subscriptions: Map<string, ClientSubscription>  // key: `${resource}:${resourceId}`
}
```

**Step 3: Commit**

```bash
git add src/main/lib/remote-access/ws-server.ts
git commit -m "refactor: define new WebSocket message protocol"
```

---

## Task 2: Auth Success - Push Initial Data

**Files:**
- Modify: `src/main/lib/remote-access/ws-server.ts`

**Step 1: Fetch projects and model profiles on auth**

```typescript
// In handleMessage(), auth success section
if (message.pin && validatePin(message.pin)) {
  const clientId = randomUUID()
  const newClient: AuthenticatedClient = {
    ws,
    id: clientId,
    subscriptions: new Map(),
  }
  authenticatedClients.set(ws, newClient)
  addClient(clientId)

  // Fetch initial data
  const router = createAppRouter(() => BrowserWindow.getFocusedWindow())
  const caller = router.createCaller({
    getWindow: () => BrowserWindow.getFocusedWindow(),
  })

  // Get projects and model profiles in parallel
  const [projects, modelProfiles] = await Promise.all([
    caller.projects.list(),
    caller.modelProfiles.list().catch(() => []),
  ])

  send(ws, {
    id: message.id,
    type: "auth_success",
    data: {
      projects,
      modelProfiles,
    },
  })

  console.log(`[WS] Client authenticated: ${clientId}, sent ${projects.length} projects`)
  return
}
```

**Step 2: Commit**

```bash
git add src/main/lib/remote-access/ws-server.ts
git commit -m "feat: send projects and model profiles on auth"
```

---

## Task 3: Subscribe to Project - Push Chat List

**Files:**
- Modify: `src/main/lib/remote-access/ws-server.ts`

**Step 1: Add project subscription handler**

```typescript
// Subscribe to project (get chats)
if (message.type === "subscribe" && message.resource === "project" && message.resourceId) {
  const projectId = message.resourceId
  const client = authenticatedClients.get(ws)

  if (!client) {
    send(ws, { id: message.id, type: "error", error: "Not authenticated" })
    return
  }

  console.log(`[WS] Subscribing to project: ${projectId}`)

  // Fetch chats for this project
  const router = createAppRouter(() => BrowserWindow.getFocusedWindow())
  const caller = router.createCaller({
    getWindow: () => BrowserWindow.getFocusedWindow(),
  })

  const chats = await caller.chats.list({ projectId })

  // Store subscription
  const subKey = `project:${projectId}`
  client.subscriptions.set(subKey, {
    resource: "project",
    resourceId: projectId,
    ws,
  })

  // Send initial data
  send(ws, {
    id: message.id,
    type: "subscribed",
    resource: "project",
    resourceId: projectId,
    data: { chats },
  })

  console.log(`[WS] Subscribed to project ${projectId}, sent ${chats.length} chats`)
  return
}
```

**Step 2: Commit**

```bash
git add src/main/lib/remote-access/ws-server.ts
git commit -m "feat: add project subscription with chat list"
```

---

## Task 4: Subscribe to Chat - Push Message List + Stream Updates

**Files:**
- Modify: `src/main/lib/remote-access/ws-server.ts`

**Step 1: Add chat subscription handler with message history**

```typescript
// Subscribe to chat (get messages + stream)
if (message.type === "subscribe" && message.resource === "chat" && message.resourceId) {
  const subChatId = message.resourceId
  const client = authenticatedClients.get(ws)

  if (!client) {
    send(ws, { id: message.id, type: "error", error: "Not authenticated" })
    return
  }

  console.log(`[WS] Subscribing to chat: ${subChatId}`)

  // Check if shared subscription exists
  let sharedSub = sharedChatSubscriptions.get(subChatId)

  if (!sharedSub) {
    // Create new shared subscription
    console.log(`[WS] Creating new shared subscription for ${subChatId}`)

    const router = createAppRouter(() => BrowserWindow.getFocusedWindow())
    const claudeRouter = (router as any).claude
    const chatProcedure = claudeRouter.chat
    const subscriptionFn = chatProcedure._def.resolver

    const ctx = {
      getWindow: () => BrowserWindow.getFocusedWindow(),
    }

    const observable = subscriptionFn({
      input: { subChatId },
      type: 'subscription',
      ctx,
      path: 'claude.chat',
    })

    if (typeof observable?.subscribe !== 'function') {
      throw new Error(`chat subscription did not return Observable`)
    }

    // Subscribe and broadcast
    const subscription = observable.subscribe({
      next: (data: any) => {
        if (sharedSub) {
          console.log(`[WS] Broadcasting to ${sharedSub.clients.size} clients for ${subChatId}:`, data.type)
          for (const [clientWs] of sharedSub.clients) {
            send(clientWs, {
              id: null,  // Streaming data doesn't have request ID
              type: "data",
              resource: "chat",
              resourceId: subChatId,
              data: data,
            })
          }
          // Also notify IPC listeners (desktop)
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
          for (const [clientWs] of sharedSub.clients) {
            send(clientWs, {
              id: null,
              type: "error",
              resource: "chat",
              resourceId: subChatId,
              error: err.message,
            })
          }
        }
      },
      complete: () => {
        console.log(`[WS] Chat subscription complete for ${subChatId}`)
        if (sharedSub) {
          for (const [clientWs] of sharedSub.clients) {
            send(clientWs, {
              id: null,
              type: "data",
              resource: "chat",
              resourceId: subChatId,
              data: { completed: true },
            })
          }
        }
      }
    })

    sharedSub = {
      observable,
      subscription,
      clients: new Map(),
      listeners: sharedChatSubscriptions.get(subChatId)?.listeners || new Set(),
    }
    sharedChatSubscriptions.set(subChatId, sharedSub)
  }

  // Add client to shared subscription
  sharedSub.clients.set(ws, message.id)

  // Store subscription in client
  const subKey = `chat:${subChatId}`
  client.subscriptions.set(subKey, {
    resource: "chat",
    resourceId: subChatId,
    ws,
  })

  // Send subscribed confirmation (messages will come via stream)
  send(ws, {
    id: message.id,
    type: "subscribed",
    resource: "chat",
    resourceId: subChatId,
  })

  // Clean up on disconnect
  ws.on("close", () => {
    if (sharedSub) {
      sharedSub.clients.delete(ws)
      if (sharedSub.clients.size === 0 && sharedSub.listeners.size === 0) {
        sharedSub.subscription.unsubscribe()
        sharedChatSubscriptions.delete(subChatId)
      }
    }
  })

  console.log(`[WS] Subscribed to chat ${subChatId}`)
  return
}
```

**Step 2: Commit**

```bash
git add src/main/lib/remote-access/ws-server.ts
git commit -m "feat: add chat subscription with message streaming"
```

---

## Task 5: Send Message Handler

**Files:**
- Modify: `src/main/lib/remote-access/ws-server.ts`

**Step 1: Add send message handler**

```typescript
// Send chat message
if (message.type === "send" && message.resourceId && message.message) {
  const subChatId = message.resourceId
  const client = authenticatedClients.get(ws)

  if (!client) {
    send(ws, { id: message.id, type: "error", error: "Not authenticated" })
    return
  }

  try {
    console.log(`[WS] Sending message to chat ${subChatId}`)

    // Forward to tRPC via desktop's router
    const router = createAppRouter(() => BrowserWindow.getFocusedWindow())
    const caller = router.createCaller({
      getWindow: () => BrowserWindow.getFocusedWindow(),
    })

    // Call claude.sendMessage
    await caller.claude.sendMessage({
      subChatId,
      message: message.message,
    })

    // Send success (actual response will come through subscription)
    send(ws, {
      id: message.id,
      type: "data",
      resource: "chat",
      resourceId: subChatId,
      data: { sent: true },
    })

    return
  } catch (error) {
    send(ws, {
      id: message.id,
      type: "error",
      error: error instanceof Error ? error.message : "Failed to send message",
    })
    return
  }
}
```

**Step 2: Commit**

```bash
git add src/main/lib/remote-access/ws-server.ts
git commit -m "feat: add send message handler"
```

---

## Task 6: Unsubscribe Handler

**Files:**
- Modify: `src/main/lib/remote-access/ws-server.ts`

**Step 1: Add unsubscribe handler**

```typescript
// Unsubscribe from resource
if (message.type === "unsubscribe" && message.resource && message.resourceId) {
  const { resource, resourceId } = message
  const client = authenticatedClients.get(ws)

  if (!client) {
    send(ws, { id: message.id, type: "error", error: "Not authenticated" })
    return
  }

  const subKey = `${resource}:${resourceId}`
  const subscription = client.subscriptions.get(subKey)

  if (subscription) {
    client.subscriptions.delete(subKey)

    // If chat, remove from shared subscription
    if (resource === "chat") {
      const sharedSub = sharedChatSubscriptions.get(resourceId)
      if (sharedSub) {
        sharedSub.clients.delete(ws)
        if (sharedSub.clients.size === 0 && sharedSub.listeners.size === 0) {
          sharedSub.subscription.unsubscribe()
          sharedChatSubscriptions.delete(resourceId)
        }
      }
    }

    send(ws, {
      id: message.id,
      type: "data",
      data: { unsubscribed: true },
    })

    console.log(`[WS] Unsubscribed from ${resource}:${resourceId}`)
  }

  return
}
```

**Step 2: Commit**

```bash
git add src/main/lib/remote-access/ws-server.ts
git commit -m "feat: add unsubscribe handler"
```

---

## Task 7: Update Client-Side ws-link

**Files:**
- Modify: `src/renderer/lib/remote-transport/ws-link.ts`

**Step 1: Update message types**

```typescript
type ResourceType = "project" | "chat" | "modelProfiles"

type WSMessageType = "auth" | "send" | "subscribe" | "unsubscribe"

interface WSRequest {
  id: string
  type: WSMessageType
  resource?: ResourceType
  resourceId?: string
  message?: any
  pin?: string
}

interface WSResponse {
  id: string | null
  type: "auth_required" | "auth_success" | "auth_failed" | "subscribed" | "error" | "data"
  resource?: ResourceType
  resourceId?: string
  data?: unknown
  error?: string
}
```

**Step 2: Add auth data handler**

```typescript
// Store initial data from auth
let initialData: {
  projects: any[]
  modelProfiles: any[]
} | null = null

// In ws.onmessage, after auth success:
if (message.type === "auth_success") {
  console.log("[ws-link] Authentication successful")
  isAuthenticated = true
  initialData = message.data as { projects: any[], modelProfiles: any[] }
  connectionPromise = null
  resolve()
  return
}
```

**Step 3: Add subscribe to project function**

```typescript
/**
 * Subscribe to a project (receives chat list)
 */
export async function subscribeToProject(projectId: string): Promise<any[]> {
  await connect()

  return new Promise((resolve, reject) => {
    const id = `sub-project-${Date.now()}`
    const request: WSRequest = { id, type: "subscribe", resource: "project", resourceId: projectId }

    const timeout = setTimeout(() => {
      subscriptionHandlers.delete(id)
      reject(new Error("Subscribe timeout"))
    }, 10000)

    // One-time handler for initial data
    subscriptionHandlers.set(id, {
      onData: (data: any) => {
        clearTimeout(timeout)
        subscriptionHandlers.delete(id)
        resolve(data.chats || [])
      },
      onError: (error) => {
        clearTimeout(timeout)
        subscriptionHandlers.delete(id)
        reject(error)
      },
      onComplete: () => {
        clearTimeout(timeout)
        subscriptionHandlers.delete(id)
      },
    })

    ws!.send(JSON.stringify(request))
  })
}
```

**Step 4: Add subscribe to chat function**

```typescript
/**
 * Subscribe to a chat (receives messages + streams updates)
 */
export function subscribeToChat(chatId: string, onData: (data: any) => void): () => void {
  const id = `sub-chat-${Date.now()}`

  const handler: SubscriptionHandler = {
    onData: (data) => {
      console.log("[ws-link] Chat data received:", chatId, data.type)
      onData(data)
    },
    onError: (error) => {
      console.error("[ws-link] Chat error:", chatId, error)
    },
    onComplete: () => {
      console.log("[ws-link] Chat complete:", chatId)
    },
  }

  subscriptionHandlers.set(id, handler)

  connect().then(() => {
    const request: WSRequest = { id, type: "subscribe", resource: "chat", resourceId: chatId }
    ws!.send(JSON.stringify(request))
    console.log("[ws-link] Subscribe chat request sent:", chatId)
  }).catch((error) => {
    console.error("[ws-link] Failed to connect:", error)
    subscriptionHandlers.delete(id)
  })

  return () => {
    console.log("[ws-link] Unsubscribing from chat:", chatId)
    subscriptionHandlers.delete(id)
    if (ws?.readyState === WebSocket.OPEN) {
      const unsubscribeRequest: WSRequest = {
        id: `unsub-${Date.now()}`,
        type: "unsubscribe",
        resource: "chat",
        resourceId: chatId,
      }
      ws.send(JSON.stringify(unsubscribeRequest))
    }
  }
}
```

**Step 5: Add send message function**

```typescript
/**
 * Send a message to a chat
 */
export async function sendChatMessage(chatId: string, message: any): Promise<void> {
  await connect()

  return new Promise((resolve, reject) => {
    const id = `send-${Date.now()}`
    const request: WSRequest = { id, type: "send", resourceId: chatId, message }

    const timeout = setTimeout(() => {
      pendingRequests.delete(id)
      reject(new Error("Send timeout"))
    }, 30000)

    pendingRequests.set(id, {
      resolve: (data) => {
        clearTimeout(timeout)
        resolve(data)
      },
      reject: (error) => {
        clearTimeout(timeout)
        reject(error)
      },
    })

    ws!.send(JSON.stringify(request))
  })
}
```

**Step 6: Add helper to get initial data**

```typescript
/**
 * Get initial data from auth (projects, model profiles)
 */
export function getInitialData() {
  return initialData
}
```

**Step 7: Update onmessage to handle resource-based messages**

```typescript
ws.onmessage = (event) => {
  const message: WSResponse = JSON.parse(event.data)

  // Handle auth response
  if (message.type === "auth_success") {
    console.log("[ws-link] Authentication successful")
    isAuthenticated = true
    initialData = message.data as { projects: any[], modelProfiles: any[] }
    connectionPromise = null
    resolve()
    return
  }

  // ... rest of handlers (auth_failed, auth_required) ...

  // Handle subscription data (streaming)
  if (!message.id && message.type === "data" && message.resource) {
    // This is streaming data from active subscription
    const subKey = `${message.resource}:${message.resourceId}`
    // Find all handlers for this resource and notify them
    for (const [subId, handler] of subscriptionHandlers) {
      if (subId.includes(message.resource!)) {
        handler.onData(message.data)
      }
    }
    return
  }

  // Handle response to specific request
  if (message.id) {
    const subHandler = subscriptionHandlers.get(message.id)
    if (subHandler) {
      if (message.type === "subscribed" || (message.type === "data" && message.data !== undefined)) {
        subHandler.onData(message.data)
      } else if (message.type === "error") {
        subHandler.onError(new Error(message.error || "Error"))
      } else if (message.type === "data") {
        subHandler.onComplete()
        subscriptionHandlers.delete(message.id)
      }
      return
    }

    // Handle pending requests
    const pending = pendingRequests.get(message.id)
    if (pending) {
      pendingRequests.delete(message.id)
      if (message.type === "error") {
        pending.reject(new Error(message.error || "Unknown error"))
      } else {
        pending.resolve(message.data)
      }
    }
  }
}
```

**Step 8: Commit**

```bash
git add src/renderer/lib/remote-transport/ws-link.ts
git commit -m "refactor: update ws-link for push-based protocol"
```

---

## Task 8: Create Resource Data Store

**Files:**
- Create: `src/renderer/lib/stores/remote-data-store.ts`

**Step 1: Create Zustand store for remote data**

```typescript
import { create } from 'zustand'
import { subscribeToProject, subscribeToChat, sendChatMessage, getInitialData } from '../remote-transport/ws-link'

interface RemoteDataState {
  // Data
  projects: any[]
  modelProfiles: any[]
  projectChats: Map<string, any[]>  // projectId -> chats

  // Actions
  loadInitialData: () => void
  subscribeToProject: (projectId: string) => Promise<void>
  subscribeToChat: (chatId: string, onData: (data: any) => void) => () => void
  sendMessage: (chatId: string, message: any) => Promise<void>
}

export const useRemoteDataStore = create<RemoteDataState>((set, get) => ({
  projects: [],
  modelProfiles: [],
  projectChats: new Map(),

  loadInitialData: () => {
    const data = getInitialData()
    if (data) {
      set({ projects: data.projects, modelProfiles: data.modelProfiles })
    }
  },

  subscribeToProject: async (projectId: string) => {
    const chats = await subscribeToProject(projectId)
    set((state) => {
      const newMap = new Map(state.projectChats)
      newMap.set(projectId, chats)
      return { projectChats: newMap }
    })
  },

  subscribeToChat: (chatId: string, onData: (data: any) => void) => {
    return subscribeToChat(chatId, onData)
  },

  sendMessage: async (chatId: string, message: any) => {
    return sendChatMessage(chatId, message)
  },
}))
```

**Step 2: Commit**

```bash
git add src/renderer/lib/stores/remote-data-store.ts
git commit -m "feat: create remote data store"
```

---

## Task 9: Update UI to Use New Store

**Files:**
- Modify: `src/renderer/features/sidebar/agents-sidebar.tsx`
- Modify: `src/renderer/features/agents/main/active-chat.tsx`

**Step 1: Update sidebar to use remote data store**

```typescript
import { useRemoteDataStore } from "@/lib/stores/remote-data-store"

export function AgentsSidebar() {
  const { projects, loadInitialData } = useRemoteDataStore()

  useEffect(() => {
    // Load initial data on mount
    loadInitialData()
  }, [])

  // Render projects from store instead of tRPC query
  // ...
}
```

**Step 2: Update active chat to use new transport**

```typescript
import { useRemoteDataStore } from "@/lib/stores/remote-data-store"

export function ActiveChat() {
  const { sendMessage, subscribeToChat } = useRemoteDataStore()

  useEffect(() => {
    if (chatId) {
      const unsubscribe = subscribeToChat(chatId, (data) => {
        // Handle incoming message data
        console.log("Received chat data:", data)
      })
      return unsubscribe
    }
  }, [chatId])

  const handleSend = async (message: string) => {
    await sendMessage(chatId, { message })
  }

  // ...
}
```

**Step 3: Commit**

```bash
git add src/renderer/features/sidebar/agents-sidebar.tsx
git add src/renderer/features/agents/main/active-chat.tsx
git commit -m "refactor: use remote data store in UI"
```

---

## Task 10: Remove tRPC Functions from Web App

**Files:**
- Modify: `src/renderer/lib/trpc.ts`
- Modify: `src/renderer/contexts/TRPCProvider.tsx`
- Modify: `src/renderer/features/sidebar/agents-sidebar.tsx`
- Modify: `src/renderer/features/agents/ui/agents-content.tsx`

**Step 1: Remove wsLink from tRPC client configuration**

In `src/renderer/lib/trpc.ts`, conditionally add wsLink only for desktop:

```typescript
import { wsLink } from "./remote-transport/ws-link"

// In createTRPCClient(), only add wsLink for desktop
const links = []

// Always add HTTP link (for desktop IPC and web initial load)
links.push(httpBatchLink)

// Only add WebSocket link for desktop (web uses WebSocket transport directly)
if (isDesktopApp) {
  links.push(wsLink())
}

export const trpcClient = createTRPCClient<AppRouter>({
  links,
})
```

**Step 2: Remove tRPC queries from web sidebar**

In `src/renderer/features/sidebar/agents-sidebar.tsx`, remove tRPC queries for remote mode:

```typescript
import { useRemoteDataStore } from "@/lib/stores/remote-data-store"
import { isDesktopApp } from "@/lib/utils/platform"

export function AgentsSidebar() {
  const isRemoteMode = !isDesktopApp()

  // Desktop: use tRPC queries
  // Web: use remote data store (populated via WebSocket)
  const { projects, loadInitialData } = useRemoteDataStore()

  const { data: localProjects } = trpc.projects.list.useQuery(
    undefined,
    // Only enable tRPC query for desktop
    { enabled: isDesktopApp }
  )

  // Use appropriate data source
  const projects = isDesktopApp ? localProjects : remoteProjects

  useEffect(() => {
    // Load initial data from WebSocket for web
    if (isRemoteMode) {
      loadInitialData()
    }
  }, [isRemoteMode, loadInitialData])

  // ... rest of component
}
```

**Step 3: Remove tRPC queries from agents content**

In `src/renderer/features/agents/ui/agents-content.tsx`:

```typescript
// Only use tRPC for desktop
const { data: projects } = trpc.projects.list.useQuery(
  undefined,
  { enabled: isDesktopApp() }
)

// For web, data comes from remoteDataStore
```

**Step 4: Update TRPCProvider to handle web mode**

In `src/renderer/contexts/TRPCProvider.tsx`:

```typescript
// Ensure tRPC provider still works for desktop IPC
// Web mode won't use tRPC queries, but provider should still be available
// for any shared types/utilities
```

**Step 5: Verify no remaining tRPC calls in web mode**

Search for remaining tRPC usage:
```bash
grep -r "trpc\." src/renderer/features --include="*.tsx" --include="*.ts"
```

All usages should be guarded with `isDesktopApp()` check.

**Step 6: Commit**

```bash
git add src/renderer/lib/trpc.ts
git add src/renderer/contexts/TRPCProvider.tsx
git add src/renderer/features/sidebar/agents-sidebar.tsx
git add src/renderer/features/agents/ui/agents-content.tsx
git commit -m "refactor: remove tRPC queries from web mode

- WebSocket transport handles all data for web
- Desktop continues using tRPC for IPC
- All web data flows through push-based WebSocket protocol"
```

---

## Task 11: Test Complete Flow

**Files:**
- Test: Manual testing

**Step 1: Test auth + initial data**

```bash
bun run dev
```

Open web app, enter PIN.

**Expected:**
- Auth success
- Projects list appears
- Model profiles loaded

**Step 2: Test project subscription**

Click on a project.

**Expected:**
- Chat list for project appears

**Step 3: Test chat subscription**

Click on a chat.

**Expected:**
- Message history loads
- Real-time updates work

**Step 4: Test send message**

Send a message from web.

**Expected:**
- Message appears in web
- Message appears in desktop
- Response appears in both

**Step 5: Test sync**

Send message from desktop.

**Expected:**
- Message appears in web immediately

---

## Testing Checklist

- [ ] Auth sends projects + model profiles
- [ ] Project subscription sends chat list
- [ ] Chat subscription sends message history
- [ ] Chat subscription streams new messages
- [ ] Send message works from web
- [ ] Send message works from desktop
- [ ] Messages sync between web and desktop
- [ ] Unsubscribe works
- [ ] Reconnection works
- [ ] No memory leaks

---

## Rollback Plan

If issues arise:
```bash
git revert HEAD  # Undo last commit
# Or
git reset --hard <working-commit-hash>
```

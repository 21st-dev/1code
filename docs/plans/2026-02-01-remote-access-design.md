# Remote Access Feature Design

## Overview

Enable users to access their desktop 1Code app from any browser via Cloudflare Tunnel with PIN authentication.

## Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   Web Browser   │◄═══════►│  Cloudflare      │◄═══════►│  Desktop App    │
│   (WebSocket)   │   WSS   │  Tunnel          │   WS    │  (WS server +   │
│                 │         │                  │         │   cloudflared)  │
└─────────────────┘         └──────────────────┘         └─────────────────┘
```

**Key Properties:**
- Desktop initiates outbound connection (no firewall issues)
- Random URL changes each session (private)
- PIN prevents unauthorized access
- Cloudflare handles SSL automatically
- All communication via WebSocket (real-time)

## User Flow

1. User clicks "Enable Remote Access" in desktop
2. Desktop starts WebSocket server on `localhost:PORT`
3. Desktop runs `cloudflared tunnel --url http://localhost:PORT`
4. Cloudflare generates random URL: `https://abc-xyz.trycloudflare.com`
5. Desktop generates 6-digit PIN
6. Desktop displays URL + PIN to user
7. User opens URL in browser, enters PIN
8. Web client loads (same renderer UI), all tRPC calls via WebSocket

## Transport Adapter

Same renderer UI, different transport based on environment:

```
Desktop App                          Browser
┌──────────────┐                    ┌──────────────┐
│ Renderer UI  │                    │ Renderer UI  │  ← Same build
│ (Electron)   │                    │ (Browser)    │
├──────────────┤                    ├──────────────┤
│ desktopApi   │                    │ wsAdapter    │  ← Different transport
│ (IPC)        │                    │ (WebSocket)  │
└──────────────┘                    └──────────────┘
       ↓                                   ↓
┌──────────────┐                    ┌──────────────┐
│ Main Process │◄═══════════════════│ WS Server    │
│ (tRPC)       │      tunnel        │ (cloudflared)│
└──────────────┘                    └──────────────┘
```

## WebSocket Protocol

### Message Types

```typescript
// Client → Server
interface WSRequest {
  id: string              // Request ID for matching response
  type: "trpc" | "api"    // trpc call or desktopApi call
  method: string          // e.g., "claude.sendMessage" or "getUser"
  params: unknown
}

// Server → Client
interface WSResponse {
  id: string              // Match request ID
  type: "result" | "error" | "stream"
  data: unknown
}

// Server → Client (Push/Subscription)
interface WSPush {
  id: null                // No request ID
  type: "subscription"
  channel: string         // e.g., "claude.onMessage", "terminal.onOutput"
  data: unknown
}
```

### Connection Flow

```
1. Client connect    →  WS handshake
2. Server           ←  { type: "auth_required" }
3. Client           →  { type: "auth", pin: "123456" }
4. Server           ←  { type: "auth_success" } or { type: "auth_failed" }
5. Client           →  { id: "1", type: "trpc", method: "projects.list", params: {} }
6. Server           ←  { id: "1", type: "result", data: [...] }
```

### Subscriptions (Real-time)

```
// Client subscribe
→ { id: "2", type: "trpc", method: "claude.onMessage", params: { subChatId: "xxx" } }

// Server sends stream continuously
← { id: null, type: "subscription", channel: "claude.onMessage:xxx", data: { ... } }
← { id: null, type: "subscription", channel: "claude.onMessage:xxx", data: { ... } }

// Client unsubscribe
→ { id: "3", type: "unsubscribe", channel: "claude.onMessage:xxx" }
```

## Cloudflared Management

### Binary Download

Download on first use, store in userData:

```typescript
const CLOUDFLARED_URLS = {
  darwin_arm64: "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64.tgz",
  darwin_x64: "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz",
  win32_x64: "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe",
  linux_x64: "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
}

// Storage location:
// ~/Library/Application Support/1Code/bin/cloudflared
```

### Lifecycle

```
1. Check cloudflared binary exists
   - If missing → download + extract
   - If exists → continue

2. Start WebSocket server on localhost:random_port

3. Spawn cloudflared process
   cloudflared tunnel --url http://localhost:PORT

4. Parse output for URL
   "https://random-words.trycloudflare.com"

5. Generate 6-digit PIN

6. Display URL + PIN to user
```

### Cleanup

```typescript
async function stopRemoteAccess() {
  cloudflaredProcess.kill()
  wsServer.close()
  pin = null
}

app.on('before-quit', stopRemoteAccess)
```

## File Structure

### New Files (Main Process)

```
src/main/lib/remote-access/
├── index.ts              # Main export
├── ws-server.ts          # WebSocket server + tRPC adapter
├── cloudflared.ts        # Manage cloudflared process
└── session.ts            # PIN auth, connected clients
```

### New Files (Renderer)

```
src/renderer/lib/transport/
├── index.ts              # Auto-detect and export transport
├── electron.ts           # IPC transport (existing logic)
└── websocket.ts          # WebSocket transport (new)
```

## UI Components

### Location

Bottom sidebar icon bar, add Remote Access button:

```
┌─────────────────────┐
│ ⚙️  ❓  📅           │  ← Existing icon bar
│ [🌐]                │  ← Add Remote Access icon
│ [Feedback]          │
└─────────────────────┘
```

### State Atom

```typescript
remoteAccessStateAtom:
  | { status: "disabled" }
  | { status: "starting" }
  | { status: "active", url: string, pin: string, clients: number }
  | { status: "error", message: string }
```

### Dialog (Active State)

```
┌────────────────────────────────────────────┐
│ 🌐 Remote Access                      [X]  │
├────────────────────────────────────────────┤
│                                            │
│  Status: ● Active                          │
│                                            │
│  URL:                                      │
│  ┌──────────────────────────────────────┐  │
│  │ https://abc-xyz.trycloudflare.com   │  │
│  │                              [Copy]  │  │
│  └──────────────────────────────────────┘  │
│                                            │
│  PIN:                                      │
│  ┌──────────────────────────────────────┐  │
│  │         1 2 3 4 5 6                  │  │
│  └──────────────────────────────────────┘  │
│                                            │
│  Connected clients: 1                      │
│                                            │
│  [Disable Remote Access]                   │
│                                            │
└────────────────────────────────────────────┘
```

### Dialog (Disabled State)

```
┌────────────────────────────────────────────┐
│ 🌐 Remote Access                      [X]  │
├────────────────────────────────────────────┤
│                                            │
│  Access your desktop from any browser.     │
│                                            │
│  [Enable Remote Access]                    │
│                                            │
└────────────────────────────────────────────┘
```

## Real-time Features

All desktop real-time features must work in web client:

| Feature | Implementation |
|---------|----------------|
| Claude streaming | Subscribe `claude.onMessage` → forward via WS |
| Terminal output | Subscribe `terminal.onOutput` → forward via WS |
| Git status changes | Subscribe `git.onStatusChange` → forward via WS |
| File watcher | Subscribe `files.onFileChange` → forward via WS |
| Thinking indicator | Real-time status updates |
| Tool execution | Read, Write, Bash output streaming |
| File change badges | +157 -180 badge updates |
| Chat list updates | New chats appear instantly |

## Security

- PIN required for authentication
- PIN expires with session
- Session ends when tunnel closes or user disables
- No persistent credentials stored
- Random URL per session

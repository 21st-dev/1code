import { createTRPCReact } from "@trpc/react-query"
import { createTRPCProxyClient } from "@trpc/client"
import type { AppRouter } from "../../main/lib/trpc/routers"
import superjson from "superjson"
import { wsLink } from "./remote-transport/ws-link"

/**
 * Check if we're in remote/browser mode (no electronTRPC global)
 * Must be called at runtime, not at module load time
 */
function checkIsRemoteMode(): boolean {
  // @ts-ignore
  return typeof window !== "undefined" && !window.electronTRPC
}

/**
 * React hooks for tRPC
 */
export const trpc = createTRPCReact<AppRouter>()

// Vanilla client - initialized lazily
let _trpcClient: ReturnType<typeof createTRPCProxyClient<AppRouter>> | null = null
let _clientPromise: Promise<ReturnType<typeof createTRPCProxyClient<AppRouter>>> | null = null
let _initStarted = false

/**
 * Initialize the vanilla client
 */
async function initVanillaClient(): Promise<ReturnType<typeof createTRPCProxyClient<AppRouter>>> {
  if (_trpcClient) return _trpcClient
  if (_clientPromise) return _clientPromise

  _clientPromise = (async () => {
    const isRemote = checkIsRemoteMode()
    console.log("[trpc] Initializing vanilla client, isRemote:", isRemote)

    let link: any
    if (isRemote) {
      link = wsLink()
    } else {
      const { ipcLink } = await import("trpc-electron/renderer")
      link = ipcLink({ transformer: superjson })
    }

    _trpcClient = createTRPCProxyClient<AppRouter>({ links: [link] })
    console.log("[trpc] Vanilla client initialized")
    return _trpcClient
  })()

  return _clientPromise
}

// Start initialization immediately (will run after module loads)
if (typeof window !== "undefined") {
  // Use setTimeout to ensure this runs after preload has set up electronTRPC
  setTimeout(() => {
    if (!_initStarted) {
      _initStarted = true
      initVanillaClient().catch(console.error)
    }
  }, 0)
}

/**
 * Get vanilla tRPC client (async to handle dynamic link loading)
 */
export async function getTrpcClient() {
  if (_trpcClient) return _trpcClient
  if (!_initStarted) {
    _initStarted = true
    return initVanillaClient()
  }
  return _clientPromise!
}

/**
 * Vanilla client for use outside React components (stores, utilities)
 * Returns a proxy that delegates to the real client once initialized
 */
export const trpcClient = new Proxy({} as ReturnType<typeof createTRPCProxyClient<AppRouter>>, {
  get(_target, prop) {
    if (_trpcClient) {
      return (_trpcClient as any)[prop]
    }
    // Return a proxy that waits for initialization
    return new Proxy({} as any, {
      get(_t, subProp) {
        // This handles trpcClient.git.query(...) pattern
        return async (...args: any[]) => {
          const client = await getTrpcClient()
          return (client as any)[prop][subProp](...args)
        }
      },
    })
  },
})

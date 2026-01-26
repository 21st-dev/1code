import { createTRPCReact } from "@trpc/react-query"
import type { CreateTRPCReact } from "@trpc/react-query"
import { createTRPCProxyClient } from "@trpc/client"
import { ipcLink } from "trpc-electron/renderer"
import type { AppRouter } from "../../main/lib/trpc/routers"
import superjson from "superjson"

/**
 * React hooks for tRPC
 */
export const trpc: CreateTRPCReact<AppRouter, unknown> = createTRPCReact<AppRouter>()

/**
 * Create ipcLink lazily to ensure window.electronTRPC is available
 */
function createIpcLink() {
  if (typeof window === "undefined" || !(window as any).electronTRPC) {
    throw new Error(
      "Could not find `electronTRPC` global. Check that `exposeElectronTRPC` has been called in your preload file."
    )
  }
  return ipcLink({ transformer: superjson })
}

/**
 * Vanilla client for use outside React components (stores, utilities)
 * Created lazily to ensure preload script has finished
 */
let _trpcClient: ReturnType<typeof createTRPCProxyClient<AppRouter>> | null = null
export const trpcClient: ReturnType<typeof createTRPCProxyClient<AppRouter>> = new Proxy(
  {} as ReturnType<typeof createTRPCProxyClient<AppRouter>>,
  {
  get(_target, prop) {
    if (!_trpcClient) {
      _trpcClient = createTRPCProxyClient<AppRouter>({
        links: [createIpcLink()],
      })
    }
    return _trpcClient[prop as keyof typeof _trpcClient]
  },
  },
)

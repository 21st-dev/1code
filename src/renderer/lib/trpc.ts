import { createTRPCReact } from "@trpc/react-query"
import { createTRPCClient } from "@trpc/client"
import { ipcLink } from "trpc-electron/renderer"
import type { AppRouter } from "../../main/lib/trpc/routers"
import superjson from "superjson"

/**
 * React hooks for tRPC
 */
export const trpc = createTRPCReact<AppRouter>()

/**
 * Typed client factory for use in TRPCProvider
 */
export function createTrpcClient() {
  return createTRPCClient<AppRouter>({
    links: [ipcLink({ transformer: superjson })],
  })
}

/**
 * Typed client for use outside React components (stores, utilities)
 * Provides typed router accessors like .modelProfiles.list.query()
 */
export const trpcClient = createTRPCClient<AppRouter>({
  links: [ipcLink({ transformer: superjson })],
})

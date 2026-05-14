import { createTRPCReact, type CreateTRPCReact } from "@trpc/react-query"
import { createTRPCProxyClient, type TRPCClient } from "@trpc/client"
import { ipcLink } from "trpc-electron/renderer"
import type { AppRouter } from "../../main/lib/trpc/routers"
import superjson from "superjson"

/**
 * React hooks for tRPC
 */
export const trpc: CreateTRPCReact<AppRouter, unknown> =
  createTRPCReact<AppRouter>()

/**
 * Vanilla client for use outside React components (stores, utilities)
 */
export const trpcClient: TRPCClient<AppRouter> = createTRPCProxyClient<AppRouter>({
  links: [ipcLink({ transformer: superjson })],
})

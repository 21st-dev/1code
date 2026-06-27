import { createTRPCReact, type CreateTRPCReact } from "@trpc/react-query"
import { createTRPCProxyClient } from "@trpc/client"
import { ipcLink } from "trpc-electron/renderer"
import type { AppRouter } from "../../main/lib/trpc/routers"
import superjson from "superjson"

/**
 * React hooks for tRPC
 */
export const trpc: CreateTRPCReact<AppRouter, unknown> =
  createTRPCReact<AppRouter>()

type TrpcProxyClient = ReturnType<typeof createTRPCProxyClient<AppRouter>>

const MISSING_ELECTRON_BRIDGE_MESSAGE =
  "1Code desktop IPC bridge is unavailable. Open this screen from the 1Code desktop app instead of a plain browser tab."

export function hasElectronTrpcBridge(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean((window as Window & { electronTRPC?: unknown }).electronTRPC)
  )
}

export function createElectronIpcLink() {
  if (!hasElectronTrpcBridge()) {
    throw new Error(MISSING_ELECTRON_BRIDGE_MESSAGE)
  }

  return ipcLink({ transformer: superjson })
}

function createUnavailableTrpcClient(): TrpcProxyClient {
  return new Proxy(
    {},
    {
      get() {
        throw new Error(MISSING_ELECTRON_BRIDGE_MESSAGE)
      },
    },
  ) as TrpcProxyClient
}

/**
 * Vanilla client for use outside React components (stores, utilities)
 */
export const trpcClient = hasElectronTrpcBridge()
  ? createTRPCProxyClient<AppRouter>({
      links: [createElectronIpcLink()],
    })
  : createUnavailableTrpcClient()

// src/renderer/lib/remote-transport/trpc-client.ts
// tRPC Client for Remote Access via WebSocket

import { trpcCall } from "./index"

type TRPCProxy = {
  [key: string]: TRPCProxy & {
    query: (input?: unknown) => Promise<unknown>
    mutate: (input?: unknown) => Promise<unknown>
  }
}

/**
 * Create a proxy that intercepts tRPC calls and sends them via WebSocket
 */
function createTRPCProxy(path: string[] = []): TRPCProxy {
  return new Proxy(() => {}, {
    get(_, prop: string) {
      if (prop === "query" || prop === "mutate") {
        return async (input?: unknown) => {
          const method = path.join(".")
          return trpcCall(method, input)
        }
      }
      return createTRPCProxy([...path, prop])
    },
    apply(_, __, args) {
      // Handle direct calls like trpc.projects.list()
      const method = path.join(".")
      return trpcCall(method, args[0])
    },
  }) as TRPCProxy
}

/**
 * Remote tRPC client
 * Usage: remoteTrpc.projects.list.query() or remoteTrpc.chats.create.mutate({ ... })
 */
export const remoteTrpcClient = createTRPCProxy()
